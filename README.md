# virtual-search

A React library for searchable virtual lists. It searches the full data set, scrolls to matches, highlights the text the user entered, and estimates row heights before they are measured.

```
npm install @virtual-search/core
```

---

## The problem

Virtualizers like TanStack Virtual or react-virtuoso are fast because they render only what is visible. This creates two hard problems that no existing library solves together:

1. **Height estimation is guesswork.** Variable-height items have unknown heights before they're rendered. A virtualizer needs *some* estimate for items it hasn't measured yet, and a bad estimate makes the scrollbar jump as real heights come in.

2. **Search breaks with virtualization.** The browser's `Ctrl+F` cannot find text that is not in the DOM. A custom search has to inspect the full data set, find the right row, and ask the virtualizer to render it.

This library solves both. Runtime measurement and scroll anchoring are delegated to TanStack Virtual (which does them well); the value added here is a smart **initial** height estimate plus a search layer wired into the virtualizer.

---

## Features

- **Hybrid initial height estimation**: 4-layer cascade: server hints → IndexedDB (previous sessions) → Pretext (off-thread text measurement) → EMA fallback
- **Measurement owned by TanStack Virtual**: once an item renders, `measureElement` takes over; no duplicate ResizeObserver, no manual scroll anchoring to fight with
- **Search across the full list:** MiniSearch indexes every item, including rows that are not currently in the DOM. The default mode supports fuzzy matches, prefixes, and literal fragments inside words. For example, `ra` finds the same fragment in `rapid` and `vulnerability`.
- **Regex, exact match, whole word, and case sensitivity:** pass `setSearchOptions` to `SearchBar` to show the built-in controls.
- **Optional server search**: pass `onServerSearch` to merge extra results from wherever you fetch them into the local list. Transport-agnostic (no `fetch`/HTTP baked in): debounced, cancels stale in-flight requests via `AbortSignal`, ignores out-of-order responses, and its code lives in a separate hook (`useServerSearch`) so it tree-shakes away entirely for consumers who never set the option
- **Scroll-to-match**: jumps to the exact item containing the match, centers it in the viewport, and self-corrects on the next frame once unmeasured items settle into their real height
- **Match minimap**: `MatchMinimap` renders a find-in-page style marker track alongside the scroll container, with click-to-jump
- **Ctrl+F to show/hide**: optional `useSearchToggle` hook binds Ctrl+F (Cmd+F on macOS) to toggle the search bar, auto-focuses the input, and closes on Escape
- **Inline highlight**: character-level ranges passed to your item renderer; the provided `HighlightedText` component renders the spans
- **TypeScript-first**: strict types throughout, zero `any`

---

## Quick start

```tsx
import { useSearchableList, SearchBar, HighlightedText } from '@virtual-search/core'
import '@virtual-search/core/styles.css'

interface Doc {
  id: string
  text: string   // required: used for search and height measurement
  title: string
}

function DocumentList({ docs }: { docs: Doc[] }) {
  const {
    items,
    virtualizer,
    search,
    setQuery,
    nextMatch,
    prevMatch,
    getHighlights,
    getIsActiveMatch,
    observeItem,
    containerRef,
  } = useSearchableList<Doc>({
    items: docs,
    containerHeight: 600,
    searchFields: ['title', 'text'],
  })

  return (
    <>
      <SearchBar
        search={search}
        onQueryChange={setQuery}
        onNext={nextMatch}
        onPrev={prevMatch}
      />

      <div ref={containerRef} style={{ height: 600, overflow: 'auto' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const doc = items[vi.index]
            const highlights = getHighlights(vi.index)
            return (
              <div
                key={doc.id}
                ref={observeItem}              // wires TanStack measurement + height cache
                data-index={vi.index}          // required by TanStack measureElement
                data-vs-item-id={doc.id}       // required: identifies the item for the cache
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <h3>
                  <HighlightedText text={doc.title} ranges={highlights?.get('title')} />
                </h3>
                <p>
                  <HighlightedText text={doc.text} ranges={highlights?.get('text')} />
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
```

Two attributes are required on each item element:
- `ref={observeItem}`: wires the element into TanStack's measurement and persists the measured height to the cache
- `data-index={vi.index}`: TanStack's `measureElement` reads this to know which item it's measuring
- `data-vs-item-id={item.id}`: identifies the item for the IndexedDB height cache. In development builds, `observeItem` logs a `console.warn` if this is missing on a rendered element, since without it the item's height silently never persists and match navigation to it can misbehave.

