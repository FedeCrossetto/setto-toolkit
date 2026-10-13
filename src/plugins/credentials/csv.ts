/**
 * CSV import/export of credentials (pure). Understands the exports of
 * Chrome/Edge, Bitwarden, 1Password, Firefox and generic "name,url,username,password,note" files.
 * Runs in main (the file and its passwords never pass through the renderer).
 */
import type { ImportFormat } from './types'

export interface ImportedCredential {
  nombre: string
  usuario: string
  password: string
  url?: string
  notas?: string
  categoria?: string
}

export interface ImportParseResult {
  format: ImportFormat
  rows: ImportedCredential[]
  skipped: number
  error?: string
}

export const IMPORT_LIMITS = { nombre: 200, usuario: 500, password: 500, notas: 5000, url: 2000 }

/** RFC 4180 parser: quotes, "" escapes, newlines inside quotes, CRLF/LF, BOM; `,` or `;` delimiter. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function key(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '')
}

const COLUMNS: Record<keyof ImportedCredential | 'type', string[]> = {
  nombre: ['name', 'title', 'nombre', 'itemname', 'account', 'titulo'],
  url: ['url', 'loginuri', 'website', 'site', 'loginurl', 'uri', 'urls', 'sitio', 'hostname'],
  usuario: ['username', 'loginusername', 'user', 'login', 'email', 'usuario', 'emailaddress'],
  password: ['password', 'loginpassword', 'pass', 'contrasena', 'clave'],
  notas: ['note', 'notes', 'extra', 'comments', 'nota', 'notas'],
  categoria: ['folder', 'category', 'grouping', 'group', 'categoria', 'carpeta'],
  type: ['type'],
}

function detectFormat(keys: string[]): ImportFormat {
  const has = (k: string): boolean => keys.includes(k)
  if (has('loginuri') || has('loginpassword')) return 'bitwarden'
  if (has('httprealm') || has('formactionorigin')) return 'firefox'
  if (has('title') && (has('otpauth') || has('url') || has('username'))) return '1password'
  if (has('name') && has('url') && has('username') && has('password')) return 'chrome'
  return 'generic'
}

export function hostOf(url?: string): string {
  if (!url) return ''
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function clean(s: string | undefined): string {
  return (s ?? '').split(String.fromCharCode(0)).join('').trim()
}

export function parseCredentialsCsv(text: string): ImportParseResult {
  const table = parseCsv(text)
  const header = table[0]
  if (!header) return { format: 'generic', rows: [], skipped: 0, error: 'El archivo está vacío' }
  const keys = header.map(key)
  const format = detectFormat(keys)
  const col = (field: keyof typeof COLUMNS): number => {
    for (const alias of COLUMNS[field]) {
      const i = keys.indexOf(alias)
      if (i >= 0) return i
    }
    return -1
  }
  const idx = {
    nombre: col('nombre'), url: col('url'), usuario: col('usuario'), password: col('password'),
    notas: col('notas'), categoria: col('categoria'), type: col('type'),
  }
  if (idx.password < 0) {
    return { format, rows: [], skipped: 0, error: 'No encontré una columna de contraseña (password) en la primera fila' }
  }

  const rows: ImportedCredential[] = []
  let skipped = 0
  for (const r of table.slice(1)) {
    const get = (i: number): string => (i >= 0 ? clean(r[i]) : '')
    const type = get(idx.type).toLowerCase()
    // Bitwarden/1Password: notes, cards, identities… are not logins.
    if (type && !['login', '1', 'password', 'contraseña', 'inicio de sesion', 'inicio de sesión'].includes(type)) { skipped++; continue }
    const password = r[idx.password] ?? ''
    const usuario = get(idx.usuario)
    if (!password && !usuario) { skipped++; continue }
    let url = get(idx.url)
    // 1Password/Bitwarden may pack several URLs in one cell.
    url = url.split(/[\s,]+/).find(Boolean) ?? ''
    const nombre = get(idx.nombre) || hostOf(url) || usuario || 'Sin nombre'
    const item: ImportedCredential = {
      nombre: nombre.slice(0, IMPORT_LIMITS.nombre),
      usuario,
      password,
      url: url || undefined,
      notas: get(idx.notas) || undefined,
      categoria: get(idx.categoria) || undefined,
    }
    if (
      item.usuario.length > IMPORT_LIMITS.usuario ||
      item.password.length > IMPORT_LIMITS.password ||
      (item.url?.length ?? 0) > IMPORT_LIMITS.url
    ) { skipped++; continue }
    if (item.notas && item.notas.length > IMPORT_LIMITS.notas) item.notas = item.notas.slice(0, IMPORT_LIMITS.notas)
    rows.push(item)
  }
  return { format, rows, skipped }
}

/** Identity used for duplicate detection: site (host, or name) + user, case-insensitive. */
export function duplicateKey(c: { nombre: string; usuario: string; url?: string }): string {
  const site = hostOf(c.url) || c.nombre.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return `${site}|${c.usuario.trim().toLowerCase()}`
}

/** For each row: does it already exist (in `existing` or earlier in the same file)? */
export function markDuplicates(
  rows: { nombre: string; usuario: string; url?: string }[],
  existing: { nombre: string; usuario: string; url?: string }[],
): boolean[] {
  const seen = new Set(existing.map(duplicateKey))
  return rows.map((r) => {
    const k = duplicateKey(r)
    if (seen.has(k)) return true
    seen.add(k)
    return false
  })
}

function csvField(v: string | undefined, neutralize = true): string {
  const s = v ?? ''
  // Neutralise spreadsheet formulas (CSV injection) in descriptive fields. Never in the
  // password: it has to round-trip exactly.
  const safe = neutralize && /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Chrome/Edge-compatible export: name,url,username,password,note. */
export function credentialsToCsv(items: { nombre: string; usuario: string; password: string; url?: string; notas?: string }[]): string {
  const lines = ['name,url,username,password,note']
  for (const c of items) {
    lines.push([csvField(c.nombre), csvField(c.url), csvField(c.usuario), csvField(c.password, false), csvField(c.notas)].join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
