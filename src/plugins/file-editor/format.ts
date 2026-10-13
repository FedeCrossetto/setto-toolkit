/**
 * "Formatear documento" — formateadores puros y conservadores.
 *
 * - JSON: 2 espacios. Reescribe tokens tal cual (no pasa por JSON.parse, así no se
 *   pierden números grandes ni cambian escapes). Mantiene el salto final si existía.
 * - XML / HTML / .config / .csproj: re-indenta etiquetas; comentarios, CDATA,
 *   <?…?>, <!DOCTYPE> y el contenido de <pre>/<script>/<style>/<textarea> se dejan
 *   intactos. Usa la unidad de indentación que ya tenía el archivo (tab, 2 o 4).
 * - SQL: mayúsculas en palabras reservadas y salto de línea antes de las cláusulas
 *   principales (solo fuera de paréntesis). No toca strings, comentarios ni [ids].
 *
 * Todos lanzan FormatError con un mensaje en español si el texto no se puede formatear.
 */
import type { FileLanguage } from './types'

export class FormatError extends Error {
  constructor(message: string) { super(message); this.name = 'FormatError' }
}

export type FormatResult = { ok: true; text: string } | { ok: false; error: string }

export function isFormatSupported(lang: FileLanguage): boolean {
  return lang === 'json' || lang === 'xml' || lang === 'html' || lang === 'sql'
}

