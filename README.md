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
- **Optional server search** — pass `onServerSearch` to merge extra results from your API into the local list (lightweight, no worker, fully optional)
- **Scroll-to-match** — jumps to the exact item containing the match, centers it in the viewport
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

### Using Pretext for higher accuracy

Install `@chenglou/pretext` for precise off-thread text measurement:

```
npm install @chenglou/pretext
```

The worker uses it automatically. Without it, the worker falls back to a character-count estimator (~80% accurate for typical text).

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
}
```

Returns:

| Property | Type | Description |
|---|---|---|
| `items` | `T[]` | Local items, plus any `onServerSearch` results merged in |
| `virtualizer` | TanStack virtualizer | Full TanStack Virtual instance |
| `search` | `SearchState` | `{ query, matches, activeMatchIndex, isSearching }` |
| `setQuery` | `(q: string) => void` | Update search query |
| `nextMatch` | `() => void` | Move to next match and scroll to it |
| `prevMatch` | `() => void` | Move to previous match and scroll to it |
| `getHighlights` | `(index: number) => Map<field, MatchRange[]> \| undefined` | Character ranges for a given item (lazy — only for visible items) |
| `getIsActiveMatch` | `(itemId: string) => boolean` | O(1) check whether an item is the active match |
| `observeItem` | `(el: HTMLElement \| null) => void` | Ref callback for each item element |
| `containerRef` | `RefObject<HTMLDivElement>` | Attach to the scroll container |
| `getHeightSource` | `(index: number) => HeightSource` | Debug: which layer provided the initial height |

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
npm test          # vitest — 130 tests
npm run typecheck
```

For architecture details and contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md) — it documents the measurement model, the 4-layer height cascade, and the rules to follow when changing the measurement or search logic.

---

## License

MIT
