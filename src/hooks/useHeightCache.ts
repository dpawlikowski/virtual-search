import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import type { VirtualItem, HeightSource, FontConfig, ViewportBucket } from '../types'
import { getViewportBucket, parseFontForPretext, hashFontConfig, debounce, EMA, isDevEnvironment } from '../utils'
import { bulkGetHeights, setHeight, evictStaleEntries } from '../storage/heightCache'
import { WorkerMsg } from '../workers/workerMessages'

/** Container width assumed before the element has mounted / been measured. */
const FALLBACK_CONTAINER_WIDTH_PX = 800
/** CSS font fallbacks used when a computed value is unavailable (e.g. jsdom). */
const FALLBACK_FONT_SIZE = '16px'
const FALLBACK_FONT_FAMILY = 'Inter'
/** Multiplier applied to font-size when `line-height` computes to `normal`. */
const NORMAL_LINE_HEIGHT_RATIO = 1.5
/** Line height assumed when neither `line-height` nor font-size can be parsed. */
const FALLBACK_LINE_HEIGHT_PX = 24

// ─── HeightStore — provides INITIAL estimates only ───────────────────────────
// Runtime measurement is owned entirely by TanStack Virtual's measureElement.
// This store seeds estimateSize before items are rendered (Pretext / IndexedDB).

export class HeightStore {
  private entries = new Map<string, { height: number; source: HeightSource }>()
  private emaByType = new Map<string, EMA>()
  private globalEma = new EMA()
  readonly defaultHeight: number

  constructor(defaultHeight: number) { this.defaultHeight = defaultHeight }

  private ema(type?: string): EMA {
    if (!type) return this.globalEma
    if (!this.emaByType.has(type)) this.emaByType.set(type, new EMA())
    return this.emaByType.get(type)!
  }

  set(id: string, height: number, source: HeightSource, type?: string) {
    this.entries.set(id, { height, source })
    if (source !== 'default' && source !== 'ema') {
      this.globalEma.update(height)
      if (type) this.ema(type).update(height)
    }
  }

  getHeight(id: string, type?: string): number {
    const e = this.entries.get(id)
    if (e) return e.height
    const ema = this.ema(type)
    return ema.ready ? ema.current : this.defaultHeight
  }

  getSource(id: string): HeightSource {
    return this.entries.get(id)?.source ?? 'default'
  }

  has(id: string) { return this.entries.has(id) }
}

export interface UseHeightCacheOptions<T extends VirtualItem> {
  containerRef: RefObject<HTMLDivElement | null>
  items: T[]
  defaultItemHeight: number
  cacheStoreName: string
  cacheTtlMs?: number
  serverHintMinSamples: number
  persistDebounceMs: number
  resizeDebounceMs: number
  onMeasureReport?: (id: string, height: number, bucket: ViewportBucket) => void
  /**
   * Called after new heights land from the Pretext worker (i.e. the caller
   * should re-measure the virtualizer and force a re-render). Read from a
   * ref internally, so it's safe to pass a new closure every render without
   * re-subscribing the worker.
   */
  onHeightsReady: () => void
}

export interface UseHeightCacheReturn {
  heightStoreRef: RefObject<HeightStore>
  /** Records a rendered item's measured height into the store and schedules
   *  a debounced persist to IndexedDB. Does NOT call virtualizer.measureElement
   *  — the caller wires that separately, since this hook has no virtualizer. */
  observeItem: (el: HTMLElement | null) => void
  getHeightSource: (idx: number) => HeightSource
}

/**
 * Owns hybrid height estimation: an in-memory HeightStore seeded from
 * server hints / IndexedDB / a Pretext worker (in that priority order) so
 * the virtualizer has a good `estimateSize` before items are ever rendered,
 * plus persisting real measured heights back to IndexedDB as they come in.
 */
