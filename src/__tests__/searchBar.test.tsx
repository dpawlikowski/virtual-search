import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { createRef } from 'react'
import { SearchBar } from '../components/SearchBar'
import type { SearchState } from '../types'

const idle: SearchState = { query: '', matches: [], activeMatchIndex: 0, isSearching: false, options: {} }

function search(overrides: Partial<SearchState> = {}): SearchState {
  return { ...idle, ...overrides }
}

describe('SearchBar', () => {
  it('renders an input with the current query value', () => {
    render(
      <SearchBar
        search={search({ query: 'hello' })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByRole('searchbox')).toHaveValue('hello')
  })

  it('calls onQueryChange when typing', () => {
    const onQueryChange = vi.fn()
    render(
      <SearchBar
        search={search()}
        onQueryChange={onQueryChange}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'foo' } })
    expect(onQueryChange).toHaveBeenCalledWith('foo')
  })

  it('shows match counter when there are matches', () => {
    render(
      <SearchBar
        search={search({ query: 'x', matches: [{ itemId: '1', index: 0, score: 1, terms: new Map() }], activeMatchIndex: 0 })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('shows "No results" when query set but no matches', () => {
    render(
      <SearchBar
        search={search({ query: 'xyz', matches: [] })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('shows "…" while searching', () => {
    render(
      <SearchBar
        search={search({ query: 'abc', isSearching: true })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByText('…')).toBeInTheDocument()
  })

  it('hides match counter when query is empty', () => {
    const { container } = render(
      <SearchBar
        search={search({ query: '' })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(container.querySelector('.vs-search-count')).toBeNull()
  })

  it('Enter calls onNext', () => {
    const onNext = vi.fn()
    render(
      <SearchBar
        search={search({ query: 'a', matches: [{ itemId: '1', index: 0, score: 1, terms: new Map() }] })}
        onQueryChange={vi.fn()}
        onNext={onNext}
        onPrev={vi.fn()}
      />
    )
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('Shift+Enter calls onPrev', () => {
    const onPrev = vi.fn()
    render(
      <SearchBar
        search={search({ query: 'a', matches: [{ itemId: '1', index: 0, score: 1, terms: new Map() }] })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={onPrev}
      />
    )
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter', shiftKey: true })
    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('Escape clears the query', () => {
    const onQueryChange = vi.fn()
    render(
      <SearchBar
        search={search({ query: 'hello' })}
        onQueryChange={onQueryChange}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  it('Escape calls onEscape when provided', () => {
    const onEscape = vi.fn()
    const onQueryChange = vi.fn()
    render(
      <SearchBar
        search={search({ query: 'hello' })}
        onQueryChange={onQueryChange}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onEscape={onEscape}
      />
    )
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('clear button calls onQueryChange with empty string', () => {
    const onQueryChange = vi.fn()
    render(
      <SearchBar
        search={search({ query: 'hello' })}
        onQueryChange={onQueryChange}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  it('nav buttons are disabled when no matches', () => {
    render(
      <SearchBar
        search={search({ query: 'x', matches: [] })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Previous match' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled()
  })

  it('prev/next buttons are enabled when matches exist', () => {
    render(
      <SearchBar
        search={search({ query: 'x', matches: [{ itemId: '1', index: 0, score: 1, terms: new Map() }] })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Previous match' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next match' })).not.toBeDisabled()
  })

  it('accepts an external inputRef', () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <SearchBar
        search={search()}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        inputRef={ref as React.RefObject<HTMLInputElement>}
      />
    )
    expect(ref.current).toBe(screen.getByRole('searchbox'))
  })

  it('uses provided placeholder', () => {
    render(
      <SearchBar
        search={search()}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        placeholder="Find in page"
      />
    )
    expect(screen.getByPlaceholderText('Find in page')).toBeInTheDocument()
  })

  it('renders inside a role=search landmark', () => {
    render(
      <SearchBar
        search={search()}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByRole('search')).toBeInTheDocument()
  })

  it('active index in counter increments correctly', () => {
    const matches = [
      { itemId: '1', index: 0, score: 1, terms: new Map() },
      { itemId: '2', index: 1, score: 1, terms: new Map() },
      { itemId: '3', index: 2, score: 1, terms: new Map() },
    ]
    render(
      <SearchBar
        search={search({ query: 'a', matches, activeMatchIndex: 1 })}
        onQueryChange={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
      />
    )
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })
})

describe('SearchBar — search options', () => {
  it('does not render option toggles when onOptionsChange is omitted', () => {
    render(<SearchBar search={search()} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />)
    expect(screen.queryByRole('group', { name: 'Search options' })).toBeNull()
  })

  it('renders regex/exact/wholeWord/case-sensitive toggles when onOptionsChange is provided', () => {
    render(
      <SearchBar search={search()} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Use regular expression' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exact match' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Whole word' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Case sensitive' })).toBeInTheDocument()
  })

  it('clicking Regex calls onOptionsChange with regex: true and clears exactMatch', () => {
    const onOptionsChange = vi.fn()
    render(
      <SearchBar search={search({ options: { exactMatch: true } })} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={onOptionsChange} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }))
    expect(onOptionsChange).toHaveBeenCalledWith({ regex: true, exactMatch: false })
  })

  it('clicking an active toggle turns it back off', () => {
    const onOptionsChange = vi.fn()
    render(
      <SearchBar search={search({ options: { regex: true } })} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={onOptionsChange} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }))
    expect(onOptionsChange).toHaveBeenCalledWith({ regex: false, exactMatch: false })
  })

  it('marks the active toggle with aria-pressed and the active class', () => {
    render(
      <SearchBar search={search({ options: { exactMatch: true } })} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />
    )
    const exactBtn = screen.getByRole('button', { name: 'Exact match' })
    expect(exactBtn).toHaveAttribute('aria-pressed', 'true')
    expect(exactBtn.className).toContain('vs-search-opt-active')
    expect(screen.getByRole('button', { name: 'Use regular expression' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('case-sensitive toggle is disabled in plain fuzzy mode (no-op there)', () => {
    render(
      <SearchBar search={search()} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Case sensitive' })).toBeDisabled()
  })

  it('case-sensitive toggle is enabled once regex mode is active', () => {
    render(
      <SearchBar search={search({ options: { regex: true } })} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Case sensitive' })).not.toBeDisabled()
  })

  it('case-sensitive toggle is enabled once exact-match mode is active', () => {
    render(
      <SearchBar search={search({ options: { exactMatch: true } })} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Case sensitive' })).not.toBeDisabled()
  })

  it('whole-word toggle is disabled while regex mode is active (ignored there)', () => {
    render(
      <SearchBar search={search({ options: { regex: true } })} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Whole word' })).toBeDisabled()
  })

  it('whole-word toggle is enabled in fuzzy/exact mode', () => {
    render(<SearchBar search={search()} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onOptionsChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Whole word' })).not.toBeDisabled()
  })
})
