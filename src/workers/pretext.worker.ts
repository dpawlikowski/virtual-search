/**
 * Pretext Web Worker
 *
 * Attempts to load @chenglou/pretext for accurate off-thread text measurement.
 * Falls back to character-count heuristic if the package is not installed.
 *
 * Messages in:  { type: 'PREPARE_BATCH', items, font, containerWidth, lineHeight, requestId }
 *               { type: 'LAYOUT_RESIZE', containerWidth, lineHeight, requestId }
 * Messages out: { type: 'HEIGHTS_READY', heights: [id, number][], requestId }
 */

interface PretextModule {
  prepare: (text: string, font: string) => unknown
  layout: (prepared: unknown, width: number, lineHeight: number) => { height: number }
}

let pretextModule: PretextModule | null = null
let pretextChecked = false
const preparedCache = new Map<string, unknown>()

async function ensurePretext(): Promise<boolean> {
  if (pretextChecked) return pretextModule !== null
  pretextChecked = true
  try {
    // @vite-ignore — optional peer dep, may not be installed
    const pkg = '@chenglou/pretext'
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = await import(/* @vite-ignore */ pkg as string)
    pretextModule = mod as PretextModule
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
  const avgCharWidth = fontSizePx * 0.55
  const charsPerLine = Math.max(1, Math.floor(containerWidth / avgCharWidth))
  const estimatedLines = Math.ceil((text.length || 1) / charsPerLine)
  return Math.max(lineHeight, estimatedLines * lineHeight)
}

function parseFontSize(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)px/)
  return m ? parseFloat(m[1]) : 16
}

interface WorkerMessage {
  type: string
  items?: Array<{ id: string; text: string }>
  font?: string
  containerWidth?: number
  lineHeight?: number
  requestId?: string
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, requestId } = e.data

  if (type === 'PREPARE_BATCH') {
    const {
      items = [],
      font = '16px Inter',
      containerWidth = 800,
      lineHeight = 24,
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
            preparedCache.set(item.id, prepared)
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

    self.postMessage({ type: 'HEIGHTS_READY', heights, requestId })
    return
  }

  if (type === 'LAYOUT_RESIZE') {
    const { containerWidth = 800, lineHeight = 24 } = e.data

    if (!pretextModule || preparedCache.size === 0) {
      self.postMessage({ type: 'HEIGHTS_READY', heights: [], requestId })
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
    self.postMessage({ type: 'HEIGHTS_READY', heights, requestId })
  }
}
