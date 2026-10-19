import { describe, expect, it, vi } from 'vitest'

vi.mock('./logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('electron', () => ({}))

import { guardInvoke, guardOn, installIpcGuard, isMainOnlyChannel, IpcDeniedError } from './ipc-guard'

const mainWc = { id: 1 } as never
const dockWc = { id: 2 } as never
const isMain = (wc: unknown): boolean => wc === mainWc

describe('isMainOnlyChannel', () => {
  it('marca los canales sensibles', () => {
    for (const ch of ['terminal:create', 'terminal:input', 'editor:write-file', 'editor:delete', 'settings:set',
      'credentials:reveal', 'credentials:export-csv', 'backup:restore', 'backup:export']) {
      expect(isMainOnlyChannel(ch), ch).toBe(true)
    }
  })
  it('deja pasar lo que usan la barra y el selector', () => {
    for (const ch of ['credentials:top', 'credentials:copy-password', 'dock:paste', 'settings:get', 'snippets:load', 'notes:write', 'clipboard:history']) {
      expect(isMainOnlyChannel(ch), ch).toBe(false)
    }
  })
})

describe('guardInvoke / guardOn', () => {
  it('rechaza un canal sensible desde otra ventana', () => {
    const fn = vi.fn(() => 'ok')
    const g = guardInvoke('settings:set', fn, isMain as never)
    expect(g({ sender: mainWc } as never)).toBe('ok')
    expect(() => g({ sender: dockWc } as never)).toThrow(IpcDeniedError)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('no envuelve canales comunes', () => {
    const fn = vi.fn()
    expect(guardInvoke('settings:get', fn, isMain as never)).toBe(fn)
    expect(guardOn('dock:move', fn, isMain as never)).toBe(fn)
  })
  it('descarta mensajes sensibles de otra ventana', () => {
    const fn = vi.fn()
    const g = guardOn('terminal:input', fn, isMain as never)
    g({ sender: dockWc } as never, 'rm -rf /')
    expect(fn).not.toHaveBeenCalled()
    g({ sender: mainWc } as never, 'ls')
    expect(fn).toHaveBeenCalledWith({ sender: mainWc }, 'ls')
  })
})

describe('installIpcGuard', () => {
  it('envuelve los handlers registrados después', async () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>()
    const ipc = {
      handle: (ch: string, l: (...a: unknown[]) => unknown) => { handlers.set(ch, l) },
      on: (ch: string, l: (...a: unknown[]) => unknown) => { handlers.set(ch, l) },
    }
    installIpcGuard(ipc as never, isMain as never)
    ipc.handle('backup:restore', () => 'restored')
    ipc.handle('credentials:top', () => 'top')
    expect(() => handlers.get('backup:restore')!({ sender: dockWc })).toThrow(/ventana principal/)
    expect(handlers.get('backup:restore')!({ sender: mainWc })).toBe('restored')
    expect(handlers.get('credentials:top')!({ sender: dockWc })).toBe('top')
  })
})
