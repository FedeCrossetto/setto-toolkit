import { useEffect, useRef } from 'react'
import type { FileChangedEvent, OpenFile } from '../types'

interface WatcherProps {
  tab: OpenFile | null
  onFileChanged: (event: FileChangedEvent) => void
}

/**
 * Manages IPC file watching for the active tab.
 * The active file is always watched so external changes/deletes can be surfaced.
 * "watchActive" in the UI controls live-monitoring behavior, not whether we notice
 * that the file changed on disk.
 */
export function useFileWatcher({ tab, onFileChanged }: WatcherProps): void {
  // Keep a stable ref so the listener always calls the latest callback without
  // needing to re-register the IPC listener every time onFileChanged recreates.
  // (onFileChanged depends on `tabs`, which changes on every updateTab call.)
  const onFileChangedRef = useRef(onFileChanged)
  useEffect(() => { onFileChangedRef.current = onFileChanged })

  // Start/stop watcher when the active tab changes
  useEffect(() => {
    if (!tab?.path) return

    window.api.invoke('editor:watch-start', tab.path)

    return () => {
      if (tab.path) window.api.invoke('editor:watch-stop', tab.path)
    }
  }, [tab?.path])

  // Listen for file-changed events pushed from main process.
  // NOTE: window.api.on() wraps the listener before passing it to ipcRenderer,
  // so window.api.off() cannot remove it (wrong reference). Always use the
  // cleanup function returned by window.api.on() to avoid listener accumulation.
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const payload = args[0] as FileChangedEvent
      if (payload.path === tab?.path) {
        onFileChangedRef.current(payload)
      }
    }

    const remove = window.api.on('editor:file-changed', handler)
    return remove
  }, [tab?.path])
}
