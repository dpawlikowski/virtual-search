# virtual-search

Virtualized list for React with hybrid height estimation, full-text search across **all** data (not just visible items), and scroll-to-match with highlight.

```
npm install @virtual-search/core
```

---

## The problem

Virtualizers like TanStack Virtual or react-virtuoso only render what's visible — which is why they're fast. But this creates two hard problems no existing library solves together:

1. **Height estimation is guesswork.** Variable-height items have unknown heights before they're rendered. A virtualizer needs *some* estimate for items it hasn't measured yet, and a bad estimate makes the scrollbar jump as real heights come in.

2. **Search breaks with virtualization.** The browser's `Ctrl+F` can't find text that isn't in the DOM. Custom search has to work against the full in-memory dataset and then scroll to the exact match — which the virtualizer has to render first.

This library solves both. Runtime measurement and scroll anchoring are delegated to TanStack Virtual (which does them well); the value added here is a smart **initial** height estimate plus a search layer wired into the virtualizer.

---

## Features

- **Hybrid initial height estimation** — 4-layer cascade: server hints → IndexedDB (previous sessions) → Pretext (off-thread text measurement) → EMA fallback
- **Measurement owned by TanStack Virtual** — once an item renders, `measureElement` takes over; no duplicate ResizeObserver, no manual scroll anchoring to fight with
- **Full-text search** — MiniSearch indexes every item immediately, including text not currently rendered in the DOM
- **Regex / exact-match / case-sensitive search modes** — toggle via `setSearchOptions`; `SearchBar` ships with `.*` / `" "` / `Aa` buttons when `onOptionsChange` is passed
- **Optional server search** — pass `onServerSearch` to merge extra results from your API into the local list (lightweight, no worker, fully optional)
- **Scroll-to-match** — jumps to the exact item containing the match, centers it in the viewport, and self-corrects on the next frame once unmeasured items settle into their real height
- **Match minimap** — `MatchMinimap` renders a find-in-page style marker track alongside the scroll container, with click-to-jump
- **Ctrl+F to show/hide** — optional `useSearchToggle` hook binds Ctrl+F (Cmd+F on macOS) to toggle the search bar, auto-focuses the input, and closes on Escape
- **Inline highlight** — character-level ranges passed to your item renderer; the provided `HighlightedText` component renders the spans
- **TypeScript-first** — strict types throughout, zero `any`

---

## Quick start

```tsx
import { useSearchableList, SearchBar, HighlightedText } from '@virtual-search/core'
import '@virtual-search/core/styles.css'

interface Doc {
  id: string
  text: string   // required — used for search and height measurement
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
                data-vs-item-id={doc.id}       // required — identifies the item for the cache
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <h3>
                  <HighlightedText text={doc.title} ranges={highlights?.get('text')} />
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
- `ref={observeItem}` — wires the element into TanStack's measurement and persists the measured height to the cache
- `data-index={vi.index}` — TanStack's `measureElement` reads this to know which item it's measuring
- `data-vs-item-id={item.id}` — identifies the item for the IndexedDB height cache

For best performance, wrap your row in `React.memo` and pass primitives (`translateY`, `index`) rather than the virtual-item object.

---

## Height estimation — how it works

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

After render, TanStack measures the element. The library reads that height, stores it (feeding the EMA and persisting to IndexedDB, debounced), and TanStack handles scroll anchoring internally — no manual `scrollTop` adjustment.

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

`@chenglou/pretext` ships as a regular dependency and is used automatically by the Pretext worker for precise off-thread text measurement — line-breaking aware of real font metrics, accurate across varying text lengths and widths. If it ever fails to load in a given environment, the worker falls back to a character-count estimator (~80% accurate for typical text).

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
  onServerSearch?: (q: string) => Promise<T[]>   // optional — merge extra results
  serverSearchDebounce?: number             // default: 250ms

  // Height estimation
  containerHeight?: number                  // informational — set this same value on the container via CSS
  serverHintMinSamples?: number             // default: 10
  onMeasureReport?: (id: string, height: number, bucket: ViewportBucket) => void
  defaultItemHeight?: number                // default: 150px

  // Storage
  cacheStoreName?: string                   // default: 'virtual-search-heights'

  // Tuning — sensible defaults, override only if profiling shows a need to
  persistDebounceMs?: number                // default: 500ms — debounce before a measured height is written to IndexedDB
  resizeDebounceMs?: number                 // default: 200ms — debounce before a container resize triggers Pretext re-layout
  overscan?: number                         // default: 4 — extra items rendered outside the viewport, passed to TanStack Virtual
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
| `getHighlights` | `(index: number) => Map<field, MatchRange[]> \| undefined` | Character ranges for a given item (lazy — only for visible items) |
| `getIsActiveMatch` | `(itemId: string) => boolean` | O(1) check whether an item is the active match |
| `observeItem` | `(el: HTMLElement \| null) => void` | Ref callback for each item element |
| `containerRef` | `RefObject<HTMLDivElement>` | Attach to the scroll container |
| `getHeightSource` | `(index: number) => HeightSource` | Debug: which layer provided the initial height |

### Search options — regex / exact match / whole word / case sensitivity

```ts
interface SearchOptions {
  regex?: boolean          // treat the query as a regular expression
  exactMatch?: boolean     // literal substring match instead of fuzzy/prefix (ignored if `regex` is set)
  caseSensitive?: boolean  // only applies to regex/exactMatch — fuzzy search is always case-insensitive
  wholeWord?: boolean      // word-boundary constrained; disables prefix matching in fuzzy mode. Ignored if `regex` is set
}
```

```tsx
const { search, setSearchOptions } = useSearchableList({ items })

