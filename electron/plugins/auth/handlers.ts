import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'

export const handlers: PluginHandlers = {
  pluginId: 'auth',

  register(ipcMain: IpcMain, { auth }: CoreServices): void {

    /** Returns the stored Google user profile, or null if not authenticated. */
    ipcMain.handle('auth:google-user', () => {
      return auth.getUser()
    })

    /**
     * Starts the Google OAuth 2.0 PKCE flow.
     * Requires 'auth.google.client_id' to be set in settings.
     * Opens the default browser and waits for the user to complete auth.
     */
    ipcMain.handle('auth:google-start', async () => {
      return await auth.startOAuth()
    })

    /** Revokes the stored tokens and clears the session. */
    ipcMain.handle('auth:google-logout', async () => {
      await auth.logout()
      return { ok: true }
    })
  },
}
