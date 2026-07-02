import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'

export interface ThumbMetrics {
  topPct: number
  heightPct: number
}

export interface UseDragScrollReturn {
  /** `null` when the content fits without scrolling — render no thumb. */
  thumb: ThumbMetrics | null
  handleThumbPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  handleThumbPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  handleThumbPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}

/**
 * Tracks the scroll container's real viewport (via `virtualizer.scrollElement`)
 * and exposes a draggable-thumb affordance for it.
 *
 * Dense result sets can fill the whole minimap track with marker ticks,
 * burying the native (or fully overlaid) scrollbar thumb so there's no
 * visible handle left to grab. This renders our own thumb on top of the
 * markers, reflecting the scroll container's real viewport, so there's
 * always a higher-contrast, higher-z-index handle to drag regardless of how
 * many markers are painted underneath it.
 */
export function useDragScroll(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  trackHeight: number
): UseDragScrollReturn {
  const [viewport, setViewport] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  // Mirrors virtualizer.scrollElement into a plain ref so the drag handlers
  // below read/mutate a DOM node directly instead of a property reached
  // through `virtualizer` — react-hooks/immutability otherwise flags
  // `scrollEl.scrollTop = …` as mutating the virtualizer object itself.
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const dragState = useRef<{ startY: number; startScrollTop: number } | null>(null)

  useEffect(() => {
    const scrollEl = virtualizer.scrollElement
    if (!scrollEl) return
    scrollElementRef.current = scrollEl
    const update = () => setViewport({
      scrollTop: scrollEl.scrollTop,
      scrollHeight: scrollEl.scrollHeight,
      clientHeight: scrollEl.clientHeight,
    })
    update()
    scrollEl.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(scrollEl)
    return () => {
      scrollEl.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [virtualizer])

  const thumb = useMemo<ThumbMetrics | null>(() => {
    const { scrollTop, scrollHeight, clientHeight } = viewport
    if (scrollHeight <= 0 || clientHeight <= 0 || scrollHeight <= clientHeight) return null
    const heightPct = Math.max(4, (clientHeight / scrollHeight) * 100)
    const maxTopPct = 100 - heightPct
    const topPct = Math.min(maxTopPct, (scrollTop / (scrollHeight - clientHeight)) * maxTopPct)
    return { topPct, heightPct }
  }, [viewport])

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const scrollEl = scrollElementRef.current
    if (!scrollEl) return
    dragState.current = { startY: e.clientY, startScrollTop: scrollEl.scrollTop }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleThumbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    const scrollEl = scrollElementRef.current
    if (!drag || !scrollEl || trackHeight <= 0) return
    const scrollable = scrollEl.scrollHeight - scrollEl.clientHeight
    if (scrollable <= 0) return
    const deltaY = e.clientY - drag.startY
    const scrollDelta = (deltaY / trackHeight) * scrollEl.scrollHeight
    scrollEl.scrollTop = Math.min(scrollable, Math.max(0, drag.startScrollTop + scrollDelta))
  }

  const handleThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return { thumb, handleThumbPointerDown, handleThumbPointerMove, handleThumbPointerUp }
}
