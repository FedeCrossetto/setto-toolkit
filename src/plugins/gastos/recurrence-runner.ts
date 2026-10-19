/**
 * Ejecuta las reglas recurrentes desde la UI (Gastos e Inicio). Las reglas viven en las prefs del
 * caché compartido del main (`gastos:cache-*`), así dev e instalada ven las mismas. Las escrituras
 * pasan por `writeGastos` (delegan en el store de Gastos si está montado; si no, directo o a la
 * cola). Todo serializado: dos llamadas a la vez nunca generan dos veces.
 */
import { useEffect, useRef } from 'react'
import { useToast } from '../../core/components/Toast'
import { readCacheState, readPendingWrites } from './local-store'
import { applyWrites } from './sync-queue'
import { writeGastos } from './direct-write'
import { dueInstances } from './recurrence'
import type { Gasto, ReglaRecurrente } from './types'

export const REGLAS_CHANGED_EVENT = 'setto:gastos-reglas-changed'

let chain: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.catch(() => undefined)
  return run
}

function notifyReglas(): void {
  try { window.dispatchEvent(new CustomEvent(REGLAS_CHANGED_EVENT)) } catch { /* sin window (tests) */ }
}

function validRules(raw: unknown): ReglaRecurrente[] {
  return Array.isArray(raw) ? raw.filter((r): r is ReglaRecurrente => Boolean(r) && typeof (r as ReglaRecurrente).id === 'string') : []
}

export async function readReglas(): Promise<ReglaRecurrente[]> {
  return validRules((await readCacheState()).prefs.recurrentes)
}

/** Lee-modifica-escribe las reglas contra el caché del main (nunca con una copia vieja). */
export function mutateReglas(fn: (rules: ReglaRecurrente[]) => ReglaRecurrente[]): Promise<ReglaRecurrente[]> {
  return serial(async () => {
    const next = fn(await readReglas())
    await window.api.invoke('gastos:cache-set', { prefs: { recurrentes: next } })
    notifyReglas()
    return next
  })
}

/** Genera lo vencido hasta hoy. Devuelve los gastos creados (vacío si no había nada). */
export function runDueRecurrentes(today = new Date()): Promise<Gasto[]> {
  return serial(async () => {
    const [cache, pending] = await Promise.all([readCacheState(), readPendingWrites()])
    const rules = validRules(cache.prefs.recurrentes)
    if (!rules.length) return []
    const gastos = cache.data ? applyWrites(cache.data, pending).gastos : []
    const due = dueInstances(rules, new Set(gastos.map((g) => g.id)), today)
    // Primero la marca: si algo falla a mitad, nunca se vuelve a generar lo mismo.
    if (due.changed) {
      await window.api.invoke('gastos:cache-set', { prefs: { recurrentes: due.rules } })
      notifyReglas()
    }
    const created: Gasto[] = []
    for (const g of due.gastos) {
      const r = await writeGastos({ channel: 'gastos:save-gasto', args: [g] })
      if (r.ok) created.push(g)
    }
    return created
  })
}

export async function undoRecurrentes(gastos: Gasto[]): Promise<void> {
  for (const g of gastos) await writeGastos({ channel: 'gastos:delete-gasto', args: [g.id] })
}

/** Corre el motor una vez por montaje (cuando `ready`) y avisa con "Deshacer". */
export function useRecurrentesAuto(ready: boolean): void {
  const toast = useToast()
  const ran = useRef(false)
  useEffect(() => {
    if (!ready || ran.current) return
    ran.current = true
    void runDueRecurrentes().then((created) => {
      if (!created.length) return
      const n = created.length
      toast.show(n === 1 ? `Cargamos 1 gasto recurrente: ${created[0]!.descripcion}` : `Cargamos ${n} gastos recurrentes`, 'success', 8000,
        { label: 'Deshacer', onClick: () => { void undoRecurrentes(created) } })
    }).catch(() => { /* best-effort */ })
  }, [ready, toast])
}
