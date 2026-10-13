/** Pure helpers for the Notes plugin (no Electron / fs imports — unit tested). */

const ID_RE = /^[\w\- .]+\.md$/

/** A note id is a bare .md filename: no separators, no traversal, no leading dot. */
export function isValidNoteId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  if (id.length < 4 || id.length > 200) return false
  if (!ID_RE.test(id)) return false
  if (id.startsWith('.') || id.includes('..')) return false
  if (id.trim() !== id) return false
  return true
}

export function assertNoteId(id: unknown): string {
  if (!isValidNoteId(id)) throw new Error('Id de nota inválido')
  return id
}

function firstLine(content: string): string {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (line) return line
  }
  return ''
}

/** Title = first non-empty line, without leading markdown heading marks. */
export function extractTitle(content: string, fallback = 'Sin título'): string {
  const line = firstLine(content).replace(/^#+\s*/, '').trim()
  return (line || fallback).slice(0, 120)
}

/** One-line preview: text after the title line, collapsed whitespace. */
export function extractPreview(content: string, max = 140): string {
  const lines = content.split(/\r?\n/)
  let seenTitle = false
  const rest: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!seenTitle) { if (line) seenTitle = true; continue }
    if (line) rest.push(line.replace(/^#+\s*|^[-*+]\s+(\[[ xX]\]\s+)?|^>\s*/g, ''))
    if (rest.join(' ').length > max) break
  }
  return rest.join(' ').replace(/\s+/g, ' ').slice(0, max)
}

/** Filesystem-safe base name derived from a title (accents stripped so it fits the id rule). */
export function slugifyTitle(title: string): string {
  return title
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^\w\- .]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .slice(0, 60)
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function dateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function defaultNoteBase(d: Date): string {
  return `Nota ${dateStamp(d)} ${pad(d.getHours())}${pad(d.getMinutes())}`
}

/**
 * Pick a filename for a new note: slug of its title, or "Nota YYYY-MM-DD HHmm".
 * Appends " 2", " 3"… until it doesn't collide (case-insensitive) with `existing`.
 */
export function uniqueNoteFilename(content: string, existing: Iterable<string>, now = new Date()): string {
  const taken = new Set([...existing].map((e) => e.toLowerCase()))
  const title = extractTitle(content, '')
  let base = title ? slugifyTitle(title) : ''
  if (!base) base = defaultNoteBase(now)
  let candidate = `${base}.md`
  for (let i = 2; taken.has(candidate.toLowerCase()) || !isValidNoteId(candidate); i++) {
    if (i > 999) { candidate = `${defaultNoteBase(now)} ${Date.now()}.md`; break }
    candidate = `${base} ${i}.md`
    if (!isValidNoteId(candidate)) base = defaultNoteBase(now)
  }
  return candidate
}

/** Sort pinned first, then most recently updated. */
export function sortNotes<T extends { pinned: boolean; updatedAt: number }>(notes: T[]): T[] {
  return [...notes].sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1))
}

/** Quita bloques ``` y `código en línea` (ahí un [[x]] o #x no es enlace ni etiqueta). */
function stripCode(content: string): string {
  return content.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

/** Títulos enlazados con [[Título]] o [[Título|texto]], sin repetir (respeta el primero). */
export function extractLinks(content: string): string[] {
  const seen = new Map<string, string>()
  for (const m of stripCode(content).matchAll(/\[\[([^[\]\n|]{1,120})(?:\|[^[\]\n]*)?\]\]/g)) {
    const title = m[1]!.trim()
    if (title && !seen.has(title.toLowerCase())) seen.set(title.toLowerCase(), title)
  }
  return [...seen.values()]
}

/** Etiquetas #así (en minúsculas). No cuenta títulos markdown ("# x"), colores hex ni anclas de URL. */
export function extractTags(content: string): string[] {
  const out = new Set<string>()
  for (const m of stripCode(content).matchAll(/(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_/-]{0,39})/gu)) {
    const tag = m[2]!.replace(/[/-]+$/, '').toLowerCase()
    if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(tag) || /^\d+$/.test(tag)) continue
    out.add(tag)
  }
  return [...out]
}
