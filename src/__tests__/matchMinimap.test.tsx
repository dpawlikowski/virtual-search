import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { MatchMinimap } from '../components/MatchMinimap'
import type { SearchMatch } from '../types'
import type { Virtualizer } from '@tanstack/react-virtual'

const makeMatch = (id: string, index: number): SearchMatch => ({
  itemId: id, index, score: 1, terms: new Map(),
})

function fakeVirtualizer(
  totalSize: number,
  offsets: Record<number, number>,
  count = 10,
  scrollElement: HTMLDivElement | null = null
) {
  return {
    getTotalSize: () => totalSize,
    getOffsetForIndex: (index: number) =>
      index in offsets ? [offsets[index], 'start'] : undefined,
    options: { count },
    scrollElement,
  } as unknown as Virtualizer<HTMLDivElement, Element>
}

// jsdom never lays anything out, so scrollHeight/clientHeight are just
// regular writable properties on the element in tests, not derived from CSS —
// safe to stub directly.
function fakeScrollElement(scrollTop: number, scrollHeight: number, clientHeight: number): HTMLDivElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true })
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, writable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, writable: true })
  return el
}

describe('MatchMinimap', () => {
  it('renders no markers when there are no matches', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, {})}
        matches={[]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    expect(container.querySelectorAll('.vs-minimap-marker')).toHaveLength(0)
  })

  it('renders no markers when total size is zero', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(0, { 0: 0 })}
        matches={[makeMatch('a', 0)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    expect(container.querySelectorAll('.vs-minimap-marker')).toHaveLength(0)
  })

  it('renders one marker per match, positioned by offset percentage', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500, 9: 900 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5), makeMatch('c', 9)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    expect(markers).toHaveLength(3)
    expect((markers[1] as HTMLElement).style.top).toBe('50%')
    expect((markers[2] as HTMLElement).style.top).toBe('90%')
  })

  it('marks the active match with the active class', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5)]}
        activeMatchIndex={1}
        onJump={() => {}}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    expect(markers[0].className).not.toContain('vs-minimap-marker--active')
    expect(markers[1].className).toContain('vs-minimap-marker--active')
  })

  it('calls onJump with the match index when a marker is clicked', () => {
    const onJump = vi.fn()
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5)]}
        activeMatchIndex={0}
        onJump={onJump}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    fireEvent.click(markers[1])
    expect(onJump).toHaveBeenCalledWith(1)
  })

  it('clicking anywhere on the track jumps to the nearest match, not just exactly on a marker', () => {
    const onJump = vi.fn()
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500, 9: 900 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5), makeMatch('c', 9)]}
        activeMatchIndex={0}
        onJump={onJump}
      />
    )
    const track = container.querySelector('.vs-minimap')!
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      top: 0, height: 1000, left: 0, width: 10, bottom: 1000, right: 10, x: 0, y: 0, toJSON: () => {},
    })
    // Click near the bottom of the track (94% down) — closest to the match at 90%.
    fireEvent.click(track, { clientY: 940 })
    expect(onJump).toHaveBeenCalledWith(2)
  })

  it('clicking a marker does not also trigger the track click handler twice', () => {
    const onJump = vi.fn()
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5)]}
        activeMatchIndex={0}
        onJump={onJump}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    fireEvent.click(markers[1])
    expect(onJump).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledWith(1)
  })

  it('falls back to an even spread (by item index / total item count) when getOffsetForIndex is unavailable', () => {
    const virtualizer = {
      getTotalSize: () => 1000,
      getOffsetForIndex: undefined,
      options: { count: 1000 },
    } as unknown as Virtualizer<HTMLDivElement, Element>
    // A late match (index 900 of 1000 items, 2 total matches) should land
    // near the bottom of the track, not be computed as 900/2 (clamped to 100%).
    const { container } = render(
      <MatchMinimap
        virtualizer={virtualizer}
        matches={[makeMatch('a', 0), makeMatch('b', 900)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    expect(markers).toHaveLength(2)
    expect((markers[1] as HTMLElement).style.top).toBe('90%')
  })
})

describe('MatchMinimap — keyboard accessibility (roving tabindex)', () => {
  it('only one marker is a Tab stop at a time', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500, 9: 900 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5), makeMatch('c', 9)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const markers = Array.from(container.querySelectorAll('.vs-minimap-marker'))
    const tabbable = markers.filter(m => m.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
  })

  it('defaults the Tab stop to the marker containing the active match', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500, 9: 900 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5), makeMatch('c', 9)]}
        activeMatchIndex={1}
        onJump={() => {}}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    expect(markers[1].getAttribute('tabindex')).toBe('0')
    expect(markers[0].getAttribute('tabindex')).toBe('-1')
    expect(markers[2].getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowDown moves focus to the next marker', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500, 9: 900 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5), makeMatch('c', 9)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    act(() => { (markers[0] as HTMLElement).focus() })
    fireEvent.keyDown(markers[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(markers[1])
  })

  it('End moves focus to the last marker, Home back to the first', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500, 9: 900 })}
        matches={[makeMatch('a', 0), makeMatch('b', 5), makeMatch('c', 9)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const markers = container.querySelectorAll('.vs-minimap-marker')
    act(() => { (markers[0] as HTMLElement).focus() })
    fireEvent.keyDown(markers[0], { key: 'End' })
    expect(document.activeElement).toBe(markers[2])
    fireEvent.keyDown(markers[2], { key: 'Home' })
    expect(document.activeElement).toBe(markers[0])
  })
})

