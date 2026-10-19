import { useCallback } from 'react'
import { useToast } from '../components/Toast'
import { runUndoable, type UndoableOptions } from '../undo'

export type { UndoableOptions }

/**
 * Patrón unificado de borrado: los borrados de un solo ítem se aplican al
 * instante y muestran un toast con "Deshacer" (6 s, sin confirmación). Los
 * masivos o irreversibles siguen usando `useConfirm`.
 *
 * `undoable` devuelve `true` si `apply` terminó bien. Si `apply` falla se
 * muestra el error y no se ofrece deshacer.
 */
export function useUndo(): { undoable: (opts: UndoableOptions) => Promise<boolean> } {
  const { show } = useToast()
  const undoable = useCallback((opts: UndoableOptions) => runUndoable(opts, show), [show])
  return { undoable }
}
