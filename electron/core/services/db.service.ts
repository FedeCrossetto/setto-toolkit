/**
 * DatabaseService — provides a simple key-value store backed by electron-store.
 * This avoids native SQLite compilation issues across environments.
 * The service exposes a settings-compatible interface used by other services.
 */
import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

const ENC_MAGIC = 'ENCV1:'

export class DatabaseService {
  private dataDir: string

  constructor() {
    this.dataDir = app.getPath('userData')
    fs.mkdirSync(this.dataDir, { recursive: true })
  }

  getDataDir(): string {
    return this.dataDir
  }

  /** Read a JSON file from userData. Returns parsed object or null if not found. */
  readJSON<T>(filename: string): T | null {
    const filePath = path.join(this.dataDir, filename)
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  /** Write an object as JSON to userData. */
  writeJSON(filename: string, data: unknown): void {
    const filePath = path.join(this.dataDir, filename)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  /**
   * Read a JSON file that was stored encrypted.
   * Falls back to plain-JSON read if encryption is unavailable or the file is not encrypted,
   * so existing unencrypted files are seamlessly migrated on next write.
   */
  readEncryptedJSON<T>(filename: string): T | null {
    const filePath = path.join(this.dataDir, filename)
    try {
      const raw = fs.readFileSync(filePath, 'utf-8').trim()
      if (raw.startsWith(ENC_MAGIC) && safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(raw.slice(ENC_MAGIC.length), 'base64'))
        return JSON.parse(decrypted) as T
      }
      // Plain JSON fallback (unencrypted legacy file or encryption unavailable)
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  /** Write an object as encrypted JSON to userData. Falls back to plain JSON if safeStorage unavailable. */
  writeEncryptedJSON(filename: string, data: unknown): void {
    const filePath = path.join(this.dataDir, filename)
    const json = JSON.stringify(data)
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = ENC_MAGIC + safeStorage.encryptString(json).toString('base64')
      fs.writeFileSync(filePath, encrypted, 'utf-8')
    } else {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    }
  }
}
