import type { IpcMain, WebContents } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { TerminalSession, TerminalPrefs } from '../../../src/plugins/terminal/types'
import { DEFAULT_PREFS } from '../../../src/plugins/terminal/types'
import os from 'os'
import fs from 'fs'
import path from 'path'

const SESSIONS_FILE = 'terminal-sessions.json'
const PREFS_FILE    = 'terminal-prefs.json'
const STARTUP_FILE  = 'terminal-startup.json'
const MAX_HISTORY   = 50  // keep last 50 sessions in history

interface StartupSession { shell: string; name?: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env['COMSPEC'] || 'cmd.exe'
  }
  return process.env['SHELL'] || '/bin/bash'
}

// ── Runtime session state (not persisted) ──────────────────────────────────────

interface LiveSession {
  pty: import('node-pty').IPty
  wc: WebContents
  flushTimer: ReturnType<typeof setTimeout> | null
  buffer: string
}

const liveSessions = new Map<string, LiveSession>()

// ── Handlers ───────────────────────────────────────────────────────────────────

export const handlers: PluginHandlers = {
  pluginId: 'terminal',

  register(ipcMain: IpcMain, { db }: CoreServices): void {
    // Lazy-load node-pty to avoid hard crash if native module isn't rebuilt yet
    let pty: typeof import('node-pty') | null = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pty = require('node-pty') as typeof import('node-pty')
    } catch (err) {
      console.error('[terminal] node-pty not available — run: npm run rebuild', err)
    }

    // ── terminal:create ──────────────────────────────────────────────────────
    ipcMain.handle('terminal:create', (event, opts: { shell?: string; cwd?: string; cols?: number; rows?: number }) => {
      if (!pty) {
        return {
          ok: false,
          error:
            'node-pty no está disponible (módulo nativo sin compilar). '
            + 'En la UI del Terminal verás los pasos: herramientas de build en Windows y `npm run rebuild`.',
        }
      }

      const prefs = db.readJSON<TerminalPrefs>(PREFS_FILE) ?? DEFAULT_PREFS
      const rawShell = opts.shell || prefs.shell || getDefaultShell()
      // Whitelist: only allow known shell executables — block shell injection via opts.shell
      const ALLOWED_SHELLS = /^(bash|zsh|fish|sh|dash|cmd\.exe|powershell\.exe|pwsh\.exe|powershell|pwsh|nu)$/i
      const shellBasename = path.basename(rawShell)
      if (!ALLOWED_SHELLS.test(shellBasename)) {
        return { ok: false, error: `Shell not allowed: ${shellBasename}` }
      }
      const shell = rawShell
      const cwd    = opts.cwd   || os.homedir()
      const cols   = opts.cols  ?? 120
      const rows   = opts.rows  ?? 30

      const sessionId = uid()

      let ptyProcess: import('node-pty').IPty
      try {
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: process.env as Record<string, string>,
          useConpty: process.platform === 'win32',
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: `Failed to spawn shell: ${msg}` }
      }

      const wc = event.sender
      const live: LiveSession = { pty: ptyProcess, wc, flushTimer: null, buffer: '' }
      liveSessions.set(sessionId, live)

      // Batched data push (16ms flush)
      ptyProcess.onData((data) => {
        live.buffer += data
        if (!live.flushTimer) {
          live.flushTimer = setTimeout(() => {
            if (!wc.isDestroyed()) wc.send('terminal:data', { sessionId, chunk: live.buffer })
            live.buffer = ''
            live.flushTimer = null
          }, 16)
        }
      })

      ptyProcess.onExit(({ exitCode }) => {
        // Flush remaining buffer
        if (live.flushTimer) { clearTimeout(live.flushTimer); live.flushTimer = null }
        if (live.buffer && !wc.isDestroyed()) {
          wc.send('terminal:data', { sessionId, chunk: live.buffer })
          live.buffer = ''
        }
        if (!wc.isDestroyed()) wc.send('terminal:exit', { sessionId, exitCode })
        liveSessions.delete(sessionId)

        // Persist session to history
        const now = new Date().toISOString()
        const sessions = db.readJSON<TerminalSession[]>(SESSIONS_FILE) ?? []
        const existing = sessions.findIndex((s) => s.id === sessionId)
        if (existing >= 0) {
          sessions[existing] = { ...sessions[existing], closedAt: now, exitCode }
        } else {
          sessions.unshift({ id: sessionId, title: shell, shell, cwd, createdAt: now, closedAt: now, exitCode })
        }
        // Trim history
        if (sessions.length > MAX_HISTORY) sessions.splice(MAX_HISTORY)
        db.writeJSON(SESSIONS_FILE, sessions)
      })

      // Save session start to history
      const sessions = db.readJSON<TerminalSession[]>(SESSIONS_FILE) ?? []
      sessions.unshift({ id: sessionId, title: shell, shell, cwd, createdAt: new Date().toISOString() })
      if (sessions.length > MAX_HISTORY) sessions.splice(MAX_HISTORY)
      db.writeJSON(SESSIONS_FILE, sessions)

      return { ok: true, sessionId, shell, cwd }
    })

    // ── terminal:input (fire-and-forget via send) ────────────────────────────
    ipcMain.on('terminal:input', (_e, { sessionId, data }: { sessionId: string; data: string }) => {
      const live = liveSessions.get(sessionId)
      if (!live) return
      try { live.pty.write(data) } catch { /* PTY may have already exited (EPIPE) */ }
    })

    // ── terminal:resize (fire-and-forget via send) ───────────────────────────
    ipcMain.on('terminal:resize', (_e, { sessionId, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
      const live = liveSessions.get(sessionId)
      if (!live) return
      try { live.pty.resize(cols, rows) } catch { /* ignore */ }
    })

    // ── terminal:kill ────────────────────────────────────────────────────────
    ipcMain.handle('terminal:kill', (_e, sessionId: string) => {
      const live = liveSessions.get(sessionId)
      if (live) {
        try { live.pty.kill() } catch { /* ignore */ }
        liveSessions.delete(sessionId)
      }
      return { ok: true }
    })

    // ── terminal:sessions-get ────────────────────────────────────────────────
    ipcMain.handle('terminal:sessions-get', () => {
      return db.readJSON<TerminalSession[]>(SESSIONS_FILE) ?? []
    })

    // ── terminal:session-delete ──────────────────────────────────────────────
    ipcMain.handle('terminal:session-delete', (_e, id: string) => {
      const sessions = db.readJSON<TerminalSession[]>(SESSIONS_FILE) ?? []
      db.writeJSON(SESSIONS_FILE, sessions.filter((s) => s.id !== id))
      return { ok: true }
    })

    // ── terminal:prefs-get ───────────────────────────────────────────────────
    ipcMain.handle('terminal:prefs-get', () => {
      return { ...DEFAULT_PREFS, ...(db.readJSON<Partial<TerminalPrefs>>(PREFS_FILE) ?? {}) }
    })

    // ── terminal:prefs-set ───────────────────────────────────────────────────
    ipcMain.handle('terminal:prefs-set', (_e, prefs: Partial<TerminalPrefs>) => {
      const current = db.readJSON<TerminalPrefs>(PREFS_FILE) ?? DEFAULT_PREFS
      db.writeJSON(PREFS_FILE, { ...current, ...prefs })
      return { ok: true }
    })

    // ── terminal:startup-get ─────────────────────────────────────────────────
    ipcMain.handle('terminal:startup-get', () => {
      return db.readJSON<StartupSession[]>(STARTUP_FILE) ?? []
    })

    // ── terminal:startup-set ─────────────────────────────────────────────────
    ipcMain.handle('terminal:startup-set', (_e, sessions: StartupSession[]) => {
      db.writeJSON(STARTUP_FILE, sessions)
      return { ok: true }
    })

    // ── terminal:claude-usage ────────────────────────────────────────────────
    // Reads the most recently modified Claude Code session JSONL file and
    // extracts the last assistant message's context window usage.
    // Returns a percentage (0-100) or null if unavailable.
    ipcMain.handle('terminal:claude-usage', (): number | null => {
      try {
        const projectsDir = path.join(os.homedir(), '.claude', 'projects')
        if (!fs.existsSync(projectsDir)) return null

        // Walk all project dirs to find the most recently modified .jsonl file
        let latestFile: string | null = null
        let latestMtime = 0

        for (const proj of fs.readdirSync(projectsDir)) {
          const projPath = path.join(projectsDir, proj)
          try {
            if (!fs.statSync(projPath).isDirectory()) continue
            for (const file of fs.readdirSync(projPath)) {
              if (!file.endsWith('.jsonl')) continue
              const fp = path.join(projPath, file)
              const mtime = fs.statSync(fp).mtimeMs
              if (mtime > latestMtime) { latestMtime = mtime; latestFile = fp }
            }
          } catch { /* skip unreadable dirs */ }
        }

        if (!latestFile) return null

        const lines = fs.readFileSync(latestFile, 'utf-8').split('\n')
        let lastUsage: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null = null

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const entry = JSON.parse(line) as { message?: { role?: string; usage?: Record<string, number> } }
            const msg = entry?.message
            if (msg?.role === 'assistant' && msg?.usage) lastUsage = msg.usage
          } catch { /* skip malformed lines */ }
        }

        if (!lastUsage) return null

        const total = (lastUsage.input_tokens ?? 0)
          + (lastUsage.cache_creation_input_tokens ?? 0)
          + (lastUsage.cache_read_input_tokens ?? 0)

        return Math.min(Math.round((total / 200_000) * 100), 100)
      } catch {
        return null
      }
    })
  },
}
