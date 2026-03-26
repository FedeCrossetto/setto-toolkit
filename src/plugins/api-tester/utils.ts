/** Cryptographically secure UUID v4 using the Web Crypto API (available in Electron renderer). */
export function randomUUID(): string {
  return crypto.randomUUID()
}

/** Default empty KeyValuePair */
export function newKV(): import('./types').KeyValuePair {
  return { id: randomUUID(), key: '', value: '', enabled: true }
}

/** Detect if a string is valid JSON */
export function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

/** Apply syntax highlighting to a JSON/text string — returns HTML with span wrappers */
export function highlightJson(str: string): string {
  const escaped = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (match.startsWith('"')) {
        if (match.endsWith(':')) return `<span class="json-key">${match.slice(0, -1)}</span>:`
        return `<span class="json-string">${match}</span>`
      }
      if (match === 'true' || match === 'false') return `<span class="json-bool">${match}</span>`
      if (match === 'null') return `<span class="json-null">${match}</span>`
      return `<span class="json-number">${match}</span>`
    }
  )
}

/** Human-readable byte size */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Beautify XML string (simple indent, no external parser) */
export function formatXml(xml: string): string {
  let indent = 0
  return xml
    .replace(/>\s*</g, '><')
    .replace(/(<\/?\w[^>]*>)/g, (_, tag) => {
      if (tag.startsWith('</')) indent--
      const out = '  '.repeat(Math.max(0, indent)) + tag
      if (!tag.startsWith('</') && !tag.endsWith('/>')) indent++
      return out
    })
    .split('<').join('\n<').replace(/^\n/, '')
}

/** Parse x-www-form-urlencoded string into KV pairs */
export function parseFormPairs(content: string): import('./types').KeyValuePair[] {
  if (!content.trim()) return [newKV()]
  return content.split('&').map((part) => {
    const [k, ...rest] = part.split('=')
    return { id: randomUUID(), key: decodeURIComponent(k ?? ''), value: decodeURIComponent(rest.join('=')), enabled: true }
  })
}

/** Serialize KV pairs to x-www-form-urlencoded string */
export function serializeFormPairs(pairs: import('./types').KeyValuePair[]): string {
  return pairs
    .filter((p) => p.enabled && p.key)
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&')
}

// ── Shell tokenizer (respects single + double quotes) ────────────────────────
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++
    if (i >= input.length) break
    const q = input[i]
    if (q === '"' || q === "'") {
      let j = i + 1
      while (j < input.length && input[j] !== q) { if (input[j] === '\\') j++; j++ }
      tokens.push(input.slice(i + 1, j))
      i = j + 1
    } else {
      let j = i
      while (j < input.length && !/\s/.test(input[j])) j++
      tokens.push(input.slice(i, j))
      i = j
    }
  }
  return tokens
}

