import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import type { DatabaseService } from './db.service'
import { logger } from '../logger'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

const FILE = 'window-state.json'
/** Reads saved bounds and returns them if the display still exists, else returns defaults. */
export function loadWindowState(db: DatabaseService): Partial<WindowBounds> {
  const saved = db.readJSON<WindowBounds>(FILE)
  if (!saved) return {}

  // Verify the saved position is still on a connected display
  const visible = screen.getAllDisplays().some((d) => {
    const { x, y, width, height } = d.workArea
    return (
      saved.x >= x && saved.y >= y &&
      saved.x + saved.width <= x + width &&
      saved.y + saved.height <= y + height
    )
  })

  if (!visible) return {}
  return saved
}

/** Attaches move/resize/maximize listeners that persist bounds on change. */
export function trackWindowState(win: BrowserWindow, db: DatabaseService): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  // Se escribe en un timer: si falla (archivo bloqueado, disco lleno) se reintenta
  // y se registra, pero nunca se deja escapar la excepción (tumbaría el proceso).
  function write(bounds: WindowBounds, attempt = 0): void {
    try {
      db.writeJSON(FILE, bounds)
    } catch (err) {
      logger.warn('window-state', `save failed (intento ${attempt + 1})`, err instanceof Error ? err.message : String(err))
      if (attempt < 2) saveTimer = setTimeout(() => write(bounds, attempt + 1), 1000)
    }
  }

  function save(immediate = false): void {
    if (saveTimer) clearTimeout(saveTimer)
    // Los bounds se leen YA: al disparar el timer la ventana puede estar destruida (evento close).
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const { x, y, width, height } = maximized ? win.getNormalBounds() : win.getBounds()
    const bounds: WindowBounds = { x, y, width, height, maximized }
    if (immediate) { saveTimer = null; write(bounds); return }
    saveTimer = setTimeout(() => write(bounds), 400)
  }

  win.on('resize', () => save())
  win.on('move', () => save())
  win.on('maximize', () => save())
  win.on('unmaximize', () => save())
  // Al cerrar se guarda en el acto: después la ventana ya no existe.
  win.on('close', () => save(true))
}
