import { describe, it, expect, vi } from 'vitest'
import { renderHook, render, act, waitFor } from '@testing-library/react'
import { useSearchableList } from '../hooks/useSearchableList'
import type { VirtualItem } from '../types'

const items: VirtualItem[] = [
  { id: '1', text: 'The quick brown fox jumps over the lazy dog' },
  { id: '2', text: 'React hooks simplify stateful logic' },
  { id: '3', text: 'TypeScript brings static typing to JavaScript' },
  { id: '4', text: 'WebSocket enables real-time communication' },
  { id: '5', text: 'The lazy cat sat quietly on the mat' },
]

describe('useSearchableList — search lifecycle', () => {
  it('starts with an empty query and no matches', () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    expect(result.current.search.query).toBe('')
    expect(result.current.search.matches).toHaveLength(0)
  })

  it('setQuery populates matches for items containing the term', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    const ids = result.current.search.matches.map(m => m.itemId).sort()
    expect(ids).toEqual(['1', '5'])
  })

  it('setQuery("") clears matches', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    act(() => result.current.setQuery(''))
    expect(result.current.search.matches).toHaveLength(0)
  })

  it('resets activeMatchIndex to 0 on a new query', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    act(() => result.current.nextMatch())
    expect(result.current.search.activeMatchIndex).toBe(1)
    act(() => result.current.setQuery('cat'))
    expect(result.current.search.activeMatchIndex).toBe(0)
  })
})

describe('useSearchableList — match navigation', () => {
  it('nextMatch wraps around to the first match', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(2))
    act(() => result.current.nextMatch())
    expect(result.current.search.activeMatchIndex).toBe(1)
    act(() => result.current.nextMatch())
    expect(result.current.search.activeMatchIndex).toBe(0)
  })

  it('prevMatch wraps around to the last match', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(2))
    act(() => result.current.prevMatch())
    expect(result.current.search.activeMatchIndex).toBe(1)
  })

  it('nextMatch/prevMatch are no-ops with zero matches', () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.nextMatch())
    expect(result.current.search.activeMatchIndex).toBe(0)
    act(() => result.current.prevMatch())
    expect(result.current.search.activeMatchIndex).toBe(0)
  })

  it('goToMatch jumps directly to the given match index', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(2))
    act(() => result.current.goToMatch(1))
    expect(result.current.search.activeMatchIndex).toBe(1)
  })

  it('goToMatch ignores out-of-bounds indices', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(2))
    act(() => result.current.goToMatch(99))
    expect(result.current.search.activeMatchIndex).toBe(0)
    act(() => result.current.goToMatch(-1))
    expect(result.current.search.activeMatchIndex).toBe(0)
  })
})

describe('useSearchableList — search options', () => {
  it('setSearchOptions merges into existing options', () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setSearchOptions({ regex: true }))
    expect(result.current.search.options.regex).toBe(true)
    act(() => result.current.setSearchOptions({ caseSensitive: true }))
    expect(result.current.search.options).toEqual({ regex: true, caseSensitive: true })
  })

  it('does not lose rapid consecutive option updates and normalizes exclusive modes', () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => {
      result.current.setSearchOptions({ exactMatch: true })
      result.current.setSearchOptions({ wholeWord: true })
      result.current.setSearchOptions({ caseSensitive: true })
    })
    expect(result.current.search.options).toEqual({
      exactMatch: true,
      wholeWord: true,
      caseSensitive: true,
    })

    act(() => result.current.setSearchOptions({ regex: true }))
    expect(result.current.search.options).toEqual({
      exactMatch: false,
      regex: true,
      wholeWord: true,
      caseSensitive: true,
    })

    act(() => result.current.setSearchOptions({ exactMatch: true }))
    expect(result.current.search.options).toEqual({
      exactMatch: true,
      regex: false,
      wholeWord: true,
      caseSensitive: true,
    })
  })

  it('changing options re-runs the current query', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('quik')) // fuzzy-matches "quick" by default
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    act(() => result.current.setSearchOptions({ exactMatch: true }))
    // 'quik' has no literal substring match once fuzzy is disabled.
    await waitFor(() => expect(result.current.search.matches).toHaveLength(0))
  })

  it('regex mode finds items via a real pattern', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setSearchOptions({ regex: true }))
    act(() => result.current.setQuery('^The'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    expect(result.current.search.matches.map(m => m.itemId).sort()).toEqual(['1', '5'])
  })
})

