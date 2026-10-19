import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { toastMotion } from '../motion'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

/** Botón opcional dentro del toast (p. ej. "Deshacer"). */
export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  durationMs: number
  action?: ToastAction
}

export interface ToastContextValue {
  /**
   * Muestra un toast. Con `action` aparece un botón y la duración por defecto
   * pasa a 6 s. Pasando el foco o el puntero por encima se pausa el cierre.
   */
  show: (message: string, type?: ToastType, durationMs?: number, action?: ToastAction) => void
}

/** Duraciones por defecto (ms). */
export const TOAST_DURATION = 3500
export const TOAST_ACTION_DURATION = 6000
/** Máximo de toasts apilados a la vez. */
export const TOAST_MAX = 4

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// ── Config ────────────────────────────────────────────────────────────────────

const ICON: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error:   CircleAlert,
  warning: TriangleAlert,
  info:    Info,
}

const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-success',
  error:   'text-error',
  warning: 'text-warning',
  info:    'text-primary',
}


// ── Single toast item ─────────────────────────────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }): JSX.Element {
  // Auto-dismiss (la salida la anima AnimatePresence en el contenedor).
  // El tiempo se pausa mientras el puntero o el foco están sobre el toast,
  // para que dé tiempo a leer o a apretar "Deshacer".
  const [paused, setPaused] = useState(false)
  const remaining = useRef(toast.durationMs)
  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const t = setTimeout(() => onDismiss(toast.id), remaining.current)
    return () => {
      clearTimeout(t)
      remaining.current = Math.max(800, remaining.current - (Date.now() - started))
    }
  }, [toast.id, onDismiss, paused])

  const handleDismiss = (): void => onDismiss(toast.id)
  const handleAction = (): void => {
    onDismiss(toast.id)
    toast.action?.onClick()
  }

  const Icon = ICON[toast.type]
  const urgent = toast.type === 'error' || toast.type === 'warning'
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); handleDismiss() } }}
      className="fl-dialog rounded-full! flex items-center gap-2.5 pl-2.5 pr-1.5 py-1.5 t-body text-on-surface"
      style={{ minWidth: 220, maxWidth: 440 }}
    >
      <span aria-hidden className="shrink-0 w-5 h-5 flex items-center justify-center">
        <Icon size={16} weight="regular" className={ICON_COLOR[toast.type]} />
      </span>
      <span className="flex-1 leading-snug font-medium pr-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 h-6 px-2.5 rounded-full border border-hairline-strong t-footnote font-medium text-on-surface hover:bg-on-surface/5 focus-visible:outline-2 focus-visible:outline-primary transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant/60 hover:text-on-surface hover:bg-on-surface/6 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Provider + portal container ───────────────────────────────────────────────

let idCounter = 0

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, type: ToastType = 'info', durationMs?: number, action?: ToastAction) => {
    const id = `toast-${++idCounter}`
    const ms = durationMs ?? (action ? TOAST_ACTION_DURATION : TOAST_DURATION)
    setToasts((prev) => [...prev.slice(-(TOAST_MAX - 1)), { id, type, message, durationMs: ms, action }])
  }, [])

  // Ctrl+Z deshace la última acción con "Deshacer" visible, salvo que se esté
  // escribiendo (inputs, textareas, editores): ahí Ctrl+Z es el deshacer del texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('.cm-editor, .xterm'))) return
      const last = [...toasts].reverse().find((t) => t.action && /deshacer/i.test(t.action.label))
      if (!last?.action) return
      e.preventDefault()
      last.action.onClick()
      dismiss(last.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toasts, dismiss])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toasts — arriba a la derecha */}
      <div
        role="region"
        aria-label="Avisos"
        className="fixed top-14 right-4 z-9999 flex flex-col gap-2 items-end pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div key={t.id} {...toastMotion} className="pointer-events-auto">
              <ToastCard toast={t} onDismiss={dismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
