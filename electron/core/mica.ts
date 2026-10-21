import os from 'os'
import { execFileSync } from 'child_process'
import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions, type IpcMain } from 'electron'
import type { SettingsService } from './services/settings.service'

/**
 * Fondo Mica de Windows 11 en la ventana principal: el marco (barra lateral y
 * superior) deja ver el tono del escritorio, como el Explorador o Terminal.
 * Requiere Windows 11 22H2 (build 22621) o posterior; en el resto no hace nada.
 * El renderer pone `html.mica` y vuelve transparente sólo el marco (globals.css).
 *
 * En una ventana sin marco Mica se dibuja con el claro/oscuro de Windows, no con
 * el de la app: si no coinciden (Setto claro con Windows oscuro) el marco quedaba
 * gris turbio. Por eso sólo se activa cuando los dos coinciden; si no, fondo sólido.
 */
const KEY = 'app.mica'
const THEME_KEY = 'app.theme_native'
const SOLID = { light: '#F4F4F5', dark: '#161616' }

export function micaSupported(): boolean {
  return process.platform === 'win32' && Number(os.release().split('.')[2] ?? 0) >= 22621
}

/** Lo que eligió el usuario en Ajustes (activo por defecto). */
export function micaEnabled(settings: SettingsService | null): boolean {
  return micaSupported() && settings?.get(KEY) !== '0'
}

/** Windows en modo oscuro (Configuración → Personalización → Colores → apps). */
let sysCache: { dark: boolean; at: number } | null = null
function systemDark(): boolean {
  if (sysCache && Date.now() - sysCache.at < 5000) return sysCache.dark
  let dark = false
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'AppsUseLightTheme'],
      { windowsHide: true, encoding: 'utf8', timeout: 2000 })
    dark = /AppsUseLightTheme\s+REG_DWORD\s+0x0\b/i.test(out)
  } catch { /* sin dato: claro */ }
  sysCache = { dark, at: Date.now() }
  return dark
}

function appDark(settings: SettingsService | null): boolean | null {
  const t = settings?.get(THEME_KEY)
  return t === 'dark' ? true : t === 'light' ? false : null
}

/** Mica de verdad visible: elegido y con el mismo claro/oscuro que Windows. */
export function micaActive(settings: SettingsService | null): boolean {
  if (!micaEnabled(settings)) return false
  const a = appDark(settings)
  return a === null || a === systemDark()
}

export function micaWindowOptions(on: boolean): Partial<BrowserWindowConstructorOptions> {
  return on ? { backgroundMaterial: 'mica', backgroundColor: '#00000000' } : {}
}

function apply(w: BrowserWindow | null, settings: SettingsService): void {
  if (!w || w.isDestroyed() || !micaSupported()) return
  const on = micaActive(settings)
  w.setBackgroundMaterial(on ? 'mica' : 'none')
  w.setBackgroundColor(on ? '#00000000' : SOLID[appDark(settings) ? 'dark' : 'light'])
}

export function registerMica(ipcMain: IpcMain, settings: SettingsService, getWin: () => BrowserWindow | null): void {
  const state = (): { supported: boolean; enabled: boolean; active: boolean } =>
    ({ supported: micaSupported(), enabled: micaEnabled(settings), active: micaActive(settings) })
  ipcMain.handle('app:mica', state)
  ipcMain.handle('app:set-mica', (_e, on: unknown) => {
    if (!micaSupported()) return state()
    settings.set(KEY, on === true ? '1' : '0')
    apply(getWin(), settings)
    return state()
  })
  // El claro/oscuro de la app: se guarda (para la próxima apertura) y decide si Mica va.
  ipcMain.on('app:theme', (_e, dark: unknown) => {
    const next = dark === true ? 'dark' : 'light'
    if (settings.get(THEME_KEY) === next) return
    settings.set(THEME_KEY, next)
    nativeTheme.themeSource = next
    apply(getWin(), settings)
  })
}

/** Antes de crear la ventana: el claro/oscuro con el que se cerró la app. */
export function applySavedTheme(settings: SettingsService | null): void {
  const a = appDark(settings)
  if (a !== null) nativeTheme.themeSource = a ? 'dark' : 'light'
}
