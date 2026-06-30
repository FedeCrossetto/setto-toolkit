import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { Servicio, PagoMensual, Credencial, QueryItem } from '../../../src/plugins/gastos/types'

export const handlers: PluginHandlers = {
  pluginId: 'gastos',

  register(ipcMain: IpcMain, { gastosStorage }: CoreServices): void {

    ipcMain.handle('gastos:load', async () => gastosStorage.load())

    ipcMain.handle('gastos:save-servicio', async (_e, servicio: Servicio) => {
      await gastosStorage.saveServicio(servicio)
      return { ok: true }
    })

    ipcMain.handle('gastos:delete-servicio', async (_e, id: string) => {
      await gastosStorage.deleteServicio(id)
      return { ok: true }
    })

    ipcMain.handle('gastos:save-pago', async (_e, pago: PagoMensual) => {
      await gastosStorage.savePago(pago)
      return { ok: true }
    })

    ipcMain.handle('gastos:delete-pago', async (_e, id: string) => {
      await gastosStorage.deletePago(id)
      return { ok: true }
    })

    ipcMain.handle('gastos:save-pagos-bulk', async (_e, pagos: PagoMensual[]) => {
      await gastosStorage.savePagosBulk(pagos)
      return { ok: true }
    })

    ipcMain.handle('gastos:credencial-save', async (_e, cred: Credencial) => {
      if (!cred || typeof cred !== 'object') throw new Error('Payload inválido')
      if (!cred.nombre?.trim()) throw new Error('El nombre es requerido')
      if (cred.nombre.length > 200) throw new Error('Nombre demasiado largo')
      if (typeof cred.usuario !== 'string' || cred.usuario.length > 500) throw new Error('Usuario inválido')
      if (typeof cred.password !== 'string' || cred.password.length > 500) throw new Error('Contraseña inválida')
      await gastosStorage.saveCredencial(cred)
      return { ok: true }
    })

    ipcMain.handle('gastos:credencial-delete', async (_e, id: string) => {
      await gastosStorage.deleteCredencial(id)
      return { ok: true }
    })

    ipcMain.handle('gastos:supabase-config-get', () => gastosStorage.getSupabasePublicConfig())

    ipcMain.handle('gastos:supabase-config-save', (_e, payload: { url: string; serviceKey: string }) => {
      if (!payload || typeof payload.url !== 'string') throw new Error('Payload inválido')
      gastosStorage.saveSupabaseConfig(payload)
    })

    /** Versión global remota (mayor `updated_at` entre las 4 tablas) — usada por el botón Sync
     *  del front para decidir si hace falta un pull. */
    ipcMain.handle('gastos:remote-version-get', async () => gastosStorage.getRemoteVersion())

    // ── Queries handlers ────────────────────────────────────────────────────────

    ipcMain.handle('queries:load', async () => gastosStorage.loadQueries())

    ipcMain.handle('queries:save', async (_e, item: QueryItem) => {
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

    ipcMain.handle('queries:delete', async (_e, id: string) => {
      await gastosStorage.deleteQuery(id)
      return { ok: true }
    })
  },
}
