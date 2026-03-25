import { contextBridge, ipcRenderer } from 'electron'

/** Channels the renderer may invoke (request → main) */
const INVOKE_CHANNELS = new Set([
  'settings:get', 'settings:set', 'settings:delete', 'settings:getAll',
  'settings:export', 'settings:import',
  'repo-search:login', 'repo-search:logout', 'repo-search:me', 'repo-search:search',
  'repo-search:history-get', 'repo-search:history-save',
  'repo-search:github-oauth-start', 'repo-search:github-oauth-poll',
  'repo-search:github-repos',
  'repo-search:gitlab-oauth-start', 'repo-search:gitlab-oauth-poll',
  'repo-search:oauth-configured',
  'smart-diff:analyze',
  'editor:read-dir', 'editor:open-folder-dialog', 'editor:open-dialog',
  'editor:read-file', 'editor:write-file', 'editor:save-dialog',
  'editor:watch-start', 'editor:watch-stop', 'editor:reveal',
  'editor:create-file', 'editor:create-dir', 'editor:rename', 'editor:delete',
  'editor:find-in-files', 'editor:recent-get', 'editor:recent-clear',
  'app:version',
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
  'ticket-resolver:fetch', 'ticket-resolver:plan', 'ticket-resolver:search', 'ticket-resolver:analyze',
  'ticket-resolver:history-get', 'ticket-resolver:history-save', 'ticket-resolver:history-delete',
])

/** Channels the renderer may send (fire-and-forget → main) */
const SEND_CHANNELS = new Set([
  'window:minimize', 'window:maximize', 'window:close',
  'page:find', 'page:find-stop',
  'editor:authorize-root',
])

/** Channels the renderer may subscribe to (main → renderer) */
const ON_CHANNELS = new Set([
  'open-file', 'page:found', 'editor:file-changed',
])

const api = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    if (!INVOKE_CHANNELS.has(channel)) throw new Error(`IPC invoke blocked: unknown channel "${channel}"`)
    return ipcRenderer.invoke(channel, ...args) as Promise<T>
  },
  send: (channel: string, ...args: unknown[]): void => {
    if (!SEND_CHANNELS.has(channel)) throw new Error(`IPC send blocked: unknown channel "${channel}"`)
    ipcRenderer.send(channel, ...args)
  },
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    if (!ON_CHANNELS.has(channel)) throw new Error(`IPC on blocked: unknown channel "${channel}"`)
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
