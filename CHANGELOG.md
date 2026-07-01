# Changelog

All notable changes to `@virtual-search/core` are documented here.

## [0.2.0] — 2026-07-01

### Added

- **Search options** — `regex`, `exactMatch`, `caseSensitive`, and `wholeWord` modes via `setSearchOptions`; `SearchBar` gained `.*` / `" "` / `|ab|` / `Aa` toggle buttons (shown when `onOptionsChange` is passed). `wholeWord` disables MiniSearch prefix matching in fuzzy mode and wraps the literal pattern in `\b` boundaries in exact-match mode; it's ignored (and the toggle disabled) in regex mode, where you write `\b` yourself
- **`MatchMinimap`** — overlays the scroll container's own scrollbar track with small yellow ticks (like find-in-page in browsers/VSCode), positioned by each match's real offset — not a generic even spread. Click anywhere on the track (not just exactly on a marker) to jump to the nearest match. Hover/focus a marker to see a tooltip with a short excerpt and the matched term in bold (pass `items` to enable it). Keyboard-navigable via roving tabindex (Arrow keys / Home / End) instead of one Tab stop per match
- `@chenglou/pretext` is now a real, always-installed dependency — the worker previously referenced it through a runtime-only dynamic import that could never resolve in the browser; it's now properly bundled by Vite
- `useSearchableList` gained `persistDebounceMs`, `resizeDebounceMs`, and `overscan` options (previously hardcoded constants) for tuning without forking the library
- `MatchMinimap` gained `markerHeightPx` and `snippetContextChars` props for the same reason
- `MatchMinimap` renders its own draggable scroll-position thumb (`.vs-minimap-thumb`) reflecting the scroll container's real viewport — see Fixed below for why

### Fixed

- `scrollToMatch` could land off-target on the first jump because unmeasured item heights shift the layout once real measurements land; it now re-corrects on the next animation frame
- `useSearchToggle` mutated a ref during render (`onOpenRef.current = onOpen`), which `eslint-plugin-react-hooks`'s `react-hooks/refs` rule flags as unsafe — moved into a `useEffect`
- `SearchBar`'s Enter-key handler used a ternary expression as a statement instead of an if/else
- Regex search mode could match a zero-width pattern (e.g. `9*`, `a?`) against every item instead of only items that actually contain the pattern
- `MatchMinimap`'s fallback positioning (used when `virtualizer.getOffsetForIndex` is unavailable) divided by match *count* instead of total *item count*, clustering markers near the bottom of the track regardless of actual position
- Highlight ranges broke entirely under `caseSensitive` in fuzzy search mode: MiniSearch's matched terms are lowercased internally, so a case-sensitive regex built from them could never match the original-case text, leaving only the generic active-row background with no highlighted term. `caseSensitive` is now only honored for `regex`/`exactMatch` modes (`isHighlightCaseSensitive`), where terms are extracted verbatim from the source text
- `MatchMinimap` markers bucketed at 1px resolution could visually overlap (marker height is ~4px), shadowing each other's hover/click targets in dense result sets — bucket stride now matches the marker's rendered footprint
- `SearchBar`'s `Aa` toggle was always clickable even in plain fuzzy mode, where it's a documented no-op — now disabled unless `regex` or `exactMatch` is active, with a title explaining why
- `MatchMinimap` scrolled away with the list content instead of staying fixed like a real scrollbar overlay: it was rendered as a DOM child *inside* the scrollable `.vs-container`, so its `position: absolute` offsets got carried along by the container's own scrolling — visible only near the top when unscrolled, and off-screen for the rest of the list. It now needs to be a sibling of `.vs-container` inside a non-scrolling wrapper (new `.vs-list-wrapper` class); see the updated `MatchMinimap` usage example in the README
- Once `MatchMinimap` was moved to that non-scrolling sibling position, it started painting over the native scrollbar track/thumb underneath (same screen position, higher paint order) instead of just the matches. Gave the track a translucent tinted background + left border (`z-index: 20`) so it reads as its own distinct lane — subtle enough not to intrude when no search is active, but the native thumb still shows through the gaps between markers
- `resolveRanges` didn't respect word boundaries even when `wholeWord` search correctly excluded a match — e.g. searching whole-word "cat" would still highlight "cat" inside "catalog" in the (correctly excluded) neighboring item's text if it happened to share a field. It now takes an optional `wholeWord` flag
- `MatchMinimap`'s marker `<button>`s had no `tabIndex` management, so a keyboard user tabbing through the page had to tab through one stop per match — potentially hundreds. Replaced with a roving-tabindex pattern (one Tab stop, Arrow-key navigation between markers)
- A dense result set could fill the *entire* minimap track with yellow marker ticks, visually burying the scrollbar thumb underneath with no visible handle left to grab. `MatchMinimap` now renders its own thumb reflecting the real scroll viewport, painted above the markers (`z-index: 30`) in a distinct color, protruding slightly past the track's right edge so it's always graspable — fully draggable via pointer events
- `searchItems` checked `query.trim()` only to decide whether the query was empty, but then searched with the original *untrimmed* query — a stray leading/trailing space changed what actually matched (e.g. `"cat "` could match inside `"concat is"` since there's no word boundary after a literal trailing space). The trimmed query is now used consistently for fuzzy, regex, and exact-match search

### Changed

- `MatchMinimap`'s `items` prop is now `VirtualItem[]` instead of a generic `<T extends VirtualItem>` — it only ever read `.id`/`.text`, so the generic added ceremony to every call site without adding safety
- `MatchMinimap`'s bucket count label changed from "N matches near this position" to "~N matches in this area" (both the `aria-label` and the hover tooltip) — bucketing is a pixel-resolution artifact, so at low zoom (long lists / a short track) a single bucket can lump together matches actually scattered across a large chunk of the list. The old wording implied a precise, tightly-clustered location; the new one is explicit that it's a rounded-up count over an area. The marker's own height now also grows (log-scaled, capped at 3x) with cluster size, so a genuinely dense cluster reads as a visibly thicker band instead of the same thin tick as a single match

### DX

- Added a working ESLint flat config (`eslint.config.js` + `typescript-eslint` + `eslint-plugin-react-hooks`) — the `lint` script previously referenced a package that wasn't installed or configured
- CI now runs `npm run lint` before typecheck/tests
- Added `lint:fix` and `prepublishOnly` (lint → typecheck → test → build) scripts, and a `sideEffects` field in `package.json` so bundlers know `styles.css` isn't safely tree-shakeable
- `dist-demo/` (a build artifact, rebuilt fresh by the deploy workflow on every push) was tracked in git despite `dist/` being gitignored — untracked and added to `.gitignore`
- Added `useSearchableList.test.tsx` — the hook itself had zero direct tests; only its dependencies were unit-tested individually. Covers the search lifecycle, match navigation/bounds, options re-search, `onServerSearch` item merging, and highlight/active-match getters
- Added test coverage for `SearchBar`'s option toggles (regex/exact/wholeWord/case-sensitive, including the disabled states) and `MatchMinimap`'s keyboard navigation — both previously untested
- Added test coverage for `MatchMinimap`'s scroll-position thumb (render/hide based on real scroll metrics, live update on scroll, drag-to-scroll math, click-through prevention) and its cluster-count wording/sizing — both previously untested
- 161 → 205 tests

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
