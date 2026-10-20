import { useEffect, useRef, useSyncExternalStore } from 'react'

/**
 * Acción principal de cada módulo para el botón de la barra superior: en Claves es
 * "Nueva clave", en Snippets "Nuevo snippet"… Si el módulo activo no declara una,
 * el botón queda como "Nuevo" (captura rápida). La función se lee por ref, así el
 * módulo puede pasar un closure nuevo en cada render sin re-registrarse.
 */
export interface ModuleAction { label: string; title?: string }

interface Entry extends ModuleAction { run: () => void }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
const emit = (): void => { for (const l of listeners) l() }
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** El módulo registra su acción principal mientras está montado. */
export function useModulePrimaryAction(pluginId: string, action: ModuleAction | null, run: () => void): void {
  const runRef = useRef(run)
  runRef.current = run
  const label = action?.label
  const title = action?.title
  useEffect(() => {
    if (!label) return
    entries.set(pluginId, { label, title, run: () => runRef.current() })
    emit()
    return () => { entries.delete(pluginId); emit() }
  }, [pluginId, label, title])
}

/** La barra superior lee la acción del módulo activo. */
export function usePrimaryAction(pluginId: string | undefined): Entry | undefined {
  return useSyncExternalStore(subscribe, () => (pluginId ? entries.get(pluginId) : undefined))
}
