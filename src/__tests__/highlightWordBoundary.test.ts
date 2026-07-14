import { describe, it, expect } from 'vitest'
import {
  createSearchIndex,
  searchItems,
  resolveRanges,
  buildMatchSnippet,
  isHighlightWholeWord,
} from '../search/miniSearchAdapter'
import type { VirtualItem, SearchOptions } from '../types'

// Regression suite for the highlight bug: fuzzy/prefix search matches on
// whole-word *tokens*, but highlighting used to re-locate those tokens as raw
// substrings — so searching "on" smeared a highlight across the "on" inside
// "onboarding", "conversation", "hydration", etc. (highlighting things it
// shouldn't) while the actual word stayed lost in the noise.

const buildMap = (items: VirtualItem[]) => {
  const m = new Map<string, number>()
  items.forEach((it, i) => m.set(it.id, i))
  return m
}

describe('resolveRanges — whole-word (fuzzy/prefix) highlighting', () => {
  it('does NOT highlight a token inside a larger word', () => {
    // "on" must not match the "on" inside "conversation".
    const text = 'Turn on the conversation'
    expect(resolveRanges(text, ['on'], false, /*wholeWord*/ true)).toEqual([
      { start: 5, end: 7 },
    ])
  })

  it('still highlights every standalone occurrence of the token', () => {
    const text = 'on and on and on'
    expect(resolveRanges(text, ['on'], false, true)).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 9 },
      { start: 14, end: 16 },
    ])
  })

  it('highlights the whole matched word for a prefix-expanded token', () => {
    // A prefix search for "deploy" yields the token "deployment"; the whole
    // word is highlighted, not just the typed prefix, and not a fragment.
    const text = 'The deployment pipeline is deployed'
    expect(resolveRanges(text, ['deployment'], false, true)).toEqual([
      { start: 4, end: 14 },
    ])
  })

  it('bounds on punctuation, not just spaces (matches MiniSearch tokenizing)', () => {
    const text = 'state-of-the-art, state machine'
    // "state" is a standalone token in "state-of-the-art" (hyphen is a boundary)
    // and again before "machine".
    expect(resolveRanges(text, ['state'], false, true)).toEqual([
      { start: 0, end: 5 },
      { start: 18, end: 23 },
    ])
  })

  it('bounds accented words correctly (\\b would fail here)', () => {
    // The old ASCII `\b` refused to bound a term ending in a non-ASCII letter,
    // so "café" would not highlight at all in whole-word mode.
    expect(resolveRanges('a café and cafés', ['café'], false, true)).toEqual([
      { start: 2, end: 6 },
    ])
  })

  it('is case-insensitive by default in whole-word mode', () => {
    expect(resolveRanges('RFC and rfc', ['rfc'], false, true)).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
  })

  it('substring mode (exact match) still highlights inside larger words', () => {
    // wholeWord=false is the exact-substring path — searching "state" as an
    // exact substring legitimately highlights it inside "statement".
    expect(resolveRanges('a statement', ['state'], false, /*wholeWord*/ false)).toEqual([
      { start: 2, end: 7 },
    ])
  })
})

describe('isHighlightWholeWord — mode policy', () => {
  const cases: Array<[string, SearchOptions, boolean]> = [
    ['fuzzy/prefix (default) is always word-bounded', {}, true],
    ['fuzzy + wholeWord toggle stays word-bounded', { wholeWord: true }, true],
    ['exact match is substring by default', { exactMatch: true }, false],
    ['exact match + wholeWord bounds', { exactMatch: true, wholeWord: true }, true],
    ['regex never bounds (pattern owns boundaries)', { regex: true }, false],
    ['regex + wholeWord still never bounds', { regex: true, wholeWord: true }, false],
  ]
  for (const [name, options, expected] of cases) {
    it(name, () => expect(isHighlightWholeWord(options)).toBe(expected))
  }
})

describe('end-to-end: fuzzy search terms resolve without bleed', () => {
  const items: VirtualItem[] = [
    { id: '1', text: 'Design review feedback on the new onboarding flow' },
    { id: '2', text: 'I followed up on our conversation about hydration' },
    { id: '3', text: 'Nothing relevant here at all' },
  ]

  it('searching "on" highlights the standalone word (and prefix "onboarding"), never a fragment', () => {
    const idx = createSearchIndex(items, ['text'])
    const results = searchItems(idx, 'on', buildMap(items))
    const wholeWord = isHighlightWholeWord({}) // fuzzy default → true

    for (const match of results) {
      const item = items[match.index]
      for (const [field, terms] of match.terms) {
        const val = (item as unknown as Record<string, string>)[field]
        const ranges = resolveRanges(val, terms, false, wholeWord)
        // Every produced range must land on a real word boundary — never a
        // fragment carved out of a bigger word like "conversation"/"onboarding".
        for (const r of ranges) {
          const before = val[r.start - 1] ?? ' '
          const after = val[r.end] ?? ' '
          const insideWord = /[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)
          expect(insideWord, `"${val.slice(r.start, r.end)}" in "${val}"`).toBe(false)
        }
      }
    }
  })

  it('item 2 highlights only the standalone "on", not the "on" in "conversation"/"hydration"', () => {
    const idx = createSearchIndex(items, ['text'])
    const results = searchItems(idx, 'on', buildMap(items))
    const match = results.find(r => r.itemId === '2')!
    const terms = match.terms.get('text')!
    const ranges = resolveRanges(items[1].text, terms, false, true)
    const matched = ranges.map(r => items[1].text.slice(r.start, r.end))
    expect(matched).toEqual(['on'])
  })
})

describe('exact match + wholeWord — matching honors unicode boundaries', () => {
  const items: VirtualItem[] = [
    { id: '1', text: 'a café here' },
    { id: '2', text: 'cafeteria only' },
  ]

  it('finds the accented whole word and excludes the unrelated "cafe" prefix', () => {
    const idx = createSearchIndex(items, ['text'])
    const results = searchItems(
      idx, 'café', buildMap(items), items, ['text'],
      { exactMatch: true, wholeWord: true }
    )
    expect(results.map(r => r.itemId)).toEqual(['1'])
  })
})

describe('buildMatchSnippet — respects whole-word highlighting', () => {
  it('anchors the snippet on the real word, not a fragment', () => {
    const text = 'I followed up on our conversation today'
    // Without wholeWord, the first "on" occurrence is inside "conversation"...
    const snippet = buildMatchSnippet(text, ['on'], false, /*wholeWord*/ true)
    expect(snippet).not.toBeNull()
    expect(snippet!.match).toBe('on')
    // The standalone "on" comes before "our"; the fragment inside
    // "conversation" comes after it — so the whole-word snippet must sit here.
    expect(snippet!.after.startsWith(' our')).toBe(true)
  })
})
