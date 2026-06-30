# CONTRIBUTING — virtual-search

Specyfikacja ogólna projektu. Czytaj ten plik zanim zaczniesz edytować kod.

---

## Czym jest ten projekt

`@virtual-search/core` to biblioteka React łącząca trzy rzeczy, których nikt nie poskładał razem:

1. **Wirtualizację listy** — renderuje tylko widoczne elementy, obsługuje 100k+ wierszy
2. **Full-text search po WSZYSTKICH danych** — nie tylko tych w DOM (natywne Ctrl+F nie znajdzie tekstu, którego nie ma w DOM)
3. **Scroll-to-match z highlightem** — wpisujesz frazę, scroll leci do dopasowania, fraza podświetlona

Plus hybrydowa estymacja wysokości elementów (żeby scrollbar nie skakał przy zmiennych wysokościach) i opcjonalny Ctrl+F toggle.

**Ten projekt NIE MA części backendowej.** Wcześniejsza wersja miała moduł `infinite/` z BFF Web Workerem do paginacji serwerowej — został usunięty. Jest lekki, opcjonalny `onServerSearch` w core API (zwykły async callback merdżujący wyniki), ale żadnego workera, paginacji ani infinite scroll.

---

## Filozofia architektury — przeczytaj, zanim coś zmienisz

### Zasada nr 1: nie walcz z TanStack Virtual

Najważniejsza decyzja. Wcześniejsze wersje miały własny `ResizeObserver` na każdym elemencie ORAZ ręczny scroll anchoring — to walczyło z wewnętrznym pomiarem TanStacka i powodowało wolny scroll + skakanie scrollbara.

**Teraz: TanStack Virtual jest jedynym właścicielem pomiaru runtime i scroll anchoringu.** Robi to przez `virtualizer.measureElement(el)`, wpięte przez ref na każdym itemie. Nasza warstwa dostarcza tylko **estymację początkową** (zanim element się wyrenderuje) i czyta zmierzony wynik.

Jeśli edytujesz logikę pomiaru: NIE dodawaj drugiego ResizeObservera, NIE rób ręcznego `scrollTop += delta`. TanStack to robi.

### Zasada nr 2: estymacja wysokości to 4-warstwowa kaskada

Dla każdego jeszcze-nie-wyrenderowanego elementu wysokość pochodzi z (w kolejności priorytetu):

```
1. server hints   — item._hints[bucket].p50 (jeśli n >= serverHintMinSamples)
2. IndexedDB      — pomiar tego użytkownika z poprzednich sesji
3. Pretext Worker — pomiar tekstu off-thread (jeśli @chenglou/pretext zainstalowany)
4. EMA fallback   — średnia ruchoma z już zmierzonych (per typ jeśli podany)
```

Po wyrenderowaniu TanStack mierzy element NAPRAWDĘ i ten pomiar jest autorytatywny. Wynik trafia do EMA i (debounced) do IndexedDB.

### Zasada nr 3: wydajność renderowania

- **Highlight resolwowany lazy** — `getHighlights(idx)` liczy zakresy znaków tylko dla widocznych itemów, nie dla wszystkich matchy
- **Search index incremental** — `addAll` tylko nowych itemów, NIGDY pełny rebuild (rebuild 5000 itemów blokuje main thread na ~50ms)
- **O(1) lookupy** — `matchByItemId` i `matchActiveMap` jako Map, nie `.find()` per item
- **Item renderer w React.memo** — przekazuj prymitywy (`translateY`, `index`), nie obiekty

---

## Struktura plików

```
src/
  hooks/
    useSearchableList.ts    # główny hook — cała logika (HeightStore, searchReducer eksportowane do testów)
    useSearchToggle.ts      # Ctrl+F / Cmd+F toggle searcha
  components/
    SearchBar.tsx           # input + nawigacja matchy + licznik (przyjmuje inputRef, onEscape)
    HighlightedText.tsx     # renderuje tekst z podświetlonymi zakresami znaków
  search/
    miniSearchAdapter.ts    # wrapper MiniSearch + resolveRanges (zakresy znaków z dopasowanych termów)
  storage/
    heightCache.ts          # IndexedDB przez idb — bulkGet, set, evictStale
  workers/
    pretext.worker.ts       # Web Worker: Pretext → fallback heurystyka char-count
  utils/
    index.ts                # getViewportBucket, parseFontForPretext, hashFontConfig, debounce, EMA
  types/
    index.ts                # wszystkie typy publiczne
  index.ts                  # barrel — publiczne API
  styles.css                # domyślne style (opcjonalne, override przez CSS vars)
demo/
  App.tsx                   # demo: 5000 emaili, Ctrl+F toggle
  main.tsx, demo.css
src/__tests__/              # 83 testy (vitest + @testing-library)
```

---

## Publiczne API

