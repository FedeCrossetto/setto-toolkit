import * as http  from 'http'
import * as https from 'https'
import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { Collection, HttpRequest, HistoryEntry, Environment, HttpResponse } from '../../../src/plugins/api-tester/types'
import { randomUUID } from 'crypto'

const COLLECTIONS_FILE = 'api-tester-collections.json'
const HISTORY_FILE     = 'api-tester-history.json'
const ENVS_FILE        = 'api-tester-environments.json'
const MAX_HISTORY      = 50

/** Replace {{varName}} tokens in a string using the active environment */
function interpolate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}


// ── HTTP executor (Node http/https — works on all Electron versions, ──────────
//    gives real error codes like ECONNREFUSED instead of "fetch failed") ───────

function nodeRequest(
  urlObj: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
): Promise<{ status: number; statusText: string; responseHeaders: Record<string, string>; responseBody: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === 'https:'
    const client  = isHttps ? https : http

    const options: http.RequestOptions = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (isHttps ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      method,
      headers,
    }

    const req = client.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        const responseHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) responseHeaders[k] = Array.isArray(v) ? v.join(', ') : v
        }
        resolve({
          status:          res.statusCode    ?? 0,
          statusText:      res.statusMessage ?? '',
          responseHeaders,
          responseBody,
        })
      })
      res.on('error', reject)
    })

    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('TIMEOUT'))
    })

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED')
        return reject(new Error(`Connection refused — nothing is listening on ${urlObj.hostname}:${urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80)}`))
      if (err.code === 'ENOTFOUND')
        return reject(new Error(`DNS error — could not resolve "${urlObj.hostname}""`))
      if (err.code === 'ECONNRESET')
        return reject(new Error('Connection reset by server'))
      if (err.code === 'ETIMEDOUT')
        return reject(new Error('TIMEOUT'))
      reject(err)
    })

    if (body) req.write(body)
    req.end()
  })
}

