import type { IpcMain } from 'electron'
import { BrowserWindow, shell } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { RecentFile, ReadFileRequest, ReadFileResponse, FileChangedEvent, FileTreeNode, FindResult } from '../../../src/plugins/file-editor/types'
import { dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'

const RECENT_KEY    = 'editor.recentFiles'
const MAX_RECENT    = 20
const MAX_FULL_SIZE = 2 * 1024 * 1024   // 2MB — load fully
const TAIL_LINES    = 2000              // lines to load for large files

/** Active chokidar watchers keyed by absolute file path */
const watchers = new Map<string, FSWatcher>()

function getRecentFiles(settings: CoreServices['settings']): RecentFile[] {
  return settings.getJSON<RecentFile[]>(RECENT_KEY) ?? []
}

function addRecentFile(settings: CoreServices['settings'], file: RecentFile): void {
  const recents = getRecentFiles(settings).filter((r) => r.path !== file.path)
  recents.unshift(file)
  settings.setJSON(RECENT_KEY, recents.slice(0, MAX_RECENT))
}

/**
 * Validates and resolves a filesystem path.
 * Rejects null bytes and relative paths.
 */
function validatePath(filePath: unknown): string {
  if (!filePath || typeof filePath !== 'string') throw new Error('Invalid path')
  if (filePath.includes('\0')) throw new Error('Path contains null bytes')
  const resolved = path.resolve(filePath)
  if (!path.isAbsolute(resolved)) throw new Error('Path must be absolute')
  return resolved
}

const MAX_CHILDREN = 200
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage'])

function readDirTree(dirPath: string, depth = 0): FileTreeNode {
  const name = path.basename(dirPath)
  if (depth >= 6) return { name, path: dirPath, isDir: true, children: [] }

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return { name, path: dirPath, isDir: true, children: [] } }

  const visible = entries.filter((e) => !e.name.startsWith('.') && !(e.isDirectory() && SKIP_DIRS.has(e.name)))
  const truncated = visible.length > MAX_CHILDREN
  const slice = truncated ? visible.slice(0, MAX_CHILDREN) : visible

  const children: FileTreeNode[] = slice.map((e) => {
    const childPath = path.join(dirPath, e.name)
    if (e.isDirectory()) return readDirTree(childPath, depth + 1)
    return { name: e.name, path: childPath, isDir: false }
  })

  children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return { name, path: dirPath, isDir: true, children, truncated }
}

function tailLines(content: string, n: number): string {
  const lines = content.split('\n')
  return lines.length > n ? lines.slice(-n).join('\n') : content
}

