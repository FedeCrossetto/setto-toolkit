import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'

/**
 * Launch the built Electron app with an isolated userData dir so tests
 * never touch (or depend on) the developer's real settings/session.
 */
export async function launchApp(userDataDir?: string, opts: { keepOnboarding?: boolean; env?: Record<string, string> } = {}): Promise<{ app: ElectronApplication; page: Page; userDataDir: string }> {
  const dataDir = userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'setto-e2e-'))
  const app = await electron.launch({
    args: [path.join(__dirname, '../out/main/main.js'), `--user-data-dir=${dataDir}`],
    env: { ...process.env, NODE_ENV: 'production', SETTO_E2E: '1', ...opts.env },
  })
  // La primera ventana es la de carga ("Abriendo Setto…", data: URL) y se cierra sola: esperar la
  // principal por su URL (index.html sin #). Antes se tomaba la primera que no fuera data:, pero
  // la de carga puede estar todavía en about:blank y después cerrarse ("Target page closed").
  const isMain = (u: string): boolean => /index\.html$|^https?:\/\/localhost:\d+\/?$/.test(u)
  let page: Page | undefined
  for (let i = 0; i < 300 && !page; i++) {
    page = app.windows().find((w) => !w.isClosed() && isMain(w.url()))
    if (!page) await new Promise((r) => setTimeout(r, 100))
  }
  if (!page) throw new Error('No apareció la ventana principal')
  await fakeClipboard(app)
  // Lo que se copia desde la interfaz (navigator.clipboard) tampoco sale de la página.
  await page.evaluate(() => { const cb = navigator.clipboard as unknown as Record<string, unknown>; cb.writeText = async () => undefined; cb.write = async () => undefined }).catch(() => undefined)
  await page.waitForLoadState('domcontentloaded')
  if (!opts.keepOnboarding) await skipOnboarding(page)
  return { app, page, userDataDir: dataDir }
}

export function cleanupDataDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
}

/** La bienvenida aparece en el primer arranque (userData nuevo): cerrarla con "Saltar". */
export async function skipOnboarding(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Saltar', exact: true })
  await page.locator('aside').first().waitFor({ timeout: 15_000 }).catch(() => undefined)
  if (await skip.isVisible().catch(() => false)) await skip.click()
}

/** Espera una ventana cuyo URL termine en `hash` (p. ej. '#dock'). */
export async function waitForWindow(app: ElectronApplication, hash: string, timeoutMs = 15_000): Promise<Page> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const w = app.windows().find((x) => x.url().endsWith(hash))
    if (w) return w
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`No apareció la ventana ${hash}`)
}

/**
 * Portapapeles en memoria para el proceso principal: los tests NUNCA tocan el de Windows
 * (copiar una clave escribía la contraseña de prueba en el portapapeles real del usuario y
 * después lo vaciaba). Se aplica en cada `launchApp`; `clipboard.readText()` en un test
 * lee lo que la app "copió".
 */
export async function fakeClipboard(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ clipboard }) => {
    const c = clipboard as unknown as Record<string, unknown>
    let text = ''
    c.readText = () => text
    c.writeText = (t: string) => { text = String(t) }
    c.clear = () => { text = '' }
    c.availableFormats = () => (text ? ['text/plain'] : [])
    c.readImage = () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), getSize: () => ({ width: 0, height: 0 }) })
    c.writeImage = () => undefined
    c.readBuffer = () => Buffer.alloc(0)
    c.readHTML = () => ''
    c.write = (d: { text?: string }) => { if (typeof d?.text === 'string') text = d.text }
  })
}
