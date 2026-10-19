import { describe, expect, it } from 'vitest'
import {
  buildIndex, detailFor, emptyMeta, exportMarkdown, extractKeys, filterSummaries, isTicketKey, jiraUrl, noteTemplate,
  normalizeKey, summarize, type SourceItem,
} from './logic'

describe('extractKeys', () => {
  it('encuentra claves de Jira', () => {
    expect(extractKeys('ver WIGOS-132764 y WGC-13615, otra vez WIGOS-132764')).toEqual(['WIGOS-132764', 'WGC-13615'])
    expect(extractKeys('branch feature/WIGOS-95460 listo')).toEqual(['WIGOS-95460'])
    expect(extractKeys('(ABC2-7): fix')).toEqual(['ABC2-7'])
  })
  it('ignora falsos positivos', () => {
    expect(extractKeys('UTF-8, SHA-256, ISO-8859-1, ISO-8859, CP-1252, TLS-12, RFC-7231 y AES-128')).toEqual([])
    expect(extractKeys('wigos-123 en minúsculas')).toEqual([])
    expect(extractKeys('WIGOS-12a, X-WIGOS-5, WIGOS-1.2, ABC-2024-01')).toEqual([])
    expect(extractKeys('ABC-000')).toEqual([])
  })
  it('isTicketKey / normalizeKey', () => {
    expect(isTicketKey('WIGOS-1')).toBe(true)
    expect(isTicketKey('UTF-8')).toBe(false)
    expect(normalizeKey(' wigos-130026 ')).toBe('WIGOS-130026')
    expect(normalizeKey('sha-256')).toBeNull()
  })
})

describe('buildIndex / summarize', () => {
  const items: SourceItem[] = [
    { source: 'capture', id: 'c1', title: 'Error', at: 100, text: 'texto sin clave', keys: ['wigos-1'] },
    { source: 'clip', id: 'k1', title: 'clip', at: 300, text: 'mirar WIGOS-1 y WIGOS-2' },
    { source: 'note', id: 'WIGOS-2.md', title: 'WIGOS-2', at: 50, text: 'WIGOS-2.md\n# WIGOS-2' },
    { source: 'file', id: 'C:/x/wigos-1-propuesta.md', title: 'wigos-1-propuesta.md', at: 400, text: 'C:/x/wigos-1-propuesta.md' },
    { source: 'file', id: 'C:/x/wigos-9.md', title: 'wigos-9.md', at: 500, text: 'C:/x/wigos-9.md' },
  ]

  it('agrupa por clave, cuenta por fuente y ordena por actividad', () => {
    const index = buildIndex(items)
    expect(index.get('WIGOS-1')!.map((r) => r.id)).toEqual(['C:/x/wigos-1-propuesta.md', 'k1', 'c1'])
    expect(index.has('WIGOS-9')).toBe(false)   // archivo en minúsculas de un ticket desconocido
    const list = summarize(index, emptyMeta())
    expect(list.map((t) => t.key)).toEqual(['WIGOS-1', 'WIGOS-2'])
    expect(list[0]!.counts).toMatchObject({ capture: 1, clip: 1, file: 1 })
    expect(list[1]!.counts).toMatchObject({ clip: 1, note: 1 })
  })

  it('fijados primero, manuales aunque no tengan nada, archivos de claves conocidas', () => {
    const meta = { pinned: ['WIGOS-2'], manual: ['WIGOS-9'], titles: { 'WIGOS-2': 'Moneda' } }
    const index = buildIndex(items, meta.manual)
    const list = summarize(index, meta)
    expect(list.map((t) => t.key)).toEqual(['WIGOS-2', 'WIGOS-9', 'WIGOS-1'])
    expect(list[0]!.title).toBe('Moneda')
    expect(filterSummaries(list, 'moneda').map((t) => t.key)).toEqual(['WIGOS-2'])
    const d = detailFor('WIGOS-1', index, meta, 'https://x.atlassian.net/')
    expect(d.refs.capture).toHaveLength(1)
    expect(d.refs.file).toHaveLength(1)
    expect(d.manual).toBe(false)
  })
})

describe('textos', () => {
  it('plantilla de nota', () => {
    const t = noteTemplate('WIGOS-1', 'Caja')
    expect(t.startsWith('# WIGOS-1 — Caja')).toBe(true)
    for (const h of ['## Resumen', '## Análisis', '## Pasos', '## Pendientes']) expect(t).toContain(h)
  })
  it('url de Jira', () => {
    expect(jiraUrl('https://x.atlassian.net/', 'WIGOS-1')).toBe('https://x.atlassian.net/browse/WIGOS-1')
    expect(jiraUrl(null, 'WIGOS-1')).toBeNull()
    expect(jiraUrl('javascript:alert(1)', 'WIGOS-1')).toBeNull()
  })
  it('markdown del export', () => {
    const md = exportMarkdown('WIGOS-1', 'Caja', '### Evidencia', [{ title: 'WIGOS-1', content: '# WIGOS-1\n\nhola' }], ['C:/a.cs'])
    expect(md).toContain('# WIGOS-1 — Caja')
    expect(md).toContain('## Nota: WIGOS-1')
    expect(md).toContain('- `C:/a.cs`')
  })
})
