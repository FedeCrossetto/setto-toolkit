import { dialog } from 'electron'
import fs from 'fs'
import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { Snippet, SnippetCollection, SnippetsMeta } from '../../../src/plugins/snippets/types'
import { registerHandler } from '../../core/ipc-handler'
import { migrateQueries, type LegacyQuery } from './migrate-queries'

const SNIPPETS_FILE    = 'snippets.json'
const COLLECTIONS_FILE = 'snippets-collections.json'
const META_FILE        = 'snippets-meta.json'

export const handlers: PluginHandlers = {
  pluginId: 'snippets',

  register(ipcMain: IpcMain, { db }: CoreServices): void {

    registerHandler(ipcMain, 'snippets:load', () => {
      const snippets    = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const collections = db.readJSON<SnippetCollection[]>(COLLECTIONS_FILE) ?? []
      return { snippets, collections }
    })

    registerHandler(ipcMain, 'snippets:save', (_e, snippet: Snippet) => {
      const all = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const idx = all.findIndex((s) => s.id === snippet.id)
      const now = new Date().toISOString()
      if (idx >= 0) {
        all[idx] = { ...snippet, updatedAt: now }
      } else {
        all.unshift({ ...snippet, createdAt: now, updatedAt: now })
      }
      db.writeJSON(SNIPPETS_FILE, all)
      return { ok: true }
    })

    registerHandler(ipcMain, 'snippets:delete', (_e, id: string) => {
      const all = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      db.writeJSON(SNIPPETS_FILE, all.filter((s) => s.id !== id))
      return { ok: true }
    })

    /** Records a copy/run: bumps `useCount` and sets `lastUsedAt`. Does not touch `updatedAt`. */
    registerHandler(ipcMain, 'snippets:mark-used', (_e, id: string) => {
      if (typeof id !== 'string' || !id) throw new Error('Id inválido')
      const all = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const idx = all.findIndex((s) => s.id === id)
      if (idx < 0) return { ok: false }
      const cur = all[idx]!
      const next: Snippet = { ...cur, lastUsedAt: Date.now(), useCount: (cur.useCount ?? 0) + 1 }
      all[idx] = next
      db.writeJSON(SNIPPETS_FILE, all)
      return { ok: true, lastUsedAt: next.lastUsedAt, useCount: next.useCount }
    })

    registerHandler(ipcMain, 'snippets:meta-get', () => db.readJSON<SnippetsMeta>(META_FILE) ?? {})

    /**
     * One-time import of the Gastos "Queries" board (the renderer passes the
     * result of `queries:load`). Idempotent: stable ids, flag in snippets-meta.json.
     */
    registerHandler(ipcMain, 'snippets:migrate-queries', (_e, queries: LegacyQuery[]) => {
      if (!Array.isArray(queries)) throw new Error('Payload inválido')
      const snippets    = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const collections = db.readJSON<SnippetCollection[]>(COLLECTIONS_FILE) ?? []
      const result = migrateQueries(snippets, collections, queries)
      if (result.added > 0) {
        db.writeJSON(SNIPPETS_FILE, result.snippets)
        if (result.collections !== collections) db.writeJSON(COLLECTIONS_FILE, result.collections)
      }
      const meta = db.readJSON<SnippetsMeta>(META_FILE) ?? {}
      db.writeJSON(META_FILE, { ...meta, queriesImportedAt: new Date().toISOString() })
      return { ok: true, added: result.added }
    })

    registerHandler(ipcMain, 'snippets:collections-save', (_e, collections: SnippetCollection[]) => {
      db.writeJSON(COLLECTIONS_FILE, collections)
      return { ok: true }
    })

    registerHandler(ipcMain, 'snippets:export', async () => {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar snippets',
        defaultPath: `snippets-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      const snippets    = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const collections = db.readJSON<SnippetCollection[]>(COLLECTIONS_FILE) ?? []
      fs.writeFileSync(filePath, JSON.stringify({ snippets, collections }, null, 2), 'utf-8')
      return { ok: true, filePath }
    })

    registerHandler(ipcMain, 'snippets:import', async () => {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Importar snippets',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

      let data: { snippets?: Snippet[]; collections?: SnippetCollection[] }
      try {
        data = JSON.parse(fs.readFileSync(filePaths[0]!, 'utf-8')) as { snippets?: Snippet[]; collections?: SnippetCollection[] } // length checked above
      } catch {
        throw new Error('Archivo inválido: no se pudo leer el JSON')
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Formato de archivo de snippets inválido')
      }

      const existingSnippets    = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const existingCollections = db.readJSON<SnippetCollection[]>(COLLECTIONS_FILE) ?? []
      const existingIds    = new Set(existingSnippets.map((s) => s.id))
      const existingColIds = new Set(existingCollections.map((c) => c.id))

      const newSnippets    = Array.isArray(data.snippets)     ? data.snippets     : []
      const newCollections = Array.isArray(data.collections)  ? data.collections  : []

      db.writeJSON(SNIPPETS_FILE,    [...existingSnippets,    ...newSnippets.filter((s)    => !existingIds.has(s.id))])
      db.writeJSON(COLLECTIONS_FILE, [...existingCollections, ...newCollections.filter((c) => !existingColIds.has(c.id))])

      return { ok: true, count: newSnippets.length }
    })
  },
}
