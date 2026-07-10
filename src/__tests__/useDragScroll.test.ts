import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { useDragScroll } from '../hooks/useDragScroll'

const TRACK_HEIGHT = 300

/** Builds a fake scroll element with the given viewport geometry. */
function scrollElement(geom: { scrollTop: number; scrollHeight: number; clientHeight: number }): HTMLElement {
  return {
    ...geom,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLElement
}

function virtualizerWith(scrollEl: HTMLElement | null): Virtualizer<HTMLDivElement, Element> {
  return { scrollElement: scrollEl } as unknown as Virtualizer<HTMLDivElement, Element>
}

/**
 * Renders the hook with a *stable* virtualizer reference. The real
 * `useVirtualizer` returns one persistent instance, so the virtualizer passed
 * here must not be re-created on every render — otherwise the hook's
 * `[virtualizer]` effect re-runs each render, calls `setViewport`, and spins
 * into an infinite re-render loop.
 */
function renderDragScroll(scrollEl: HTMLElement | null) {
  const virtualizer = virtualizerWith(scrollEl)
  return renderHook(() => useDragScroll(virtualizer, TRACK_HEIGHT))
}

describe('useDragScroll thumb metrics', () => {
  it('renders no thumb when the content fits the viewport', () => {
    const { result } = renderDragScroll(scrollElement({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 }))
    expect(result.current.thumb).toBeNull()
  })

  it('sizes the thumb to the viewport-to-content ratio', () => {
    // 500 of 1000 visible → 50% tall, scrolled to top → 0% offset.
    const { result } = renderDragScroll(scrollElement({ scrollTop: 0, scrollHeight: 1000, clientHeight: 500 }))
    expect(result.current.thumb).toEqual({ topPct: 0, heightPct: 50 })
  })

  it('positions the thumb at the bottom when scrolled to the end', () => {
    const { result } = renderDragScroll(scrollElement({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 }))
    // heightPct 50 → maxTopPct 50; fully scrolled → topPct pinned to 50.
    expect(result.current.thumb?.topPct).toBe(50)
  })

  it('enforces a minimum thumb height for very long content', () => {
    const { result } = renderDragScroll(scrollElement({ scrollTop: 0, scrollHeight: 100_000, clientHeight: 500 }))
    // Raw ratio (0.5%) is clamped up to the 4% floor.
    expect(result.current.thumb?.heightPct).toBe(4)
  })

  it('renders no thumb when there is no scroll element', () => {
    const { result } = renderDragScroll(null)
    expect(result.current.thumb).toBeNull()
  })
})
