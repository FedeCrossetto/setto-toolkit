import { useCallback } from 'react'
import { useApp } from '../../core/AppContext'
import { useUndo } from '../../core/hooks/useUndo'
import { writeGastos } from './direct-write'
import { fmt } from './format'
import { buildLearning } from './learning'
import { readCacheState, readLastMethod, writeLastMethod } from './local-store'
import { quickGastoFromText } from './quick-gasto'

export type QuickGastoResult = 'saved' | 'opened' | 'failed'

/**
 * Guardado directo de un gasto escrito en la captura rápida (Ctrl+Shift+Espacio) o en Inicio:
 * se queda donde está el usuario y muestra "Deshacer". Sólo abre Gastos si el texto es ambiguo.
 */
export function useQuickGasto(): (text: string) => Promise<QuickGastoResult> {
  const { dispatch } = useApp()
  const { undoable } = useUndo()

  return useCallback(async (text: string): Promise<QuickGastoResult> => {
    const cache = await readCacheState() // también carga las preferencias (último método)
    const gasto = quickGastoFromText(text, { learning: buildLearning(cache.data?.gastos ?? []), lastMethod: readLastMethod() })
    if (!gasto) {
      dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'gastos', action: 'quick-add', payload: { text: text.trim() } })
      return 'opened'
    }
    const label = `${gasto.descripcion} · ${gasto.moneda === 'USD' ? 'US$' : '$'} ${fmt(gasto.monto)}`
    let queued = false
    const ok = await undoable({
      // Se lee después de guardar: si quedó en cola, el mensaje lo dice.
      get message() {
        return queued ? `Gasto guardado en este equipo (se sube al volver la conexión): ${label}` : `Gasto guardado: ${label}`
      },
      apply: async () => {
        const r = await writeGastos({ channel: 'gastos:save-gasto', args: [gasto] })
        if (!r.ok) throw new Error(r.error)
        queued = r.queued
      },
      undo: async () => {
        const r = await writeGastos({ channel: 'gastos:delete-gasto', args: [gasto.id] })
        if (!r.ok) throw new Error(r.error)
      },
      undoneMessage: 'Gasto eliminado',
    })
    if (ok) writeLastMethod(gasto.metodoPago)
    return ok ? 'saved' : 'failed'
  }, [dispatch, undoable])
}