describe('useSearchableList — items merge with onServerSearch', () => {
  it('merges server results into items, deduping by id', async () => {
    const onServerSearch = vi.fn(async () => [
      { id: '6', text: 'Server-only result about lazy evaluation' },
      { id: '1', text: 'The quick brown fox jumps over the lazy dog' }, // already local — should not duplicate
    ])
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(onServerSearch).toHaveBeenCalledWith('lazy', expect.any(AbortSignal)))
    await waitFor(() => expect(result.current.items.some(i => i.id === '6')).toBe(true))
    expect(result.current.items.filter(i => i.id === '1')).toHaveLength(1)
  })

  it('clears merged server results when the query is cleared', async () => {
    const onServerSearch = vi.fn(async () => [
      { id: '6', text: 'Server-only result about lazy evaluation' },
    ])
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.items.some(i => i.id === '6')).toBe(true))
    act(() => result.current.setQuery(''))
    expect(result.current.items.some(i => i.id === '6')).toBe(false)
  })

  it('calls onSearchError when onServerSearch rejects, without throwing', async () => {
    const onSearchError = vi.fn()
    const onServerSearch = vi.fn(async () => { throw new Error('boom') })
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, onSearchError, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(onSearchError).toHaveBeenCalledWith(expect.any(Error)))
  })

  it('ignores a stale response when a newer query has since superseded it', async () => {
    const onServerSearch = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve =>
        setTimeout(() => resolve([{ id: 'slow', text: 'stale result' }]), 50)
      ))
      .mockImplementationOnce(async () => [{ id: 'fast', text: 'fresh result' }])
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(onServerSearch).toHaveBeenCalledTimes(1))
    act(() => result.current.setQuery('lazier'))
    await waitFor(() => expect(onServerSearch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.items.some(i => i.id === 'fast')).toBe(true))
    expect(result.current.items.some(i => i.id === 'slow')).toBe(false)
  })

  it('exposes isServerSearching while a request is in flight', async () => {
    let resolveSearch: (v: typeof items) => void = () => {}
    const onServerSearch = vi.fn(() => new Promise<typeof items>(resolve => { resolveSearch = resolve }))
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.isServerSearching).toBe(true))
    act(() => resolveSearch([]))
    await waitFor(() => expect(result.current.isServerSearching).toBe(false))
  })

  it('supports a custom mergeServerResults strategy', async () => {
    const onServerSearch = vi.fn(async () => [{ id: '6', text: 'server result' }])
    const mergeServerResults = vi.fn((base: typeof items, server: typeof items) => [...server, ...base])
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, mergeServerResults, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.items[0]?.id).toBe('6'))
    expect(mergeServerResults).toHaveBeenCalled()
  })

  it('picks up matches/highlights for server results merged in after the initial search ran', async () => {
    const onServerSearch = vi.fn(async () => [
      { id: '6', text: 'lazy server-only result' },
    ])
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.items.some(i => i.id === '6')).toBe(true))
    await waitFor(() => expect(result.current.search.matches.some(m => m.itemId === '6')).toBe(true))
  })

  it('drops merged server results once the query falls below serverSearchMinLength', async () => {
    const onServerSearch = vi.fn(async () => [{ id: '6', text: 'lazy server-only result' }])
    const { result } = renderHook(() =>
      useSearchableList({ items, onServerSearch, serverSearchMinLength: 3, serverSearchDebounce: 0 })
    )
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.items.some(i => i.id === '6')).toBe(true))
    act(() => result.current.setQuery('la'))
    expect(result.current.items.some(i => i.id === '6')).toBe(false)
  })
})

describe('useSearchableList — containerHeight', () => {
  it('applies containerHeight to the container element style', () => {
    function TestComponent() {
      const { containerRef } = useSearchableList({ items, containerHeight: 600 })
      return <div ref={containerRef} data-testid="container" />
    }
    const { getByTestId } = render(<TestComponent />)
    expect(getByTestId('container').style.height).toBe('600px')
  })
})

describe('useSearchableList — getHighlights / getIsActiveMatch', () => {
  it('returns highlight ranges for the active field of a matched item', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    const idx = result.current.items.findIndex(i => i.id === '1')
    const highlights = result.current.getHighlights(idx)
    expect(highlights?.get('text')?.length).toBeGreaterThan(0)
  })

  it('highlights every literal occurrence of the default query', async () => {
    const bleedItems: VirtualItem[] = [
      { id: 'a', text: 'I followed up on our conversation about hydration' },
    ]
    const { result } = renderHook(() => useSearchableList({ items: bleedItems }))
    act(() => result.current.setQuery('on'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    const ranges = result.current.getHighlights(0)?.get('text') ?? []
    const matched = ranges.map(r => bleedItems[0].text.slice(r.start, r.end))
    expect(matched).toEqual(['on', 'on', 'on', 'on'])
  })

  it('highlights only a one-letter query, not whole prefix-matched words', async () => {
    const prefixItems: VirtualItem[] = [
      { id: 'w', text: 'was we week wanted await now' },
    ]
    const { result } = renderHook(() => useSearchableList({ items: prefixItems }))
    act(() => result.current.setQuery('w'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(1))
    const ranges = result.current.getHighlights(0)?.get('text') ?? []
    expect(ranges.map(range => prefixItems[0].text.slice(range.start, range.end))).toEqual([
      'w', 'w', 'w', 'w', 'w', 'w',
    ])
  })

  it('finds and highlights a default query inside a word', async () => {
    const substringItems: VirtualItem[] = [
      { id: 'v', text: 'Critical vulnerability found' },
    ]
    const { result } = renderHook(() => useSearchableList({ items: substringItems }))
    act(() => result.current.setQuery('ra'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(1))
    const ranges = result.current.getHighlights(0)?.get('text') ?? []
    expect(ranges.map(range => substringItems[0].text.slice(range.start, range.end))).toEqual(['ra'])
  })

  it('returns undefined for an item with no match', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches.length).toBeGreaterThan(0))
    const idx = result.current.items.findIndex(i => i.id === '2')
    expect(result.current.getHighlights(idx)).toBeUndefined()
  })

  it('getIsActiveMatch is true only for the active match itemId', async () => {
    const { result } = renderHook(() => useSearchableList({ items }))
    act(() => result.current.setQuery('lazy'))
    await waitFor(() => expect(result.current.search.matches).toHaveLength(2))
    const activeId = result.current.search.matches[0].itemId
    const otherId = result.current.search.matches[1].itemId
    expect(result.current.getIsActiveMatch(activeId)).toBe(true)
    expect(result.current.getIsActiveMatch(otherId)).toBe(false)
  })
})
