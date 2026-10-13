import { app, clipboard, globalShortcut, Notification } from 'electron'
import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { ocrImage } from './win-helper'
import { simulatePaste } from './snippet-picker'
import { queueState, takeNextFromQueue } from './clipboard-history'
import { logger } from './logger'

/**
 * Atajos globales del portapapeles inteligente:
 * - Ctrl+Alt+Shift+V: pega el siguiente elemento de la secuencia.
 * - Ctrl+Alt+T: recortás con Win+Shift+S y copia el TEXTO de ese recorte (OCR).
 * Si un atajo lo usa otra app se prueba el siguiente de la lista.
 */
const NEXT_SHORTCUTS = ['CommandOrControl+Alt+Shift+V', 'CommandOrControl+Alt+B']
const OCR_SHORTCUTS = ['CommandOrControl+Alt+T', 'CommandOrControl+Alt+O']
const active: Record<'next' | 'ocr', string | null> = { next: null, ocr: null }

const notify = (title: string, body = ''): void => {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show()
}

function register(key: 'next' | 'ocr', list: string[], fn: () => void): void {
  for (const accel of list) {
    try {
      if (globalShortcut.register(accel, fn)) { active[key] = accel; logger.info('clipboard', `Atajo global ${key}: ${accel}`); return }
    } catch { /* probar el siguiente */ }
  }
  logger.warn('clipboard', `No se pudo registrar el atajo ${key}`)
}

/** Texto de la imagen que hay en el portapapeles; lo deja copiado. */
export async function copyTextFromClipboardImage(): Promise<{ ok: boolean; text?: string; reason?: string }> {
  const img = clipboard.readImage()
  if (img.isEmpty()) return { ok: false, reason: 'No hay una imagen en el portapapeles. Recortá con Win+Shift+S y probá de nuevo.' }
  if (process.platform !== 'win32') return { ok: false, reason: 'El reconocimiento de texto sólo está disponible en Windows.' }
  const tmp = path.join(app.getPath('temp'), `setto-ocr-${process.pid}.png`)
  fs.writeFileSync(tmp, img.toPNG())
  try {
    const text = ((await ocrImage(tmp)) ?? '').trim()
    if (!text) return { ok: false, reason: 'No se reconoció texto en la imagen.' }
    clipboard.writeText(text)
    return { ok: true, text }
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* nada */ }
  }
}

export function registerClipboardActions(ipcMain: IpcMain): void {
  register('next', NEXT_SHORTCUTS, () => {
    const item = takeNextFromQueue()
    if (!item) { notify('No hay secuencia para pegar', 'Armala desde el selector (Ctrl+Alt+V): elegí varios con Espacio y «Pegar en secuencia».'); return }
    // Esperar a que el usuario suelte las teclas del atajo antes de simular Ctrl+V.
    setTimeout(simulatePaste, 220)
  })
  register('ocr', OCR_SHORTCUTS, () => {
    void copyTextFromClipboardImage().then((r) => {
      if (r.ok) notify('Texto copiado de la imagen', r.text!.split('\n').slice(0, 2).join(' · ').slice(0, 120))
      else notify('No se pudo leer el texto', r.reason)
    }).catch((err) => notify('No se pudo leer el texto', String(err)))
  })

  ipcMain.handle('clipboard:ocr-image', () => copyTextFromClipboardImage())
  ipcMain.handle('clipboard:shortcuts', () => {
    const pretty = (a: string | null): string | null => a?.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl') ?? null
    return { next: pretty(active.next), ocr: pretty(active.ocr), queue: queueState() }
  })
}

export function teardownClipboardActions(): void {
  for (const a of Object.values(active)) if (a) globalShortcut.unregister(a)
  active.next = null
  active.ocr = null
}
