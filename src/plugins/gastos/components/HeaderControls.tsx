import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, Loader2, MoreHorizontal, RefreshCw } from 'lucide-react'
import type { SyncState } from '../hooks/useGastosData'
import { mesLong } from '../format'
import { currentMes, prevMes } from '../analytics'

/** ‹ Octubre 2026 › — clic en el nombre vuelve al mes actual. */
export function MonthNav({ mes, onChange }: { mes: string; onChange: (mes: string) => void }): JSX.Element {
  const isCurrent = mes === currentMes()
  return (
    <div className="flex items-center h-8 p-[2px] rounded-lg bg-surface hairline shadow-sm">
      <button type="button" className="h-full w-7 flex items-center justify-center rounded-[7px] text-on-surface-variant hover:bg-on-surface/6 hover:text-on-surface"
        onClick={() => onChange(prevMes(mes))} aria-label="Mes anterior">
        <ChevronLeft size={14} />
      </button>
      <button type="button" onClick={() => onChange(currentMes())} disabled={isCurrent}
        className="h-full t-body font-semibold text-on-surface min-w-[124px] text-center px-2 rounded-[7px] hover:bg-on-surface/6 disabled:hover:bg-transparent flex items-center justify-center gap-1.5"
        title={isCurrent ? 'Mes actual' : 'Volver al mes actual'}>
        {mesLong(mes)}
        {!isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden />}
      </button>
      <button type="button" className="h-full w-7 flex items-center justify-center rounded-[7px] text-on-surface-variant hover:bg-on-surface/6 hover:text-on-surface"
        onClick={() => onChange(prevMes(mes, -1))} aria-label="Mes siguiente">
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

/** Estado de sincronización honesto: verde sólo si la última conexión anduvo. */
export type PillState = SyncState | 'unconfigured' | 'incomplete' | 'auth'

export function SyncPill({ state, pendingCount, error, onClick }: {
  state: PillState
  pendingCount: number
  error: string | null
  onClick: () => void
}): JSX.Element {
  const cfg = {
    ok: { dot: 'bg-success', label: 'Sincronizado', title: 'Todo sincronizado con Supabase · clic para buscar cambios' },
    pending: { dot: 'bg-warning', label: `${pendingCount} sin subir`, title: 'Hay cambios guardados sólo en este equipo · clic para reintentar' },
    syncing: { dot: '', label: 'Sincronizando…', title: 'Sincronizando con Supabase' },
    error: { dot: 'bg-error', label: 'Sin conexión', title: error ? `${error} · clic para reintentar` : 'No se pudo conectar · clic para reintentar' },
    unconfigured: { dot: 'bg-on-surface-variant/50', label: 'Sin conectar', title: 'Gastos no está conectado a Supabase · clic para verificar' },
    incomplete: { dot: 'bg-warning', label: pendingCount ? `Sólo local · ${pendingCount}` : 'Falta completar la base', title: 'Faltan tablas en Supabase: lo nuevo queda en este equipo · clic para verificar' },
    auth: { dot: 'bg-error', label: 'Key inválida', title: error ? `${error} · clic para reintentar` : 'Supabase rechazó la key · clic para reintentar' },
  }[state]
  return (
    <button type="button" onClick={onClick} disabled={state === 'syncing'} title={cfg.title}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface hairline shadow-sm t-footnote font-medium text-on-surface-variant hover:text-on-surface disabled:cursor-wait">
      {state === 'syncing'
        ? <Loader2 size={12} className="animate-spin" />
        : <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
      {cfg.label}
      {state !== 'syncing' && <RefreshCw size={11} className="opacity-60" />}
    </button>
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
}

/** Menú "Más" (ui-menu). */
export function MoreMenu({ items }: { items: MenuItem[] }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" className="ui-btn ui-btn-outline ui-btn-icon h-8 w-8" aria-label="Más acciones" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} title="Más">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="ui-menu mac-pop-in absolute right-0 top-full mt-1 z-50 min-w-[240px]">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" disabled={it.disabled}
              className="ui-menu-item w-full text-left disabled:opacity-40"
              onClick={() => { setOpen(false); it.onSelect() }}>
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Aviso calmo (no error) dentro del contenido. */
export function Notice({ children, action }: { children: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-surface hairline shadow-sm t-footnote text-on-surface-variant">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-warning/[0.14] text-warning">
        <CircleAlert size={14} />
      </span>
      <span className="flex-1">{children}</span>
      {action}
    </div>
  )
}