/** Parse a curl command string into an ActiveRequest partial */
export function parseCurl(input: string): Partial<import('./types').ActiveRequest> | null {
  const cmd = input.replace(/\\\n/g, ' ').trim()
  if (!cmd.toLowerCase().startsWith('curl')) return null
  const tokens = tokenize(cmd)

  let method: import('./types').HttpMethod = 'GET'
  let url = ''
  const headers: import('./types').KeyValuePair[] = []
  let bodyContent = ''
  let bodyType: import('./types').BodyType = 'none'
  let authType: import('./types').AuthType = 'none'
  let authToken = ''
  let authUser = ''
  let authPass = ''

  let i = 1
  while (i < tokens.length) {
    const t = tokens[i]
    if (t === '-X' || t === '--request') {
      method = tokens[++i] as import('./types').HttpMethod
    } else if (t === '-H' || t === '--header') {
      const h = tokens[++i] ?? ''
      const colon = h.indexOf(':')
      if (colon > 0) headers.push({ id: randomUUID(), key: h.slice(0, colon).trim(), value: h.slice(colon + 1).trim(), enabled: true })
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-ascii' || t === '--data-binary') {
      bodyContent = tokens[++i] ?? ''
      if (method === 'GET') method = 'POST'
    } else if (t === '-u' || t === '--user') {
      const up = tokens[++i] ?? ''
      const colon = up.indexOf(':')
      authType = 'basic'
      authUser = colon >= 0 ? up.slice(0, colon) : up
      authPass = colon >= 0 ? up.slice(colon + 1) : ''
    } else if (!t.startsWith('-') && !url) {
      url = t
    }
    i++
  }

  // Check Authorization header → extract bearer
  const authIdx = headers.findIndex((h) => h.key.toLowerCase() === 'authorization')
  if (authIdx >= 0) {
    const val = headers[authIdx].value
    if (/^bearer\s/i.test(val)) { authType = 'bearer'; authToken = val.slice(7).trim(); headers.splice(authIdx, 1) }
  }

  // Detect body type from content + content-type header
  if (bodyContent) {
    const ct = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? ''
    if (ct.includes('x-www-form-urlencoded')) { bodyType = 'form' }
    else if (ct.includes('xml')) { bodyType = 'xml' }
    else {
      try { JSON.parse(bodyContent); bodyType = 'json' }
      catch {
        // May contain {{vars}} that make it invalid JSON — still treat as json if it looks like an object/array
        const trimmed = bodyContent.trim()
        bodyType = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? 'json' : 'text'
      }
    }
  }

  return {
    method, url, headers,
    params: [newKV()],
    body: { type: bodyType, content: bodyContent },
    auth: authType === 'basic'
      ? { type: 'basic', username: authUser, password: authPass }
      : authType === 'bearer'
        ? { type: 'bearer', token: authToken }
        : { type: 'none' },
  }
}

/** Import a Collection from JSON — supports native format and Postman Collection v2.1 */
export function importCollectionFromJSON(raw: string): import('./types').Collection | null {
  let obj: Record<string, unknown>
  try { obj = JSON.parse(raw) } catch { return null }

  // ── Native format ──────────────────────────────────────────────────────────
  if (typeof obj.id === 'string' && typeof obj.name === 'string' && Array.isArray(obj.requests)) {
    return obj as unknown as import('./types').Collection
  }

  // ── Postman Collection v2 / v2.1 ──────────────────────────────────────────
  if (obj.info && Array.isArray(obj.item)) {
    const info = obj.info as Record<string, unknown>
    const colId = randomUUID()

    const convertItem = (item: Record<string, unknown>): import('./types').HttpRequest | null => {
      const req = item.request as Record<string, unknown> | undefined
      if (!req) return null   // folder — skip

      // Method
      const method = ((req.method as string) ?? 'GET').toUpperCase() as import('./types').HttpMethod

      // URL
      const urlField = req.url
      let url = ''
      if (typeof urlField === 'string') { url = urlField }
      else if (urlField && typeof urlField === 'object') { url = ((urlField as Record<string, unknown>).raw as string) ?? '' }

      // Headers
      const headerArr = Array.isArray(req.header) ? (req.header as Array<Record<string, string>>) : []
      const headers: import('./types').KeyValuePair[] = headerArr.map((h) => ({
        id: randomUUID(), key: h.key ?? '', value: h.value ?? '', enabled: !h.disabled,
      }))

      // Params (from URL query array)
      const params: import('./types').KeyValuePair[] = []
      if (urlField && typeof urlField === 'object') {
        const urlObj = urlField as Record<string, unknown>
        if (Array.isArray(urlObj.query)) {
          for (const q of urlObj.query as Array<Record<string, string>>) {
            params.push({ id: randomUUID(), key: q.key ?? '', value: q.value ?? '', enabled: !q.disabled })
          }
        }
      }

      // Body
      let body: import('./types').HttpRequest['body'] = { type: 'none', content: '' }
      if (req.body && typeof req.body === 'object') {
        const b = req.body as Record<string, unknown>
        if (b.mode === 'raw') {
          const lang = ((b.options as Record<string, unknown>)?.raw as Record<string, string>)?.language ?? ''
          const bodyType = lang === 'json' ? 'json' : lang === 'xml' ? 'xml' : 'text'
          body = { type: bodyType, content: (b.raw as string) ?? '' }
        } else if (b.mode === 'urlencoded') {
          const pairs = Array.isArray(b.urlencoded) ? (b.urlencoded as Array<Record<string, string>>) : []
          body = { type: 'form', content: pairs.map((p) => `${encodeURIComponent(p.key ?? '')}=${encodeURIComponent(p.value ?? '')}`).join('&') }
        }
      }

      // Auth
      let auth: import('./types').HttpRequest['auth'] = { type: 'none' }
      if (req.auth && typeof req.auth === 'object') {
        const a = req.auth as Record<string, unknown>
        if (a.type === 'bearer') {
          const token = (a.bearer as Array<Record<string, string>>)?.find((x) => x.key === 'token')?.value
          auth = { type: 'bearer', token }
        } else if (a.type === 'basic') {
          const username = (a.basic as Array<Record<string, string>>)?.find((x) => x.key === 'username')?.value
          const password = (a.basic as Array<Record<string, string>>)?.find((x) => x.key === 'password')?.value
          auth = { type: 'basic', username, password }
        }
      }

      return {
        id: randomUUID(), collectionId: colId,
        name: (item.name as string) ?? 'Untitled',
        method, url, headers,
        params: params.length ? params : [newKV()],
        body, auth,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }

    const requests = (obj.item as Array<Record<string, unknown>>)
      .map(convertItem)
      .filter((r): r is import('./types').HttpRequest => r !== null)

    return {
      id: colId,
      name: (info.name as string) ?? 'Imported Collection',
      requests,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  return null
}

/** Replace {{varName}} tokens with their values from the given map (leaves unresolved tokens as-is) */
export function interpolateVars(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{([^}]+)\}\}/g, (_, k) => vars[k.trim()] ?? `{{${k}}}`)
}

