import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VirtualItem } from '../types'
import { debounce } from '../utils'

/**
 * Server search is intentionally transport-agnostic: `onServerSearch` is a
 * plain `(query, signal) => Promise<T[]>` callback. This hook only owns
 * debouncing, cancellation, and stale-response handling — it has no idea
 * whether the host app is calling REST, GraphQL, IndexedDB, or a mock.
 */
export interface UseServerSearchOptions<T extends VirtualItem> {
  onServerSearch?: (query: string, signal: AbortSignal) => Promise<T[]>
  debounceMs?: number
  /** Queries shorter than this never reach `onServerSearch`. Default: 1. */
  minQueryLength?: number
  onError?: (error: unknown) => void
}

export interface UseServerSearchResult<T extends VirtualItem> {
  serverItems: T[]
  /** True while a server request is in flight. Independent from the local (MiniSearch) `search.isSearching`. */
  isServerSearching: boolean
  search: (query: string) => void
  clear: () => void
}

/**
 * Debounced, cancellation-safe wrapper around an optional `onServerSearch`
 * callback. Split out of `useSearchableList` so bundlers can tree-shake this
 * whole module (debounce plumbing, AbortController wiring, stale-response
 * guard) for consumers who never pass `onServerSearch`.
 */
export function useServerSearch<T extends VirtualItem>(
  options: UseServerSearchOptions<T>
): UseServerSearchResult<T> {
  const { onServerSearch, debounceMs = 250, minQueryLength = 1, onError } = options

  const [serverItems, setServerItems] = useState<T[]>([])
  const [isServerSearching, setIsServerSearching] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  // The debounced callback only runs later, off a setTimeout — never during
  // render — so mutating abortRef/requestIdRef inside it is safe despite the
  // static react-hooks/refs lint rule not being able to see that.
  // eslint-disable-next-line react-hooks/refs
  const debouncedSearch = useMemo(() => debounce((query: string) => {
    if (!onServerSearch || query.trim().length < minQueryLength) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current

    setIsServerSearching(true)
    onServerSearch(query, controller.signal)
      .then(results => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return
        setServerItems(results)
      })
      .catch(error => {
        if (controller.signal.aborted || (error as { name?: string })?.name === 'AbortError') return
        if (requestIdRef.current !== requestId) return
        onError?.(error)
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsServerSearching(false)
      })
  }, debounceMs), [onServerSearch, onError, minQueryLength, debounceMs])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    requestIdRef.current++
    setIsServerSearching(false)
    setServerItems([])
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const search = useCallback((query: string) => {
    // Below the threshold, the debounced call would no-op anyway — clear
    // immediately instead, so results from a longer previous query don't
    // linger merged into `items` while the query no longer qualifies.
    if (query.trim().length < minQueryLength) {
      clear()
      return
    }
    debouncedSearch(query)
  }, [debouncedSearch, clear, minQueryLength])

  return { serverItems, isServerSearching, search, clear }
}
