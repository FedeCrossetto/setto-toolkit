import { describe, expect, it } from 'vitest'
import { runUserScript } from './script-runner'

describe('runUserScript (worker aislado)', () => {
  it('reads/writes environment vars and logs', async () => {
    const r = await runUserScript(`pm.environment.set('token', pm.response.json().t); pm.environment.unset('old'); console.log('ok', 1)`,
      { old: 'x', keep: 'y' }, { status: 200, body: '{"t":"abc"}', headers: {} })
    expect(r.error).toBeUndefined()
    expect(r.envVars).toEqual({ keep: 'y', token: 'abc' })
    expect(r.logs).toEqual(['ok 1'])
  })
  it('does not expose host Function via pm/console prototypes', async () => {
    const r = await runUserScript(`const F = pm.environment.get.constructor.constructor; pm.environment.set('p', typeof F('return typeof process')())`, {})
    // codeGeneration is disabled inside the context → throws; and even if not, `process` is not defined there.
    expect(r.envVars['p']).not.toBe('object')
    const r2 = await runUserScript(`pm.environment.set('p', typeof globalThis.process + typeof require)`, {})
    expect(r2.envVars['p']).toBe('undefinedundefined')
  })
  it('blocks eval and new Function', async () => {
    const r = await runUserScript(`eval('1+1')`, {})
    expect(r.error).toMatch(/code generation|eval/i)
    const r2 = await runUserScript(`new Function('return 1')()`, {})
    expect(r2.error).toBeDefined()
  })
  it('times out infinite loops and reports the error', async () => {
    const r = await runUserScript('while (true) {}', { a: '1' }, undefined, 50)
    expect(r.error).toMatch(/timed out/i)
    expect(r.envVars).toEqual({ a: '1' })
  })
  it('kills the worker when something hangs outside vm (hard timeout)', async () => {
    // El getter de `message` se ejecuta fuera del runInContext con timeout: sólo el corte duro lo frena.
    const t0 = Date.now()
    const r = await runUserScript(`throw { get message() { for (;;) {} } }`, { a: '1' }, undefined, 200)
    expect(r.error).toMatch(/timed out/i)
    expect(r.envVars).toEqual({ a: '1' })
    expect(Date.now() - t0).toBeLessThan(4000)
  })
  it('stops scripts that exhaust memory', async () => {
    const r = await runUserScript(`const a = []; for (;;) a.push(new Array(1e6).fill(1.5))`, {}, undefined, 2000)
    expect(r.error).toBeDefined()
  }, 15_000)
  it('keeps logs written before an error', async () => {
    const r = await runUserScript(`console.log('antes'); throw new Error('boom')`, {})
    expect(r.error).toBe('boom')
    expect(r.logs).toEqual(['antes'])
  })
  it('returns plain data even if the script passes objects', async () => {
    const r = await runUserScript(`pm.environment.set('x', { toString() { return 'y' } })`, {})
    expect(r.envVars).toEqual({ x: 'y' })
  })
})
