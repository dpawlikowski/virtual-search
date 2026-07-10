import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { useMinimapBuckets, nearestBucket, type MarkerBucket } from '../hooks/useMinimapBuckets'
import type { SearchMatch } from '../types'

const TRACK_HEIGHT = 200
const MARKER_STRIDE = 10 // → resolution of 20 buckets across the track
const TOTAL_SIZE = 1000

function match(index: number): SearchMatch {
  return { itemId: `item-${index}`, index, score: 1, terms: new Map() }
}

/** Minimal fake virtualizer: item `i` sits at pixel offset `i * 100`. */
function fakeVirtualizer(count: number, totalSize = TOTAL_SIZE): Virtualizer<HTMLDivElement, Element> {
  return {
    getTotalSize: () => totalSize,
    options: { count },
    getOffsetForIndex: (index: number) => [index * 100, 'start'] as [number, 'start'],
  } as unknown as Virtualizer<HTMLDivElement, Element>
}

describe('useMinimapBuckets', () => {
  it('returns no buckets when there are no matches', () => {
    const { result } = renderHook(() =>
      useMinimapBuckets(fakeVirtualizer(10), [], TRACK_HEIGHT, MARKER_STRIDE),
    )
    expect(result.current).toEqual([])
  })

  it('returns no buckets when the list has zero total size', () => {
    const { result } = renderHook(() =>
      useMinimapBuckets(fakeVirtualizer(10, 0), [match(1)], TRACK_HEIGHT, MARKER_STRIDE),
    )
    expect(result.current).toEqual([])
  })

  it('places a match at the vertical percentage of its offset', () => {
    // Item 5 → offset 500 of 1000 → 50% down the track.
    const { result } = renderHook(() =>
      useMinimapBuckets(fakeVirtualizer(10), [match(5)], TRACK_HEIGHT, MARKER_STRIDE),
    )
    expect(result.current).toHaveLength(1)
    expect(result.current[0]?.top).toBe(50)
  })

  it('collapses matches that fall in the same marker bucket', () => {
    // Items 0 and 1 → 0% and 10%; with 20 buckets they land in adjacent buckets.
    const { result } = renderHook(() =>
      useMinimapBuckets(fakeVirtualizer(10), [match(0), match(1)], TRACK_HEIGHT, MARKER_STRIDE),
    )
    const totalIndices = result.current.flatMap((b) => b.matchIndices)
    expect(totalIndices).toHaveLength(2)
  })

  it('returns buckets sorted by vertical position', () => {
    const { result } = renderHook(() =>
      useMinimapBuckets(fakeVirtualizer(10), [match(9), match(1), match(5)], TRACK_HEIGHT, MARKER_STRIDE),
    )
    const tops = result.current.map((b) => b.top)
    expect(tops).toEqual([...tops].sort((a, b) => a - b))
  })
})

describe('nearestBucket', () => {
  const buckets: MarkerBucket[] = [
    { key: 0, top: 10, matchIndices: [0] },
    { key: 1, top: 50, matchIndices: [1] },
    { key: 2, top: 90, matchIndices: [2] },
  ]

  it('finds the bucket closest to the given percentage', () => {
    expect(nearestBucket(buckets, 48)?.top).toBe(50)
    expect(nearestBucket(buckets, 5)?.top).toBe(10)
    expect(nearestBucket(buckets, 100)?.top).toBe(90)
  })

  it('returns undefined for an empty bucket list', () => {
    expect(nearestBucket([], 50)).toBeUndefined()
  })
})