export const handlers: PluginHandlers = {
  pluginId: 'file-editor',

  register(ipcMain: IpcMain, services: CoreServices): void {
    const { settings } = services

    // ── Directory reader ───────────────────────────────────────────────────

    ipcMain.handle('editor:read-dir', (_e, dirPath: string) => {
      const safe = validatePath(dirPath)
      const stat = fs.statSync(safe)
      if (!stat.isDirectory()) throw new Error('Not a directory')
      return readDirTree(safe)
    })

    ipcMain.handle('editor:open-folder-dialog', async (_e) => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
      return result.canceled ? [] : result.filePaths
    })

    // ── File dialog ────────────────────────────────────────────────────────

    ipcMain.handle('editor:open-dialog', async (_e) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Text & Code', extensions: ['txt', 'log', 'json', 'xml', 'yml', 'yaml', 'sql', 'ts', 'js', 'tsx', 'jsx', 'cs', 'md', 'csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      return result.canceled ? [] : result.filePaths
    })

    // ── Read file ──────────────────────────────────────────────────────────

    ipcMain.handle('editor:read-file', (_e, { path: filePath, tailLinesCount }: ReadFileRequest): ReadFileResponse => {
      const safe = validatePath(filePath)
      const stat = fs.statSync(safe)
      const size = stat.size
      const mtime = stat.mtimeMs
      let content = fs.readFileSync(safe, 'utf-8')
      let truncated = false

      if (size > MAX_FULL_SIZE) {
        // Large file — return only last N lines (user-configurable, default TAIL_LINES)
        const n = (typeof tailLinesCount === 'number' && tailLinesCount > 0) ? tailLinesCount : TAIL_LINES
        content = tailLines(content, n)
        truncated = true
      }

      addRecentFile(settings, {
        path: safe,
        name: path.basename(safe),
        openedAt: new Date().toISOString(),
      })

      return { content, mtime, size, truncated }
    })

    // ── Write file ─────────────────────────────────────────────────────────

    ipcMain.handle('editor:write-file', (_e, filePath: string, content: string) => {
      const safe = validatePath(filePath)
      fs.writeFileSync(safe, content, 'utf-8')
      return { ok: true }
    })

    // ── Save As dialog ─────────────────────────────────────────────────────

    ipcMain.handle('editor:save-dialog', async (_e, defaultName: string) => {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [
          { name: 'Text Files', extensions: ['txt', 'log', 'md'] },
          { name: 'Code Files', extensions: ['ts', 'js', 'json', 'xml', 'yaml', 'yml', 'sql', 'py', 'cs', 'cpp', 'java', 'css', 'html'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      return result.canceled ? null : result.filePath
    })

    // ── File watcher ───────────────────────────────────────────────────────

    ipcMain.handle('editor:watch-start', (event, filePath: string) => {
      const safe = validatePath(filePath)
      if (watchers.has(safe)) return { ok: true } // already watching

      const watcher = chokidar.watch(safe, {
        persistent: true,
        usePolling: false,      // use native events, fall back to polling if needed
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      })

      watcher.on('change', () => {
        try {
          const stat = fs.statSync(safe)
          const content = stat.size > MAX_FULL_SIZE
            ? tailLines(fs.readFileSync(safe, 'utf-8'), TAIL_LINES)
            : fs.readFileSync(safe, 'utf-8')

          const payload: FileChangedEvent = {
            path: safe,
            content,
            mtime: stat.mtimeMs,
            size: stat.size,
          }

          // Push to renderer
          const win = BrowserWindow.fromWebContents(event.sender)
          win?.webContents.send('editor:file-changed', payload)
        } catch {
          // File may have been deleted — ignore
        }
      })

      watchers.set(safe, watcher)
      return { ok: true }
    })

    ipcMain.handle('editor:watch-stop', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      const watcher = watchers.get(safe)
      if (watcher) {
        watcher.close()
        watchers.delete(safe)
      }
      return { ok: true }
    })

    // ── File system operations ─────────────────────────────────────────────

    ipcMain.handle('editor:reveal', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      shell.showItemInFolder(safe)
      return { ok: true }
    })

    ipcMain.handle('editor:create-file', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      fs.writeFileSync(safe, '', 'utf-8')
      return { ok: true }
    })

    ipcMain.handle('editor:create-dir', (_e, dirPath: string) => {
      const safe = validatePath(dirPath)
      fs.mkdirSync(safe, { recursive: true })
      return { ok: true }
    })

    ipcMain.handle('editor:rename', (_e, oldPath: string, newPath: string) => {
      const safeOld = validatePath(oldPath)
      const safeNew = validatePath(newPath)
      fs.renameSync(safeOld, safeNew)
      return { ok: true }
    })

    ipcMain.handle('editor:delete', (_e, targetPath: string) => {
      const safe = validatePath(targetPath)
      // Guard against accidentally deleting root or near-root paths
      const parts = safe.split(path.sep).filter(Boolean)
      if (parts.length < 2) throw new Error('Refusing to delete a root or near-root path')
      const stat = fs.statSync(safe)
      if (stat.isDirectory()) fs.rmSync(safe, { recursive: true, force: true })
      else fs.unlinkSync(safe)
      return { ok: true }
    })

    // ── Find in files ──────────────────────────────────────────────────────

    ipcMain.handle('editor:find-in-files', (_e, { dir, query, useRegex }: { dir: string; query: string; useRegex: boolean }) => {
      dir = validatePath(dir)
      const results: FindResult[] = []
      const MAX_RESULTS = 300
      const MAX_FILE_SIZE = 5 * 1024 * 1024

      let re: RegExp | null = null
      if (useRegex) {
        try { re = new RegExp(query, 'i') } catch { return [] }
      }

      const searchFile = (filePath: string): void => {
        if (results.length >= MAX_RESULTS) return
        try {
          if (fs.statSync(filePath).size > MAX_FILE_SIZE) return
          const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
          const name = path.basename(filePath)
          lines.forEach((line, i) => {
            if (results.length >= MAX_RESULTS) return
            const hit = re ? re.test(line) : line.toLowerCase().includes(query.toLowerCase())
            if (hit) results.push({ path: filePath, name, lineNumber: i + 1, lineText: line.trim().slice(0, 200) })
          })
        } catch { /* skip unreadable files */ }
      }

      const walkDir = (dirPath: string): void => {
        if (results.length >= MAX_RESULTS) return
        let entries: fs.Dirent[]
        try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
          if (results.length >= MAX_RESULTS) return
          if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
          const p = path.join(dirPath, e.name)
          e.isDirectory() ? walkDir(p) : searchFile(p)
        }
      }

      walkDir(dir)
      return results
    })

    // ── Recent files ───────────────────────────────────────────────────────

    ipcMain.handle('editor:recent-get', () => getRecentFiles(settings))

    ipcMain.handle('editor:recent-clear', () => {
      settings.setJSON(RECENT_KEY, [])
      return { ok: true }
    })

    // ── Cleanup on app quit ────────────────────────────────────────────────

    app.on('will-quit', () => {
      watchers.forEach((w) => w.close())
      watchers.clear()
    })
  }
}
