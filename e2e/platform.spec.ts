import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { launchApp, cleanupDataDir, waitForWindow } from './helpers'

/** Invoca un canal IPC desde una ventana (pasa por el preload, con su lista de canales). */
const invoke = <T = unknown>(page: Page, channel: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([ch, a]) => window.api.invoke(ch as string, ...(a as unknown[])), [channel, args] as const) as Promise<T>

const cred = (id: string, nombre: string): Record<string, unknown> =>
  ({ id, nombre, usuario: 'qa@e2e.test', password: 'pass-e2e-123', url: '', categoria: 'Pruebas', notas: '' })

async function ready(page: Page): Promise<void> {
  await expect(page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
  // Sin Supabase: Claves en modo local (nada sale de la máquina).
  await invoke(page, 'settings:set', 'app.local_only', '1')
}

test.describe('Plataforma', () => {
  test('la barra flotante abre y su pestaña Claves lista una credencial', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await ready(page)
      await invoke(page, 'credentials:save', cred('e2e-dock-1', 'Servidor E2E'))
      await invoke(page, 'dock:set-enabled', true)
      const dock = await waitForWindow(app, '#dock')
      await dock.waitForLoadState('domcontentloaded')
      await expect(dock.getByRole('button', { name: 'Abrir Setto' })).toBeVisible({ timeout: 15_000 })

      // La barra sólo ve sus canales: lo sensible se rechaza ya en el preload.
      const denied = await dock.evaluate(() => window.api.invoke('settings:set', 'x', 'y').then(() => 'ok', (e: Error) => e.message))
      expect(denied).toMatch(/not allowed in the dock window/)

      await dock.evaluate(() => { window.api.send('dock:pin', true); window.api.send('dock:expand') })
      await dock.getByTitle(/^Claves \(/).click({ timeout: 10_000 })
      await expect(dock.getByText('Servidor E2E')).toBeVisible({ timeout: 10_000 })
    } finally {
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })

  test('respaldo: exportar y restaurar vuelve los datos al estado del respaldo', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setto-e2e-bk-'))
    const file = path.join(tmp, 'prueba.settobackup')
    const pass = 'clave-de-respaldo-e2e'
    const { app, page, userDataDir } = await launchApp(undefined, { env: { SETTO_NO_RELAUNCH: '1' } })
    try {
      await ready(page)
      await invoke(page, 'settings:set', 'ai.model', 'modelo-antes')
      await invoke(page, 'notes:write', 'respaldada.md', '# Nota respaldada')
      // El diálogo nativo de "Guardar" se reemplaza por la ruta temporal.
      await app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = (async () => ({ canceled: false, filePath: f })) as typeof dialog.showSaveDialog }, file)
      const out = await invoke<{ ok: boolean; files: number }>(page, 'backup:export', pass, false)
      expect(out.ok).toBe(true)
      expect(fs.existsSync(file)).toBe(true)

      // Cambios después del respaldo: tienen que desaparecer al restaurar.
      await invoke(page, 'settings:set', 'ai.model', 'modelo-despues')
      await invoke(page, 'notes:write', 'posterior.md', '# Nota posterior')
      const info = await invoke<{ files: number }>(page, 'backup:inspect', file, pass)
      expect(info.files).toBeGreaterThan(0)

      // Esperar a que el proceso termine de verdad (si no, el lock de instancia única frena el relanzamiento).
      const proc = app.process()
      const exited = new Promise<void>((res) => { if (proc.exitCode !== null) res(); else proc.once('exit', () => res()) })
      const r = await invoke<{ ok: boolean; safety: string }>(page, 'backup:restore', file, pass)
      expect(r.ok).toBe(true)
      await exited   // la app se cierra sola (SETTO_NO_RELAUNCH: sin relanzar)

      const second = await launchApp(userDataDir)
      try {
        await expect(second.page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
        expect(await invoke(second.page, 'settings:get', 'ai.model')).toBe('modelo-antes')
        const notes = await invoke<Array<{ id: string }>>(second.page, 'notes:list')
        const ids = notes.map((n) => n.id)
        expect(ids).toContain('respaldada.md')
        expect(ids).not.toContain('posterior.md')
        // Lo quitado queda en la copia previa.
        expect(fs.existsSync(path.join(r.safety, 'notes', 'posterior.md'))).toBe(true)
      } finally {
        await second.app.close()
      }
    } finally {
      await app.close().catch(() => undefined)
      cleanupDataDir(userDataDir)
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('Claves (solo local): crear, copiar y borrar con Deshacer', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await ready(page)
      await page.locator('aside').getByTitle('Claves', { exact: true }).click()
      await expect(page.getByTestId('topbar-title')).toContainText('Claves')
      await expect(page.getByText('Solo en esta computadora').first()).toBeVisible({ timeout: 10_000 })

      await page.getByRole('button', { name: 'Nueva credencial' }).first().click()
      await page.getByPlaceholder('Ej.: Jira, VPN, SQL QA').fill('Prueba E2E')
      await page.getByPlaceholder('usuario@dominio.com').fill('qa@e2e.test')
      await page.locator('form input[type="password"]').fill('pass-e2e-123')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      const row = page.getByRole('listbox', { name: 'Claves' }).getByText('Prueba E2E')
      await expect(row).toBeVisible({ timeout: 10_000 })

      await page.locator('button.ui-btn-primary[title="Copiar contraseña (Enter)"]').click()
      await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()), { timeout: 5_000 }).toBe('pass-e2e-123')
      await app.evaluate(({ clipboard }) => clipboard.clear())

      await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
      await expect(row).toBeHidden({ timeout: 5_000 })
      await page.getByRole('button', { name: 'Deshacer' }).click()
      await expect(row).toBeVisible({ timeout: 5_000 })
      const list = await invoke<{ items: Array<{ nombre: string }> }>(page, 'credentials:list', { localOnly: true })
      expect(list.items.map((c) => c.nombre)).toContain('Prueba E2E')
    } finally {
      await app.evaluate(({ clipboard }) => clipboard.clear()).catch(() => undefined)
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })

  test('Ctrl+K abre la paleta y encuentra un módulo', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await expect(page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
      await page.keyboard.press('Control+k')
      const input = page.getByPlaceholder('Buscar notas, snippets, gastos, módulos y acciones…')
      await expect(input).toBeVisible()
      await input.fill('Snippets')
      const option = page.getByRole('dialog', { name: 'Buscar' }).getByRole('option').filter({ hasText: 'Snippets' }).first()
      await expect(option).toBeVisible()
      await option.click()
      await expect(page.getByTestId('topbar-title')).toContainText('Snippets', { timeout: 10_000 })
    } finally {
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })
})
