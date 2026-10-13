import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

// Dos "equipos" = dos carpetas userData distintas que comparten un Supabase en memoria.
let currentUserData = ''
vi.mock('electron', () => ({
  app: { getPath: () => currentUserData },
  shell: { trashItem: async (p: string) => { fs.unlinkSync(p) } },
}))
vi.mock('../logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('./supabase-client', () => ({ createSupabaseClient: () => { throw new Error('no real supabase in tests') } }))

import { SyncService } from './sync.service'
import type { Snippet } from '../../../src/plugins/snippets/types'

type Row = { kind: string; id: string; payload: unknown; hash: string; updated_at: number; deleted: boolean; device?: string }

/** Lo mínimo de supabase-js que usa el servicio, sobre un Map. */
let failNextUpsert = false

function fakeSupabase(store: Map<string, Row>): SupabaseClient {
  const key = (r: { kind: string; id: string }): string => `${r.kind}/${r.id}`
  const from = () => ({
    select: (cols: string) => {
      const pick = (r: Row): Record<string, unknown> => Object.fromEntries(cols.split(',').map((c) => [c, (r as Record<string, unknown>)[c]]))
      const all = [...store.values()]
      return {
        range: async (a: number, b: number) => ({ data: all.slice(a, b + 1).map(pick), error: null }),
        eq: (_col: string, kind: string) => ({
          in: async (_c: string, ids: string[]) => ({ data: all.filter((r) => r.kind === kind && ids.includes(r.id)).map(pick), error: null }),
        }),
      }
    },
    upsert: async (rows: Row[]) => {
      if (failNextUpsert) { failNextUpsert = false; return { error: { message: 'network down' } } }
      for (const r of rows) store.set(key(r), structuredClone(r))
      return { error: null }
    },
  })
  return { from } as unknown as SupabaseClient
}

class Machine {
  dir: string
  data = new Map<string, unknown>()
  svc: SyncService
  constructor(remote: Map<string, Row>, name: string) {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), `setto-sync-${name}-`))
    const data = this.data
    const db = {
      readJSON: <T,>(f: string): T | null => (data.has(f) ? structuredClone(data.get(f)) as T : null),
      writeJSON: (f: string, v: unknown): void => { data.set(f, structuredClone(v)) },
    }
    const settings = { get: () => '1', set: () => undefined }
    const gastos = { resolveSupabaseCredentials: () => ({ url: 'x', key: 'y' }) }
    class TestSync extends SyncService { protected client(): SupabaseClient { return fakeSupabase(remote) } }
    this.svc = new TestSync(db as never, settings as never, gastos as never, () => null)
  }
  get notesDir(): string { return path.join(this.dir, 'notes') }
  async sync() { currentUserData = this.dir; return this.svc.run() }
  writeNote(id: string, content: string): void {
    fs.mkdirSync(this.notesDir, { recursive: true })
    fs.writeFileSync(path.join(this.notesDir, id), content)
  }
  readNote(id: string): string | null {
    try { return fs.readFileSync(path.join(this.notesDir, id), 'utf-8') } catch { return null }
  }
  notes(): string[] { try { return fs.readdirSync(this.notesDir).sort() } catch { return [] } }
  deleteNote(id: string): void { fs.unlinkSync(path.join(this.notesDir, id)) }
  snippets(): Snippet[] { return (this.data.get('snippets.json') as Snippet[]) ?? [] }
  setSnippets(s: Snippet[]): void { this.data.set('snippets.json', s) }
  cleanup(): void { fs.rmSync(this.dir, { recursive: true, force: true }) }
}

const snip = (id: string, title: string, updatedAt: string, extra: Partial<Snippet> = {}): Snippet => ({
  id, title, language: 'sql', content: 'select 1', tags: [], description: '', pinned: false, collectionId: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt, ...extra,
})

