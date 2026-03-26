import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useApp } from '../AppContext'

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

  // Ctrl+F — skip when File Editor is active (CodeMirror has its own finder)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        const activeTab = state.openTabs.find((t) => t.tabId === state.activeTabId)
        if (activeTab?.pluginId === 'file-editor') return
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

  return (
    <div className="fixed top-10 right-4 z-[250] flex items-center gap-1.5 px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl">

      {/* Search icon */}
      <Search size={15} className="text-on-surface-variant/50 flex-shrink-0" />

      {/* Input */}
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); doFind(e.target.value, true, false) }}
        onKeyDown={handleKey}
        placeholder="Find…"
        className={`w-44 bg-transparent text-[13px] outline-none placeholder:text-on-surface-variant/35
          ${noResults ? 'text-error' : 'text-on-surface'}`}
        spellCheck={false}
      />

      {/* Match count */}
      {query.trim() && (
        <span className={`text-[11px] tabular-nums flex-shrink-0 min-w-[3rem] text-right ${noResults ? 'text-error/70' : 'text-on-surface-variant/50'}`}>
          {noResults ? 'No results' : result ? `${result.activeMatchOrdinal} / ${result.matches}` : ''}
        </span>
      )}

      <div className="w-px h-4 bg-outline-variant/20 mx-0.5" />

      {/* Prev */}
      <button
        onClick={() => doFind(query, false, true)}
        disabled={!hasResults}
        title="Previous (Shift+Enter)"
        className="p-1 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 transition-colors"
      >
        <ChevronUp size={14} />
      </button>

      {/* Next */}
      <button
        onClick={() => doFind(query, true, true)}
        disabled={!hasResults}
        title="Next (Enter)"
        className="p-1 rounded-lg text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 transition-colors"
      >
        <ChevronDown size={14} />
      </button>

      {/* Match case toggle */}
      <button
        onClick={() => setMatchCase((v) => !v)}
        title="Match case"
        className={`p-1 rounded-lg text-[11px] font-bold transition-colors ${matchCase ? 'text-primary bg-primary/10' : 'text-on-surface-variant/40 hover:bg-surface-container-high'}`}
      >
        Aa
      </button>

      {/* Close */}
      <button
        onClick={closeSearch}
        className="p-1 rounded-lg text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container-high transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
