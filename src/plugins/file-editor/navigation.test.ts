import { describe, expect, it } from 'vitest'
import { arrangeOpenFiles, cycleIndex, orderByMru, syncMru, tabsToClose, touchMru, matchesTab } from './navigation'

const t = (id: string, path: string | null, isDirty = false) => ({ id, name: path ? path.split(/[/\\]/).pop()! : id, path, isDirty })

describe('MRU', () => {
  it('touchMru mueve al frente', () => {
    expect(touchMru(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(touchMru([], 'x')).toEqual(['x'])
  })
  it('syncMru descarta cerrados y agrega nuevos', () => {
    expect(syncMru(['c', 'a', 'z'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })
  it('orderByMru', () => {
    const tabs = [t('a', '/x/a'), t('b', '/x/b'), t('c', '/x/c')]
    expect(orderByMru(tabs, ['c', 'a']).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
  it('cycleIndex da la vuelta', () => {
    expect(cycleIndex(3, 2, 1)).toBe(0)
    expect(cycleIndex(3, 0, -1)).toBe(2)
    expect(cycleIndex(0, 0, 1)).toBe(0)
  })
})

describe('arrangeOpenFiles', () => {
  const tabs = [t('a', 'C:\\logs\\a.log'), t('b', '/src/b.ts'), t('c', 'C:\\logs\\c.log'), t('d', null)]
  it('pone los fijados arriba', () => {
    const g = arrangeOpenFiles(tabs, { isPinned: (x) => x.id === 'c' })
    expect(g).toHaveLength(1)
    expect(g[0]!.items.map((x) => x.id)).toEqual(['c', 'a', 'b', 'd'])
  })
  it('filtra por nombre o ruta', () => {
    const g = arrangeOpenFiles(tabs, { isPinned: () => false, query: 'logs' })
    expect(g[0]!.items.map((x) => x.id)).toEqual(['a', 'c'])
    expect(arrangeOpenFiles(tabs, { isPinned: () => false, query: 'nada' })).toEqual([])
  })
  it('agrupa por carpeta', () => {
    const g = arrangeOpenFiles(tabs, { isPinned: (x) => x.id === 'b', groupByFolder: true })
    expect(g.map((x) => x.label)).toEqual(['Fijados', 'logs', 'Sin guardar en disco'])
    expect(g[1]!.items.map((x) => x.id)).toEqual(['a', 'c'])
    expect(g[1]!.title).toBe('C:\\logs')
  })
  it('matchesTab ignora tildes y mayúsculas', () => {
    expect(matchesTab(t('x', '/docs/Configuración.ini'), 'configuracion')).toBe(true)
  })
})

describe('tabsToClose', () => {
  const tabs = [t('a', '/a'), t('b', '/b', true), t('c', '/c'), t('d', '/d')]
  const pinnedC = (x: { id: string }) => x.id === 'c'
  it('otros, sin tocar fijados', () => {
    expect(tabsToClose(tabs, 'a', 'others', pinnedC)).toEqual(['b', 'd'])
  })
  it('los de abajo', () => {
    expect(tabsToClose(tabs, 'b', 'below', pinnedC)).toEqual(['d'])
    expect(tabsToClose(tabs, 'zz', 'below', pinnedC)).toEqual([])
  })
  it('guardados', () => {
    expect(tabsToClose(tabs, 'a', 'saved', pinnedC)).toEqual(['a', 'd'])
  })
})
