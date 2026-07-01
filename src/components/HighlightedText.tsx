import React from 'react'
import type { MatchRange } from '../types'

interface HighlightedTextProps {
  text: string
  ranges?: MatchRange[]
  highlightClassName?: string
  activeRangeIndex?: number
}

/**
 * Renders text with highlighted character ranges.
 * Ranges are character offsets (start inclusive, end exclusive).
 */
export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  ranges,
  highlightClassName = 'vs-highlight',
  activeRangeIndex,
}) => {
  if (!ranges || ranges.length === 0) {
    return <>{text}</>
  }

  const parts: React.ReactNode[] = []
  let cursor = 0

  ranges.forEach((range, i) => {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start))
    }
    parts.push(
      <mark
        key={i}
        className={`${highlightClassName}${activeRangeIndex === i ? ` ${highlightClassName}--active` : ''}`}
        data-vs-highlight-index={i}
      >
        {text.slice(range.start, range.end)}
      </mark>
    )
    cursor = range.end
  })

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return <>{parts}</>
}
