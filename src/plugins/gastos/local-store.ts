/**
 * Caché offline de Gastos. Vive en el main process (`<userData>/gastos-cache.json` +
 * `gastos-pending.json`) para que la app instalada (`file://`) y el dev server
 * (`localhost:5173`) vean los mismos datos; antes estaba en localStorage, que es por origen.
 *
 * - `loadLocalState()` migra una única vez lo que haya quedado en localStorage.
 * - Las preferencias chicas (presupuesto, último método) se espejan en memoria para lecturas
 *   síncronas desde los componentes.
 */
import type { GastosCacheData, GastosCachePatch, GastosCacheState, GastosPrefs, PendingWrite } from './types'
import { planLegacyMigration, type LegacyLocalState } from './cache-migration'

export type { PendingWrite } from './types'
export type CachedGastos = GastosCacheData

/** Claves legacy de localStorage (sólo para migrar). */
export const LEGACY_KEYS = {
  cache: 'gastos:cached-data',
  pending: 'gastos:pending-writes',
  lastSynced: 'gastos:last-synced-at',
  presupuesto: 'gastos:presupuesto',
  lastMetodo: 'gastos:last-metodo',
} as const

const EMPTY_STATE: GastosCacheState = { data: null, updatedAt: null, lastSynced: null, prefs: {} }

let prefsMirror: GastosPrefs = {}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* storage bloqueado */ }
}
function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function readLegacyLocalStorage(): LegacyLocalState {
  const cache = parseJson<Partial<GastosCacheData>>(safeGet(LEGACY_KEYS.cache))
  const pending = parseJson<unknown>(safeGet(LEGACY_KEYS.pending))
  const presu = Number(safeGet(LEGACY_KEYS.presupuesto))
  return {
    cache: cache && Array.isArray(cache.servicios) && Array.isArray(cache.pagos)
      ? { servicios: cache.servicios, pagos: cache.pagos, gastos: Array.isArray(cache.gastos) ? cache.gastos : [] }
      : null,
    pending: Array.isArray(pending) ? (pending as PendingWrite[]) : [],
    lastSynced: safeGet(LEGACY_KEYS.lastSynced),
    presupuesto: Number.isFinite(presu) && presu > 0 ? presu : null,
    lastMetodo: safeGet(LEGACY_KEYS.lastMetodo),
  }
}

function clearLegacyLocalStorage(): void {
  for (const k of Object.values(LEGACY_KEYS)) safeRemove(k)
}

async function getState(): Promise<GastosCacheState> {
  try {
    return (await window.api.invoke<GastosCacheState>('gastos:cache-get')) ?? EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

/** Estado local completo (con migración one-shot desde localStorage). */
export async function loadLocalState(): Promise<{ cache: GastosCacheState; pending: PendingWrite[] }> {
  let cache = await getState()
  let pending = await window.api.invoke<PendingWrite[]>('gastos:pending-get').catch(() => [] as PendingWrite[])
  const plan = planLegacyMigration(readLegacyLocalStorage(), { cache, pending })
  if (plan.hasLegacy) {
    try {
      if (plan.cachePatch) cache = await window.api.invoke<GastosCacheState>('gastos:cache-set', plan.cachePatch)
      if (plan.pending) {
        await window.api.invoke('gastos:pending-set', plan.pending)
        pending = plan.pending
      }
      clearLegacyLocalStorage()
    } catch { /* se reintenta la próxima vez; localStorage queda intacto */ }
  }
  prefsMirror = { ...cache.prefs }
  return { cache, pending }
}

/** Estado del caché (para `summary.ts` / `search.ts`), sin migración. */
export async function readCacheState(): Promise<GastosCacheState> {
  const s = await getState()
  prefsMirror = { ...s.prefs }
  return s
}

export async function readPendingWrites(): Promise<PendingWrite[]> {
  return window.api.invoke<PendingWrite[]>('gastos:pending-get').catch(() => [])
}

// Escrituras serializadas (una a la vez) para no pisar el archivo.
let chain: Promise<unknown> = Promise.resolve()
function enqueueIpc(fn: () => Promise<unknown>): Promise<void> {
  chain = chain.then(fn, fn).catch(() => { /* el caché es best-effort */ })
  return chain.then(() => undefined)
}

let patchTimer: ReturnType<typeof setTimeout> | null = null
let pendingPatch: GastosCachePatch = {}
function flushPatch(): Promise<void> {
  if (patchTimer) { clearTimeout(patchTimer); patchTimer = null }
  const patch = pendingPatch
  pendingPatch = {}
  if (!Object.keys(patch).length) return Promise.resolve()
  return enqueueIpc(() => window.api.invoke('gastos:cache-set', patch))
}
function schedule(): void {
  if (patchTimer) clearTimeout(patchTimer)
  patchTimer = setTimeout(() => { void flushPatch() }, 400)
}

/** Guarda datos (con debounce corto: la UI escribe varias veces seguidas). */
export function writeCache(data: GastosCacheData): void {
  pendingPatch = { ...pendingPatch, data: { servicios: data.servicios, pagos: data.pagos, gastos: data.gastos } }
  schedule()
}

export function writeLastSynced(v: string | null): void {
  pendingPatch = { ...pendingPatch, lastSynced: v }
  schedule()
}

export function writePendingWrites(q: PendingWrite[]): Promise<void> {
  return enqueueIpc(() => window.api.invoke('gastos:pending-set', q))
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => { void flushPatch() })
}

// ── Preferencias ─────────────────────────────────────────────────────────────

export function readPrefs(): GastosPrefs {
  return prefsMirror
}

export function writePrefs(p: GastosPrefs): void {
  prefsMirror = { ...prefsMirror, ...p }
  void enqueueIpc(() => window.api.invoke('gastos:cache-set', { prefs: p }))
}

export function readPresupuesto(): number | null {
  const n = prefsMirror.presupuesto
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}
export function writePresupuesto(v: number | null): void {
  writePrefs({ presupuesto: v && v > 0 ? v : null })
}

export function readLastMethod(): string | null {
  return prefsMirror.lastMetodo ?? null
}
export function writeLastMethod(m: string): void {
  if (prefsMirror.lastMetodo !== m) writePrefs({ lastMetodo: m })
}
