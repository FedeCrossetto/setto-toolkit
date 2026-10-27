import { useEffect, useState } from 'react'
import type { SqlProfile } from '../plugins/connections/sql'
import type { QueryHistoryEntry } from '../plugins/sql-runner/types'
import type { PasswordAudit } from '../plugins/credentials/types'
import type { CaptureQueryResult, VideoItem } from '../plugins/captures/types'

/**
 * Lo que muestra la barra lateral además de los módulos: contadores a la derecha de cada uno
 * (lo que conviene mirar) y "Tus conexiones" con el resultado de la última prueba.
 * Se lee de lo que ya guarda cada módulo; no prueba conexiones ni toca la red.
 */
export type CountTone = 'error' | 'warn' | 'info'
export interface SidebarCount { n: number; tone: CountTone; title: string }
export type SidebarCounts = Partial<Record<string, SidebarCount>>

const DAY = 86_400_000
const startOfDay = (now: number): number => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export function computeCounts(src: {
  audit?: PasswordAudit | null
  history?: QueryHistoryEntry[]
  videos?: Pick<VideoItem, 'modifiedAt' | 'openedAt'>[]
  ticketsAt?: { ticket: string; at: number }[]
}, now = Date.now()): SidebarCounts {
  const out: SidebarCounts = {}
  const today = startOfDay(now)
  if (src.audit) {
    const n = src.audit.weak.length + src.audit.reused.reduce((s, g) => s + g.length, 0)
    if (n) out['credentials'] = { n, tone: 'warn', title: plural(n, 'clave débil o repetida', 'claves débiles o repetidas') }
  }
  const errs = (src.history ?? []).filter((h) => !h.ok && h.at >= today).length
  if (errs) out['sql-runner'] = { n: errs, tone: 'error', title: plural(errs, 'consulta con error hoy', 'consultas con error hoy') }
  const fresh = (src.videos ?? []).filter((v) => now - v.modifiedAt < DAY && !(v.openedAt && v.openedAt >= v.modifiedAt)).length
  if (fresh) out['captures'] = { n: fresh, tone: 'info', title: plural(fresh, 'video nuevo sin ver', 'videos nuevos sin ver') }
  const tickets = new Set((src.ticketsAt ?? []).filter((t) => t.at >= today).map((t) => t.ticket)).size
  if (tickets) out['tickets'] = { n: tickets, tone: 'info', title: plural(tickets, 'ticket con actividad hoy', 'tickets con actividad hoy') }
  return out
}

/** Conexiones para la barra: las últimas usadas primero, hasta `max`. */
export function recentConnections(list: SqlProfile[], max = 5): SqlProfile[] {
  return [...list].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name, 'es')).slice(0, max)
}

const quiet = <T,>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined)

/** Se refresca al abrir, cada minuto, al volver a la ventana y al cambiar de módulo (`stamp`). */
export function useSidebarData(enabled: (id: string) => boolean, stamp: unknown): { counts: SidebarCounts; connections: SqlProfile[] } {
  const [counts, setCounts] = useState<SidebarCounts>({})
  const [connections, setConnections] = useState<SqlProfile[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000)
    const onFocus = (): void => setTick((x) => x + 1)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])
  const sql = enabled('sql-runner'), creds = enabled('credentials'), caps = enabled('captures'), tix = enabled('tickets')
  useEffect(() => {
    let alive = true
    const inv = <T,>(ch: string, ...a: unknown[]): Promise<T | undefined> => quiet(window.api.invoke<T>(ch, ...a))
    void Promise.all([
      sql ? inv<SqlProfile[]>('sql:list') : undefined,
      sql ? inv<QueryHistoryEntry[]>('sql:history-get') : undefined,
      creds ? inv<PasswordAudit>('credentials:password-audit') : undefined,
      caps ? inv<{ items: VideoItem[] }>('videos:list') : undefined,
      tix ? inv<CaptureQueryResult>('captures:query', { limit: 300 }) : undefined,
    ]).then(([profiles, history, audit, videos, caps]) => {
      if (!alive) return
      setConnections(recentConnections(profiles ?? []))
      setCounts(computeCounts({
        audit, history, videos: videos?.items,
        ticketsAt: (caps?.items ?? []).flatMap((c) => (c.ticket ? [{ ticket: c.ticket, at: c.createdAt }] : [])),
      }))
    })
    return () => { alive = false }
  }, [sql, creds, caps, tix, tick, stamp])
  return { counts, connections }
}
