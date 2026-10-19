import { describe, expect, it } from 'vitest'
import { localOnlySetting, needsSync, syncView } from './local-mode'

const rel = (ts: number): string => `t${ts}`

describe('localOnlySetting', () => {
  it('reads the setting', () => {
    expect(localOnlySetting('1')).toBe(true)
    expect(localOnlySetting('true')).toBe(true)
    expect(localOnlySetting('0')).toBe(false)
    expect(localOnlySetting(null)).toBe(false)
    expect(localOnlySetting(undefined)).toBe(false)
  })
})

describe('needsSync', () => {
  it('never retries in local mode', () => {
    expect(needsSync({ status: 'local', pendingCount: 3 })).toBe(false)
    expect(needsSync(null)).toBe(false)
  })
  it('retries offline, on error or with pending writes', () => {
    expect(needsSync({ status: 'offline', pendingCount: 0 })).toBe(true)
    expect(needsSync({ status: 'error', pendingCount: 0 })).toBe(true)
    expect(needsSync({ status: 'synced', pendingCount: 1 })).toBe(true)
    expect(needsSync({ status: 'synced', pendingCount: 0 })).toBe(false)
  })
})

describe('syncView', () => {
  it('local mode is calm and has no retry', () => {
    const v = syncView({ status: 'local', syncedAt: null, pendingCount: 2 }, rel)
    expect(v).toMatchObject({ kind: 'local', text: 'Solo en esta computadora', tone: 'muted', retry: false })
  })
  it('synced shows the time, pending wins', () => {
    expect(syncView({ status: 'synced', syncedAt: 5, pendingCount: 0 }, rel).sub).toBe('t5')
    expect(syncView({ status: 'synced', syncedAt: 5, pendingCount: 1 }, rel)).toMatchObject({ sub: '1 cambio pendiente', retry: true })
  })
  it('offline and error', () => {
    expect(syncView({ status: 'offline', syncedAt: null, pendingCount: 0 }, rel).sub).toBe('Nunca se sincronizó')
    expect(syncView({ status: 'error', syncedAt: null, pendingCount: 0, error: 'boom' }, rel)).toMatchObject({ tone: 'error', sub: 'boom' })
  })
})
