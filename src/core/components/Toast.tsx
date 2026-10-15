import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { toastMotion } from '../motion'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  durationMs: number
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, durationMs?: number) => void
}

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

const ICON_BG: Record<ToastType, string> = {
  success: 'bg-success/12',
  error:   'bg-error/12',
  warning: 'bg-warning/[0.14]',
  info:    'bg-primary/10',
}

// ── Single toast item ─────────────────────────────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }): JSX.Element {
  // Auto-dismiss (la salida la anima AnimatePresence en el contenedor)
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), toast.durationMs)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  const handleDismiss = (): void => onDismiss(toast.id)

  const Icon = ICON[toast.type]
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 pl-2 pr-2 py-1.5 rounded-full bg-surface hairline shadow-2xl t-body text-on-surface"
      style={{ minWidth: 220, maxWidth: 400 }}
    >
      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${ICON_BG[toast.type]}`}>
        <Icon size={15} weight="fill" className={ICON_COLOR[toast.type]} />
      </span>
      <span className="flex-1 leading-snug font-medium pr-1">{toast.message}</span>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
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

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = 3500) => {
    const id = `toast-${++idCounter}`
    setToasts((prev) => [...prev.slice(-4), { id, type, message, durationMs }])
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {/* Toasts — arriba a la derecha */}
      <div
        aria-live="polite"
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
