import { describe, expect, it } from 'vitest'
import { computeCounts, recentConnections } from './sidebar-data'
import type { SqlProfile } from '../plugins/connections/sql'
import type { QueryHistoryEntry } from '../plugins/sql-runner/types'

const NOW = new Date('2026-10-26T15:00:00').getTime()
const H = 3_600_000

describe('computeCounts', () => {
  it('sin nada para mirar, sin contadores', () => {
    expect(computeCounts({}, NOW)).toEqual({})
  })
  it('claves débiles y repetidas suman', () => {
    const c = computeCounts({ audit: { weak: ['a'], reused: [['b', 'c']], scores: {} } }, NOW)
    expect(c['credentials']).toMatchObject({ n: 3, tone: 'warn' })
  })
  it('consultas con error: sólo las de hoy', () => {
    const h = (ok: boolean, at: number): QueryHistoryEntry => ({ ok, at } as QueryHistoryEntry)
    const c = computeCounts({ history: [h(false, NOW - H), h(false, NOW - 20 * H), h(true, NOW - H)] }, NOW)
    expect(c['sql-runner']).toMatchObject({ n: 1, tone: 'error', title: '1 consulta con error hoy' })
  })
  it('videos nuevos: del último día y sin abrir después de grabados', () => {
    const c = computeCounts({ videos: [
      { modifiedAt: NOW - H },
      { modifiedAt: NOW - H, openedAt: NOW - H / 2 },
      { modifiedAt: NOW - 30 * H },
    ] }, NOW)
    expect(c['captures']).toMatchObject({ n: 1, tone: 'info' })
  })
  it('tickets con actividad hoy, sin repetir', () => {
    const c = computeCounts({ ticketsAt: [
      { ticket: 'WIGOS-1', at: NOW - H }, { ticket: 'WIGOS-1', at: NOW - 2 * H }, { ticket: 'WIGOS-2', at: NOW - 40 * H },
    ] }, NOW)
    expect(c['tickets']).toMatchObject({ n: 1, title: '1 ticket con actividad hoy' })
  })
})

describe('recentConnections', () => {
  it('las últimas usadas primero, hasta el máximo', () => {
    const p = (name: string, lastUsedAt?: number): SqlProfile => ({ id: name, name, lastUsedAt } as SqlProfile)
    expect(recentConnections([p('B'), p('A', 5), p('C', 9), p('D')], 3).map((x) => x.name)).toEqual(['C', 'A', 'B'])
  })
})
