import { safeStorage } from 'electron'
import type { DatabaseService } from './db.service'
import { logger } from '../logger'

type SettingsStore = Record<string, string>

/** Keys whose values are encrypted at rest using safeStorage */
const SECURE_KEYS = new Set([
  'bitbucket.token',              // legacy — keep for any old stored data
  'ai.openai_key',
  'ai.anthropic_key',
  'repo-search.bitbucket.token',
  'repo-search.github.token',
  'repo-search.gitlab.token',
  'ticket-resolver.jira_token',
  'gastos.supabase_service_key',
])

const ENC_PREFIX = 'enc:'

/** Current settings schema version — bump this when a breaking key change is made. */
const CURRENT_SCHEMA_VERSION = 1

/**
 * Each migration function receives the raw store and returns the migrated store.
 * Index 0 = migration from v0 → v1, index 1 = v1 → v2, etc.
 * Keep old migrations forever so any existing install can catch up step by step.
 */
const MIGRATIONS: Array<(store: SettingsStore) => SettingsStore> = [
  // v0 → v1: rename old flat 'ai.provider' value 'openai' (no-op in practice, just documents the pattern)
  (store) => store,
]

export class SettingsService {
  private store: SettingsStore
  private readonly FILE = 'settings.json'

  constructor(private db: DatabaseService) {
    const raw = db.readJSON<SettingsStore>(this.FILE) ?? {}
    this.store = this.runMigrations(raw)
  }

  private runMigrations(raw: SettingsStore): SettingsStore {
    const fromVersion = raw['__schema_version__'] ? parseInt(raw['__schema_version__']!, 10) : 0
    if (fromVersion >= CURRENT_SCHEMA_VERSION) return raw

    let store: SettingsStore = { ...raw }
    for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
      try {
        store = MIGRATIONS[v]!(store)
        logger.info('SettingsService', `Migrated settings schema v${v} → v${v + 1}`)
      } catch (err) {
        logger.error('SettingsService', `Migration v${v} → v${v + 1} failed`, err)
        break
      }
    }
    store['__schema_version__'] = String(CURRENT_SCHEMA_VERSION)
    this.db.writeJSON(this.FILE, store)
    return store
  }

  private save(): void {
    this.store['__schema_version__'] = String(CURRENT_SCHEMA_VERSION)
    this.db.writeJSON(this.FILE, this.store)
  }

  private encrypt(value: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
    }
    return value
  }

  private decrypt(raw: string): string {
    if (raw.startsWith(ENC_PREFIX)) {
      try {
        return safeStorage.decryptString(Buffer.from(raw.slice(ENC_PREFIX.length), 'base64'))
      } catch {
        return ''
      }
    }
    return raw
  }

  get(key: string): string | null {
    const raw = this.store[key] ?? null
    if (raw === null) return null
    return SECURE_KEYS.has(key) ? this.decrypt(raw) : raw
  }

  getJSON<T>(key: string): T | null {
    const val = this.get(key)
    if (val === null) return null
    try {
      return JSON.parse(val) as T
    } catch {
      return null
    }
  }

  set(key: string, value: string): void {
    this.store[key] = SECURE_KEYS.has(key) ? this.encrypt(value) : value
    this.save()
  }

  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value))
  }

  delete(key: string): void {
    delete this.store[key]
    this.save()
  }

  getAll(prefix?: string): Record<string, string> {
    const entries = prefix
      ? Object.entries(this.store).filter(([k]) => k.startsWith(prefix) && k !== '__schema_version__')
      : Object.entries(this.store).filter(([k]) => k !== '__schema_version__')
    return Object.fromEntries(
      entries.map(([k, v]) => [k, SECURE_KEYS.has(k) ? this.decrypt(v) : v])
    )
  }
}
