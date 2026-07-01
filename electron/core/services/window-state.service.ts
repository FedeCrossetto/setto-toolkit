import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import type { DatabaseService } from './db.service'

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

  function save(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const maximized = win.isMaximized()
      const { x, y, width, height } = maximized ? win.getNormalBounds() : win.getBounds()
      const bounds: WindowBounds = { x, y, width, height, maximized }
      db.writeJSON(FILE, bounds)
    }, 400)
  }

  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', save)
}
