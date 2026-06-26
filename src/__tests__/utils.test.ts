import { describe, it, expect } from 'vitest'
import { getViewportBucket, parseFontForPretext, hashFontConfig, EMA } from '../utils'
import { resolveRanges } from '../search/miniSearchAdapter'

describe('getViewportBucket', () => {
  it('maps widths to correct buckets', () => {
    expect(getViewportBucket(320)).toBe('xs')
    expect(getViewportBucket(479)).toBe('xs')
    expect(getViewportBucket(480)).toBe('sm')
    expect(getViewportBucket(767)).toBe('sm')
    expect(getViewportBucket(768)).toBe('md')
    expect(getViewportBucket(1023)).toBe('md')
    expect(getViewportBucket(1024)).toBe('lg')
    expect(getViewportBucket(1439)).toBe('lg')
    expect(getViewportBucket(1440)).toBe('xl')
    expect(getViewportBucket(2560)).toBe('xl')
  })
})

describe('parseFontForPretext', () => {
  it('parses full CSS font shorthand', () => {
    expect(parseFontForPretext('400 16px/24px Inter')).toBe('16px Inter')
  })

  it('handles font without line-height', () => {
    expect(parseFontForPretext('16px Inter')).toBe('16px Inter')
  })

  it('strips weight prefix', () => {
    expect(parseFontForPretext('bold 14px Arial')).toBe('14px Arial')
  })
})

describe('hashFontConfig', () => {
  it('produces consistent hashes', () => {
    const h1 = hashFontConfig('16px Inter', 24)
    const h2 = hashFontConfig('16px Inter', 24)
    expect(h1).toBe(h2)
  })

  it('produces different hashes for different configs', () => {
    const h1 = hashFontConfig('16px Inter', 24)
    const h2 = hashFontConfig('16px Inter', 20)
    const h3 = hashFontConfig('14px Inter', 24)
    expect(h1).not.toBe(h2)
    expect(h1).not.toBe(h3)
  })
})

describe('EMA', () => {
  it('returns default before warmup', () => {
    const ema = new EMA()
    expect(ema.current).toBe(150) // global default
  })

  it('converges toward new values', () => {
    const ema = new EMA(0.5)
    for (let i = 0; i < 20; i++) ema.update(100)
    expect(ema.current).toBeCloseTo(100, 0)
  })

  it('is not ready before 3 updates', () => {
    const ema = new EMA()
    expect(ema.ready).toBe(false)
    ema.update(100)
    ema.update(100)
    expect(ema.ready).toBe(false)
    ema.update(100)
    expect(ema.ready).toBe(true)
  })
})

describe('resolveRanges', () => {
  it('finds single term', () => {
    const ranges = resolveRanges('hello world', ['world'])
    expect(ranges).toEqual([{ start: 6, end: 11 }])
  })

  it('is case-insensitive', () => {
    const ranges = resolveRanges('Hello World', ['world'])
    expect(ranges).toEqual([{ start: 6, end: 11 }])
  })

  it('finds multiple occurrences', () => {
    const ranges = resolveRanges('foo bar foo', ['foo'])
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toEqual({ start: 0, end: 3 })
    expect(ranges[1]).toEqual({ start: 8, end: 11 })
  })

  it('merges overlapping ranges', () => {
    const ranges = resolveRanges('foobar', ['foo', 'foob'])
    // foo: [0,3], foob: [0,4] → merged [0,4]
    expect(ranges).toEqual([{ start: 0, end: 4 }])
  })

  it('returns empty for no match', () => {
    expect(resolveRanges('hello', ['xyz'])).toEqual([])
  })
})

describe('debounce', () => {
  it('calls the function only once after rapid calls', async () => {
    const { debounce } = await import('../utils')
    let calls = 0
    const fn = debounce(() => { calls++ }, 50)
    fn(); fn(); fn()
    expect(calls).toBe(0)
    await new Promise(r => setTimeout(r, 80))
    expect(calls).toBe(1)
  })

  it('passes the latest arguments', async () => {
    const { debounce } = await import('../utils')
    let received: number | null = null
    const fn = debounce((n: number) => { received = n }, 30)
    fn(1); fn(2); fn(3)
    await new Promise(r => setTimeout(r, 60))
    expect(received).toBe(3)
  })

  it('allows a second call after the delay window', async () => {
    const { debounce } = await import('../utils')
    let calls = 0
    const fn = debounce(() => { calls++ }, 30)
    fn()
    await new Promise(r => setTimeout(r, 50))
    fn()
    await new Promise(r => setTimeout(r, 50))
    expect(calls).toBe(2)
  })
})

describe('EMA convergence and warmup', () => {
  it('uses simple average during warmup (< 10 samples)', async () => {
    const { EMA } = await import('../utils')
    const ema = new EMA(0.1)
    ema.update(100)
    ema.update(200)
    // simple average of 100,200 = 150
    expect(ema.current).toBeCloseTo(150, 0)
  })

  it('switches to exponential weighting after warmup', async () => {
    const { EMA } = await import('../utils')
    const ema = new EMA(0.5)
    // 10 warmup samples at 100
    for (let i = 0; i < 10; i++) ema.update(100)
    // now feed a big jump — exponential weighting should move toward it
    ema.update(200)
    expect(ema.current).toBeGreaterThan(100)
    expect(ema.current).toBeLessThan(200)
  })
})
