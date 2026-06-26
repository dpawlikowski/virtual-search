import React, { useMemo } from 'react'
import { useSearchableList } from '../src/hooks/useSearchableList'
import { useSearchToggle } from '../src/hooks/useSearchToggle'
import { SearchBar } from '../src/components/SearchBar'
import { HighlightedText } from '../src/components/HighlightedText'
import type { VirtualItem, MatchRange } from '../src/types'
import '../src/styles.css'
import './demo.css'

interface EmailItem extends VirtualItem {
  subject: string; from: string; preview: string; date: string; unread: boolean
}

const SENDERS = ['Alice Johnson', 'Bob Martinez', 'Carol White', 'David Kim', 'Eva Nowak', 'Frank Zhang', 'Grace Okonkwo', 'Hans Müller']
const SUBJECTS = ['Weekly engineering sync — agenda attached', 'Re: Q3 performance review cycle starts Monday', 'Action required: update your 2FA before Friday', 'Ship it Friday — release notes draft for review', 'Design review feedback on the new onboarding flow', 'Incident post-mortem: database connection pool exhaustion', 'Welcome to the team — your access has been provisioned', 'RFC: proposal for adopting TanStack Query across all frontends', 'Bug report: search returns empty results for CJK queries', 'Can we sync this week about the roadmap?']
const BODIES = ['I wanted to follow up on our conversation from last week regarding the architecture decision. After reviewing the options we discussed, I believe the approach using server-side rendering with hydration will serve our performance goals better than a pure client-side solution.', "Thanks for sending this over. I reviewed the attached document and have a few comments. The main concern is around the timeline — three weeks feels tight given the current team capacity. Can we discuss this in Thursday's planning session?", "Quick note to confirm that the deployment went smoothly. All health checks are passing and error rates are nominal. I'll keep an eye on latency metrics through the end of the day.", "The test suite is now green after fixing the race condition in the auth middleware. The root cause was a missing await in the session refresh logic. I've added a regression test.", "As discussed in the RFC, I'm proposing we standardize on a single state management pattern across the frontend apps. Right now we have three different approaches which makes it hard to onboard."]

const ALL_ITEMS: EmailItem[] = Array.from({ length: 5000 }, (_, i) => {
  const body = BODIES[i % BODIES.length]
  const subject = SUBJECTS[i % SUBJECTS.length]
  const from = SENDERS[i % SENDERS.length]
  const date = new Date(Date.now() - Math.floor(i / 3) * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return { id: `email-${i}`, text: `${subject} ${from} ${body}`, type: 'email', subject, from, preview: body.slice(0, 130) + '…', date, unread: i % 4 === 0 }
})

const BASE: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%' }

interface RowProps {
  item: EmailItem; index: number; translateY: number
  highlights: Map<string, MatchRange[]> | undefined
  isActiveMatch: boolean
  measureRef: (el: HTMLElement | null) => void
}

const EmailRow = React.memo<RowProps>(({ item, index, translateY, highlights, isActiveMatch, measureRef }) => {
  const ranges = highlights?.get('text')
  const style = useMemo(() => ({ ...BASE, transform: `translateY(${translateY}px)` }), [translateY])
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

export default function App() {
  const { items, virtualizer, search, setQuery, nextMatch, prevMatch, getHighlights, getIsActiveMatch, observeItem, containerRef, getHeightSource } =
    useSearchableList<EmailItem>({ items: ALL_ITEMS, containerHeight: 600, searchFields: ['text'], defaultItemHeight: 96 })

  // Ctrl+F (Cmd+F) toggles the search bar; Escape closes it.
  const { visible, inputRef, close } = useSearchToggle({
    onClose: () => setQuery(''),
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="demo">
      <header className="demo__header">
        <div className="demo__title"><h1>virtual-search</h1><span className="demo__badge">5 000 items</span></div>
        <p className="demo__sub">Virtualized list · hybrid height estimation · full-text search · scroll-to-match</p>
        <p className="demo__hint">Press <kbd>Ctrl</kbd>+<kbd>F</kbd> (or <kbd>⌘</kbd>+<kbd>F</kbd>) to {visible ? 'hide' : 'show'} search</p>
      </header>
      {visible && (
        <div className="demo__toolbar">
          <SearchBar search={search} onQueryChange={setQuery} onNext={nextMatch} onPrev={prevMatch}
            inputRef={inputRef} onEscape={close}
            placeholder="Search emails… (try 'RFC', 'deployment', 'race condition')" />
        </div>
      )}
      <div ref={containerRef} className="vs-container demo__list" style={{ height: 600 }} role="list">
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
      <footer className="demo__footer">
        <span>height sources → </span>
        {virtualItems.slice(0, 8).map(vi => {
          const item = items[vi.index]; const src = getHeightSource(vi.index)
          return <span key={item.id} className={`demo__source demo__source--${src}`}>{src}</span>
        })}
      </footer>
    </div>
  )
}
