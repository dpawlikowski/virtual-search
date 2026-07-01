import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'

export interface UseSearchToggleOptions {
  /** Start visible. Default: false */
  initialVisible?: boolean
  /**
   * Prevent the browser's native find dialog when our search opens.
   * Default: true
   */
  preventDefault?: boolean
  /**
   * Element to scope the shortcut to. If provided, Ctrl/Cmd+F only toggles
   * when focus is within this element (or always, if the element isn't focused
   * but the document is). If omitted, the shortcut is global.
   */
  scopeRef?: RefObject<HTMLElement>
  /** Called when search becomes visible */
  onOpen?: () => void
  /** Called when search is hidden */
  onClose?: () => void
}

export interface UseSearchToggleReturn {
  /** Whether the search UI should be shown */
  visible: boolean
  /** Show the search UI */
  open: () => void
  /** Hide the search UI */
  close: () => void
  /** Toggle visibility */
  toggle: () => void
  /**
   * Ref to attach to the search input. When search opens, the input is focused
   * and selected automatically.
   */
  inputRef: RefObject<HTMLInputElement>
}

/**
 * Manages show/hide of a search bar bound to Ctrl+F (Cmd+F on macOS).
 *
 * - Ctrl/Cmd+F toggles the search UI and focuses the input.
 * - Escape closes it.
 * - By default prevents the browser's native find dialog.
 *
 * @example
 * const { visible, inputRef, close } = useSearchToggle()
 * return visible && <SearchBar inputRef={inputRef} onEscape={close} ... />
 */
export function useSearchToggle(options: UseSearchToggleOptions = {}): UseSearchToggleReturn {
  const {
    initialVisible = false,
    preventDefault = true,
    scopeRef,
    onOpen,
    onClose,
  } = options

  const [visible, setVisible] = useState(initialVisible)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep latest callbacks without re-binding the listener
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onOpenRef.current = onOpen
    onCloseRef.current = onClose
  }, [onOpen, onClose])

  const open = useCallback(() => {
    setVisible((wasVisible) => {
      if (!wasVisible) onOpenRef.current?.()
      return true
    })
  }, [])

  const close = useCallback(() => {
    setVisible((wasVisible) => {
      if (wasVisible) onCloseRef.current?.()
      return false
    })
  }, [])

  const toggle = useCallback(() => {
    setVisible((v) => {
      const next = !v
      if (next) onOpenRef.current?.()
      else onCloseRef.current?.()
      return next
    })
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isFindShortcut = (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')
      if (!isFindShortcut) return

      // If scoped, only react when focus is inside the scope element
      if (scopeRef?.current) {
        const active = document.activeElement
        const inScope =
          scopeRef.current.contains(active) || active === document.body || active === null
        if (!inScope) return
      }

      if (preventDefault) e.preventDefault()
      toggle()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [preventDefault, scopeRef, toggle])

  // Focus + select the input when search becomes visible
  useEffect(() => {
    if (visible && inputRef.current) {
      // rAF so the element is mounted/painted before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [visible])

  return { visible, open, close, toggle, inputRef: inputRef as RefObject<HTMLInputElement> }
}
