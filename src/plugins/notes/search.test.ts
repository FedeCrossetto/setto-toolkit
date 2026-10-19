import { describe, expect, it } from 'vitest'
import { blocSearchProvider } from './search'

const titles = async (q: string): Promise<string[]> => (await blocSearchProvider.search(q)).map((i) => i.title)

describe('blocSearchProvider', () => {
  it('no ocupa lugar sin búsqueda', async () => expect(await titles('')).toEqual([]))
  it('aparece buscando bloc, anotador o nota rápida', async () => {
    expect(await titles('bloc')).toEqual(['Bloc'])
    expect(await titles('anotador')).toEqual(['Bloc'])
    expect(await titles('nota rapida')).toEqual(['Bloc'])
  })
  it('no aparece con otra cosa', async () => expect(await titles('gastos')).toEqual([]))
  it('no depende del módulo Notas (viene oculto)', () => expect(blocSearchProvider.pluginId).toBeUndefined())
})
