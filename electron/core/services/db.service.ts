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
}
