import React, { useMemo, useState, useCallback } from 'react'
import { useSearchableList } from '../src/hooks/useSearchableList'
import { useSearchToggle } from '../src/hooks/useSearchToggle'
import { SearchBar } from '../src/components/SearchBar'
import { MatchMinimap } from '../src/components/MatchMinimap'
import { HighlightedText } from '../src/components/HighlightedText'
import type { VirtualItem, MatchRange } from '../src/types'
import {
  EMAIL_ITEMS, NEWS_ITEMS, EMAIL_COUNT, NEWS_COUNT,
  EMAIL_ROW_HEIGHT, NEWS_ROW_HEIGHT, formatCount,
  type EmailItem, type NewsItem,
} from './data'
import '../src/styles.css'
import './demo.css'

// ─── Shared ───────────────────────────────────────────────────────────────────

const ITEM_STYLE: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%' }
const LIST_HEIGHT = 600

// ─── Email list ───────────────────────────────────────────────────────────────

interface EmailRowProps {
  item: EmailItem; index: number; translateY: number
  highlights: Map<string, MatchRange[]> | undefined
  isActiveMatch: boolean
  measureRef: (el: HTMLElement | null) => void
}

const EmailRow = React.memo<EmailRowProps>(({ item, index, translateY, highlights, isActiveMatch, measureRef }) => {
  // Ranges are per-field character offsets; each field must use its own so
  // the highlight lands on the right characters (not the searchable `text`).
  const subjectRanges = highlights?.get('subject')
  const previewRanges = highlights?.get('preview')
  const style = useMemo(() => ({ ...ITEM_STYLE, transform: `translateY(${translateY}px)` }), [translateY])
  let cls = 'email-row'
  if (item.unread) cls += ' email-row--unread'
  if (isActiveMatch) cls += ' email-row--active-match'
  return (
    <div ref={measureRef} data-index={index} data-vs-item-id={item.id} style={style} className={cls} role="listitem">
      <div className="email-row__header">
        <span className="email-row__from">{item.from}</span>
        <span className="email-row__date">{item.date}</span>
      </div>
      <div className="email-row__subject"><HighlightedText text={item.subject} ranges={subjectRanges} /></div>
      <div className="email-row__preview"><HighlightedText text={item.preview} ranges={previewRanges} /></div>
    </div>
  )
})
EmailRow.displayName = 'EmailRow'

interface EmailListProps {
  visible: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onClose: () => void
}

function EmailList({ visible, inputRef, onClose }: EmailListProps) {
  const { items, virtualizer, search, setQuery, setSearchOptions, nextMatch, prevMatch, goToMatch, getHighlights, getIsActiveMatch, observeItem, containerRef, getHeightSource } =
    useSearchableList<EmailItem>({ items: EMAIL_ITEMS, containerHeight: LIST_HEIGHT, searchFields: ['subject', 'preview'], defaultItemHeight: EMAIL_ROW_HEIGHT })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <>
      {visible && (
        <div className="demo__toolbar">
          <SearchBar search={search} onQueryChange={setQuery} onNext={nextMatch} onPrev={prevMatch}
            onOptionsChange={setSearchOptions}
            inputRef={inputRef} onEscape={onClose}
            placeholder="Search emails… (try 'RFC', 'deployment', 'race condition')" />
        </div>
      )}
      <div className="vs-list-wrapper">
        <div ref={containerRef} className="vs-container demo__list" style={{ height: LIST_HEIGHT }} role="list">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((vi) => {
              const item = items[vi.index] as EmailItem
              return (
                <EmailRow key={item.id} item={item} index={vi.index} translateY={vi.start}
                  highlights={getHighlights(vi.index)} isActiveMatch={getIsActiveMatch(item.id)}
                  measureRef={observeItem} />
              )
            })}
          </div>
        </div>
        <MatchMinimap virtualizer={virtualizer} matches={search.matches} activeMatchIndex={search.activeMatchIndex}
          onJump={goToMatch} items={items} searchOptions={search.options} />
      </div>
      <SourceFooter virtualItems={virtualItems} items={items} getHeightSource={getHeightSource} />
    </>
  )
}

// ─── News list ────────────────────────────────────────────────────────────────

interface NewsRowProps {
  item: NewsItem; index: number; translateY: number
  highlights: Map<string, MatchRange[]> | undefined
  isActiveMatch: boolean
  measureRef: (el: HTMLElement | null) => void
}

