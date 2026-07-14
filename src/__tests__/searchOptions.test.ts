import { describe, it, expect } from 'vitest'
import { createSearchIndex, searchItems, resolveRanges, isHighlightCaseSensitive, buildMatchSnippet } from '../search/miniSearchAdapter'
import type { VirtualItem } from '../types'

const items: VirtualItem[] = [
  { id: '1', text: 'The quick brown FOX jumps over the lazy dog' },
  { id: '2', text: 'fox hunting season starts in fall' },
  { id: '3', text: 'price: $42.50 — limited offer' },
  { id: '4', text: 'no relevant content here' },
]

const buildMap = (items: VirtualItem[]) => {
  const m = new Map<string, number>()
  items.forEach((it, i) => m.set(it.id, i))
  return m
}

describe('searchItems — regex mode', () => {
  it('matches a pattern case-insensitively by default', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'fox', map, items, ['text'], { regex: true })
    expect(results.map(r => r.itemId).sort()).toEqual(['1', '2'])
  })

  it('respects caseSensitive: true', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'FOX', map, items, ['text'], { regex: true, caseSensitive: true })
    expect(results.map(r => r.itemId)).toEqual(['1'])
  })

  it('supports actual regex syntax', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, '\\$\\d+\\.\\d+', map, items, ['text'], { regex: true })
    expect(results.map(r => r.itemId)).toEqual(['3'])
  })

  it('returns no matches (not a throw) for an invalid pattern', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    expect(() => searchItems(idx, '(unclosed', map, items, ['text'], { regex: true })).not.toThrow()
    expect(searchItems(idx, '(unclosed', map, items, ['text'], { regex: true })).toEqual([])
  })

  it('ignores zero-length matches instead of flagging every item', () => {
    // None of the items contain "9" — `9*` only ever zero-width matches.
    // A naive implementation that counts zero-length matches would flag
    // every item as a result.
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, '9*', map, items, ['text'], { regex: true })
    expect(results).toHaveLength(0)
  })

  it('results are sorted by item index, not score', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'fox', map, items, ['text'], { regex: true })
    expect(results.map(r => r.index)).toEqual([0, 1])
  })
})

describe('searchItems — exact match mode', () => {
  it('matches a literal substring case-insensitively by default', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'fox', map, items, ['text'], { exactMatch: true })
    expect(results.map(r => r.itemId).sort()).toEqual(['1', '2'])
  })

  it('respects caseSensitive: true', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'FOX', map, items, ['text'], { exactMatch: true, caseSensitive: true })
    expect(results.map(r => r.itemId)).toEqual(['1'])
  })

  it('does not fuzzy/prefix match — requires the literal substring', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    // 'quik' would fuzzy-match 'quick' in normal mode, but not exact mode
    const results = searchItems(idx, 'quik', map, items, ['text'], { exactMatch: true })
    expect(results).toHaveLength(0)
  })

  it('terms feed back into resolveRanges to produce highlight ranges', () => {
    const idx = createSearchIndex(items, ['text'])
    const map = buildMap(items)
    const results = searchItems(idx, 'fox', map, items, ['text'], { exactMatch: true })
    const match = results.find(r => r.itemId === '1')!
    const ranges = resolveRanges(items[0].text, match.terms.get('text')!, false)
    expect(ranges.length).toBeGreaterThan(0)
  })
})

