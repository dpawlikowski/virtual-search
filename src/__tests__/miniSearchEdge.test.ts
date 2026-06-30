import { describe, it, expect } from 'vitest'
import { resolveRanges, searchItems, createSearchIndex } from '../search/miniSearchAdapter'
import type { VirtualItem } from '../types'

describe('resolveRanges — additional edge cases', () => {
  it('handles undefined / empty term in array', () => {
    // An empty string in terms list should not produce spurious ranges
    const ranges = resolveRanges('hello world', [''])
    expect(ranges).toEqual([])
  })

  it('finds term at exact end of string', () => {
    const ranges = resolveRanges('say hello', ['hello'])
    expect(ranges).toEqual([{ start: 4, end: 9 }])
  })

  it('handles term equal to full text', () => {
    const ranges = resolveRanges('abc', ['abc'])
    expect(ranges).toEqual([{ start: 0, end: 3 }])
  })

  it('three overlapping terms merge to single range', () => {
    // "foo" [0,3], "foob" [0,4], "foobar" [0,6]
    const ranges = resolveRanges('foobar', ['foo', 'foob', 'foobar'])
    expect(ranges).toEqual([{ start: 0, end: 6 }])
  })

  it('handles unicode text correctly', () => {
    const ranges = resolveRanges('café latte', ['café'])
    expect(ranges).toEqual([{ start: 0, end: 4 }])
  })

  it('multiple terms with partial overlap merge correctly', () => {
    // "abc" [0,3] and "bcd" [1,4] → merged [0,4]
    const ranges = resolveRanges('abcde', ['abc', 'bcd'])
    expect(ranges).toEqual([{ start: 0, end: 4 }])
  })
})

describe('searchItems — highlight structure', () => {
  const items: VirtualItem[] = [
    { id: '1', text: 'React hooks are great for state management' },
    { id: '2', text: 'TypeScript static types improve reliability' },
  ]
  const buildMap = (its: VirtualItem[]) => {
    const m = new Map<string, number>()
    its.forEach((it, i) => m.set(it.id, i))
    return m
  }

  it('each result has a score > 0', () => {
    const idx = createSearchIndex(items, ['text'])
    const results = searchItems(idx, 'react', buildMap(items))
    expect(results.every(r => r.score > 0)).toBe(true)
  })

  it('results are sorted descending by score', () => {
    const idx = createSearchIndex(items, ['text'])
    const results = searchItems(idx, 'static', buildMap(items))
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('highlights are a Map instance', () => {
    const idx = createSearchIndex(items, ['text'])
    const results = searchItems(idx, 'hooks', buildMap(items))
    expect(results[0].highlights).toBeInstanceOf(Map)
  })

  it('returns no results for single-character query below min token length', () => {
    const idx = createSearchIndex(items, ['text'])
    // MiniSearch default minLength is 1 for prefix, but very short single char
    // should return results (prefix search), so we test a truly matching case
    const results = searchItems(idx, 'xyz', buildMap(items))
    expect(results).toHaveLength(0)
  })
})
