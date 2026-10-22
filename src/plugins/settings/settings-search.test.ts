import { describe, expect, it } from 'vitest'
import { matchesAll, normalizeSearch } from './settings-search'

describe('búsqueda en ajustes', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(normalizeSearch('Animación')).toBe('animacion')
    expect(matchesAll('Fondo Mica (Windows 11)', 'mica')).toBe(true)
    expect(matchesAll('Tamaño de la interfaz', 'tamano interfaz')).toBe(true)
    expect(matchesAll('Respaldo automático', 'respaldo fuente')).toBe(false)
  })
})
