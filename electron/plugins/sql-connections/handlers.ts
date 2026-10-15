import { clipboard } from 'electron'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import type { CoreServices, PluginHandlers } from '../../core/types'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import {
  buildConnectionString, buildSqlcmd, validateDraft,
  type SqlCopyFormat, type SqlProfile, type SqlProfileDraft, type SqlTestResult,
} from '../../../src/plugins/connections/sql'

/**
 * Conexiones a SQL Server guardadas en esta computadora (archivo cifrado con
 * safeStorage). La contraseña nunca sale de main: se usa para probar y para
 * copiar la cadena directo al portapapeles (se borra a los 60 s).
 *
 * La prueba usa System.Data.SqlClient de .NET Framework vía PowerShell: viene con
 * Windows, resuelve instancias con nombre (SQL Browser) y soporta Windows auth.
 * La cadena (con contraseña) va por stdin, nunca en la línea de comandos.
 */
const FILE = 'sql-connections.json'
const CLEAR_AFTER_MS = 60_000
const TEST_TIMEOUT_SEC = 8

interface Stored extends Omit<SqlProfile, 'hasPassword'> { password?: string }

const TEST_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cs = [Console]::In.ReadToEnd()
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
  $c = New-Object System.Data.SqlClient.SqlConnection $cs
  $c.Open()
  $cmd = $c.CreateCommand()
  $cmd.CommandText = "SELECT ISNULL(@@SERVERNAME, ''), CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)), ISNULL(DB_NAME(), '')"
  $r = $cmd.ExecuteReader()
  [void]$r.Read()
  $o = @{ ok = $true; server = $r.GetString(0); version = $r.GetString(1); db = $r.GetString(2); ms = $sw.ElapsedMilliseconds }
  $r.Close(); $c.Close()
  $o | ConvertTo-Json -Compress
} catch {
  @{ ok = $false; error = $_.Exception.GetBaseException().Message; ms = $sw.ElapsedMilliseconds } | ConvertTo-Json -Compress
}
`

function runTest(connectionString: string): Promise<SqlTestResult> {
  return new Promise((resolve) => {
    const at = Date.now()
    if (process.platform !== 'win32') { resolve({ ok: false, detail: 'La prueba sólo está disponible en Windows', at }); return }
    const encoded = Buffer.from(TEST_SCRIPT, 'utf16le').toString('base64')
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true })
    let out = ''
    let err = ''
    const killer = setTimeout(() => p.kill(), (TEST_TIMEOUT_SEC + 12) * 1000)
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (d: string) => { out += d })
    p.stderr.on('data', (d: Buffer) => { err += d.toString() })
    p.on('error', (e) => { clearTimeout(killer); resolve({ ok: false, detail: `No se pudo ejecutar PowerShell: ${e.message}`, at }) })
    p.on('close', () => {
      clearTimeout(killer)
      const line = out.trim().split(/\r?\n/).pop() ?? ''
      try {
        const r = JSON.parse(line) as { ok: boolean; server?: string; version?: string; db?: string; error?: string; ms?: number }
        if (r.ok) {
          const where = [r.server, r.db].filter(Boolean).join(' · ')
          resolve({ ok: true, detail: `Conectado${where ? ` a ${where}` : ''} · SQL Server ${r.version ?? ''}`.trim(), serverName: r.server, version: r.version, ms: r.ms, at })
        } else {
          resolve({ ok: false, detail: (r.error ?? 'Error desconocido').trim(), ms: r.ms, at })
        }
      } catch {
        resolve({ ok: false, detail: (err.trim() || 'La prueba no respondió').slice(0, 300), at })
      }
    })
    p.stdin.end(connectionString)
  })
}

export const handlers: PluginHandlers = {
  pluginId: 'sql-connections',
  register(ipcMain, { db }: CoreServices) {
    const read = (): Stored[] => {
      const list = db.readEncryptedJSON<Stored[]>(FILE)
      return Array.isArray(list) ? list : []
    }
    const write = (list: Stored[]): void => db.writeEncryptedJSON(FILE, list)
    const view = (s: Stored): SqlProfile => {
      const { password, ...rest } = s
      return { ...rest, hasPassword: !!password }
    }
    const find = (id: unknown): Stored => {
      const s = read().find((x) => x.id === id)
      if (!s) throw new Error('La conexión ya no existe')
      return s
    }
    const update = (id: string, patch: Partial<Stored>): void => {
      write(read().map((x) => (x.id === id ? { ...x, ...patch } : x)))
    }

    registerHandler(ipcMain, 'sql:list', (): SqlProfile[] => read().map(view))

    registerHandler(ipcMain, 'sql:save', (_e, draft: SqlProfileDraft): SqlProfile => {
      const list = read()
      const prev = draft.id ? list.find((x) => x.id === draft.id) : undefined
      const errors = validateDraft(draft, !!prev?.password)
      const first = Object.values(errors)[0]
      if (first) throw new Error(first)
      const next: Stored = {
        id: prev?.id ?? randomUUID(),
        name: draft.name.trim(),
        server: draft.server.trim(),
        database: draft.database.trim(),
        auth: draft.auth === 'windows' ? 'windows' : 'sql',
        user: draft.auth === 'windows' ? '' : draft.user.trim(),
        tag: draft.tag.trim(),
        trustCert: draft.trustCert !== false,
        password: draft.auth === 'windows' ? undefined : (draft.password ?? prev?.password),
        lastTest: prev?.lastTest,
        lastUsedAt: prev?.lastUsedAt,
      }
      write(prev ? list.map((x) => (x.id === prev.id ? next : x)) : [...list, next])
      return view(next)
    })

    registerHandler(ipcMain, 'sql:delete', (_e, id: string) => {
      write(read().filter((x) => x.id !== id))
      return { ok: true }
    })

    /** Probar una guardada (`id`) o un borrador del formulario (usa la contraseña guardada si no trae una). */
    registerHandler(ipcMain, 'sql:test', async (_e, arg: string | SqlProfileDraft): Promise<SqlTestResult> => {
      const stored = typeof arg === 'string' ? find(arg) : (arg.id ? read().find((x) => x.id === arg.id) : undefined)
      const p = typeof arg === 'string' ? stored! : arg
      const password = typeof arg === 'string' ? stored?.password ?? '' : (arg.password ?? stored?.password ?? '')
      const cs = buildConnectionString(p, p.auth === 'windows' ? null : password, { timeoutSec: TEST_TIMEOUT_SEC, appName: 'Setto' })
      const result = await runTest(cs)
      if (stored) update(stored.id, { lastTest: result })
      logger.info('sql', `prueba ${result.ok ? 'ok' : 'falló'}: ${p.server}`)
      return result
    })

    registerHandler(ipcMain, 'sql:copy', (_e, id: string, format: SqlCopyFormat) => {
      const s = find(id)
      let text: string
      switch (format) {
        case 'server': text = s.server; break
        case 'sqlcmd': text = buildSqlcmd(s); break
        case 'adonet-safe': text = buildConnectionString(s, null); break
        default: text = buildConnectionString(s, s.auth === 'windows' ? null : s.password ?? ''); break
      }
      clipboard.writeText(text)
      update(s.id, { lastUsedAt: Date.now() })
      // Con contraseña: se borra sola si nadie copió otra cosa encima.
      if (format === 'adonet' && s.auth === 'sql' && s.password) {
        setTimeout(() => { if (clipboard.readText() === text) clipboard.clear() }, CLEAR_AFTER_MS)
        return { ok: true, clears: true }
      }
      return { ok: true, clears: false }
    })
  },
}
