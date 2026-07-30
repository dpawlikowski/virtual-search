import { describe, expect, it } from 'vitest'
import { createSearchIndex, resolveRanges, searchItems } from '../search/miniSearchAdapter'
import type { SearchOptions, VirtualItem } from '../types'

const people: VirtualItem[] = [
  { id: 'white', text: 'Carol White' },
  { id: 'whit', text: 'Sam Whit' },
  { id: 'whittaker', text: 'Jane Whittaker' },
]
const peopleMap = new Map(people.map((item, index) => [item.id, index]))
const peopleIndex = createSearchIndex(people, ['text'])

function peopleSearch(options: SearchOptions = {}) {
  return searchItems(peopleIndex, 'whit', peopleMap, people, ['text'], options)
    .map(result => result.itemId)
    .sort()
}

describe('search mode semantics — typo versus literal prefix', () => {
  it.each([
    ['default: fuzzy + prefix + substring', {}, ['whit', 'white', 'whittaker']],
    ['wholeWord: identical token only', { wholeWord: true }, ['whit']],
    ['exactMatch: literal substring', { exactMatch: true }, ['whit', 'white', 'whittaker']],
    [
      'exactMatch + wholeWord: bounded literal',
      { exactMatch: true, wholeWord: true },
      ['whit'],
    ],
    ['regex: pattern-controlled substring', { regex: true }, ['whit', 'white', 'whittaker']],
  ] satisfies Array<[string, SearchOptions, string[]]>)(
    '%s',
    (_label, options, expected) => {
      expect(peopleSearch(options)).toEqual(expected)
    }
  )

  it.each([
    ['quik', 'Quick'],
    ['wite', 'White'],
  ])('default mode tolerates the misspelling %j for %j, but strict modes do not', (query, text) => {
    const items: VirtualItem[] = [{ id: 'target', text }]
    const map = new Map([['target', 0]])
    const index = createSearchIndex(items, ['text'])
    const search = (options: SearchOptions = {}) =>
      searchItems(index, query, map, items, ['text'], options)

    expect(search()).toHaveLength(1)
    expect(search({ wholeWord: true })).toHaveLength(0)
    expect(search({ exactMatch: true })).toHaveLength(0)
    expect(search({ exactMatch: true, wholeWord: true })).toHaveLength(0)
    expect(search({ regex: true })).toHaveLength(0)
  })
})

describe('search mode semantics — multiple tokens and boundaries', () => {
  const phrases: VirtualItem[] = [
    { id: 'ordered', text: 'Quick brown fox' },
    { id: 'separated', text: 'Brown fox, unusually quick' },
  ]
  const map = new Map(phrases.map((item, index) => [item.id, index]))
  const index = createSearchIndex(phrases, ['text'])
  const ids = (query: string, options: SearchOptions) =>
    searchItems(index, query, map, phrases, ['text'], options)
      .map(result => result.itemId)
      .sort()

  it('wholeWord index mode requires all full tokens, but not adjacency or order', () => {
    expect(ids('quick brown', { wholeWord: true })).toEqual(['ordered', 'separated'])
    expect(ids('brown quick', { wholeWord: true })).toEqual(['ordered', 'separated'])
  })

  it('exactMatch + wholeWord requires one ordered, contiguous phrase', () => {
    expect(ids('quick brown', { exactMatch: true, wholeWord: true })).toEqual(['ordered'])
    expect(ids('brown quick', { exactMatch: true, wholeWord: true })).toEqual([])
  })

  it('uses Unicode letter/number boundaries rather than JavaScript ASCII word boundaries', () => {
    expect(resolveRanges('café cafés café_name', ['café'], false, true)).toEqual([
      { start: 0, end: 4 },
      { start: 11, end: 15 },
    ])
  })
})
