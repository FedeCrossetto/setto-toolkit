import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'

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

const ICON_BAR: Record<ToastType, string> = {
  success: 'bg-success/60',
  error:   'bg-error/60',
  warning: 'bg-warning/60',
  info:    'bg-primary/50',
}

const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-success',
  error:   'text-error',
  warning: 'text-warning',
  info:    'text-primary',
}


// ── Single toast item ─────────────────────────────────────────────────────────

function ToastCard({ toast, onDismiss, held }: { toast: ToastItem; onDismiss: (id: string) => void; held: boolean }): JSX.Element {
  // Auto-dismiss (la salida la anima AnimatePresence en el contenedor).
  // El tiempo se pausa mientras el puntero o el foco están sobre el toast (o la pila
  // está abierta), para que dé tiempo a leer o a apretar "Deshacer".
  const [own, setPaused] = useState(false)
  const paused = own || held
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
      className="fl-dialog relative overflow-hidden rounded-[12px]! flex items-center gap-2.5 pl-2.5 pr-1.5 py-1.5 t-body text-on-surface"
      style={{ minWidth: 260, maxWidth: 440 }}
    >
      {/* Cuánto le queda: se frena junto con el cierre (hover, foco, pila abierta). */}
      <span aria-hidden className={`toast-timer absolute left-0 bottom-0 h-[2px] ${ICON_BAR[toast.type]}`}
        style={{ animationDuration: `${toast.durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
      <span aria-hidden className="shrink-0 w-5 h-5 flex items-center justify-center">
        <Icon size={16} weight="regular" className={ICON_COLOR[toast.type]} />
      </span>
      <span className="flex-1 leading-snug font-medium pr-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={handleAction}
          className="shrink-0 h-6 px-2.5 rounded-[7px] border border-hairline-strong t-footnote font-medium text-on-surface hover:bg-on-surface/5 focus-visible:outline-2 focus-visible:outline-primary transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        className="shrink-0 w-6 h-6 rounded-[6px] flex items-center justify-center text-on-surface-variant/60 hover:text-on-surface hover:bg-on-surface/6 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  )
}

// ── Provider + portal container ───────────────────────────────────────────────

let idCounter = 0

/** Pila: alto de un toast con su separación (abierta) y cuánto asoma cada anterior (cerrada). */
const STACK_GAP = 50
const STACK_PEEK = 9

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (!toasts.length) setExpanded(false) }, [toasts.length])

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

      {/* Toasts — arriba a la derecha, apilados como Sonner: el más nuevo adelante y los
          anteriores asomando detrás; al pasar el mouse se abren en lista. Deslizar a la
          derecha cierra uno. */}
      <div
        role="region"
        aria-label="Avisos"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="fixed top-14 right-4 z-9999 w-[440px] max-w-[calc(100vw-32px)] pointer-events-none"
        style={{ height: toasts.length ? (expanded ? toasts.length * STACK_GAP : STACK_GAP + (toasts.length - 1) * STACK_PEEK) : 0 }}
      >
        <AnimatePresence initial={false}>
          {[...toasts].reverse().map((t, i) => (
            <motion.div key={t.id}
              className="absolute top-0 right-0 pointer-events-auto origin-top"
              style={{ zIndex: TOAST_MAX - i }}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{
                opacity: expanded || i < 3 ? 1 : 0,
                y: expanded ? i * STACK_GAP : i * STACK_PEEK,
                scale: expanded ? 1 : 1 - i * 0.05,
                transition: { type: 'spring', stiffness: 420, damping: 34 },
              }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.16 } }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.05, right: 0.9 }}
              onDragEnd={(_e, info) => { if (info.offset.x > 90 || info.velocity.x > 600) dismiss(t.id) }}>
              <ToastCard toast={t} onDismiss={dismiss} held={expanded} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