For best performance, wrap your row in `React.memo` and pass primitives (`translateY`, `index`) rather than the virtual-item object.

---

## Height estimation: how it works

The library produces an **initial** estimate for each not-yet-rendered item through a 4-layer priority cascade. Once an item is rendered, TanStack Virtual measures it for real and that measurement is authoritative.

```
items load
  │
  ├─ 1. server hints (item._hints[bucket])
  │    p50 per viewport bucket, returned alongside API data
  │    Zero extra round-trip. Used when n ≥ serverHintMinSamples.
  │
  ├─ 2. IndexedDB (this browser's previous sessions)
  │    Key: itemId + viewport bucket + font hash
  │    Invalidated automatically on font change or TTL (30 days)
  │
  ├─ 3. Pretext Web Worker (off-thread text measurement)
  │    prepare(text, font) → layout(prepared, width, lineHeight)
  │    Pure arithmetic after one-time canvas measurement
  │    Falls back to a character-count heuristic if pretext isn't installed
  │
  └─ 4. EMA fallback (current session running average)
       Exponential moving average, per item type when types are provided
       Stabilises after a few measured items
```

After render, TanStack measures the element. The library reads that height, stores it (feeding the EMA and persisting to IndexedDB, debounced), and TanStack handles scroll anchoring internally: no manual `scrollTop` adjustment.

### Server hints

Return `_hints` from your API alongside item data:

```ts
interface ItemWithHints {
  id: string
  text: string
  _hints: {
    sm?: { p50: number; n: number }
    md?: { p50: number; n: number }
    lg?: { p50: number; n: number }
  }
}
```

Collect measurements via `onMeasureReport` and aggregate server-side using the P2 algorithm for running percentiles without storing raw values.

### Pretext-powered measurement

`@chenglou/pretext` ships as a regular dependency and is used automatically by the Pretext worker for precise off-thread text measurement: line-breaking aware of real font metrics, accurate across varying text lengths and widths. If it ever fails to load in a given environment, the worker falls back to a character-count estimator (~80% accurate for typical text).

**Caveat:** Pretext requires a named font (`16px Inter`, not `system-ui`).

---

## API

### `useSearchableList(options)`

```ts
interface UseSearchableListOptions<T extends VirtualItem> {
  // Required
  items: T[]

  // Search
  searchFields?: Array<keyof T & string>    // default: ['text']
  onServerSearch?: (q: string, signal: AbortSignal) => Promise<T[]>  // optional: transport-agnostic, bring your own fetch/GraphQL/etc.
  serverSearchDebounce?: number             // default: 250ms
  serverSearchMinLength?: number            // default: 1: queries shorter than this never call onServerSearch
  mergeServerResults?: (base: T[], server: T[]) => T[]  // default: append server results not already present by id

  // Height estimation
  containerHeight?: number                  // applied directly to the container's style.height: no need to also set it in your own CSS
  serverHintMinSamples?: number             // default: 10
  onMeasureReport?: (id: string, height: number, bucket: ViewportBucket) => void
  defaultItemHeight?: number                // default: 150px

  // Storage
  cacheStoreName?: string                   // default: 'virtual-search-heights'
  cacheTtlMs?: number                       // default: 30 days: how long a cached height stays valid

  // Errors
  onSearchError?: (error: unknown) => void  // called when onServerSearch rejects: local search keeps working regardless

  // Tuning: sensible defaults, override only if profiling shows a need to
  persistDebounceMs?: number                // default: 500ms: debounce before a measured height is written to IndexedDB
  resizeDebounceMs?: number                 // default: 200ms: debounce before a container resize triggers Pretext re-layout
  overscan?: number                         // default: 4: extra items rendered outside the viewport, passed to TanStack Virtual
  scrollAlign?: 'start' | 'center' | 'end' | 'auto'  // default: 'center'; used by nextMatch, prevMatch, and goToMatch
}
```

Returns:

