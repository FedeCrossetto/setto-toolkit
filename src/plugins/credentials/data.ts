import { matchesQuery, normalize } from '../../core/search'
import type {
  Credential, CopyResult, CredentialDraft, CredentialsListResult, ImportPreview, LockStatus, PasswordAudit,
  PinVerifyResult, SaveResult, SecretResult,
} from './types'
import { usageScore } from './usage'

export const CLIPBOARD_CLEAR_MS = 30_000

// ── IPC (credentials:* in electron/plugins/credentials/handlers.ts) ──────────

const TTL_MS = 60_000
let cache: { at: number; result: CredentialsListResult } | null = null

/** List with sync status. Never throws for network problems: main falls back to its local copy. */
export async function loadCredentialList(force = false): Promise<CredentialsListResult> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.result
  const result = await window.api.invoke<CredentialsListResult>('credentials:list')
  cache = { at: Date.now(), result }
  return result
}

/** Instant answer from main's local copy (no network). Not cached here. */
export async function loadLocalCredentialList(): Promise<CredentialsListResult> {
  return window.api.invoke<CredentialsListResult>('credentials:list', { localOnly: true })
}

/** Items only (Ctrl+K provider). Metadata, no passwords; never waits on the network. */
export async function loadCredentials(): Promise<Credential[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.result.items
  return (await loadLocalCredentialList()).items
}

export function invalidateCredentials(): void {
  cache = null
}

export const credentialsApi = {
  save: (draft: CredentialDraft) => window.api.invoke<SaveResult>('credentials:save', draft),
  remove: (id: string) => window.api.invoke<SaveResult>('credentials:delete', id),
  toggleFavorite: (id: string) => window.api.invoke<string[]>('credentials:toggle-favorite', id),
  markUsed: (id: string) => window.api.invoke<number>('credentials:mark-used', id),
  /** Copies in main (30 s auto-clear). `{ ok:false, locked:true }` when the PIN lock is on. */
  copyPassword: (id: string) => window.api.invoke<CopyResult>('credentials:copy-password', id),
  copyUsername: (id: string) => window.api.invoke<CopyResult>('credentials:copy-username', id),
  /** Most used first (favorites on top), local only. */
  top: (limit = 8) => window.api.invoke<Credential[]>('credentials:top', limit),
  reveal: (id: string) => window.api.invoke<SecretResult<{ password: string }>>('credentials:reveal', id),
  audit: () => window.api.invoke<PasswordAudit>('credentials:password-audit'),
  checkReuse: (password: string, excludeId?: string) => window.api.invoke<string[]>('credentials:check-reuse', password, excludeId),
  lockStatus: () => window.api.invoke<LockStatus>('credentials:lock-status'),
  lock: () => window.api.invoke<LockStatus>('credentials:lock'),
  verifyPin: (pin: string) => window.api.invoke<PinVerifyResult>('credentials:pin-verify', pin),
  setPin: (payload: { pin?: string | null; currentPin?: string; minutes?: number }) => window.api.invoke<LockStatus>('credentials:pin-set', payload),
  importPick: () => window.api.invoke<ImportPreview | { canceled: true } | { error: string }>('credentials:import-pick'),
  importCommit: (token: string, indexes: number[]) => window.api.invoke<{ imported: number; queued: number }>('credentials:import-commit', token, indexes),
  importCancel: () => window.api.invoke<void>('credentials:import-cancel'),
  exportCsv: () => window.api.invoke<SecretResult<{ canceled?: boolean; filePath?: string; count?: number }>>('credentials:export-csv'),
}

/**
 * Copy a value to the clipboard. With `autoClear` the clipboard is wiped after
 * 30 s if it still contains that value (done in main; falls back to the renderer).
 */
