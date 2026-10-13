import type { IpcMain } from 'electron'
import { BrowserWindow, shell } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type {
  RecentFile, ReadFileRequest, ReadFileResponse, FileChangedEvent, FileTreeNode, FindResult,
  WriteFileOptions, EolKind, HistoryEntry, ReplaceInFilesRequest, ReplaceInFilesResponse, ReplaceFilePreview,
} from '../../../src/plugins/file-editor/types'
import { dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { execFile } from 'child_process'
import { registerHandler } from '../../core/ipc-handler'
import { addAuthorizedRoot, assertInAuthorizedRoot, validatePath } from './path-guard'
import { decodeFile, decodeBytes, detectEncoding, encodeFile, encodeText, isEolKind, isFileEncoding, looksBinary } from './encoding'
import { addSnapshot, listSnapshots, readSnapshot, lineDelta } from './history'
import { buildMatcher, replaceInText } from './replace'

/** EOL used when a file has no line breaks yet (the renderer applies its own pref for new buffers). */
const PLATFORM_EOL: EolKind = process.platform === 'win32' ? 'crlf' : 'lf'

/** Where local history snapshots live: <userData>/editor-history */
const historyBase = (): string => path.join(app.getPath('userData'), 'editor-history')

/** Read a text file decoding its real encoding (cp1252, UTF-16…) — null when it looks binary. */
function readTextFile(filePath: string): string | null {
  const bytes = fs.readFileSync(filePath)
  const enc = detectEncoding(bytes)
  if (looksBinary(bytes, enc)) return null
  return decodeBytes(bytes, enc)
}

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
      const lineCount = (readTextFile(filePath) ?? '').split('\n').length
      return { added: Array.from({ length: lineCount }, (_, i) => i + 1), changed: [], deleted: [] }
    } catch { return { added: [], changed: [], deleted: [] } }
  }

  let out: string
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
    const newStart = parseInt(m[2]!, 10) // group 2 is required by the regex (no trailing `?`)
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

function getRecentFiles(settings: CoreServices['settings']): RecentFile[] {
  return settings.getJSON<RecentFile[]>(RECENT_KEY) ?? []
}

