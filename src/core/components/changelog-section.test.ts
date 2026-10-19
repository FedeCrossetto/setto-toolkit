import { describe, expect, it } from 'vitest'
import { changelogSection } from './changelog-section'

const LOG = `# Changelog

## 2.14.0 (sin publicar)

### Diseño
- Líneas finas

## 2.13.0
- Tailwind 4
`

describe('changelogSection', () => {
  it('devuelve sólo la sección de la versión pedida', () => {
    expect(changelogSection(LOG, '2.14.0')).toBe('### Diseño\n- Líneas finas')
    expect(changelogSection(LOG, '2.13.0')).toBe('- Tailwind 4')
  })
  it('vacío si la versión no está', () => {
    expect(changelogSection(LOG, '9.9.9')).toBe('')
  })
})
