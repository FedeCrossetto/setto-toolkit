import { useState, useEffect, useCallback } from 'react'
import type { TerminalPrefs } from '../types'
import { DEFAULT_PREFS } from '../types'

export function useTerminalPrefs(): {
  prefs: TerminalPrefs
  savePrefs: (patch: Partial<TerminalPrefs>) => Promise<void>
  loading: boolean
} {
  const [prefs, setPrefs] = useState<TerminalPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.invoke<TerminalPrefs>('terminal:prefs-get')
      .then((p) => setPrefs(p))
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false))
  }, [])

  const savePrefs = useCallback(async (patch: Partial<TerminalPrefs>) => {
    const updated = { ...prefs, ...patch }
    setPrefs(updated)
    await window.api.invoke('terminal:prefs-set', patch)
  }, [prefs])

  return { prefs, savePrefs, loading }
}
