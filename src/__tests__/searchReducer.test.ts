import { describe, it, expect } from 'vitest'
import { searchReducer } from '../hooks/useSearchableList'
import type { SearchState } from '../types'

const makeMatch = (id: string, index: number) => ({
  itemId: id, index, score: 1, terms: new Map<string, string[]>(),
})

const empty: SearchState = { query: '', matches: [], activeMatchIndex: 0, isSearching: false, options: {} }
const withMatches: SearchState = {
  query: 'foo',
  matches: [makeMatch('a', 0), makeMatch('b', 1), makeMatch('c', 2)],
  activeMatchIndex: 0,
  isSearching: false,
  options: {},
}

describe('searchReducer', () => {
  it('SET_QUERY resets activeMatchIndex', () => {
    const s = { ...withMatches, activeMatchIndex: 2 }
    const next = searchReducer(s, { type: 'SET_QUERY', query: 'bar' })
    expect(next.query).toBe('bar')
    expect(next.activeMatchIndex).toBe(0)
  })

  it('SET_MATCHES resets activeMatchIndex and clears isSearching', () => {
    const s = { ...empty, isSearching: true }
    const next = searchReducer(s, { type: 'SET_MATCHES', matches: [makeMatch('x', 0)] })
    expect(next.matches).toHaveLength(1)
    expect(next.activeMatchIndex).toBe(0)
    expect(next.isSearching).toBe(false)
  })

  it('NEXT_MATCH wraps around', () => {
    const s = { ...withMatches, activeMatchIndex: 2 }
    const next = searchReducer(s, { type: 'NEXT_MATCH' })
    expect(next.activeMatchIndex).toBe(0)
  })

  it('NEXT_MATCH advances', () => {
    const next = searchReducer(withMatches, { type: 'NEXT_MATCH' })
    expect(next.activeMatchIndex).toBe(1)
  })

  it('PREV_MATCH wraps around', () => {
    const s = { ...withMatches, activeMatchIndex: 0 }
    const next = searchReducer(s, { type: 'PREV_MATCH' })
    expect(next.activeMatchIndex).toBe(2)
  })

  it('PREV_MATCH goes back', () => {
    const s = { ...withMatches, activeMatchIndex: 2 }
    const next = searchReducer(s, { type: 'PREV_MATCH' })
    expect(next.activeMatchIndex).toBe(1)
  })

  it('NEXT_MATCH is no-op with empty matches', () => {
    const next = searchReducer(empty, { type: 'NEXT_MATCH' })
    expect(next.activeMatchIndex).toBe(0)
  })

  it('PREV_MATCH is no-op with empty matches', () => {
    const next = searchReducer(empty, { type: 'PREV_MATCH' })
    expect(next.activeMatchIndex).toBe(0)
  })

  it('SET_SEARCHING updates flag', () => {
    const next = searchReducer(empty, { type: 'SET_SEARCHING', value: true })
    expect(next.isSearching).toBe(true)
  })
})
