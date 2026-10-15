import { describe, expect, it } from 'vitest'
import { splitShortcut } from './GlobalTooltip'

describe('splitShortcut', () => {
  it('separa el atajo del final', () => {
    expect(splitShortcut('Guardar (Ctrl+S)')).toEqual({ label: 'Guardar', keys: ['Ctrl', 'S'] })
    expect(splitShortcut('Nueva sesión (Ctrl+T)')).toEqual({ label: 'Nueva sesión', keys: ['Ctrl', 'T'] })
    expect(splitShortcut('Quitar del historial (Supr)')).toEqual({ label: 'Quitar del historial', keys: ['Supr'] })
    expect(splitShortcut('Atajos (F1)')).toEqual({ label: 'Atajos', keys: ['F1'] })
    expect(splitShortcut('Modo zen (Ctrl + Shift + Z)')).toEqual({ label: 'Modo zen', keys: ['Ctrl', 'Shift', 'Z'] })
  })
  it('deja igual lo que no es un atajo', () => {
    expect(splitShortcut('Copiar el servidor (como en SSMS)')).toEqual({ label: 'Copiar el servidor (como en SSMS)', keys: [] })
    expect(splitShortcut('Abrir Setto')).toEqual({ label: 'Abrir Setto', keys: [] })
  })
})