export function formatDocument(text: string, lang: FileLanguage): FormatResult {
  try {
    switch (lang) {
      case 'json': return { ok: true, text: formatJson(text) }
      case 'xml':  return { ok: true, text: formatXml(text, false) }
      case 'html': return { ok: true, text: formatXml(text, true) }
      case 'sql':  return { ok: true, text: formatSql(text) }
      default:     return { ok: false, error: 'Formatear no está disponible para este lenguaje' }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const trailingNewline = (src: string): string => (/\n\s*$/.test(src) ? '\n' : '')

function lineCol(text: string, pos: number): string {
  const before = text.slice(0, pos)
  const line = before.split('\n').length
  return `línea ${line}, columna ${pos - before.lastIndexOf('\n')}`
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function formatJson(src: string, indent = '  '): string {
  const text = src.replace(/^\uFEFF/, '')
  let i = 0
  const fail = (msg: string): never => { throw new FormatError(`JSON inválido: ${msg} (${lineCol(text, i)})`) }
  const ws = (): void => { while (i < text.length && /[ \t\r\n]/.test(text[i]!)) i++ }

  const value = (depth: number): string => {
    ws()
    const c = text[i]
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']'
      i++
      ws()
      if (text[i] === close) { i++; return c + close }
      const pad = indent.repeat(depth + 1)
      const items: string[] = []
      for (;;) {
        ws()
        let item = ''
        if (c === '{') {
          if (text[i] !== '"') fail('se esperaba una clave entre comillas')
          item = str() + ': '
          ws()
          if (text[i] !== ':') fail('se esperaba ":"')
          i++
        }
        item += value(depth + 1)
        items.push(pad + item)
        ws()
        if (text[i] === ',') { i++; continue }
        if (text[i] === close) { i++; break }
        fail(`se esperaba "," o "${close}"`)
      }
      return `${c}\n${items.join(',\n')}\n${indent.repeat(depth)}${close}`
    }
    if (c === '"') return str()
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 400))
    if (!m) fail(c === undefined ? 'fin inesperado' : `carácter inesperado "${c}"`)
    i += m![0].length
    return m![0]
  }

  const str = (): string => {
    const start = i
    i++
    while (i < text.length) {
      const ch = text[i]!
      if (ch === '\\') { i += 2; continue }
      if (ch === '"') { i++; return text.slice(start, i) }
      if (ch === '\n') break
      i++
    }
    i = start
    return fail('string sin cerrar')
  }

  const out = value(0)
  ws()
  if (i < text.length) fail('contenido extra después del valor')
  return out + trailingNewline(src)
}

// ── XML / HTML ───────────────────────────────────────────────────────────────

const HTML_VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const HTML_RAW = new Set(['pre', 'script', 'style', 'textarea'])

type XmlToken =
  | { kind: 'open'; name: string; raw: string; selfClose: boolean }
  | { kind: 'close'; name: string; raw: string }
  | { kind: 'verbatim'; raw: string }   // comment, CDATA, <?pi?>, <!DOCTYPE>
  | { kind: 'text'; raw: string }

/** Detecta la unidad de indentación existente: tab, o el menor salto de espacios (2/4). */
export function detectIndentUnit(text: string): string {
  let min = 0
  for (const line of text.split('\n')) {
    const m = /^([ \t]+)\S/.exec(line)
    if (!m) continue
    if (m[1]!.startsWith('\t')) return '\t'
    const n = m[1]!.length
    if (n >= 2 && (min === 0 || n < min)) min = n
  }
  return min === 4 ? '    ' : '  '
}

function tokenizeXml(text: string, html: boolean): XmlToken[] {
  const tokens: XmlToken[] = []
  let i = 0
  const verbatimUntil = (end: string, what: string): void => {
    const j = text.indexOf(end, i)
    if (j === -1) throw new FormatError(`${what} sin cerrar (${lineCol(text, i)})`)
    tokens.push({ kind: 'verbatim', raw: text.slice(i, j + end.length) })
    i = j + end.length
  }
  while (i < text.length) {
    if (text[i] !== '<') {
      const j = text.indexOf('<', i)
      const end = j === -1 ? text.length : j
      tokens.push({ kind: 'text', raw: text.slice(i, end) })
      i = end
      continue
    }
    if (text.startsWith('<!--', i)) { verbatimUntil('-->', 'Comentario'); continue }
    if (text.startsWith('<![CDATA[', i)) { verbatimUntil(']]>', 'CDATA'); continue }
    if (text.startsWith('<?', i)) { verbatimUntil('?>', 'Instrucción <?…?>'); continue }
    if (text.startsWith('<!', i)) { verbatimUntil('>', 'Declaración <!…>'); continue }
    // Regular tag — scan to '>' outside quotes
    let j = i + 1, quote = ''
    for (; j < text.length; j++) {
      const ch = text[j]!
      if (quote) { if (ch === quote) quote = '' }
      else if (ch === '"' || ch === "'") quote = ch
      else if (ch === '>') break
    }
    if (j >= text.length) throw new FormatError(`Etiqueta sin cerrar (${lineCol(text, i)})`)
    const raw = text.slice(i, j + 1)
    const m = /^<\/?\s*([^\s/>]+)/.exec(raw)
    if (!m) throw new FormatError(`Etiqueta inválida (${lineCol(text, i)})`)
    const name = m[1]!
    const lname = html ? name.toLowerCase() : name
    i = j + 1
    if (raw.startsWith('</')) { tokens.push({ kind: 'close', name: lname, raw }); continue }
    const selfClose = /\/\s*>$/.test(raw) || (html && HTML_VOID.has(lname))
    tokens.push({ kind: 'open', name: lname, raw, selfClose })
    // Raw-content elements (HTML): keep everything up to the closing tag untouched
    if (html && !selfClose && HTML_RAW.has(lname)) {
      const closeRe = new RegExp(`</\\s*${lname}\\s*>`, 'i')
      const rest = text.slice(i)
      const cm = closeRe.exec(rest)
      if (!cm) throw new FormatError(`<${name}> sin cerrar`)
      if (cm.index > 0) tokens.push({ kind: 'verbatim', raw: rest.slice(0, cm.index) })
      tokens.push({ kind: 'close', name: lname, raw: cm[0] })
      i += cm.index + cm[0].length
    }
  }
  return tokens
}

export function formatXml(src: string, html = false): string {
  const text = src.replace(/^\uFEFF/, '')
  const unit = detectIndentUnit(text)
  const tokens = tokenizeXml(text, html)
  const out: string[] = []
  const stack: string[] = []
  const pad = (): string => unit.repeat(stack.length)

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!
    if (t.kind === 'text') {
      const trimmed = t.raw.trim()
      if (!trimmed) continue
      // Keep multi-line text verbatim (only its outer whitespace is dropped)
      out.push(pad() + trimmed)
      continue
    }
    if (t.kind === 'verbatim') {
      const parent = stack[stack.length - 1]
      // Raw element content (<pre>, <script>…) goes back exactly as it was, glued to its tags
      if (html && parent && HTML_RAW.has(parent) && out.length) { out[out.length - 1] += t.raw; continue }
      out.push(pad() + t.raw.trim())
      continue
    }
    if (t.kind === 'open') {
      if (t.selfClose) { out.push(pad() + t.raw); continue }
      // <a>short text</a> stays on one line
      const next = tokens[k + 1], after = tokens[k + 2]
      if (next?.kind === 'text' && !next.raw.includes('\n') && after?.kind === 'close' && after.name === t.name) {
        out.push(pad() + t.raw + next.raw.trim() + after.raw)
        k += 2
        continue
      }
      if (next?.kind === 'close' && next.name === t.name) { out.push(pad() + t.raw + next.raw); k += 1; continue }
      out.push(pad() + t.raw)
      stack.push(t.name)
      continue
    }
    // close
    const idx = stack.lastIndexOf(t.name)
    if (idx === -1) {
      if (html) { out.push(pad() + t.raw); continue }  // stray closing tag: leave it
      throw new FormatError(`Etiqueta de cierre </${t.name}> sin apertura`)
    }
    if (idx !== stack.length - 1 && !html) {
      throw new FormatError(`Se esperaba </${stack[stack.length - 1]}> pero se encontró </${t.name}>`)
    }
    const wasRaw = html && HTML_RAW.has(t.name)
    stack.length = idx
    if (wasRaw && out.length) out[out.length - 1] += t.raw
    else out.push(pad() + t.raw)
  }
  if (stack.length && !html) throw new FormatError(`Falta cerrar <${stack[stack.length - 1]}>`)
  return out.join('\n') + trailingNewline(src)
}

