import { describe, expect, it } from 'vitest'
import { classifyWriteError, dropSuperseded, enqueue, flushQueue, settleQueue } from './sync-queue'
import { quickGastoFromText } from './quick-gasto'
import { buildLearning } from './learning'
import type { Gasto, PendingWrite } from './types'

const g = (id: string, monto = 1): Gasto => ({
  id, fecha: '2026-10-01', monto, descripcion: 'x', categoria: 'Otro', metodoPago: 'Efectivo', moneda: 'ARS',
  created_at: '', updated_at: '',
})
const save = (id: string, monto = 1): PendingWrite => ({ channel: 'gastos:save-gasto', args: [g(id, monto)] })

describe('dropSuperseded', () => {
  it('removes queued writes for the same entity after a direct write succeeds', () => {
    const q = [save('a', 1), save('b'), { channel: 'gastos:delete-gasto', args: ['c'] }]
    expect(dropSuperseded(q, save('a', 2))).toEqual([q[1], q[2]])
    expect(dropSuperseded(q, { channel: 'gastos:save-gasto', args: [g('c')] })).toEqual([q[0], q[1]])
  })

  it('a bulk pagos write supersedes each queued pago; unrelated queues stay identical', () => {
    const pago = (id: string) => ({ id, servicioId: 's', mes: '2026-10', monto: 1, pagado: true })
    const q: PendingWrite[] = [{ channel: 'gastos:save-pago', args: [pago('p1')] }, { channel: 'gastos:save-pago', args: [pago('p2')] }]
    expect(dropSuperseded(q, { channel: 'gastos:save-pagos-bulk', args: [[pago('p1')]] })).toEqual([q[1]])
    expect(dropSuperseded(q, save('zzz'))).toBe(q)
  })
})

describe('flushQueue + settleQueue', () => {
  it('keeps writes enqueued while the push was running', async () => {
    let queue = [save('a'), save('b')]
    const r = await flushQueue([...queue], async (w) => {
      // Mientras se sube "a", el usuario edita "b" y agrega "c".
      if ((w.args[0] as Gasto).id === 'a') queue = enqueue(enqueue(queue, save('b', 99)), save('c'))
    })
    const next = settleQueue(queue, r)
    expect(next.map((w) => [(w.args[0] as Gasto).id, (w.args[0] as Gasto).monto])).toEqual([['b', 99], ['c', 1]])
  })

  it('discards validation rejections, keeps missing-table writes and stops on network errors', async () => {
    const q = [save('bad'), save('missing'), save('ok'), save('net'), save('after')]
    const r = await flushQueue(q, async (w) => {
      const id = (w.args[0] as Gasto).id
      if (id === 'bad') throw new Error("Error invoking remote method 'gastos:save-gasto': Error: Monto inválido")
      if (id === 'missing') throw new Error('GASTOS_TABLE_MISSING(gastos): no existe')
      if (id === 'net') throw new Error('TypeError: fetch failed')
    })
    expect(r.rejected.map((x) => (x.write.args[0] as Gasto).id)).toEqual(['bad'])
    expect(r.missing).toEqual(['gastos'])
    expect(String(r.error)).toContain('fetch failed')
    expect(settleQueue(q, r).map((w) => (w.args[0] as Gasto).id)).toEqual(['missing', 'net', 'after'])
  })
})

describe('classifyWriteError', () => {
  it.each([
    ['Error: Monto inválido', 'rejected'],
    ['duplicate key value violates unique constraint "x"', 'rejected'],
    ['invalid input syntax for type numeric (22P02)', 'rejected'],
    ['TypeError: fetch failed', 'offline'],
    ['timeout: Supabase no respondió en 12 s', 'offline'],
    ['SUPABASE_NOT_CONFIGURED: configurá URL', 'offline'],
    ['Algo raro', 'offline'],
    ['GASTOS_TABLE_MISSING(pagos): x', 'missing-table'],
  ])('%s → %s', (msg, kind) => {
    expect(classifyWriteError(new Error(msg))).toBe(kind)
  })
})

describe('quickGastoFromText', () => {
  const now = new Date(2026, 9, 18, 12)

  it('builds a gasto from the quick-add parser (last method as fallback)', () => {
    const r = quickGastoFromText('4500 super', { now, lastMethod: 'MP', id: 'x' })
    expect(r).toMatchObject({ id: 'x', monto: 4500, categoria: 'Supermercado', metodoPago: 'MP', moneda: 'ARS', fecha: '2026-10-18' })
  })

  it('uses what was learned for that description', () => {
    const learning = buildLearning([{ ...g('old', 3000), descripcion: 'nafta', categoria: 'Transporte', metodoPago: 'Crédito', fecha: '2026-10-01' }])
    expect(quickGastoFromText('3500 nafta', { now, learning })).toMatchObject({ categoria: 'Transporte', metodoPago: 'Crédito' })
  })

  it('is ambiguous (null) without an amount, with zero, or with several lines', () => {
    expect(quickGastoFromText('super', { now })).toBeNull()
    expect(quickGastoFromText('0 super', { now })).toBeNull()
    expect(quickGastoFromText('100 a\n200 b', { now })).toBeNull()
    expect(quickGastoFromText('   ', { now })).toBeNull()
  })
})
