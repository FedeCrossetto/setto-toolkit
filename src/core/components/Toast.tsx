import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'

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

const ICON: Record<ToastType, ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  error:   CircleAlert,
  warning: TriangleAlert,
  info:    Info,
}

const COLOR: Record<ToastType, string> = {
  success: 'text-accent border-accent/20 bg-accent/8',
  error:   'text-error  border-error/20  bg-error/8',
  warning: 'text-yellow-400 border-yellow-400/20 bg-yellow-400/8',
  info:    'text-primary border-primary/20 bg-primary/8',
}

const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-accent',
  error:   'text-error',
  warning: 'text-yellow-400',
  info:    'text-primary',
}

// ── Single toast item ─────────────────────────────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }): JSX.Element {
  const [visible, setVisible] = useState(false)

  // Fade-in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 300)
    }, toast.durationMs)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  const handleDismiss = (): void => {
    setVisible(false)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium',
        'transition-all duration-300',
        COLOR[toast.type],
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
      style={{ minWidth: '260px', maxWidth: '400px' }}
    >
      {(() => { const Icon = ICON[toast.type]; return <Icon size={18} className={`flex-shrink-0 mt-px ${ICON_COLOR[toast.type]}`} /> })()}
      <span className="flex-1 text-on-surface leading-snug">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-on-surface-variant/40 hover:text-on-surface transition-colors mt-px"
      >
        <X size={14} />
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

      {/* Toast portal — fixed bottom-right */}
      <div
        aria-live="polite"
        className="fixed bottom-8 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
