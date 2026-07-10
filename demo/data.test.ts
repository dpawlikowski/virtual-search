import { describe, it, expect } from 'vitest'
import {
  buildEmailItems, buildNewsItems, formatCount,
  EMAIL_COUNT, NEWS_COUNT,
} from './data'

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
