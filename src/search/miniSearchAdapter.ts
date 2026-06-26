import MiniSearch from 'minisearch'
import type { VirtualItem, SearchMatch, MatchRange } from '../types'

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
    },
  })
  index.addAll(items)
  return index
}

export function searchItems<T extends VirtualItem>(
  index: MiniSearch<T>,
  query: string,
  itemIndexMap: Map<string, number>
): SearchMatch[] {
  if (!query.trim()) return []

  const results = index.search(query)
  return results
    .filter(r => itemIndexMap.has(r.id as string))
    .map(r => {
      const itemId = r.id as string
      // MiniSearch match structure: { term: string[] of fields that matched }
      // We invert to: field → Set<term>
      const fieldToTerms = new Map<string, Set<string>>()
      for (const [term, fields] of Object.entries(r.match as Record<string, string[]>)) {
        for (const field of fields) {
          if (!fieldToTerms.has(field)) fieldToTerms.set(field, new Set())
          fieldToTerms.get(field)!.add(term)
        }
      }

      const highlights = new Map<string, MatchRange[]>()
      for (const [field, terms] of fieldToTerms) {
        const ranges = Array.from(terms).map(term =>
          ({ start: -1, end: -1, term }) as MatchRange & { term: string }
        )
        highlights.set(field, ranges)
      }

      return { itemId, index: itemIndexMap.get(itemId)!, score: r.score, highlights }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Resolve character ranges from term list against real field text.
 * Called lazily in the item renderer — only for visible items.
 */
export function resolveRanges(text: string, terms: string[]): MatchRange[] {
  if (!terms.length || !text) return []
  const ranges: MatchRange[] = []
  const lowerText = text.toLowerCase()

  for (const term of terms) {
    if (!term) continue
    const lowerTerm = term.toLowerCase()
    let pos = 0
    while (pos < lowerText.length) {
      const idx = lowerText.indexOf(lowerTerm, pos)
      if (idx === -1) break
      ranges.push({ start: idx, end: idx + term.length })
      pos = idx + 1
    }
  }

  return mergeRanges(ranges)
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
