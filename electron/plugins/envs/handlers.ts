import { app, dialog } from 'electron'
import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type { CoreServices, PluginHandlers } from '../../core/types'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import { planChange, readCfg, targetKind, type EnvChange, type EnvTarget, type WigosEnv } from '../../../src/plugins/utilities/envs'

/**
 * Utilidades → Ambientes: los ambientes (IP/base) y los archivos que hay que tocar al
 * cambiar de uno a otro (.cfg y argumentos de inicio de Visual Studio). Sólo se escriben
 * archivos que el usuario agregó a la lista; antes de cada cambio se guarda una copia.
 */
interface EnvsConfig { envs: WigosEnv[]; targets: EnvTarget[]; root?: string }
const FILE = 'envs.json'
const SKIP = new Set(['node_modules', '.git', 'obj', 'packages', '.vs', 'TestResults'])
const MAX_FOUND = 300

const cfgPath = (): string => path.join(app.getPath('userData'), FILE)
function readConfig(): EnvsConfig {
  try {
    const c = JSON.parse(fs.readFileSync(cfgPath(), 'utf-8')) as Partial<EnvsConfig>
    return { envs: c.envs ?? [], targets: c.targets ?? [], root: c.root }
  } catch { return { envs: [], targets: [] } }
}
function writeConfig(c: EnvsConfig): void { fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 2)) }

/** latin1 = byte a byte: lo que no tocamos queda idéntico, sea UTF-8, ANSI o con BOM. */
const readRaw = (p: string): string => fs.readFileSync(p, 'latin1')

/** Archivos de Wigos con datos de conexión debajo de `root` (sin entrar a node_modules, obj…). */
function scan(root: string): EnvTarget[] {
  const out: EnvTarget[] = []
  const started = Date.now()
  const walk = (dir: string, depth: number): void => {
    if (out.length >= MAX_FOUND || depth > 7 || Date.now() - started > 15_000) return
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, depth + 1); continue }
      const kind = targetKind(e.name)
      if (!kind) continue
      try {
        if (fs.statSync(p).size > 512 * 1024) continue
        const t = readRaw(p)
        const relevant = kind === 'cfg' ? /<DBPrincipal>/i.test(t) : /\/db(principal|id|mirror)/i.test(t)
        if (relevant) out.push({ path: p, kind })
      } catch { /* sin permiso */ }
    }
  }
  walk(root, 0)
  return out
}

type Preview = { path: string; kind: EnvTarget['kind']; exists: boolean; changes: EnvChange[]; error?: string }
function preview(env: WigosEnv, targets: EnvTarget[]): Preview[] {
  return targets.map((t) => {
    if (!fs.existsSync(t.path)) return { ...t, exists: false, changes: [] }
    try { return { ...t, exists: true, changes: planChange(t.kind, readRaw(t.path), env).changes } } catch (e) {
      return { ...t, exists: true, changes: [], error: e instanceof Error ? e.message : String(e) }
    }
  })
}

export const handlers: PluginHandlers = {
  pluginId: 'envs',
  register(ipcMain: IpcMain, _services: CoreServices): void {
    registerHandler(ipcMain, 'envs:get', () => {
      const c = readConfig()
      // Lo que tiene puesto cada .cfg ahora (para mostrar el ambiente actual).
      const current = c.targets.map((t) => {
        if (t.kind !== 'cfg' || !fs.existsSync(t.path)) return { path: t.path, exists: fs.existsSync(t.path), values: null }
        try { return { path: t.path, exists: true, values: readCfg(readRaw(t.path)) } } catch { return { path: t.path, exists: true, values: null } }
      })
      return { ...c, current }
    })
    registerHandler(ipcMain, 'envs:save', (_e, c: EnvsConfig) => {
      if (!c || !Array.isArray(c.envs) || !Array.isArray(c.targets)) throw new Error('Datos inválidos')
      const targets = c.targets.filter((t) => typeof t?.path === 'string' && targetKind(t.path)).map((t) => ({ path: t.path, kind: targetKind(t.path)! }))
      writeConfig({ envs: c.envs, targets, root: c.root })
      return { ok: true }
    })
    registerHandler(ipcMain, 'envs:pick-root', async () => {
      const r = await dialog.showOpenDialog({ title: 'Carpeta donde buscar los .cfg y proyectos', properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0] ?? null
    })
    registerHandler(ipcMain, 'envs:scan', (_e, root: string) => {
      if (typeof root !== 'string' || !fs.existsSync(root)) throw new Error('La carpeta no existe')
      return scan(root)
    })
    registerHandler(ipcMain, 'envs:preview', (_e, envId: string) => {
      const c = readConfig()
      const env = c.envs.find((x) => x.id === envId)
      if (!env) throw new Error('Ese ambiente ya no existe')
      return preview(env, c.targets)
    })
    /** Escribe sólo archivos de la lista guardada, con copia previa en userData/env-backups. */
    registerHandler(ipcMain, 'envs:apply', (_e, envId: string, paths: string[]) => {
      const c = readConfig()
      const env = c.envs.find((x) => x.id === envId)
      if (!env) throw new Error('Ese ambiente ya no existe')
      const allowed = new Map(c.targets.map((t) => [t.path.toLowerCase(), t]))
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupDir = path.join(app.getPath('userData'), 'env-backups', stamp)
      let changed = 0
      const failed: string[] = []
      for (const p of Array.isArray(paths) ? paths : []) {
        const t = allowed.get(String(p).toLowerCase())
        if (!t || !fs.existsSync(t.path)) continue
        try {
          const raw = readRaw(t.path)
          const plan = planChange(t.kind, raw, env)
          if (!plan.changes.length) continue
          fs.mkdirSync(backupDir, { recursive: true })
          fs.writeFileSync(path.join(backupDir, `${changed + 1}-${path.basename(t.path)}`), raw, 'latin1')
          fs.writeFileSync(t.path, plan.next, 'latin1')
          changed++
        } catch (e) {
          failed.push(path.basename(t.path))
          logger.warn('envs', `no se pudo escribir ${t.path}`, e instanceof Error ? e.message : String(e))
        }
      }
      logger.info('envs', `ambiente ${env.name}: ${changed} archivos`)
      return { ok: true, changed, failed, backupDir: changed ? backupDir : null }
    })
  },
}