/** Extract all unique {{varName}} placeholders from one or more strings */
export function extractTemplateVars(...texts: string[]): string[] {
  const vars = new Set<string>()
  for (const t of texts) {
    for (const m of t.matchAll(/\{\{([^}]+)\}\}/g)) vars.add(m[1].trim())
  }
  return [...vars]
}

/** Export an ActiveRequest as a curl command string */
export function exportToCurl(req: import('./types').ActiveRequest): string {
  const parts: string[] = ['curl']
  if (req.method !== 'GET') parts.push(`-X ${req.method}`)

  const enabledParams = req.params.filter((p) => p.enabled && p.key)
  let url = req.url
  if (enabledParams.length) {
    const qs = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
    url += (url.includes('?') ? '&' : '?') + qs
  }
  parts.push(`'${url}'`)

  if (req.auth.type === 'bearer') parts.push(`-H 'Authorization: Bearer ${req.auth.token ?? ''}'`)
  else if (req.auth.type === 'basic') parts.push(`-u '${req.auth.username ?? ''}:${req.auth.password ?? ''}'`)

  const enabledHeaders = req.headers.filter((h) => h.enabled && h.key)
  const hasContentType = enabledHeaders.some((h) => h.key.toLowerCase() === 'content-type')

  for (const h of enabledHeaders) {
    parts.push(`-H '${h.key}: ${h.value.replace(/'/g, "'\\''")}'`)
  }

  if (req.body.type !== 'none' && req.body.content) {
    // Auto-inject Content-Type if not explicitly set — mirrors what the server does
    if (!hasContentType) {
      const ct =
        req.body.type === 'json' ? 'application/json' :
        req.body.type === 'xml'  ? 'application/xml' :
        req.body.type === 'form' ? 'application/x-www-form-urlencoded' :
        null
      if (ct) parts.push(`-H 'Content-Type: ${ct}'`)
    }
    const escaped = req.body.content.replace(/'/g, "'\\''")
    parts.push(`-d '${escaped}'`)
  }

  return parts.join(' \\\n  ')
}
