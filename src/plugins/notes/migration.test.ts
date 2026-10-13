import { describe, it, expect, vi } from 'vitest'
import { extractUntitledBuffers, migrateEditorBuffers, EDITOR_SESSION_KEY, MIGRATION_FLAG_KEY } from './migration'

const session = JSON.stringify({
  tabs: [
    { path: null, name: 'Sin título 1', content: 'nota uno', language: 'text' },
    { path: 'C:/x.ts', name: 'x.ts', dirtyContent: 'ignored' },
    { path: null, name: 'Sin título 2', content: '   \n ', language: 'text' },
    { path: null, name: 'Sin título 3', content: '# Dos\ncuerpo', language: 'markdown' },
  ],
  activePath: null,
  activeName: 'Sin título 1',
})

function memStorage(init: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
  const data = { ...init }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
}

describe('extractUntitledBuffers', () => {
  it('keeps only untitled, non-empty buffers', () => {
    expect(extractUntitledBuffers(session)).toEqual(['nota uno', '# Dos\ncuerpo'])
  })
  it('tolerates missing / malformed sessions', () => {
    expect(extractUntitledBuffers(null)).toEqual([])
    expect(extractUntitledBuffers('not json')).toEqual([])
    expect(extractUntitledBuffers('{"tabs":5}')).toEqual([])
  })
})

describe('migrateEditorBuffers', () => {
  it('imports once and does not touch the editor session', async () => {
    const storage = memStorage({ [EDITOR_SESSION_KEY]: session })
    const write = vi.fn().mockResolvedValue({})
    expect(await migrateEditorBuffers(write, storage)).toBe(2)
    expect(write).toHaveBeenCalledTimes(2)
    expect(storage.data[MIGRATION_FLAG_KEY]).toBeTruthy()
    expect(storage.data[EDITOR_SESSION_KEY]).toBe(session)
    expect(await migrateEditorBuffers(write, storage)).toBe(0)
    expect(write).toHaveBeenCalledTimes(2)
  })
  it('does not set the flag when a write fails', async () => {
    const storage = memStorage({ [EDITOR_SESSION_KEY]: session })
    await expect(migrateEditorBuffers(vi.fn().mockRejectedValue(new Error('x')), storage)).rejects.toThrow()
    expect(storage.data[MIGRATION_FLAG_KEY]).toBeUndefined()
  })
})
