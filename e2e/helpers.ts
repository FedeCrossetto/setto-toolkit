import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'

/**
 * Launch the built Electron app with an isolated userData dir so tests
 * never touch (or depend on) the developer's real settings/session.
 */
export async function launchApp(userDataDir?: string): Promise<{ app: ElectronApplication; page: Page; userDataDir: string }> {
  const dataDir = userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'setto-e2e-'))
  const app = await electron.launch({
    args: [path.join(__dirname, '../out/main/main.js'), `--user-data-dir=${dataDir}`],
    env: { ...process.env, NODE_ENV: 'production', SETTO_E2E: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, userDataDir: dataDir }
}

export function cleanupDataDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
}
