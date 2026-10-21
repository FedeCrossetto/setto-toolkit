import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { useApp } from '../AppContext'
import { useToast } from './Toast'
import { searchProviders } from '../search-registry'
import { actionsProvider, modulesProvider } from '../search-builtin'
import {
  buildGroups, cycleGroup, moveSelection, pushRecent, resolveSelection, type ProviderResult,
} from '../palette-logic'
import { setExplicitTheme, useSystemThemeSync } from '../themeMode'
import type { SearchContext, SearchItem, SearchProvider } from '../search'

const DEBOUNCE_MS = 80

/** Lo último que se ejecutó desde el palette (sólo esta sesión: `run` no se puede guardar). */
let recentItems: SearchItem[] = []
const recentProvider: SearchProvider = {
  id: 'recent',
  group: 'Recientes',
  search: (q) => (q ? [] : recentItems.map((i) => ({ ...i, id: i.id, score: 0 }))),
}

/** Open the palette from anywhere with a prefilled query:
 *  `window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query } }))` */
export const OPEN_PALETTE_EVENT = 'setto:open-palette'

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const h = el as HTMLElement
  return h.tagName === 'INPUT' || h.tagName === 'TEXTAREA' || h.isContentEditable || !!h.closest('.cm-editor, .xterm')
}

/**
 * Universal search (Ctrl+K or "/"). Built-in "Acciones" and "Módulos" plus every
 * SearchProvider from `search-registry.ts`, queried in parallel; each group shows
 * up as soon as its provider answers.
 */
