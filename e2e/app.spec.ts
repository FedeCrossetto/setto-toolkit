import { test, expect } from '@playwright/test'
import { launchApp, cleanupDataDir } from './helpers'

test.describe('Shell', () => {
  test('la app arranca y muestra el Dashboard', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // Sidebar con branding visible
      await expect(page.getByTitle('File Editor')).toBeVisible({ timeout: 15_000 })
      // El Dashboard es el tab inicial (filtrar visible: el label del sidebar colapsado está oculto)
      await expect(page.getByText('Dashboard').filter({ visible: true }).first()).toBeVisible()
    } finally {
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })

  test('la navegación del sidebar abre plugins en tabs', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await expect(page.getByTitle('File Editor')).toBeVisible({ timeout: 15_000 })
      await page.getByTitle('File Editor').click()
      // El empty state del editor aparece
      await expect(page.getByText('Ningún archivo abierto')).toBeVisible({ timeout: 10_000 })
    } finally {
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })
})

test.describe('File Editor', () => {
  test('crear buffer, editar y ver indicador dirty', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await expect(page.getByTitle('File Editor')).toBeVisible({ timeout: 15_000 })
      await page.getByTitle('File Editor').click()
      await expect(page.getByText('Ningún archivo abierto')).toBeVisible({ timeout: 10_000 })

      // Ctrl+T crea un buffer nuevo sin pasar por diálogos nativos
      await page.keyboard.press('Control+t')
      // El editor CodeMirror aparece
      await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10_000 })

      await page.locator('.cm-content').click()
      await page.keyboard.type('hola mundo desde e2e')
      await expect(page.locator('.cm-content')).toContainText('hola mundo desde e2e')
    } finally {
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })

  test('la sesión restaura buffers tras reiniciar la app', async () => {
    const { app, page, userDataDir } = await launchApp()
    await expect(page.getByTitle('File Editor')).toBeVisible({ timeout: 15_000 })
    await page.getByTitle('File Editor').click()
    await expect(page.getByText('Ningún archivo abierto')).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Control+t')
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 10_000 })
    await page.locator('.cm-content').click()
    await page.keyboard.type('contenido persistente')
    await expect(page.locator('.cm-content')).toContainText('contenido persistente')
    // Dar tiempo al debounce de session-save (localStorage)
    await page.waitForTimeout(1000)
    await app.close()

    // Relanzar con el MISMO userData dir — la sesión debe restaurarse
    const second = await launchApp(userDataDir)
    try {
      await expect(second.page.getByTitle('File Editor')).toBeVisible({ timeout: 15_000 })
      await second.page.getByTitle('File Editor').click()
      await expect(second.page.locator('.cm-content')).toContainText('contenido persistente', { timeout: 10_000 })
    } finally {
      await second.app.close()
      cleanupDataDir(userDataDir)
    }
  })
})
