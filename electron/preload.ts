import { contextBridge, ipcRenderer, webFrame } from 'electron'

/** Channels the renderer may invoke (request → main) */
const INVOKE_CHANNELS = new Set([
  'settings:get', 'settings:set', 'settings:delete', 'settings:getAll',
  'settings:export', 'settings:import', 'settings:export-logs', 'settings:encryption-available', 'settings:validate-openai-key',
  'settings:test-connection', 'settings:supabase-source',
  'repo-search:login', 'repo-search:logout', 'repo-search:me', 'repo-search:search',
  'repo-search:history-get', 'repo-search:history-save', 'repo-search:history-clear',
  'repo-search:github-oauth-start', 'repo-search:github-oauth-poll',
  'repo-search:github-repos',
  'repo-search:gitlab-oauth-start', 'repo-search:gitlab-oauth-poll',
  'repo-search:oauth-configured',
  'editor:read-dir', 'editor:open-folder-dialog', 'editor:open-dialog',
  'editor:read-file', 'editor:read-image', 'editor:write-file', 'editor:save-dialog',
  'editor:watch-start', 'editor:watch-stop', 'editor:reveal',
  'editor:create-file', 'editor:create-dir', 'editor:rename', 'editor:delete', 'editor:delete-permanent',
  'editor:find-in-files', 'editor:recent-get', 'editor:exists', 'editor:recent-clear', 'editor:git-diff',
  'editor:replace-in-files', 'editor:history-list', 'editor:history-read', 'editor:history-restore',
  'app:version', 'app:pending-file', 'app:fetch-remote-image',
  'auth:google-user', 'auth:google-start', 'auth:google-logout',
  'api-tester:collections-get', 'api-tester:collections-save',
  'api-tester:collection-create', 'api-tester:collection-delete',
  'api-tester:request-save', 'api-tester:request-delete',
  'api-tester:environments-get', 'api-tester:environments-save',
  'api-tester:history-get', 'api-tester:history-clear',
  'api-tester:execute',
  'api-tester:run-script',
  'snippets:load', 'snippets:save', 'snippets:delete', 'snippets:collections-save',
  'snippets:export', 'snippets:import',
  'snippets:mark-used', 'snippets:meta-get', 'snippets:migrate-queries',
  'credentials:copy-secret',
  'credentials:list', 'credentials:save', 'credentials:delete',
  'credentials:toggle-favorite', 'credentials:mark-used',
  'credentials:copy-password', 'credentials:copy-username', 'credentials:top', 'credentials:reveal',
  'credentials:password-audit', 'credentials:check-reuse',
  'credentials:lock-status', 'credentials:lock', 'credentials:pin-verify', 'credentials:pin-set',
  'credentials:import-pick', 'credentials:import-commit', 'credentials:import-cancel', 'credentials:export-csv',
  'credentials:e2e-status', 'credentials:e2e-setup', 'credentials:e2e-unlock', 'credentials:e2e-change',
  'credentials:e2e-disable', 'credentials:e2e-lock', 'credentials:e2e-remember', 'credentials:e2e-resolve',
  'ticket-resolver:fetch', 'ticket-resolver:plan', 'ticket-resolver:search', 'ticket-resolver:analyze',
  'ticket-resolver:history-get', 'ticket-resolver:history-save', 'ticket-resolver:history-delete',
  'ticket-resolver:ai-usage-get', 'ticket-resolver:ai-usage-reset',
  'ticket-resolver:apply-changes',
  'terminal:create', 'terminal:kill', 'terminal:sessions-get', 'terminal:session-delete',
  'terminal:prefs-get', 'terminal:prefs-set',
  'terminal:startup-get', 'terminal:startup-set',
  'terminal:claude-usage',
  'gastos:load', 'gastos:summary',
  'gastos:save-servicio', 'gastos:delete-servicio',
  'gastos:save-pago', 'gastos:delete-pago', 'gastos:save-pagos-bulk',
  'gastos:credencial-save', 'gastos:credencial-delete',
  'gastos:supabase-config-get', 'gastos:supabase-config-save',
  'gastos:remote-version-get',
  'gastos:save-gasto', 'gastos:delete-gasto', 'gastos:export-csv',
  'gastos:supabase-health', 'gastos:supabase-test',
  'gastos:cache-get', 'gastos:cache-set', 'gastos:pending-get', 'gastos:pending-set',
  'gastos:import-file-open',
  'queries:load', 'queries:save', 'queries:delete',
  'updater:download', 'updater:check',
  'notes:list', 'notes:read', 'notes:write', 'notes:delete', 'notes:set-pinned',
  'notes:today', 'notes:get-dir', 'notes:choose-dir', 'notes:reveal',
  'tickets:list', 'tickets:get', 'tickets:pin', 'tickets:add', 'tickets:forget', 'tickets:set-title', 'tickets:export',
  'app:notify',
  'snippet-picker:shortcut', 'snippet-picker:paste',
  'clipboard:history', 'clipboard:clear', 'clipboard:remove', 'clipboard:copy', 'clipboard:set-enabled',
  'clipboard:pin', 'clipboard:open-path', 'clipboard:queue-set', 'clipboard:queue-state', 'clipboard:queue-advance', 'clipboard:queue-clear',
  'clipboard:ocr-image', 'clipboard:shortcuts', 'snippet-picker:paste-current', 'clipboard:search',
  'dock:state', 'dock:enabled', 'dock:set-enabled', 'dock:paste',
  'sync:status', 'sync:run', 'sync:set-enabled',
  'sql:list', 'sql:save', 'sql:delete', 'sql:test', 'sql:copy',
  'backup:info', 'backup:export', 'backup:pick', 'backup:inspect', 'backup:restore', 'backup:auto-pick-dir', 'backup:auto-set', 'backup:auto-run',
  'captures:query', 'captures:get', 'captures:settings', 'captures:update', 'captures:update-many', 'captures:delete',
  'captures:copy', 'captures:reveal', 'captures:export', 'captures:save-annotated', 'captures:copy-ocr',
])

