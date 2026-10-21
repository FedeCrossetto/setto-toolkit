import { describe, it, expect } from 'vitest'
import { filterCredentials, rankCredentials, groupCredentials, displayHost, faviconUrl, initials, tintIndex } from './data'
import type { Credential } from './types'

const c = (p: Partial<Credential> & { password?: string }): Credential => ({ id: p.nombre ?? 'x', nombre: '', usuario: '', hasPassword: true, orden: 0, password: 'secreto123', ...p } as Credential)

const items = [
  c({ id: '1', nombre: 'Jira Winsys', usuario: 'f.vazquez', url: 'https://jira.example.com', categoria: 'Trabajo' }),
  c({ id: '2', nombre: 'Banco', usuario: 'fede', categoria: 'Personal', notas: 'pin jira' }),
  c({ id: '3', nombre: 'Árbol SQL', usuario: 'sa' }),
]

describe('filterCredentials', () => {
  it('matches name, user, url and category', () => {
    expect(filterCredentials(items, 'jira').map((x) => x.id)).toEqual(['1'])
    expect(filterCredentials(items, 'fede').map((x) => x.id)).toEqual(['2'])
    expect(filterCredentials(items, 'example.com').map((x) => x.id)).toEqual(['1'])
    expect(filterCredentials(items, 'personal').map((x) => x.id)).toEqual(['2'])
    expect(filterCredentials(items, 'arbol').map((x) => x.id)).toEqual(['3'])
  })
  it('never matches the password or notes', () => {
    expect(filterCredentials(items, 'secreto123')).toHaveLength(0)
    expect(filterCredentials(items, 'pin')).toHaveLength(0)
  })
})

describe('rankCredentials', () => {
  it('puts name matches first', () => {
    const list = [c({ id: 'a', nombre: 'Otro', usuario: 'git' }), c({ id: 'b', nombre: 'GitHub' })]
    expect(rankCredentials(list, 'git').map((r) => r.item.id)).toEqual(['b', 'a'])
  })
})

describe('groupCredentials', () => {
  it('groups by category with "Sin categoría" last', () => {
    expect(groupCredentials(items).map((g) => g.key)).toEqual(['Personal', 'Trabajo', 'Sin categoría'])
  })
  it('groups A–Z when nobody has a category', () => {
    const list = [c({ nombre: 'beta' }), c({ nombre: 'Árbol' }), c({ nombre: '1password' }), c({ nombre: 'alfa' })]
    const groups = groupCredentials(list)
    expect(groups.map((g) => g.key)).toEqual(['A', 'B', '#'])
    expect(groups[0]!.items.map((x) => x.nombre)).toEqual(['alfa', 'Árbol'])
  })
})

describe('displayHost', () => {
  it('extracts host', () => {
    expect(displayHost('https://foo.com/x')).toBe('foo.com')
    expect(displayHost('foo.com')).toBe('foo.com')
    expect(displayHost(undefined)).toBe('')
  })
})

describe('faviconUrl', () => {
  it('only for public hosts', () => {
    expect(faviconUrl('https://github.com/login')).toContain('domain=github.com')
    expect(faviconUrl('jira')).toBeNull()
    expect(faviconUrl('http://192.168.0.10:8080')).toBeNull()
    expect(faviconUrl('srv.local')).toBeNull()
    expect(faviconUrl(undefined)).toBeNull()
  })
})

describe('initials / tintIndex', () => {
  it('builds two-letter initials', () => {
    expect(initials('Banco Nación')).toBe('BN')
    expect(initials('jira')).toBe('JI')
    expect(initials('  ')).toBe('?')
  })
  it('is stable and in range', () => {
    expect(tintIndex('Jira', 5)).toBe(tintIndex('jira', 5))
    expect(tintIndex('x', 5)).toBeLessThan(5)
  })
})

describe('rankCredentials by usage', () => {
  const now = Date.UTC(2026, 9, 14)
  it('breaks ties by usage', () => {
    const list = [c({ id: 'a', nombre: 'Git A' }), { ...c({ id: 'b', nombre: 'Git B' }), useCount: 8, lastUsedAt: now - 3600_000 }]
    expect(rankCredentials(list, 'git', 6, now).map((r) => r.item.id)).toEqual(['b', 'a'])
  })
  it('never lets usage beat a better name match', () => {
    const list = [{ ...c({ id: 'a', nombre: 'Otro', usuario: 'git' }), useCount: 500, lastUsedAt: now }, c({ id: 'b', nombre: 'GitHub' })]
    expect(rankCredentials(list, 'git', 6, now).map((r) => r.item.id)).toEqual(['b', 'a'])
  })
})

describe('logoDomain', () => {
  it('URL primero; si no, marca por nombre, correo o nombre.com', async () => {
    const { logoDomain } = await import('./data')
    expect(logoDomain({ nombre: 'Lo que sea', url: 'https://jira.winsysgroup.com/x' })).toBe('jira.winsysgroup.com')
    expect(logoDomain({ nombre: 'AWS IAM User' })).toBe('aws.amazon.com')
    expect(logoDomain({ nombre: 'Atlassian', usuario: 'f.vazquez@winsysgroup.com' })).toBe('atlassian.com')
    expect(logoDomain({ nombre: 'Bamboo (SecSign ID)' })).toBe('bamboohr.com')
    expect(logoDomain({ nombre: 'Mi email', usuario: 'f.vazquez@winsysgroup.com' })).toBe('winsysgroup.com')
    expect(logoDomain({ nombre: 'Banco Nación' })).toBe('bna.com.ar')
    expect(logoDomain({ nombre: 'portal.cliente.com.ar' })).toBe('portal.cliente.com.ar')
    expect(logoDomain({ nombre: 'Canva' })).toBe('canva.com')
    expect(logoDomain({ nombre: 'DB' })).toBeNull()
  })
})
