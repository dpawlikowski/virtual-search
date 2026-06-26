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
    return <span>{text}</span>
  }

  const parts: React.ReactNode[] = []
  let cursor = 0

  ranges.forEach((range, i) => {
    if (range.start > cursor) {
      parts.push(
        <span key={`pre-${i}`}>{text.slice(cursor, range.start)}</span>
      )
    }
    parts.push(
      <mark
        key={`mark-${i}`}
        className={`${highlightClassName}${activeRangeIndex === i ? ` ${highlightClassName}--active` : ''}`}
        data-vs-highlight-index={i}
      >
        {text.slice(range.start, range.end)}
      </mark>
    )
    cursor = range.end
  })

  if (cursor < text.length) {
    parts.push(<span key="tail">{text.slice(cursor)}</span>)
  }

  return <>{parts}</>
}
