import { dialog } from 'electron'
import fs from 'fs'
import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { Snippet, SnippetCollection } from '../../../src/plugins/snippets/types'

const SNIPPETS_FILE    = 'snippets.json'
const COLLECTIONS_FILE = 'snippets-collections.json'

export const handlers: PluginHandlers = {
  pluginId: 'snippets',

  register(ipcMain: IpcMain, { db }: CoreServices): void {

    ipcMain.handle('snippets:load', () => {
      const snippets    = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const collections = db.readJSON<SnippetCollection[]>(COLLECTIONS_FILE) ?? []
      return { snippets, collections }
    })

    ipcMain.handle('snippets:save', (_e, snippet: Snippet) => {
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

    ipcMain.handle('snippets:delete', (_e, id: string) => {
      const all = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      db.writeJSON(SNIPPETS_FILE, all.filter((s) => s.id !== id))
      return { ok: true }
    })

    ipcMain.handle('snippets:collections-save', (_e, collections: SnippetCollection[]) => {
      db.writeJSON(COLLECTIONS_FILE, collections)
      return { ok: true }
    })

    ipcMain.handle('snippets:export', async () => {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Export Snippets',
        defaultPath: `snippets-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      const snippets    = db.readJSON<Snippet[]>(SNIPPETS_FILE) ?? []
      const collections = db.readJSON<SnippetCollection[]>(COLLECTIONS_FILE) ?? []
      fs.writeFileSync(filePath, JSON.stringify({ snippets, collections }, null, 2), 'utf-8')
      return { ok: true, filePath }
    })

    ipcMain.handle('snippets:import', async () => {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Import Snippets',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

      let data: { snippets?: Snippet[]; collections?: SnippetCollection[] }
      try {
        data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8')) as { snippets?: Snippet[]; collections?: SnippetCollection[] }
      } catch {
        throw new Error('Invalid file — could not parse JSON')
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid snippets file format')
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
