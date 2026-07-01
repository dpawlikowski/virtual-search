import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { SearchMatch, SearchOptions, VirtualItem } from '../types'
import { buildMatchSnippet, isHighlightCaseSensitive } from '../search/miniSearchAdapter'

interface MatchMinimapProps {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  matches: SearchMatch[]
  activeMatchIndex: number
  onJump: (matchIdx: number) => void
  className?: string
  /**
   * Items being searched. When provided, hovering/focusing a marker shows a
   * tooltip with a short excerpt around the match and the searched term in
   * bold. Only `id`/`text` are read, so a plain `VirtualItem[]` is enough —
   * no need to pass your narrower item type.
   */
  items?: VirtualItem[]
  /** Pass `search.options` from useSearchableList — used to resolve the snippet's highlight correctly per search mode. */
  searchOptions?: SearchOptions
  /** Rendered marker height in px. Default 4. */
  markerHeightPx?: number
  /** How many characters of context to show on each side of the match in the hover tooltip. Default 28. */
  snippetContextChars?: number
}

interface MarkerBucket {
  key: number
  top: number
  matchIndices: number[]
}

const DEFAULT_TRACK_HEIGHT = 600
const DEFAULT_MARKER_HEIGHT_PX = 4
const NAV_KEYS = new Set(['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'])

/**
 * Thin track rendered alongside the scroll container showing where search
 * matches fall across the full (virtualized) list — like the find-in-page
 * minimap in browsers/VSCode.
 *
 * Positions come from each match's real offset in the (possibly virtualized,
 * not-yet-rendered) list, via `virtualizer.getOffsetForIndex` — which is
 * backed by TanStack's measurementsCache, seeded by the Pretext-based height
 * estimate for every item up front and corrected as items are actually
 * measured. So a marker reflects where the match really is, not a generic
 * even spread.
 *
 * Matches are bucketed to the track's actual pixel height so a dense result
 * set renders as a handful of small marks at the right spots instead of one
 * continuous yellow bar covering the whole track.
 *
 * Keyboard: the track is a single Tab stop (roving tabindex) — Arrow
 * Up/Down (or Left/Right) moves between markers, Enter/Space jumps to the
 * focused one. This avoids flooding the page's tab order with one stop per
 * match, which a dense result set could easily number in the hundreds.
 */
