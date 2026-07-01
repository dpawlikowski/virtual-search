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
   * Match whole words only (word-boundary constrained). In fuzzy mode this
   * disables prefix matching; in `exactMatch` mode it requires `\b` word
   * boundaries around the literal match. Ignored if `regex` is set — write
   * `\b` in the pattern yourself for full control.
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
  /** Height of the scroll container in px. Set this same value on the container element via CSS/style. */
  containerHeight?: number
  searchFields?: Array<keyof T & string>
  onServerSearch?: (query: string) => Promise<T[]>
  serverSearchDebounce?: number
  serverHintMinSamples?: number
  onMeasureReport?: (itemId: string, height: number, bucket: ViewportBucket) => void
  cacheStoreName?: string
  defaultItemHeight?: number

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
}