export const handlers: PluginHandlers = {
  pluginId: 'api-tester',

  register(ipcMain: IpcMain, { db }: CoreServices): void {

    // ── Collections ────────────────────────────────────────────────────────

    ipcMain.handle('api-tester:collections-get', () => {
      return db.readJSON<Collection[]>(COLLECTIONS_FILE) ?? []
    })

    ipcMain.handle('api-tester:collections-save', (_e, collections: Collection[]) => {
      db.writeJSON(COLLECTIONS_FILE, collections)
      return { ok: true }
    })

    ipcMain.handle('api-tester:collection-create', (_e, name: string) => {
      const collections = db.readJSON<Collection[]>(COLLECTIONS_FILE) ?? []
      const col: Collection = {
        id: randomUUID(), name, requests: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      collections.push(col)
      db.writeJSON(COLLECTIONS_FILE, collections)
      return col
    })

    ipcMain.handle('api-tester:collection-delete', (_e, collectionId: string) => {
      const collections = db.readJSON<Collection[]>(COLLECTIONS_FILE) ?? []
      db.writeJSON(COLLECTIONS_FILE, collections.filter((c) => c.id !== collectionId))
      return { ok: true }
    })

    ipcMain.handle('api-tester:request-save', (_e, request: HttpRequest) => {
      const collections = db.readJSON<Collection[]>(COLLECTIONS_FILE) ?? []
      const col = collections.find((c) => c.id === request.collectionId)
      if (!col) throw new Error(`Collection ${request.collectionId} not found`)

      const existing = col.requests.findIndex((r) => r.id === request.id)
      if (existing >= 0) {
        col.requests[existing] = { ...request, updatedAt: new Date().toISOString() }
      } else {
        col.requests.push({ ...request, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      }
      col.updatedAt = new Date().toISOString()
      db.writeJSON(COLLECTIONS_FILE, collections)
      return col
    })

    ipcMain.handle('api-tester:request-delete', (_e, collectionId: string, requestId: string) => {
      const collections = db.readJSON<Collection[]>(COLLECTIONS_FILE) ?? []
      const col = collections.find((c) => c.id === collectionId)
      if (col) {
        col.requests = col.requests.filter((r) => r.id !== requestId)
        col.updatedAt = new Date().toISOString()
        db.writeJSON(COLLECTIONS_FILE, collections)
      }
      return { ok: true }
    })

    // ── Environments ───────────────────────────────────────────────────────

    ipcMain.handle('api-tester:environments-get', () => {
      return db.readJSON<Environment[]>(ENVS_FILE) ?? []
    })

    ipcMain.handle('api-tester:environments-save', (_e, envs: Environment[]) => {
      db.writeJSON(ENVS_FILE, envs)
      return { ok: true }
    })

    // ── History ────────────────────────────────────────────────────────────

    ipcMain.handle('api-tester:history-get', () => {
      return db.readJSON<HistoryEntry[]>(HISTORY_FILE) ?? []
    })

    ipcMain.handle('api-tester:history-clear', () => {
      db.writeJSON(HISTORY_FILE, [])
      return { ok: true }
    })

    // ── Execute ────────────────────────────────────────────────────────────

    ipcMain.handle('api-tester:execute', async (_e, payload: {
      request: HttpRequest
      envVars: Record<string, string>
      timeoutMs?: number
    }) => {
      const { request, envVars, timeoutMs = 30_000 } = payload
      const vars = envVars ?? {}

      // Apply environment variable interpolation
      const url = interpolate(request.url, vars)
      const headers: Record<string, string> = {}

      for (const h of request.headers.filter((h) => h.enabled && h.key)) {
        headers[interpolate(h.key, vars)] = interpolate(h.value, vars)
      }

      // Auth header
      if (request.auth.type === 'bearer' && request.auth.token) {
        headers['Authorization'] = `Bearer ${interpolate(request.auth.token, vars)}`
      } else if (request.auth.type === 'basic' && request.auth.username) {
        const creds = Buffer.from(`${request.auth.username}:${request.auth.password ?? ''}`).toString('base64')
        headers['Authorization'] = `Basic ${creds}`
      }

      // Build full URL with query params
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      for (const p of request.params.filter((p) => p.enabled && p.key)) {
        urlObj.searchParams.set(interpolate(p.key, vars), interpolate(p.value, vars))
      }

      // Body
      let body: string | undefined
      if (request.body.type !== 'none' && request.method !== 'GET' && request.method !== 'HEAD') {
        body = interpolate(request.body.content, vars)
        if (!headers['Content-Type'] && !headers['content-type']) {
          if (request.body.type === 'json')        headers['Content-Type'] = 'application/json'
          else if (request.body.type === 'xml')    headers['Content-Type'] = 'application/xml'
          else if (request.body.type === 'form')   headers['Content-Type'] = 'application/x-www-form-urlencoded'
          else                                     headers['Content-Type'] = 'text/plain'
        }
      }

      const startMs = Date.now()

      try {
        const { status, statusText, responseHeaders, responseBody } =
          await nodeRequest(urlObj, request.method, headers, body, timeoutMs)

        const duration = Date.now() - startMs
        const response: HttpResponse = {
          status,
          statusText,
          headers: responseHeaders,
          body: responseBody,
          duration,
          size: Buffer.byteLength(responseBody, 'utf8'),
        }

        // Persist to history (cap at MAX_HISTORY)
        const history = db.readJSON<HistoryEntry[]>(HISTORY_FILE) ?? []
        history.unshift({
          id: randomUUID(),
          executedAt: new Date().toISOString(),
          request: { method: request.method, url, headers: request.headers, params: request.params, body: request.body, auth: request.auth },
          response,
        })
        db.writeJSON(HISTORY_FILE, history.slice(0, MAX_HISTORY))

        return response

      } catch (err) {
        if (err instanceof Error) throw err
        throw new Error('Request failed')
      }
    })
  }
}
