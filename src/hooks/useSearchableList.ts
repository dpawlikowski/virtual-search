import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  type RefObject,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type {
  VirtualItem,
  UseSearchableListOptions,
  UseSearchableListReturn,
  HeightSource,
  SearchState,
  SearchOptions,
  MatchRange,
  FontConfig,
} from '../types'
import { getViewportBucket, parseFontForPretext, hashFontConfig, debounce, EMA } from '../utils'
import { bulkGetHeights, setHeight, evictStaleEntries } from '../storage/heightCache'
import { createSearchIndex, searchItems, resolveRanges, isHighlightCaseSensitive } from '../search/miniSearchAdapter'
import { WorkerMsg } from '../workers/workerMessages'

const PERSIST_DEBOUNCE_MS = 500
const RESIZE_DEBOUNCE_MS = 200
const VIRTUALIZER_OVERSCAN = 4
// ^ defaults for UseSearchableListOptions.persistDebounceMs / resizeDebounceMs / overscan

// ─── HeightStore — provides INITIAL estimates only ───────────────────────────
// Runtime measurement is owned entirely by TanStack Virtual's measureElement.
// This store seeds estimateSize before items are rendered (Pretext / IndexedDB).

export class HeightStore {
  private entries = new Map<string, { height: number; source: HeightSource }>()
  private emaByType = new Map<string, EMA>()
  private globalEma = new EMA(0.1)
  readonly defaultHeight: number

  constructor(defaultHeight: number) { this.defaultHeight = defaultHeight }

