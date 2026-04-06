import * as http  from 'http'
import * as https from 'https'
import * as dns   from 'dns'
import vm from 'vm'
import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { Collection, HttpRequest, HistoryEntry, Environment, HttpResponse, FormDataField } from '../../../src/plugins/api-tester/types'
import { randomUUID } from 'crypto'

const COLLECTIONS_FILE = 'api-tester-collections.json'
const HISTORY_FILE     = 'api-tester-history.json'
const ENVS_FILE        = 'api-tester-environments.json'
const MAX_HISTORY      = 50

/** Replace {{varName}} tokens in a string using the active environment */
function interpolate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

const MULTIPART_BOUNDARY = '----SettoBoundary'

/**
 * Build a multipart/form-data body buffer from FormDataField array.
 * File fields use the '__FILE__:<base64>:<filename>' encoding set by the renderer.
 */
function buildFormDataBody(
  fields: FormDataField[],
  vars: Record<string, string>
): { body: Buffer; contentType: string } {
  const boundary = `${MULTIPART_BOUNDARY}${Date.now()}`
  const parts: Buffer[] = []

  for (const field of fields.filter((f) => f.enabled && f.key)) {
    const key = interpolate(field.key, vars)
    if (field.isFile && field.value.startsWith('__FILE__:')) {
      // Format: '__FILE__:<base64>:<filename>' — base64 has no colons so first ':' after prefix is the separator
      const payload  = field.value.slice('__FILE__:'.length)
      const sepIdx   = payload.indexOf(':')
      const b64      = payload.slice(0, sepIdx)
      const filename = payload.slice(sepIdx + 1)
      const fileData = Buffer.from(b64, 'base64')
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${filename ?? key}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      parts.push(Buffer.from(header, 'utf8'))
      parts.push(fileData)
      parts.push(Buffer.from('\r\n', 'utf8'))
    } else {
      const value = interpolate(field.value, vars)
      const part = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      parts.push(Buffer.from(part, 'utf8'))
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}


// ── SSRF guard ────────────────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // loopback
  /^0\.0\.0\.0$/,                    // unspecified
  /^10\./,                           // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC 1918
  /^192\.168\./,                     // RFC 1918
  /^169\.254\./,                     // link-local / AWS metadata
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 ULA
  /^fe80:/i,                         // IPv6 link-local
]

function assertNotPrivateHost(urlObj: URL): void {
  const host = urlObj.hostname.toLowerCase()
  if (host === 'localhost') throw new Error('SSRF: requests to localhost are not allowed')
  if (PRIVATE_IP_PATTERNS.some((re) => re.test(host))) {
    throw new Error(`SSRF: requests to private/internal addresses are not allowed (${host})`)
  }
}

/**
 * DNS rebinding guard: resolves the hostname to its actual IP and re-checks.
 * Prevents attacks where a public DNS name resolves to a private IP.
 */
async function assertNotPrivateDns(urlObj: URL): Promise<void> {
  assertNotPrivateHost(urlObj) // fast pre-check on the raw hostname
  const host = urlObj.hostname
  // Skip DNS lookup for bare IPs — already validated above
  if (/^[\d.:]+$/.test(host)) return
  try {
    const { address } = await new Promise<{ address: string; family: number }>((resolve, reject) =>
      dns.lookup(host, { family: 0 }, (err, address, family) =>
        err ? reject(err) : resolve({ address, family })
      )
    )
    if (PRIVATE_IP_PATTERNS.some((re) => re.test(address))) {
      throw new Error(`SSRF: hostname "${host}" resolves to a private address (${address})`)
    }
  } catch (err) {
    if ((err as Error).message.startsWith('SSRF:')) throw err
    // DNS resolution failure — let the request proceed and fail naturally
  }
}

/** Strip CR/LF characters from a header name or value to prevent HTTP header injection */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, '')
}


// ── HTTP executor (Node http/https — works on all Electron versions, ──────────
//    gives real error codes like ECONNREFUSED instead of "fetch failed") ───────

