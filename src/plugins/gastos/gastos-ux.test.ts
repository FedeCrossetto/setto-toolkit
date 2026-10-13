import { describe, it, expect } from 'vitest'
import { planLegacyMigration, type LegacyLocalState } from './cache-migration'
import { applyLearning, buildLearning, suggestCategory, suggestDescriptions, topFavorites } from './learning'
import { parseQuickAdd } from './quick-add-parser'
import {
  analyzeCsv, buildImportRows, detectDateFormat, detectNumberFormat, importedGastoId, markDuplicates, parseCsv,
  parseDateValue, parseNumberValue, similarDescription,
} from './csv-import'
import { autoPendientes, montoSugerido, shouldAutoGenerate } from './recurring'
import { applyWrites } from './sync-queue'
import { missingTableFromError } from './sync-queue'
import type { Gasto, GastosCacheState, PagoMensual, Servicio } from './types'

const g = (id: string, fecha: string, monto: number, descripcion: string, extra: Partial<Gasto> = {}): Gasto => ({
  id, fecha, monto, descripcion, categoria: 'Otro', metodoPago: 'Efectivo', moneda: 'ARS',
  created_at: `${fecha}T10:00:00.000Z`, updated_at: `${fecha}T10:00:00.000Z`, ...extra,
})

// ── Migración del caché ────────────────────────────────────────────────────

describe('planLegacyMigration', () => {
  const emptyMain: GastosCacheState = { data: null, updatedAt: null, lastSynced: null, prefs: {} }
  const legacyData = { servicios: [], pagos: [], gastos: [g('a', '2026-10-01', 10, 'cafe')] }
  const noLegacy: LegacyLocalState = { cache: null, pending: [], lastSynced: null, presupuesto: null, lastMetodo: null }

  it('sin nada en localStorage no hace nada', () => {
    expect(planLegacyMigration(noLegacy, { cache: emptyMain, pending: [] })).toEqual({ hasLegacy: false, cachePatch: null, pending: null })
  })

  it('main vacío → sube datos, lastSynced y prefs', () => {
    const plan = planLegacyMigration(
      { cache: legacyData, pending: [], lastSynced: 'v1', presupuesto: 500000, lastMetodo: 'MP' },
      { cache: emptyMain, pending: [] },
    )
    expect(plan.hasLegacy).toBe(true)
    expect(plan.cachePatch).toEqual({ data: legacyData, lastSynced: 'v1', prefs: { presupuesto: 500000, lastMetodo: 'MP' } })
    expect(plan.pending).toBeNull()
  })

  it('main más nuevo → no pisa los datos ni las prefs existentes', () => {
    const main: GastosCacheState = {
      data: { servicios: [], pagos: [], gastos: [g('b', '2026-10-02', 20, 'super')] }, updatedAt: 'x', lastSynced: 'v2',
      prefs: { presupuesto: 1, lastMetodo: 'Efectivo' },
    }
    const plan = planLegacyMigration({ ...noLegacy, cache: legacyData, lastSynced: 'v1', presupuesto: 9, lastMetodo: 'MP' }, { cache: main, pending: [] })
    expect(plan.hasLegacy).toBe(true)
    expect(plan.cachePatch).toBeNull()
  })

  it('localStorage más nuevo → reemplaza los datos', () => {
    const main: GastosCacheState = { data: { servicios: [], pagos: [], gastos: [g('b', '2026-10-02', 20, 'x')] }, updatedAt: 'x', lastSynced: '2026-01-01', prefs: {} }
    const plan = planLegacyMigration({ ...noLegacy, cache: legacyData, lastSynced: '2026-05-01' }, { cache: main, pending: [] })
    expect(plan.cachePatch?.data).toBe(legacyData)
  })

  it('pendientes: se combinan sin perder ninguno y compactando la misma entidad', () => {
    const w1 = { channel: 'gastos:save-gasto', args: [g('a', '2026-10-01', 10, 'cafe')] }
    const w1b = { channel: 'gastos:save-gasto', args: [g('a', '2026-10-01', 12, 'cafe')] }
    const w2 = { channel: 'gastos:save-gasto', args: [g('c', '2026-10-01', 5, 'pan')] }
    const plan = planLegacyMigration({ ...noLegacy, pending: [w1b, w2] }, { cache: emptyMain, pending: [w1] })
    expect(plan.pending).toEqual([w1b, w2])
    // Los datos resultantes reflejan la última edición
    expect(applyWrites({ servicios: [], pagos: [], gastos: [] }, plan.pending!).gastos.map((x) => x.monto)).toEqual([12, 5])
  })

  it('missingTableFromError lee la tabla del prefijo del main', () => {
    expect(missingTableFromError('Error: GASTOS_TABLE_MISSING(pagos): x')).toBe('pagos')
    expect(missingTableFromError('Error: GASTOS_TABLE_MISSING: x')).toBe('gastos')
    expect(missingTableFromError('fetch failed')).toBeNull()
  })
})