  private ema(type?: string): EMA {
    if (!type) return this.globalEma
    if (!this.emaByType.has(type)) this.emaByType.set(type, new EMA(0.1))
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

// ─── Search reducer ───────────────────────────────────────────────────────────

type SearchAction =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_MATCHES'; matches: SearchState['matches'] }
  | { type: 'NEXT_MATCH' }
  | { type: 'PREV_MATCH' }
  | { type: 'SET_SEARCHING'; value: boolean }
  | { type: 'SET_OPTIONS'; options: SearchOptions }
  | { type: 'SET_ACTIVE'; index: number }

export function searchReducer(s: SearchState, a: SearchAction): SearchState {
  switch (a.type) {
    case 'SET_QUERY':     return { ...s, query: a.query, activeMatchIndex: 0 }
    case 'SET_MATCHES':   return { ...s, matches: a.matches, activeMatchIndex: 0, isSearching: false }
    case 'NEXT_MATCH': { const n = s.matches.length; return { ...s, activeMatchIndex: n === 0 ? 0 : (s.activeMatchIndex + 1) % n } }
    case 'PREV_MATCH': { const n = s.matches.length; return { ...s, activeMatchIndex: n === 0 ? 0 : (s.activeMatchIndex - 1 + n) % n } }
    case 'SET_SEARCHING': return { ...s, isSearching: a.value }
    case 'SET_OPTIONS':   return { ...s, options: a.options }
    case 'SET_ACTIVE':    return { ...s, activeMatchIndex: a.index }
    default: return s
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSearchableList<T extends VirtualItem>(
  options: UseSearchableListOptions<T>
): UseSearchableListReturn<T> {
  const {
    items: baseItems,
    searchFields = ['text'],
    onServerSearch,
    serverSearchDebounce = 250,
    serverHintMinSamples = 10,
    onMeasureReport,
    cacheStoreName = 'virtual-search-heights',
    defaultItemHeight = 150,
    persistDebounceMs = PERSIST_DEBOUNCE_MS,
    resizeDebounceMs = RESIZE_DEBOUNCE_MS,
    overscan = VIRTUALIZER_OVERSCAN,
  } = options

  const containerRef   = useRef<HTMLDivElement>(null)
  const workerRef      = useRef<Worker | null>(null)
  const heightStoreRef = useRef(new HeightStore(defaultItemHeight))
  const fontConfigRef  = useRef<FontConfig | null>(null)
  const searchIndexRef = useRef<ReturnType<typeof createSearchIndex> | null>(null)

  const [serverItems, setServerItems] = useState<T[]>([])
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const [searchState, searchDispatch] = useReducer(searchReducer, {
    query: '', matches: [], activeMatchIndex: 0, isSearching: false, options: {},
  })

  // ── Items merge ───────────────────────────────────────────────────────────
  const items = useMemo<T[]>(() => {
    if (serverItems.length === 0) return baseItems
    const baseIds = new Set(baseItems.map(i => i.id))
    return [...baseItems, ...serverItems.filter(i => !baseIds.has(i.id))]
  }, [baseItems, serverItems])

  const itemsRef = useRef(items)
  itemsRef.current = items

  const itemIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    items.forEach((it, i) => m.set(it.id, i))
    return m
  }, [items])

  // ── Match lookup (O(1)) ────────────────────────────────────────────────────
  const matchByItemId = useMemo(() => {
    const m = new Map<string, SearchState['matches'][number]>()
    if (searchState.query.trim()) for (const mt of searchState.matches) m.set(mt.itemId, mt)
    return m
  }, [searchState.query, searchState.matches])

  const matchActiveMap = useMemo(() => {
    const m = new Map<string, number>()
    searchState.matches.forEach((mt, i) => m.set(mt.itemId, i))
    return m
  }, [searchState.matches])

  // ── Persist measured heights to IndexedDB (debounced) ─────────────────────
  const persistHeight = useMemo(() =>
    debounce((id: string, h: number) => {
      const fc = fontConfigRef.current
      const container = containerRef.current
      if (!fc) return
      const bucket = getViewportBucket(container?.clientWidth ?? 800)
      setHeight(id, h, bucket, fc.hash, cacheStoreName)
      onMeasureReport?.(id, h, bucket)
    }, persistDebounceMs),
  [cacheStoreName, onMeasureReport, persistDebounceMs])

  // ── Virtualizer ───────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback((i: number) => {
      const item = itemsRef.current[i]
      return heightStoreRef.current.getHeight(item?.id ?? '', item?.type)
    }, []),
    overscan,
  })

  // ── Item ref — wires TanStack measurement + persists to cache ─────────────
  const observeItem = useCallback((el: HTMLElement | null) => {
    if (!el) return
    virtualizer.measureElement(el)
    const id = el.dataset.vsItemId
    if (id) {
      const h = el.getBoundingClientRect().height
      if (h > 0) {
        heightStoreRef.current.set(id, h, 'indexeddb', el.dataset.vsItemType)
        persistHeight(id, h)
      }
    }
  }, [virtualizer, persistHeight])

  // ── Font resolution ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cs    = getComputedStyle(el)
    const fsz   = cs.fontSize || '16px'
    const ff    = cs.fontFamily || 'Inter'
    const lhRaw = cs.lineHeight
    const lh    = lhRaw === 'normal' ? parseFloat(fsz) * 1.5 : parseFloat(lhRaw) || 24
    const font  = parseFontForPretext(`${fsz} ${ff}`)
    fontConfigRef.current = { font, lineHeight: lh, hash: hashFontConfig(font, lh) }
  }, [])

  // ── Pretext Worker ────────────────────────────────────────────────────────
  useEffect(() => {
    const w = new Worker(new URL('../workers/pretext.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = (e: MessageEvent<{ type: string; heights: [string, number][] }>) => {
      if (e.data.type !== WorkerMsg.HEIGHTS_READY) return
      let updated = false
      for (const [id, height] of e.data.heights) {
        if (!heightStoreRef.current.has(id)) {
          heightStoreRef.current.set(id, height, 'pretext')
          updated = true
        }
      }
      if (updated) {
        virtualizer.measure()
        forceUpdate()
      }
    }
    return () => { w.terminate(); workerRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Height init (server hints → IndexedDB → Pretext) ──────────────────────
  useEffect(() => {
    const container = containerRef.current
    const fc        = fontConfigRef.current
    if (!container || items.length === 0 || !fc) return

    const bucket = getViewportBucket(container.clientWidth)
    evictStaleEntries(cacheStoreName)

    ;(async () => {
      for (const item of items) {
        if (!heightStoreRef.current.has(item.id)) {
          const hint = item._hints?.[bucket]
          if (hint && hint.n >= serverHintMinSamples)
            heightStoreRef.current.set(item.id, hint.p50, 'server', item.type)
        }
      }

      const needIds = items.filter(i => !heightStoreRef.current.has(i.id)).map(i => i.id)
      if (needIds.length > 0) {
        const cached = await bulkGetHeights(needIds, bucket, fc.hash, cacheStoreName)
        for (const [id, h] of cached) heightStoreRef.current.set(id, h, 'indexeddb')
      }

      const pretextItems = items
        .filter(i => !heightStoreRef.current.has(i.id))
        .map(i => ({ id: i.id, text: i.text }))
      if (pretextItems.length > 0 && workerRef.current) {
        workerRef.current.postMessage({
          type: WorkerMsg.PREPARE_BATCH, items: pretextItems,
          font: fc.font, containerWidth: container.clientWidth, lineHeight: fc.lineHeight,
        })
      }
    })()
  }, [items, cacheStoreName, serverHintMinSamples])

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
  }, [resizeDebounceMs])

  // ── Search index — incremental, never full rebuild ────────────────────────
  const indexedIdsRef = useRef(new Set<string>())
  useEffect(() => {
    if (searchIndexRef.current === null) {
      searchIndexRef.current = createSearchIndex(items as VirtualItem[], searchFields as string[])
      indexedIdsRef.current = new Set(items.map(i => i.id))
      return
    }
    const fresh = items.filter(i => !indexedIdsRef.current.has(i.id)) as VirtualItem[]
    if (fresh.length > 0) {
      searchIndexRef.current.addAll(fresh)
      fresh.forEach(i => indexedIdsRef.current.add(i.id))
    }
  }, [items, searchFields])

  // ── Server search (optional) ──────────────────────────────────────────────
  const debouncedServerSearch = useMemo(() =>
    debounce(async (query: string) => {
      if (!onServerSearch || !query.trim()) return
      try {
        const results = await onServerSearch(query)
        setServerItems(results)
      } catch { /* non-fatal */ }
    }, serverSearchDebounce),
  [onServerSearch, serverSearchDebounce])

  // ── setQuery ──────────────────────────────────────────────────────────────
  const runSearch = useCallback((query: string, options: SearchOptions) => {
    if (!query.trim()) {
      searchDispatch({ type: 'SET_MATCHES', matches: [] })
      return
    }
    searchDispatch({ type: 'SET_SEARCHING', value: true })
    if (searchIndexRef.current) {
      const matches = searchItems(
        searchIndexRef.current, query, itemIndexMap,
        itemsRef.current as VirtualItem[], searchFields as string[], options
      )
      searchDispatch({ type: 'SET_MATCHES', matches })
    }
  }, [itemIndexMap, searchFields])

  const setQuery = useCallback((query: string) => {
    searchDispatch({ type: 'SET_QUERY', query })
    runSearch(query, searchState.options)
    debouncedServerSearch(query)
  }, [runSearch, searchState.options, debouncedServerSearch])

  const setSearchOptions = useCallback((options: Partial<SearchOptions>) => {
    const next = { ...searchState.options, ...options }
    searchDispatch({ type: 'SET_OPTIONS', options: next })
    runSearch(searchState.query, next)
  }, [searchState.options, searchState.query, runSearch])

  // ── Navigate matches ──────────────────────────────────────────────────────
  const scrollToMatch = useCallback((idx: number) => {
    const match = searchState.matches[idx]
    if (!match) return
    virtualizer.scrollToIndex(match.index, { align: 'center', behavior: 'auto' })
    // Estimated (unmeasured) item heights can shift the layout once real
    // measurements land, throwing off the first scroll. Re-correct on the
    // next frame after that reflow has settled.
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(match.index, { align: 'center', behavior: 'auto' })
    })
  }, [searchState.matches, virtualizer])

  const nextMatch = useCallback(() => {
    const n = searchState.matches.length
    if (n === 0) return
    const next = (searchState.activeMatchIndex + 1) % n
    searchDispatch({ type: 'NEXT_MATCH' })
    scrollToMatch(next)
  }, [searchState, scrollToMatch])

  const prevMatch = useCallback(() => {
    const n = searchState.matches.length
    if (n === 0) return
    const prev = (searchState.activeMatchIndex - 1 + n) % n
    searchDispatch({ type: 'PREV_MATCH' })
    scrollToMatch(prev)
  }, [searchState, scrollToMatch])

  const goToMatch = useCallback((idx: number) => {
    if (idx < 0 || idx >= searchState.matches.length) return
    searchDispatch({ type: 'SET_ACTIVE', index: idx })
    scrollToMatch(idx)
  }, [searchState.matches.length, scrollToMatch])

  // ── Highlights — lazy, per visible item ───────────────────────────────────
  const highlightsCaseSensitive = isHighlightCaseSensitive(searchState.options)
  // wholeWord is ignored in regex mode (the user writes \b themselves there);
  // in fuzzy/exact mode it must also constrain highlighting, or a whole-word
  // search for "cat" would still highlight "cat" inside "catalog".
  const highlightsWholeWord = !!searchState.options.wholeWord && !searchState.options.regex

  const getHighlights = useCallback(
    (idx: number): Map<string, MatchRange[]> | undefined => {
      const item = items[idx]
      if (!item) return undefined
      const match = matchByItemId.get(item.id)
      if (!match) return undefined
      const out = new Map<string, MatchRange[]>()
      for (const [field, terms] of match.terms) {
        const val = (item as Record<string, unknown>)[field]
        if (typeof val === 'string') {
          out.set(field, resolveRanges(val, terms, highlightsCaseSensitive, highlightsWholeWord))
        }
      }
      return out
    },
    [items, matchByItemId, highlightsCaseSensitive, highlightsWholeWord]
  )

  const getIsActiveMatch = useCallback(
    (itemId: string) => matchActiveMap.get(itemId) === searchState.activeMatchIndex,
    [matchActiveMap, searchState.activeMatchIndex]
  )

  const getHeightSource = useCallback(
    (idx: number): HeightSource => heightStoreRef.current.getSource(items[idx]?.id ?? ''),
    [items]
  )

  return {
    items,
    virtualizer,
    search: searchState,
    setQuery,
    setSearchOptions,
    nextMatch,
    prevMatch,
    goToMatch,
    getHighlights,
    getIsActiveMatch,
    observeItem,
    containerRef: containerRef as RefObject<HTMLDivElement>,
    getHeightSource,
  }
}