function addRecentFile(settings: CoreServices['settings'], file: RecentFile): void {
  const recents = getRecentFiles(settings).filter((r) => r.path !== file.path)
  recents.unshift(file)
  settings.setJSON(RECENT_KEY, recents.slice(0, MAX_RECENT))
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

    registerHandler(ipcMain, 'editor:read-dir', (_e, dirPath: string) => {
      const safe = validatePath(dirPath)
      const stat = fs.statSync(safe)
      if (!stat.isDirectory()) throw new Error('Not a directory')
      return readDirTree(safe)
    })

    registerHandler(ipcMain, 'editor:open-folder-dialog', async (_e) => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
      if (!result.canceled) {
        result.filePaths.forEach((p) => addAuthorizedRoot(p))
      }
      return result.canceled ? [] : result.filePaths
    })

    // ── File dialog ────────────────────────────────────────────────────────

    registerHandler(ipcMain, 'editor:open-dialog', async (_e) => {
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

    registerHandler(ipcMain, 'editor:read-file', (_e, { path: filePath, tailLinesCount }: ReadFileRequest): ReadFileResponse => {
      const safe = validatePath(filePath)
      // Authorize the file's parent so the user can save changes via Ctrl+S
      // (mirrors what open-dialog does for each selected file).
      addAuthorizedRoot(path.dirname(safe))
      const stat = fs.statSync(safe)
      const size = stat.size
      const mtime = stat.mtimeMs
      // Detect the real encoding (BOM / valid UTF-8 / Windows-1252) and EOL so saving
      // writes the file back exactly as it was. Content is normalized to \n (CodeMirror does that anyway).
      const decoded = decodeFile(fs.readFileSync(safe), PLATFORM_EOL)
      let content = decoded.content
      let truncated = false
      // Only binary-looking files (NUL bytes) still get a warning: other encodings are handled now.
      const encodingWarning = decoded.binary

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

      return { content, mtime, size, truncated, encodingWarning, encoding: decoded.encoding, eol: decoded.eol, eolMixed: decoded.eolMixed }
    })

    // ── Read image as data URL (renderer CSP blocks file:// URLs) ─────────
    registerHandler(ipcMain, 'editor:read-image', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      assertInAuthorizedRoot(safe)
      const stat = fs.statSync(safe)
      const MAX_IMAGE_SIZE = 20 * 1024 * 1024
      if (stat.size > MAX_IMAGE_SIZE) throw new Error('Imagen demasiado grande para previsualizar (máx. 20MB)')
      const ext = path.extname(safe).toLowerCase().slice(1)
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const data = fs.readFileSync(safe).toString('base64')
      return { dataUrl: `data:${mime};base64,${data}`, size: stat.size }
    })

    // ── Write file ─────────────────────────────────────────────────────────

    registerHandler(ipcMain, 'editor:write-file', (_e, filePath: string, content: string, opts?: WriteFileOptions) => {
      const safe = validatePath(filePath)
      assertInAuthorizedRoot(safe)
      if (typeof content !== 'string') throw new Error('Contenido inválido')
      // Encode first: an unmappable char (e.g. "漢" in Windows-1252) throws here, before touching disk.
      // Without opts this behaves like before (UTF-8, content written as-is).
      const encoding = isFileEncoding(opts?.encoding) ? opts.encoding : 'utf8'
      const data = isEolKind(opts?.eol)
        ? encodeFile(content, { encoding, eol: opts.eol })
        : encodeText(content, encoding)
      let previous: Buffer | null = null
      try { previous = fs.readFileSync(safe) } catch { /* new file */ }
      // Atomic write: temp file + rename so a crash mid-write never truncates the original
      const tmp = `${safe}.${process.pid}.tmp`
      try {
        fs.writeFileSync(tmp, data)
        fs.renameSync(tmp, safe)
      } catch (err) {
        try { fs.unlinkSync(tmp) } catch { /* temp may not exist */ }
        throw err
      }
      // Local history: keep what was on disk before this save (best-effort, never fails the save)
      if (previous && previous.length > 0 && !previous.equals(data)) {
        try { addSnapshot(historyBase(), safe, previous, { autosave: opts?.autosave === true }) } catch { /* ignore */ }
      }
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

    registerHandler(ipcMain, 'editor:save-dialog', async (_e, defaultName: string) => {
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

    registerHandler(ipcMain, 'editor:watch-start', (event, filePath: string) => {
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
          const decoded = decodeFile(fs.readFileSync(safe), PLATFORM_EOL).content
          const content = stat.size > MAX_FULL_SIZE ? tailLines(decoded, TAIL_LINES) : decoded

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

    registerHandler(ipcMain, 'editor:watch-stop', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      const watcher = watchers.get(safe)
      if (watcher) {
        watcher.close()
        watchers.delete(safe)
      }
      return { ok: true }
    })

    // ── File system operations ─────────────────────────────────────────────

    registerHandler(ipcMain, 'editor:git-diff', (_e, filePath: string) => computeGitDiff(filePath))

    registerHandler(ipcMain, 'editor:reveal', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      shell.showItemInFolder(safe)
      return { ok: true }
    })

    registerHandler(ipcMain, 'editor:create-file', (_e, filePath: string) => {
      const safe = validatePath(filePath)
      assertInAuthorizedRoot(safe)
      // 'wx' flag: fail if the file already exists instead of truncating it to empty
      fs.writeFileSync(safe, '', { encoding: 'utf-8', flag: 'wx' })
      return { ok: true }
    })

    registerHandler(ipcMain, 'editor:create-dir', (_e, dirPath: string) => {
      const safe = validatePath(dirPath)
      assertInAuthorizedRoot(safe)
      fs.mkdirSync(safe, { recursive: true })
      return { ok: true }
    })

    registerHandler(ipcMain, 'editor:rename', (_e, oldPath: string, newPath: string) => {
      const safeOld = validatePath(oldPath)
      const safeNew = validatePath(newPath)
      assertInAuthorizedRoot(safeOld)
      assertInAuthorizedRoot(safeNew)
      // renameSync silently overwrites an existing target on POSIX — refuse instead
      if (fs.existsSync(safeNew)) throw new Error(`Ya existe un archivo llamado "${path.basename(safeNew)}"`)
      fs.renameSync(safeOld, safeNew)
      return { ok: true }
    })

    registerHandler(ipcMain, 'editor:delete', (_e, targetPath: string) => {
      const safe = validatePath(targetPath)
      assertInAuthorizedRoot(safe)
      // Guard against accidentally deleting root or near-root paths
      const parts = safe.split(path.sep).filter(Boolean)
      if (parts.length < 2) throw new Error('Refusing to delete a root or near-root path')
      // Move to the OS trash so the user can recover. If trash is unavailable we do
      // NOT silently hard-delete — the renderer asks the user and retries with force.
      return shell.trashItem(safe)
        .then(() => ({ ok: true as const, trashed: true }))
        .catch(() => ({ ok: false as const, trashFailed: true }))
    })

    registerHandler(ipcMain, 'editor:delete-permanent', (_e, targetPath: string) => {
      const safe = validatePath(targetPath)
      assertInAuthorizedRoot(safe)
      const parts = safe.split(path.sep).filter(Boolean)
      if (parts.length < 2) throw new Error('Refusing to delete a root or near-root path')
      const stat = fs.statSync(safe)
      if (stat.isDirectory()) fs.rmSync(safe, { recursive: true, force: true })
      else fs.unlinkSync(safe)
      return { ok: true as const }
    })

    // ── Find in files ──────────────────────────────────────────────────────

    registerHandler(ipcMain, 'editor:find-in-files', (_e, { dir, query, useRegex }: { dir: string; query: string; useRegex: boolean }) => {
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
          const text = readTextFile(filePath)
          if (text === null) return   // binary
          const lines = text.split(/\r?\n|\r/)
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
          if (e.isDirectory()) { walkDir(p) } else { searchFile(p) }
        }
      }

      walkDir(dir)
      return results
    })

    // ── Replace in files ───────────────────────────────────────────────────
    // Same filters/limits as find-in-files. dryRun (default) → preview only. Each file
    // keeps its own encoding and line separators (even mixed ones); binary/large files are skipped.

    registerHandler(ipcMain, 'editor:replace-in-files', (_e, req: ReplaceInFilesRequest): ReplaceInFilesResponse => {
      const root = validatePath(req?.root)
      const MAX_FILES = 300
      const MAX_FILE_SIZE = 5 * 1024 * 1024
      const useRegex = !!req.useRegex
      const replacement = typeof req.replacement === 'string' ? req.replacement : ''
      const matcher = buildMatcher(req.query, useRegex)
      const dryRun = req.dryRun !== false
      if (!dryRun) assertInAuthorizedRoot(root)
      const only = Array.isArray(req.paths) ? new Set(req.paths.map((p) => path.resolve(String(p)))) : null

      const res: ReplaceInFilesResponse = { files: [], totalMatches: 0, written: 0, errors: [], limited: false }

      const processFile = (filePath: string): void => {
        if (only && !only.has(filePath)) return
        let bytes: Buffer
        try {
          if (fs.statSync(filePath).size > MAX_FILE_SIZE) return
          bytes = fs.readFileSync(filePath)
        } catch { return }
        const encoding = detectEncoding(bytes)
        if (looksBinary(bytes, encoding)) return
        const r = replaceInText(decodeBytes(bytes, encoding), matcher, replacement, useRegex)
        if (r.count === 0) return
        if (res.files.length >= MAX_FILES) { res.limited = true; return }
        if (!dryRun) {
          const tmp = `${filePath}.${process.pid}.tmp`
          try {
            assertInAuthorizedRoot(filePath)
            const data = encodeText(r.output, encoding)   // separators are still the original ones
            fs.writeFileSync(tmp, data)
            fs.renameSync(tmp, filePath)
            try { addSnapshot(historyBase(), filePath, bytes) } catch { /* best-effort */ }
            res.written++
          } catch (err) {
            try { fs.unlinkSync(tmp) } catch { /* temp may not exist */ }
            res.errors.push({ path: filePath, message: (err as Error).message })
            return
          }
        }
        const preview: ReplaceFilePreview = { path: filePath, name: path.basename(filePath), count: r.count, samples: r.samples }
        res.files.push(preview)
        res.totalMatches += r.count
      }

      const walkDir = (dirPath: string): void => {
        if (res.limited) return
        let entries: fs.Dirent[]
        try { entries = fs.readdirSync(dirPath, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
          if (res.limited) return
          if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
          const p = path.join(dirPath, e.name)
          if (e.isDirectory()) walkDir(p)
          else if (e.isFile()) processFile(p)
        }
      }

      walkDir(root)
      return res
    })

    // ── Local history ──────────────────────────────────────────────────────

    registerHandler(ipcMain, 'editor:history-list', (_e, filePath: string, current?: string) => {
      const safe = validatePath(filePath)
      const base = historyBase()
      return listSnapshots(base, safe).map((entry): HistoryEntry => {
        if (typeof current !== 'string') return entry
        try {
          const text = decodeFile(readSnapshot(base, safe, entry.id), PLATFORM_EOL).content
          // added = lines the current buffer has that this version doesn't
          return { ...entry, ...lineDelta(text, current) }
        } catch { return entry }
      })
    })

    registerHandler(ipcMain, 'editor:history-read', (_e, filePath: string, id: string) => {
      const safe = validatePath(filePath)
      const d = decodeFile(readSnapshot(historyBase(), safe, String(id)), PLATFORM_EOL)
      return { content: d.content, encoding: d.encoding, eol: d.eol }
    })

    // Restore = hand the content back so the renderer loads it into the tab as unsaved
    // changes. Nothing is written to disk here.
    registerHandler(ipcMain, 'editor:history-restore', (_e, filePath: string, id: string) => {
      const safe = validatePath(filePath)
      assertInAuthorizedRoot(safe)
      const d = decodeFile(readSnapshot(historyBase(), safe, String(id)), PLATFORM_EOL)
      return { content: d.content, encoding: d.encoding, eol: d.eol }
    })

    // ── Recent files ───────────────────────────────────────────────────────

    registerHandler(ipcMain, 'editor:recent-get', () => getRecentFiles(settings))

    registerHandler(ipcMain, 'editor:recent-clear', () => {
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
