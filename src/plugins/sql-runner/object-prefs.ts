import { useSyncExternalStore } from 'react'
import type { SqlObjectType } from './sql-meta'

/**
 * Preferencias de SQL que viven en el renderer (localStorage): objetos recientes y favoritos
 * por conexión y base, y el color propio de cada conexión. No van a main ni a los respaldos:
 * son ayudas de navegación, no datos.
 */
export interface ObjectRef { profileId: string; db: string; schema: string; name: string; type: SqlObjectType; at: number }

const RECENT_KEY = 'sql:recent-objects'
const FAV_KEY = 'sql:fav-objects'
const COLOR_KEY = 'sql:conn-colors'
const MAX_RECENT = 40

const listeners = new Set<() => void>()
let version = 0
function bump(): void { version++; for (const l of listeners) l() }
const subscribe = (cb: () => void): (() => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
/** Re-render cuando cambian recientes, favoritos o colores. */
export function useObjectPrefs(): number { return useSyncExternalStore(subscribe, () => version, () => 0) }

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* nada */ }
  bump()
}

export const sameObject = (a: Pick<ObjectRef, 'profileId' | 'db' | 'schema' | 'name'>, b: Pick<ObjectRef, 'profileId' | 'db' | 'schema' | 'name'>): boolean =>
  a.profileId === b.profileId && a.db.toLowerCase() === b.db.toLowerCase() && a.schema.toLowerCase() === b.schema.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase()

/** Agregar arriba de la lista sin repetir; se queda con los últimos `max`. */
export function pushRecent(list: ObjectRef[], ref: ObjectRef, max = MAX_RECENT): ObjectRef[] {
  return [ref, ...list.filter((x) => !sameObject(x, ref))].slice(0, max)
}

export function recordRecent(ref: Omit<ObjectRef, 'at'>, now = Date.now()): void {
  write(RECENT_KEY, pushRecent(read<ObjectRef[]>(RECENT_KEY, []), { ...ref, at: now }))
}
export function recentFor(profileId: string, db: string, max = 6): ObjectRef[] {
  return read<ObjectRef[]>(RECENT_KEY, []).filter((x) => x.profileId === profileId && x.db.toLowerCase() === db.toLowerCase()).slice(0, max)
}

export function favoritesFor(profileId: string, db: string): ObjectRef[] {
  return read<ObjectRef[]>(FAV_KEY, []).filter((x) => x.profileId === profileId && x.db.toLowerCase() === db.toLowerCase())
}
export function isFavorite(ref: Pick<ObjectRef, 'profileId' | 'db' | 'schema' | 'name'>): boolean {
  return read<ObjectRef[]>(FAV_KEY, []).some((x) => sameObject(x, ref))
}
export function toggleFavorite(ref: Omit<ObjectRef, 'at'>, now = Date.now()): boolean {
  const list = read<ObjectRef[]>(FAV_KEY, [])
  const on = list.some((x) => sameObject(x, ref))
  write(FAV_KEY, on ? list.filter((x) => !sameObject(x, ref)) : [...list, { ...ref, at: now }])
  return !on
}

/** Colores para marcar conexiones (además del color del ambiente). */
export const CONN_COLORS = ['#3B82F6', '#14B8A6', '#22C55E', '#EAB308', '#F97316', '#EF4444', '#EC4899', '#8B5CF6'] as const
/**
 * Copia en memoria de los colores: connColor se llama varias veces por pestaña en cada
 * render, y leer y parsear localStorage cada vez se nota. Se invalida al cambiar un color
 * acá o en otra ventana (evento storage).
 */
let colors: Record<string, string> | null = null
const colorMap = (): Record<string, string> => (colors ??= read<Record<string, string>>(COLOR_KEY, {}))
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === COLOR_KEY || e.key === null) { colors = null; bump() } })
}
export function connColor(profileId: string | null | undefined): string | null {
  if (!profileId) return null
  return colorMap()[profileId] ?? null
}
export function setConnColor(profileId: string, color: string | null): void {
  const all = { ...colorMap() }
  if (color) all[profileId] = color; else delete all[profileId]
  colors = all
  write(COLOR_KEY, all)
}

/**
 * Orden para "Ir a objeto": primero el nombre exacto, después los que empiezan igual, después
 * los que lo contienen; con varias palabras, tienen que estar todas (en el nombre, el esquema o
 * la base). A igual puntaje, la base actual primero y los nombres más cortos.
 */
export function rankObjects<T extends { schema: string; name: string; db: string }>(items: T[], query: string, currentDb = '', max = 60): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored: { it: T; s: number }[] = []
  for (const it of items) {
    const name = it.name.toLowerCase()
    const hay = `${it.schema}.${it.name} ${it.db}`.toLowerCase()
    if (!words.every((w) => hay.includes(w))) continue
    const w = words[0]!
    let s = name === w ? 0 : name.startsWith(w) ? 1 : name.includes(w) ? 2 : 3
    if (it.db.toLowerCase() !== currentDb.toLowerCase()) s += 0.5
    scored.push({ it, s })
  }
  return scored.sort((a, b) => a.s - b.s || a.it.name.length - b.it.name.length || a.it.name.localeCompare(b.it.name)).slice(0, max).map((x) => x.it)
}
