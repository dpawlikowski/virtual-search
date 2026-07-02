import { useMemo } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { SearchMatch } from '../types'

export interface MarkerBucket {
  key: number
  top: number
  matchIndices: number[]
}

/**
 * Buckets search matches to the minimap track's actual pixel resolution and
 * computes each bucket's vertical position (as a % of the track).
 *
 * Positions come from each match's real offset in the (possibly virtualized,
 * not-yet-rendered) list, via `virtualizer.getOffsetForIndex` — which is
 * backed by TanStack's measurementsCache, seeded by the Pretext-based height
 * estimate for every item up front and corrected as items are actually
 * measured. Falls back to an even index-based spread when that API is
 * unavailable.
 *
 * One bucket per marker's own footprint (`markerStridePx`) — a finer
 * resolution would let adjacent markers visually overlap and shadow each
 * other for hover/click, in addition to looking like one solid bar instead
 * of distinct rectangles.
 */
export function useMinimapBuckets(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  matches: SearchMatch[],
  trackHeight: number,
  markerStridePx: number
): MarkerBucket[] {
  const totalSize = virtualizer.getTotalSize()
  const itemCount = virtualizer.options.count

  return useMemo<MarkerBucket[]>(() => {
    if (matches.length === 0 || totalSize <= 0) return []

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
    // `virtualizer` is intentionally excluded: its identity can change on
    // renders that don't affect bucketing, and totalSize/itemCount already
    // capture the values read from it above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, totalSize, itemCount, trackHeight, markerStridePx])
}

/** Finds the bucket whose position is closest to `pct` (0–100). */
export function nearestBucket(buckets: MarkerBucket[], pct: number): MarkerBucket | undefined {
  let nearest: MarkerBucket | undefined
  let bestDist = Infinity
  for (const b of buckets) {
    const dist = Math.abs(b.top - pct)
    if (dist < bestDist) { bestDist = dist; nearest = b }
  }
  return nearest
}
