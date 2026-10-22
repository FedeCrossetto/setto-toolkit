import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardText, Copy, KeyRound, Lock, Search, User, X } from 'lucide-react'
import { normalize } from '../core/search'
import { KIND_ICON, KIND_LABEL } from '../core/clip-actions'
import type { ClipView } from '../core/clip-utils'
import type { Credential } from '../plugins/credentials/types'
import { Avatar } from '../plugins/credentials/components/Avatar'

/**
 * Widget en modo mínimo: lo que más se usa a mano y nada más.
 * - Buscador arriba (copiado y claves a la vez).
 * - Tus claves más usadas como accesos fijos: clic copia la contraseña, el ícono el usuario.
 * - El historial de copiado en filas de una línea: clic copia, doble clic (o Enter) pega.
 * El widget completo (pestañas, capturas, snippets…) queda a un clic en el encabezado.
 */
export type MiniCred = Credential & { lastUsedAt?: number }
type Row = { type: 'clip'; key: string; clip: ClipView } | { type: 'cred'; key: string; cred: MiniCred }

const TOP_KEYS = 6
const CLIPS_SHOWN = 40

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'ahora'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h`
  return `${Math.round(h / 24)} d`
}

export function DockMinimal({
  clips, topCreds, allCreds, locked, doneKey, doneLabel, flash, onCopyClip, onPasteClip, onCopyPassword, onCopyUser, onOpenCredential, onClose,
}: {
  clips: ClipView[]
  topCreds: MiniCred[]
  allCreds: MiniCred[]
  locked: boolean
  /** Ítem recién copiado/pegado (muestra la marca) */
  doneKey: string | null
  doneLabel: string
  flash: string | null
  onCopyClip: (id: string, key: string) => void
  onPasteClip: (id: string, key: string) => void
  onCopyPassword: (c: MiniCred, key: string) => void
  onCopyUser: (c: MiniCred, key: string) => void
  onOpenCredential: (c: MiniCred) => void
  onClose: () => void
}): JSX.Element {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const words = normalize(q.trim()).split(/\s+/).filter(Boolean)
  const match = (s: string): boolean => words.every((w) => normalize(s).includes(w))

  // Buscando: claves que coinciden y después lo copiado. Sin buscar: sólo lo copiado (las claves van arriba).
  const rows = useMemo((): Row[] => {
    const clipRows: Row[] = clips
      .filter((c) => !words.length || (!c.sensitive && match(`${c.text} ${c.app ?? ''} ${KIND_LABEL[c.kind]}`)))
      .slice(0, CLIPS_SHOWN)
      .map((c) => ({ type: 'clip', key: `c:${c.id}`, clip: c }))
    if (!words.length) return clipRows
    const credRows: Row[] = allCreds
      .filter((c) => match(`${c.nombre} ${c.usuario} ${c.url ?? ''}`))
      .slice(0, 8)
      .map((c) => ({ type: 'cred', key: `k:${c.id}`, cred: c }))
    return [...credRows, ...clipRows]
  }, [clips, allCreds, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const safe = Math.min(active, Math.max(0, rows.length - 1))
  useEffect(() => { setActive(0) }, [q])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-idx="${safe}"]`)?.scrollIntoView({ block: 'nearest' }) }, [safe])

  const run = (r: Row | undefined, how: 'copy' | 'paste'): void => {
    if (!r) return
    if (r.type === 'clip') (how === 'paste' ? onPasteClip : onCopyClip)(r.clip.id, r.key)
    else onCopyPassword(r.cred, r.key)
  }

  // Teclado: escribir busca, ↑↓ eligen, Enter pega (o copia la contraseña), Esc limpia o cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const inInput = document.activeElement === inputRef.current
      if (e.key === 'Escape') { e.preventDefault(); if (q) setQ(''); else onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
        return
      }
      if (e.key === 'Enter') { e.preventDefault(); run(rows[safe], 'paste'); return }
      if (!inInput && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
        e.preventDefault()
        setQ((v) => v + e.key)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const keys = topCreds.slice(0, TOP_KEYS)
  const section = 'px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant/80'

  return (
    <div className="relative flex-1 min-h-0 flex flex-col mx-2 mb-2 rounded-(--r-lg) overflow-hidden app-panel bg-background">
      {/* Buscador */}
      <div className="relative px-3 pt-3 pb-2 shrink-0">
        <Search size={15} className="absolute left-[25px] top-[27px] -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en copiado y claves…"
          onFocus={() => window.api.send('dock:want-focus')}
          className="w-full h-10 pl-[38px] pr-8 rounded-(--r-md) bg-on-surface/[0.04] border border-hairline-strong focus:bg-surface focus:border-primary/40 focus:shadow-[0_0_0_3px_rgb(var(--c-primary)/0.12)] outline-hidden text-[13.5px] text-on-surface placeholder:text-on-surface-variant/70 transition-[background-color,border-color,box-shadow]" />
        {q && (
          <button type="button" title="Limpiar" onClick={() => { setQ(''); inputRef.current?.focus() }}
            className="absolute right-5 top-[27px] -translate-y-1/2 grid place-items-center w-6 h-6 rounded-[6px] text-on-surface-variant hover:bg-on-surface/8">
            <X size={13} />
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {/* Claves: accesos fijos (sólo sin buscar) */}
        {!words.length && keys.length > 0 && (
          <section className="px-1 pt-1 pb-3">
            <div className={`${section} flex items-center gap-1.5`}>
              Claves {locked && <Lock size={11} className="text-warning" />}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {keys.map((c) => {
                const key = `k:${c.id}`
                const done = doneKey === key
                return (
                  <div key={c.id} role="button" tabIndex={-1}
                    onClick={() => onCopyPassword(c, key)}
                    title={locked ? `${c.nombre}: abrir Setto para desbloquear` : c.hasPassword ? `Copiar la contraseña de ${c.nombre}` : `Copiar el usuario de ${c.nombre}`}
                    className={`group relative flex flex-col items-center gap-1.5 px-1.5 pt-2.5 pb-2 rounded-(--r-md) cursor-pointer transition-colors ${
                      done ? 'bg-primary/10 ring-1 ring-primary/25' : 'bg-on-surface/[0.03] ring-1 ring-on-surface/[0.06] hover:bg-on-surface/[0.06]'}`}>
                    <span className="relative">
                      <Avatar name={c.nombre} url={c.url} user={c.usuario} size={30} />
                      {done && <span className="absolute -right-1 -bottom-1 grid place-items-center w-4 h-4 rounded-full bg-primary text-on-primary"><Check size={10} /></span>}
                    </span>
                    <span className="w-full text-center text-[12px] leading-[15px] font-medium text-on-surface truncate">{done ? 'Copiada' : c.nombre}</span>
                    {c.usuario && !locked && (
                      <button type="button" title={`Copiar usuario: ${c.usuario}`} aria-label={`Copiar usuario de ${c.nombre}`}
                        onClick={(e) => { e.stopPropagation(); onCopyUser(c, key) }}
                        className="absolute top-1 right-1 grid place-items-center w-5 h-5 rounded-[5px] text-on-surface-variant bg-surface/80 opacity-0 group-hover:opacity-100 hover:text-on-surface transition-opacity">
                        <User size={11} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Copiado (y, buscando, las claves que coinciden) */}
        {!words.length && <div className={`${section} px-2`}>Copiado</div>}
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12.5px] text-on-surface-variant">{words.length ? 'Nada coincide.' : 'Lo que copies con Ctrl+C aparece acá.'}</p>
        ) : (
          <div className="flex flex-col gap-px">
            {rows.map((r, i) => {
              const done = doneKey === r.key
              const on = i === safe
              const base = `group flex items-center gap-2.5 px-2 h-10 rounded-(--r-sm) cursor-pointer transition-colors ${on ? 'bg-on-surface/[0.07]' : 'hover:bg-on-surface/[0.04]'}`
              if (r.type === 'cred') {
                const c = r.cred
                return (
                  <div key={r.key} data-idx={i} role="button" tabIndex={-1} className={base}
                    onMouseEnter={() => setActive(i)} onClick={() => onCopyPassword(c, r.key)} title="Clic copia la contraseña">
                    <Avatar name={c.nombre} url={c.url} user={c.usuario} size={26} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-on-surface truncate">{c.nombre}</span>
                    </span>
                    <span className={`shrink-0 text-[11.5px] ${done ? 'text-primary font-medium' : 'text-on-surface-variant'} truncate max-w-[45%]`}>{done ? doneLabel : c.usuario || 'Clave'}</span>
                    {c.usuario && (
                      <button type="button" title="Copiar usuario" aria-label="Copiar usuario" onClick={(e) => { e.stopPropagation(); onCopyUser(c, r.key) }}
                        className="hidden group-hover:grid place-items-center w-6 h-6 rounded-[6px] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8"><User size={12} /></button>
                    )}
                    <button type="button" title="Ver en Setto" aria-label="Ver en Setto" onClick={(e) => { e.stopPropagation(); onOpenCredential(c) }}
                      className="hidden group-hover:grid place-items-center w-6 h-6 rounded-[6px] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8"><KeyRound size={12} /></button>
                  </div>
                )
              }
              const c = r.clip
              const Icon = c.sensitive ? Lock : KIND_ICON[c.kind]
              return (
                <div key={r.key} data-idx={i} role="button" tabIndex={-1} className={base}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onCopyClip(c.id, r.key)} onDoubleClick={() => onPasteClip(c.id, r.key)}
                  title={c.sensitive ? 'Parece una clave: oculta' : `${c.text.slice(0, 300)}\n\nClic copia · doble clic pega`}>
                  <span className={`grid place-items-center w-7 h-7 rounded-(--r-sm) shrink-0 ${done ? 'bg-primary/15 text-primary' : 'bg-on-surface/[0.05] text-on-surface-variant'}`}>
                    {done ? <Check size={14} /> : <Icon size={14} />}
                  </span>
                  <span className={`flex-1 min-w-0 truncate text-[13px] ${c.sensitive ? 'tracking-wider text-on-surface-variant' : 'text-on-surface'}`}>
                    {c.sensitive ? (c.masked ?? '••••••') : c.text.replace(/\s+/g, ' ').trim()}
                  </span>
                  <span className={`shrink-0 text-[11.5px] tabular-nums ${done ? 'text-primary font-medium' : 'text-on-surface-variant/80'}`}>{done ? doneLabel : ago(c.at)}</span>
                  <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button type="button" title="Copiar" aria-label="Copiar" onClick={(e) => { e.stopPropagation(); onCopyClip(c.id, r.key) }}
                      className="grid place-items-center w-6 h-6 rounded-[6px] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8"><Copy size={12} /></button>
                    <button type="button" title="Pegar en la app de adelante" aria-label="Pegar" onClick={(e) => { e.stopPropagation(); onPasteClip(c.id, r.key) }}
                      className="grid place-items-center w-6 h-6 rounded-[6px] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8"><ClipboardText size={12} /></button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pie: aviso o ayuda corta */}
      <div className="px-3.5 h-9 flex items-center gap-1.5 text-[11.5px] text-on-surface-variant shrink-0 hairline-t">
        {flash
          ? <><Check size={12} className="text-primary shrink-0" /><span className="truncate text-on-surface font-medium">{flash}</span></>
          : <span className="truncate">Clic copia · doble clic o <kbd className="kbd-chip">Enter</kbd> pega</span>}
      </div>
    </div>
  )
}