describe('searchItems — whole word mode', () => {
  const wwItems: VirtualItem[] = [
    { id: '1', text: 'cat catalog category concatenate' },
    { id: '2', text: 'no relevant content here' },
  ]
  const map = new Map(wwItems.map((it, i) => [it.id, i]))

  it('exact mode: matches only the whole word, not substrings inside longer words', () => {
    const idx = createSearchIndex(wwItems, ['text'])
    const results = searchItems(idx, 'cat', map, wwItems, ['text'], { exactMatch: true, wholeWord: true })
    expect(results.map(r => r.itemId)).toEqual(['1'])
    const terms = results[0].terms.get('text')!
    const ranges = resolveRanges(wwItems[0].text, terms, false, true)
    // Only the standalone "cat" (index 0-3), not "catalog"/"category"/"concatenate".
    expect(ranges).toEqual([{ start: 0, end: 3 }])
  })

  it('resolveRanges without wholeWord highlights substrings inside longer words too', () => {
    const ranges = resolveRanges('cat catalog', ['cat'])
    expect(ranges.length).toBeGreaterThan(1)
  })

  it('exact mode without wholeWord matches substrings inside longer words too', () => {
    const idx = createSearchIndex(wwItems, ['text'])
    const results = searchItems(idx, 'cat', map, wwItems, ['text'], { exactMatch: true })
    expect(results.map(r => r.itemId)).toEqual(['1'])
  })

  it('fuzzy mode: wholeWord disables prefix matching', () => {
    const idx = createSearchIndex(wwItems, ['text'])
    // 'catal' is a prefix of 'catalog' — matches by default (prefix: true)...
    const withPrefix = searchItems(idx, 'catal', map, wwItems, ['text'])
    expect(withPrefix.map(r => r.itemId)).toContain('1')
    // ...but not when wholeWord disables prefix matching.
    const wholeWordOnly = searchItems(idx, 'catal', map, wwItems, ['text'], { wholeWord: true })
    expect(wholeWordOnly).toHaveLength(0)
  })

  it('fuzzy mode: wholeWord still matches a query equal to a full token', () => {
    const idx = createSearchIndex(wwItems, ['text'])
    const results = searchItems(idx, 'cat', map, wwItems, ['text'], { wholeWord: true })
    expect(results.map(r => r.itemId)).toContain('1')
  })
})

describe('isHighlightCaseSensitive', () => {
  it('is false for fuzzy mode even when caseSensitive is requested', () => {
    // MiniSearch's fuzzy/prefix terms are lowercased internally — honoring
    // caseSensitive here would make highlighting always find nothing.
    expect(isHighlightCaseSensitive({ caseSensitive: true })).toBe(false)
  })

  it('is true for regex mode with caseSensitive', () => {
    expect(isHighlightCaseSensitive({ regex: true, caseSensitive: true })).toBe(true)
  })

  it('is true for exactMatch mode with caseSensitive', () => {
    expect(isHighlightCaseSensitive({ exactMatch: true, caseSensitive: true })).toBe(true)
  })

  it('is false when caseSensitive is not requested, regardless of mode', () => {
    expect(isHighlightCaseSensitive({ regex: true })).toBe(false)
    expect(isHighlightCaseSensitive({ exactMatch: true })).toBe(false)
    expect(isHighlightCaseSensitive({})).toBe(false)
  })
})

describe('buildMatchSnippet', () => {
  it('returns null when no term matches', () => {
    expect(buildMatchSnippet('hello world', ['xyz'])).toBeNull()
  })

  it('returns before/match/after around the first occurrence', () => {
    const snippet = buildMatchSnippet('the quick brown fox jumps', ['fox'])
    expect(snippet).not.toBeNull()
    expect(snippet!.match).toBe('fox')
    expect(snippet!.before.endsWith('brown ')).toBe(true)
    expect(snippet!.after.startsWith(' jumps')).toBe(true)
  })

  it('prefixes with an ellipsis when context is truncated', () => {
    const text = 'x'.repeat(50) + 'TARGET' + 'y'.repeat(50)
    const snippet = buildMatchSnippet(text, ['TARGET'], true, false, 10)
    expect(snippet!.before.startsWith('…')).toBe(true)
    expect(snippet!.after.endsWith('…')).toBe(true)
  })

  it('does not prefix/suffix an ellipsis when the match is near the text edges', () => {
    const snippet = buildMatchSnippet('TARGET right at the start', ['TARGET'])
    expect(snippet!.before).toBe('')
  })
})

describe('resolveRanges — caseSensitive flag', () => {
  it('only matches the given case when caseSensitive is true', () => {
    const ranges = resolveRanges('Fox and fox', ['fox'], true)
    expect(ranges).toEqual([{ start: 8, end: 11 }])
  })

  it('matches both cases when caseSensitive is false (default)', () => {
    const ranges = resolveRanges('Fox and fox', ['fox'])
    expect(ranges).toHaveLength(2)
  })
})
