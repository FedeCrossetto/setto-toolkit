/**
 * Escrituras de Gastos desde fuera del módulo (captura rápida, Inicio). Si Gastos está montado
 * delega en su store (que maneja la cola en memoria); si no, escribe directo y, sin conexión,
 * deja la escritura en la cola persistida y en el caché, igual que haría el módulo.
 */
import { readCacheState, readPendingWrites } from './local-store'
import { applyWrite, classifyWriteError, dropSuperseded, enqueue } from './sync-queue'
import { friendlyGastosError } from './format'
import type { PendingWrite } from './types'

export type WriteOutcome =
  | { ok: true; queued: boolean }
  | { ok: false; error: string }

type Writer = (w: PendingWrite) => Promise<WriteOutcome>

let mounted: Writer | null = null

/** Gastos registra su store mientras está montado. Devuelve la función para desregistrarlo. */
export function registerGastosWriter(fn: Writer): () => void {
  mounted = fn
  return () => { if (mounted === fn) mounted = null }
}

/** Avisa a Inicio / dock que los totales cambiaron. */
export const GASTOS_CHANGED_EVENT = 'setto:gastos-changed'
export function notifyGastosChanged(): void {
  try { window.dispatchEvent(new CustomEvent(GASTOS_CHANGED_EVENT)) } catch { /* sin window (tests) */ }
}

export async function writeGastos(w: PendingWrite): Promise<WriteOutcome> {
  if (mounted) return mounted(w)
  try {
    await window.api.invoke(w.channel, ...w.args)
    const pending = await readPendingWrites()
    const next = dropSuperseded(pending, w)
    if (next !== pending) await window.api.invoke('gastos:pending-set', next)
    await patchCache(w)
    notifyGastosChanged()
    return { ok: true, queued: false }
  } catch (e) {
    if (classifyWriteError(e) === 'rejected') return { ok: false, error: friendlyGastosError(String(e)) }
    try {
      await window.api.invoke('gastos:pending-set', enqueue(await readPendingWrites(), w))
      await patchCache(w)
    } catch (e2) {
      return { ok: false, error: friendlyGastosError(String(e2)) }
    }
    notifyGastosChanged()
    return { ok: true, queued: true }
  }
}

/** Refleja la escritura en el caché compartido (si existe) para que Inicio y Ctrl+K la vean ya. */
async function patchCache(w: PendingWrite): Promise<void> {
  const cache = await readCacheState()
  if (!cache.data) return
  await window.api.invoke('gastos:cache-set', { data: applyWrite(cache.data, w) }).catch(() => undefined)
}