// ── SQL ──────────────────────────────────────────────────────────────────────

/** Palabras reservadas (no pueden ser identificadores sin corchetes → es seguro pasarlas a mayúsculas). */
const SQL_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'begin', 'between', 'by', 'case', 'check', 'close',
  'coalesce', 'column', 'commit', 'constraint', 'convert', 'create', 'cross', 'cursor', 'deallocate',
  'declare', 'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'exec', 'execute', 'exists',
  'fetch', 'for', 'foreign', 'from', 'full', 'function', 'goto', 'grant', 'group', 'having', 'identity',
  'if', 'in', 'index', 'inner', 'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like',
  'merge', 'not', 'null', 'nullif', 'of', 'off', 'on', 'open', 'option', 'or', 'order', 'outer', 'over',
  'percent', 'primary', 'print', 'proc', 'procedure', 'references', 'return', 'revoke', 'right',
  'rollback', 'select', 'set', 'table', 'then', 'top', 'tran', 'transaction', 'trigger', 'truncate',
  'union', 'unique', 'update', 'use', 'values', 'view', 'when', 'where', 'while', 'with', 'except',
])

/** Cláusulas que arrancan en una línea nueva (fuera de paréntesis). */
const SQL_BREAK_BEFORE = new Set([
  'select', 'from', 'where', 'group', 'order', 'having', 'union', 'except', 'intersect',
  'insert', 'values', 'update', 'set', 'delete', 'join', 'inner', 'left', 'right', 'full', 'cross',
])

