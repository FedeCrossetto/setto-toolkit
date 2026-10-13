/**
 * Helpers puros del modo log (sin CodeMirror ni React): detección de nivel,
 * timestamps, stack traces, contadores y cálculo de líneas ocultas por filtro.
 * Los usa `components/logHighlight.ts` (decoraciones) y `components/LogToolbar.tsx`.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** Filtro de nivel de la barra de logs */
export type LogLevelFilter = 'all' | 'warnings' | 'errors'

/** Estado de la vista de log de una pestaña (filtros + "Limpiar vista") */
export interface LogViewState {
  level: LogLevelFilter
  /** Texto a buscar (sin distinguir mayúsculas). Vacío = sin filtro */
  text: string
  /** Primera línea visible (1-based). 1 = desde el principio */
  fromLine: number
}

export const DEFAULT_LOG_VIEW: LogViewState = { level: 'all', text: '', fromLine: 1 }

export function isLogViewFiltered(v: LogViewState | null | undefined): boolean {
  return !!v && (v.level !== 'all' || v.text.trim() !== '' || v.fromLine > 1)
}

export interface LevelMatch {
  level: LogLevel
  /** Offset del token dentro de la línea */
  from: number
  to: number
}

// Tokens en mayúsculas en cualquier lugar de la línea (formato típico de log4net/NLog/Serilog).
// Las variantes Title/minúscula sólo cuentan delimitadas: [Error], <Warning>, "Info:".
const LEVEL_PATTERNS: Array<{ level: LogLevel; res: RegExp[] }> = [
  { level: 'error', res: [
    /\b(?:ERROR|ERR|FATAL|FTL|CRITICAL|CRIT|SEVERE|EXCEPTION|EXCEPCI[OÓ]N)\b|\b[A-Za-z]*Exception\b/,
    /[[<](?:error|fatal|critical)[\]>]|\b(?:error|fatal):/i,
  ] },
  { level: 'warn', res: [
    /\b(?:WARN|WARNING|WRN|ADVERTENCIA)\b/,
    /[[<](?:warn|warning)[\]>]|\bwarning:/i,
  ] },
  { level: 'info', res: [
    /\b(?:INFO|INF|INFORMATION|NOTICE)\b/,
    /[[<](?:info|information)[\]>]/i,
  ] },
  { level: 'debug', res: [
    /\b(?:DEBUG|DBG|TRACE|TRC|VERBOSE|VRB)\b/,
    /[[<](?:debug|trace|verbose)[\]>]/i,
  ] },
]

/**
 * Nivel explícito de una línea: el primer token de nivel que aparece (el más a la
 * izquierda gana; ante empate, el más grave). null si la línea no declara nivel.
 */
export function parseLogLevel(text: string): LevelMatch | null {
  let best: LevelMatch | null = null
  for (const { level, res } of LEVEL_PATTERNS) {
    for (const re of res) {
      const m = re.exec(text)
      if (m && (best === null || m.index < best.from)) best = { level, from: m.index, to: m.index + m[0].length }
    }
  }
  return best
}

const TIMESTAMP_RE = /\d{4}[-/.]\d{2}[-/.]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,7})?(?:Z|[+-]\d{2}:?\d{2})?|\d{2}[-/.]\d{2}[-/.]\d{4}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,7})?|\b\d{2}:\d{2}:\d{2}(?:[.,]\d{1,7})?\b/

/** Primer timestamp de la línea (offsets dentro de la línea) */
export function findTimestamp(text: string): { from: number; to: number } | null {
  const m = TIMESTAMP_RE.exec(text)
  return m ? { from: m.index, to: m.index + m[0].length } : null
}

const STACK_RE = /^\s+(?:at|en)\s+\S|^\s*--- (?:End of|Fin del)|^\s*(?:Caused by:|--->)|^\s+\.\.\. \d+ more/

/** Línea de stack trace: "   at Foo.Bar()" (inglés), "   en Foo.Bar()" (.NET en español), Java "Caused by:" */
export function isStackTraceLine(text: string): boolean {
  return STACK_RE.test(text)
}

