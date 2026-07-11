import { describe, it, expect } from 'vitest'
import { createSearchIndex, searchItems, resolveRanges } from '../search/miniSearchAdapter'
import type { VirtualItem } from '../types'

const items: VirtualItem[] = [
  { id: '1', text: 'The quick brown fox jumps over the lazy dog', type: 'doc' },
  { id: '2', text: 'React hooks simplify stateful logic in functional components' },
  { id: '3', text: 'TypeScript brings static typing to JavaScript' },
  { id: '4', text: 'WebSocket enables real-time bidirectional communication' },
  { id: '5', text: 'The lazy cat sat quietly on the mat' },
]

const buildMap = (items: VirtualItem[]) => {
  const m = new Map<string, number>()
  items.forEach((it, i) => m.set(it.id, i))
  return m
}

describe('createSearchIndex + searchItems', () => {
  it('finds exact term', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'TypeScript', map)
    expect(results.map(r => r.itemId)).toContain('3')
  })

  it('finds prefix match', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'React', map)
    expect(results.map(r => r.itemId)).toContain('2')
  })

  it('returns empty for no match', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'xyzzy', map)
    expect(results).toHaveLength(0)
  })

  it('returns empty for blank query', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    expect(searchItems(idx, '', map)).toHaveLength(0)
    expect(searchItems(idx, '   ', map)).toHaveLength(0)
  })

  it('results include correct item index from map', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'WebSocket', map)
    expect(results[0]?.index).toBe(3) // '4' is at index 3
  })

  it('finds term across multiple items', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'lazy', map)
    const ids = results.map(r => r.itemId)
    expect(ids).toContain('1') // "lazy dog"
    expect(ids).toContain('5') // "lazy cat"
  })

  it('terms map contains matched field', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'hooks', map)
    expect(results[0]?.terms.has('text')).toBe(true)
  })

  it('filters out items not in indexMap', () => {
    const idx = createSearchIndex(items, ['text'])
    // Only expose item '2' in map
    const limitedMap = new Map([['2', 0]])
    const results = searchItems(idx, 'lazy', limitedMap)
    expect(results.every(r => r.itemId === '2')).toBe(true)
  })
})

describe('resolveRanges', () => {
  it('handles empty terms array', () => {
    expect(resolveRanges('hello world', [])).toEqual([])
  })

  it('handles term longer than text', () => {
    expect(resolveRanges('hi', ['hello world'])).toEqual([])
  })

  it('handles empty text', () => {
    expect(resolveRanges('', ['foo'])).toEqual([])
  })

  it('handles adjacent ranges without overlap', () => {
    const r = resolveRanges('foo bar', ['foo', 'bar'])
    expect(r).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }])
  })

  it('handles exact text match with single term', () => {
    const r = resolveRanges('abc', ['abc'])
    expect(r).toEqual([{ start: 0, end: 3 }])
  })

  it('deduplicates repeated identical ranges', () => {
    // Searching for same term twice should not double-count
    const r = resolveRanges('hello hello', ['hello', 'hello'])
    // Should have 2 occurrences, not 4
    expect(r).toHaveLength(2)
  })
})

describe('incremental indexing', () => {
  it('addAll adds new items to an existing index', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    // initially "kubernetes" matches nothing
    expect(searchItems(idx, 'kubernetes', map)).toHaveLength(0)

    // add a fresh item
    const fresh: VirtualItem = { id: '99', text: 'Deploying to kubernetes clusters at scale' }
    idx.addAll([fresh])
    const newMap = buildMap([...items, fresh])
    const results = searchItems(idx, 'kubernetes', newMap)
    expect(results.map(r => r.itemId)).toContain('99')
  })

  it('does not duplicate results after incremental add', () => {
    const idx = createSearchIndex(items, ['text'])
    const fresh: VirtualItem = { id: '100', text: 'unique-token-xyz here' }
    idx.addAll([fresh])
    const map = buildMap([...items, fresh])
    const results = searchItems(idx, 'unique-token-xyz', map)
    const ids = results.map(r => r.itemId)
    expect(new Set(ids).size).toBe(ids.length) // no dupes
  })
})

describe('terms end-to-end', () => {
  it('produces resolvable ranges for a match', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'TypeScript', map)
    const match = results.find(r => r.itemId === '3')!
    const terms = match.terms.get('text')!
    const resolved = resolveRanges(items[2].text, terms)
    expect(resolved.length).toBeGreaterThan(0)
    const r = resolved[0]
    expect(items[2].text.slice(r.start, r.end).toLowerCase()).toContain('typescript')
  })
})

describe('index eviction (relied on by useSearchableList to avoid unbounded growth)', () => {
  it('discardAll removes documents from results and permits the id to be re-added', () => {
    const idx = createSearchIndex(items, ['text'])
    expect(idx.search('quick').map(r => r.id)).toContain('1')

    // Wholesale page swap evicts the old ids so the index does not leak.
    idx.discardAll(['1'])
    expect(idx.search('quick').map(r => r.id)).not.toContain('1')

    // A later page may re-introduce the same id — re-adding a discarded id must
    // not throw a duplicate-ID error and must be searchable again.
    expect(() => idx.add({ id: '1', text: 'a quick reintroduction' })).not.toThrow()
    expect(idx.search('quick').map(r => r.id)).toContain('1')
  })
})
