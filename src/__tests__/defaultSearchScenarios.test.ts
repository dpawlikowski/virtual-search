import { describe, expect, it } from 'vitest'
import { createSearchIndex, resolveRanges, searchItems } from '../search/miniSearchAdapter'
import type { VirtualItem } from '../types'

interface Item extends VirtualItem {
  title: string
  body: string
}

const items: Item[] = [
  { id: '1', text: '', title: 'Critical vulnerability', body: 'VULNERABILITY allows remote access' },
  { id: '2', text: '', title: 'Rapid adoption', body: 'paragraph and graph' },
  { id: '3', text: '', title: 'Zażółć gęślą', body: 'CAFÉ café cafés' },
  { id: '4', text: '', title: 'Pricing', body: 'price: $42.50 — limited offer' },
  { id: '5', text: '', title: 'Quick start', body: 'the quick brown fox' },
]
const fields = ['title', 'body']
const map = new Map(items.map((item, index) => [item.id, index]))

function search(query: string, options = {}) {
  return searchItems(createSearchIndex(items, fields), query, map, items, fields, options)
}

function highlighted(item: Item, query: string): string[] {
  const match = search(query).find(result => result.itemId === item.id)
  if (!match) return []
  return Array.from(match.terms).flatMap(([field, terms]) => {
    const value = item[field as 'title' | 'body']
    return resolveRanges(value, terms).map(range => value.slice(range.start, range.end))
  })
}

describe('default search — literal substring coverage', () => {
  it.each([
    ['Cri', '1'],
    ['ra', '1'],
    ['ity', '1'],
    ['pid', '2'],
    ['graph', '2'],
  ])('finds "%s" at the start, middle or end of a token', (query, id) => {
    expect(search(query).map(result => result.itemId)).toContain(id)
  })

  it('is case-insensitive and highlights the original casing', () => {
    expect(highlighted(items[0], 'vulnerability')).toEqual([
      'vulnerability',
      'VULNERABILITY',
    ])
  })

  it('returns all literal occurrences without expanding them to whole words', () => {
    expect(highlighted(items[1], 'ra')).toEqual(['Ra', 'ra', 'ra', 'ra'])
  })

  it('matches independently across every configured field', () => {
    const match = search('ra').find(result => result.itemId === '2')!
    expect(Array.from(match.terms.keys()).sort()).toEqual(['body', 'title'])
  })

  it('does not duplicate an item found by both MiniSearch and substring search', () => {
    const results = search('rapid')
    expect(results.filter(result => result.itemId === '2')).toHaveLength(1)
    expect(results.find(result => result.itemId === '2')?.terms.get('title')).toEqual(['rapid'])
  })

  it('supports a literal multi-word substring while preserving fuzzy terms across fields', () => {
    expect(search('quick brown').map(result => result.itemId)).toContain('5')
    expect(highlighted(items[4], 'quick brown')).toEqual(['Quick', 'quick brown'])
  })

  it('supports punctuation without interpreting it as regex', () => {
    expect(search('$42.50').map(result => result.itemId)).toEqual(['4'])
    expect(highlighted(items[3], '$42.50')).toEqual(['$42.50'])
  })

  it('supports Unicode and accented text case-insensitively', () => {
    expect(search('żół').map(result => result.itemId)).toContain('3')
    expect(highlighted(items[2], 'café')).toEqual(['CAFÉ', 'café', 'café'])
  })

  it('trims surrounding whitespace before matching and highlighting', () => {
    expect(search('  ra  ').map(result => result.itemId)).toEqual(search('ra').map(result => result.itemId))
  })
})

