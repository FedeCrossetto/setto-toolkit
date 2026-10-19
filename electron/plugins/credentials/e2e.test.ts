import { describe, expect, it } from 'vitest'
import {
  decryptPassword, decryptSecret, deriveKey, encryptPassword, encryptSecret, makeCheck, newSalt, parseBlob, validKdf, verifyCheck,
  DEFAULT_KDF,
} from './e2e-crypto'
import { countStates, decideMerge, itemSyncState } from './e2e-merge'
import { classifyE2EError, E2E_MIGRATION_MISSING, E2ESync, type E2ERemote, type RemoteBlobRow, type VaultMeta } from './e2e-sync'

// ── Crypto ────────────────────────────────────────────────────────────────────

describe('e2e crypto', () => {
  it('round-trips with the right password and fails with a wrong one', async () => {
    const salt = newSalt()
    const key = await deriveKey('correcto caballo batería', salt)
    const blob = encryptSecret(key, 'hunter2 ñ', { salt, aad: 'cred:1' })
    expect(blob.startsWith('v1:')).toBe(true)
    expect(blob.split(':')).toHaveLength(5)
    expect(decryptSecret(key, blob, 'cred:1')).toBe('hunter2 ñ')
    const wrong = await deriveKey('incorrecto', salt)
    expect(() => decryptSecret(wrong, blob, 'cred:1')).toThrow()
  })

  it('uses a fresh IV each time', async () => {
    const key = await deriveKey('x'.repeat(12), newSalt())
    expect(encryptSecret(key, 'a')).not.toBe(encryptSecret(key, 'a'))
  })

  it('detects tampering (GCM) and a moved blob (AAD)', async () => {
    const salt = newSalt()
    const key = await deriveKey('una maestra larga', salt)
    const blob = encryptPassword(key, salt, 'id-a', { p: 'secreta', t: 5 })
    expect(decryptPassword(key, 'id-a', blob)).toEqual({ p: 'secreta', t: 5 })
    // Flip one ciphertext bit.
    const parts = blob.split(':')
    const ct = Buffer.from(parts[4]!, 'base64')
    ct[0] = ct[0]! ^ 1
    const tampered = [...parts.slice(0, 4), ct.toString('base64')].join(':')
    expect(() => decryptPassword(key, 'id-a', tampered)).toThrow()
    // Same blob pasted into another row.
    expect(() => decryptPassword(key, 'id-b', blob)).toThrow()
    expect(parseBlob('v2:a:b:c:d')).toBeNull()
  })

  it('key-check value verifies only the right key', async () => {
    const salt = newSalt()
    const key = await deriveKey('maestra-uno-123', salt)
    const check = makeCheck(key, salt)
    expect(verifyCheck(key, check)).toBe(true)
    expect(verifyCheck(await deriveKey('maestra-dos-123', salt), check)).toBe(false)
  })

  it('rejects dangerous KDF params', () => {
    expect(validKdf(DEFAULT_KDF)).toBe(true)
    expect(DEFAULT_KDF.N).toBeGreaterThanOrEqual(2 ** 15)
    expect(validKdf({ ...DEFAULT_KDF, N: 2 ** 30 })).toBe(false)
    expect(validKdf({ ...DEFAULT_KDF, N: 3000 })).toBe(false)
    expect(validKdf({ ...DEFAULT_KDF, p: 64 })).toBe(false)
  })
})

// ── Merge ─────────────────────────────────────────────────────────────────────

describe('decideMerge', () => {
  it('pulls what is missing here and pushes what is missing there', () => {
    expect(decideMerge({}, { password: 'r', at: 1 })).toBe('pull')
    expect(decideMerge({ password: 'l', at: 1 }, {})).toBe('push')
    expect(decideMerge({}, {})).toBe('none')
    expect(decideMerge({ password: 'same', at: 1 }, { password: 'same', at: 9 })).toBe('none')
  })

  it('the newer timestamp wins', () => {
    expect(decideMerge({ password: 'l', at: 10 }, { password: 'r', at: 5 })).toBe('push')
    expect(decideMerge({ password: 'l', at: 5 }, { password: 'r', at: 10 })).toBe('pull')
  })

  it('a local password without timestamp that differs is a conflict, never overwritten', () => {
    expect(decideMerge({ password: 'l' }, { password: 'r', at: 10 })).toBe('conflict')
    expect(decideMerge({ password: 'l', at: 0 }, { password: 'r' })).toBe('conflict')
    expect(decideMerge({ password: 'same' }, { password: 'same', at: 10 })).toBe('none')
  })

  it('a password cleared here after the remote one was set clears it remotely', () => {
    expect(decideMerge({ at: 20 }, { password: 'r', at: 10 })).toBe('push')
    expect(decideMerge({ at: 5 }, { password: 'r', at: 10 })).toBe('pull')
  })
})

