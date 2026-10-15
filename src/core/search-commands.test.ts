import { describe, expect, it } from 'vitest'
import { commandsSearchProvider } from './search-commands'

const titles = async (q: string): Promise<string[]> => (await commandsSearchProvider.search(q)).map((i) => i.title)

describe('commandsSearchProvider', () => {
  it('nada con texto común o muy corto', async () => {
    expect(await titles('ab')).toEqual([])
    expect(await titles('reunión con el equipo')).toEqual([])
  })

  it('ruta de archivo: abrir en el editor y mostrar en el Explorador', async () => {
    expect(await titles('C:\\Program Files (x86)\\WinSystem\\WSI.Cashier.cfg')).toEqual(['Abrir en el editor', 'Mostrar en el Explorador'])
    expect(await titles('"D:\\logs\\CASHIER_20261015.txt"')).toEqual(['Abrir en el editor', 'Mostrar en el Explorador'])
  })

  it('ruta de carpeta: sólo abrir la carpeta', async () => {
    expect(await titles('C:\\Repos\\mytools-app')).toEqual(['Abrir la carpeta'])
  })

  it('ticket solo o dentro de un link de Jira', async () => {
    expect(await titles('WIGOS-133000')).toEqual(['Todo lo de WIGOS-133000', 'Abrir WIGOS-133000 en Jira'])
    const fromUrl = await titles('https://jira.example.com/browse/WIGOS-132762')
    expect(fromUrl[0]).toBe('Todo lo de WIGOS-132762')
    expect(fromUrl).toContain('Abrir en el navegador')
  })

  it('JSON: verlo en Utilidades', async () => {
    expect(await titles('{"a": 1, "b": [2, 3]}')).toEqual(['Ver en Utilidades (JSON)'])
  })
})
