import { describe, expect, it } from 'vitest'
import { pushRecent, rankObjects, sameObject, type ObjectRef } from './object-prefs'

const ref = (name: string, at = 0, db = 'wgdb_000'): ObjectRef => ({ profileId: 'p1', db, schema: 'dbo', name, type: 'U', at })

describe('pushRecent', () => {
  it('lo nuevo arriba, sin repetir y con tope', () => {
    let l: ObjectRef[] = []
    l = pushRecent(l, ref('accounts', 1))
    l = pushRecent(l, ref('terminals', 2))
    l = pushRecent(l, ref('ACCOUNTS', 3))
    expect(l.map((x) => x.name)).toEqual(['ACCOUNTS', 'terminals'])
    expect(pushRecent(l, ref('x'), 2)).toHaveLength(2)
  })
  it('la misma tabla en otra base es otro objeto', () => {
    expect(sameObject(ref('accounts'), ref('accounts', 0, 'wgdb_lps'))).toBe(false)
  })
})

describe('rankObjects', () => {
  const items = [
    { schema: 'dbo', name: 'account_movements', db: 'wgdb_000' },
    { schema: 'dbo', name: 'accounts', db: 'wgdb_lps' },
    { schema: 'dbo', name: 'accounts', db: 'wgdb_000' },
    { schema: 'dbo', name: 'customer_accounts', db: 'wgdb_000' },
    { schema: 'dbo', name: 'terminals', db: 'wgdb_000' },
  ]
  it('exacto, después empieza igual, después contiene; la base actual primero', () => {
    const r = rankObjects(items, 'accounts', 'wgdb_000')
    expect(r.map((x) => `${x.db}.${x.name}`)).toEqual(['wgdb_000.accounts', 'wgdb_lps.accounts', 'wgdb_000.customer_accounts'])
  })
  it('varias palabras: tienen que estar todas (también la base)', () => {
    expect(rankObjects(items, 'accounts lps').map((x) => x.db)).toEqual(['wgdb_lps'])
  })
  it('sin texto, nada', () => {
    expect(rankObjects(items, '  ')).toEqual([])
  })
})