/**
 * Nivel efectivo de cada línea: el explícito, o el de la entrada anterior cuando la
 * línea es continuación (stack trace, indentada o vacía). Así "Errores" muestra la
 * excepción completa y no sólo la primera línea.
 */
export function effectiveLevels(lines: Iterable<string>): (LogLevel | null)[] {
  const out: (LogLevel | null)[] = []
  let prev: LogLevel | null = null
  for (const text of lines) {
    const explicit = parseLogLevel(text)?.level ?? null
    let lvl: LogLevel | null
    if (explicit) lvl = explicit
    else if (isStackTraceLine(text) || /^\s/.test(text) || text === '') lvl = prev
    else lvl = null
    out.push(lvl)
    prev = lvl
  }
  return out
}

function levelPasses(level: LogLevel | null, filter: LogLevelFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'errors') return level === 'error'
  return level === 'error' || level === 'warn'
}

/**
 * Rangos de líneas a ocultar (1-based, inclusivos, ya fusionados) para un filtro.
 * Pensado para correr sobre el documento completo (50k líneas en pocos ms).
 */
export function computeHiddenLineRanges(lines: Iterable<string>, view: LogViewState): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  if (!isLogViewFiltered(view)) return ranges
  const needle = view.text.trim().toLowerCase()
  const needLevels = view.level !== 'all'
  let prev: LogLevel | null = null
  let n = 0
  let start = 0
  for (const text of lines) {
    n++
    let level: LogLevel | null = null
    if (needLevels) {
      const explicit = parseLogLevel(text)?.level ?? null
      level = explicit ?? ((isStackTraceLine(text) || /^\s/.test(text) || text === '') ? prev : null)
      prev = level
    }
    const visible = n >= view.fromLine
      && (!needLevels || levelPasses(level, view.level))
      && (!needle || text.toLowerCase().includes(needle))
    if (!visible) { if (!start) start = n }
    else if (start) { ranges.push([start, n - 1]); start = 0 }
  }
  if (start) ranges.push([start, n])
  return ranges
}

export interface LogCounts { errors: number; warnings: number }

/** Cuenta líneas con nivel explícito ERROR/WARN desde `fromLine` (1-based). */
export function countLogLevels(content: string, fromLine = 1): LogCounts {
  let errors = 0, warnings = 0, n = 0, pos = 0
  while (pos <= content.length) {
    const nl = content.indexOf('\n', pos)
    const end = nl === -1 ? content.length : nl
    n++
    if (n >= fromLine) {
      const lvl = parseLogLevel(content.slice(pos, end))?.level
      if (lvl === 'error') errors++
      else if (lvl === 'warn') warnings++
    }
    if (nl === -1) break
    pos = nl + 1
  }
  return { errors, warnings }
}

/** Línea desde la que arranca "Limpiar vista": la próxima que se escriba. */
export function lineAfterEnd(content: string): number {
  const lines = content.split('\n')
  return lines[lines.length - 1] === '' ? lines.length : lines.length + 1
}

/**
 * ¿El archivo se trata como log? Extensión .log/.out, nombre con "log"/"trace" como
 * palabra (CASHIER_log.txt, app-trace.txt — no "catalog.json"), .txt con fecha AAAAMMDD
 * en el nombre (CASHIER_20260928_USUARIO.txt), o monitoreo activo.
 */
export function isLogFile(name: string, language: string, watchActive: boolean): boolean {
  if (watchActive) return true
  if (language === 'log') return true
  if (language !== 'text') return false
  const base = name.replace(/\.[^.]+$/, '')
  if (/(^|[^a-z])(logs?|trace)([^a-z]|$)/i.test(base)) return true
  // Logs diarios de Wigos: CASHIER_20260928_USUARIO.txt, Wigos.Components.X_20260804_USUARIO.txt
  return /(^|[_.-])(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([_.-]|$)/.test(base)
}
