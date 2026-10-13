import { app, dialog, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { NoteMeta, NoteContent } from '../../../src/plugins/notes/types'
import { registerHandler } from '../../core/ipc-handler'
import {
  assertNoteId, dateStamp, extractPreview, extractTitle, isValidNoteId, sortNotes, uniqueNoteFilename, extractLinks, extractTags,
} from './notes-utils'

const CONFIG_FILE  = 'notes-config.json'
const SIDECAR_FILE = '.setto-notes.json'
const MAX_NOTE_BYTES = 5 * 1024 * 1024

interface NotesConfig { dir?: string }
interface Sidecar { pinned: string[] }

export const handlers: PluginHandlers = {
  pluginId: 'notes',

  register(ipcMain: IpcMain, { db }: CoreServices): void {

    const defaultDir = (): string => path.join(app.getPath('userData'), 'notes')

    const getDir = (): string => {
      const cfg = db.readJSON<NotesConfig>(CONFIG_FILE)
      const dir = cfg?.dir && path.isAbsolute(cfg.dir) ? cfg.dir : defaultDir()
      fs.mkdirSync(dir, { recursive: true })
      return dir
    }

    /** Resolve a validated id inside the notes dir (defense in depth vs traversal). */
    const notePath = (dir: string, id: unknown): string => {
      const safe = assertNoteId(id)
      const full = path.resolve(dir, safe)
      if (path.dirname(full) !== path.resolve(dir)) throw new Error('Ruta de nota inválida')
      return full
    }

    const readSidecar = (dir: string): Sidecar => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, SIDECAR_FILE), 'utf-8')) as Partial<Sidecar>
        return { pinned: Array.isArray(data.pinned) ? data.pinned.filter(isValidNoteId) : [] }
      } catch {
        return { pinned: [] }
      }
    }

    const writeSidecar = (dir: string, data: Sidecar): void => {
      const target = path.join(dir, SIDECAR_FILE)
      const tmp = `${target}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
      fs.renameSync(tmp, target)
    }

    const buildMeta = (id: string, content: string, mtimeMs: number, pinned: Set<string>): NoteMeta => ({
      id,
      title: extractTitle(content, id.replace(/\.md$/i, '')),
      preview: extractPreview(content),
      updatedAt: Math.round(mtimeMs),
      pinned: pinned.has(id),
      links: extractLinks(content),
      tags: extractTags(content),
    })

    const metaFor = (dir: string, id: string, content?: string): NoteMeta => {
      const full = notePath(dir, id)
      const stat = fs.statSync(full)
      const text = content ?? fs.readFileSync(full, 'utf-8')
      return buildMeta(id, text, stat.mtimeMs, new Set(readSidecar(dir).pinned))
    }

    const listIds = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && isValidNoteId(e.name))
        .map((e) => e.name)

    const writeNote = (full: string, content: string): void => {
      if (Buffer.byteLength(content, 'utf-8') > MAX_NOTE_BYTES) throw new Error('La nota es demasiado grande')
      const tmp = `${full}.tmp`
      fs.writeFileSync(tmp, content, 'utf-8')
      fs.renameSync(tmp, full)
    }

    registerHandler(ipcMain, 'notes:list', (): NoteMeta[] => {
      const dir = getDir()
      const pinned = new Set(readSidecar(dir).pinned)
      const metas: NoteMeta[] = []
      for (const id of listIds(dir)) {
        try {
          const full = path.join(dir, id)
          const stat = fs.statSync(full)
          if (stat.size > MAX_NOTE_BYTES) continue
          metas.push(buildMeta(id, fs.readFileSync(full, 'utf-8'), stat.mtimeMs, pinned))
        } catch { /* unreadable file — skip */ }
      }
      return sortNotes(metas)
    })

    registerHandler(ipcMain, 'notes:read', (_e, id: string): NoteContent => {
      const dir = getDir()
      const content = fs.readFileSync(notePath(dir, id), 'utf-8')
      return { meta: metaFor(dir, id, content), content }
    })

    registerHandler(ipcMain, 'notes:write', (_e, id: string | null, content: string): NoteMeta => {
      if (typeof content !== 'string') throw new Error('Contenido inválido')
      const dir = getDir()
      const finalId = id === null || id === undefined ? uniqueNoteFilename(content, listIds(dir)) : assertNoteId(id)
      writeNote(notePath(dir, finalId), content)
      return metaFor(dir, finalId, content)
    })

    registerHandler(ipcMain, 'notes:delete', async (_e, id: string) => {
      const dir = getDir()
      const full = notePath(dir, id)
      if (fs.existsSync(full)) {
        try { await shell.trashItem(full) } catch { fs.unlinkSync(full) }
      }
      const side = readSidecar(dir)
      if (side.pinned.includes(id)) writeSidecar(dir, { pinned: side.pinned.filter((p) => p !== id) })
      return { ok: true }
    })

    registerHandler(ipcMain, 'notes:set-pinned', (_e, id: string, pinned: boolean) => {
      const dir = getDir()
      assertNoteId(id)
      const side = readSidecar(dir)
      const set = new Set(side.pinned)
      if (pinned) set.add(id); else set.delete(id)
      writeSidecar(dir, { pinned: [...set] })
      return { ok: true }
    })

    registerHandler(ipcMain, 'notes:today', (): NoteMeta => {
      const dir = getDir()
      const stamp = dateStamp(new Date())
      const id = `${stamp}.md`
      const full = notePath(dir, id)
      if (!fs.existsSync(full)) writeNote(full, `# ${stamp}\n\n`)
      return metaFor(dir, id)
    })

    registerHandler(ipcMain, 'notes:get-dir', (): string => getDir())

    registerHandler(ipcMain, 'notes:choose-dir', async (): Promise<string | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Elegí la carpeta de notas',
        defaultPath: getDir(),
        properties: ['openDirectory', 'createDirectory'],
      })
      const chosen = filePaths[0]
      if (canceled || !chosen) return null
      db.writeJSON(CONFIG_FILE, { dir: chosen } satisfies NotesConfig)
      return getDir()
    })

    registerHandler(ipcMain, 'notes:reveal', (_e, id?: string) => {
      const dir = getDir()
      if (id) shell.showItemInFolder(notePath(dir, id))
      else void shell.openPath(dir)
      return { ok: true }
    })
  },
}