export function formatSql(src: string): string {
  const out: string[] = []
  let cur = ''          // text of the current output line (for indent / line-start checks)
  let i = 0, depth = 0
  let prevKw = ''       // previous word if it was a keyword (lowercase), else ''
  let prevAny = ''      // previous word of any kind (lowercase)
  let prevChar = ''     // previous non-space, non-comment char emitted
  const text = src

  const emit = (s: string): void => {
    out.push(s)
    const nl = s.lastIndexOf('\n')
    cur = nl === -1 ? cur + s : s.slice(nl + 1)
    const t = s.trim()
    if (t) prevChar = t[t.length - 1]!
  }

  while (i < text.length) {
    const ch = text[i]!
    // Comments (kept verbatim, don't affect clause context)
    if (text.startsWith('--', i)) { const j = text.indexOf('\n', i); const end = j === -1 ? text.length : j; out.push(text.slice(i, end)); cur += text.slice(i, end); i = end; continue }
    if (text.startsWith('/*', i)) { const j = text.indexOf('*/', i + 2); const end = j === -1 ? text.length : j + 2; emit(text.slice(i, end)); i = end; continue }
    // Strings ('' escape), N'…'
    if (ch === "'" || ((ch === 'N' || ch === 'n') && text[i + 1] === "'")) {
      let j = ch === "'" ? i + 1 : i + 2
      for (; j < text.length; j++) { if (text[j] === "'") { if (text[j + 1] === "'") { j++; continue } break } }
      emit(text.slice(i, j + 1)); i = j + 1; prevKw = ''; prevAny = ''; continue
    }
    // Quoted identifiers
    if (ch === '[' || ch === '"' || ch === '`') {
      const close = ch === '[' ? ']' : ch
      const j = text.indexOf(close, i + 1)
      const end = j === -1 ? text.length : j + 1
      emit(text.slice(i, end)); i = end; prevKw = ''; prevAny = ''; continue
    }
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    const wm = /^[A-Za-z_][A-Za-z0-9_$#@]*/.exec(text.slice(i, i + 256))
    if (wm) {
      const word = wm[0]
      const lower = word.toLowerCase()
      const before = text[i - 1]
      const qualified = before === '.' || before === '@' || before === '#' || before === '$'
      const isKw = !qualified && SQL_KEYWORDS.has(lower)
      if (isKw && depth === 0 && SQL_BREAK_BEFORE.has(lower) && cur.trim() !== ''
          && shouldBreak(lower, prevKw, prevAny, prevChar, text.slice(i + word.length).trimStart()[0])) {
        // Trailing spaces become a newline at the current line's indentation
        while (out.length && /^[ \t]+$/.test(out[out.length - 1]!)) out.pop()
        emit('\n' + /^[ \t]*/.exec(cur)![0])
      }
      emit(isKw ? word.toUpperCase() : word)
      prevKw = isKw ? lower : ''
      prevAny = qualified ? '' : lower
      i += word.length
      continue
    }
    const sm = /^[ \t]+/.exec(text.slice(i, i + 256))
    if (sm) { emit(sm[0]); i += sm[0].length; continue }
    if (ch !== '\n' && ch !== '\r') { prevKw = ''; prevAny = '' }
    emit(ch)
    i++
  }
  return out.join('')
}

/** Decide si una cláusula va en línea nueva según lo que la precede (evita romper ON DELETE, AFTER INSERT, LEFT(…), etc.). */
function shouldBreak(word: string, prevKw: string, prevAny: string, prevChar: string, nextChar: string | undefined): boolean {
  if (['grant', 'revoke', 'deny'].includes(prevAny)) return false
  switch (word) {
    case 'join':   return !['inner', 'left', 'right', 'full', 'cross', 'outer'].includes(prevKw)
    case 'from':   return prevKw !== 'delete'
    case 'left':
    case 'right':  return nextChar !== '('        // LEFT(col, 3) is a function
    case 'values': return prevKw !== 'default'
    case 'insert':
    case 'update':
    case 'delete':
      // ON DELETE CASCADE, AFTER INSERT, UPDATE, FOR UPDATE, INSTEAD OF DELETE…
      return prevChar !== ',' && !['on', 'after', 'for', 'of', 'instead'].includes(prevAny)
    case 'set':    return !['delete', 'update'].includes(prevKw)   // ON DELETE SET NULL
    default:       return true
  }
}
