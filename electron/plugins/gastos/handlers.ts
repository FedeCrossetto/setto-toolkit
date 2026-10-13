import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type {
  Servicio, PagoMensual, Credencial, QueryItem, Gasto, GastosCachePatch, PendingWrite, SupabaseHealth,
} from '../../../src/plugins/gastos/types'
import { registerHandler } from '../../core/ipc-handler'
import { logger } from '../../core/logger'
import { checkSupabaseHealth, normalizeSupabaseUrl } from './supabase-health'

function unexpectedHealth(url: string): SupabaseHealth {
  return {
    configured: Boolean(url), url: normalizeSupabaseUrl(url), reachable: false, authOk: false,
    error: 'No se pudo verificar Supabase.', missingSql: '',
    tables: { servicios: false, pagos: false, gastos: false, credenciales: false, queries: false },
  }
}

/** UTF-8 (con o sin BOM); si tiene bytes inválidos, Windows-1252 (exports de home banking). */
function decodeText(buf: Buffer): string {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8')
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export const handlers: PluginHandlers = {
  pluginId: 'gastos',

  register(ipcMain: IpcMain, { gastosStorage }: CoreServices): void {

    registerHandler(ipcMain, 'gastos:load', async () => gastosStorage.load())

    registerHandler(ipcMain, 'gastos:save-servicio', async (_e, servicio: Servicio) => {
      await gastosStorage.saveServicio(servicio)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:delete-servicio', async (_e, id: string) => {
      await gastosStorage.deleteServicio(id)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:save-pago', async (_e, pago: PagoMensual) => {
      await gastosStorage.savePago(pago)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:delete-pago', async (_e, id: string) => {
      await gastosStorage.deletePago(id)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:save-pagos-bulk', async (_e, pagos: PagoMensual[]) => {
      await gastosStorage.savePagosBulk(pagos)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:save-gasto', async (_e, gasto: Gasto) => {
      if (!gasto || typeof gasto !== 'object' || typeof gasto.id !== 'string' || !gasto.id) throw new Error('Payload inválido')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gasto.fecha)) throw new Error('Fecha inválida (YYYY-MM-DD)')
      if (typeof gasto.monto !== 'number' || !Number.isFinite(gasto.monto) || gasto.monto < 0) throw new Error('Monto inválido')
      if (typeof gasto.descripcion !== 'string' || gasto.descripcion.length > 500) throw new Error('Descripción inválida')
      if (gasto.moneda !== 'ARS' && gasto.moneda !== 'USD') throw new Error('Moneda inválida')
      await gastosStorage.saveGasto(gasto)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:delete-gasto', async (_e, id: string) => {
      if (typeof id !== 'string' || !id) throw new Error('Id inválido')
      await gastosStorage.deleteGasto(id)
      return { ok: true }
    })

    /** Guarda un CSV generado en el renderer, eligiendo el destino con el diálogo nativo. */
    registerHandler(ipcMain, 'gastos:export-csv', async (_e, payload: { filename: string; content: string }) => {
      if (!payload || typeof payload.content !== 'string' || typeof payload.filename !== 'string') throw new Error('Payload inválido')
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar movimientos',
        defaultPath: payload.filename.replace(/[\\/:*?"<>|]/g, '-'),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      // BOM para que Excel detecte UTF-8 (acentos)
      fs.writeFileSync(filePath, String.fromCharCode(0xfeff) + payload.content, 'utf-8')
      return { ok: true, filePath }
    })

    registerHandler(ipcMain, 'gastos:credencial-save', async (_e, cred: Credencial) => {
      if (!cred || typeof cred !== 'object') throw new Error('Payload inválido')
      if (!cred.nombre?.trim()) throw new Error('El nombre es requerido')
      if (cred.nombre.length > 200) throw new Error('Nombre demasiado largo')
      if (typeof cred.usuario !== 'string' || cred.usuario.length > 500) throw new Error('Usuario inválido')
      if (typeof cred.password !== 'string' || cred.password.length > 500) throw new Error('Contraseña inválida')
      await gastosStorage.saveCredencial(cred)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:credencial-delete', async (_e, id: string) => {
      await gastosStorage.deleteCredencial(id)
      return { ok: true }
    })

    registerHandler(ipcMain, 'gastos:supabase-config-get', () => gastosStorage.getSupabasePublicConfig())

    registerHandler(ipcMain, 'gastos:supabase-config-save', (_e, payload: { url: string; serviceKey: string }) => {
      if (!payload || typeof payload.url !== 'string') throw new Error('Payload inválido')
      gastosStorage.saveSupabaseConfig(payload)
    })

    /** Salud de Supabase con la config guardada. Nunca lanza. */
    registerHandler(ipcMain, 'gastos:supabase-health', async () => {
      try {
        return await checkSupabaseHealth(gastosStorage.resolveSupabaseCredentials())
      } catch (e) {
        logger.warn('Gastos', 'supabase-health falló inesperadamente', { error: e instanceof Error ? e.message : String(e) })
        return unexpectedHealth(gastosStorage.getSupabasePublicConfig().url)
      }
    })

    /** Igual que health pero con URL/key del formulario, SIN guardar. Vacío o el sentinel → usa lo guardado.
     *  La key sólo viaja a Supabase: no se loguea ni se devuelve. */
    registerHandler(ipcMain, 'gastos:supabase-test', async (_e, url?: unknown, key?: unknown) => {
      const saved = gastosStorage.resolveSupabaseCredentials()
      const u = typeof url === 'string' && url.trim() ? url : saved.url
      const k = typeof key === 'string' && key.trim() && key !== '__CONFIGURED__' ? key : saved.key
      try {
        return await checkSupabaseHealth({ url: u, key: k })
      } catch {
        return unexpectedHealth(u)
      }
    })

    // ── Caché local compartido (reemplaza a localStorage del renderer) ─────────
    registerHandler(ipcMain, 'gastos:cache-get', () => gastosStorage.getLocalCache())
    registerHandler(ipcMain, 'gastos:cache-set', (_e, patch: GastosCachePatch) => gastosStorage.setLocalCache(patch))
    registerHandler(ipcMain, 'gastos:pending-get', () => gastosStorage.getPendingWrites())
    registerHandler(ipcMain, 'gastos:pending-set', (_e, writes: PendingWrite[]) => { gastosStorage.setPendingWrites(writes) })

    /** Diálogo para elegir un CSV de movimientos; devuelve el texto (UTF-8 o Windows-1252). */
    registerHandler(ipcMain, 'gastos:import-file-open', async () => {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Importar movimientos',
        properties: ['openFile'],
        filters: [{ name: 'CSV / texto', extensions: ['csv', 'txt', 'tsv'] }, { name: 'Todos', extensions: ['*'] }],
      })
      const filePath = filePaths[0]
      if (canceled || !filePath) return { canceled: true }
      if (fs.statSync(filePath).size > 10 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máx. 10 MB)')
      return { canceled: false, name: path.basename(filePath), text: decodeText(fs.readFileSync(filePath)) }
    })

    /** Versión global remota (mayor `updated_at` entre las 4 tablas) — usada por el botón Sync
     *  del front para decidir si hace falta un pull. */
    registerHandler(ipcMain, 'gastos:remote-version-get', async () => gastosStorage.getRemoteVersion())

    // ── Queries handlers ────────────────────────────────────────────────────────

    registerHandler(ipcMain, 'queries:load', async () => gastosStorage.loadQueries())

    registerHandler(ipcMain, 'queries:save', async (_e, item: QueryItem) => {
      if (!item || typeof item !== 'object') throw new Error('Payload inválido')
      if (!item.descripcion?.trim()) throw new Error('La descripción es requerida')
      if (item.descripcion.length > 500) throw new Error('Descripción demasiado larga (máx 500 caracteres)')
      if (typeof item.query !== 'string' || item.query.length > 50_000) throw new Error('Query demasiado largo (máx 50.000 caracteres)')
      if (item.tags && (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== 'string' || t.length > 100))) {
        throw new Error('Tags inválidos')
      }
      await gastosStorage.saveQuery(item)
      return { ok: true }
    })

    registerHandler(ipcMain, 'queries:delete', async (_e, id: string) => {
      await gastosStorage.deleteQuery(id)
      return { ok: true }
    })
  },
}
