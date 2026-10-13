/**
 * Portapapeles inteligente — funciones puras compartidas por main
 * (electron/core/clipboard-history.ts) y el renderer (selector flotante,
 * Utilidades, Ctrl+K). Sin Electron ni DOM: testeadas en clip-utils.test.ts.
 */

// ─── Qué es lo copiado ───────────────────────────────────────────────────────

export type ClipKind =
  | 'ticket' | 'url' | 'path' | 'json' | 'jwt' | 'stacktrace' | 'guid' | 'timestamp' | 'sql' | 'email' | 'table' | 'list' | 'text'

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i
const TICKET_RE = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/
const URL_RE = /^https?:\/\/\S+$/i
const PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\)[^\r\n<>"|?*]*$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const JWT_RE = /^(?:Bearer\s+)?eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
const SQL_RE = /^\s*(select|insert|update|delete|with|exec|execute|create|alter|drop|merge|declare|use)\b/i
const STACK_RE = /(\n\s+at\s+\S+.*\(.*:\d+\)|\n\s+at\s+[\w.<>$`]+\(|\n\s+en\s+[\w.<>$`]+\(|Exception:|Traceback \(most recent call last\))/

export function detectKind(raw: string): ClipKind {
  const t = raw.trim()
  if (!t) return 'text'
  const oneLine = !t.includes('\n')
  if (oneLine) {
    if (TICKET_RE.test(t)) return 'ticket'
    if (GUID_RE.test(t)) return 'guid'
    if (JWT_RE.test(t)) return 'jwt'
    if (URL_RE.test(t)) return 'url'
    if (EMAIL_RE.test(t)) return 'email'
    if (PATH_RE.test(t)) return 'path'
    if (/^\d{10}(\d{3})?$/.test(t)) return 'timestamp'
  }
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { JSON.parse(t); return 'json' } catch { /* no es JSON */ }
  }
  if (STACK_RE.test('\n' + t)) return 'stacktrace'
  if (SQL_RE.test(t)) return 'sql'
  const lines = t.split(/\r?\n/)
  if (lines.length >= 2 && lines.every((l) => l.includes('\t')) && new Set(lines.map((l) => l.split('\t').length)).size === 1) return 'table'
  if (lines.length >= 2 && lines.every((l) => l.trim() && l.trim().length <= 80 && !/\s{2,}/.test(l.trim()))) return 'list'
  return 'text'
}

/** Primera clave de ticket dentro de un texto (para agrupar/linkear). */
export function findTicket(text: string): string | null {
  const m = /\b([A-Z][A-Z0-9]{1,9}-\d{2,7})\b/.exec(text)
  return m ? m[1]! : null
}

// ─── Datos sensibles ─────────────────────────────────────────────────────────

/** Bits por carácter (Shannon). Los tokens aleatorios dan > 3.5; las palabras, menos. */
function entropy(s: string): number {
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of freq.values()) { const p = n / s.length; h -= p * Math.log2(p) }
  return h
}

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|pwd|passwd|contrase[ñn]a|clave)\s*[=:]\s*\S+/i,       // cadenas de conexión, configs
  /\bAKIA[0-9A-Z]{16}\b/,                                              // AWS
  /\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/,               // GitHub
  /\bsk-[A-Za-z0-9_-]{20,}\b/,                                         // OpenAI / Anthropic
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,                                  // Slack
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,     // JWT
]

/**
 * ¿Parece una contraseña, token o clave? Patrones conocidos o un "token" suelto
 * con mucha entropía. Excluye GUIDs, hashes hex, rutas, URLs y texto con espacios.
 */
export function isSensitive(raw: string): boolean {
  const t = raw.trim()
  if (!t || t.length > 4000) return false
  if (SECRET_PATTERNS.some((re) => re.test(t))) return true
  if (/\s/.test(t) || t.length < 12 || t.length > 200) return false
  if (GUID_RE.test(t) || /^[0-9a-f]+$/i.test(t) || /^\d+$/.test(t)) return false
  if (URL_RE.test(t) || PATH_RE.test(t) || EMAIL_RE.test(t) || TICKET_RE.test(t)) return false
  // Las claves/tokens reales mezclan mayúsculas, minúsculas y números; los nombres de
  // rama o identificadores (todo minúscula, o PascalCase sin dígitos) no.
  if (!/[a-z]/.test(t) || !/[A-Z]/.test(t) || !/\d/.test(t)) return false
  // Identificadores hechos de palabras (WindowsSystem32, ConsoleBuilder2Second): no son claves.
  const wordy = (t.match(/[A-Z]?[a-z]{3,}/g) ?? []).join('').length
  if (wordy / t.length >= 0.6) return false
  return entropy(t) >= 3.5
}

/**
 * Tapa contraseñas y tokens dentro de un texto más largo (p. ej. el OCR de una
 * captura que se va a pegar en Jira): "Clave: Secreta123" → "Clave: ••••••".
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(password|pwd|passwd|contrase[ñn]a|clave)(\s*[=:]\s*)([^\s;,]+)/gi, '$1$2••••••')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '••••••')
    .replace(/\b(AKIA[0-9A-Z]{16}|(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g, '••••••')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}=*/g, '$1••••••')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '••••••')
}

