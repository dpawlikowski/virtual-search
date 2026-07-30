import {
  useRef,
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
  SearchState,
  SearchOptions,
  MatchRange,
} from '../types'
import { EMA_DEFAULT_FALLBACK } from '../utils'
import { createSearchIndex, searchItems, resolveRanges, isHighlightCaseSensitive, isHighlightWholeWord, mergeSearchOptions } from '../search/miniSearchAdapter'
import { useServerSearch } from './useServerSearch'
import { useHeightCache, HeightStore } from './useHeightCache'

// Re-exported for consumers that construct their own estimate store.
export { HeightStore }

// ─── Option defaults ────────────────────────────────────────────────────────
const DEFAULT_SERVER_SEARCH_DEBOUNCE_MS = 250
const DEFAULT_SERVER_SEARCH_MIN_LENGTH = 1
const DEFAULT_SERVER_HINT_MIN_SAMPLES = 10
const DEFAULT_PERSIST_DEBOUNCE_MS = 500
const DEFAULT_RESIZE_DEBOUNCE_MS = 200
const DEFAULT_VIRTUALIZER_OVERSCAN = 4
const DEFAULT_SEARCH_FIELDS = ['text']
const DEFAULT_CACHE_STORE_NAME = 'virtual-search-heights'
const DEFAULT_SCROLL_ALIGN = 'center' as const

/** Minimal view of the virtualizer needed to re-measure after async height updates. */
interface Remeasurable {
  measure: () => void
}

// ─── Search reducer ───────────────────────────────────────────────────────────

type SearchAction =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_MATCHES'; matches: SearchState['matches'] }
  | { type: 'NEXT_MATCH' }
  | { type: 'PREV_MATCH' }
  | { type: 'SET_SEARCHING'; value: boolean }
  | { type: 'SET_OPTIONS'; options: Partial<SearchOptions> }
  | { type: 'SET_ACTIVE'; index: number }

export function searchReducer(s: SearchState, a: SearchAction): SearchState {
  switch (a.type) {
    case 'SET_QUERY':     return { ...s, query: a.query, activeMatchIndex: 0 }
    case 'SET_MATCHES':   return { ...s, matches: a.matches, activeMatchIndex: 0, isSearching: false }
    case 'NEXT_MATCH': { const n = s.matches.length; return { ...s, activeMatchIndex: n === 0 ? 0 : (s.activeMatchIndex + 1) % n } }
    case 'PREV_MATCH': { const n = s.matches.length; return { ...s, activeMatchIndex: n === 0 ? 0 : (s.activeMatchIndex - 1 + n) % n } }
    case 'SET_SEARCHING': return { ...s, isSearching: a.value }
    case 'SET_OPTIONS':   return { ...s, options: mergeSearchOptions(s.options, a.options) }
    case 'SET_ACTIVE':    return { ...s, activeMatchIndex: a.index }
    default: return s
  }
}