describe('MatchMinimap — clustered-bucket wording and sizing', () => {
  // A tiny track height forces many matches into the same pixel bucket —
  // this simulates a long list viewed at low zoom, where "near this
  // position" would overstate how localized the cluster really is.
  function fakeVirtualizerDense(matchCount: number) {
    const offsets: Record<number, number> = {}
    // Same offset for every match index so they all round to the same
    // pixel bucket regardless of the track's resolution.
    for (let i = 0; i < matchCount; i++) offsets[i] = 0
    return fakeVirtualizer(1000, offsets, matchCount)
  }

  it('labels a multi-match bucket as an approximate area, not an exact position', () => {
    const matches = Array.from({ length: 5 }, (_, i) => makeMatch(`m${i}`, i))
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizerDense(5)}
        matches={matches}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const marker = container.querySelector('.vs-minimap-marker')!
    expect(marker.getAttribute('aria-label')).toBe('~5 matches in this area')
  })

  it('keeps the exact "Jump to match" label for a bucket with a single match', () => {
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0 })}
        matches={[makeMatch('a', 0)]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const marker = container.querySelector('.vs-minimap-marker')!
    expect(marker.getAttribute('aria-label')).toBe('Jump to match')
  })

  it('shows the same approximate-area wording in the hover tooltip count', () => {
    const item = { id: 'a', text: 'alpha beta' }
    const matches = [
      { itemId: 'a', index: 0, score: 1, terms: new Map([['text', ['alpha']]]) },
      { itemId: 'b', index: 1, score: 1, terms: new Map() },
      { itemId: 'c', index: 2, score: 1, terms: new Map() },
    ]
    const { container, getByText } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizerDense(3)}
        matches={matches}
        activeMatchIndex={0}
        onJump={() => {}}
        items={[item]}
      />
    )
    const marker = container.querySelector('.vs-minimap-marker')!
    fireEvent.mouseEnter(marker)
    expect(getByText('~3 matches in this area —', { exact: false })).toBeInTheDocument()
  })

  it('renders a taller marker for a bucket with more clustered matches', () => {
    const sparseMatches = [makeMatch('a', 0), makeMatch('b', 5)]
    const { container: sparseContainer } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0, 5: 500 })}
        matches={sparseMatches}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const singleMarkerHeight = parseFloat((sparseContainer.querySelector('.vs-minimap-marker') as HTMLElement).style.height)

    const denseMatches = Array.from({ length: 20 }, (_, i) => makeMatch(`m${i}`, i))
    const { container: denseContainer } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizerDense(20)}
        matches={denseMatches}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const clusterMarkerHeight = parseFloat((denseContainer.querySelector('.vs-minimap-marker') as HTMLElement).style.height)

    expect(clusterMarkerHeight).toBeGreaterThan(singleMarkerHeight)
  })
})

