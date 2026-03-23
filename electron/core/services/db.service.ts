/**
 * DatabaseService — provides a simple key-value store backed by electron-store.
 * This avoids native SQLite compilation issues across environments.
 * The service exposes a settings-compatible interface used by other services.
 */
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

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
      console.error(`[DB] Corrupted JSON in "${filename}" — backed up to ${backupPath}`)
      return null
    }
  }

  /** Write an object as JSON to userData using an atomic tmp→rename pattern
   *  to avoid leaving a half-written (corrupted) file on crash. */
  writeJSON(filename: string, data: unknown): void {
    const filePath = path.join(this.dataDir, filename)
    const tmpPath  = `${filePath}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
  }
}
