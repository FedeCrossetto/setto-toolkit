import type { IpcMain } from 'electron'
import type { DatabaseService } from './services/db.service'
import type { SettingsService } from './services/settings.service'
import type { AIService } from './services/ai.service'

export interface CoreServices {
  db: DatabaseService
  settings: SettingsService
  ai: AIService
}

export interface PluginHandlers {
  pluginId: string
  register(ipcMain: IpcMain, services: CoreServices): void
}
