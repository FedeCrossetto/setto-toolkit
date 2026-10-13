import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, X } from 'lucide-react'

interface UndoItem {
  id: number
  message: string
  undo: () => void | Promise<void>
}

/**
 * Snackbar con "Deshacer" (el Toast global no tiene acciones). Uno por vez: uno nuevo
 * reemplaza al anterior. Ctrl+Z también deshace mientras está visible.
 */
export function useUndoToast(durationMs = 6000): {
  showUndo: (message: string, undo: () => void | Promise<void>) => void
  undoElement: JSX.Element | null
} {
  const [item, setItem] = useState<UndoItem | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setItem(null)
  }, [])

  const showUndo = useCallback((message: string, undo: () => void | Promise<void>) => {
    if (timer.current) clearTimeout(timer.current)
    setItem({ id: ++seq.current, message, undo })
    timer.current = setTimeout(() => setItem(null), durationMs)
  }, [durationMs])

  const runUndo = useCallback(() => {
    if (!item) return
    dismiss()
    void item.undo()
  }, [item, dismiss])

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); runUndo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, runUndo])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const undoElement = item
    ? createPortal(
      <div key={item.id} role="status" aria-live="polite"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[700] mac-pop-in flex items-center gap-3 pl-4 pr-2 py-2 rounded-xl bg-surface hairline shadow-2xl t-footnote text-on-surface max-w-[calc(100vw-32px)]">
        <span className="truncate">{item.message}</span>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={runUndo}>
          <RotateCcw size={12} /> Deshacer
        </button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" aria-label="Cerrar" onClick={dismiss}><X size={13} /></button>
      </div>,
      document.body,
    )
    : null

  return { showUndo, undoElement }
}
