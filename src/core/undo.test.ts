import { describe, it, expect, vi } from 'vitest'
import { runUndoable } from './undo'
import type { ToastAction } from './components/Toast'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('runUndoable', () => {
  it('aplica, ofrece Deshacer y deshace una sola vez', async () => {
    const calls: { msg: string; type?: string; action?: ToastAction }[] = []
    const show = vi.fn((msg: string, type?: string, _ms?: number, action?: ToastAction) => { calls.push({ msg, type, action }) })
    const apply = vi.fn()
    const undo = vi.fn()
    expect(await runUndoable({ message: 'Borrado', apply, undo }, show)).toBe(true)
    expect(apply).toHaveBeenCalledOnce()
    expect(calls[0]).toMatchObject({ msg: 'Borrado', type: 'success' })
    expect(calls[0]!.action!.label).toBe('Deshacer')
    calls[0]!.action!.onClick()
    calls[0]!.action!.onClick()
    await flush()
    expect(undo).toHaveBeenCalledOnce()
    expect(calls.at(-1)).toMatchObject({ msg: 'Cambio deshecho', type: 'info' })
  })

  it('si apply falla muestra error y no ofrece deshacer', async () => {
    const show = vi.fn()
    const ok = await runUndoable({ message: 'x', apply: () => { throw new Error('boom') }, undo: vi.fn() }, show)
    expect(ok).toBe(false)
    expect(show).toHaveBeenCalledWith('No se pudo completar: boom', 'error')
  })

  it('si undo falla avisa el error', async () => {
    const show = vi.fn()
    await runUndoable({ message: 'x', apply: vi.fn(), undo: () => Promise.reject(new Error('nope')) }, show)
    const action = show.mock.calls[0]![3] as ToastAction
    action.onClick()
    await flush(); await flush()
    expect(show).toHaveBeenLastCalledWith('No se pudo deshacer: nope', 'error')
  })
})
