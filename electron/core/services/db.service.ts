/**
 * DatabaseService — provides a simple key-value store backed by electron-store.
 * This avoids native SQLite compilation issues across environments.
 * The service exposes a settings-compatible interface used by other services.
 */
import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../logger'
import { writeFileAtomic } from '../atomic-write'

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

  /** Read a JSON file from userData. Returns parsed object or null if not found.
   *  If the file exists but contains invalid JSON it is backed up before returning null. */
  readJSON<T>(filename: string): T | null {
    const filePath = path.join(this.dataDir, filename)
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      return null // file does not exist — normal on first run
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      // File exists but JSON is corrupted — back it up so data isn't silently lost
      const backupPath = `${filePath}.corrupt-${Date.now()}.bak`
      try { fs.copyFileSync(filePath, backupPath) } catch { /* ignore backup errors */ }
      logger.error('DatabaseService', `Corrupted JSON in "${filename}" — backed up`, { backupPath })
      return null
    }
  }

  /** Write an object as JSON to userData using an atomic tmp→rename pattern
   *  to avoid leaving a half-written (corrupted) file on crash. */
  writeJSON(filename: string, data: unknown): void {
    writeFileAtomic(path.join(this.dataDir, filename), JSON.stringify(data, null, 2))
  }

  /**
   * Read a JSON file that was stored encrypted.
   * Falls back to plain-JSON read if the file is not encrypted, so existing
   * unencrypted files are seamlessly migrated on next write.
   *
   * If the file exists but can't be decrypted or parsed (other user/PC, keyring
   * unavailable, truncated file) it is MOVED to `<name>.corrupt-<ts>` and logged:
   * the caller gets null and its next write must not silently destroy the only copy.
   */
  readEncryptedJSON<T>(filename: string): T | null {
    const filePath = path.join(this.dataDir, filename)
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8').trim()
    } catch {
      return null // file does not exist — normal on first run
    }
    try {
      if (raw.startsWith(ENC_MAGIC)) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable for an encrypted file')
        const decrypted = safeStorage.decryptString(Buffer.from(raw.slice(ENC_MAGIC.length), 'base64'))
        return JSON.parse(decrypted) as T
      }
      // Plain JSON (unencrypted legacy file or encryption unavailable when written)
      return JSON.parse(raw) as T
    } catch (err) {
      const aside = `${filePath}.corrupt-${Date.now()}`
      try {
        fs.renameSync(filePath, aside)
      } catch {
        try { fs.copyFileSync(filePath, aside) } catch { /* ignore */ }
      }
      logger.error('DatabaseService', `Unreadable encrypted JSON "${filename}" — moved aside`, {
        aside, error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /** Write an object as encrypted JSON to userData (atomic tmp→rename). Falls back to plain JSON if safeStorage unavailable. */
  writeEncryptedJSON(filename: string, data: unknown): void {
    const json = JSON.stringify(data)
    const content = safeStorage.isEncryptionAvailable()
      ? ENC_MAGIC + safeStorage.encryptString(json).toString('base64')
      : JSON.stringify(data, null, 2)
    writeFileAtomic(path.join(this.dataDir, filename), content)
  }
}
