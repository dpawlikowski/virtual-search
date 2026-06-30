# Changelog

All notable changes to `@virtual-search/core` are documented here.

## [0.1.0] — 2026-06-30

### Initial release

**Core features**

- `useSearchableList` — main hook combining virtualization, full-text search, and scroll-to-match
- `useSearchToggle` — Ctrl+F / Cmd+F keyboard binding with auto-focus, Escape to close, optional scope
- `SearchBar` — ready-made search input with match counter and prev/next navigation
- `HighlightedText` — renders character-level highlight ranges inside item text
- `resolveRanges` — exported utility for custom item renderers

**Height estimation — 4-layer cascade**

1. Server hints (`item._hints[bucket].p50`) — zero extra round-trip
2. IndexedDB — this browser's real measurements from previous sessions (30-day TTL, keyed by viewport bucket + font hash)
3. Pretext Web Worker — off-thread text measurement via `@chenglou/pretext`; falls back to character-count heuristic when the package is not installed
4. EMA fallback — exponential moving average per item type, always available

**Architecture**

- Runtime measurement and scroll anchoring fully delegated to TanStack Virtual (`measureElement`)
- No duplicate `ResizeObserver` on items — TanStack owns measurement lifecycle
- MiniSearch index is built once and updated incrementally (`addAll`) — never rebuilt on every `items` change
- O(1) match lookups via `Map` (not `.find()` per render)
- Highlight ranges resolved lazily — only for visible items

**Testing**

- 130 unit tests (Vitest + Testing Library)
- Covers: `HeightStore`, `searchReducer`, `resolveRanges`, `HighlightedText`, `SearchBar`, `useSearchToggle`, `heightCache`, EMA, debounce, viewport bucketing

**Accessibility**

- `SearchBar` uses `role="search"`, `aria-label`, `aria-live` on the match counter
- Navigation buttons have `aria-label` and keyboard hints in `title`

**Known limitations**

- Mixed-content items (images, tables): Pretext measures plain text only; TanStack corrects height on first render
- CSS child margins not included in measured height — use padding or `overflow: hidden`
- `system-ui` font: canvas and DOM measurements diverge on macOS — use a named font
- SSR: hook falls back to `defaultItemHeight` and hydrates on the client
