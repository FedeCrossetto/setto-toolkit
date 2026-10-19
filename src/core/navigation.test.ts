import { describe, it, expect } from 'vitest'
import { touchMounted, recentOrder, cycle, sidebarOrder, MOUNT_LIMIT } from './navigation'
import type { Tab } from './types'

const tabs = (...ids: string[]): Tab[] => ids.map((id) => ({ tabId: id, pluginId: id }))
const ids = (t: Tab[]): string[] => t.map((x) => x.tabId)

describe('touchMounted', () => {
  it('mueve el activo al final', () => {
    expect(ids(touchMounted(tabs('a', 'b', 'c'), 'a', {}))).toEqual(['b', 'c', 'a'])
  })
  it('devuelve el mismo array si no cambia nada', () => {
    const t = tabs('a', 'b')
    expect(touchMounted(t, 'b', {})).toBe(t)
  })
  it('desmonta los menos recientes por encima del límite', () => {
    expect(ids(touchMounted(tabs('a', 'b', 'c', 'd'), 'd', {}, 2))).toEqual(['c', 'd'])
  })
  it('nunca desmonta un módulo con cambios sin guardar', () => {
    expect(ids(touchMounted(tabs('a', 'b', 'c', 'd'), 'd', { a: true }, 2))).toEqual(['a', 'd'])
  })
  it('respeta los módulos persistentes (keep)', () => {
    expect(ids(touchMounted(tabs('t', 'b', 'c'), 'c', {}, 2, (id) => id === 't'))).toEqual(['t', 'c'])
  })
  it('se pasa del límite si todos están sucios', () => {
    expect(ids(touchMounted(tabs('a', 'b', 'c'), 'c', { a: true, b: true }, 2))).toEqual(['a', 'b', 'c'])
  })
  it('límite por defecto razonable', () => {
    const many = tabs('1', '2', '3', '4', '5', '6', '7', '8')
    expect(touchMounted(many, '8', {}).length).toBe(MOUNT_LIMIT)
  })
})

describe('recentOrder / cycle', () => {
  it('ordena del más al menos reciente', () => {
    expect(recentOrder(tabs('a', 'b', 'c'))).toEqual(['c', 'b', 'a'])
  })
  it('cicla con vuelta en ambas direcciones', () => {
    expect(cycle(3, 2, 1)).toBe(0)
    expect(cycle(3, 0, -1)).toBe(2)
    expect(cycle(0, 0, 1)).toBe(0)
  })
})

describe('sidebarOrder', () => {
  it('agrupa por sección y deja los fijados al final, sin Acerca de', () => {
    const list = [
      { id: 'inicio', section: 'personal' },
      { id: 'editor', section: 'dev' },
      { id: 'ajustes', pinned: true },
      { id: 'snippets', section: 'personal' },
      { id: 'about', pinned: true },
    ]
    expect(sidebarOrder(list).map((p) => p.id)).toEqual(['inicio', 'snippets', 'editor', 'ajustes'])
  })
})