const NewsRow = React.memo<NewsRowProps>(({ item, index, translateY, highlights, isActiveMatch, measureRef }) => {
  const headlineRanges = highlights?.get('headline')
  const bodyRanges = highlights?.get('body')
  const style = useMemo(() => ({ ...ITEM_STYLE, transform: `translateY(${translateY}px)` }), [translateY])
  const cls = isActiveMatch ? 'news-row email-row--active-match' : 'news-row'
  return (
    <div ref={measureRef} data-index={index} data-vs-item-id={item.id} style={style} className={cls} role="listitem">
      <div className="news-row__meta">
        <span className="news-row__source">{item.source}</span>
        <span className="news-row__category">{item.category}</span>
        <span className="news-row__date">{item.date}</span>
      </div>
      <div className="news-row__headline"><HighlightedText text={item.headline} ranges={headlineRanges} /></div>
      <div className="news-row__body"><HighlightedText text={item.body} ranges={bodyRanges} /></div>
    </div>
  )
})
NewsRow.displayName = 'NewsRow'

interface NewsListProps {
  visible: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onClose: () => void
}

function NewsList({ visible, inputRef, onClose }: NewsListProps) {
  const { items, virtualizer, search, setQuery, setSearchOptions, nextMatch, prevMatch, goToMatch, getHighlights, getIsActiveMatch, observeItem, containerRef, getHeightSource } =
    useSearchableList<NewsItem>({ items: NEWS_ITEMS, containerHeight: LIST_HEIGHT, searchFields: ['headline', 'body'], defaultItemHeight: NEWS_ROW_HEIGHT })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <>
      {visible && (
        <div className="demo__toolbar">
          <SearchBar search={search} onQueryChange={setQuery} onNext={nextMatch} onPrev={prevMatch}
            onOptionsChange={setSearchOptions}
            inputRef={inputRef} onEscape={onClose}
            placeholder="Search news… (try 'AI', 'vulnerability', 'WebAssembly')" />
        </div>
      )}
      <div className="vs-list-wrapper">
        <div ref={containerRef} className="vs-container demo__list" style={{ height: LIST_HEIGHT }} role="list">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((vi) => {
              const item = items[vi.index] as NewsItem
              return (
                <NewsRow key={item.id} item={item} index={vi.index} translateY={vi.start}
                  highlights={getHighlights(vi.index)} isActiveMatch={getIsActiveMatch(item.id)}
                  measureRef={observeItem} />
              )
            })}
          </div>
        </div>
        <MatchMinimap virtualizer={virtualizer} matches={search.matches} activeMatchIndex={search.activeMatchIndex}
          onJump={goToMatch} items={items} searchOptions={search.options} />
      </div>
      <SourceFooter virtualItems={virtualItems} items={items} getHeightSource={getHeightSource} />
    </>
  )
}

// ─── Source footer (shared debug) ────────────────────────────────────────────

import type { HeightSource } from '../src/types'

interface SourceFooterProps {
  virtualItems: { index: number }[]
  items: VirtualItem[]
  getHeightSource: (i: number) => HeightSource
}

function SourceFooter({ virtualItems, items, getHeightSource }: SourceFooterProps) {
  return (
    <footer className="demo__footer">
      <span>height sources → </span>
      {virtualItems.slice(0, 8).map(vi => {
        const item = items[vi.index]
        const src = getHeightSource(vi.index)
        return <span key={item.id} className={`demo__source demo__source--${src}`}>{src}</span>
      })}
    </footer>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

type Tab = 'emails' | 'news'

export default function App() {
  const [tab, setTab] = useState<Tab>('emails')

  const { visible, inputRef, close, open } = useSearchToggle()

  const switchTab = useCallback((next: Tab) => {
    close()
    setTab(next)
  }, [close])

  return (
    <div className="demo">
      <header className="demo__header">
        <div className="demo__title">
          <h1>virtual-search</h1>
          <span className="demo__badge">{tab === 'emails' ? `${formatCount(EMAIL_COUNT)} emails` : `${formatCount(NEWS_COUNT)} articles`}</span>
        </div>
        <p className="demo__sub">Virtualized list · hybrid height estimation · full-text search · scroll-to-match</p>
        <p className="demo__hint">
          Press <kbd>Ctrl</kbd>+<kbd>F</kbd> (or <kbd>⌘</kbd>+<kbd>F</kbd>) to {visible ? 'hide' : 'show'} search
        </p>
      </header>

      <nav className="demo__nav">
        <button className={`demo__nav-btn${tab === 'emails' ? ' demo__nav-btn--active' : ''}`} onClick={() => switchTab('emails')}>
          Emails
        </button>
        <button className={`demo__nav-btn${tab === 'news' ? ' demo__nav-btn--active' : ''}`} onClick={() => switchTab('news')}>
          News Feed
        </button>
      </nav>

      {tab === 'emails'
        ? <EmailList visible={visible} inputRef={inputRef} onClose={close} />
        : <NewsList visible={visible} inputRef={inputRef} onClose={close} />
      }
    </div>
  )
}
