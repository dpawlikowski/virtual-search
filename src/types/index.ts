import type { Virtualizer } from '@tanstack/react-virtual'

export type ViewportBucket = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface HeightHint {
  p50: number
  n: number
}

export interface ServerHeightHints {
  xs?: HeightHint
  sm?: HeightHint
  md?: HeightHint
  lg?: HeightHint
  xl?: HeightHint
}

export interface VirtualItem {
  id: string
  text: string
  type?: string
  _hints?: ServerHeightHints
}

export interface SearchMatch {
  itemId: string
  index: number
  score: number
  /** matched terms per field — resolve to character ranges via resolveRanges */
  terms: Map<string, string[]>
}

export interface MatchRange {
  start: number
  end: number
}

export interface SearchOptions {
  /** Treat the query as a regular expression instead of fuzzy/prefix tokens. */
  regex?: boolean
  /** Require an exact (literal substring) match instead of fuzzy/prefix tokens. Ignored if `regex` is set. */
  exactMatch?: boolean
  /** Case-sensitive matching. Only applies to `regex`/`exactMatch` modes — fuzzy search is always case-insensitive. */
  caseSensitive?: boolean
  /**
   * Match whole words only. In default mode this requires identical full
   * tokens by disabling fuzzy and prefix matching. In `exactMatch` mode it
   * applies Unicode-aware letter/number boundaries around the literal match.
   * Ignored if `regex` is set; define boundaries in the pattern instead.
   */
  wholeWord?: boolean
}

export interface SearchState {
  query: string
  matches: SearchMatch[]
  activeMatchIndex: number
  isSearching: boolean
  options: SearchOptions
}

export type HeightSource = 'server' | 'indexeddb' | 'pretext' | 'ema' | 'default'

export interface FontConfig {
  font: string
  lineHeight: number
  hash: string
}

export interface UseSearchableListOptions<T extends VirtualItem> {
  items: T[]
  /** Height of the scroll container in px. Applied to the container element's `style.height` — set it here instead of duplicating it in your own CSS/style. */
  containerHeight?: number
  searchFields?: Array<keyof T & string>
  /**
   * Transport-agnostic server search hook. Receives the query and an
   * `AbortSignal` — pass the signal to `fetch`/your client so an in-flight
   * request from a stale keystroke can be cancelled. Out-of-order responses
   * are ignored automatically even if the signal isn't wired up.
   */
  onServerSearch?: (query: string, signal: AbortSignal) => Promise<T[]>
  serverSearchDebounce?: number
  /** Queries shorter than this never reach `onServerSearch`. Default: 1. */
  serverSearchMinLength?: number
  /** Called when `onServerSearch` rejects, so the host app can surface an error (e.g. a toast). Non-fatal — local search keeps working. */
  onSearchError?: (error: unknown) => void
  /**
   * Controls how `onServerSearch` results are combined with local `items`.
   * Default: append server results not already present (by `id`) to the end
   * of the local list. Override to sort, cap, or otherwise reshape the merge
   * — still no knowledge of any particular API baked in.
   */
  mergeServerResults?: (base: T[], server: T[]) => T[]
  serverHintMinSamples?: number
  onMeasureReport?: (itemId: string, height: number, bucket: ViewportBucket) => void
  cacheStoreName?: string
  defaultItemHeight?: number
  /** How long a cached height stays valid before being treated as stale. Default: 30 days. */
  cacheTtlMs?: number
  /** Alignment used when scrolling to a match (`nextMatch`/`prevMatch`/`goToMatch`). Default: 'center'. */
  scrollAlign?: 'start' | 'center' | 'end' | 'auto'

  // Tuning — sensible defaults, override only if profiling shows a need to.
  /** Debounce before a measured height is written to IndexedDB. Default: 500ms. */
  persistDebounceMs?: number
  /** Debounce before a container resize triggers Pretext re-layout. Default: 200ms. */
  resizeDebounceMs?: number
  /** Extra items rendered outside the viewport on each side, passed to TanStack Virtual. Default: 4. */
  overscan?: number
}

export interface UseSearchableListReturn<T extends VirtualItem> {
  items: T[]
  virtualizer: Virtualizer<HTMLDivElement, Element>
  search: SearchState
  setQuery: (query: string) => void
  setSearchOptions: (options: Partial<SearchOptions>) => void
  nextMatch: () => void
  prevMatch: () => void
  /** Jump directly to a match by its index in `search.matches` (e.g. from a minimap marker). */
  goToMatch: (matchIndex: number) => void
  getHighlights: (itemIndex: number) => Map<string, MatchRange[]> | undefined
  /** O(1) active match check — use instead of reading search.matches[activeMatchIndex] */
  getIsActiveMatch: (itemId: string) => boolean
  /** Ref callback for each item element — wires TanStack measureElement and persists height to cache */
  observeItem: (el: HTMLElement | null) => void
  containerRef: React.RefObject<HTMLDivElement>
  getHeightSource: (itemIndex: number) => HeightSource
  /** True while an `onServerSearch` request is in flight. Independent of `search.isSearching` (local index search). */
  isServerSearching: boolean
}
