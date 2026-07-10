import type { VirtualItem } from '../src/types'

// Demo fixtures for the virtualized list. Kept out of App.tsx so the (large,
// deterministic) dataset generation is unit-testable on its own and the counts
// that drive both the data and the UI badges live in one place.

// ─── Row model ──────────────────────────────────────────────────────────────

export interface EmailItem extends VirtualItem {
  subject: string; from: string; preview: string; date: string; unread: boolean
}

export interface NewsItem extends VirtualItem {
  headline: string; source: string; category: string; body: string; date: string
}

// ─── Sizing / counts (single source of truth for data *and* badges) ─────────

export const EMAIL_COUNT = 5000
export const NEWS_COUNT = 3000

/** Estimated row heights fed to the virtualizer before real measurement. */
export const EMAIL_ROW_HEIGHT = 96
export const NEWS_ROW_HEIGHT = 120

/** Characters of body text shown in an email's collapsed preview. */
const EMAIL_PREVIEW_LENGTH = 130

/** Every 4th email is unread; every 4th/… index → deterministic demo variety. */
const UNREAD_EVERY = 4

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
/** Emails share a date in groups of this many; news in groups of five. */
const EMAILS_PER_DAY = 3
const NEWS_PER_HOUR = 5

// ─── Templates ──────────────────────────────────────────────────────────────

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

// ─── Builders ────────────────────────────────────────────────────────────────

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * Builds the email dataset. `now` is injectable so tests get deterministic
 * dates; the running demo just uses the current time.
 */
export function buildEmailItems(now: number = Date.now()): EmailItem[] {
  return Array.from({ length: EMAIL_COUNT }, (_, i) => {
    const subject = SUBJECTS[i % SUBJECTS.length]
    const from = SENDERS[i % SENDERS.length]
    const body = BODIES[i % BODIES.length]
    return {
      id: `email-${i}`,
      // `text` is the concatenated search corpus the list indexes over.
      text: `${subject} ${from} ${body}`,
      type: 'email',
      subject,
      from,
      preview: body.slice(0, EMAIL_PREVIEW_LENGTH) + '…',
      date: formatDate(now - Math.floor(i / EMAILS_PER_DAY) * MS_PER_DAY),
      unread: i % UNREAD_EVERY === 0,
    }
  })
}

export function buildNewsItems(now: number = Date.now()): NewsItem[] {
  return Array.from({ length: NEWS_COUNT }, (_, i) => {
    const headline = NEWS_HEADLINES[i % NEWS_HEADLINES.length]
    const source = NEWS_SOURCES[i % NEWS_SOURCES.length]
    const category = NEWS_CATEGORIES[i % NEWS_CATEGORIES.length]
    const body = NEWS_BODIES[i % NEWS_BODIES.length]
    return {
      id: `news-${i}`,
      text: `${headline} ${source} ${category} ${body}`,
      type: 'news',
      headline,
      source,
      category,
      body,
      date: formatDate(now - Math.floor(i / NEWS_PER_HOUR) * MS_PER_HOUR),
    }
  })
}

/** Groups an integer with spaces (5000 → "5 000") for the header badges. */
export const formatCount = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const EMAIL_ITEMS: EmailItem[] = buildEmailItems()
export const NEWS_ITEMS: NewsItem[] = buildNewsItems()