export function useHeightCache<T extends VirtualItem>(
  options: UseHeightCacheOptions<T>
): UseHeightCacheReturn {
  const {
    containerRef, items, defaultItemHeight, cacheStoreName, cacheTtlMs,
    serverHintMinSamples, persistDebounceMs, resizeDebounceMs, onMeasureReport, onHeightsReady,
  } = options

  const workerRef = useRef<Worker | null>(null)
  const heightStoreRef = useRef(new HeightStore(defaultItemHeight))
  const fontConfigRef = useRef<FontConfig | null>(null)

  // Kept in a ref so the Pretext worker's `onmessage` always calls the latest
  // callback without re-subscribing the worker every render.
  const onHeightsReadyRef = useRef(onHeightsReady)
  useEffect(() => {
    onHeightsReadyRef.current = onHeightsReady
  })

  // ── Persist measured heights to IndexedDB (debounced) ─────────────────────
  // The viewport bucket and font hash are resolved by the caller (`observeItem`)
  // and passed in, so this debounced writer captures no refs — the current
  // container width/font is read at measure time, not persist time.
  const persistHeight = useMemo(() =>
    debounce((id: string, h: number, bucket: ViewportBucket, fontHash: string) => {
      setHeight(id, h, bucket, fontHash, cacheStoreName)
      onMeasureReport?.(id, h, bucket)
    }, persistDebounceMs),
  [cacheStoreName, onMeasureReport, persistDebounceMs])

  // ── Item ref — persists measured heights to the store + cache ─────────────
  // (Wiring virtualizer.measureElement itself stays with the caller, which
  // owns the virtualizer instance.)
  const observeItem = useCallback((el: HTMLElement | null) => {
    if (!el) return
    const id = el.dataset.vsItemId
    if (id) {
      const h = el.getBoundingClientRect().height
      if (h > 0) {
        heightStoreRef.current.set(id, h, 'indexeddb', el.dataset.vsItemType)
        const fc = fontConfigRef.current
        if (fc) {
          const bucket = getViewportBucket(containerRef.current?.clientWidth ?? FALLBACK_CONTAINER_WIDTH_PX)
          persistHeight(id, h, bucket, fc.hash)
        }
      }
    } else if (isDevEnvironment()) {
      console.warn(
        '[virtual-search] observeItem: element is missing data-vs-item-id — its measured height ' +
        'will not persist to the cache and search navigation to this item may misbehave. ' +
        'Add data-vs-item-id={item.id} to the item element.'
      )
    }
  }, [persistHeight])

  // ── Font resolution ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cs    = getComputedStyle(el)
    const fsz   = cs.fontSize || FALLBACK_FONT_SIZE
    const ff    = cs.fontFamily || FALLBACK_FONT_FAMILY
    const lhRaw = cs.lineHeight
    const lh    = lhRaw === 'normal'
      ? parseFloat(fsz) * NORMAL_LINE_HEIGHT_RATIO
      : parseFloat(lhRaw) || FALLBACK_LINE_HEIGHT_PX
    const font  = parseFontForPretext(`${fsz} ${ff}`)
    fontConfigRef.current = { font, lineHeight: lh, hash: hashFontConfig(font, lh) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pretext Worker ────────────────────────────────────────────────────────
  useEffect(() => {
    const w = new Worker(new URL('../workers/pretext.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = (
      e: MessageEvent<{ type: string; heights: [string, number][]; replace?: boolean }>,
    ) => {
      if (e.data.type !== WorkerMsg.HEIGHTS_READY) return
      // A resize response (`replace`) recomputes heights for already-measured items,
      // so overwrite them; an initial prepare must not clobber freshly measured DOM values.
      const replace = e.data.replace === true
      let updated = false
      for (const [id, height] of e.data.heights) {
        if (replace || !heightStoreRef.current.has(id)) {
          heightStoreRef.current.set(id, height, 'pretext')
          updated = true
        }
      }
      if (updated) onHeightsReadyRef.current()
    }
    return () => { w.terminate(); workerRef.current = null }
  }, [])

  // ── Cache eviction — only when the cache config itself changes, not on ────
  // every items update (server-search merges can churn `items` on every
  // keystroke; a full IndexedDB sweep on each one would be wasteful).
  useEffect(() => {
    evictStaleEntries(cacheStoreName, cacheTtlMs)
  }, [cacheStoreName, cacheTtlMs])

  // ── Height init (server hints → IndexedDB → Pretext) ──────────────────────
  useEffect(() => {
    const container = containerRef.current
    const fc        = fontConfigRef.current
    if (!container || items.length === 0 || !fc) return

    // Superseded (e.g. a fast-typing server-search merge lands mid-flight)
    // — drop this run's results instead of applying stale heights or
    // firing a redundant PREPARE_BATCH for ids the newer run already covers.
    let cancelled = false
    const bucket = getViewportBucket(container.clientWidth)

    ;(async () => {
      for (const item of items) {
        if (!heightStoreRef.current.has(item.id)) {
          const hint = item._hints?.[bucket]
          if (hint && hint.n >= serverHintMinSamples)
            heightStoreRef.current.set(item.id, hint.p50, 'server', item.type)
        }
      }
      if (cancelled) return

      const needIds = items.filter(i => !heightStoreRef.current.has(i.id)).map(i => i.id)
      if (needIds.length > 0) {
        const cached = await bulkGetHeights(needIds, bucket, fc.hash, cacheStoreName, cacheTtlMs)
        if (cancelled) return
        for (const [id, h] of cached) heightStoreRef.current.set(id, h, 'indexeddb')
      }

      const pretextItems = items
        .filter(i => !heightStoreRef.current.has(i.id))
        .map(i => ({ id: i.id, text: i.text }))
      if (!cancelled && pretextItems.length > 0 && workerRef.current) {
        workerRef.current.postMessage({
          type: WorkerMsg.PREPARE_BATCH, items: pretextItems,
          font: fc.font, containerWidth: container.clientWidth, lineHeight: fc.lineHeight,
        })
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cacheStoreName, serverHintMinSamples, cacheTtlMs])

  // ── Container resize → Pretext re-layout ─────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onResize = debounce(() => {
      const fc = fontConfigRef.current
      if (!fc || !workerRef.current) return
      workerRef.current.postMessage({
        type: WorkerMsg.LAYOUT_RESIZE, containerWidth: container.clientWidth, lineHeight: fc.lineHeight,
      })
    }, resizeDebounceMs)
    const ro = new ResizeObserver(onResize)
    ro.observe(container)
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeDebounceMs])

  const getHeightSource = useCallback(
    (idx: number): HeightSource => heightStoreRef.current.getSource(items[idx]?.id ?? ''),
    [items]
  )

  return { heightStoreRef, observeItem, getHeightSource }
}
