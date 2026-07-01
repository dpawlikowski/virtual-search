import React, { useCallback, useRef, type RefObject } from 'react'
import type { SearchState, SearchOptions } from '../types'

interface SearchBarProps {
  search: SearchState
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  /** Toggle regex / exact-match / case-sensitive search modes. Omit to hide the option toggles. */
  onOptionsChange?: (options: Partial<SearchOptions>) => void
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
  onOptionsChange,
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
        if (e.shiftKey) onPrev()
        else onNext()
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

      {onOptionsChange && (
        <span className="vs-search-options" role="group" aria-label="Search options">
          <button
            type="button"
            className={`vs-search-opt ${search.options.regex ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ regex: !search.options.regex, exactMatch: false })}
            aria-pressed={!!search.options.regex}
            aria-label="Use regular expression"
            title="Regex"
          >
            .*
          </button>
          <button
            type="button"
            className={`vs-search-opt ${search.options.exactMatch ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ exactMatch: !search.options.exactMatch, regex: false })}
            aria-pressed={!!search.options.exactMatch}
            aria-label="Exact match"
            title="Exact match"
          >
            " "
          </button>
          <button
            type="button"
            className={`vs-search-opt ${search.options.wholeWord ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ wholeWord: !search.options.wholeWord })}
            disabled={!!search.options.regex}
            aria-pressed={!!search.options.wholeWord}
            aria-label="Whole word"
            title={search.options.regex ? 'Whole word (ignored in Regex mode — use \\b yourself)' : 'Whole word'}
          >
            |ab|
          </button>
          <button
            type="button"
            className={`vs-search-opt ${search.options.caseSensitive ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ caseSensitive: !search.options.caseSensitive })}
            disabled={!search.options.regex && !search.options.exactMatch}
            aria-pressed={!!search.options.caseSensitive}
            aria-label="Case sensitive"
            title={
              search.options.regex || search.options.exactMatch
                ? 'Case sensitive'
                : 'Case sensitive (enable Regex or Exact match first — fuzzy search is always case-insensitive)'
            }
          >
            Aa
          </button>
        </span>
      )}

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