export function CommandPalette(): JSX.Element | null {
  const { state, dispatch } = useApp()
  const toast = useToast()
  useSystemThemeSync()

  const open = state.commandPaletteOpen
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, ProviderResult>>({})
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const runId = useRef(0)
  const pendingQuery = useRef<string | null>(null)

  // ── Openers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
        return
      }
      // Ctrl+Shift+L: alternar claro/oscuro desde cualquier lado
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setExplicitTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark', dispatch)
        return
      }
      // "/" opens the palette too — but only when not typing in a field/editor
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(document.activeElement)) {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatch])

  useEffect(() => {
    const onOpen = (e: Event): void => {
      const q = (e as CustomEvent<{ query?: string } | undefined>).detail?.query ?? ''
      if (open) { setQuery(q); return }
      pendingQuery.current = q
      dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
    }
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
  }, [dispatch, open])

  // Reset on open
  useEffect(() => {
    if (!open) return
    setQuery(pendingQuery.current ?? '')
    pendingQuery.current = null
    setResults({})
    setSelectedId(null)
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
    return () => clearTimeout(t)
  }, [open])

  // ── Providers ──────────────────────────────────────────────────────────────
  const providers = useMemo(() => {
    const disabled = state.disabledPlugins
    const external = searchProviders.filter((p) => !p.pluginId || !disabled.includes(p.pluginId))
    return { actions: actionsProvider(disabled, state.theme), modules: modulesProvider(disabled), external }
  }, [state.disabledPlugins, state.theme])

  useEffect(() => {
    if (!open) return
    const id = ++runId.current
    const q = query.trim()
    // Group order: with no query, actions first; while searching, modules first.
    const ordered: { provider: SearchProvider; order: number; limit?: number }[] = [
      { provider: recentProvider, order: -100, limit: 5 },
      { provider: providers.actions, order: q ? 1 : 0, limit: q ? 5 : 8 },
      { provider: providers.modules, order: q ? 0 : 1, limit: q ? 5 : 6 },
      ...providers.external.map((provider, i) => ({ provider, order: provider.order ?? 10 + i })),
    ]
    const live = new Set(ordered.map((o) => o.provider.id))
    // Drop groups of providers that no longer apply (e.g. plugin disabled)
    setResults((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => live.has(k))))

    const run = (): void => {
      let pending = ordered.length
      setLoading(true)
      for (const { provider, order, limit } of ordered) {
        Promise.resolve()
          .then(() => provider.search(q))
          .catch((err: unknown) => {
            console.warn('[CommandPalette] provider failed', provider.id, err)
            return [] as SearchItem[]
          })
          .then((items) => {
            if (id !== runId.current) return   // stale response
            setResults((prev) => ({
              ...prev,
              [provider.id]: { id: provider.id, group: provider.group, items: Array.isArray(items) ? items : [], order, limit },
            }))
          })
          .finally(() => {
            if (id !== runId.current) return
            pending -= 1
            if (pending === 0) setLoading(false)
          })
      }
    }
    // First paint on open is immediate; typing is debounced.
    const t = setTimeout(run, q ? DEBOUNCE_MS : 0)
    return () => clearTimeout(t)
  }, [open, query, providers])

  const groups = useMemo(() => buildGroups(Object.values(results)), [results])
  const effectiveSelected = resolveSelection(groups, selectedId)

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [effectiveSelected])

  const close = useCallback(() => dispatch({ type: 'CLOSE_COMMAND_PALETTE' }), [dispatch])

  const ctx = useMemo<SearchContext>(() => ({
    dispatch,
    notify: (message, kind = 'info') => toast.show(message, kind),
  }), [dispatch, toast])

  const runItem = (item: SearchItem, alt = false): void => {
    close()
    recentItems = pushRecent(recentItems, item)
    const fail = (err: unknown): void => {
      toast.show(err instanceof Error ? err.message : 'No se pudo completar la acción', 'error')
    }
    try {
      const r = (alt && item.altRun ? item.altRun : item.run)(ctx)
      if (r instanceof Promise) r.catch(fail)
    } catch (err) {
      fail(err)
    }
  }

  if (!open) return null

  const flatItems = groups.flatMap((g) => g.items)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setSelectedId(moveSelection(groups, effectiveSelected, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setSelectedId(moveSelection(groups, effectiveSelected, -1))
    } else if (e.key === 'Tab') {
      e.preventDefault(); setSelectedId(cycleGroup(groups, effectiveSelected, e.shiftKey ? -1 : 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flatItems.find((i) => i.id === effectiveSelected)
      if (item) runItem(item, e.shiftKey)
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); close()
    }
  }

  const showEmpty = !loading && groups.length === 0
  const selectedItem = flatItems.find((i) => i.id === effectiveSelected)

  return createPortal(
    <div
      className="fixed inset-0 z-650 flex items-start justify-center px-4 bg-black/20 dark:bg-black/50 backdrop-blur-[2px]"
      style={{ paddingTop: '16vh', animation: 'fadeIn 0.1s ease both' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        className="mac-pop-in fl-dialog w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 640 }}
      >
        {/* Search field */}
        <div className="hairline-b">
        <div className="flex items-center gap-3 px-4 h-[52px]">
          <Search size={18} className="text-on-surface-variant shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar notas, snippets, gastos, módulos y acciones…"
            aria-label="Buscar"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent border-none outline-hidden t-callout text-on-surface"
            style={{ fontSize: 16, lineHeight: '24px' }}
          />
          {loading && query.trim() && (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-on-surface/15 border-t-primary animate-spin shrink-0" aria-label="Buscando" />
          )}
          <Kbd>Esc</Kbd>
        </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[min(56vh,440px)] overflow-y-auto px-2 py-2" role="listbox">
          {showEmpty ? (
            <div className="flex flex-col items-center text-center py-10">
              <span className="icon-tile w-10 h-10 mb-3 rounded-[10px]">
                <Search size={18} />
              </span>
              <p className="t-body text-on-surface-variant">
                {query.trim() ? <>No encontramos nada para «{query.trim()}»</> : 'Escribí para buscar'}
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="pb-1">
                <div className="fl-section px-2.5 pt-1.5">{g.label}</div>
                {g.items.map((item, idx) => (
                  <PaletteRow
                    key={item.id}
                    index={idx}
                    item={item}
                    selected={item.id === effectiveSelected}
                    onHover={() => setSelectedId(item.id)}
                    onRun={(alt) => runItem(item, alt)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 h-10 hairline-t t-caption text-on-surface-variant">
          <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft size={10} /></Kbd> {selectedItem?.hint && selectedItem.altRun ? selectedItem.hint : 'Abrir'}</span>
          {selectedItem?.altRun && (
            <span className="flex items-center gap-1.5"><Kbd>⇧ <CornerDownLeft size={10} /></Kbd> {selectedItem.altHint ?? 'Alternativa'}</span>
          )}
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> Moverse</span>
          <span className="flex items-center gap-1.5"><Kbd>Tab</Kbd> Siguiente grupo</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> Cerrar</span>
          <button
            type="button"
            className="ml-auto ui-btn ui-btn-ghost ui-btn-sm"
            onClick={() => dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })}
          >
            Atajos
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="kbd-chip inline-flex! items-center gap-0.5 shrink-0">
      {children}
    </kbd>
  )
}

function PaletteRow({ item, selected, onHover, onRun, index = 0 }: {
  /** Posición en su grupo: los resultados entran en cascada */
  index?: number
  item: SearchItem
  selected: boolean
  onHover: () => void
  onRun: (alt: boolean) => void
}): JSX.Element {
  const Icon = item.icon
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-selected={selected}
      onMouseMove={onHover}
      onClick={(e) => onRun(e.shiftKey)}
      style={{ '--i': index } as React.CSSProperties}
      className={`stagger-in w-full flex items-center gap-3 px-2.5 h-10 rounded-[9px] border text-left text-on-surface transition-colors duration-75 ${
        selected ? 'bg-on-surface/[0.045] dark:bg-white/[0.06] border-hairline' : 'border-transparent'
      }`}
    >
      <span
        className={`icon-tile w-7 h-7 transition-colors ${selected ? 'text-on-surface!' : ''}`}
      >
        {Icon ? <Icon size={15} /> : <Search size={14} />}
      </span>
      <span className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="t-body truncate font-medium">{item.title}</span>
        {item.subtitle && (
          <span className="t-footnote truncate text-on-surface-variant">
            {item.subtitle}
          </span>
        )}
      </span>
      {(item.hint || selected) && (
        <kbd className={`kbd-chip inline-flex! items-center shrink-0 gap-1 px-1.5! ${selected ? '' : 'border-transparent! bg-transparent! text-on-surface-variant/80'}`}>
          {selected && <CornerDownLeft size={10} />}
          {item.hint ?? 'Abrir'}
        </kbd>
      )}
      {selected && item.altRun && (
        <kbd className="kbd-chip inline-flex! items-center shrink-0 gap-1 px-1.5!">
          ⇧<CornerDownLeft size={10} />
          {item.altHint ?? 'Alternativa'}
        </kbd>
      )}
    </button>
  )
}
