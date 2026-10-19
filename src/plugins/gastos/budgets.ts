/**
 * Presupuesto por categoría (puro). El gasto de cada categoría es el de `categoryBreakdown`
 * (fijos pagados por categoría del servicio + variables en ARS); los montos por categoría viven
 * en `GastosPrefs.presupuestosCategoria` (caché compartido del main) y el total global sigue en
 * `GastosPrefs.presupuesto`. El cálculo base está en `analytics.ts` porque el main lo usa en
 * `gastos:summary` (Inicio).
 */
import { normalizeBudgets, type GastosData } from './analytics'
import type { CategoryBudgetRow } from './types'

export { BUDGET_WARNING, budgetEstado, budgetProgress, budgetsAtRisk, normalizeBudgets } from './analytics'
export type { CategoryBudgetRow } from './types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function sumBudgets(budgets: Record<string, number>): number {
  return round2(Object.values(normalizeBudgets(budgets)).reduce((a, b) => a + b, 0))
}

export interface BudgetAlert {
  categoria: string
  tone: 'warning' | 'error'
  text: string
}

/** "Superaste Supermercado por $ 12.000" / "Ocio al 85 % (quedan $ 3.000)". */
export function budgetAlerts(rows: CategoryBudgetRow[], fmtMoney: (n: number) => string): BudgetAlert[] {
  return rows.filter((r) => r.estado !== 'ok').map((r) => r.estado === 'error'
    ? { categoria: r.categoria, tone: 'error' as const, text: `Superaste ${r.categoria} por ${fmtMoney(-r.restante)}` }
    : { categoria: r.categoria, tone: 'warning' as const, text: `${r.categoria} al ${Math.round(r.pct * 100)} % (quedan ${fmtMoney(r.restante)})` })
}

/** Categorías candidatas para presupuestar: las ya presupuestadas + las base + las de servicios y gastos. */
export function budgetCategories(base: readonly string[], data: GastosData, budgets: Record<string, number>): string[] {
  const seen = new Map<string, string>()
  const add = (c: string | undefined): void => {
    const t = (c ?? '').trim()
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  Object.keys(budgets).forEach(add)
  base.forEach(add)
  data.servicios.forEach((s) => add(s.categoria))
  data.gastos.forEach((g) => add(g.categoria))
  return [...seen.values()]
}
