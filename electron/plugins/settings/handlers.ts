import { app, dialog, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'
import { registerHandler } from '../../core/ipc-handler'
import { testConnection, TESTABLE_CONNECTIONS, type TestableConnection } from './connection-tests'
import { maskSecretSettings, SECURE_SET_SENTINEL } from './settings-mask'

/** Keys that are never exported even if present in the store (secrets stay local) */
const EXPORT_BLOCKED_KEYS = new Set(['ai.openai_key', 'ai.anthropic_key'])

/** All non-secret keys that are safe to export */
const EXPORTABLE_KEYS = new Set([
  'ai.provider', 'ai.model', 'ai.anthropic_model', 'ai.ollama_url', 'ai.ollama_model',
  'bitbucket.workspace', 'repo-search.aliases',
])

/**
 * Exhaustive list of setting keys the renderer is allowed to read/write via IPC.
 * Main-process plugin handlers access settings directly via services.settings —
 * those accesses do NOT go through these IPC handlers and are always allowed.
 *
 * To add a new key accessible from the renderer, add it here.
 */
const ALLOWED_KEYS = new Set([
  'ai.provider',            // 'openai' | 'anthropic' | 'ollama'
  'ai.openai_key',
  'ai.model',               // OpenAI model name
  'ai.anthropic_key',
  'ai.anthropic_model',     // Anthropic model name
  'ai.ollama_url',          // Ollama base URL (default: http://localhost:11434)
  'ai.ollama_model',        // Ollama model name
  'ai.ollama_timeout',      // Ollama request timeout in minutes (default: 30)
  'bitbucket.workspace',
  'repo-search.aliases',
  'repo-search.github.client_id',  // public — needed for GitHub OAuth Device Flow
  'repo-search.github.org',        // optional org filter for GitHub searches
  'repo-search.gitlab.client_id',  // public — needed for GitLab OAuth Device Flow
  'dashboard.mascot',              // 'panda' | 'setto-avatar'
  'app.close_to_tray',             // '1' = cerrar la ventana la deja en la bandeja
  'app.notifications',             // '0' = sin notificaciones del sistema (default: activadas)
  'snippets.auto_paste',           // '0' = el selector global sólo copia (default: pega)
  'app.clipboard_history',         // '0' = sin historial del portapapeles (default: activado)
  'app.dock',                      // '0' = sin barra flotante (default: activada)
  'app.dock_side',                 // 'left' | 'right' (default: right)
  'app.local_only',                // '1' = el usuario eligió no usar Supabase (bienvenida)
  'ticket-resolver.jira_url',
  'ticket-resolver.jira_user',
  'ticket-resolver.jira_token',
  'ticket-resolver.repo_path',
  'ticket-resolver.project_prefix',
  'ticket-resolver.ui.font_size',
  'ticket-resolver.ui.density',
  'ticket-resolver.ui.line_height',
  'ticket-resolver.ui.font_family',
])

/**
 * Sentinel returned to the renderer when a SECURE key is set.
 * The renderer must treat this value as "already configured" and never
 * save it back — the handler ignores any set() call that sends this value.
 */
export { SECURE_SET_SENTINEL }

/**
 * Keys that are encrypted at rest (via safeStorage) and must never be
 * returned in plaintext to the renderer. Instead, the sentinel is returned.
 */
const RENDERER_MASKED_KEYS = new Set(['ai.openai_key', 'ai.anthropic_key', 'ticket-resolver.jira_token'])

function validateKey(key: unknown): string {
  if (!key || typeof key !== 'string') throw new Error('Invalid settings key')
  if (!ALLOWED_KEYS.has(key)) throw new Error(`Settings key not permitted: "${key}"`)
  return key
}

export const handlers: PluginHandlers = {
  pluginId: 'settings',

  register(ipcMain: IpcMain, { settings }: CoreServices): void {
    registerHandler(ipcMain, 'settings:get', (_event, key: string) => {
      const safe = validateKey(key)
      const value = settings.get(safe)
      // Never expose encrypted secrets in plaintext to the renderer.
      // Return the sentinel so the UI knows it is configured but cannot read the value.
      if (RENDERER_MASKED_KEYS.has(safe) && value !== null) {
        return SECURE_SET_SENTINEL
      }
      return value
    })

    registerHandler(ipcMain, 'settings:set', (_event, key: string, value: string) => {
      const safe = validateKey(key)
      if (typeof value !== 'string') throw new Error('Value must be a string')
      // Ignore attempts to save the sentinel back — it is not a real value.
      if (value === SECURE_SET_SENTINEL) return { ok: true }
      settings.set(safe, value)
      return { ok: true }
    })

    registerHandler(ipcMain, 'settings:delete', (_event, key: string) => {
      const safe = validateKey(key)
      settings.delete(safe)
      return { ok: true }
    })

    registerHandler(ipcMain, 'settings:getAll', (_event, prefix?: string) => {
      if (!prefix || typeof prefix !== 'string' || prefix.trim() === '') {
        throw new Error('settings:getAll requires a non-empty prefix')
      }
      const ALLOWED_PREFIXES = new Set(['ai', 'repo-search', 'dashboard', 'bitbucket', 'editor'])
      if (!ALLOWED_PREFIXES.has(prefix.trim())) {
        throw new Error(`settings:getAll prefix not permitted: "${prefix}"`)
      }
      // Nunca secretos en claro hacia el renderer (repo-search.*.token, ai.*_key…).
      return maskSecretSettings(settings.getAll(prefix), RENDERER_MASKED_KEYS)
    })

    // ── Encryption status ──────────────────────────────────────────────────
    registerHandler(ipcMain, 'settings:encryption-available', () => safeStorage.isEncryptionAvailable())

    // ── Export settings ────────────────────────────────────────────────────
    registerHandler(ipcMain, 'settings:export', async () => {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Export Settings',
        defaultPath: `mytools-settings-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }

      const exportData: Record<string, string> = {}
      for (const key of EXPORTABLE_KEYS) {
        const val = settings.get(key)
        if (val !== null) exportData[key] = val
      }

      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return { ok: true, filePath }
    })

    // ── Export logs (for diagnostics) ──────────────────────────────────────
    registerHandler(ipcMain, 'settings:export-logs', async () => {
      const logPath = path.join(app.getPath('logs'), 'app.log')
      if (!fs.existsSync(logPath)) return { ok: false, error: 'No hay logs para exportar' }

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar logs',
        defaultPath: `setto-logs-${new Date().toISOString().slice(0, 10)}.log`,
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }
      fs.copyFileSync(logPath, filePath)
      return { ok: true, filePath }
    })

    // ── Import settings ────────────────────────────────────────────────────
    registerHandler(ipcMain, 'settings:import', async () => {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Import Settings',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

      let imported: Record<string, string>
      try {
        imported = JSON.parse(fs.readFileSync(filePaths[0]!, 'utf-8')) as Record<string, string> // length checked above
      } catch {
        throw new Error('Invalid settings file — could not parse JSON')
      }

      if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
        throw new Error('Invalid settings file format')
      }

      let count = 0
      for (const [key, value] of Object.entries(imported)) {
        if (!EXPORTABLE_KEYS.has(key)) continue          // only safe keys
        if (EXPORT_BLOCKED_KEYS.has(key)) continue       // never import secrets from file
        if (typeof value !== 'string') continue
        settings.set(key, value)
        count++
      }

      return { ok: true, count }
    })

    // ── Validate OpenAI API key ────────────────────────────────────────────
    registerHandler(ipcMain, 'settings:validate-openai-key', async (_event, key: string) => {
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

    // ── Connection tests (Conexiones) ──────────────────────────────────────
    // `values` lets the UI test unsaved form values; secrets are never returned or logged.
    registerHandler(ipcMain, 'settings:test-connection', async (_event, id: string, values?: Record<string, string>) => {
      if (!TESTABLE_CONNECTIONS.has(id as TestableConnection)) throw new Error(`Unknown connection: "${String(id)}"`)
      const safeValues = values && typeof values === 'object' && !Array.isArray(values)
        ? Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'string')) as Record<string, string>
        : undefined
      return testConnection(id as TestableConnection, safeValues, (k) => settings.get(k))
    })

    // Where the Supabase URL in use comes from (same precedence as gastos-storage).
    registerHandler(ipcMain, 'settings:supabase-source', () => {
      if (settings.get('gastos.supabase_url')?.trim()) return { source: 'settings' as const }
      try {
        const p = path.join(process.cwd(), 'gastos-supabase.local.json')
        if (fs.existsSync(p)) {
          const data = JSON.parse(fs.readFileSync(p, 'utf8')) as { url?: unknown }
          if (typeof data?.url === 'string' && data.url.trim()) return { source: 'local-file' as const }
        }
      } catch { /* ignore unreadable file */ }
      return { source: 'none' as const }
    })
  }
}
