import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { HighlightedText } from '../components/HighlightedText'

describe('HighlightedText — edge cases', () => {
  it('activeRangeIndex=0 marks first range as active', () => {
    const { container } = render(
      <HighlightedText
        text="foo bar"
        ranges={[{ start: 0, end: 3 }, { start: 4, end: 7 }]}
        activeRangeIndex={0}
      />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks[0].classList.contains('vs-highlight--active')).toBe(true)
    expect(marks[1].classList.contains('vs-highlight--active')).toBe(false)
  })

  it('no activeRangeIndex means no mark has active class', () => {
    const { container } = render(
      <HighlightedText text="hello" ranges={[{ start: 0, end: 5 }]} />
    )
    expect(container.querySelector('.vs-highlight--active')).toBeNull()
  })

  it('range spanning entire text produces one mark and no surrounding spans', () => {
    const { container } = render(
      <HighlightedText text="abc" ranges={[{ start: 0, end: 3 }]} />
    )
    expect(container.querySelector('mark')?.textContent).toBe('abc')
    expect(container.querySelectorAll('span')).toHaveLength(0)
  })

  it('custom highlightClassName applied to active mark as well', () => {
    const { container } = render(
      <HighlightedText
        text="hello"
        ranges={[{ start: 0, end: 5 }]}
        highlightClassName="custom-mark"
        activeRangeIndex={0}
      />
    )
    const mark = container.querySelector('mark')!
    expect(mark.classList.contains('custom-mark')).toBe(true)
    expect(mark.classList.contains('custom-mark--active')).toBe(true)
  })

  it('data-vs-highlight-index attribute set correctly', () => {
    const { container } = render(
      <HighlightedText
        text="foo bar baz"
        ranges={[{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 }]}
      />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks[0].getAttribute('data-vs-highlight-index')).toBe('0')
    expect(marks[1].getAttribute('data-vs-highlight-index')).toBe('1')
    expect(marks[2].getAttribute('data-vs-highlight-index')).toBe('2')
  })

  it('renders empty string text without crashing', () => {
    const { container } = render(<HighlightedText text="" ranges={[]} />)
    expect(container.textContent).toBe('')
  })

  it('range with identical start and end renders empty mark without crashing', () => {
    const { container } = render(
      <HighlightedText text="abc" ranges={[{ start: 1, end: 1 }]} />
    )
    // Empty range — mark exists but has no text content
    const marks = container.querySelectorAll('mark')
    expect(marks[0].textContent).toBe('')
    expect(container.textContent).toBe('abc')
  })
})
