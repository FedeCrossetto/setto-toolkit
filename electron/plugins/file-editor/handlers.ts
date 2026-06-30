import type { IpcMain } from 'electron'
import { BrowserWindow, shell } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { RecentFile, ReadFileRequest, ReadFileResponse, FileChangedEvent, FileTreeNode, FindResult } from '../../../src/plugins/file-editor/types'
import { dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { execFile } from 'child_process'

/** Run git in `cwd` and resolve stdout, or reject on non-zero exit. */
function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

export interface GitLineDiff { added: number[]; changed: number[]; deleted: number[] }

/**
 * Compute changed lines for a file vs. its git HEAD using `git diff -U0`.
 * Returns null when the path isn't inside a git repo (so the UI can hide the gutter).
 */
async function computeGitDiff(filePath: string): Promise<GitLineDiff | null> {
  const dir = path.dirname(filePath)
  try {
    await runGit(dir, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    return null   // not a git repo
  }

  // Untracked file → mark every line as added.
  try {
    await runGit(dir, ['ls-files', '--error-unmatch', filePath])
  } catch {
    try {
      const lineCount = fs.readFileSync(filePath, 'utf8').split('\n').length
      return { added: Array.from({ length: lineCount }, (_, i) => i + 1), changed: [], deleted: [] }
    } catch { return { added: [], changed: [], deleted: [] } }
  }

  let out = ''
  try {
    out = await runGit(dir, ['diff', '--no-color', '--unified=0', '--', filePath])
  } catch {
    return { added: [], changed: [], deleted: [] }
  }

  const added: number[] = [], changed: number[] = [], deleted: number[] = []
  const hunkRe = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
  for (const line of out.split('\n')) {
    const m = hunkRe.exec(line)
    if (!m) continue
    const oldCount = m[1] === undefined ? 1 : parseInt(m[1], 10)
    const newStart = parseInt(m[2], 10)
    const newCount = m[3] === undefined ? 1 : parseInt(m[3], 10)
    if (newCount === 0) {
      deleted.push(newStart)               // pure deletion
    } else if (oldCount === 0) {
      for (let i = 0; i < newCount; i++) added.push(newStart + i)   // pure addition
    } else {
      for (let i = 0; i < newCount; i++) changed.push(newStart + i) // modification
    }
  }
  return { added, changed, deleted }
}

const RECENT_KEY    = 'editor.recentFiles'
const MAX_RECENT    = 20
const MAX_FULL_SIZE = 2 * 1024 * 1024   // 2MB — load fully
const TAIL_LINES    = 2000              // lines to load for large files

/** Active chokidar watchers keyed by absolute file path */
const watchers = new Map<string, FSWatcher>()

/**
 * Authorized root directories — populated whenever the user opens a folder via
 * dialog or passes a file via CLI. Write/delete/rename operations are restricted
 * to paths inside one of these roots.
 */
const authorizedRoots = new Set<string>()

function addAuthorizedRoot(rootPath: string): void {
  authorizedRoots.add(path.resolve(rootPath))
}

/**
 * Verify that `targetPath` is located inside at least one authorized root.
 * Resolves symlinks via realpathSync so a symlink pointing outside the workspace
 * cannot bypass the guard. Throws if the path is not covered.
 */
function assertInAuthorizedRoot(targetPath: string): void {
  if (authorizedRoots.size === 0) {
    throw new Error('No workspace is open. Open a folder first before performing write operations.')
  }
  // Resolve symlinks so a symlink inside the workspace pointing outside cannot bypass the guard.
  const logical = path.resolve(targetPath)
  let real = logical
  try {
    real = fs.realpathSync(logical)
  } catch {
    // File doesn't exist yet (e.g. new file being created) — resolve the parent
    // directory instead so symlinks in the parent are still caught.
    try {
      real = path.join(fs.realpathSync(path.dirname(logical)), path.basename(logical))
    } catch { /* parent also doesn't exist — use logical path */ }
  }

  for (const root of authorizedRoots) {
    const rel = path.relative(root, real)
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return
  }
  throw new Error(`Operation denied: path is outside any open workspace — "${real}"`)
}

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
      if (!result.canceled) {
        result.filePaths.forEach((p) => addAuthorizedRoot(p))
      }
      return result.canceled ? [] : result.filePaths
    })

    // ── File dialog ────────────────────────────────────────────────────────

    ipcMain.handle('editor:open-dialog', async (_e) => {
      // A single "All Files" filter avoids the OS dimming out/blocking extensions that
      // aren't in a stricter filter's list (same root cause as the save-dialog .txt bug).
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'All Files', extensions: ['*'] }],
      })
      if (!result.canceled) {
        // Register the parent directory of each opened file as an authorized root.
        result.filePaths.forEach((fp) => addAuthorizedRoot(path.dirname(fp)))
      }
      return result.canceled ? [] : result.filePaths
    })

    // ── Read file ──────────────────────────────────────────────────────────

    ipcMain.handle('editor:read-file', (_e, { path: filePath, tailLinesCount }: ReadFileRequest): ReadFileResponse => {
      const safe = validatePath(filePath)
      // Authorize the file's parent so the user can save changes via Ctrl+S
      // (mirrors what open-dialog does for each selected file).
      addAuthorizedRoot(path.dirname(safe))
      const stat = fs.statSync(safe)
      const size = stat.size
      const mtime = stat.mtimeMs
      let content = fs.readFileSync(safe, 'utf-8')
      let truncated = false
      // Node's 'utf-8' decoding never throws — invalid byte sequences become U+FFFD
      // (the replacement char). Their presence means this likely isn't valid UTF-8
      // text (binary file, or a different encoding like Windows-1252/UTF-16).
      const encodingWarning = content.includes('�')

      // tailLinesCount = -1 → load full file regardless of size
      const forceAll = tailLinesCount === -1
      if (!forceAll && size > MAX_FULL_SIZE) {
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

      return { content, mtime, size, truncated, encodingWarning }
    })

    // ── Write file ─────────────────────────────────────────────────────────

    ipcMain.handle('editor:write-file', (_e, filePath: string, content: string) => {
      const safe = validatePath(filePath)
      assertInAuthorizedRoot(safe)
      fs.writeFileSync(safe, content, 'utf-8')
      const stat = fs.statSync(safe)
      addRecentFile(settings, {
        path: safe,
        name: path.basename(safe),
        openedAt: new Date().toISOString(),
      })
      return {
        ok: true as const,
        path: safe,
        mtime: stat.mtimeMs,
        size: stat.size,
      }
    })

    // ── Save As dialog ─────────────────────────────────────────────────────

    ipcMain.handle('editor:save-dialog', async (_e, defaultName: string) => {
      // A single "All Files" filter avoids macOS/Windows auto-appending an extension
      // from a stricter filter (e.g. forcing ".txt" onto "name.cs" because "cs" wasn't
      // in the active filter's extension list).
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      })
      if (!result.canceled && result.filePath) {
        // Authorize the directory the user chose so the subsequent write-file call succeeds.
        addAuthorizedRoot(path.dirname(result.filePath))
      }
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
            kind: 'changed',
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

      watcher.on('unlink', () => {
        const payload: FileChangedEvent = {
          path: safe,
          kind: 'deleted',
          content: '',
          mtime: Date.now(),
          size: 0,
        }

        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.send('editor:file-changed', payload)

        watcher.close()
        watchers.delete(safe)
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

    ipcMain.handle('editor:git-diff', (_e, filePath: string) => computeGitDiff(filePath))

    ipcMain.handle('editor:reveal', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      shell.showItemInFolder(safe)
      return { ok: true }
    })

    ipcMain.handle('editor:create-file', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      assertInAuthorizedRoot(safe)
      fs.writeFileSync(safe, '', 'utf-8')
      return { ok: true }
    })

    ipcMain.handle('editor:create-dir', (_e, dirPath: string) => {
      const safe = validatePath(dirPath)
      assertInAuthorizedRoot(safe)
      fs.mkdirSync(safe, { recursive: true })
      return { ok: true }
    })

    ipcMain.handle('editor:rename', (_e, oldPath: string, newPath: string) => {
      const safeOld = validatePath(oldPath)
      const safeNew = validatePath(newPath)
      assertInAuthorizedRoot(safeOld)
      assertInAuthorizedRoot(safeNew)
      fs.renameSync(safeOld, safeNew)
      return { ok: true }
    })

    ipcMain.handle('editor:delete', (_e, targetPath: string) => {
      const safe = validatePath(targetPath)
      assertInAuthorizedRoot(safe)
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
      const MAX_QUERY_LENGTH = 500

      if (!query || typeof query !== 'string') return []
      if (query.length > MAX_QUERY_LENGTH) return []

      let re: RegExp | null = null
      if (useRegex) {
        // Guard against ReDoS: reject patterns known to cause catastrophic backtracking.
        // Heuristic: nested quantifiers like (a+)+ or (.*)* are the main culprit.
        const dangerousPattern = /(\(.*[+*]\).*[+*]|\[[^\]]*\][+*][+*]|\{.*[+*]\}.*[+*])/
        if (dangerousPattern.test(query)) {
          throw new Error('Regex peligroso: los cuantificadores anidados como (a+)+ pueden causar cuelgues')
        }
        try { re = new RegExp(query, 'i') } catch (e) {
          throw new Error(`Regex inválida: ${(e as Error).message}`)
        }
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

    // ── Authorize roots from CLI / "Open with" ─────────────────────────────
    // When a file is opened from the OS (double-click, drag-to-icon, second-instance),
    // automatically authorize its parent directory so the user can save changes.

    ipcMain.on('editor:authorize-root', (_e, rootPath: string) => {
      try { addAuthorizedRoot(rootPath) } catch { /* ignore invalid paths */ }
    })

    // ── Cleanup on app quit ────────────────────────────────────────────────

    app.on('will-quit', () => {
      watchers.forEach((w) => w.close())
      watchers.clear()
    })
  }
}
