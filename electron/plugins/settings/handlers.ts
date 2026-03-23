import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

export const handlers: PluginHandlers = {
  pluginId: 'settings',

  register(ipcMain: IpcMain, { settings }: CoreServices): void {
    ipcMain.handle('settings:get', (_event, key: string) => {
      return settings.get(key)
    })

    ipcMain.handle('settings:set', (_event, key: string, value: string) => {
      settings.set(key, value)
      return { ok: true }
    })

    ipcMain.handle('settings:delete', (_event, key: string) => {
      settings.delete(key)
      return { ok: true }
    })

    ipcMain.handle('settings:getAll', (_event, prefix?: string) => {
      if (!prefix || typeof prefix !== 'string' || prefix.trim() === '') {
        throw new Error('settings:getAll requires a non-empty prefix')
      }
      return settings.getAll(prefix)
    })

    /** Validate an OpenAI API key by making a minimal models list request. */
    ipcMain.handle('settings:validate-openai-key', async (_event, key: string) => {
      if (!key || typeof key !== 'string' || !key.startsWith('sk-')) {
        return { valid: false, error: 'Key must start with "sk-"' }
      }
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        })
        if (res.ok) return { valid: true }
        const body = (await res.json()) as { error?: { message?: string } }
        return { valid: false, error: body.error?.message ?? `HTTP ${res.status}` }
      } catch (err) {
        return { valid: false, error: err instanceof Error ? err.message : 'Network error' }
      }
    })
  }
}
