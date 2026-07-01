import type { ViewportBucket } from '../types'

export const EMA_DEFAULT_ALPHA = 0.1
export const EMA_WARMUP_SAMPLES = 10
export const EMA_READY_THRESHOLD = 3
export const EMA_DEFAULT_FALLBACK = 150

/** True unless a bundler/runtime explicitly set NODE_ENV to 'production'. No @types/node dependency required. */
export function isDevEnvironment(): boolean {
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
  return proc?.env?.NODE_ENV !== 'production'
}

export function getViewportBucket(width: number): ViewportBucket {
  if (width < 480) return 'xs'
  if (width < 768) return 'sm'
  if (width < 1024) return 'md'
  if (width < 1440) return 'lg'
  return 'xl'
}

export function parseFontForPretext(computedFont: string): string {
  const match = computedFont.match(/(\d+(?:\.\d+)?px)\s*(?:\/[^\s]+)?\s+(.+)/)
  if (match) return `${match[1]} ${match[2].trim()}`
  return computedFont.replace(/^(?:normal|bold|\d+)\s+/, '')
}

export function hashFontConfig(font: string, lineHeight: number): string {
  const str = `${font}|${lineHeight}`
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i)
    h = h >>> 0
  }
  return h.toString(36)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export class EMA {
  private value: number | null = null
  private count = 0
  private readonly alpha: number

  constructor(alpha = EMA_DEFAULT_ALPHA) {
    this.alpha = alpha
  }

  update(newVal: number): number {
    this.count++
    if (this.count < EMA_WARMUP_SAMPLES || this.value === null) {
      this.value = this.value === null
        ? newVal
        : (this.value * (this.count - 1) + newVal) / this.count
    } else {
      this.value = this.alpha * newVal + (1 - this.alpha) * this.value
    }
    return this.value
  }

  get current(): number {
    return this.value ?? EMA_DEFAULT_FALLBACK
  }

  get ready(): boolean {
    return this.count >= EMA_READY_THRESHOLD
  }
}
