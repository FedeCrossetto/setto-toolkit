import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { ArrowRight, Search } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import type { PluginManifest } from '../types'

export function CommandPalette(): JSX.Element | null {
  const { state, dispatch } = useApp()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const fuse = useMemo(() => new Fuse<PluginManifest>(allPlugins, {
    keys: ['name', 'description', 'keywords'],
    threshold: 0.4,
  }), [])

  const results = query.trim() ? fuse.search(query).map((r) => r.item) : allPlugins

  useEffect(() => {
    if (state.commandPaletteOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [state.commandPaletteOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      }
      if (e.key === 'Escape') {
        dispatch({ type: 'CLOSE_COMMAND_PALETTE' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatch])

  if (!state.commandPaletteOpen) return null

  const openPlugin = (pluginId: string): void => {
    dispatch({ type: 'OPEN_TAB', pluginId })
    dispatch({ type: 'CLOSE_COMMAND_PALETTE' })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-on-surface/20 backdrop-blur-sm"
      onClick={() => dispatch({ type: 'CLOSE_COMMAND_PALETTE' })}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-2xl overflow-hidden border border-outline-variant/30 shadow-card-hover bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/20">
          <Search size={20} className="text-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools..."
            className="flex-1 bg-transparent border-none outline-none text-on-surface placeholder-on-surface-variant text-sm"
          />
          <kbd className="text-[10px] bg-surface-container px-2 py-1 rounded border border-outline-variant/30 text-on-surface-variant">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-center text-on-surface-variant text-sm py-8">No tools found</p>
          ) : (
            results.map((plugin) => (
              <button
                key={plugin.id}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-left"
                onClick={() => openPlugin(plugin.id)}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <PluginIcon icon={plugin.icon} size={16} className="text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-on-surface">{plugin.name}</div>
                  <div className="text-xs text-on-surface-variant">{plugin.description}</div>
                </div>
                <ArrowRight size={14} className="text-on-surface-variant ml-auto" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-outline-variant/20 flex items-center justify-between gap-4 text-[10px] text-on-surface-variant uppercase tracking-wider">
          <div className="flex items-center gap-4">
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
          <button
            type="button"
            className="no-drag uppercase tracking-wider hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded px-1 -mr-1"
            onClick={() => {
              dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })
            }}
          >
            Shortcuts
          </button>
        </div>
      </div>
    </div>
  )
}
