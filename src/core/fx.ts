import { flushSync } from 'react-dom'
import { motionAllows } from './motion-prefs'

/**
 * Efectos livianos de la app, sin librerías: todo es CSS (transform/opacity) y los
 * elementos se borran solos. Respetan Ajustes → Apariencia → Animaciones.
 */

/** Festejo chiquito: papelitos que salen desde un punto (o desde arriba al centro). */
export function celebrate(origin?: { x: number; y: number }): void {
  if (!motionAllows('fun') || typeof document === 'undefined') return
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 3
  const colors = ['var(--c-primary)', 'var(--c-success)', 'var(--c-warning)', 'var(--c-chart-2)', 'var(--c-chart-3)', 'var(--c-chart-5)']
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span')
    p.className = 'fx-confetti'
    const ang = (Math.PI * 2 * i) / 26 + Math.random() * 0.4
    const dist = 70 + Math.random() * 110
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    p.style.background = `rgb(${colors[i % colors.length]})`
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
    p.style.setProperty('--dy', `${Math.sin(ang) * dist + 60}px`)
    p.style.setProperty('--r', `${Math.round(Math.random() * 540 - 270)}deg`)
    p.style.animationDelay = `${Math.random() * 60}ms`
    layer.appendChild(p)
  }
  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), 1400)
}

/** Festejo desde el centro de un elemento. */
export function celebrateAt(el: Element | null | undefined): void {
  const r = el?.getBoundingClientRect()
  celebrate(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined)
}

/**
 * Cambia de módulo con View Transitions (nativo de Chromium): el contenido hace un
 * fundido corto. Si no se puede o las animaciones están apagadas, cambia directo.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!doc.startViewTransition || !motionAllows('basic') || document.hidden) { update(); return }
  doc.startViewTransition(() => { flushSync(update) })
}

/**
 * Luz que sigue al mouse en las tarjetas con clase `spotlight` (estilo Linear). Un solo
 * listener para toda la app; escribe dos variables CSS, sin re-render.
 */
export function installSpotlight(): () => void {
  let raf = 0
  let last: { el: HTMLElement; x: number; y: number } | null = null
  const onMove = (e: PointerEvent): void => {
    const el = (e.target as HTMLElement | null)?.closest?.('.spotlight') as HTMLElement | null
    if (!el) return
    const r = el.getBoundingClientRect()
    last = { el, x: e.clientX - r.left, y: e.clientY - r.top }
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      if (!last) return
      last.el.style.setProperty('--mx', `${last.x}px`)
      last.el.style.setProperty('--my', `${last.y}px`)
    })
  }
  document.addEventListener('pointermove', onMove, { passive: true })
  return () => { document.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf) }
}