| Property | Type | Description |
|---|---|---|
| `items` | `T[]` | Local items, plus any `onServerSearch` results merged in |
| `virtualizer` | TanStack virtualizer | Full TanStack Virtual instance |
| `search` | `SearchState` | `{ query, matches, activeMatchIndex, isSearching, options }` |
| `setQuery` | `(q: string) => void` | Update search query |
| `setSearchOptions` | `(options: Partial<SearchOptions>) => void` | Toggle `regex` / `exactMatch` / `caseSensitive` / `wholeWord` and re-run the current query |
| `nextMatch` | `() => void` | Move to next match and scroll to it |
| `prevMatch` | `() => void` | Move to previous match and scroll to it |
| `goToMatch` | `(matchIndex: number) => void` | Jump directly to a match by index (e.g. from a `MatchMinimap` marker) |
| `getHighlights` | `(index: number) => Map<field, MatchRange[]> \| undefined` | Character ranges for a given item (lazy: only for visible items) |
| `getIsActiveMatch` | `(itemId: string) => boolean` | O(1) check whether an item is the active match |
| `observeItem` | `(el: HTMLElement \| null) => void` | Ref callback for each item element |
| `containerRef` | `RefObject<HTMLDivElement>` | Attach to the scroll container |
| `getHeightSource` | `(index: number) => HeightSource` | Debug: which layer provided the initial height |
| `isServerSearching` | `boolean` | True while an `onServerSearch` request is in flight: independent of `search.isSearching` (local index search) |

### Search options

```ts
interface SearchOptions {
  regex?: boolean          // treat the query as a regular expression
  exactMatch?: boolean     // literal substring; add wholeWord for word boundaries
  caseSensitive?: boolean  // applies to regex and exactMatch
  wholeWord?: boolean      // exact full tokens; ignored in regex mode
}
```

```tsx
const { search, setSearchOptions } = useSearchableList({ items })

<SearchBar search={search} onOptionsChange={setSearchOptions} /* …rest */ />
```

`SearchBar` shows four controls when you pass `onOptionsChange`: `.*` for regex, `" "` for exact match, `|ab|` for whole word, and `Aa` for case sensitivity. Leave out `onOptionsChange` if you do not want to show them.

Choose `searchFields` from the fields people can actually see. If an email row shows `from`, `subject`, and `preview`, pass all three:

```tsx
useSearchableList({
  items: emails,
  searchFields: ['from', 'subject', 'preview'],
})
```

The keys returned by `getHighlights` match these field names. Use the matching key when rendering each value. A field that is present only inside a concatenated `text` value can be found, but it cannot be highlighted accurately in its separate visual element.

#### How the modes differ

| Options | Meaning | Does `whit` find `White`? | Does `whit` find `Whittaker`? |
| --- | --- | ---: | ---: |
| none (default) | substring + prefix + typo-tolerant token search | yes, as a literal prefix (and also within fuzzy distance) | yes, as a literal prefix |
| `wholeWord` | identical complete tokens only | no | no |
| `exactMatch` | identical contiguous substring; word boundaries are not implied | yes | yes |
| `exactMatch + wholeWord` | identical contiguous word or phrase with boundaries on both ends | no | no |
| `regex` | JavaScript regular expression | yes for `/whit/i` | yes for `/whit/i` |

A **token** is a run of letters or numbers produced by the full-text index. Punctuation and whitespace separate tokens. Search is case-insensitive unless the active direct-scanning mode supports `caseSensitive`.

The default mode deliberately combines three result sources:

- Literal substring matching: `ra` finds `rapid`, `paragraph`, and `vulnerability`.
- Prefix matching: `whit` finds a token such as `Whittaker`.
- Fuzzy matching: a close misspelling such as `quik` can find `quick`. MiniSearch calculates the permitted edit distance from `fuzzy: 0.15`; this is typo tolerance, not a word-boundary guarantee.

`whit` → `White` deserves special attention: it may look like typo correction, but `whit` is also a literal prefix of `White`. The default mode can therefore obtain this result from substring/prefix matching even without fuzzy search. Enabling **Whole word** must disable both prefix and fuzzy matching: either one would violate the promise of an identical complete token. With Whole word enabled, `whit` does not find `White`; it still finds a standalone token spelled `Whit`.

`exactMatch` is best read as **literal substring**. It disables the index's fuzzy and prefix mechanisms but does not imply word boundaries: its direct substring scan still matches `whit` inside both `White` and `Whittaker`. Add `wholeWord` to require boundaries. For a multi-word query, `exactMatch + wholeWord` requires one contiguous phrase with a boundary before its first character and after its last character.

