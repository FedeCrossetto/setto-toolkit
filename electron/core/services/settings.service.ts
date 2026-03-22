import { safeStorage } from 'electron'
import type { DatabaseService } from './db.service'

type SettingsStore = Record<string, string>

/** Keys whose values are encrypted at rest using safeStorage */
const SECURE_KEYS = new Set([
  'bitbucket.token',              // legacy — keep for any old stored data
  'ai.openai_key',
  'repo-search.bitbucket.token',
  'repo-search.github.token',
])

const ENC_PREFIX = 'enc:'

export class SettingsService {
  private store: SettingsStore
  private readonly FILE = 'settings.json'

  constructor(private db: DatabaseService) {
    this.store = db.readJSON<SettingsStore>(this.FILE) ?? {}
  }

  private save(): void {
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
      ? Object.entries(this.store).filter(([k]) => k.startsWith(prefix))
      : Object.entries(this.store)
    return Object.fromEntries(
      entries.map(([k, v]) => [k, SECURE_KEYS.has(k) ? this.decrypt(v) : v])
    )
  }
}
