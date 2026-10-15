import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Tooltip de la app para cualquier elemento con `title` (sin tocar cada botón):
 * reemplaza el tooltip nativo de Windows (lento, con estilo del sistema) por el
 * mismo de <Tooltip>, y si el texto termina en un atajo — "Guardar (Ctrl+S)" —
 * lo muestra como teclas. Mientras se ve, el `title` se guarda en `data-tip`
 * para que no aparezcan los dos.
 */
const DELAY_MS = 450
const SHORTCUT_RE = /\s*\(((?:Ctrl|Alt|Shift|Cmd|Win|F\d{1,2}|Esc|Enter|Supr|Tab)(?:\s*\+\s*[^()]+)?)\)\s*$/i

/** "Guardar (Ctrl+S)" → { label: "Guardar", keys: ["Ctrl", "S"] } */
export function splitShortcut(text: string): { label: string; keys: string[] } {
  const m = SHORTCUT_RE.exec(text)
  if (!m) return { label: text, keys: [] }
  return { label: text.slice(0, m.index).trim(), keys: m[1]!.split('+').map((k) => k.trim()).filter(Boolean) }
}

interface Tip { label: string; keys: string[]; x: number; y: number; below: boolean }

export function GlobalTooltip(): JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const current = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const restore = (): void => {
      const el = current.current
      if (el?.dataset['tip'] !== undefined) {
        if (!el.hasAttribute('title')) el.setAttribute('title', el.dataset['tip']!)
        delete el.dataset['tip']
      }
      current.current = null
    }
    const hide = (): void => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      restore()
      setTip(null)
    }
    const onOver = (e: MouseEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[title]')
      if (!el || el === current.current) return
      // Nada de esto en campos de texto ni en el editor (CodeMirror usa title en sus marcas).
      if (el.closest('.cm-editor, input, textarea, [contenteditable="true"]')) return
      const text = el.getAttribute('title')?.trim()
      if (!text) return
      hide()
      current.current = el
      el.dataset['tip'] = text
      el.removeAttribute('title')
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return
        const r = el.getBoundingClientRect()
        const below = r.bottom + 40 < window.innerHeight
        setTip({ ...splitShortcut(text), x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below })
      }, DELAY_MS)
    }
    const onOut = (e: MouseEvent): void => {
      const el = current.current
      if (!el) return
      const to = e.relatedTarget as Node | null
      if (to && el.contains(to)) return
      hide()
    }
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('mousedown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('blur', hide)
    window.addEventListener('scroll', hide, true)
    return () => {
      hide()
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      document.removeEventListener('mousedown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  if (!tip) return null
  // Que no se salga por los costados.
  const x = Math.min(Math.max(tip.x, 12), window.innerWidth - 12)
  return createPortal(
    <div role="tooltip"
      className="pointer-events-none fixed z-[700] flex items-center gap-1.5 max-w-[320px] px-2 py-[5px] rounded-md bg-[rgb(var(--c-topbar))] text-white text-[12px] font-medium leading-[15px] shadow-md"
      style={{ left: x, top: tip.y, transform: tip.below ? 'translateX(-50%)' : 'translate(-50%, -100%)', animation: 'fadeIn 0.12s ease both' }}>
      {tip.label && <span className="whitespace-pre-line">{tip.label}</span>}
      {tip.keys.length > 0 && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {tip.keys.map((k, i) => <kbd key={i} className="font-sans px-1 py-[2px] rounded-[4px] bg-white/[0.14] text-white/80 text-[11px] font-medium leading-none">{k}</kbd>)}
        </span>
      )}
    </div>,
    document.body,
  )
}