describe('SyncService (dos equipos, Supabase en memoria)', () => {
  let remote: Map<string, Row>
  let A: Machine
  let B: Machine
  beforeEach(() => { remote = new Map(); A = new Machine(remote, 'a'); B = new Machine(remote, 'b') })
  afterEach(() => { A.cleanup(); B.cleanup() })

  it('una nota creada en A aparece en B, y una edición en B vuelve a A', async () => {
    A.writeNote('Ideas.md', '# Ideas\nuno')
    expect((await A.sync()).pushed).toBe(1)
    expect((await B.sync()).pulled).toBe(1)
    expect(B.readNote('Ideas.md')).toBe('# Ideas\nuno')

    B.writeNote('Ideas.md', '# Ideas\nuno\ndos')
    await B.sync()
    await A.sync()
    expect(A.readNote('Ideas.md')).toBe('# Ideas\nuno\ndos')
    // Sin cambios: nada que hacer
    expect(await A.sync()).toEqual({ pushed: 0, pulled: 0, deleted: 0, conflicts: 0, skipped: 0 })
  })

  it('borrar en A borra en B (si B no la tocó)', async () => {
    A.writeNote('Tmp.md', 'tmp')
    await A.sync(); await B.sync()
    A.deleteNote('Tmp.md')
    await A.sync()
    expect((await B.sync()).deleted).toBe(1)
    expect(B.readNote('Tmp.md')).toBeNull()
  })

  it('conflicto: se conservan las dos versiones de la nota', async () => {
    A.writeNote('Plan.md', 'Plan\nbase')
    await A.sync(); await B.sync()
    A.writeNote('Plan.md', 'Plan\nversión A')
    B.writeNote('Plan.md', 'Plan\nversión B')
    await A.sync()
    const r = await B.sync()
    expect(r.conflicts).toBe(1)
    expect(B.readNote('Plan.md')).toBe('Plan\nversión B')
    const copy = B.notes().find((n) => n.includes('conflicto'))!
    expect(B.readNote(copy)).toContain('versión A')
    // La copia y la versión de B llegan a A en la siguiente vuelta
    await B.sync(); await A.sync()
    expect(A.readNote('Plan.md')).toBe('Plan\nversión B')
    expect(A.notes()).toContain(copy)
  })

  it('si la subida falla, la próxima vuelta sube la versión local (no baja la vieja encima)', async () => {
    A.writeNote('N.md', 'v1')
    await A.sync(); await B.sync()
    B.writeNote('N.md', 'v2')
    failNextUpsert = true
    await expect(B.sync()).rejects.toThrow('network down')
    const r = await B.sync()
    expect(r.pushed).toBe(1)
    expect(B.readNote('N.md')).toBe('v2')
    await A.sync()
    expect(A.readNote('N.md')).toBe('v2')
  })

  it('snippets: viajan sin los contadores de uso y gana el cambio más reciente', async () => {
    A.setSnippets([snip('s1', 'Query', '2026-10-01T00:00:00Z', { useCount: 9, lastUsedAt: 5 })])
    await A.sync(); await B.sync()
    expect(B.snippets()[0]!.title).toBe('Query')
    expect(B.snippets()[0]!.useCount).toBeUndefined()

    // Usarlo no cambia el hash: no hay nada que sincronizar
    B.setSnippets([{ ...B.snippets()[0]!, useCount: 3 }])
    expect((await B.sync()).pushed).toBe(0)

    A.setSnippets([{ ...A.snippets()[0]!, title: 'Query A', updatedAt: '2026-10-02T00:00:00Z' }])
    B.setSnippets([{ ...B.snippets()[0]!, title: 'Query B', updatedAt: '2026-10-03T00:00:00Z' }])
    await A.sync()
    await B.sync()   // conflicto: B es más nuevo → se sube B
    await A.sync()
    expect(A.snippets()[0]!.title).toBe('Query B')
    expect(A.snippets()[0]!.useCount).toBe(9)   // los contadores locales se conservan
  })
})