`wholeWord` without `exactMatch` uses the full-text index. Every query token must be present as an identical full token because the index is configured with `combineWith: 'AND'`; the words do not have to form one adjacent phrase or appear in query order. Use `exactMatch + wholeWord` when adjacency and order matter.

Word boundaries in literal whole-word mode are Unicode-aware and treat letters and numbers as word characters. Therefore `café` matches the standalone word `café` but not the prefix in `cafés`. Underscores and punctuation are separators under this boundary definition.

`regex` treats the query as a JavaScript regular expression. Invalid expressions return no results instead of throwing, and zero-length matches are ignored. `wholeWord` is disabled in this mode because the expression must define its own boundaries. Note that JavaScript `\b` is not equivalent to this library's Unicode-aware letter/number boundary.

`caseSensitive` applies only to regex and exact match. The indexed default and Whole word modes are case-insensitive because MiniSearch lowercases terms by default. Accordingly, the `Aa` control is disabled in those modes, while `|ab|` is disabled in regex mode.

Highlighting follows the source of the match. A literal or prefix query highlights the typed text (`w` in `week`), while a fuzzy match with no literal occurrence highlights the actual indexed token that matched (`quick` for `quik`).

Regex and exact match are mutually exclusive. The core library normalizes these options, so custom search controls behave the same way as `SearchBar`.

### `MatchMinimap`

Overlays the scroll container's own scrollbar track with small yellow ticks: like find-in-page in browsers/VSCode: rather than floating as a separate strip beside it. Each marker's position comes from the match's real offset in the full (possibly virtualized, not-yet-rendered) list via `virtualizer.getOffsetForIndex`, so it reflects where the match actually is, not an approximation. Dense result sets are bucketed to the track's real pixel height so they render as a handful of distinct rectangles instead of one solid bar. Positions are computed across the *entire* list, so matches deep in not-yet-rendered territory still show up at the right spot: click anywhere on the track to jump straight there without first scrolling to find it.

A dense result set can fill the whole track with marker ticks and hide the scrollbar thumb. To keep scrolling usable, `MatchMinimap` renders its own draggable thumb above the markers. It uses a distinct color and extends slightly beyond the track, so it remains easy to see and grab.

A bucket's match count is limited by the number of pixels available on the track. In a long list, one bucket can represent matches spread across a sizeable area. The label therefore says `~N matches in this area` instead of suggesting an exact position. The marker also grows with the number of matches, up to a sensible limit.

**Important: `MatchMinimap` must be a DOM sibling of the scroll container, not a child of it.** It needs a *non-scrolling* positioned ancestor to anchor to; if you nest it inside the element that has `overflow: auto`, its `position: absolute` offsets get carried along by that element's own scrolling and it visually disappears as soon as you scroll past the first viewport-height of content:

```tsx
<div className="vs-list-wrapper">{/* plain position: relative, does NOT scroll */}
  <div ref={containerRef} className="vs-container" style={{ height: 600 }}>
    {/* …virtualized items… */}
  </div>

  <MatchMinimap
    virtualizer={virtualizer}
    matches={search.matches}
    activeMatchIndex={search.activeMatchIndex}
    onJump={goToMatch}
    items={items}              // optional: enables the hover tooltip. Plain VirtualItem[] is enough, no need to narrow the type
    searchOptions={search.options}  // optional: passed straight from useSearchableList
    markerHeightPx={4}         // optional: default 4
    snippetContextChars={28}   // optional: chars of context on each side of the match in the tooltip, default 28
  />
</div>
```

`.vs-list-wrapper` (just `position: relative`) is included in `styles.css`: reuse it, or apply the same on your own wrapper.

- **Click anywhere on the track**, not just exactly on a marker, to jump to the nearest match.
- **Hover (or focus) a marker** to see a tooltip with a short excerpt around that match and the searched term in bold: pass `items` to enable it.
- **Keyboard:** the track uses one Tab stop. Arrow keys move between markers, Home and End go to the first or last marker, and Enter or Space opens the focused match. This avoids adding hundreds of stops to the page's tab order.
- The `.vs-container` scrollbar has a known width through `--vs-scrollbar-width`, which defaults to `10px`. This lets the minimap line up with the scrollbar at every scroll position.

### `VirtualItem` interface

Every item must implement:

