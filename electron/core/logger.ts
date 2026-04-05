/**
 * Centralized structured logger for the Electron main process.
 * Writes JSON-line entries to the platform log directory and mirrors to console.
 *
 * Log location:
 *   Windows  — %APPDATA%\<app>\logs\app.log
 *   macOS    — ~/Library/Logs/<app>/app.log
 *   Linux    — ~/.config/<app>/logs/app.log
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: LogLevel
  ctx: string
  msg: string
  data?: unknown
}

class Logger {
  private logPath: string | null = null
  private initFailed = false

  private ensureLogPath(): string | null {
    if (this.initFailed) return null
    if (this.logPath) return this.logPath
    try {
      const logDir = app.getPath('logs')
      fs.mkdirSync(logDir, { recursive: true })
      this.logPath = path.join(logDir, 'app.log')
      return this.logPath
    } catch {
      this.initFailed = true
      return null
    }
  }

  private write(level: LogLevel, ctx: string, msg: string, data?: unknown): void {
    const entry: LogEntry = { ts: new Date().toISOString(), level, ctx, msg, ...(data !== undefined ? { data } : {}) }
    const line = JSON.stringify(entry)

    // Console mirror (always in dev, always for warn/error in prod)
    const isDev = !app.isPackaged
    if (isDev || level === 'warn' || level === 'error') {
      const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${ctx}]`
      if (level === 'error') console.error(prefix, msg, data ?? '')
      else if (level === 'warn') console.warn(prefix, msg, data ?? '')
      else console.log(prefix, msg, data ?? '')
    }

    // File output
    const logPath = this.ensureLogPath()
    if (!logPath) return
    try {
      fs.appendFileSync(logPath, line + '\n', 'utf-8')
    } catch { /* ignore write errors — don't crash over logging */ }
  }

  debug(ctx: string, msg: string, data?: unknown): void { this.write('debug', ctx, msg, data) }
  info(ctx: string, msg: string, data?: unknown): void  { this.write('info',  ctx, msg, data) }
  warn(ctx: string, msg: string, data?: unknown): void  { this.write('warn',  ctx, msg, data) }
  error(ctx: string, msg: string, data?: unknown): void { this.write('error', ctx, msg, data) }
}

export const logger = new Logger()