// ── Aprendizaje / autocompletado ───────────────────────────────────────────

describe('learning', () => {
  const history: Gasto[] = [
    g('1', '2026-10-01', 1500, 'Café', { categoria: 'Comida afuera', metodoPago: 'MP' }),
    g('2', '2026-10-03', 1700, 'cafe', { categoria: 'Comida afuera', metodoPago: 'MP' }),
    g('3', '2026-10-05', 1600, 'Café', { categoria: 'Comida afuera', metodoPago: 'Efectivo' }),
    g('4', '2026-09-01', 45000, 'Coto', { categoria: 'Supermercado', metodoPago: 'Débito' }),
    g('5', '2026-09-15', 52000, 'Coto', { categoria: 'Supermercado', metodoPago: 'Débito' }),
    g('6', '2025-01-01', 3000, 'Cabify', { categoria: 'Transporte', metodoPago: 'Crédito' }),
    g('7', '2026-10-06', 20, 'Spotify', { categoria: 'Ocio', metodoPago: 'Crédito', moneda: 'USD' }),
    g('8', '2026-09-06', 20, 'Spotify', { categoria: 'Ocio', metodoPago: 'Crédito', moneda: 'USD' }),
  ]
  const L = buildLearning(history)
  const today = '2026-10-11'

  it('agrupa por descripción normalizada con moda y monto típico', () => {
    const cafe = L.get('cafe')!
    expect(cafe.count).toBe(3)
    expect(cafe.categoria).toBe('Comida afuera')
    expect(cafe.metodoPago).toBe('MP')
    expect(cafe.montoTipico).toBe(1600)
    expect(cafe.descripcion).toBe('Café')
  })

  it('autocompletado: prefijo antes que inicio de palabra; empate por frecuencia/recencia', () => {
    expect(suggestDescriptions(L, 'c', today).map((e) => e.key)).toEqual(['cafe', 'coto', 'cabify'])
    expect(suggestDescriptions(L, 'spo', today).map((e) => e.key)).toEqual(['spotify'])
    expect(suggestDescriptions(L, 'cafe', today)).toEqual([]) // ya completo
    expect(suggestDescriptions(L, '', today)).toEqual([])
  })

  it('favoritos: frecuentes y recientes (descarta los de un solo uso)', () => {
    const favs = topFavorites(L, today).map((e) => e.key)
    expect(favs[0]).toBe('cafe')
    expect(favs).not.toContain('cabify')
  })

  it('applyLearning completa categoría, método y moneda no escritos', () => {
    const p = applyLearning(parseQuickAdd('20 spotify', new Date(2026, 9, 11)), L)
    expect(p).toMatchObject({ categoria: 'Ocio', metodoPago: 'Crédito', moneda: 'USD', learned: true })
    // Lo escrito explícitamente manda
    const q = applyLearning(parseQuickAdd('20 spotify pesos efectivo #regalos', new Date(2026, 9, 11)), L)
    expect(q).toMatchObject({ categoria: 'Regalos', metodoPago: 'Efectivo', moneda: 'ARS' })
  })

  it('suggestCategory: exacto, por palabras compartidas o por palabra clave', () => {
    expect(suggestCategory(L, 'COTO')).toBe('Supermercado')
    expect(suggestCategory(L, 'Pago COTO SUC 123')).toBe('Supermercado')
    expect(suggestCategory(L, 'Farmacia del pueblo')).toBe('Salud')
    expect(suggestCategory(L, 'xyz')).toBeNull()
  })
})

// ── CSV ────────────────────────────────────────────────────────────────────

const MP_CSV = [
  'INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE',
  '10.000,00;50.000,00;-12.345,67;47.654,33',
  '',
  'RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE',
  '01-10-2026;Pago Coto;123456789;-12.000,50;-2.000,50',
  '02-10-2026;Transferencia recibida Juan Perez;123456790;50.000,00;48.000,00',
  '03-10-2026;"Pago Café; Martínez";123456791;-345,17;47.654,33',
].join('\r\n')

