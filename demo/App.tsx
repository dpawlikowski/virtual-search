import React, { useMemo, useState, useCallback } from 'react'
import { useSearchableList } from '../src/hooks/useSearchableList'
import { useSearchToggle } from '../src/hooks/useSearchToggle'
import { SearchBar } from '../src/components/SearchBar'
import { MatchMinimap } from '../src/components/MatchMinimap'
import { HighlightedText } from '../src/components/HighlightedText'
import type { VirtualItem, MatchRange } from '../src/types'
import '../src/styles.css'
import './demo.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailItem extends VirtualItem {
  subject: string; from: string; preview: string; date: string; unread: boolean
}

interface NewsItem extends VirtualItem {
  headline: string; source: string; category: string; body: string; date: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SENDERS = ['Alice Johnson', 'Bob Martinez', 'Carol White', 'David Kim', 'Eva Nowak', 'Frank Zhang', 'Grace Okonkwo', 'Hans Müller']
const SUBJECTS = [
  'Weekly engineering sync — agenda attached',
  'Re: Q3 performance review cycle starts Monday',
  'Action required: update your 2FA before Friday',
  'Ship it Friday — release notes draft for review',
  'Design review feedback on the new onboarding flow',
  'Incident post-mortem: database connection pool exhaustion',
  'Welcome to the team — your access has been provisioned',
  'RFC: proposal for adopting TanStack Query across all frontends',
  'Bug report: search returns empty results for CJK queries',
  'Can we sync this week about the roadmap?',
]
const BODIES = [
  'I wanted to follow up on our conversation from last week regarding the architecture decision. After reviewing the options, I believe the approach using server-side rendering with hydration will serve our performance goals better than a pure client-side solution.',
  "Thanks for sending this over. I reviewed the attached document and have a few comments. The main concern is around the timeline — three weeks feels tight given the current team capacity. Can we discuss this in Thursday's planning session?",
  "Quick note to confirm that the deployment went smoothly. All health checks are passing and error rates are nominal. I'll keep an eye on latency metrics through the end of the day.",
  "The test suite is now green after fixing the race condition in the auth middleware. The root cause was a missing await in the session refresh logic. I've added a regression test.",
  "As discussed in the RFC, I'm proposing we standardize on a single state management pattern across the frontend apps. Right now we have three different approaches which makes it hard to onboard.",
]

const EMAIL_ITEMS: EmailItem[] = Array.from({ length: 5000 }, (_, i) => {
  const subject = SUBJECTS[i % SUBJECTS.length]
  const from = SENDERS[i % SENDERS.length]
  const body = BODIES[i % BODIES.length]
  const date = new Date(Date.now() - Math.floor(i / 3) * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return {
    id: `email-${i}`,
    text: `${subject} ${from} ${body}`,
    type: 'email',
    subject, from, preview: body.slice(0, 130) + '…', date, unread: i % 4 === 0,
  }
})

const NEWS_SOURCES = ['TechCrunch', 'The Verge', 'Hacker News', 'Ars Technica', 'Wired']
const NEWS_CATEGORIES = ['AI', 'Security', 'Open Source', 'Web Dev', 'Cloud', 'Mobile']
const NEWS_HEADLINES = [
  'New language model achieves state-of-the-art results on reasoning benchmarks',
  'Critical vulnerability found in widely-used authentication library',
  'Open source alternative to popular SaaS tool reaches 10k GitHub stars',
  'WebAssembly 2.0 brings garbage collection and exception handling to browsers',
  'Major cloud provider announces 30% price reduction on compute instances',
  'Study shows 40% of developers use AI assistants for more than half their coding',
  'TypeScript 6.0 proposal: full type-level computation without escape hatches',
  'New CSS feature enables container queries for responsive component design',
  'Rust adoption in Linux kernel reaches 500,000 lines of production code',
  'Privacy-preserving federated learning paper accepted at NeurIPS',
]
const NEWS_BODIES = [
  'Researchers published findings showing dramatic improvements over previous approaches. The new method reduces computational requirements by an order of magnitude while maintaining accuracy, opening the door for edge deployment.',
  'Security researchers discovered the flaw during a routine audit. The vulnerability allows unauthenticated remote code execution and affects all versions prior to 3.2.1. Users are urged to update immediately.',
  'The project, which began as a weekend experiment, has attracted contributions from over 200 developers across 30 countries. The maintainers credit the permissive license and excellent documentation for rapid adoption.',
  'The specification committee reached consensus after months of debate. Browser vendors have committed to shipping support within two major release cycles, with polyfills available for older targets.',
  'The pricing change takes effect next quarter and applies to all regions. Analysts expect competitors to respond with similar reductions, potentially accelerating cloud migration projects.',
]

const NEWS_ITEMS: NewsItem[] = Array.from({ length: 3000 }, (_, i) => {
  const headline = NEWS_HEADLINES[i % NEWS_HEADLINES.length]
  const source = NEWS_SOURCES[i % NEWS_SOURCES.length]
  const category = NEWS_CATEGORIES[i % NEWS_CATEGORIES.length]
  const body = NEWS_BODIES[i % NEWS_BODIES.length]
  const date = new Date(Date.now() - Math.floor(i / 5) * 3600000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return {
    id: `news-${i}`,
    text: `${headline} ${source} ${category} ${body}`,
    type: 'news',
    headline, source, category, body, date,
  }
})

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
  const ranges = highlights?.get('text')
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
      <div className="email-row__subject"><HighlightedText text={item.subject} ranges={ranges} /></div>
      <div className="email-row__preview"><HighlightedText text={item.preview} ranges={ranges} /></div>
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
    useSearchableList<EmailItem>({ items: EMAIL_ITEMS, containerHeight: LIST_HEIGHT, searchFields: ['text'], defaultItemHeight: 96 })

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
  const ranges = highlights?.get('text')
  const style = useMemo(() => ({ ...ITEM_STYLE, transform: `translateY(${translateY}px)` }), [translateY])
  const cls = isActiveMatch ? 'news-row email-row--active-match' : 'news-row'
  return (
    <div ref={measureRef} data-index={index} data-vs-item-id={item.id} style={style} className={cls} role="listitem">
      <div className="news-row__meta">
        <span className="news-row__source">{item.source}</span>
        <span className="news-row__category">{item.category}</span>
        <span className="news-row__date">{item.date}</span>
      </div>
      <div className="news-row__headline"><HighlightedText text={item.headline} ranges={ranges} /></div>
      <div className="news-row__body"><HighlightedText text={item.body} ranges={ranges} /></div>
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
    useSearchableList<NewsItem>({ items: NEWS_ITEMS, containerHeight: LIST_HEIGHT, searchFields: ['text'], defaultItemHeight: 120 })

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
          <span className="demo__badge">{tab === 'emails' ? '5 000 emails' : '3 000 articles'}</span>
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
