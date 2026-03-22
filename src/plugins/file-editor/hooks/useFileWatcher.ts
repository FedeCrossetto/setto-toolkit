import { useEffect } from 'react'
import type { FileChangedEvent, OpenFile } from '../types'

interface WatcherProps {
  tab: OpenFile | null
  onFileChanged: (event: FileChangedEvent) => void
}

/**
 * Manages IPC file watching for the active tab.
 * Starts chokidar watcher in main process when watchActive = true,
 * stops it when false or when the tab closes/changes.
 */
export function useFileWatcher({ tab, onFileChanged }: WatcherProps): void {
  // Start/stop watcher when tab or watchActive changes
  useEffect(() => {
    if (!tab?.path || !tab.watchActive) return

    window.api.invoke('editor:watch-start', tab.path)

    return () => {
      if (tab.path) window.api.invoke('editor:watch-stop', tab.path)
    }
  }, [tab?.path, tab?.watchActive])

  // Listen for file-changed events pushed from main process
  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const payload = args[0] as FileChangedEvent
      if (payload.path === tab?.path) {
        onFileChanged(payload)
      }
    }

    window.api.on('editor:file-changed', handler)
    return () => {
      window.api.off('editor:file-changed', handler)
    }
  }, [tab?.path, onFileChanged])
}