const BANK_CSV = [
  'Banco Ejemplo - Movimientos de cuenta',
  'Cuenta: CA $ 123-456/7',
  '',
  'Fecha,Concepto,Débito,Crédito,Saldo',
  '28/09/2026,COMPRA DEBITO FARMACITY,"1.234,50",,"98.765,50"',
  '29/09/2026,ACREDITACION HABERES,,"500.000,00","598.765,50"',
  '30/09/2026,DEBITO AUTOMATICO NETFLIX,"7.999,00",,"590.766,50"',
].join('\n')

const GENERIC_CSV = 'date,description,amount,currency\n2026-10-04,Steam,-19.99,USD\n2026-10-05,Lunch,"-1,250.00",ARS\n'

describe('csv-import', () => {
  it('parseCsv respeta comillas, separador dentro de comillas y "" escapado', () => {
    expect(parseCsv('a;"b;c";"d ""x"""\n1;2;3', ';')).toEqual([['a', 'b;c', 'd "x"'], ['1', '2', '3']])
  })

  it('números y fechas en formatos argentinos y anglos', () => {
    expect(parseNumberValue('-12.000,50', 'es')).toBe(-12000.5)
    expect(parseNumberValue('$ 1.234,56', 'es')).toBe(1234.56)
    expect(parseNumberValue('(1.000)', 'es')).toBe(-1000)
    expect(parseNumberValue('150,00-', 'es')).toBe(-150)
    expect(parseNumberValue('-1,250.00', 'en')).toBe(-1250)
    expect(parseNumberValue('', 'es')).toBeNull()
    expect(detectNumberFormat(['1.234,56', '-345,17'])).toBe('es')
    expect(detectNumberFormat(['-19.99', '-1,250.00'])).toBe('en')
    expect(detectDateFormat(['01-10-2026', '25-09-2026'])).toBe('dmy')
    expect(detectDateFormat(['10/25/2026'])).toBe('mdy')
    expect(detectDateFormat(['2026-10-04T10:00:00Z'])).toBe('ymd')
    expect(parseDateValue('31/02/2026', 'dmy')).toBeNull()
    expect(parseDateValue('5/1/26 13:45', 'dmy')).toBe('2026-01-05')
  })

  it('Mercado Pago: encuentra la tabla real, gastos = negativos', () => {
    const a = analyzeCsv(MP_CSV)
    expect(a.source).toBe('mp')
    expect(a.table.delimiter).toBe(';')
    expect(a.table.headers[0]).toBe('RELEASE_DATE')
    expect(a.mapping).toMatchObject({ fecha: 0, descripcion: 1, monto: 3, debito: -1, credito: -1 })
    expect(a.dateFormat).toBe('dmy')
    expect(a.numberFormat).toBe('es')
    const rows = buildImportRows(a.table, a.mapping, a)
    expect(rows.map((r) => [r.fecha, r.descripcion, r.monto, r.kind])).toEqual([
      ['2026-10-01', 'Pago Coto', 12000.5, 'gasto'],
      ['2026-10-02', 'Transferencia recibida Juan Perez', 50000, 'ingreso'],
      ['2026-10-03', 'Pago Café; Martínez', 345.17, 'gasto'],
    ])
  })

  it('home banking: débito/crédito en columnas, salta el preámbulo', () => {
    const a = analyzeCsv(BANK_CSV)
    expect(a.source).toBe('banco')
    expect(a.table.delimiter).toBe(',')
    expect(a.mapping).toMatchObject({ fecha: 0, descripcion: 1, debito: 2, credito: 3, monto: -1 })
    const rows = buildImportRows(a.table, a.mapping, a)
    expect(rows.map((r) => [r.fecha, r.monto, r.kind])).toEqual([
      ['2026-09-28', 1234.5, 'gasto'],
      ['2026-09-29', 500000, 'ingreso'],
      ['2026-09-30', 7999, 'gasto'],
    ])
  })

  it('genérico en inglés con moneda por fila', () => {
    const a = analyzeCsv(GENERIC_CSV)
    expect(a.source).toBe('generico')
    expect(a.numberFormat).toBe('en')
    const rows = buildImportRows(a.table, a.mapping, a)
    expect(rows.map((r) => [r.fecha, r.monto, r.moneda, r.kind])).toEqual([
      ['2026-10-04', 19.99, 'USD', 'gasto'],
      ['2026-10-05', 1250, 'ARS', 'gasto'],
    ])
  })

  it('todos positivos → todos son gastos; filas inválidas marcan error', () => {
    const a = analyzeCsv('Fecha;Detalle;Importe\n01/10/2026;Kiosco;500\nxx;Roto;100\n02/10/2026;Sin monto;\n')
    const rows = buildImportRows(a.table, a.mapping, a)
    expect(rows.map((r) => [r.kind, r.error])).toEqual([['gasto', undefined], ['gasto', 'Fecha inválida'], ['gasto', 'Sin monto']])
  })

  it('duplicados: misma fecha + monto + descripción parecida', () => {
    expect(similarDescription('super coto', 'COMPRA DEBITO COTO 123')).toBe(true)
    expect(similarDescription('farmacia', 'Netflix')).toBe(false)
    const existing = [g('x', '2026-10-01', 12000.5, 'super coto'), g('y', '2026-10-03', 345.17, 'Netflix')]
    const a = analyzeCsv(MP_CSV)
    const rows = markDuplicates(buildImportRows(a.table, a.mapping, a), existing)
    expect(rows.map((r) => r.duplicateOf ?? null)).toEqual(['x', null, null])
  })

  it('importedGastoId es estable', () => {
    const r = { fecha: '2026-10-01', monto: 10, descripcion: 'Pago Coto' }
    expect(importedGastoId(r)).toBe(importedGastoId({ ...r, descripcion: 'pago  coto' }))
    expect(importedGastoId(r)).not.toBe(importedGastoId(r, 1))
  })
})

