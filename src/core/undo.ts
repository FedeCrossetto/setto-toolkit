import type { ToastAction, ToastType } from './components/Toast'

export interface UndoableOptions {
  /** Texto del toast, p. ej. "Snippet eliminado". */
  message: string
  /** Aplica el cambio (se ejecuta enseguida, sin confirmar). */
  apply: () => Promise<void> | void
  /** Revierte el cambio si el usuario aprieta "Deshacer". */
  undo: () => Promise<void> | void
  /** Texto del toast al deshacer (por defecto "Cambio deshecho"). */
  undoneMessage?: string
  type?: ToastType
  durationMs?: number
}

type Show = (message: string, type?: ToastType, durationMs?: number, action?: ToastAction) => void

/**
 * Lógica pura de `useUndo` (testeada en `undo.test.ts`): aplica, y si sale bien
 * muestra el toast con "Deshacer" (que sólo deshace una vez). Si `apply` falla
 * muestra el error y devuelve false.
 */
export async function runUndoable(opts: UndoableOptions, show: Show): Promise<boolean> {
  try {
    await opts.apply()
  } catch (err) {
    show(`No se pudo completar: ${errorText(err)}`, 'error')
    return false
  }
  let used = false
  show(opts.message, opts.type ?? 'success', opts.durationMs, {
    label: 'Deshacer',
    onClick: () => {
      if (used) return
      used = true
      void Promise.resolve()
        .then(opts.undo)
        .then(
          () => show(opts.undoneMessage ?? 'Cambio deshecho', 'info'),
          (err: unknown) => show(`No se pudo deshacer: ${errorText(err)}`, 'error'),
        )
    },
  })
  return true
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
