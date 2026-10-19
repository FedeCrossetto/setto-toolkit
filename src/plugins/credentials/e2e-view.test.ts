import { describe, expect, it } from 'vitest'
import { e2eSummary, masterPasswordProblem } from './e2e-view'
import type { E2EStatus } from './types'

const base: E2EStatus = { state: 'off', remembered: false, counts: { synced: 0, local: 0, remote: 0, conflict: 0 }, lastSyncAt: null }

describe('masterPasswordProblem', () => {
  it('asks for length, strength and confirmation', () => {
    expect(masterPasswordProblem('corta', 'corta')).toMatch(/al menos 10/)
    expect(masterPasswordProblem('aaaaaaaaaaaa', 'aaaaaaaaaaaa')).toMatch(/fácil/)
    expect(masterPasswordProblem('Tres-Gatos-Azules-91', 'otra')).toMatch(/no coinciden/)
    expect(masterPasswordProblem('Tres-Gatos-Azules-91', 'Tres-Gatos-Azules-91')).toBeNull()
  })
})

describe('e2eSummary', () => {
  it('describes each state', () => {
    expect(e2eSummary({ ...base, state: 'migration-missing' }).text).toMatch(/migración 004/)
    expect(e2eSummary({ ...base, state: 'locked', counts: { synced: 0, local: 0, remote: 3, conflict: 0 } }).text).toMatch(/3 contraseñas esperan/)
    expect(e2eSummary({ ...base, state: 'unlocked', counts: { synced: 4, local: 0, remote: 0, conflict: 0 } }))
      .toEqual({ text: '4 contraseñas sincronizadas', tone: 'success' })
    expect(e2eSummary({ ...base, state: 'unlocked', counts: { synced: 3, local: 0, remote: 0, conflict: 2 } }))
      .toEqual({ text: '2 conflictos para revisar', tone: 'warning' })
    expect(e2eSummary({ ...base, state: 'unlocked', counts: { synced: 1, local: 2, remote: 0, conflict: 0 } }).tone).toBe('warning')
  })
})
