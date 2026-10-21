import { app, clipboard } from 'electron'
import type { ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import type { CoreServices, PluginHandlers } from '../../core/types'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import { runQuery, shutdownWorkers, warmUp } from './query-runner'
import { splitBatches } from '../../../src/plugins/sql-runner/sql-text'
import { pkSql } from '../../../src/plugins/sql-runner/edit-script'
import { childrenSql, COMPLETION_SQL, DATABASES_SQL, definitionSql, OBJECTS_SQL, type MetaKind } from '../../../src/plugins/sql-runner/sql-meta'
import type { QueryFavorite, QueryHistoryEntry, QueryResult, QueryTabsState } from '../../../src/plugins/sql-runner/types'
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
/** Consultas: pestañas (se guardan solas) e historial, cifrados como el resto. */
const TABS_FILE = 'sql-tabs.json'
const HISTORY_FILE = 'sql-history.json'
const HISTORY_MAX = 300
/** Consultas favoritas (plantillas que se repiten), cifradas. */
const FAVS_FILE = 'sql-favorites.json'
const MAX_ROWS_CAP = 20_000
/** Consultas en curso, por id de ejecución (para cancelar). */
const running = new Map<string, ChildProcess>()

interface Stored extends Omit<SqlProfile, 'hasPassword'> { password?: string }

/** Prueba de conexión: misma vía que las consultas (worker ya encendido y conexiones reutilizadas). */
async function runTest(connectionString: string): Promise<SqlTestResult> {
  const at = Date.now()
  const sql = "SELECT ISNULL(@@SERVERNAME, ''), CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)), ISNULL(DB_NAME(), '')"
  const r = await runQuery(connectionString, [{ sql, startLine: 1, repeat: 1 }], { readOnly: false, maxRows: 1, timeoutSec: TEST_TIMEOUT_SEC })
  if (!r.ok) return { ok: false, detail: (r.error ?? 'Error desconocido').trim(), ms: r.ms, at }
  const [server, version, db] = r.sets[0]?.rows[0] ?? []
  const where = [server, db].filter(Boolean).join(' · ')
  return { ok: true, detail: `Conectado${where ? ` a ${where}` : ''} · SQL Server ${version ?? ''}`.trim(), serverName: server ?? undefined, version: version ?? undefined, ms: r.ms, at }
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

    // Los workers de consultas se cierran con la app.
    app.on('will-quit', shutdownWorkers)
    // Abrir Consultas o Conexiones deja un worker listo: la primera consulta no espera el arranque.
    registerHandler(ipcMain, 'sql:list', (): SqlProfile[] => { warmUp(); return read().map(view) })

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

    // ── Consultas ──────────────────────────────────────────────────────────
    registerHandler(ipcMain, 'sql:query', async (_e, req: {
      runId: string; profileId: string; database?: string; sql: string; readOnly?: boolean; maxRows?: number; timeoutSec?: number
    }): Promise<QueryResult> => {
      const prof = find(req.profileId)
      const batches = splitBatches(String(req.sql ?? ''))
      if (!batches.length) return { ok: false, error: 'No hay nada para ejecutar', sets: [], messages: [], ms: 0 }
      const database = (req.database ?? '').trim() || prof.database
      const cs = buildConnectionString({ ...prof, database }, prof.auth === 'windows' ? null : prof.password ?? '', { timeoutSec: 10, appName: 'Setto' })
      const readOnly = req.readOnly !== false
      const result = await runQuery(cs, batches, {
        readOnly,
        maxRows: Math.min(MAX_ROWS_CAP, Math.max(1, Math.round(Number(req.maxRows) || 1000))),
        timeoutSec: Math.min(3600, Math.max(5, Math.round(Number(req.timeoutSec) || 120))),
      }, (p) => running.set(req.runId, p))
      running.delete(req.runId)
      // El número de línea del error es relativo al lote: pasarlo a la línea del editor.
      // Al fallar la conexión, SqlClient informa la línea 65536: no es del editor.
      if (result.phase === 'connect') result.line = null
      if (!result.ok && typeof result.line === 'number' && typeof result.batch === 'number') {
        const b = batches[result.batch]
        if (b) result.line = b.startLine + result.line - 1
      }
      update(prof.id, { lastUsedAt: Date.now() })
      const entry: QueryHistoryEntry = {
        id: randomUUID(), at: Date.now(), profileId: prof.id, profileName: prof.name, database,
        sql: String(req.sql).slice(0, 20_000), ok: result.ok, ms: result.ms, readOnly,
        rows: result.sets.reduce((n, x) => n + (x.total ?? x.rows.length), 0),
        ...(result.ok ? {} : { error: (result.error ?? '').slice(0, 300) }),
      }
      const hist = db.readEncryptedJSON<QueryHistoryEntry[]>(HISTORY_FILE) ?? []
      db.writeEncryptedJSON(HISTORY_FILE, [entry, ...hist].slice(0, HISTORY_MAX))
      logger.info('sql', `consulta ${result.ok ? 'ok' : 'falló'} en ${prof.name} (${result.ms} ms)`)
      return result
    })

    /** Explorador: catálogo de la base (sin historial, siempre en modo lectura). */
    registerHandler(ipcMain, 'sql:meta', async (_e, req: { profileId: string; database?: string; kind: MetaKind; objectId?: number; table?: string }): Promise<QueryResult> => {
      const prof = find(req.profileId)
      const sql = req.kind === 'databases' ? DATABASES_SQL
        : req.kind === 'objects' ? OBJECTS_SQL
          : req.kind === 'children' ? childrenSql(Number(req.objectId))
            : req.kind === 'definition' ? definitionSql(Number(req.objectId))
              : req.kind === 'completion' ? COMPLETION_SQL
                : req.kind === 'pk' ? pkSql(String(req.table ?? ''))
              : null
      if (!sql) throw new Error('Consulta de catálogo desconocida')
      const database = req.kind === 'databases' ? (prof.database || 'master') : ((req.database ?? '').trim() || prof.database)
      const cs = buildConnectionString({ ...prof, database }, prof.auth === 'windows' ? null : prof.password ?? '', { timeoutSec: 10, appName: 'Setto' })
      return runQuery(cs, splitBatches(sql), { readOnly: true, maxRows: 50_000, timeoutSec: 60 })
    })

    registerHandler(ipcMain, 'sql:cancel', (_e, runId: string) => {
      const p = running.get(runId)
      if (p && !p.killed) p.kill()
      running.delete(runId)
      return { ok: true }
    })

    registerHandler(ipcMain, 'sql:tabs-get', (): QueryTabsState | null => db.readEncryptedJSON<QueryTabsState>(TABS_FILE))
    registerHandler(ipcMain, 'sql:tabs-save', (_e, state: QueryTabsState) => {
      if (!state || !Array.isArray(state.tabs)) throw new Error('Estado inválido')
      db.writeEncryptedJSON(TABS_FILE, { ...state, closed: (state.closed ?? []).slice(0, 30) })
      return { ok: true }
    })
    registerHandler(ipcMain, 'sql:history-get', (): QueryHistoryEntry[] => db.readEncryptedJSON<QueryHistoryEntry[]>(HISTORY_FILE) ?? [])
    registerHandler(ipcMain, 'sql:favs-get', (): QueryFavorite[] => db.readEncryptedJSON<QueryFavorite[]>(FAVS_FILE) ?? [])
    registerHandler(ipcMain, 'sql:favs-save', (_e, list: QueryFavorite[]) => {
      if (!Array.isArray(list)) throw new Error('Lista inválida')
      db.writeEncryptedJSON(FAVS_FILE, list.slice(0, 500))
      return { ok: true }
    })
    registerHandler(ipcMain, 'sql:history-clear', () => { db.writeEncryptedJSON(HISTORY_FILE, []); return { ok: true } })
  },
}