function nodeRequest(
  urlObj: URL,
  method: string,
  headers: Record<string, string>,
  body: string | Buffer | undefined,
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

    // ── Script runner ──────────────────────────────────────────────────────
    // Executes a user script in a sandboxed vm context.
    // The script receives a `pm` object with environment get/set and optional response data.

    ipcMain.handle('api-tester:run-script', (_e, payload: {
      script: string
      envVars: Record<string, string>
      response?: { status: number; body: string; headers: Record<string, string> }
    }) => {
      const { script, envVars, response } = payload
      if (!script || typeof script !== 'string') return { envVars, logs: [] }

      const logs: string[] = []
      const updatedVars = { ...envVars }

      const pm = {
        environment: {
          get: (key: string) => updatedVars[key] ?? null,
          set: (key: string, value: unknown) => { updatedVars[key] = String(value) },
          unset: (key: string) => { delete updatedVars[key] },
        },
        response: response
          ? {
              status: response.status,
              body: response.body,
              headers: response.headers,
              json: () => {
                try { return JSON.parse(response.body) }
                catch { return null }
              },
            }
          : null,
      }

      // Use a null-prototype context to block prototype-chain escapes.
      // Only expose safe primitives — deliberately exclude Array/Object constructors.
      const ctx = Object.create(null) as Record<string, unknown>
      ctx['pm']         = pm
      ctx['console']    = Object.freeze({ log: (...args: unknown[]) => logs.push(args.map(String).join(' ')) })
      ctx['JSON']       = Object.freeze({ parse: JSON.parse.bind(JSON), stringify: JSON.stringify.bind(JSON) })
      ctx['parseInt']   = parseInt
      ctx['parseFloat'] = parseFloat
      ctx['String']     = String
      ctx['Number']     = Number
      ctx['Boolean']    = Boolean
      ctx['Math']       = Object.freeze({ ...Math })
      const sandbox     = vm.createContext(ctx)

      try {
        vm.runInContext(script, sandbox, { timeout: 2000, filename: 'script' })
      } catch (err) {
        return { envVars: updatedVars, logs, error: err instanceof Error ? err.message : String(err) }
      }

      return { envVars: updatedVars, logs }
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
        const key = sanitizeHeader(interpolate(h.key, vars))
        const val = sanitizeHeader(interpolate(h.value, vars))
        if (key) headers[key] = val
      }

      // Auth header
      if (request.auth.type === 'bearer' && request.auth.token) {
        headers['Authorization'] = `Bearer ${sanitizeHeader(interpolate(request.auth.token, vars))}`
      } else if (request.auth.type === 'basic' && request.auth.username) {
        const creds = Buffer.from(`${request.auth.username}:${request.auth.password ?? ''}`).toString('base64')
        headers['Authorization'] = `Basic ${creds}`
      }

      // Build full URL with query params
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      await assertNotPrivateDns(urlObj)
      for (const p of request.params.filter((p) => p.enabled && p.key)) {
        urlObj.searchParams.set(interpolate(p.key, vars), interpolate(p.value, vars))
      }

      // Body
      let body: string | Buffer | undefined
      if (request.body.type !== 'none' && request.method !== 'GET' && request.method !== 'HEAD') {
        if (request.body.type === 'form-data') {
          const fields = (request.body.formData ?? []) as FormDataField[]
          const { body: fdBody, contentType } = buildFormDataBody(fields, vars)
          body = fdBody
          if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = contentType
          }
        } else {
          body = interpolate(request.body.content, vars)
          if (!headers['Content-Type'] && !headers['content-type']) {
            if (request.body.type === 'json')        headers['Content-Type'] = 'application/json'
            else if (request.body.type === 'xml')    headers['Content-Type'] = 'application/xml'
            else if (request.body.type === 'form')   headers['Content-Type'] = 'application/x-www-form-urlencoded'
            else                                     headers['Content-Type'] = 'text/plain'
          }
        }
      }

      const startMs = Date.now()

      try {
        const { status, statusText, responseHeaders, responseBody } =
          await nodeRequest(urlObj, request.method, headers, body as string | undefined, timeoutMs)

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
