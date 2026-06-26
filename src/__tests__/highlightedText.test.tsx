import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { HighlightedText } from '../components/HighlightedText'

describe('HighlightedText', () => {
  it('renders plain text when no ranges', () => {
    const { container } = render(<HighlightedText text="hello world" ranges={undefined} />)
    expect(container.textContent).toBe('hello world')
    expect(container.querySelectorAll('mark')).toHaveLength(0)
  })

  it('renders plain text when empty ranges', () => {
    const { container } = render(<HighlightedText text="hello world" ranges={[]} />)
    expect(container.textContent).toBe('hello world')
    expect(container.querySelectorAll('mark')).toHaveLength(0)
  })

  it('highlights single range', () => {
    const { container } = render(
      <HighlightedText text="hello world" ranges={[{ start: 6, end: 11 }]} />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe('world')
    expect(container.textContent).toBe('hello world')
  })

  it('highlights multiple non-adjacent ranges', () => {
    const { container } = render(
      <HighlightedText text="foo bar baz" ranges={[{ start: 0, end: 3 }, { start: 8, end: 11 }]} />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks[0].textContent).toBe('foo')
    expect(marks[1].textContent).toBe('baz')
  })

  it('preserves full text content', () => {
    const text = 'The quick brown fox'
    const { container } = render(
      <HighlightedText text={text} ranges={[{ start: 4, end: 9 }]} />
    )
    expect(container.textContent).toBe(text)
  })

  it('applies custom highlightClassName', () => {
    const { container } = render(
      <HighlightedText text="hello" ranges={[{ start: 0, end: 5 }]} highlightClassName="my-mark" />
    )
    expect(container.querySelector('.my-mark')).toBeTruthy()
  })

  it('applies active class to activeRangeIndex', () => {
    const { container } = render(
      <HighlightedText
        text="foo bar"
        ranges={[{ start: 0, end: 3 }, { start: 4, end: 7 }]}
        activeRangeIndex={1}
      />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks[1].classList.contains('vs-highlight--active')).toBe(true)
    expect(marks[0].classList.contains('vs-highlight--active')).toBe(false)
  })

  it('handles range at very start of text', () => {
    const { container } = render(
      <HighlightedText text="abc" ranges={[{ start: 0, end: 1 }]} />
    )
    expect(container.querySelector('mark')?.textContent).toBe('a')
  })

  it('handles range at very end of text', () => {
    const { container } = render(
      <HighlightedText text="abc" ranges={[{ start: 2, end: 3 }]} />
    )
    expect(container.querySelector('mark')?.textContent).toBe('c')
  })
})
