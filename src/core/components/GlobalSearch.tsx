import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useApp } from '../AppContext'

const OWN_FIND = new Set(['file-editor', 'notes'])

interface FoundResult { activeMatchOrdinal: number; matches: number; finalUpdate: boolean }

export function GlobalSearch(): JSX.Element | null {
  const { state } = useApp()
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [result, setResult] = useState<FoundResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Receive match counts from main process
  useEffect(() => {
    const unsub = window.api.on('page:found', (data) => setResult(data as FoundResult))
    return unsub
  }, [])

  const doFind = useCallback((text: string, forward = true, findNext = false): void => {
    if (!text.trim()) { window.api.send('page:find-stop'); setResult(null); return }
    window.api.send('page:find', text, { forward, findNext, matchCase })
  }, [matchCase])

  const closeSearch = useCallback((): void => {
    setOpen(false)
    setQuery('')
    setResult(null)
    window.api.send('page:find-stop')
  }, [])

  // Ctrl+F — find in page
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId)
        // Modules with their own Ctrl+F (editor: CodeMirror finder, notes: search notes)
        if (activeTab && OWN_FIND.has(activeTab.pluginId)) return
        e.preventDefault()
        setOpen(true)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 40)
      }
      if (e.key === 'Escape' && open) closeSearch()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.activeTabId, state.openTabs, open, closeSearch])

  // Re-run search when matchCase toggles
  useEffect(() => {
    if (open && query.trim()) doFind(query, true, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchCase])

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      doFind(query, !e.shiftKey, true)
    }
    if (e.key === 'Escape') closeSearch()
  }

  if (!open) return null

  const hasResults = result && result.matches > 0
  const noResults  = result && result.matches === 0 && query.trim().length > 0

  const iconBtn = 'ui-btn ui-btn-ghost ui-btn-icon p-1!'

  return (
    <div
      role="search"
      className="mac-popover hairline mac-pop-in fixed top-12 right-4 z-250 flex items-center gap-1 pl-2.5 pr-1.5 py-1.5"
      style={{ borderRadius: 'var(--r-lg)' }}
    >
      <Search size={14} className="text-on-surface-variant shrink-0" />

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); doFind(e.target.value, true, false) }}
        onKeyDown={handleKey}
        placeholder="Buscar en la página"
        aria-label="Buscar en la página"
        className={`w-44 bg-transparent t-body outline-hidden ml-1 ${noResults ? 'text-error' : 'text-on-surface'}`}
        spellCheck={false}
      />

      {query.trim() && (
        <span className={`t-caption tabular-nums shrink-0 min-w-14 text-right ${noResults ? 'text-error' : 'text-on-surface-variant'}`}>
          {noResults ? 'Sin resultados' : result ? `${result.activeMatchOrdinal} de ${result.matches}` : ''}
        </span>
      )}

      <div className="w-px h-4 bg-(--hairline-strong) mx-1" />

      <button onClick={() => doFind(query, false, true)} disabled={!hasResults} title="Anterior (Shift+Enter)" aria-label="Anterior" className={iconBtn}>
        <ChevronUp size={14} />
      </button>
      <button onClick={() => doFind(query, true, true)} disabled={!hasResults} title="Siguiente (Enter)" aria-label="Siguiente" className={iconBtn}>
        <ChevronDown size={14} />
      </button>
      <button
        onClick={() => setMatchCase((v) => !v)}
        title="Distinguir mayúsculas"
        aria-label="Distinguir mayúsculas"
        aria-pressed={matchCase}
        className={`ui-btn ui-btn-sm px-1.5! t-caption font-semibold ${matchCase ? 'bg-primary/[0.14] text-primary' : 'ui-btn-ghost'}`}
      >
        Aa
      </button>
      <button onClick={closeSearch} title="Cerrar (Esc)" aria-label="Cerrar" className={iconBtn}>
        <X size={14} />
      </button>
    </div>
  )
}
