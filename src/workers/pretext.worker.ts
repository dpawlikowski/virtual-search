/**
 * Pretext Web Worker
 *
 * Uses @chenglou/pretext for accurate off-thread text measurement (line
 * breaking aware of font metrics and varying text/widths). Falls back to a
 * character-count heuristic if the module fails to load.
 *
 * Messages in:  { type: 'PREPARE_BATCH', items, font, containerWidth, lineHeight }
 *               { type: 'LAYOUT_RESIZE', containerWidth, lineHeight }
 * Messages out: { type: 'HEIGHTS_READY', heights: [id, number][] }
 */

import { WorkerMsg } from './workerMessages'

interface PretextModule {
  prepare: (text: string, font: string) => unknown
  layout: (prepared: unknown, width: number, lineHeight: number) => { height: number }
}

const AVG_CHAR_WIDTH_RATIO = 0.55
const DEFAULT_FONT_SIZE_PX = 16
const DEFAULT_CONTAINER_WIDTH = 800
const DEFAULT_LINE_HEIGHT = 24
const DEFAULT_FONT = '16px Inter'

// Cap so long-lived sessions with heavy item churn (e.g. paginated/replaced
// data over hours) don't grow this worker-side cache unboundedly.
const MAX_PREPARED_CACHE_SIZE = 20_000

let pretextModule: PretextModule | null = null
let pretextChecked = false
const preparedCache = new Map<string, unknown>()

function cachePrepared(id: string, prepared: unknown): void {
  preparedCache.set(id, prepared)
  if (preparedCache.size > MAX_PREPARED_CACHE_SIZE) {
    const oldestKey = preparedCache.keys().next().value
    if (oldestKey !== undefined) preparedCache.delete(oldestKey)
  }
}

async function ensurePretext(): Promise<boolean> {
  if (pretextChecked) return pretextModule !== null
  pretextChecked = true
  try {
    const mod = await import('@chenglou/pretext')
    pretextModule = mod as unknown as PretextModule
    return true
  } catch {
    pretextModule = null
    return false
  }
}

function estimateHeightFallback(
  text: string,
  containerWidth: number,
  lineHeight: number,
  fontSizePx: number
): number {
  const avgCharWidth = fontSizePx * AVG_CHAR_WIDTH_RATIO
  const charsPerLine = Math.max(1, Math.floor(containerWidth / avgCharWidth))
  const estimatedLines = Math.ceil((text.length || 1) / charsPerLine)
  return Math.max(lineHeight, estimatedLines * lineHeight)
}

function parseFontSize(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)px/)
  return m ? parseFloat(m[1]) : DEFAULT_FONT_SIZE_PX
}

interface WorkerMessage {
  type: string
  items?: Array<{ id: string; text: string }>
  font?: string
  containerWidth?: number
  lineHeight?: number
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data

  if (type === WorkerMsg.PREPARE_BATCH) {
    const {
      items = [],
      font = DEFAULT_FONT,
      containerWidth = DEFAULT_CONTAINER_WIDTH,
      lineHeight = DEFAULT_LINE_HEIGHT,
    } = e.data

    const hasPre = await ensurePretext()
    const heights: [string, number][] = []
    const fontSizePx = parseFontSize(font)

    for (const item of items) {
      if (hasPre && pretextModule) {
        try {
          let prepared = preparedCache.get(item.id)
          if (!prepared) {
            prepared = pretextModule.prepare(item.text, font)
            cachePrepared(item.id, prepared)
          }
          const { height } = pretextModule.layout(prepared, containerWidth, lineHeight)
          heights.push([item.id, Math.max(lineHeight, height)])
        } catch {
          heights.push([
            item.id,
            estimateHeightFallback(item.text, containerWidth, lineHeight, fontSizePx),
          ])
        }
      } else {
        heights.push([
          item.id,
          estimateHeightFallback(item.text, containerWidth, lineHeight, fontSizePx),
        ])
      }
    }

    self.postMessage({ type: WorkerMsg.HEIGHTS_READY, heights })
    return
  }

  if (type === WorkerMsg.LAYOUT_RESIZE) {
    const { containerWidth = DEFAULT_CONTAINER_WIDTH, lineHeight = DEFAULT_LINE_HEIGHT } = e.data

    if (!pretextModule || preparedCache.size === 0) {
      self.postMessage({ type: WorkerMsg.HEIGHTS_READY, heights: [] })
      return
    }

    const heights: [string, number][] = []
    for (const [id, prepared] of preparedCache) {
      try {
        const { height } = pretextModule.layout(prepared, containerWidth, lineHeight)
        heights.push([id, Math.max(lineHeight, height)])
      } catch {
        // skip — old value remains in heightStore
      }
    }
    self.postMessage({ type: WorkerMsg.HEIGHTS_READY, heights })
  }
}
