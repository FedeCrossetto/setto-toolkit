import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { backdropMotion, dialogMotion, sheetMotion } from '../motion'
import { TriangleAlert, X } from 'lucide-react'

/**
 * Diálogo centrado: tarjeta blanca rounded-2xl, hairline, sombra pop; Esc cierra.
 * Usarlo para cualquier modal de la app en vez de overlays armados a mano.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 440,
  closeOnBackdrop = true,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
  closeOnBackdrop?: boolean
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  // Siempre montado en el portal: AnimatePresence necesita ver el cierre para animar la salida.
  return createPortal(
    <AnimatePresence>
    {open && (
    <motion.div
      {...backdropMotion}
      className="fixed inset-0 z-600 flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        {...dialogMotion}
        role="dialog"
        aria-modal="true"
        className="bg-surface hairline rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        style={{ width, maxWidth: 'calc(100vw - 32px)' }}
      >
        {(title || subtitle) && (
          <div className="flex items-start gap-3 px-6 pt-5 pb-3">
            <div className="flex-1 min-w-0">
              {title && <h2 className="t-headline text-on-surface">{title}</h2>}
              {subtitle && <p className="t-footnote text-on-surface-variant mt-1">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg -mr-2 -mt-1">
              <X size={15} />
            </button>
          </div>
        )}
        {children && <div className="px-6 pb-5 overflow-y-auto t-body text-on-surface">{children}</div>}
        {footer && <div className="flex justify-end items-center gap-2 px-6 py-3.5 hairline-t bg-background/40 dark:bg-white/2">{footer}</div>}
      </motion.div>
    </motion.div>
    )}
    </AnimatePresence>,
    document.body,
  )
}

/** Side sheet that slides in from the right (forms, detail panels). */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 420,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
    {open && (
    <motion.div
      {...backdropMotion}
      className="fixed inset-0 z-550 flex justify-end bg-black/20 dark:bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.aside
        {...sheetMotion}
        className="bg-surface hairline rounded-2xl shadow-2xl m-2 flex flex-col overflow-hidden"
        style={{ width, maxWidth: 'calc(100vw - 32px)' }}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 hairline-b">
          <div className="flex-1 min-w-0">
            {title && <h2 className="t-headline text-on-surface">{title}</h2>}
            {subtitle && <p className="t-footnote text-on-surface-variant mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg -mr-2 -mt-1">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 t-body text-on-surface">{children}</div>
        {footer && <div className="flex justify-end items-center gap-2 px-6 py-3.5 hairline-t bg-background/40 dark:bg-white/2">{footer}</div>}
      </motion.aside>
    </motion.div>
    )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Confirm dialog (promise-based replacement for window.confirm) ────────────

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const close = (value: boolean): void => {
    resolver.current?.(value)
    resolver.current = null
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        width={400}
        footer={
          <>
            <button className="ui-btn ui-btn-outline" onClick={() => close(false)}>{opts?.cancelLabel ?? 'Cancelar'}</button>
            <button
              autoFocus
              className={`ui-btn ${opts?.destructive ? 'ui-btn-danger' : 'ui-btn-primary'}`}
              onClick={() => close(true)}
            >
              {opts?.confirmLabel ?? 'Aceptar'}
            </button>
          </>
        }
      >
        <div className="pt-6 flex items-start gap-3.5">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
            opts?.destructive ? 'bg-error/10 text-error' : 'bg-selected text-primary'
          }`}>
            <TriangleAlert size={19} weight="fill" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="t-headline text-on-surface">{opts?.title}</p>
            {opts?.message && <div className="t-body text-on-surface-variant mt-1">{opts.message}</div>}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

/** `const confirm = useConfirm(); if (await confirm({ title: '¿Eliminar?', destructive: true })) …` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