describe('itemSyncState', () => {
  it('synced only when both sides still match what was last seen', () => {
    const known = { pwd: 'p1', blob: 'b1' }
    expect(itemSyncState({ localHash: 'p1', remoteBlobHash: 'b1', known })).toBe('synced')
    expect(itemSyncState({ localHash: 'p2', remoteBlobHash: 'b1', known })).toBe('local')
    expect(itemSyncState({ localHash: 'p1', remoteBlobHash: 'b2', known })).toBe('local')
    expect(itemSyncState({ localHash: 'p1' })).toBe('local')
    expect(itemSyncState({ remoteBlobHash: 'b1' })).toBe('remote')
    expect(itemSyncState({})).toBeUndefined()
    expect(itemSyncState({ localHash: 'p1', remoteBlobHash: 'b1', known, conflictBlob: 'b1' })).toBe('conflict')
    expect(itemSyncState({ localHash: 'p1', remoteBlobHash: 'b2', conflictBlob: 'b1' })).toBe('local')
    expect(countStates(['synced', 'local', 'local', undefined, 'remote', 'conflict'])).toEqual({ synced: 1, local: 2, remote: 1, conflict: 1 })
  })
})

// ── Full flow with fakes (two PCs sharing one "Supabase") ────────────────────

class FakeRemote implements E2ERemote {
  meta: VaultMeta | null = null
  rows = new Map<string, RemoteBlobRow>()
  missing = false
  private guard(): void { if (this.missing) throw new Error(`${E2E_MIGRATION_MISSING}: column password_e2e does not exist`) }
  async getMeta() { this.guard(); return this.meta }
  async putMeta(m: VaultMeta) { this.guard(); this.meta = m }
  async deleteMeta() { this.guard(); this.meta = null }
  async listBlobs() { this.guard(); return [...this.rows.values()].map((r) => ({ ...r })) }
  async putBlob(id: string, blob: string | null) { this.guard(); const r = this.rows.get(id); if (r) r.blob = blob }
  async clearAllBlobs() { this.guard(); for (const r of this.rows.values()) r.blob = null }
}

function pc(remote: FakeRemote, vault: Record<string, string>, clock = { t: 1000 }) {
  const files = new Map<string, unknown>()
  const sync = new E2ESync({
    remote: () => remote,
    store: {
      read: <T>(f: string) => (files.has(f) ? structuredClone(files.get(f)) as T : null),
      write: (f, d) => { files.set(f, structuredClone(d)) },
      remove: (f) => { files.delete(f) },
    },
    readVault: () => ({ ...vault }),
    setVaultPassword: (id, p) => { if (p) vault[id] = p; else delete vault[id] },
    isLocalMode: () => false,
    lockMinutes: () => 5,
    now: () => clock.t,
  })
  return { sync, vault, files, clock }
}

