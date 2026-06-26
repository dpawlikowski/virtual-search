import { describe, it, expect, beforeEach } from 'vitest'
import { HeightStore } from '../hooks/useSearchableList'

describe('HeightStore', () => {
  let store: HeightStore

  beforeEach(() => { store = new HeightStore(150) })

  it('returns defaultHeight before any data', () => {
    expect(store.getHeight('unknown')).toBe(150)
    expect(store.getSource('unknown')).toBe('default')
    expect(store.has('unknown')).toBe(false)
  })

  it('stores and retrieves height', () => {
    store.set('a', 80, 'server')
    expect(store.getHeight('a')).toBe(80)
    expect(store.getSource('a')).toBe('server')
    expect(store.has('a')).toBe(true)
  })

  it('overwrites with newer source', () => {
    store.set('a', 80, 'pretext')
    store.set('a', 95, 'indexeddb')
    expect(store.getHeight('a')).toBe(95)
    expect(store.getSource('a')).toBe('indexeddb')
  })

  it('uses EMA for unknown items after enough samples', () => {
    store.set('a', 100, 'indexeddb')
    store.set('b', 100, 'indexeddb')
    store.set('c', 100, 'indexeddb')
    // After 3 items EMA is ready — unknown item should use EMA (~100)
    expect(store.getHeight('unknown')).toBeCloseTo(100, 0)
  })

  it('EMA returns defaultHeight when not ready (< 3 samples)', () => {
    store.set('a', 999, 'indexeddb') // only 1 sample
    store.set('b', 999, 'indexeddb') // only 2 samples — not ready yet
    expect(store.getHeight('totally-new')).toBe(150) // EMA needs 3 to be ready
  })

  it('does not update EMA for default/ema sources', () => {
    store.set('a', 999, 'default')
    store.set('b', 999, 'ema')
    // EMA not updated by default/ema sources — unknown still returns defaultHeight
    expect(store.getHeight('unknown')).toBe(150)
  })

  it('uses type-specific EMA when type provided and ready', () => {
    store.set('a', 200, 'indexeddb', 'email')
    store.set('b', 200, 'indexeddb', 'email')
    store.set('c', 200, 'indexeddb', 'email')
    expect(store.getHeight('unknown', 'email')).toBeCloseTo(200, 0)
  })

  it('getSource returns default for unknown items', () => {
    expect(store.getSource('nobody')).toBe('default')
  })

  it('has() returns false before set, true after', () => {
    expect(store.has('x')).toBe(false)
    store.set('x', 100, 'pretext')
    expect(store.has('x')).toBe(true)
  })
})

describe('HeightStore — global vs type EMA isolation (regression)', () => {
  it('global EMA is not double-counted when no type is given', () => {
    const store = new HeightStore(150)
    // Before the fix, each set() without a type updated globalEma twice,
    // making it "ready" after 2 sets instead of 3.
    store.set('a', 999, 'indexeddb')
    store.set('b', 999, 'indexeddb')
    // After exactly 2 untyped sets, global EMA must still NOT be ready
    expect(store.getHeight('new')).toBe(150)
    store.set('c', 999, 'indexeddb')
    // Now ready after the 3rd
    expect(store.getHeight('new')).toBeCloseTo(999, 0)
  })

  it('typed sets also feed the global EMA', () => {
    const store = new HeightStore(150)
    store.set('a', 300, 'indexeddb', 'card')
    store.set('b', 300, 'indexeddb', 'card')
    store.set('c', 300, 'indexeddb', 'card')
    // Global EMA gets each typed measurement too → ready after 3
    expect(store.getHeight('untyped-unknown')).toBeCloseTo(300, 0)
  })

  it('server and pretext sources both feed EMA; default/ema do not', () => {
    const store = new HeightStore(150)
    store.set('a', 200, 'server')
    store.set('b', 200, 'pretext')
    store.set('c', 200, 'indexeddb')
    expect(store.getHeight('x')).toBeCloseTo(200, 0)

    const store2 = new HeightStore(150)
    store2.set('a', 200, 'default')
    store2.set('b', 200, 'ema')
    store2.set('c', 200, 'default')
    // none of these feed EMA → still default
    expect(store2.getHeight('x')).toBe(150)
  })
})
