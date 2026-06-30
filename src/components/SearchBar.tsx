import React, { useCallback, useRef, type RefObject } from 'react'
import type { SearchState } from '../types'

interface SearchBarProps {
  search: SearchState
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  className?: string
  placeholder?: string
  /**
   * Optional external ref for the input. Pass the `inputRef` from
   * useSearchToggle to enable auto-focus on Ctrl+F open.
   */
  inputRef?: RefObject<HTMLInputElement>
  /**
   * Called on Escape. If provided, Escape clears the query AND calls this
   * (e.g. to hide the search bar). If omitted, Escape only clears + blurs.
   */
  onEscape?: () => void
}

export const SearchBar: React.FC<SearchBarProps> = ({
  search,
  onQueryChange,
  onNext,
  onPrev,
  className = '',
  placeholder = 'Search…',
  inputRef: externalRef,
  onEscape,
}) => {
  const internalRef = useRef<HTMLInputElement>(null)
  const inputRef = externalRef ?? internalRef

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.shiftKey ? onPrev() : onNext()
      }
      if (e.key === 'Escape') {
        onQueryChange('')
        if (onEscape) onEscape()
        else inputRef.current?.blur()
      }
    },
    [onNext, onPrev, onQueryChange, onEscape, inputRef]
  )

  const count = search.matches.length
  const active = count > 0 ? search.activeMatchIndex + 1 : 0

  return (
    <div className={`vs-search-bar ${className}`} role="search">
      <input
        ref={inputRef}
        className="vs-search-input"
        type="search"
        value={search.query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search items"
        autoComplete="off"
        spellCheck={false}
      />

      {search.query && (
        <span className="vs-search-count" aria-live="polite" aria-atomic>
          {search.isSearching ? '…' : count === 0 ? 'No results' : `${active} / ${count}`}
        </span>
      )}

      <button
        className="vs-search-nav"
        onClick={onPrev}
        disabled={count === 0}
        aria-label="Previous match"
        title="Previous (Shift+Enter)"
      >
        ↑
      </button>
      <button
        className="vs-search-nav"
        onClick={onNext}
        disabled={count === 0}
        aria-label="Next match"
        title="Next (Enter)"
      >
        ↓
      </button>

      {search.query && (
        <button
          className="vs-search-clear"
          onClick={() => onQueryChange('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}