/** "Secreta123" → "Se••••••23" (deja ver lo justo para reconocerlo). */
export function maskSecret(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t.length <= 6) return '••••••'
  return `${t.slice(0, 2)}${'•'.repeat(Math.min(12, t.length - 4))}${t.slice(-2)}`
}

// ─── Transformaciones al pegar ───────────────────────────────────────────────

/** Valores de una lista/columna: separados por línea, tab, coma o punto y coma. */
export function splitValues(text: string): string[] {
  return text
    .split(/[\r\n\t,;]+/)
    .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

export function toSqlIn(text: string): string {
  const values = [...new Set(splitValues(text))]
  if (!values.length) return ''
  const numeric = values.every((v) => /^-?\d+(\.\d+)?$/.test(v))
  const items = numeric ? values : values.map((v) => `'${v.replace(/'/g, "''")}'`)
  // Muchos valores: de a 10 por línea para que se lea.
  const lines: string[] = []
  for (let i = 0; i < items.length; i += 10) lines.push(items.slice(i, i + 10).join(', '))
  return `IN (${lines.join(',\n    ')})`
}

function rows(text: string): string[][] {
  return text.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t').map((c) => c.trim()))
}

/** Resultado de SSMS/Excel (tabulado) → tabla de Jira. La primera fila es el encabezado. */
export function toJiraTable(text: string): string {
  const r = rows(text)
  if (!r.length) return ''
  const esc = (c: string): string => (c === '' ? ' ' : c.replace(/\|/g, '\\|'))
  return [`||${r[0]!.map(esc).join('||')}||`, ...r.slice(1).map((row) => `|${row.map(esc).join('|')}|`)].join('\n')
}

export function toMarkdownTable(text: string): string {
  const r = rows(text)
  if (!r.length) return ''
  const width = Math.max(...r.map((x) => x.length))
  const pad = (row: string[]): string[] => [...row, ...Array(width - row.length).fill('')]
  const esc = (c: string): string => c.replace(/\|/g, '\\|')
  const line = (row: string[]): string => `| ${pad(row).map(esc).join(' | ')} |`
  return [line(r[0]!), `| ${Array(width).fill('---').join(' | ')} |`, ...r.slice(1).map(line)].join('\n')
}

export function toCSharpString(text: string): string {
  // Verbatim string: sólo hay que duplicar las comillas.
  return `@"${text.replace(/"/g, '""')}"`
}

export function toSqlString(text: string): string {
  return `N'${text.replace(/'/g, "''")}'`
}

export interface ClipTransform {
  id: string
  label: string
  /** Sugerida primero cuando el texto es de este tipo */
  for?: ClipKind[]
  apply: (text: string) => string
}

export const TRANSFORMS: ClipTransform[] = [
  { id: 'sql-in', label: 'Lista → IN (…) de SQL', for: ['list', 'guid'], apply: toSqlIn },
  { id: 'jira-table', label: 'Tabla → Jira', for: ['table'], apply: toJiraTable },
  { id: 'md-table', label: 'Tabla → Markdown', for: ['table'], apply: toMarkdownTable },
  { id: 'json', label: 'JSON formateado', for: ['json'], apply: (t) => { try { return JSON.stringify(JSON.parse(t), null, 2) } catch { return t } } },
  { id: 'one-line', label: 'En una sola línea', for: ['list', 'sql', 'stacktrace'], apply: (t) => t.replace(/\s*\r?\n\s*/g, ' ').trim() },
  { id: 'trim', label: 'Sin espacios de más', apply: (t) => t.split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() },
  { id: 'upper', label: 'MAYÚSCULAS', apply: (t) => t.toUpperCase() },
  { id: 'lower', label: 'minúsculas', apply: (t) => t.toLowerCase() },
  { id: 'csharp', label: 'String de C# (@"…")', apply: toCSharpString },
  { id: 'sql-string', label: "String de SQL (N'…')", apply: toSqlString },
  { id: 'bullets', label: 'Lista con viñetas', for: ['list'], apply: (t) => t.split(/\r?\n/).filter((l) => l.trim()).map((l) => `- ${l.trim()}`).join('\n') },
]

/** Transformaciones ordenadas: primero las que corresponden al tipo de texto. */
export function transformsFor(kind: ClipKind): ClipTransform[] {
  return [...TRANSFORMS].sort((a, b) => Number(!!b.for?.includes(kind)) - Number(!!a.for?.includes(kind)))
}

/** Entrada del historial tal como llega al renderer (ver electron/core/clipboard-history.ts). */
export interface ClipView {
  id: string
  /** Vacío si es sensible: el texto real nunca sale de main */
  text: string
  masked?: string
  at: number
  kind: ClipKind
  sensitive: boolean
  pinned: boolean
  app?: string
}
