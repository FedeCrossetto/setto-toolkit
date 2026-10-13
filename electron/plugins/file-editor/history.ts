/**
 * Historial local de versiones del editor.
 *
 * En cada guardado exitoso se guarda una copia de lo que había ANTES en disco
 * (bytes crudos, así conserva codificación y fin de línea) en:
 *
 *   <base>/<sha1(ruta)>/<id>.snap   +   <base>/<sha1(ruta)>/index.json
 *
 * Límites: últimas MAX_PER_FILE versiones por archivo y MAX_TOTAL_BYTES en total
 * (se borran las más viejas de cualquier archivo). Los autoguardados se agrupan:
 * si la última versión tiene menos de AUTOSAVE_COALESCE_MS no se crea otra.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { HistoryEntry } from '../../../src/plugins/file-editor/types'

export const MAX_PER_FILE = 50
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024
export const AUTOSAVE_COALESCE_MS = 60_000

interface HistoryIndex { path: string; entries: HistoryEntry[] }

export function historyKey(filePath: string): string {
  // Windows paths are case-insensitive — normalize so C:\A and c:\a share history.
  const norm = process.platform === 'win32' ? filePath.toLowerCase() : filePath
  return crypto.createHash('sha1').update(norm).digest('hex')
}

function dirFor(base: string, filePath: string): string {
  return path.join(base, historyKey(filePath))
}

function readIndex(dir: string): HistoryIndex | null {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as HistoryIndex } catch { return null }
}

function writeIndex(dir: string, index: HistoryIndex): void {
  const p = path.join(dir, 'index.json')
  const tmp = `${p}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(index))
  fs.renameSync(tmp, p)
}

function snapPath(dir: string, id: string): string {
  // ids are numeric strings we generated — reject anything else (path traversal)
  if (!/^\d+$/.test(id)) throw new Error('Versión inválida')
  return path.join(dir, `${id}.snap`)
}

/**
 * Guarda `previous` (bytes que había en disco antes del guardado) como nueva versión.
 * Devuelve la entrada creada, o null si se omitió (vacío, igual a la última, o agrupado).
 */
export function addSnapshot(
  base: string, filePath: string, previous: Buffer,
  opts: { now?: number; autosave?: boolean } = {},
): HistoryEntry | null {
  const now = opts.now ?? Date.now()
  const dir = dirFor(base, filePath)
  const index = readIndex(dir) ?? { path: filePath, entries: [] }
  const last = index.entries[index.entries.length - 1]

  if (last) {
    if (opts.autosave && now - last.ts < AUTOSAVE_COALESCE_MS) return null
    if (last.size === previous.length) {
      try { if (fs.readFileSync(snapPath(dir, last.id)).equals(previous)) return null } catch { /* snapshot missing → write a new one */ }
    }
  }

  fs.mkdirSync(dir, { recursive: true })
  let ts = now
  while (index.entries.some((e) => e.id === String(ts))) ts++
  const entry: HistoryEntry = { id: String(ts), ts, size: previous.length }
  fs.writeFileSync(snapPath(dir, entry.id), previous)
  index.path = filePath
  index.entries.push(entry)

  // Per-file cap
  while (index.entries.length > MAX_PER_FILE) {
    const old = index.entries.shift()!
    try { fs.unlinkSync(snapPath(dir, old.id)) } catch { /* already gone */ }
  }
  writeIndex(dir, index)
  pruneTotal(base)
  return entry
}

/** Borra las versiones más viejas (de cualquier archivo) hasta quedar bajo `maxBytes`. */
export function pruneTotal(base: string, maxBytes = MAX_TOTAL_BYTES): void {
  let dirs: string[]
  try { dirs = fs.readdirSync(base) } catch { return }
  const all: Array<{ dir: string; entry: HistoryEntry }> = []
  const indexes = new Map<string, HistoryIndex>()
  let total = 0
  for (const d of dirs) {
    const dir = path.join(base, d)
    const idx = readIndex(dir)
    if (!idx) continue
    indexes.set(dir, idx)
    for (const e of idx.entries) { all.push({ dir, entry: e }); total += e.size }
  }
  if (total <= maxBytes) return
  all.sort((a, b) => a.entry.ts - b.entry.ts)
  const touched = new Set<string>()
  for (const { dir, entry } of all) {
    if (total <= maxBytes) break
    try { fs.unlinkSync(snapPath(dir, entry.id)) } catch { /* ignore */ }
    const idx = indexes.get(dir)!
    idx.entries = idx.entries.filter((e) => e.id !== entry.id)
    total -= entry.size
    touched.add(dir)
  }
  for (const dir of touched) {
    const idx = indexes.get(dir)!
    if (idx.entries.length === 0) fs.rmSync(dir, { recursive: true, force: true })
    else writeIndex(dir, idx)
  }
}

/** Versiones de un archivo, la más nueva primero. */
export function listSnapshots(base: string, filePath: string): HistoryEntry[] {
  const idx = readIndex(dirFor(base, filePath))
  return idx ? [...idx.entries].reverse() : []
}

export function readSnapshot(base: string, filePath: string, id: string): Buffer {
  const dir = dirFor(base, filePath)
  const idx = readIndex(dir)
  if (!idx?.entries.some((e) => e.id === id)) throw new Error('La versión ya no existe en el historial')
  return fs.readFileSync(snapPath(dir, id))
}

/**
 * Diferencia aproximada de líneas entre dos textos (multiconjunto, O(n)):
 * `added` = líneas de `to` que no estaban en `from`, `removed` = al revés.
 * No detecta movimientos, pero alcanza para un "+12 / −3" en la lista.
 */
export function lineDelta(from: string, to: string): { added: number; removed: number } {
  const counts = new Map<string, number>()
  for (const l of from.split('\n')) counts.set(l, (counts.get(l) ?? 0) + 1)
  let added = 0
  for (const l of to.split('\n')) {
    const c = counts.get(l) ?? 0
    if (c > 0) counts.set(l, c - 1)
    else added++
  }
  let removed = 0
  for (const c of counts.values()) removed += c
  return { added, removed }
}