<SearchBar search={search} onOptionsChange={setSearchOptions} /* …rest */ />
```

`SearchBar` renders `.*` (regex), `" "` (exact match), `|ab|` (whole word), and `Aa` (case sensitive) toggle buttons whenever `onOptionsChange` is passed. Omit the prop to hide them and keep plain fuzzy search.

Two toggles are conditionally disabled, matching what actually has an effect:
- **`Aa`** is disabled unless `regex` or `exactMatch` is active — MiniSearch's fuzzy/prefix terms are lowercased internally, so case-sensitivity has no meaningful effect in plain fuzzy mode.
- **`|ab|`** is disabled while `regex` is active — write `\b` yourself for full control there.

### `MatchMinimap`

Overlays the scroll container's own scrollbar track with small yellow ticks — like find-in-page in browsers/VSCode — rather than floating as a separate strip beside it. Each marker's position comes from the match's real offset in the full (possibly virtualized, not-yet-rendered) list via `virtualizer.getOffsetForIndex`, so it reflects where the match actually is, not an approximation. Dense result sets are bucketed to the track's real pixel height so they render as a handful of distinct rectangles instead of one solid bar. Positions are computed across the *entire* list, so matches deep in not-yet-rendered territory still show up at the right spot — click anywhere on the track to jump straight there without first scrolling to find it.

A dense result set can fill the whole track with marker ticks, burying the scrollbar thumb underneath with no visible handle left to grab — so `MatchMinimap` also renders its own scroll-position thumb on top of the markers (higher `z-index`, a distinct color, protruding slightly past the track's right edge), reflecting the scroll container's real viewport and fully draggable to scroll.

A bucket's match count is a pixel-resolution artifact, not a "these are all right next to each other" guarantee — at low zoom (a long list against a short track) a single bucket can lump together matches actually scattered across a large chunk of the list. It's labeled `~N matches in this area` (both the `aria-label` and the hover tooltip) rather than implying an exact, tightly-clustered position, and the marker's own height grows (log-scaled, capped) with cluster size so a genuinely dense cluster reads as a visibly thicker band than a single match's thin tick.

**Important — `MatchMinimap` must be a DOM sibling of the scroll container, not a child of it.** It needs a *non-scrolling* positioned ancestor to anchor to; if you nest it inside the element that has `overflow: auto`, its `position: absolute` offsets get carried along by that element's own scrolling and it visually disappears as soon as you scroll past the first viewport-height of content:

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
    items={items}              // optional — enables the hover tooltip. Plain VirtualItem[] is enough, no need to narrow the type
    searchOptions={search.options}  // optional — passed straight from useSearchableList
    markerHeightPx={4}         // optional — default 4
    snippetContextChars={28}   // optional — chars of context on each side of the match in the tooltip, default 28
  />
</div>
```

`.vs-list-wrapper` (just `position: relative`) is included in `styles.css` — reuse it, or apply the same on your own wrapper.

- **Click anywhere on the track**, not just exactly on a marker, to jump to the nearest match.
- **Hover (or focus) a marker** to see a tooltip with a short excerpt around that match and the searched term in bold — pass `items` to enable it.
- **Keyboard**: the track is a single Tab stop (roving tabindex, defaulting to the marker containing the active match) — Arrow Up/Down/Left/Right moves between markers, Home/End jump to the first/last, Enter/Space jumps to the focused one. This avoids flooding the page's tab order with one stop per match, which a dense result set could easily number in the hundreds.
- `.vs-container`'s scrollbar is styled to a fixed, known width (`--vs-scrollbar-width`, default `10px`) so the minimap can be sized to exactly overlay it, and positioned flush to its right edge (`right: 0`) — same reason it needs the non-scrolling wrapper above: it has to line up with the scrollbar visually regardless of scroll position.