export async function copyToClipboard(text: string, autoClear = false): Promise<void> {
  if (autoClear) {
    try {
      await window.api.invoke('credentials:copy-secret', text, CLIPBOARD_CLEAR_MS)
      return
    } catch { /* canal no disponible: fallback */ }
    await navigator.clipboard.writeText(text)
    setTimeout(() => {
      navigator.clipboard.readText()
        .then((cur) => (cur === text ? navigator.clipboard.writeText('') : undefined))
        .catch(() => undefined)
    }, CLIPBOARD_CLEAR_MS)
    return
  }
  await navigator.clipboard.writeText(text)
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

type Searchable = Pick<Credential, 'nombre' | 'usuario' | 'url' | 'categoria'>

/** Search over name, user, url and category — never the password or notes. */
export function filterCredentials<T extends Searchable>(items: T[], query: string): T[] {
  const q = query.trim()
  if (!q) return items
  return items.filter((c) => matchesQuery(q, c.nombre, c.usuario, c.url, c.categoria))
}

/**
 * Palette ranking: name prefix > name contains > other fields; within the same
 * tier, the most used first (`usageScore`, capped so usage never beats a better match).
 */
export function rankCredentials<T extends Searchable & { useCount?: number; lastUsedAt?: number }>(
  items: T[], query: string, max = 6, now = Date.now(),
): { item: T; score: number }[] {
  const q = normalize(query.trim())
  return filterCredentials(items, query)
    .map((c) => {
      const name = normalize(c.nombre)
      const match = name.startsWith(q) ? 20 : name.includes(q) ? 10 : 0
      const usage = Math.min(9, usageScore(c.useCount, c.lastUsedAt, now))
      return { item: c, score: match + usage }
    })
    .sort((a, b) => b.score - a.score || a.item.nombre.localeCompare(b.item.nombre))
    .slice(0, max)
}

export interface CredentialGroup<T = Credential> { key: string; items: T[] }

const NO_CATEGORY = 'Sin categoría'

/** Group by category when at least one has it; otherwise alphabetically (A–Z, "#" for the rest). */
export function groupCredentials<T extends Searchable>(items: T[]): CredentialGroup<T>[] {
  const byName = (a: T, b: T): number => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  const useCategory = items.some((c) => c.categoria?.trim())
  const keyOf = (c: T): string => {
    if (useCategory) return c.categoria?.trim() || NO_CATEGORY
    const first = normalize(c.nombre.trim().charAt(0)).toUpperCase()
    return /[A-Z]/.test(first) ? first : '#'
  }
  const map = new Map<string, T[]>()
  for (const c of items) {
    const k = keyOf(c)
    map.set(k, [...(map.get(k) ?? []), c])
  }
  const isLast = (k: string): boolean => k === NO_CATEGORY || k === '#'
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (isLast(a) !== isLast(b)) return isLast(a) ? 1 : -1
      return a.localeCompare(b, 'es', { sensitivity: 'base' })
    })
    .map(([key, list]) => ({ key, items: list.sort(byName) }))
}

/** Host part of a URL for display ("https://foo.com/x" → "foo.com"). */
export function displayHost(url?: string): string {
  if (!url) return ''
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).host
  } catch {
    return url
  }
}

/** Absolute URL for opening in the browser. */
export function absoluteUrl(url: string): string {
  return /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * Public favicon URL, or null for hosts that should not be sent to a third
 * party (localhost, IPs, intranet names without a dot).
 */
export function faviconUrl(url?: string): string | null {
  if (!url) return null
  let host = ''
  try {
    const u = new URL(absoluteUrl(url))
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    host = u.hostname
  } catch {
    return null
  }
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /\.(local|lan|internal|corp|localhost)$/i.test(host)) return null
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
}

/** Two-letter initials ("Banco Nación" → "BN", "jira" → "JI"). */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  const a = words[0] ?? ''
  const b = words[1] ?? ''
  const s = b ? a.charAt(0) + b.charAt(0) : a.slice(0, 2)
  return (s || '?').toUpperCase()
}

/** Stable small hash → index in [0, n). */
export function tintIndex(name: string, n: number): number {
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return n > 0 ? h % n : 0
}

/** "recién", "hace 5 min", "ayer", "12 mar". */
export function relativeTime(ts: number | undefined, now = Date.now()): string {
  if (!ts) return ''
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'recién'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}