export function MatchMinimap({
  virtualizer, matches, activeMatchIndex, onJump, className = '', items, searchOptions,
  markerHeightPx = DEFAULT_MARKER_HEIGHT_PX, snippetContextChars,
}: MatchMinimapProps) {
  const caseSensitive = isHighlightCaseSensitive(searchOptions ?? {})
  const totalSize = virtualizer.getTotalSize()
  const itemCount = virtualizer.options.count
  // Stride between bucket centers — taller than the marker itself so adjacent
  // markers always have a visible gap instead of touching/overlapping at the
  // edges (which would also make the lower one unclickable/unhoverable, since
  // the marker painted later sits on top).
  const markerStridePx = markerHeightPx + 2

  const trackRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [trackHeight, setTrackHeight] = useState(DEFAULT_TRACK_HEIGHT)
  const [hoveredKey, setHoveredKey] = useState<number | null>(null)
  const [focusedKey, setFocusedKey] = useState<number | null>(null)
  const [viewport, setViewport] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  // Mirrors virtualizer.scrollElement into a plain ref so the drag handlers
  // below read/mutate a DOM node directly instead of a property reached
  // through `virtualizer` — react-hooks/immutability otherwise flags
  // `scrollEl.scrollTop = …` as mutating the virtualizer object itself.
  const scrollElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height
      if (h > 0) setTrackHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Dense result sets can fill the whole minimap track with marker ticks,
  // burying the native (or fully overlaid) scrollbar thumb so there's no
  // visible handle left to grab. Render our own thumb on top of the markers,
  // reflecting the scroll container's real viewport, so there's always a
  // higher-contrast, higher-z-index handle to drag regardless of how many
  // markers are painted underneath it.
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

  const thumb = useMemo(() => {
    const { scrollTop, scrollHeight, clientHeight } = viewport
    if (scrollHeight <= 0 || clientHeight <= 0 || scrollHeight <= clientHeight) return null
    const heightPct = Math.max(4, (clientHeight / scrollHeight) * 100)
    const maxTopPct = 100 - heightPct
    const topPct = Math.min(maxTopPct, (scrollTop / (scrollHeight - clientHeight)) * maxTopPct)
    return { topPct, heightPct }
  }, [viewport])

  const dragState = useRef<{ startY: number; startScrollTop: number } | null>(null)

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

  const itemById = useMemo(() => {
    if (!items) return null
    const m = new Map<string, VirtualItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const buckets = useMemo<MarkerBucket[]>(() => {
    if (matches.length === 0 || totalSize <= 0) return []

    // One bucket per marker's own footprint — using a finer resolution than
    // that would let adjacent markers visually overlap and shadow each other
    // for hover/click, in addition to looking like one solid bar instead of
    // distinct rectangles.
    const resolution = Math.max(1, Math.round(trackHeight / markerStridePx))
    const byBucket = new Map<number, MarkerBucket>()

    matches.forEach((m, i) => {
      const offset = virtualizer.getOffsetForIndex
        ? virtualizer.getOffsetForIndex(m.index, 'start')?.[0]
        : undefined
      const top = offset ?? (m.index / Math.max(1, itemCount)) * totalSize
      const pct = Math.min(100, Math.max(0, (top / totalSize) * 100))
      const key = Math.round((pct / 100) * resolution)
      const existing = byBucket.get(key)
      if (existing) existing.matchIndices.push(i)
      else byBucket.set(key, { key, top: pct, matchIndices: [i] })
    })

    // Sorted by position so keyboard up/down and Home/End move spatially
    // through the track, not in arbitrary match-score order.
    return Array.from(byBucket.values()).sort((a, b) => a.top - b.top)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, totalSize, itemCount, trackHeight, markerStridePx])

  const nearestBucket = (pct: number): MarkerBucket | undefined => {
    let nearest: MarkerBucket | undefined
    let bestDist = Infinity
    for (const b of buckets) {
      const dist = Math.abs(b.top - pct)
      if (dist < bestDist) { bestDist = dist; nearest = b }
    }
    return nearest
  }

  // Clicking anywhere on the track (not just exactly on a marker) jumps to
  // the closest match — the track represents the full virtualized list, so
  // this works even for matches whose items are nowhere near being rendered.
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (buckets.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * 100 : 0
    const bucket = nearestBucket(Math.min(100, Math.max(0, pct)))
    if (bucket) onJump(bucket.matchIndices[0])
  }

  const focusBucketAt = (targetIdx: number) => {
    const bucket = buckets[targetIdx]
    if (!bucket) return
    buttonRefs.current.get(bucket.key)?.focus()
  }

  const handleMarkerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, key: number) => {
    if (!NAV_KEYS.has(e.key)) return
    e.preventDefault()
    const idx = buckets.findIndex(b => b.key === key)
    if (idx === -1) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') focusBucketAt(Math.min(buckets.length - 1, idx + 1))
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') focusBucketAt(Math.max(0, idx - 1))
    else if (e.key === 'Home') focusBucketAt(0)
    else if (e.key === 'End') focusBucketAt(buckets.length - 1)
  }

  const hoveredBucket = buckets.find(b => b.key === hoveredKey)
  const hoveredSnippet = useMemo(() => {
    if (!hoveredBucket || !itemById) return null
    const match = matches[hoveredBucket.matchIndices[0]]
    if (!match) return null
    const item = itemById.get(match.itemId)
    if (!item) return null
    for (const terms of match.terms.values()) {
      const snippet = buildMatchSnippet(item.text, terms, caseSensitive, snippetContextChars)
      if (snippet) return snippet
    }
    return null
  }, [hoveredBucket, itemById, matches, caseSensitive, snippetContextChars])

  // Roving tabindex: only one marker is a Tab stop at a time, defaulting to
  // the one containing the current active match (falls back to the first).
  const activeBucketKey = buckets.find(b => b.matchIndices.includes(activeMatchIndex))?.key
  const tabbableKey = focusedKey ?? activeBucketKey ?? buckets[0]?.key

  return (
    <div
      ref={trackRef}
      className={`vs-minimap ${className}`}
      onClick={handleTrackClick}
      role="group"
      aria-label="Search match positions"
    >
      {buckets.map(({ key, top, matchIndices }) => {
        const isActive = matchIndices.includes(activeMatchIndex)
        // Bucket size is a pixel-resolution artifact, not a real "these are
        // all right next to each other" signal — at low zoom (long lists /
        // short track) a bucket a few px tall can lump together matches
        // scattered across a large chunk of the list. Saying "N matches near
        // this position" overstates how localized that cluster really is, so
        // wording calls it out as a rounded-up count over an area/range
        // instead of an exact position. The marker's own height also grows
        // (log-scaled, capped) with cluster size, so a genuine dense cluster
        // reads as a visibly thicker band rather than the same thin tick as
        // a single, precisely-located match.
        const clusterHeightPx = matchIndices.length > 1
          ? Math.min(markerHeightPx * 3, markerHeightPx + Math.round(Math.log2(matchIndices.length) * 2))
          : markerHeightPx
        const height = isActive ? clusterHeightPx + 1 : clusterHeightPx
        return (
          <button
            key={key}
            ref={(el) => { if (el) buttonRefs.current.set(key, el); else buttonRefs.current.delete(key) }}
            type="button"
            className={`vs-minimap-marker ${isActive ? 'vs-minimap-marker--active' : ''}`}
            style={{ top: `${top}%`, height: `${height}px` }}
            tabIndex={key === tabbableKey ? 0 : -1}
            onClick={(e) => { e.stopPropagation(); onJump(matchIndices[0]) }}
            onKeyDown={(e) => handleMarkerKeyDown(e, key)}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey(k => (k === key ? null : k))}
            onFocus={() => { setHoveredKey(key); setFocusedKey(key) }}
            onBlur={() => setHoveredKey(k => (k === key ? null : k))}
            aria-label={
              matchIndices.length > 1
                ? `~${matchIndices.length} matches in this area`
                : 'Jump to match'
            }
          >
            {hoveredKey === key && hoveredSnippet && (
              <span className="vs-minimap-tooltip" role="tooltip">
                {matchIndices.length > 1 && (
                  <span className="vs-minimap-tooltip__count">~{matchIndices.length} matches in this area — </span>
                )}
                {hoveredSnippet.before}
                <strong>{hoveredSnippet.match}</strong>
                {hoveredSnippet.after}
              </span>
            )}
          </button>
        )
      })}
      {thumb && (
        <div
          className="vs-minimap-thumb"
          style={{ top: `${thumb.topPct}%`, height: `${thumb.heightPct}%` }}
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={handleThumbPointerUp}
          onPointerCancel={handleThumbPointerUp}
          onClick={(e) => e.stopPropagation()}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