```ts
interface VirtualItem {
  id: string          // stable unique identifier
  text: string        // full plain-text content (searched + measured)
  type?: string       // optional: enables per-type EMA
  _hints?: ServerHeightHints
}
```

### `useSearchToggle(options?)`

Binds Ctrl+F (Cmd+F on macOS) to show/hide the search bar. Auto-focuses and selects the input when opened; Escape closes it. Prevents the browser's native find dialog by default.

```tsx
import { useSearchToggle, SearchBar } from '@virtual-search/core'

function List() {
  const { setQuery, /* …rest of useSearchableList */ } = useSearchableList({ /* … */ })

  const { visible, inputRef, close } = useSearchToggle({
    onClose: () => setQuery(''),   // clear results when the bar is hidden
  })

  return (
    <>
      {visible && (
        <SearchBar
          inputRef={inputRef}      // enables auto-focus on Ctrl+F
          onEscape={close}         // Escape clears query AND hides the bar
          search={search}
          onQueryChange={setQuery}
          onNext={nextMatch}
          onPrev={prevMatch}
        />
      )}
      {/* …virtualized list… */}
    </>
  )
}
```

Options:

```ts
interface UseSearchToggleOptions {
  initialVisible?: boolean          // default: false
  preventDefault?: boolean          // default: true: block native find dialog
  scopeRef?: RefObject<HTMLElement> // only toggle when focus is within this element
  onOpen?: () => void
  onClose?: () => void
}
```

Returns `{ visible, open, close, toggle, inputRef }`.

Pass `inputRef` to `SearchBar` so the input focuses automatically when the bar opens, and pass `onEscape={close}` so Escape both clears the query and hides the bar. Without `onEscape`, Escape only clears the query and blurs the input.

### `HighlightedText`

```tsx
<HighlightedText
  text={string}
  ranges={MatchRange[] | undefined}
  highlightClassName="vs-highlight"    // override CSS class
  activeRangeIndex={number}            // marks one range as active
/>
```

### `SearchBar`

Keyboard: `Enter` → next match, `Shift+Enter` → previous match, `Escape` → clear (and hide, if `onEscape` is provided).

```tsx
<SearchBar
  search={SearchState}
  onQueryChange={(q) => void}
  onNext={() => void}
  onPrev={() => void}
  placeholder="Search…"
  className=""
  inputRef={inputRef}     // optional: from useSearchToggle, enables auto-focus
  onEscape={() => void}   // optional: called on Escape (e.g. to hide the bar)
  labels={{                // optional: override any built-in English string/aria-label for localization
    searchInputAriaLabel: 'Szukaj…',
    noResults: 'Brak wyników',
    // ...see SearchBarLabels for the full list; unspecified keys keep their English default
  }}
/>
```

---

## Architecture decisions

### Why delegate measurement to TanStack Virtual?

An earlier version used its own `ResizeObserver` in addition to TanStack's observer and also adjusted `scrollTop` manually. Both systems measured and moved the same list, which caused slow scrolling and unstable positions. TanStack's `measureElement` now owns runtime measurement and scroll anchoring. This library supplies only the initial estimate and reads the final measurement.

### Why MiniSearch over Fuse.js or FlexSearch?

MiniSearch gives us a compact full-text index, prefix search, fuzzy matching, field boosting, and information about the matched terms. The library adds a literal substring pass for browser-like matches inside words. It then combines both result sets without duplicating items. This keeps typo tolerance while making short queries behave naturally.

### Why IndexedDB over localStorage for the height cache?

localStorage is synchronous and blocks the main thread; a bulk write at 10 000 items causes visible jank. IndexedDB is async, effectively unbounded, and `getAll()` makes bulk reads fast. OPFS would win for large binary blobs, but height cache is tiny JSON: OPFS's Worker-only sync API isn't worth the complexity.

### Why Pretext in a Web Worker?

`prepare()` calls canvas `measureText()`: fast but not free; running it for 10 000 items synchronously blocks the main thread. In a Worker it runs off-thread. On resize, only the cheap `layout()` re-runs, not `prepare()`.

### Why a 4-layer cascade instead of measuring everything up front?

You can't measure an element that isn't in the DOM, and rendering 10 000 elements to measure them defeats virtualization. Each layer trades latency for accuracy: server hints arrive before first render; IndexedDB has this user's real past measurements; Pretext is accurate for plain text without the DOM; EMA always works and improves as items are measured.

