/**
 * Captura rápida → gasto listo para guardar (puro). Usa el mismo parser y el mismo aprendizaje
 * que el agregado rápido de Gastos. Devuelve `null` cuando el texto es ambiguo (sin monto, monto
 * cero o varias líneas): en ese caso se abre Gastos con el texto para completarlo ahí.
 */
import { randomId } from './format'
import { applyLearning, type Learning } from './learning'
import { parseQuickAdd } from './quick-add-parser'
import type { Gasto } from './types'

export function quickGastoFromText(
  text: string,
  opts: { learning?: Learning; lastMethod?: string | null; now?: Date; id?: string } = {},
): Gasto | null {
  const value = text.trim()
  if (!value || value.includes('\n')) return null
  const now = opts.now ?? new Date()
  const base = parseQuickAdd(value, now)
  const p = opts.learning ? applyLearning(base, opts.learning) : base
  if (p.monto === null || !(p.monto > 0)) return null
  const iso = now.toISOString()
  return {
    id: opts.id ?? randomId(),
    fecha: p.fecha,
    monto: p.monto,
    moneda: p.moneda,
    descripcion: p.descripcion || p.categoria,
    categoria: p.categoria,
    metodoPago: p.metodoPago ?? opts.lastMethod ?? 'Efectivo',
    created_at: iso,
    updated_at: iso,
  }
}