describe('E2ESync flow', () => {
  const MASTER = 'una maestra bien larga'

  it('PC A sets up and uploads; PC B unlocks and gets what it lacks', async () => {
    const remote = new FakeRemote()
    remote.rows.set('a', { id: 'a', blob: null, updatedAt: 0 })
    remote.rows.set('b', { id: 'b', blob: null, updatedAt: 0 })
    const A = pc(remote, { a: 'pa', b: 'pb' })
    const ids = ['a', 'b']

    expect((await A.sync.setup(ids, 'corta', false)).ok).toBe(false)
    const r = await A.sync.setup(ids, MASTER, false)
    expect(r.ok).toBe(true)
    expect(r.pushed).toBe(2)
    expect(r.status.state).toBe('unlocked')
    expect(r.status.counts).toEqual({ synced: 2, local: 0, remote: 0, conflict: 0 })
    // Nothing in plaintext remotely.
    expect(JSON.stringify([...remote.rows.values()])).not.toMatch(/"pa"|"pb"/)

    const B = pc(remote, { b: 'pb' })
    await B.sync.refresh()   // locked: only learns which blobs exist
    expect(B.sync.status(ids).state).toBe('locked')
    expect(B.sync.itemStates(ids)).toEqual({ a: 'remote', b: 'local' })

    expect((await B.sync.unlock(ids, 'otra cosa larga', false)).error).toMatch(/no es correcta/)
    const u = await B.sync.unlock(ids, MASTER, false)
    expect(u.ok).toBe(true)
    expect(u.pulled).toBe(0 + 1)
    expect(B.vault).toEqual({ a: 'pa', b: 'pb' })
    expect(B.sync.itemStates(ids)).toEqual({ a: 'synced', b: 'synced' })
  })

  it('a newer change on one PC reaches the other; lock forgets the key unless remembered', async () => {
    const remote = new FakeRemote()
    remote.rows.set('a', { id: 'a', blob: null, updatedAt: 0 })
    const clock = { t: 1000 }
    const A = pc(remote, { a: 'v1' }, clock)
    const B = pc(remote, {}, clock)
    await A.sync.setup(['a'], MASTER, false)
    await B.sync.unlock(['a'], MASTER, true)
    expect(B.vault.a).toBe('v1')

    clock.t = 2000
    A.vault.a = 'v2'
    A.sync.notePasswordChange('a')
    expect(await A.sync.pushOne('a')).toBe(true)

    B.sync.lock()
    expect(B.sync.isUnlocked()).toBe(true)   // remembered on this PC
    await B.sync.refresh()
    expect(B.vault.a).toBe('v2')

    A.sync.lock()
    expect(A.sync.isUnlocked()).toBe(false)
  })

  it('change master password re-encrypts; old remembered keys stop working', async () => {
    const remote = new FakeRemote()
    remote.rows.set('a', { id: 'a', blob: null, updatedAt: 0 })
    const A = pc(remote, { a: 'pa' })
    const B = pc(remote, { a: 'pa' })
    await A.sync.setup(['a'], MASTER, false)
    await B.sync.unlock(['a'], MASTER, true)
    const oldBlob = remote.rows.get('a')!.blob

    const c = await A.sync.change(['a'], MASTER, 'la nueva maestra 2')
    expect(c.ok).toBe(true)
    expect(remote.rows.get('a')!.blob).not.toBe(oldBlob)

    await B.sync.refresh()
    expect(B.sync.status(['a']).state).toBe('locked')
    expect((await B.sync.unlock(['a'], MASTER, false)).ok).toBe(false)
    expect((await B.sync.unlock(['a'], 'la nueva maestra 2', false)).ok).toBe(true)
  })

  it('a pre-existing different password on another PC becomes a conflict; the user picks', async () => {
    const remote = new FakeRemote()
    remote.rows.set('a', { id: 'a', blob: null, updatedAt: 0 })
    remote.rows.set('b', { id: 'b', blob: null, updatedAt: 0 })
    const clock = { t: 1000 }
    const A = pc(remote, { a: 'from-A', b: 'same' }, clock)
    await A.sync.setup(['a', 'b'], MASTER, false)

    // B had its own passwords before syncing (no timestamps): 'a' differs, 'b' is identical.
    const B = pc(remote, { a: 'from-B', b: 'same' }, clock)
    const u = await B.sync.unlock(['a', 'b'], MASTER, false)
    expect(u.ok).toBe(true)
    expect(B.vault.a).toBe('from-B')                  // not overwritten
    expect(B.sync.itemStates(['a', 'b'])).toEqual({ a: 'conflict', b: 'synced' })
    expect(u.status.counts.conflict).toBe(1)
    await B.sync.refresh()                             // stays a conflict, still untouched
    expect(B.vault.a).toBe('from-B')
    expect(B.sync.itemStates(['a'])).toEqual({ a: 'conflict' })

    // "Usar la sincronizada" + Deshacer.
    expect((await B.sync.resolveConflict(['a'], 'a', 'remote')).ok).toBe(true)
    expect(B.vault.a).toBe('from-A')
    expect(B.sync.itemStates(['a'])).toEqual({ a: 'synced' })
    expect((await B.sync.resolveConflict(['a'], 'a', 'undo')).ok).toBe(true)
    expect(B.vault.a).toBe('from-B')
    expect(B.sync.itemStates(['a'])).toEqual({ a: 'conflict' })

    // "Usar la de esta PC": re-uploaded as the newest, then A gets it.
    clock.t = 5000
    expect((await B.sync.resolveConflict(['a'], 'a', 'local')).pushed).toBe(1)
    expect(B.sync.itemStates(['a'])).toEqual({ a: 'synced' })
    await A.sync.refresh()
    expect(A.vault.a).toBe('from-B')
  })

  it('disable removes remote blobs and the vault meta; local passwords stay', async () => {
    const remote = new FakeRemote()
    remote.rows.set('a', { id: 'a', blob: null, updatedAt: 0 })
    const A = pc(remote, { a: 'pa' })
    await A.sync.setup(['a'], MASTER, true)
    const d = await A.sync.disable(['a'])
    expect(d.ok).toBe(true)
    expect(d.status.state).toBe('off')
    expect(remote.meta).toBeNull()
    expect(remote.rows.get('a')!.blob).toBeNull()
    expect(A.vault.a).toBe('pa')
  })

  it('reports the missing migration instead of failing', async () => {
    const remote = new FakeRemote()
    remote.missing = true
    const A = pc(remote, {})
    expect((await A.sync.getStatus([])).state).toBe('migration-missing')
    expect(classifyE2EError(new Error('fetch failed'))).toBe('offline')
  })
})
