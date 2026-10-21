import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Images, Pin, Settings2, Wand2, X } from 'lucide-react'
import { KIND_LABEL, actionsFor, type OpenAction } from '../core/clip-actions'
import { findTicket, transformsFor, type ClipView } from '../core/clip-utils'
import type { IconComponent } from '../core/types'

/**
 * Lo de arriba del widget (lo que se usa todos los días):
 * - Ticket en curso: las capturas nuevas se le asignan solas.
 * - Último copiado: según el tipo (ticket, SQL, JSON, ruta…) sus acciones a un clic.
 * - Lo que más usás: claves, snippets y consultas favoritas a un clic.
 * Y el selector de pestañas (mostrar/ocultar y ordenar).
 */
const chip = 'inline-flex items-center gap-1 h-7 px-2.5 rounded-[8px] border border-hairline-strong hover:bg-on-surface/[0.04] text-[11.5px] text-on-surface transition-colors max-w-full'
const ID_KINDS = ['ticket', 'url', 'email', 'guid', 'jwt', 'path', 'timestamp', 'number', 'color']

export function ActiveTicketBar({ ticket, onOpen, onJira, onClear }: { ticket: string; onOpen: () => void; onJira: () => void; onClear: () => void }): JSX.Element {
  return (
    <div className="mx-3.5 mt-2.5 flex items-center gap-2 h-9 pl-2.5 pr-1 rounded-[10px] bg-primary/[0.08] ring-1 ring-primary/25">
      <span className="status-dot text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold text-on-surface truncate">En curso: {ticket}</span>
        <span className="block text-[10px] text-on-surface-variant truncate -mt-0.5">Las capturas nuevas se asignan solas</span>
      </span>
      <button type="button" title="Abrir en Jira" onClick={onJira} className="grid place-items-center w-7 h-7 rounded-[7px] text-on-surface-variant hover:bg-on-surface/8 hover:text-on-surface"><ExternalLink size={13} /></button>
      <button type="button" title="Ver capturas y notas del ticket" onClick={onOpen} className="grid place-items-center w-7 h-7 rounded-[7px] text-on-surface-variant hover:bg-on-surface/8 hover:text-on-surface"><Images size={13} /></button>
      <button type="button" title="Dejar de trabajar en este ticket" onClick={onClear} className="grid place-items-center w-7 h-7 rounded-[7px] text-on-surface-variant hover:bg-on-surface/8 hover:text-on-surface"><X size={13} /></button>
    </div>
  )
}

