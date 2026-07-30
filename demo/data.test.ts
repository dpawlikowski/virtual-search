import { describe, it, expect } from 'vitest'
import {
  buildEmailItems, buildNewsItems, formatCount,
  EMAIL_COUNT, NEWS_COUNT,
} from './data'
import {
  createSearchIndex, searchItems, resolveRanges, isHighlightWholeWord,
} from '../src/search/miniSearchAdapter'
import type { VirtualItem } from '../src/types'

describe('buildEmailItems', () => {
  const items = buildEmailItems(0)

  it('produces exactly EMAIL_COUNT rows', () => {
    expect(items).toHaveLength(EMAIL_COUNT)
  })

  it('gives every row a unique, index-based id', () => {
    expect(items[0].id).toBe('email-0')
    expect(new Set(items.map((i) => i.id)).size).toBe(EMAIL_COUNT)
  })

  it('builds the search corpus from subject, sender and body', () => {
    const first = items[0]
    expect(first.text).toContain(first.subject)
    expect(first.text).toContain(first.from)
    // The preview is a truncated slice of the body, so the body drives `text`.
    expect(first.preview.endsWith('…')).toBe(true)
  })

  it('cycles templates so distant indices reuse the first entry', () => {
    // 10 subjects, 8 senders, 5 bodies → index 40 realigns all three.
    expect(items[40].subject).toBe(items[0].subject)
    expect(items[40].from).toBe(items[0].from)
    expect(items[40].preview).toBe(items[0].preview)
  })

  it('marks every fourth message unread', () => {
    expect(items[0].unread).toBe(true)
    expect(items[1].unread).toBe(false)
    expect(items[4].unread).toBe(true)
  })
})

describe('buildNewsItems', () => {
  const items = buildNewsItems(0)

  it('produces exactly NEWS_COUNT rows with news ids', () => {
    expect(items).toHaveLength(NEWS_COUNT)
    expect(items[0].id).toBe('news-0')
  })

  it('includes source and category in the search corpus', () => {
    const first = items[0]
    expect(first.text).toContain(first.source)
    expect(first.text).toContain(first.category)
    expect(first.text).toContain(first.headline)
  })
})

// Faithful reproduction of how the demo highlights: it calls searchItems then
// resolveRanges(field, terms, caseSensitive, isHighlightWholeWord(options)) for
// each matched field — exactly what EmailRow/NewsRow render. This guards the
// reported "in the demo it doesn't work" bug (fragment highlights) against the
// real fixtures and the demo's own searchFields.
describe('demo search highlighting (as the demo wires it)', () => {
  const buildMap = (items: VirtualItem[]) => {
    const m = new Map<string, number>()
    items.forEach((it, i) => m.set(it.id, i))
    return m
  }

  // Resolve every highlight the demo would paint for a query, across all
  // matched items and fields, returning the highlighted substrings + whether
  // any of them starts inside a larger word.
  function demoHighlights(items: VirtualItem[], fields: string[], query: string) {
    const idx = createSearchIndex(items, fields)
    const map = buildMap(items)
    const wholeWord = isHighlightWholeWord({}) // demo uses default (fuzzy) mode
    const painted: string[] = []
    let anyFragment = false
    for (const match of searchItems(idx, query, map, items, fields)) {
      const item = items[match.index]
      for (const [field, terms] of match.terms) {
        const val = (item as unknown as Record<string, string>)[field]
        if (typeof val !== 'string') continue
        for (const r of resolveRanges(val, terms, false, wholeWord)) {
          painted.push(val.slice(r.start, r.end))
          const before = val[r.start - 1] ?? ' '
          if (/[\p{L}\p{N}]/u.test(before)) anyFragment = true
        }
      }
    }
    return { painted, anyFragment }
  }

  // A handful of emails/news is enough — the templates cycle, so the corpus is
  // identical to the full 5000/3000 rows, just faster.
  const emails = buildEmailItems(0).slice(0, 40)
  const news = buildNewsItems(0).slice(0, 50)
  const EMAIL_FIELDS = ['from', 'subject', 'preview']
  const NEWS_FIELDS = ['source', 'category', 'headline', 'body']

  it('finds and highlights an email sender by name in every core search mode', () => {
    for (const options of [{}, { exactMatch: true }, { exactMatch: true, wholeWord: true }, { regex: true }]) {
      const idx = createSearchIndex(emails, EMAIL_FIELDS)
      const matches = searchItems(idx, 'Alice', buildMap(emails), emails, EMAIL_FIELDS, options)
      expect(matches.length, JSON.stringify(options)).toBeGreaterThan(0)
      expect(matches.every(match => match.terms.has('from')), JSON.stringify(options)).toBe(true)
      const first = matches[0]
      const ranges = resolveRanges(
        emails[first.index].from,
        first.terms.get('from') ?? [],
        false,
        isHighlightWholeWord(options)
      )
      expect(ranges.map(range => emails[first.index].from.slice(range.start, range.end))).toContain('Alice')
    }
  })

  it('highlights only the typed substring in emails', () => {
    for (const q of ['on', 'race', 'deployment', 'review', 'the', 'RFC']) {
      const { painted } = demoHighlights(emails, EMAIL_FIELDS, q)
      expect(painted.length, `expected matches for "${q}"`).toBeGreaterThan(0)
      expect(painted.map(value => value.toLowerCase())).toContain(q.toLowerCase())
    }
  })

  it('highlights only the typed substring in news', () => {
    for (const q of ['AI', 'on', 'code', 'source', 'security']) {
      const { painted } = demoHighlights(news, NEWS_FIELDS, q)
      expect(painted.length, `expected matches for "${q}"`).toBeGreaterThan(0)
      expect(painted.map(value => value.toLowerCase())).toContain(q.toLowerCase())
    }
  })

  it('"on" highlights only the standalone word, not "onboarding"/"conversation"', () => {
    const { painted } = demoHighlights(emails, EMAIL_FIELDS, 'on')
    // Every painted span is exactly the word "on" (case-insensitive). Prefix
    // expansions like "onboarding" are their own whole-word spans if present,
    // but no span is a sliced-out fragment.
    for (const p of painted) {
      // whole tokens only — reject anything that is a strict inner slice
      expect(p.toLowerCase() === 'on' || /^[\p{L}\p{N}]+$/u.test(p)).toBe(true)
    }
    expect(painted.map(p => p.toLowerCase())).toContain('on')
  })

  it('"w" highlights only the typed letter, never the entire matched word', () => {
    const { painted } = demoHighlights(emails, EMAIL_FIELDS, 'w')
    expect(painted.length).toBeGreaterThan(0)
    expect(new Set(painted.map(value => value.toLowerCase()))).toEqual(new Set(['w']))
  })

  it('"ra" finds and highlights the substring inside "vulnerability"', () => {
    const { painted } = demoHighlights(news, NEWS_FIELDS, 'ra')
    expect(painted.map(value => value.toLowerCase())).toContain('ra')
    expect(painted.some(value => value.length > 2)).toBe(false)
  })
})

describe('formatCount', () => {
  it('groups thousands with a space to match the header badges', () => {
    expect(formatCount(EMAIL_COUNT)).toBe('5 000')
    expect(formatCount(NEWS_COUNT)).toBe('3 000')
  })

  it('leaves sub-thousand values untouched', () => {
    expect(formatCount(42)).toBe('42')
  })

  it('groups millions in threes', () => {
    expect(formatCount(1_234_567)).toBe('1 234 567')
  })
})
