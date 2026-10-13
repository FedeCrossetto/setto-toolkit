import { useCallback, useEffect, useState } from 'react'
import type { OpenFile } from '../types'

export type EditorPaneId = 'main' | 'split'

/**
 * Vista dividida: un segundo panel que muestra cualquier archivo abierto.
 * El panel con foco decide a dónde va el clic en la barra lateral.
 */
export function useSplitView(tabs: OpenFile[], activeId: string | null, setActiveId: (id: string) => void) {
  const [open, setOpen] = useState(false)
  const [splitTabId, setSplitTabId] = useState<string | null>(null)
  const [focused, setFocused] = useState<EditorPaneId>('main')
  const [ratio, setRatio] = useState(0.5)

  // Si el archivo del panel derecho se cerró, mostrar el activo; sin archivos, cerrar.
  const tab = open ? (tabs.find((t) => t.id === splitTabId) ?? tabs.find((t) => t.id === activeId) ?? null) : null
  useEffect(() => {
    if (open && tabs.length === 0) { setOpen(false); setFocused('main') }
  }, [open, tabs.length])

  const toggle = useCallback((preferId?: string | null) => {
    if (open) { setOpen(false); setFocused('main'); return }
    setSplitTabId(preferId ?? activeId)
    setOpen(true)
    setFocused('split')
  }, [open, activeId])

  const close = useCallback(() => { setOpen(false); setFocused('main') }, [])

  /** Abrir `id` en el panel con foco (clic en "Abiertos", Ctrl+Tab). */
  const routeSelect = useCallback((id: string) => {
    if (open && focused === 'split') setSplitTabId(id)
    else setActiveId(id)
  }, [open, focused, setActiveId])

  return { open, tab, focused, setFocused, ratio, setRatio, toggle, close, pick: setSplitTabId, routeSelect }
}