describe('default search — other modes remain isolated', () => {
  it('keeps fuzzy matching for a typo with no literal substring', () => {
    const results = search('quik')
    expect(results.map(result => result.itemId)).toContain('5')
    const match = results.find(result => result.itemId === '5')!
    expect(match.terms.get('body')).toContain('quick')
  })

  it('wholeWord excludes an infix-only substring', () => {
    expect(search('ra', { wholeWord: true })).toHaveLength(0)
  })

  it('exactMatch still performs literal substring matching only', () => {
    expect(search('ra', { exactMatch: true }).map(result => result.itemId).sort()).toEqual(['1', '2'])
    expect(search('quik', { exactMatch: true })).toHaveLength(0)
  })

  it('regex mode interprets syntax and does not add literal supplemental matches', () => {
    expect(search('vuln.*ity', { regex: true }).map(result => result.itemId)).toEqual(['1'])
    expect(search('[', { regex: true })).toHaveLength(0)
  })

  it('regex and exact caseSensitive behavior is unchanged', () => {
    expect(search('VULNERABILITY', { exactMatch: true, caseSensitive: true }).map(r => r.itemId)).toEqual(['1'])
    expect(search('vulnerability', { regex: true, caseSensitive: true }).map(r => r.itemId)).toEqual(['1'])
  })
})

describe('exactMatch — scenario matrix', () => {
  it.each([
    ['ra', {}, ['1', '2']],
    ['VULNERABILITY', {}, ['1']],
    ['VULNERABILITY', { caseSensitive: true }, ['1']],
    ['vulnerability', { caseSensitive: true }, ['1']],
    ['Vulnerability', { caseSensitive: true }, []],
    ['café', {}, ['3']],
    ['CAFÉ', { caseSensitive: true }, ['3']],
    ['cafés', {}, ['3']],
    ['$42.50', {}, ['4']],
    ['quick brown', {}, ['5']],
    ['QUICK BROWN', { caseSensitive: true }, []],
    ['quik', {}, []],
  ])('query %j with options %j returns %j', (query, extra, expected) => {
    expect(search(query, { exactMatch: true, ...extra }).map(result => result.itemId).sort())
      .toEqual(expected)
  })

  it.each([
    ['vulnerability', ['1']],
    ['VULNERABILITY', ['1']],
    ['ra', []],
    ['vulnerabil', []],
    ['café', ['3']],
    ['cafés', ['3']],
    ['$42.50', ['4']],
    ['quick brown', ['5']],
  ])('exact + wholeWord query %j returns %j', (query, expected) => {
    expect(search(query, { exactMatch: true, wholeWord: true }).map(result => result.itemId).sort())
      .toEqual(expected)
  })
})

describe('wholeWord fuzzy mode — scenario matrix', () => {
  it.each([
    ['vulnerability', ['1']],
    ['ra', []],
    ['rapid', ['2']],
    ['rap', []],
    ['quick', ['5']],
    ['café', ['3']],
    ['$42.50', ['4']],
    ['missing', []],
  ])('query %j returns %j', (query, expected) => {
    expect(search(query, { wholeWord: true }).map(result => result.itemId).sort())
      .toEqual(expected)
  })
})

describe('regex — scenario matrix', () => {
  it.each([
    ['vuln.*ity', {}, ['1']],
    ['^Critical', {}, ['1']],
    ['access$', {}, ['1']],
    ['^(Rapid|Quick)', {}, ['2', '5']],
    ['gr(a|á)ph', {}, ['2']],
    ['CAFÉ', {}, ['3']],
    ['CAFÉ', { caseSensitive: true }, ['3']],
    ['café', { caseSensitive: true }, ['3']],
    ['\\$\\d+\\.\\d{2}', {}, ['4']],
    ['quick\\s+brown', {}, ['5']],
    ['(?<=remote\\s)access', {}, ['1']],
    ['VULNERABILITY', { caseSensitive: true }, ['1']],
    ['Vulnerability', { caseSensitive: true }, []],
    ['[', {}, []],
    ['x*', {}, ['5']],
  ])('pattern %j with options %j returns %j', (query, extra, expected) => {
    expect(search(query, { regex: true, ...extra }).map(result => result.itemId).sort())
      .toEqual(expected)
  })

  it('records every non-empty regex occurrence for highlighting', () => {
    const result = search('ra', { regex: true }).find(match => match.itemId === '2')!
    expect(result.terms.get('body')).toEqual(['ra'])
    expect(resolveRanges(items[1].body, result.terms.get('body') ?? []).map(range =>
      items[1].body.slice(range.start, range.end)
    )).toEqual(['ra', 'ra', 'ra'])
  })
})