### Search incremental indexing

The MiniSearch index is created once. New items are added incrementally, and items that disappear are discarded. Rebuilding the full index after every update would block the main thread on larger lists.

### Server search: design and why it's tree-shakeable

`onServerSearch` is a plain `(query, signal) => Promise<T[]>` callback. The library does not assume `fetch`, a particular HTTP client, or an endpoint shape. The data can come from REST, GraphQL, a local worker, or a test fixture.

The debounce/cancellation/merge machinery lives entirely in a separate hook, `useServerSearch` (`src/hooks/useServerSearch.ts`), that `useSearchableList` composes in:

- **Debounced** by `serverSearchDebounce` (default 250ms) and gated by `serverSearchMinLength` (default 1) so short/rapid keystrokes don't spam your search function.
- **Cancellation-aware**: each call gets its own `AbortController`; the previous one is aborted before a new request starts. Pass the `signal` argument to `fetch`/your client to actually cancel network work; if you don't, the hook still protects you via the next point.
- **Stale-response guard**: every request is tagged with a monotonic id. If a slower earlier request resolves after a newer one already landed, its result is silently dropped, whether or not `signal` is wired up.
- **Pluggable merge**: `mergeServerResults(base, server)` controls how results combine with local `items`. The default appends server items not already present by `id`; override it to sort, cap the list, or replace instead of append.
- **Independent loading state**: `isServerSearching` reflects only the server round-trip, so a slow network call doesn't show up as the (synchronous) local `search.isSearching` flag.

The server search code lives in a separate hook instead of being inlined into `useSearchableList`. A bundler can remove its debounce, cancellation, and stale-response logic when an application never passes `onServerSearch`.

A couple of correctness details worth knowing if you're relying on this closely:

- **Below `serverSearchMinLength`, results are cleared, not just skipped.** If a longer query already merged server results in and you then delete characters below the threshold, those results are dropped immediately rather than lingering until the next qualifying query overwrites them.
- **Matches and highlights update when `items` changes.** If server results or a custom merge function changes the list during an active search, matches are calculated again. New matching rows are highlighted and immediately available through `nextMatch` and `prevMatch`.
- **IndexedDB eviction runs once per cache config, not once per keystroke.** Cleanup depends on `cacheStoreName` and `cacheTtlMs`, not on `items`. A burst of server results therefore does not trigger a full IndexedDB scan after every character.
- **The height-init pass cancels itself if superseded.** If `items` changes again (e.g. a fast second server response) before the server-hints → IndexedDB → Pretext cascade for the previous change finishes, the stale run bails out instead of applying outdated heights or sending a redundant batch to the Pretext worker.

### How this compares to react-window / react-virtuoso on height estimation

`react-window`'s `VariableSizeList` starts with one `estimatedItemSize` and corrects it through `resetAfterIndex` after a row renders. It has no richer initial estimate. See [bvaughn/react-window#6](https://github.com/bvaughn/react-window/issues/6) and [#190](https://github.com/bvaughn/react-window/issues/190). `react-virtuoso` handles unknown heights well at runtime, but it does not include off-thread text measurement. This library starts with four sources: server hints, IndexedDB, Pretext, and EMA. That produces a better first estimate, with the extra complexity described above.

---

## Known limitations

- **Mixed content items** (images, tables, custom elements): Pretext measures plain text only, so the initial estimate may be wrong. TanStack corrects it after the first render. Add `ref={observeItem}` and `data-index` so that measurement can happen.
- **CSS margins on item children**: measured height excludes margins. Use padding instead of margin, or `overflow: hidden` on the item container.
- **`system-ui` font**: canvas measurement and DOM diverge on macOS with `system-ui`. Use a named font (`Inter`, `Arial`, …) for accurate pre-render estimation.
- **SSR**: `getComputedStyle`, `ResizeObserver`, and `IndexedDB` are browser-only. The hook falls back to `defaultItemHeight` during SSR and hydrates on the client.

---

## Development

```bash
npm install
npm run dev       # demo at http://localhost:5173
npm test          # vitest: 213 tests
npm run lint
npm run lint:fix  # auto-fix what ESLint can
npm run typecheck
```

For architecture details and contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md). It explains the measurement model, the four height sources, and the rules for changing search or measurement logic.

---

## License

MIT