### `VirtualItem` interface

Every item must implement:

```ts
interface VirtualItem {
  id: string          // stable unique identifier
  text: string        // full plain-text content (searched + measured)
  type?: string       // optional — enables per-type EMA
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
  preventDefault?: boolean          // default: true — block native find dialog
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
  inputRef={inputRef}     // optional — from useSearchToggle, enables auto-focus
  onEscape={() => void}   // optional — called on Escape (e.g. to hide the bar)
/>
```

---

## Architecture decisions

### Why delegate measurement to TanStack Virtual?

An earlier version ran its own `ResizeObserver` on every item *in addition* to TanStack's, plus manual scroll anchoring. That meant two observers measuring the same element and two systems fighting over `scrollTop` — the cause of slow scrolling and jumpy positioning. The fix was to stop competing: TanStack's `measureElement` owns runtime measurement and scroll anchoring; this library only supplies the initial estimate and reads the result.

### Why MiniSearch over Fuse.js or FlexSearch?

MiniSearch balances full-text indexing (not just fuzzy matching), prefix search, field boosting, a small bundle (~25KB), and it returns matched-term info we turn into highlight ranges. Fuse.js is fuzzy-only and doesn't give character positions. FlexSearch is faster but heavier to configure.

### Why IndexedDB over localStorage for the height cache?

localStorage is synchronous and blocks the main thread; a bulk write at 10 000 items causes visible jank. IndexedDB is async, effectively unbounded, and `getAll()` makes bulk reads fast. OPFS would win for large binary blobs, but height cache is tiny JSON — OPFS's Worker-only sync API isn't worth the complexity.

### Why Pretext in a Web Worker?

`prepare()` calls canvas `measureText()` — fast but not free; running it for 10 000 items synchronously blocks the main thread. In a Worker it runs off-thread. On resize, only the cheap `layout()` re-runs, not `prepare()`.

### Why a 4-layer cascade instead of measuring everything up front?

You can't measure an element that isn't in the DOM, and rendering 10 000 elements to measure them defeats virtualization. Each layer trades latency for accuracy: server hints arrive before first render; IndexedDB has this user's real past measurements; Pretext is accurate for plain text without the DOM; EMA always works and improves as items are measured.

### Search incremental indexing

The MiniSearch index is built once and only *added to* as new items arrive (e.g. from `onServerSearch`). It is never rebuilt from scratch on every items change — a full rebuild at 5 000 items would block the main thread for tens of milliseconds on each update.

### How this compares to react-window / react-virtuoso on height estimation

`react-window`'s `VariableSizeList` takes a single flat `estimatedItemSize` and corrects it just-in-time via `resetAfterIndex` once an item renders — there's no notion of a *smarter* initial guess (see [bvaughn/react-window#6](https://github.com/bvaughn/react-window/issues/6) and [#190](https://github.com/bvaughn/react-window/issues/190), where users have been asking for exactly this since 2019). `react-virtuoso` handles unknown heights well at runtime but doesn't ship an off-thread text-measurement layer either. This library's 4-layer cascade — server hints, IndexedDB, Pretext, EMA — produces a materially better *first paint* estimate than either, at the cost of the added complexity documented above.

---

## Known limitations

- **Mixed content items** (images, tables, custom elements): Pretext measures plain text only, so the initial estimate may be off. TanStack corrects it on first render — add `ref={observeItem}` and `data-index` so the item self-corrects.
- **CSS margins on item children**: measured height excludes margins. Use padding instead of margin, or `overflow: hidden` on the item container.
- **`system-ui` font**: canvas measurement and DOM diverge on macOS with `system-ui`. Use a named font (`Inter`, `Arial`, …) for accurate pre-render estimation.
- **SSR**: `getComputedStyle`, `ResizeObserver`, and `IndexedDB` are browser-only. The hook falls back to `defaultItemHeight` during SSR and hydrates on the client.

---

## Development

```bash
npm install
npm run dev       # demo at http://localhost:5173
npm test          # vitest — 205 tests
npm run lint
npm run lint:fix  # auto-fix what ESLint can
npm run typecheck
```

For architecture details and contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md) — it documents the measurement model, the 4-layer height cascade, and the rules to follow when changing the measurement or search logic.

---

## License

MIT
