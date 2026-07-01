export const WorkerMsg = {
  PREPARE_BATCH: 'PREPARE_BATCH',
  LAYOUT_RESIZE: 'LAYOUT_RESIZE',
  HEIGHTS_READY: 'HEIGHTS_READY',
} as const

export type WorkerMsgType = typeof WorkerMsg[keyof typeof WorkerMsg]
