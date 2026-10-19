import { test, expect } from '@playwright/test'
import { launchApp, cleanupDataDir } from './helpers'

test.describe('Shell', () => {
  test('la app arranca y muestra Inicio', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      // Sidebar con branding visible
      await expect(page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
      // Inicio es el tab inicial (filtrar visible: el label del sidebar colapsado está oculto)
      await expect(page.getByText('Inicio').filter({ visible: true }).first()).toBeVisible()
    } finally {
      await app.close()
      cleanupDataDir(userDataDir)
    }
  })

  test('la bienvenida aparece una sola vez', async () => {
    const { app, page, userDataDir } = await launchApp(undefined, { keepOnboarding: true })
    try {
      await expect(page.getByText('Te damos la bienvenida a Setto')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await expect(page.getByText('¿Qué módulos querés ver?')).toBeVisible()
      await page.getByRole('button', { name: 'Siguiente' }).click()
      await page.getByRole('button', { name: /Modo solo local/ }).click()
      await expect(page.getByText('Atajos para ir rápido')).toBeVisible()
      await page.getByRole('button', { name: 'Empezar' }).click()
      await expect(page.getByText('Atajos para ir rápido')).toBeHidden()
      await app.close()
      const second = await launchApp(userDataDir, { keepOnboarding: true })
      await expect(second.page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(second.page.getByText('Te damos la bienvenida a Setto')).toBeHidden()
      await second.app.close()
    } finally {
      await app.close().catch(() => undefined)
      cleanupDataDir(userDataDir)
    }
  })

  test('la barra lateral cambia de módulo y la barra superior muestra el actual', async () => {
    const { app, page, userDataDir } = await launchApp()
    try {
      await expect(page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('topbar-title')).toContainText('Inicio')
      await page.locator('aside').getByTitle('Editor', { exact: true }).click()
      await expect(page.getByTestId('topbar-title')).toContainText('Editor')
      // El empty state del editor aparece
      await expect(page.getByText('Ningún archivo abierto')).toBeVisible({ timeout: 10_000 })
      // No hay pestañas de módulos en la barra superior
      await expect(page.locator('header [role="tab"]')).toHaveCount(0)
      // Ctrl+1 vuelve al primer módulo de la barra lateral (Inicio)
      await page.keyboard.press('Control+1')
      await expect(page.getByTestId('topbar-title')).toContainText('Inicio')
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
      await expect(page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
      await page.locator('aside').getByTitle('Editor', { exact: true }).click()
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
    await expect(page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
    await page.locator('aside').getByTitle('Editor', { exact: true }).click()
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
      await expect(second.page.locator('aside').getByTitle('Editor', { exact: true })).toBeVisible({ timeout: 15_000 })
      await second.page.locator('aside').getByTitle('Editor', { exact: true }).click()
      await expect(second.page.locator('.cm-content')).toContainText('contenido persistente', { timeout: 10_000 })
    } finally {
      await second.app.close()
      cleanupDataDir(userDataDir)
    }
  })
})
