import MiniSearch from 'minisearch'
import type { VirtualItem, SearchMatch, MatchRange, SearchOptions } from '../types'

/**
 * Whether `caseSensitive` should actually be honored when resolving
 * highlight ranges / snippets. Only `regex`/`exactMatch` modes extract terms
 * verbatim from the source text — fuzzy/prefix mode's terms come from
 * MiniSearch's tokenizer, which lowercases internally, so they can never
 * match case-sensitively regardless of the option.
 */
export function isHighlightCaseSensitive(options: SearchOptions): boolean {
  return !!(options.caseSensitive && (options.regex || options.exactMatch))
}

export function createSearchIndex<T extends VirtualItem>(
  items: T[],
  fields: string[]
): MiniSearch<T> {
  const index = new MiniSearch<T>({
    fields,
    storeFields: ['id', ...fields],
    searchOptions: {
      boost: { text: 2 },
      fuzzy: 0.15,
      prefix: true,
      combineWith: 'AND',
    },
  })
  index.addAll(items)
  return index
}

export function searchItems<T extends VirtualItem>(
  index: MiniSearch<T>,
  query: string,
  itemIndexMap: Map<string, number>,
  items?: T[],
  fields?: string[],
  options?: SearchOptions
): SearchMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  if (options?.regex && items && fields) {
    return searchItemsByPredicate(items, fields, itemIndexMap, makeRegexMatcher(trimmed, options.caseSensitive))
  }
  if (options?.exactMatch && items && fields) {
    return searchItemsByPredicate(
      items, fields, itemIndexMap,
      makeExactMatcher(trimmed, options.caseSensitive, options.wholeWord)
    )
  }

  // Fuzzy/prefix mode: wholeWord disables prefix matching so tokens must
  // match a full word instead of just its start.
  const results = index.search(trimmed, options?.wholeWord ? { prefix: false } : undefined)
  return results
    .filter(r => itemIndexMap.has(r.id as string))
    .map(r => {
      const itemId = r.id as string
      const fieldToTerms = new Map<string, Set<string>>()
      for (const [term, fields] of Object.entries(r.match as Record<string, string[]>)) {
        for (const field of fields) {
          if (!fieldToTerms.has(field)) fieldToTerms.set(field, new Set())
          fieldToTerms.get(field)!.add(term)
        }
      }

      const terms = new Map<string, string[]>()
      for (const [field, termSet] of fieldToTerms) {
        terms.set(field, Array.from(termSet))
      }

      return { itemId, index: itemIndexMap.get(itemId)!, score: r.score, terms }
    })
    .sort((a, b) => b.score - a.score)
}

/** Returns the literal matched substrings found in `text`, or null if none. */
type FieldMatcher = (text: string) => string[] | null

function makeRegexMatcher(query: string, caseSensitive?: boolean): FieldMatcher | null {
  let re: RegExp
  try {
    re = new RegExp(query, caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
  return (text: string) => {
    re.lastIndex = 0
    const found: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      // Zero-length matches (e.g. `a?`, `x*` against non-matching text) would
      // otherwise flag every item as a "match" — skip them, just advance.
      if (m[0] === '') {
        re.lastIndex++
        continue
      }
      found.push(m[0])
    }
    return found.length ? found : null
  }
}

function makeExactMatcher(query: string, caseSensitive?: boolean, wholeWord?: boolean): FieldMatcher {
  if (!query) return () => null

  if (wholeWord) {
    const re = new RegExp(`\\b${escapeRegex(query)}\\b`, caseSensitive ? 'g' : 'gi')
    return (text: string) => {
      re.lastIndex = 0
      return re.test(text) ? [query] : null
    }
  }

  const needle = caseSensitive ? query : query.toLowerCase()
  return (text: string) => {
    const haystack = caseSensitive ? text : text.toLowerCase()
    return haystack.includes(needle) ? [query] : null
  }
}

function searchItemsByPredicate<T extends VirtualItem>(
  items: T[],
  fields: string[],
  itemIndexMap: Map<string, number>,
  matcher: FieldMatcher | null
): SearchMatch[] {
  if (!matcher) return []
  const out: SearchMatch[] = []
  for (const item of items) {
    const itemIndex = itemIndexMap.get(item.id)
    if (itemIndex === undefined) continue
    const terms = new Map<string, string[]>()
    let total = 0
    for (const field of fields) {
      const val = (item as Record<string, unknown>)[field]
      if (typeof val !== 'string') continue
      const found = matcher(val)
      if (found) {
        terms.set(field, Array.from(new Set(found)))
        total += found.length
      }
    }
    if (terms.size > 0) {
      out.push({ itemId: item.id, index: itemIndex, score: total, terms })
    }
  }
  return out.sort((a, b) => a.index - b.index)
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Resolve character ranges for highlighted terms against real field text.
 * Called lazily — only for visible items.
 */
export function resolveRanges(
  text: string,
  terms: string[],
  caseSensitive = false,
  wholeWord = false
): MatchRange[] {
  const filtered = terms.filter(Boolean)
  if (!filtered.length || !text) return []
  const ranges: MatchRange[] = []
  for (const term of filtered) {
    const pattern = wholeWord ? `\\b${escapeRegex(term)}\\b` : escapeRegex(term)
    const re = new RegExp(pattern, caseSensitive ? 'g' : 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length })
    }
  }
  return mergeRanges(ranges)
}

export interface MatchSnippet {
  before: string
  match: string
  after: string
}

const SNIPPET_CONTEXT_CHARS = 28

/**
 * Builds a short "…before [match] after…" excerpt around the first
 * occurrence of any of `terms` in `text` — for tooltips/previews where the
 * full item text isn't shown (e.g. a minimap marker).
 */
export function buildMatchSnippet(
  text: string,
  terms: string[],
  caseSensitive = false,
  contextChars = SNIPPET_CONTEXT_CHARS
): MatchSnippet | null {
  const ranges = resolveRanges(text, terms, caseSensitive)
  if (!ranges.length) return null
  const { start, end } = ranges[0]

  const beforeStart = Math.max(0, start - contextChars)
  const afterEnd = Math.min(text.length, end + contextChars)

  return {
    before: (beforeStart > 0 ? '…' : '') + text.slice(beforeStart, start),
    match: text.slice(start, end),
    after: text.slice(end, afterEnd) + (afterEnd < text.length ? '…' : ''),
  }
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length <= 1) return ranges
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: MatchRange[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end)
    } else {
      merged.push(sorted[i])
    }
  }
  return merged
}
