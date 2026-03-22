import { useEffect, useRef } from 'react'
import type { OpenFile } from '../types'
import type { EditorPrefs } from './useEditorPrefs'

export function useAutoSave(
  activeTab: OpenFile | null,
  prefs: EditorPrefs,
  save: () => Promise<void>,
): void {
  // Keep save stable in the effect closure
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!prefs.autoSave || !activeTab?.isDirty || !activeTab?.path) return
    const timer = setTimeout(() => saveRef.current(), prefs.autoSaveDelay)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.content, activeTab?.isDirty, activeTab?.path, prefs.autoSave, prefs.autoSaveDelay])
}
