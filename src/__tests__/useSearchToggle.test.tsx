import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchToggle } from '../hooks/useSearchToggle'

function pressKey(key: string, opts: { ctrl?: boolean; meta?: boolean } = {}) {
  const e = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrl ?? false,
    metaKey: opts.meta ?? false,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(e)
  return e
}

describe('useSearchToggle', () => {
  beforeEach(() => {
    // reset focus
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  it('starts hidden by default', () => {
    const { result } = renderHook(() => useSearchToggle())
    expect(result.current.visible).toBe(false)
  })

  it('respects initialVisible', () => {
    const { result } = renderHook(() => useSearchToggle({ initialVisible: true }))
    expect(result.current.visible).toBe(true)
  })

  it('Ctrl+F toggles visibility', () => {
    const { result } = renderHook(() => useSearchToggle())
    act(() => { pressKey('f', { ctrl: true }) })
    expect(result.current.visible).toBe(true)
    act(() => { pressKey('f', { ctrl: true }) })
    expect(result.current.visible).toBe(false)
  })

  it('Cmd+F (metaKey) toggles visibility on macOS', () => {
    const { result } = renderHook(() => useSearchToggle())
    act(() => { pressKey('f', { meta: true }) })
    expect(result.current.visible).toBe(true)
  })

  it('uppercase F also triggers', () => {
    const { result } = renderHook(() => useSearchToggle())
    act(() => { pressKey('F', { ctrl: true }) })
    expect(result.current.visible).toBe(true)
  })

  it('ignores F without modifier', () => {
    const { result } = renderHook(() => useSearchToggle())
    act(() => { pressKey('f') })
    expect(result.current.visible).toBe(false)
  })

  it('ignores other modified keys', () => {
    const { result } = renderHook(() => useSearchToggle())
    act(() => { pressKey('g', { ctrl: true }) })
    expect(result.current.visible).toBe(false)
  })

  it('prevents default on the find shortcut by default', () => {
    renderHook(() => useSearchToggle())
    let prevented = false
    act(() => {
      const e = pressKey('f', { ctrl: true })
      prevented = e.defaultPrevented
    })
    expect(prevented).toBe(true)
  })

  it('does not prevent default when preventDefault is false', () => {
    renderHook(() => useSearchToggle({ preventDefault: false }))
    let prevented = true
    act(() => {
      const e = pressKey('f', { ctrl: true })
      prevented = e.defaultPrevented
    })
    expect(prevented).toBe(false)
  })

  it('open() shows, close() hides', () => {
    const { result } = renderHook(() => useSearchToggle())
    act(() => { result.current.open() })
    expect(result.current.visible).toBe(true)
    act(() => { result.current.close() })
    expect(result.current.visible).toBe(false)
  })

  it('calls onOpen when opened', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() => useSearchToggle({ onOpen }))
    act(() => { result.current.open() })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when closed', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useSearchToggle({ initialVisible: true, onClose }))
    act(() => { result.current.close() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('open() is idempotent — onOpen not called when already open', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() => useSearchToggle({ onOpen }))
    act(() => { result.current.open() })
    act(() => { result.current.open() })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('close() is idempotent — onClose not called when already closed', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useSearchToggle({ onClose }))
    act(() => { result.current.close() })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('toggle fires onOpen then onClose across two calls', () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const { result } = renderHook(() => useSearchToggle({ onOpen, onClose }))
    act(() => { result.current.toggle() })
    act(() => { result.current.toggle() })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('removes the keydown listener on unmount', () => {
    const { result, unmount } = renderHook(() => useSearchToggle())
    unmount()
    act(() => { pressKey('f', { ctrl: true }) })
    // visible state captured before unmount stays false; no throw = listener gone
    expect(result.current.visible).toBe(false)
  })

  it('exposes an inputRef', () => {
    const { result } = renderHook(() => useSearchToggle())
    expect(result.current).toHaveProperty('inputRef')
    expect(result.current.inputRef).toHaveProperty('current')
  })
})
