import { describe, expect, it } from 'vitest'
import { buildTicketComment } from './ticket-comment'
import { uniqueExportNames } from './naming'
import type { CaptureEntry } from './types'

const cap = (p: Partial<CaptureEntry>): CaptureEntry => ({
  id: 'a', file: 'x.png', createdAt: new Date(2026, 9, 12, 17, 12).getTime(), width: 1, height: 1, bytes: 1,
  title: 'WigosGUI - Error', ticket: 'WIGOS-1', tags: [], note: '', pinned: false, ocr: null, app: 'WigosGUI', ...p,
})

describe('buildTicketComment', () => {
  const material = {
    ticket: 'WIGOS-1',
    captures: [
      cap({ id: '2', createdAt: new Date(2026, 9, 12, 18, 0).getTime(), title: 'Después', ocr: 'linea 1\nlinea 2\nClave: Secreta123' }),
      cap({ id: '1', note: 'Al abrir caja' }),
    ],
    notes: ['Proyecto X'],
    clips: ['SELECT 1'],
  }
  it('jira: chronological, image names match the export, OCR in noformat', () => {
    const t = buildTicketComment(material, 'jira')
    expect(t.startsWith('h3. Evidencia — WIGOS-1')).toBe(true)
    expect(t.indexOf('WigosGUI - Error')).toBeLessThan(t.indexOf('Después'))
    expect(t).toContain('!WIGOS-1 - WigosGUI - Error - 2026-10-12 17-12.png|thumbnail!')
    expect(t).toContain('Al abrir caja')
    expect(t).toContain('{noformat}\nlinea 1\nlinea 2\nClave: ••••••\n{noformat}')
    expect(t).not.toContain('Secreta123')
    expect(t).toContain('*Notas relacionadas:* Proyecto X')
    expect(t).toContain('{code}\nSELECT 1\n{code}')
  })
  it('markdown and without OCR', () => {
    const t = buildTicketComment(material, 'md', false)
    expect(t).toContain('### Evidencia — WIGOS-1')
    expect(t).toContain('1. **WigosGUI - Error**')
    expect(t).not.toContain('linea 1')
  })
  it('repeated names get the same suffix as the export', () => {
    expect(uniqueExportNames([cap({}), cap({})])).toEqual([
      'WIGOS-1 - WigosGUI - Error - 2026-10-12 17-12.png', 'WIGOS-1 - WigosGUI - Error - 2026-10-12 17-12 (2).png',
    ])
  })
})

describe('exportFileName', () => {
  it('strips characters invalid in Windows file names, including backslash', () => {
    expect(uniqueExportNames([cap({ title: 'C:\\temp\\log: "x" <y>' })])[0]).toBe('WIGOS-1 - C temp log x y - 2026-10-12 17-12.png')
  })
})
