import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { ArrowRight, Search, CornerDownLeft } from 'lucide-react'
import { useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import type { PluginManifest } from '../types'

export function CommandPalette(): JSX.Element | null {
  const { state, dispatch } = useApp()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(() => new Fuse<PluginManifest>(allPlugins, {
    keys: ['name', 'description', 'keywords'],
    threshold: 0.4,
  }), [])

  const results = query.trim() ? fuse.search(query).map((r) => r.item) : allPlugins

  useEffect(() => {
    if (state.commandPaletteOpen) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [state.commandPaletteOpen])

  // Keep selection in range when the result set shrinks, and scroll it into view.
  useEffect(() => { setSelected(0) }, [query])
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, query])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      }
      // "/" opens the palette too — but only when not typing in a field/editor
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement as HTMLElement | null
        const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('.cm-editor'))
        if (!typing) {
          e.preventDefault()
          dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        }
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

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const plugin = results[selected]
      if (plugin) openPlugin(plugin.id)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-on-surface/30 backdrop-blur-md"
      onClick={() => dispatch({ type: 'CLOSE_COMMAND_PALETTE' })}
    >
      <div
        className="cmd-palette-in w-full max-w-xl mx-4 rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/20">
          <Search size={20} className="text-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar herramientas…"
            className="flex-1 bg-transparent border-none outline-none text-on-surface placeholder-on-surface-variant text-sm"
          />
          <kbd className="text-[10px] bg-surface-container px-2 py-1 rounded border border-outline-variant/30 text-on-surface-variant">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="text-center text-on-surface-variant text-sm py-8">Sin resultados</p>
          ) : (
            results.map((plugin, i) => {
              const isSel = i === selected
              return (
                <button
                  key={plugin.id}
                  data-selected={isSel}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left border-l-2 ${
                    isSel
                      ? 'bg-primary/[0.08] border-primary'
                      : 'border-transparent hover:bg-surface-container'
                  }`}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => openPlugin(plugin.id)}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isSel ? 'bg-primary/20' : 'bg-primary/10'}`}>
                    <PluginIcon icon={plugin.icon} size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-on-surface truncate">{plugin.name}</div>
                    <div className="text-xs text-on-surface-variant truncate">{plugin.description}</div>
                  </div>
                  <ArrowRight size={14} className={`ml-auto flex-shrink-0 transition-opacity ${isSel ? 'text-primary opacity-100' : 'text-on-surface-variant opacity-0'}`} />
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-outline-variant/20 flex items-center justify-between gap-4 text-[10px] text-on-surface-variant uppercase tracking-wider">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30 normal-case tracking-normal"><CornerDownLeft size={10} /></kbd>
              Abrir
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30 normal-case tracking-normal">↑</kbd>
              <kbd className="bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30 normal-case tracking-normal">↓</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/30 normal-case tracking-normal">ESC</kbd>
              Cerrar
            </span>
          </div>
          <button
            type="button"
            className="no-drag uppercase tracking-wider hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded px-1 -mr-1"
            onClick={() => {
              dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })
            }}
          >
            Atajos
          </button>
        </div>
      </div>
    </div>
  )
}