/** Channels the renderer may send (fire-and-forget → main) */
const SEND_CHANNELS = new Set([
  'window:minimize', 'window:maximize', 'window:close',
  'app:renderer-error', 'app:dirty',
  'page:find', 'page:find-stop',
  'editor:authorize-root',
  'terminal:input', 'terminal:resize',
  'updater:install',
  'snippet-picker:close',
  'captures:start-drag',
  'app:open-in-main',
  'dock:expand', 'dock:collapse', 'dock:pin', 'dock:want-focus', 'dock:quick-capture', 'dock:move', 'dock:move-end',
  'dock:move-reset', 'dock:set-side', 'dock:open',
])

/** Channels the renderer may subscribe to (main → renderer) */
const ON_CHANNELS = new Set([
  'open-file', 'page:found', 'editor:file-changed',
  'terminal:data', 'terminal:exit',
  'updater:status',
  'app:quick-capture',
  'app:notification-click',
  'snippet-picker:opened',
  'sync:changed',
  'captures:changed',
  'dock:state', 'dock:bump', 'dock:drag',
])

/**
 * Ventanas chicas: sólo los canales que usan (y que no están en la lista global no
 * existen). Main pasa el rol con `additionalArguments: ['--setto-role=…']`; una
 * ventana sin rol sólo puede reportar errores. Un canal nuevo que use la barra o el
 * selector tiene que agregarse acá además de en las listas de arriba.
 * Main además rechaza los canales sensibles desde otras ventanas (core/ipc-guard.ts).
 */
