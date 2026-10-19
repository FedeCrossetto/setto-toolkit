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
  // La primera ventana es la de carga ("Abriendo Setto…", data: URL): esperar la principal.
  let page = await app.firstWindow()
  for (let i = 0; i < 100 && (page.url().startsWith('data:') || page.url().includes('#')); i++) {
    page = app.windows().find((w) => !w.url().startsWith('data:') && !w.url().includes('#')) ?? await app.waitForEvent('window')
  }
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
