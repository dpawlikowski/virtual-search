import '@testing-library/jest-dom'

// jsdom doesn't implement ResizeObserver — stub it for components that observe layout.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).ResizeObserver = ResizeObserverStub
}

// jsdom doesn't implement Worker — useSearchableList spins up the Pretext
// worker unconditionally on mount. heightCache/idb calls already degrade
// gracefully without indexedDB (see storage/heightCache.ts try/catch), so
// only Worker itself needs a stub for the hook to mount in tests.
if (typeof globalThis.Worker === 'undefined') {
  class WorkerStub {
    onmessage: ((ev: MessageEvent) => void) | null = null
    constructor(_url: string | URL, _opts?: unknown) {}
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Worker = WorkerStub
}

// jsdom doesn't implement requestAnimationFrame — scrollToMatch schedules a
// re-correction frame via it.
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}