export function LastCopiedCard({ clip, activeTicket, onPaste, onOpen, onError, onPinTicket, onDismiss }: {
  clip: ClipView
  activeTicket: string
  /** Pegar este texto (transformado) en la app de antes */
  onPaste: (text: string) => void
  onOpen: (a: OpenAction) => void
  onError: (m: string) => void
  onPinTicket: (ticket: string) => void
  onDismiss: () => void
}): JSX.Element {
  const ticket = clip.kind === 'ticket' ? clip.text.trim() : findTicket(clip.text)
  const actions = actionsFor(clip.kind, clip.text).slice(0, 3)
  const transforms = transformsFor(clip.kind).filter((t) => (t.for ? t.for.includes(clip.kind) : !ID_KINDS.includes(clip.kind))).slice(0, 2)
  const run = (fn: () => Promise<void> | void): void => { Promise.resolve().then(fn).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))) }
  return (
    <div className="mx-3.5 mt-2.5 rounded-[12px] bg-surface ring-1 ring-(--hairline-strong) p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80">Recién copiado</span>
        <span className="text-[10.5px] px-1.5 rounded-[5px] bg-primary/10 text-primary font-semibold">{KIND_LABEL[clip.kind]}</span>
        <span className="flex-1" />
        <button type="button" title="Ocultar" onClick={onDismiss} className="grid place-items-center w-5 h-5 rounded-[5px] text-on-surface-variant hover:bg-on-surface/8"><X size={11} /></button>
      </div>
      <p className="text-[12px] leading-[16px] text-on-surface line-clamp-2 break-all font-mono mb-2">{clip.text.trim()}</p>
      <div className="flex flex-wrap gap-1">
        {ticket && ticket !== activeTicket && (
          <button type="button" className={`${chip} border-primary/35! text-primary!`} onClick={() => onPinTicket(ticket)} title="Las capturas nuevas se asignan a este ticket">
            <Pin size={11} /> Trabajar en {ticket}
          </button>
        )}
        {actions.map((a) => (
          <button key={a.id} type="button" title={a.label} className={chip} onClick={() => run(() => a.run(clip.text, onOpen))}>
            <a.icon size={11} className="text-on-surface-variant shrink-0" /><span className="truncate">{a.label}</span>
          </button>
        ))}
        {transforms.map((t) => (
          <button key={t.id} type="button" title={`Pegar: ${t.label}`} className={chip} onClick={() => onPaste(t.apply(clip.text))}>
            <Wand2 size={11} className="text-primary shrink-0" /><span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export interface FrequentItem { key: string; icon: IconComponent; label: string; sub: string; run: () => void }

export function FrequentRow({ items }: { items: FrequentItem[] }): JSX.Element | null {
  if (!items.length) return null
  return (
    <div className="mx-3.5 mt-2.5">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80 mb-1.5">Lo que más usás</div>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((it) => (
          <button key={it.key} type="button" onClick={it.run} title={`${it.label} · ${it.sub}`}
            className="press flex flex-col items-start gap-1 min-w-0 px-2 py-1.5 rounded-[9px] bg-on-surface/[0.03] ring-1 ring-on-surface/[0.07] hover:bg-primary/[0.07] hover:ring-primary/25 text-left transition-colors">
            <it.icon size={13} className="text-primary shrink-0" />
            <span className="w-full text-[11.5px] font-medium text-on-surface truncate">{it.label}</span>
            <span className="w-full text-[10px] text-on-surface-variant truncate -mt-1">{it.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Mostrar/ocultar y ordenar las pestañas del widget. */
export function TabsConfig<T extends string>({ tabs, order, hidden, onChange }: {
  tabs: { id: T; label: string; icon: IconComponent }[]
  order: T[]
  hidden: T[]
  onChange: (order: T[], hidden: T[]) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  const list = order.map((id) => tabs.find((t) => t.id === id)!).filter(Boolean)
  const move = (i: number, d: -1 | 1): void => {
    const next = [...order]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next, hidden)
  }
  const toggle = (id: T): void => {
    const isHidden = hidden.includes(id)
    if (!isHidden && order.length - hidden.length <= 1) return // al menos una visible
    onChange(order, isHidden ? hidden.filter((x) => x !== id) : [...hidden, id])
  }
  return (
    <div ref={ref} className="relative ml-auto">
      <button type="button" title="Elegir y ordenar pestañas" onClick={() => setOpen((v) => !v)}
        className={`grid place-items-center w-7 h-7 rounded-[8px] transition-colors ${open ? 'bg-on-surface/8 text-on-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.05]'}`}>
        <Settings2 size={13} />
      </button>
      {open && (
        <div className="ui-menu absolute top-full right-0 mt-1.5 z-50 w-[220px] p-1.5!">
          <p className="px-1.5 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-on-surface-variant/80">Pestañas</p>
          {list.map((t, i) => {
            const on = !hidden.includes(t.id)
            return (
              <div key={t.id} className="flex items-center gap-1.5 h-8 px-1.5 rounded-[7px] hover:bg-on-surface/5">
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} aria-label={`Mostrar ${t.label}`} />
                <t.icon size={13} className="text-on-surface-variant" />
                <span className={`flex-1 text-[12px] ${on ? 'text-on-surface' : 'text-on-surface-variant line-through'}`}>{t.label}</span>
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="grid place-items-center w-6 h-6 rounded-[6px] hover:bg-on-surface/8 disabled:opacity-30"><ChevronUp size={12} /></button>
                <button type="button" aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="grid place-items-center w-6 h-6 rounded-[6px] hover:bg-on-surface/8 disabled:opacity-30"><ChevronDown size={12} /></button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

