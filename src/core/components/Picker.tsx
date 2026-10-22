import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Search } from 'lucide-react'

/**
 * Selector con popover propio (en vez del <select> nativo de Windows): busca al
 * escribir, se maneja con flechas/Enter/Esc y cada opción puede tener su propio diseño.
 */
export interface PickerItem {
  id: string
  /** Texto para buscar */
  text: string
  render: (active: boolean) => ReactNode
}

export function Picker({ value, items, onPick, trigger, title, placeholder = 'Buscar…', footer, allowCustom, width = 320, className = '' }: {
  value: string | null
  items: PickerItem[]
  onPick: (id: string) => void
  trigger: ReactNode
  title?: string
  placeholder?: string
  footer?: (close: () => void) => ReactNode
  /** Enter con texto que no coincide: usarlo tal cual (p. ej. una base que no está en la lista) */
  allowCustom?: (text: string) => ReactNode
  width?: number
  className?: string
}): JSX.Element {
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const list = useRef<HTMLDivElement>(null)

  const f = q.trim().toLowerCase()
  const shown = useMemo(() => (f ? items.filter((i) => i.text.toLowerCase().includes(f)) : items), [items, f])
  const custom = allowCustom && f && !items.some((i) => i.id.toLowerCase() === f) ? q.trim() : null

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 })
  }, [open, width])
  useEffect(() => {
    if (!open) return
    setQ(''); setHi(Math.max(0, items.findIndex((i) => i.id === value)))
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!list.current?.parentElement?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }) }, [hi])

  const pick = (id: string): void => { onPick(id); setOpen(false); btn.current?.focus() }
  const onKey = (e: React.KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const it = shown[hi]
      if (it) pick(it.id)
      else if (custom) pick(custom)
    }
  }

  return (
    <>
      <button ref={btn} type="button" title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        className={`group flex items-center gap-2 h-[30px] pl-2.5 pr-2 rounded-[8px] border bg-surface transition-colors min-w-0 ${
          open ? 'border-primary/50 ring-2 ring-primary/15' : 'border-hairline-strong hover:bg-on-surface/3'} ${className}`}>
        {trigger}
        <ChevronDown size={12} className={`shrink-0 text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
          role="listbox" onKeyDown={onKey}
          className="fixed z-700 fl-dialog overflow-hidden flex flex-col max-h-[min(420px,70vh)]"
          style={{ left: pos.left, top: pos.top, width, transformOrigin: 'top left' }}>
          <div className="relative p-1.5 hairline-b">
            <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0) }} placeholder={placeholder} spellCheck={false}
              className="w-full h-[30px] pl-8 pr-2 rounded-[8px] bg-on-surface/4 text-[12.5px] text-on-surface outline-hidden placeholder:text-on-surface-variant/70" />
          </div>
          <div ref={list} className="flex-1 min-h-0 overflow-y-auto p-1">
            {shown.map((it, i) => (
              <button key={it.id} type="button" data-i={i} role="option" aria-selected={it.id === value}
                onMouseEnter={() => setHi(i)} onClick={() => pick(it.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left transition-colors ${i === hi ? 'bg-primary/12' : ''}`}>
                <span className="flex-1 min-w-0">{it.render(i === hi)}</span>
                {it.id === value && <Check size={13} className="shrink-0 text-primary" />}
              </button>
            ))}
            {custom && (
              <button type="button" onClick={() => pick(custom)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left ${shown.length === 0 ? 'bg-primary/12' : 'hover:bg-on-surface/5'}`}>
                {allowCustom!(custom)}
              </button>
            )}
            {!shown.length && !custom && <p className="px-2 py-3 t-footnote text-on-surface-variant">Nada coincide.</p>}
          </div>
          {footer && <div className="p-1 hairline-t">{footer(() => setOpen(false))}</div>}
        </motion.div>,
        document.body,
      )}
    </>
  )
}