```ts
// Hooki
useSearchableList(options)   // główny hook
useSearchToggle(options?)    // Ctrl+F toggle

// Komponenty
SearchBar                    // gotowy search input
HighlightedText              // tekst z highlightem

// Util
resolveRanges                // zakresy znaków z termów (do custom rendererów)

// Typy
VirtualItem, SearchState, MatchRange, HeightSource, ViewportBucket, ...
```

### `useSearchableList` — kontrakt

```ts
interface UseSearchableListOptions<T extends VirtualItem> {
  items: T[]                                    // wymagane
  containerHeight: number                       // wymagane
  searchFields?: Array<keyof T & string>        // domyślnie ['text']
  onServerSearch?: (q: string) => Promise<T[]>  // opcjonalny merge z serwera
  serverSearchDebounce?: number                 // domyślnie 250
  serverHintMinSamples?: number                 // domyślnie 10
  onMeasureReport?: (id, height, bucket) => void
  cacheStoreName?: string                       // domyślnie 'virtual-search-heights'
  defaultItemHeight?: number                    // domyślnie 150
}
```

Zwraca: `items, virtualizer, search, setQuery, nextMatch, prevMatch, getHighlights, getIsActiveMatch, observeItem, containerRef, getHeightSource`.

### Wymagania na element itemu (w rendererze)

Każdy element listy MUSI mieć:
- `ref={observeItem}` — wpina pomiar TanStacka + cache wysokości
- `data-index={vi.index}` — TanStack `measureElement` czyta to
- `data-vs-item-id={item.id}` — identyfikuje item dla cache IndexedDB

### `VirtualItem` — kontrakt itemu

```ts
interface VirtualItem {
  id: string                    // stabilny unikalny identyfikator
  text: string                  // pełna treść tekstowa (search + pomiar)
  type?: string                 // opcjonalnie — włącza EMA per typ
  _hints?: ServerHeightHints    // opcjonalne hinty wysokości z serwera
}
```

---

## Zależności

**Runtime (dependencies):**
- `@tanstack/react-virtual` — wirtualizacja (jedyne źródło pomiaru runtime)
- `minisearch` — full-text search index
- `idb` — wrapper IndexedDB

**Peer:** `react`, `react-dom` (18 lub 19)

**Opcjonalna:** `@chenglou/pretext` — dokładny pomiar tekstu off-thread. Bez niej worker używa heurystyki char-count (~80% trafności). Worker ładuje ją dynamicznie z `@vite-ignore` żeby nie wywalić builda gdy nieobecna.

---

## Komendy

```bash
npm install              # instalacja (użyj --legacy-peer-deps jeśli konflikt)
npm run dev              # demo na localhost:5173
npm test                 # 130 testów (vitest)
npm run typecheck        # tsc --noEmit
npm run build:lib        # build biblioteki do dist/
```

---

## Zasady przy edycji kodu (dla agentów)

1. **Po każdej zmianie:** `npm run typecheck && npm test` — musi być zielone (83 testy, zero błędów TS)
2. **Nie dodawaj ResizeObservera** do pomiaru itemów — TanStack to robi
3. **Nie rób ręcznego scroll anchoring** — TanStack to robi
4. **Nie przebudowuj search indexu** od zera przy zmianie items — używaj `addAll` incrementalnie
5. **Nie resolwuj highlightów eagerly** dla wszystkich matchy — tylko lazy dla widocznych
6. **Item renderer w React.memo** z prymitywami w propsach
7. **HeightStore i searchReducer są eksportowane** z `useSearchableList.ts` wyłącznie do testów — nie usuwaj eksportu
8. **Browser-only API** (getComputedStyle, ResizeObserver, IndexedDB) — gating dla SSR, fallback do defaultItemHeight

---

## Znane ograniczenia

- **Mixed content** (obrazy, tabele): Pretext mierzy tylko tekst — estymacja początkowa może być nietrafna, TanStack koryguje po renderze
- **Marginesy CSS na dzieciach itemu**: zmierzona wysokość nie zawiera marginesów — użyj padding albo `overflow: hidden` na kontenerze
- **`system-ui` font**: canvas i DOM rozjeżdżają się na macOS — używaj nazwanego fontu (Inter, Arial)
- **SSR**: hook fallbackuje do `defaultItemHeight`, hydratuje na kliencie

---

## Historia decyzji (dlaczego tak)

- **Usunięto backend (`infinite/`)** — całość była wolna i się psuła przez konflikt własnego pomiaru z TanStackiem. Po usunięciu i oddaniu pomiaru TanStackowi wszystko jest płynne. Backend był poza scopem „biblioteka frontendowa".
- **TanStack Virtual zamiast react-virtuoso** — headless, framework-agnostic, oddaje pełny virtualizer instance
- **MiniSearch zamiast Fuse.js/FlexSearch** — full-text + prefix + zwraca dopasowane termy (do highlightu), ~25KB
- **IndexedDB zamiast localStorage** — async, nie blokuje main thread przy bulk write
- **Pretext w Workerze** — `prepare()` woła canvas measureText (kosztowne synchronicznie dla 10k itemów)
