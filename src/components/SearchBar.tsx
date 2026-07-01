import React, { useCallback, useRef, type RefObject } from 'react'
import type { SearchState, SearchOptions } from '../types'

export interface SearchBarLabels {
  searchInputAriaLabel?: string
  noResults?: string
  optionsGroupAriaLabel?: string
  regex?: string
  exactMatch?: string
  wholeWord?: string
  wholeWordDisabledHint?: string
  caseSensitive?: string
  caseSensitiveDisabledHint?: string
  previousMatch?: string
  nextMatch?: string
  clearSearch?: string
}

const DEFAULT_LABELS: Required<SearchBarLabels> = {
  searchInputAriaLabel: 'Search items',
  noResults: 'No results',
  optionsGroupAriaLabel: 'Search options',
  regex: 'Regex',
  exactMatch: 'Exact match',
  wholeWord: 'Whole word',
  wholeWordDisabledHint: 'Whole word (ignored in Regex mode — use \\b yourself)',
  caseSensitive: 'Case sensitive',
  caseSensitiveDisabledHint: 'Case sensitive (enable Regex or Exact match first — fuzzy search is always case-insensitive)',
  previousMatch: 'Previous match',
  nextMatch: 'Next match',
  clearSearch: 'Clear search',
}

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
  /** Override any of the built-in English strings/aria-labels, e.g. for localization. */
  labels?: SearchBarLabels
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
  labels: labelsOverride,
}) => {
  const internalRef = useRef<HTMLInputElement>(null)
  const inputRef = externalRef ?? internalRef
  const labels = labelsOverride ? { ...DEFAULT_LABELS, ...labelsOverride } : DEFAULT_LABELS

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
        aria-label={labels.searchInputAriaLabel}
        autoComplete="off"
        spellCheck={false}
      />

      {onOptionsChange && (
        <span className="vs-search-options" role="group" aria-label={labels.optionsGroupAriaLabel}>
          <button
            type="button"
            className={`vs-search-opt ${search.options.regex ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ regex: !search.options.regex, exactMatch: false })}
            aria-pressed={!!search.options.regex}
            aria-label="Use regular expression"
            title={labels.regex}
          >
            .*
          </button>
          <button
            type="button"
            className={`vs-search-opt ${search.options.exactMatch ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ exactMatch: !search.options.exactMatch, regex: false })}
            aria-pressed={!!search.options.exactMatch}
            aria-label={labels.exactMatch}
            title={labels.exactMatch}
          >
            " "
          </button>
          <button
            type="button"
            className={`vs-search-opt ${search.options.wholeWord ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ wholeWord: !search.options.wholeWord })}
            disabled={!!search.options.regex}
            aria-pressed={!!search.options.wholeWord}
            aria-label={labels.wholeWord}
            title={search.options.regex ? labels.wholeWordDisabledHint : labels.wholeWord}
          >
            |ab|
          </button>
          <button
            type="button"
            className={`vs-search-opt ${search.options.caseSensitive ? 'vs-search-opt-active' : ''}`}
            onClick={() => onOptionsChange({ caseSensitive: !search.options.caseSensitive })}
            disabled={!search.options.regex && !search.options.exactMatch}
            aria-pressed={!!search.options.caseSensitive}
            aria-label={labels.caseSensitive}
            title={
              search.options.regex || search.options.exactMatch
                ? labels.caseSensitive
                : labels.caseSensitiveDisabledHint
            }
          >
            Aa
          </button>
        </span>
      )}

      {search.query && (
        <span className="vs-search-count" aria-live="polite" aria-atomic>
          {search.isSearching ? '…' : count === 0 ? labels.noResults : `${active} / ${count}`}
        </span>
      )}

      <button
        className="vs-search-nav"
        onClick={onPrev}
        disabled={count === 0}
        aria-label={labels.previousMatch}
        title="Previous (Shift+Enter)"
      >
        ↑
      </button>
      <button
        className="vs-search-nav"
        onClick={onNext}
        disabled={count === 0}
        aria-label={labels.nextMatch}
        title="Next (Enter)"
      >
        ↓
      </button>

      {search.query && (
        <button
          className="vs-search-clear"
          onClick={() => onQueryChange('')}
          aria-label={labels.clearSearch}
        >
          ✕
        </button>
      )}
    </div>
  )
}
