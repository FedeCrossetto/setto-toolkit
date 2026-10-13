import { useCallback, useState } from 'react'
import type { OpenFile } from '../types'

const PINNED_KEY = 'file-editor:pinned'
const GROUP_KEY = 'file-editor:group-by-folder'

/** Clave estable para fijar: la ruta (sobrevive a reinicios) o el id para buffers. */
const pinKey = (t: Pick<OpenFile, 'id' | 'path'>): string => t.path ?? `buffer:${t.id}`

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage lleno o bloqueado */ }
}

/** Estado de la lista "Abiertos": fijados, filtro y agrupado por carpeta. */
export function useOpenFilesView() {
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(readJSON<string[]>(PINNED_KEY, [])))
  const [filter, setFilter] = useState('')
  const [groupByFolder, setGroupByFolderState] = useState<boolean>(() => readJSON<boolean>(GROUP_KEY, false))

  const isPinned = useCallback((t: Pick<OpenFile, 'id' | 'path'>) => pinned.has(pinKey(t)), [pinned])

  const togglePin = useCallback((t: Pick<OpenFile, 'id' | 'path'>) => {
    setPinned((prev) => {
      const next = new Set(prev)
      const k = pinKey(t)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      writeJSON(PINNED_KEY, [...next].filter((x) => !x.startsWith('buffer:')))
      return next
    })
  }, [])

  const setGroupByFolder = useCallback((v: boolean) => {
    setGroupByFolderState(v)
    writeJSON(GROUP_KEY, v)
  }, [])

  return { isPinned, togglePin, filter, setFilter, groupByFolder, setGroupByFolder }
}