/** Barra flotante (`#dock`, src/dock/**, incl. resumen y alta rápida de Gastos y el Bloc de notas). */
const DOCK_CHANNELS = new Set([
  'app:open-in-main', 'app:renderer-error', 'app:version',
  'dock:state', 'dock:paste', 'dock:bump', 'dock:drag',
  'dock:expand', 'dock:collapse', 'dock:pin', 'dock:want-focus', 'dock:quick-capture', 'dock:move', 'dock:move-end',
  'dock:move-reset', 'dock:set-side',
  'clipboard:history', 'clipboard:copy', 'clipboard:remove', 'clipboard:pin', 'clipboard:open-path', 'clipboard:ocr-image',
  'captures:query', 'captures:copy', 'captures:start-drag', 'captures:changed',
  'clipboard:search', 'captures:copy-ocr',
  'credentials:top', 'credentials:list', 'credentials:lock-status',
  'credentials:copy-password', 'credentials:copy-username', 'credentials:copy-secret',
  'snippets:load', 'snippets:mark-used',
  'notes:list', 'notes:read', 'notes:write',
  'gastos:summary', 'gastos:load', 'gastos:cache-get', 'gastos:cache-set', 'gastos:pending-get', 'gastos:pending-set',
  'gastos:save-gasto', 'gastos:delete-gasto', 'gastos:save-pago', 'gastos:delete-pago', 'gastos:save-pagos-bulk',
  'gastos:save-servicio', 'gastos:delete-servicio',
  'settings:get',
])

/** Selector global de snippets (`#snippet-picker`, SnippetPicker.tsx). */
const PICKER_CHANNELS = new Set([
  'app:open-in-main', 'app:renderer-error', 'app:version',
  'snippet-picker:shortcut', 'snippet-picker:paste', 'snippet-picker:paste-current', 'snippet-picker:close',
  'snippet-picker:opened',
  'clipboard:history', 'clipboard:copy', 'clipboard:pin', 'clipboard:open-path', 'clipboard:ocr-image',
  'clipboard:queue-set', 'clipboard:queue-advance', 'clipboard:shortcuts',
  'captures:query', 'captures:copy',
  'snippets:load', 'snippets:mark-used',
  'settings:get',
])

const roleArg = process.argv.find((a) => a.startsWith('--setto-role='))?.slice('--setto-role='.length)
const ROLE = roleArg === 'main' || roleArg === 'dock' || roleArg === 'picker' ? roleArg : 'none'
/** null = sin recorte (ventana principal). */
const ROLE_CHANNELS: Set<string> | null =
  ROLE === 'main' ? null : ROLE === 'dock' ? DOCK_CHANNELS : ROLE === 'picker' ? PICKER_CHANNELS : new Set(['app:renderer-error'])

function check(kind: 'send' | 'on', list: Set<string>, channel: string): void {
  if (!list.has(channel)) throw new Error(`IPC ${kind} blocked: unknown channel "${channel}"`)
  if (ROLE_CHANNELS && !ROLE_CHANNELS.has(channel)) throw new Error(`IPC ${kind} blocked: "${channel}" not allowed in the ${ROLE} window`)
}

const api = {
  platform: process.platform,
  /** Scales the entire rendered page (like Ctrl+/Ctrl- in a browser) — unlike CSS
   * font-size vars, this scales every pixel value uniformly regardless of whether
   * a component uses rem or hardcoded px. */
  setZoomFactor: (factor: number): void => { webFrame.setZoomFactor(factor) },
  getZoomFactor: (): number => webFrame.getZoomFactor(),
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    if (!INVOKE_CHANNELS.has(channel)) throw new Error(`IPC invoke blocked: unknown channel "${channel}"`)
    // Fuera del rol: promesa rechazada (no una excepción) para que un `.catch` de la ventana chica lo absorba.
    if (ROLE_CHANNELS && !ROLE_CHANNELS.has(channel)) return Promise.reject(new Error(`IPC invoke blocked: "${channel}" not allowed in the ${ROLE} window`))
    return ipcRenderer.invoke(channel, ...args) as Promise<T>
  },
  send: (channel: string, ...args: unknown[]): void => {
    check('send', SEND_CHANNELS, channel)
    ipcRenderer.send(channel, ...args)
  },
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    check('on', ON_CHANNELS, channel)
    const handler = (_: Electron.IpcRendererEvent, ...args: unknown[]): void => listener(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  off: (channel: string, listener: (...args: unknown[]) => void): void => {
    ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1])
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
