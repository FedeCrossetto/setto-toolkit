import type { Tab } from './types'

/**
 * Navegación de un solo módulo: la barra lateral es LA navegación y la barra
 * superior sólo muestra el módulo actual. Para conservar el estado de los
 * módulos sin crecer sin límite, quedan montados los últimos `MOUNT_LIMIT`
 * usados (LRU). `openTabs` = módulos montados, del menos al más reciente.
 */
export const MOUNT_LIMIT = 6

/**
 * Pone `activeId` al final (más reciente) y desmonta los más viejos hasta
 * quedar en `limit`. Nunca desmonta el activo, un módulo con cambios sin
 * guardar ni uno que `keep` marque como persistente (p. ej. Terminal, cuyas
 * sesiones morirían al desmontarse). Si no hay a quién desmontar, se pasa del límite.
 * Devuelve el mismo array si no cambió nada (para no re-renderizar).
 */
export function touchMounted(
  tabs: Tab[],
  activeId: string | null,
  dirty: Record<string, boolean>,
  limit = MOUNT_LIMIT,
  keep: (pluginId: string) => boolean = () => false,
): Tab[] {
  let next = tabs
  const idx = activeId ? tabs.findIndex((t) => t.tabId === activeId) : -1
  if (idx >= 0 && idx !== tabs.length - 1) {
    next = [...tabs.slice(0, idx), ...tabs.slice(idx + 1), tabs[idx]!]
  }
  if (next.length <= limit) return next
  const out = [...next]
  for (let i = 0; i < out.length && out.length > limit; ) {
    const t = out[i]!
    if (t.tabId !== activeId && !dirty[t.pluginId] && !keep(t.pluginId)) out.splice(i, 1)
    else i++
  }
  return out
}

/** Ids de módulos del más al menos reciente (para Ctrl+Tab). */
export function recentOrder(tabs: Tab[]): string[] {
  return tabs.map((t) => t.pluginId).reverse()
}

/** Siguiente índice al ciclar (con vuelta). */
export function cycle(length: number, index: number, dir: 1 | -1): number {
  if (length <= 0) return 0
  return (index + dir + length) % length
}

/**
 * Orden de la barra lateral (el mismo que usa Ctrl+1..9): los módulos de
 * secciones en el orden del registro y al final los fijados abajo
 * (salvo "Acerca de", que no aparece en la barra).
 */
export function sidebarOrder<T extends { id: string; pinned?: boolean; section?: string }>(enabled: T[]): T[] {
  const sectionKeys: string[] = []
  for (const p of enabled) {
    if (p.pinned) continue
    const k = p.section ?? 'dev'
    if (!sectionKeys.includes(k)) sectionKeys.push(k)
  }
  const main = sectionKeys.flatMap((k) => enabled.filter((p) => !p.pinned && (p.section ?? 'dev') === k))
  return [...main, ...enabled.filter((p) => p.pinned && p.id !== 'about')]
}