function defaultMergeServerResults<T extends VirtualItem>(base: T[], server: T[]): T[] {
  if (server.length === 0) return base
  const baseIds = new Set(base.map(i => i.id))
  return [...base, ...server.filter(i => !baseIds.has(i.id))]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSearchableList<T extends VirtualItem>(
  options: UseSearchableListOptions<T>
): UseSearchableListReturn<T> {
  const {
    items: baseItems,
    containerHeight,
    searchFields = DEFAULT_SEARCH_FIELDS,
    onServerSearch,
    serverSearchDebounce = DEFAULT_SERVER_SEARCH_DEBOUNCE_MS,
    serverSearchMinLength = DEFAULT_SERVER_SEARCH_MIN_LENGTH,
    onSearchError,
    mergeServerResults = defaultMergeServerResults,
    serverHintMinSamples = DEFAULT_SERVER_HINT_MIN_SAMPLES,
    onMeasureReport,
    cacheStoreName = DEFAULT_CACHE_STORE_NAME,
    defaultItemHeight = EMA_DEFAULT_FALLBACK,
    cacheTtlMs,
    scrollAlign = DEFAULT_SCROLL_ALIGN,
    persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS,
    resizeDebounceMs = DEFAULT_RESIZE_DEBOUNCE_MS,
    overscan = DEFAULT_VIRTUALIZER_OVERSCAN,
  } = options

  const containerRef = useRef<HTMLDivElement>(null)

  const { serverItems, isServerSearching, search: runServerSearch, clear: clearServerSearch } =
    useServerSearch<T>({
      onServerSearch,
      debounceMs: serverSearchDebounce,
      minQueryLength: serverSearchMinLength,
      onError: onSearchError,
    })
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const [searchState, searchDispatch] = useReducer(searchReducer, {
    query: '', matches: [], activeMatchIndex: 0, isSearching: false, options: {},
  })
  const searchOptionsRef = useRef<SearchOptions>({})
  searchOptionsRef.current = searchState.options

  // ── Items merge ───────────────────────────────────────────────────────────
  const items = useMemo<T[]>(
    () => mergeServerResults(baseItems, serverItems),
    [baseItems, serverItems, mergeServerResults]
  )

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

  // ── Height estimation (server hints → IndexedDB → Pretext worker) ─────────
  // Re-measure the virtualizer whenever async heights land. `virtualizerRef`
  // breaks the ordering cycle: the cache is created before the virtualizer,
  // but only ever calls back after mount, once the ref is populated.
  const virtualizerRef = useRef<Remeasurable | null>(null)
  const onHeightsReady = useCallback(() => {
    virtualizerRef.current?.measure()
    forceUpdate()
  }, [])

  const { heightStoreRef, observeItem: persistMeasuredHeight, getHeightSource } = useHeightCache<T>({
    containerRef,
    items,
    defaultItemHeight,
    cacheStoreName,
    cacheTtlMs,
    serverHintMinSamples,
    persistDebounceMs,
    resizeDebounceMs,
    onMeasureReport,
    onHeightsReady,
  })

  // ── Virtualizer ───────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback((i: number) => {
      const item = itemsRef.current[i]
      return heightStoreRef.current.getHeight(item?.id ?? '', item?.type)
    }, [heightStoreRef]),
    overscan,
  })
  virtualizerRef.current = virtualizer

  // ── Item ref — wires TanStack measurement, then persists to the cache ─────
  const observeItem = useCallback((el: HTMLElement | null) => {
    if (!el) return
    virtualizer.measureElement(el)
    persistMeasuredHeight(el)
  }, [virtualizer, persistMeasuredHeight])

  // ── Apply containerHeight, if provided ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || containerHeight == null) return
    el.style.height = `${containerHeight}px`
  }, [containerHeight])

  // ── Search index — incremental, never full rebuild ────────────────────────
  const searchIndexRef = useRef<ReturnType<typeof createSearchIndex> | null>(null)
  const indexedIdsRef = useRef(new Set<string>())
  useEffect(() => {
    if (searchIndexRef.current === null) {
      searchIndexRef.current = createSearchIndex(items as VirtualItem[], searchFields as string[])
      indexedIdsRef.current = new Set(items.map(i => i.id))
      return
    }
    // Evict ids that are no longer present (e.g. a wholesale page swap, not an
    // append). Without this the MiniSearch index grows unbounded over a session
    // and its fuzzy/IDF scoring is skewed by long-gone documents. `discardAll`
    // removes by id lazily (auto-vacuumed) and allows the id to be re-added later.
    const currentIds = new Set(items.map(i => i.id))
    const removed: string[] = []
    indexedIdsRef.current.forEach(id => {
      if (!currentIds.has(id)) removed.push(id)
    })
    if (removed.length > 0) {
      searchIndexRef.current.discardAll(removed)
      removed.forEach(id => indexedIdsRef.current.delete(id))
    }

    const fresh = items.filter(i => !indexedIdsRef.current.has(i.id)) as VirtualItem[]
    if (fresh.length > 0) {
      searchIndexRef.current.addAll(fresh)
      fresh.forEach(i => indexedIdsRef.current.add(i.id))
    }
  }, [items, searchFields])

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
    runSearch(query, searchOptionsRef.current)
    if (!query.trim()) clearServerSearch()
    else runServerSearch(query)
  }, [runSearch, runServerSearch, clearServerSearch])

  const setSearchOptions = useCallback((options: Partial<SearchOptions>) => {
    const next = mergeSearchOptions(searchOptionsRef.current, options)
    searchOptionsRef.current = next
    searchDispatch({ type: 'SET_OPTIONS', options })
    runSearch(searchState.query, next)
  }, [searchState.query, runSearch])

  // ── Re-run the active query when `items` changes shape ────────────────────
  // Covers server results merging in (or a custom mergeServerResults
  // reordering items): the MiniSearch index gets new entries above, but
  // without this, matches/highlights for those entries wouldn't appear
  // until the next keystroke.
  useEffect(() => {
    if (searchState.query.trim()) runSearch(searchState.query, searchState.options)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // ── Navigate matches ──────────────────────────────────────────────────────
  const correctionRafRef = useRef<number | null>(null)
  const scrollToMatch = useCallback((idx: number) => {
    const match = searchState.matches[idx]
    if (!match) return
    if (correctionRafRef.current !== null) {
      cancelAnimationFrame(correctionRafRef.current)
      correctionRafRef.current = null
    }
    virtualizer.scrollToIndex(match.index, { align: scrollAlign, behavior: 'auto' })
    // Estimated (unmeasured) item heights can shift the layout once real
    // measurements land, throwing off the first scroll. Re-correct on the
    // next frame after that reflow has settled. Cancelled above if another
    // scrollToMatch fires before this frame runs (e.g. holding Enter).
    correctionRafRef.current = requestAnimationFrame(() => {
      correctionRafRef.current = null
      virtualizer.scrollToIndex(match.index, { align: scrollAlign, behavior: 'auto' })
    })
  }, [searchState.matches, virtualizer, scrollAlign])

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
  // Fuzzy/prefix highlights are ALWAYS word-bounded — its matched terms are
  // whole-word tokens, so an unbounded (substring) highlight would smear a
  // token like "on" across "onboarding"/"conversation". Exact match honors the
  // wholeWord toggle; regex bounds via the pattern itself. See isHighlightWholeWord.
  const highlightsWholeWord = isHighlightWholeWord(searchState.options)

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
    isServerSearching,
  }
}