// ── Pendientes automáticos ─────────────────────────────────────────────────

describe('recurring', () => {
  const servicios: Servicio[] = [
    { id: 'luz', nombre: 'Luz', emoji: '', categoria: 'Casa', activo: true, orden: 0 },
    { id: 'gas', nombre: 'Gas', emoji: '', categoria: 'Casa', activo: true, orden: 1 },
    { id: 'old', nombre: 'Viejo', emoji: '', categoria: 'Casa', activo: false, orden: 2 },
  ]
  const pagos: PagoMensual[] = [{ id: 'luz-2026-09', servicioId: 'luz', mes: '2026-09', monto: 30000, pagado: true }]
  const now = new Date(2026, 9, 11)
  const base = { mes: '2026-10', now, prefs: {}, fresh: true, pagosReady: true }

  it('sólo el mes actual, con datos frescos, una vez por mes', () => {
    expect(shouldAutoGenerate(base)).toBe(true)
    expect(shouldAutoGenerate({ ...base, mes: '2026-09' })).toBe(false)
    expect(shouldAutoGenerate({ ...base, fresh: false })).toBe(false)
    expect(shouldAutoGenerate({ ...base, pagosReady: false })).toBe(false)
    expect(shouldAutoGenerate({ ...base, prefs: { autoPendientesMes: '2026-10' } })).toBe(false)
  })

  it('genera con id estable y último monto, y es idempotente', () => {
    const first = autoPendientes({ servicios, pagos }, base)
    expect(first).toEqual([
      { id: 'luz-2026-10', servicioId: 'luz', mes: '2026-10', monto: 30000, pagado: false },
      { id: 'gas-2026-10', servicioId: 'gas', mes: '2026-10', monto: 0, pagado: false },
    ])
    // Volver a correrlo con lo generado aplicado no crea nada nuevo
    expect(autoPendientes({ servicios, pagos: [...pagos, ...first] }, base)).toEqual([])
    // Si ya había un pago del mes con otro id para ese servicio, tampoco lo duplica
    const manual: PagoMensual = { id: 'otro-id', servicioId: 'gas', mes: '2026-10', monto: 5, pagado: true }
    expect(autoPendientes({ servicios, pagos: [...pagos, manual] }, base).map((p) => p.servicioId)).toEqual(['luz'])
  })

  it('montoSugerido usa el último conocido cuando el pendiente no tiene monto', () => {
    expect(montoSugerido(pagos, { id: 'luz-2026-10', servicioId: 'luz', mes: '2026-10', monto: 0, pagado: false })).toBe(30000)
    expect(montoSugerido(pagos, { id: 'luz-2026-10', servicioId: 'luz', mes: '2026-10', monto: 31000, pagado: false })).toBe(31000)
  })
})
