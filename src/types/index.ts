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
  highlights: Map<string, MatchRange[]>
}

export interface MatchRange {
  start: number
  end: number
}

export interface SearchState {
  query: string
  matches: SearchMatch[]
  activeMatchIndex: number
  isSearching: boolean
}

export type HeightSource = 'server' | 'indexeddb' | 'pretext' | 'ema' | 'default'

export interface FontConfig {
  font: string
  lineHeight: number
  hash: string
}

export interface UseSearchableListOptions<T extends VirtualItem> {
  items: T[]
  containerHeight: number
  searchFields?: Array<keyof T & string>
  onServerSearch?: (query: string) => Promise<T[]>
  serverSearchDebounce?: number
  serverHintMinSamples?: number
  onMeasureReport?: (itemId: string, height: number, bucket: ViewportBucket) => void
  cacheStoreName?: string
  defaultItemHeight?: number
}

export interface UseSearchableListReturn<T extends VirtualItem> {
  items: T[]
  virtualizer: Virtualizer<HTMLDivElement, Element>
  search: SearchState
  setQuery: (query: string) => void
  nextMatch: () => void
  prevMatch: () => void
  getHighlights: (itemIndex: number) => Map<string, MatchRange[]> | undefined
  /** O(1) active match check — use instead of reading search.matches[activeMatchIndex] */
  getIsActiveMatch: (itemId: string) => boolean
  /** Ref callback for each item element — wires TanStack measureElement and persists height to cache */
  observeItem: (el: HTMLElement | null) => void
  containerRef: React.RefObject<HTMLDivElement>
  getHeightSource: (itemIndex: number) => HeightSource
}