describe('MatchMinimap — scrollbar thumb', () => {
  it('does not render a thumb when the content fits without scrolling', () => {
    const scrollElement = fakeScrollElement(0, 500, 500)
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, {}, 10, scrollElement)}
        matches={[]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    expect(container.querySelector('.vs-minimap-thumb')).toBeNull()
  })

  it('renders a thumb sized and positioned to the real scroll viewport', () => {
    const scrollElement = fakeScrollElement(250, 1000, 250)
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, {}, 10, scrollElement)}
        matches={[]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const thumb = container.querySelector('.vs-minimap-thumb') as HTMLElement
    expect(thumb).not.toBeNull()
    // clientHeight/scrollHeight = 25% tall; scrolled 1/3 of the way down the
    // remaining 750px of scrollable range, into a 75%-tall track.
    expect(thumb.style.height).toBe('25%')
    expect(thumb.style.top).toBe('25%')
  })

  it('updates the thumb position on scroll', () => {
    const scrollElement = fakeScrollElement(0, 1000, 250)
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, {}, 10, scrollElement)}
        matches={[]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    Object.defineProperty(scrollElement, 'scrollTop', { value: 750, writable: true })
    act(() => { fireEvent.scroll(scrollElement) })
    const thumb = container.querySelector('.vs-minimap-thumb') as HTMLElement
    expect(thumb.style.top).toBe('75%')
  })

  it('dragging the thumb scrolls the real container proportionally to track height', () => {
    const scrollElement = fakeScrollElement(0, 1000, 250)
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, {}, 10, scrollElement)}
        matches={[]}
        activeMatchIndex={0}
        onJump={() => {}}
      />
    )
    const track = container.querySelector('.vs-minimap')!
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      top: 0, height: 600, left: 0, width: 10, bottom: 600, right: 10, x: 0, y: 0, toJSON: () => {},
    })
    const thumb = container.querySelector('.vs-minimap-thumb') as HTMLElement
    // ResizeObserver is stubbed to a no-op in tests, so trackHeight stays at
    // its DEFAULT_TRACK_HEIGHT (600) fallback rather than the mocked rect.
    Object.defineProperty(thumb, 'setPointerCapture', { value: vi.fn() })
    Object.defineProperty(thumb, 'hasPointerCapture', { value: () => false })
    Object.defineProperty(thumb, 'releasePointerCapture', { value: vi.fn() })
    fireEvent.pointerDown(thumb, { clientY: 100 })
    fireEvent.pointerMove(thumb, { clientY: 160 })
    // deltaY 60 / trackHeight 600 * scrollHeight 1000 = 100
    expect(scrollElement.scrollTop).toBe(100)
    fireEvent.pointerUp(thumb, { clientY: 160 })
  })

  it('clicking the thumb does not also trigger a track jump', () => {
    const scrollElement = fakeScrollElement(250, 1000, 250)
    const onJump = vi.fn()
    const { container } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 500 }, 10, scrollElement)}
        matches={[makeMatch('a', 0)]}
        activeMatchIndex={0}
        onJump={onJump}
      />
    )
    const thumb = container.querySelector('.vs-minimap-thumb')!
    fireEvent.click(thumb)
    expect(onJump).not.toHaveBeenCalled()
  })
})

describe('MatchMinimap — hover tooltip', () => {
  const item = { id: 'a', text: 'Please review the RFC before Friday' }
  const matchWithTerms = (terms: string[]): SearchMatch => ({
    itemId: 'a', index: 0, score: 1, terms: new Map([['text', terms]]),
  })

  it('shows a snippet with the match bolded on hover, in fuzzy mode regardless of caseSensitive', () => {
    // Fuzzy-mode terms come back lowercased from MiniSearch ('rfc', not 'RFC').
    // caseSensitive must NOT be honored here or the snippet would find nothing.
    const { container, getByText } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0 })}
        matches={[matchWithTerms(['rfc'])]}
        activeMatchIndex={0}
        onJump={() => {}}
        items={[item]}
        searchOptions={{ caseSensitive: true }}
      />
    )
    const marker = container.querySelector('.vs-minimap-marker')!
    fireEvent.mouseEnter(marker)
    expect(getByText('RFC')).toBeInTheDocument()
    expect(getByText('RFC').tagName).toBe('STRONG')
  })

  it('honors caseSensitive for exact-match mode snippets', () => {
    const { container, queryByText } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0 })}
        matches={[matchWithTerms(['rfc'])]}
        activeMatchIndex={0}
        onJump={() => {}}
        items={[item]}
        searchOptions={{ exactMatch: true, caseSensitive: true }}
      />
    )
    const marker = container.querySelector('.vs-minimap-marker')!
    fireEvent.mouseEnter(marker)
    // lowercase 'rfc' should not case-sensitively match 'RFC' in the text
    expect(queryByText('RFC')).not.toBeInTheDocument()
  })

  it('hides the tooltip on mouse leave', () => {
    const { container, queryByText } = render(
      <MatchMinimap
        virtualizer={fakeVirtualizer(1000, { 0: 0 })}
        matches={[matchWithTerms(['rfc'])]}
        activeMatchIndex={0}
        onJump={() => {}}
        items={[item]}
      />
    )
    const marker = container.querySelector('.vs-minimap-marker')!
    fireEvent.mouseEnter(marker)
    expect(queryByText('RFC')).toBeInTheDocument()
    fireEvent.mouseLeave(marker)
    expect(queryByText('RFC')).not.toBeInTheDocument()
  })
})
