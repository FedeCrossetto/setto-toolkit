import { describe, expect, it } from 'vitest'
import {
  buildTitle, captureFacets, captureFileName, detectTicket, expiredCaptures, exportFileName, isExcludedApp, isValidCaptureFile,
  normalizeSource, overQuota, queryCaptures, toLite, type CaptureEntry,
} from './captures-utils'

const entry = (p: Partial<CaptureEntry>): CaptureEntry => ({
  id: 'a', file: 'x.png', createdAt: 0, width: 1, height: 1, bytes: 1, title: '', ticket: '', tags: [], note: '',
  pinned: false, ocr: null, ...p,
})

describe('captureFileName / isValidCaptureFile', () => {
  it('builds a sortable, valid name', () => {
    const name = captureFileName(new Date(2026, 9, 12, 14, 3, 22), 'ab-12!')
    expect(name).toBe('2026-10-12_14-03-22_ab12.png')
    expect(isValidCaptureFile(name)).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isValidCaptureFile('../secret.png')).toBe(false)
    expect(isValidCaptureFile('2026-10-12_14-03-22_ab12.png/../x')).toBe(false)
    expect(isValidCaptureFile(42)).toBe(false)
  })
})

describe('detectTicket', () => {
  it('finds jira-like keys, tolerating OCR spacing', () => {
    expect(detectTicket('Error en WIGOS-123967 al guardar')).toBe('WIGOS-123967')
    expect(detectTicket('ver WIGOS - 130026')).toBe('WIGOS-130026')
    expect(detectTicket('sin ticket, ver 2026-10-12')).toBe('')
    expect(detectTicket(null)).toBe('')
  })
})

describe('expiredCaptures', () => {
  it('keeps pinned and recent ones', () => {
    const now = 100 * 86_400_000
    const list = [entry({ id: 'old', createdAt: 0 }), entry({ id: 'pin', createdAt: 0, pinned: true }), entry({ id: 'new', createdAt: now })]
    expect(expiredCaptures(list, 30, now).map((c) => c.id)).toEqual(['old'])
    expect(expiredCaptures(list, 0, now)).toEqual([])
  })
})

describe('origen, título y nombre de exportación', () => {
  it('ignora las herramientas de recorte y limpia el sufijo del navegador', () => {
    expect(normalizeSource({ app: 'SnippingTool', title: 'Recortes' })).toBeNull()
    expect(normalizeSource({ app: '', title: 'x' })).toBeNull()
    expect(normalizeSource({ app: 'chrome', title: '[WIGOS-1] Error en cajero - Jira - Google Chrome' }))
      .toEqual({ app: 'Chrome', window: '[WIGOS-1] Error en cajero - Jira' })
  })
  it('arma el título con la ventana, la app o la hora', () => {
    const d = new Date(2026, 9, 12, 17, 12)
    expect(buildTitle({ app: 'WigosGUI', window: 'WigosGUI - Error' }, d)).toBe('WigosGUI - Error')
    expect(buildTitle({ app: 'SSMS', window: '' }, d)).toBe('Captura de SSMS')
    expect(buildTitle(null, d)).toBe('Captura 17:12')
  })
  it('nombre de exportación legible y válido en Windows', () => {
    const n = exportFileName({ ticket: 'WIGOS-123967', title: 'Error: "cajero" / LPS', createdAt: new Date(2026, 9, 12, 14, 3).getTime() })
    expect(n).toBe('WIGOS-123967 - Error cajero LPS - 2026-10-12 14-03.png')
    expect(exportFileName({ ticket: '', title: 'Hola', createdAt: new Date(2026, 0, 2, 3, 4).getTime() })).toBe('Hola - 2026-01-02 03-04.png')
  })
})

describe('queryCaptures / captureFacets', () => {
  const list = [
    entry({ id: '1', createdAt: 3, ticket: 'WIGOS-2', app: 'WigosGUI', bytes: 10, ocr: 'Not connected to the database' }),
    entry({ id: '2', createdAt: 2, ticket: '', app: 'Chrome', bytes: 30, title: 'Jira board' }),
    entry({ id: '3', createdAt: 1, ticket: 'WIGOS-1', app: 'WigosGUI', bytes: 20, pinned: true }),
  ]
  it('busca en OCR/título, filtra, ordena y pagina', () => {
    expect(queryCaptures(list, { text: 'database' }).items.map((c) => c.id)).toEqual(['1'])
    expect(queryCaptures(list, { app: 'WigosGUI', sort: 'old' }).items.map((c) => c.id)).toEqual(['3', '1'])
    expect(queryCaptures(list, { sort: 'ticket' }).items.map((c) => c.id)).toEqual(['3', '1', '2'])
    expect(queryCaptures(list, { sort: 'size' }).items.map((c) => c.id)).toEqual(['2', '3', '1'])
    expect(queryCaptures(list, { pinned: true }).items.map((c) => c.id)).toEqual(['3'])
    const page = queryCaptures(list, { offset: 1, limit: 1 })
    expect(page.items.map((c) => c.id)).toEqual(['2'])
    expect(page.total).toBe(3)
  })
  it('facetas: tickets por uso reciente, apps por cantidad, bytes', () => {
    const f = captureFacets(list)
    expect(f.tickets).toEqual(['WIGOS-2', 'WIGOS-1'])
    expect(f.apps).toEqual([{ name: 'WigosGUI', count: 2 }, { name: 'Chrome', count: 1 }])
    expect(f.bytes).toBe(60)
  })
  it('toLite no manda OCR ni nota', () => {
    const lite = toLite(entry({ ocr: 'mucho texto', note: 'n' }))
    expect('ocr' in lite).toBe(false)
    expect(lite.ocrState).toBe('done')
    expect(lite.hasNote).toBe(true)
  })
})

describe('overQuota / isExcludedApp', () => {
  it('borra las más viejas no fijadas hasta entrar en el tope', () => {
    const list = [entry({ id: 'a', createdAt: 1, bytes: 50 }), entry({ id: 'b', createdAt: 2, bytes: 50, pinned: true }), entry({ id: 'c', createdAt: 3, bytes: 50 })]
    expect(overQuota(list, 100).map((c) => c.id)).toEqual(['a'])
    expect(overQuota(list, 0)).toEqual([])
  })
  it('compara apps sin mayúsculas', () => {
    expect(isExcludedApp('MyGame', ['mygame'])).toBe(true)
    expect(isExcludedApp(undefined, ['x'])).toBe(false)
  })
})
