import { useState, useEffect, useRef } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { FileTreeNode, FindResult, OpenFile } from '../types'
import { languageIcon, detectLanguage } from '../hooks/useEditorTabs'

interface FindInFilesProps {
  folders: FileTreeNode[]
  openTabs: OpenFile[]
  onOpenAt: (path: string, line: number) => void
  onClose: () => void
}

type Scope = 'tabs' | number

function searchInTabs(tabs: OpenFile[], query: string, useRegex: boolean): FindResult[] {
  const results: FindResult[] = []
  let pattern: RegExp | null = null
  if (useRegex) {
    try { pattern = new RegExp(query, 'i') } catch { return [] }
  }
  for (const tab of tabs) {
    if (tab.path === null) continue
    const lines = tab.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const matches = pattern ? pattern.test(line) : line.toLowerCase().includes(query.toLowerCase())
      if (matches) results.push({ path: tab.path, name: tab.name, lineNumber: i + 1, lineText: line.trim() })
      if (results.length >= 300) return results
    }
  }
  return results
}

export function FindInFiles({ folders, openTabs, onOpenAt, onClose }: FindInFilesProps): JSX.Element {
  const hasTabs    = openTabs.some((t) => t.path !== null)
  const hasFolders = folders.length > 0

  const [query, setQuery]         = useState('')
  const [useRegex, setRegex]      = useState(false)
  const [results, setResults]     = useState<FindResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched]   = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [scope, setScope]         = useState<Scope>(() => (hasFolders ? 0 : 'tabs'))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Global Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!hasFolders && scope !== 'tabs') setScope('tabs')
  }, [hasFolders, scope])

  const scopeFolder = typeof scope === 'number' ? (folders[scope] ?? null) : null
  const canSearch   = !!query.trim() && (scope === 'tabs' ? hasTabs : scopeFolder !== null)

  const run = async (): Promise<void> => {
    if (!canSearch) return
    setSearching(true)
    setSearched(false)
    setResults([])
    setSearchError(null)
    try {
      if (scope === 'tabs') {
        if (useRegex) {
          try { new RegExp(query, 'i') } catch (e) {
            setSearchError(`Regex inválida: ${(e as Error).message}`)
            return
          }
        }
        setResults(searchInTabs(openTabs, query, useRegex))
      } else {
        const res = await window.api.invoke<FindResult[]>('editor:find-in-files', {
          dir: scopeFolder!.path, query, useRegex,
        })
        setResults(res)
      }
    } catch (e) {
      setSearchError((e as Error).message ?? 'Error al buscar')
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  const grouped = results.reduce<Record<string, FindResult[]>>((acc, r) => {
    ;(acc[r.path] = acc[r.path] ?? []).push(r)
    return acc
  }, {})

  const scopeOptions: { value: string; label: string }[] = [
    { value: 'tabs', label: 'Pestañas abiertas' },
    ...folders.map((f, i) => ({ value: String(i), label: f.name })),
  ]

  const hasResults = Object.keys(grouped).length > 0

  return (
    <div
      className="absolute inset-0 z-30 pointer-events-none"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <motion.div
        className="pointer-events-auto flex flex-col overflow-hidden"
        style={{
          width: 520,
          maxHeight: hasResults ? '72vh' : 'auto',
          borderRadius: 16,
          background: 'rgb(var(--c-surface) / 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgb(var(--c-outline-variant) / 0.22)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.18)',
        }}
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-outline-variant/15">
          <Search size={15} className="text-primary/70 flex-shrink-0" />

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
            placeholder="Buscar en archivos…"
            className="flex-1 bg-transparent text-[13px] text-on-surface outline-none ring-0 focus:ring-0 focus:outline-none placeholder:text-on-surface-variant/35 min-w-0"
          />

          <button
            onClick={() => setRegex((v) => !v)}
            title="Regex"
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors flex-shrink-0 ${
              useRegex ? 'border-primary/50 text-primary bg-primary/10' : 'border-outline-variant/30 text-on-surface-variant/45 hover:border-primary/30'
            }`}
          >.*</button>

          {hasFolders && (
            <select
              value={scope === 'tabs' ? 'tabs' : String(scope)}
              onChange={(e) => setScope(e.target.value === 'tabs' ? 'tabs' : Number(e.target.value))}
              className="text-[11px] bg-surface-container border border-outline-variant/30 rounded-lg px-1.5 py-0.5 text-on-surface-variant outline-none flex-shrink-0"
            >
              {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          <button
            onClick={() => void run()}
            disabled={!canSearch || searching}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {searching ? 'Buscando…' : 'Buscar'}
          </button>

          <button onClick={onClose} title="Cerrar (Esc)"
            className="text-on-surface-variant/40 hover:text-on-surface transition-colors flex-shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto text-[11px]" style={{ maxHeight: '60vh' }}>
          {!searched && !searching && !hasTabs && !hasFolders && (
            <p className="text-center text-on-surface-variant/30 py-8">Abrí archivos o una carpeta para buscar</p>
          )}
          {!searched && !searching && (hasTabs || hasFolders) && (
            <p className="text-center text-on-surface-variant/35 py-8">Escribí y presioná Enter para buscar</p>
          )}
          {searchError && (
            <p className="mx-3 mt-3 px-3 py-2 rounded-lg bg-error/10 border border-error/25 text-error">{searchError}</p>
          )}
          {searched && !searchError && results.length === 0 && (
            <p className="text-center text-on-surface-variant/40 py-8">Sin resultados</p>
          )}
          {Object.entries(grouped).map(([filePath, matches]) => (
            <div key={filePath}>
              <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0 border-b border-outline-variant/10"
                style={{ background: 'rgb(var(--c-surface-container) / 0.90)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                {(() => { const Icon = languageIcon(detectLanguage(matches[0]!.name)); return <Icon size={12} className="flex-shrink-0" /> })()}
                <span className="font-semibold text-on-surface text-[11px] truncate">{matches[0]!.name}</span>
                <span className="text-on-surface-variant/30 text-[10px] truncate hidden sm:block flex-1">{filePath}</span>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary flex-shrink-0">{matches.length}</span>
              </div>
              {matches.map((r) => (
                <button
                  key={`${r.path}:${r.lineNumber}`}
                  onClick={() => { onOpenAt(r.path, r.lineNumber); onClose() }}
                  className="flex items-start gap-2 w-full px-4 py-1 text-left hover:bg-surface-container-high transition-colors group border-l-2 border-transparent hover:border-primary/30"
                >
                  <span className="text-on-surface-variant/30 flex-shrink-0 tabular-nums w-8 text-right text-[10px] font-mono mt-px">{r.lineNumber}</span>
                  <span className="text-on-surface-variant group-hover:text-on-surface truncate font-mono text-[10px]">{r.lineText}</span>
                </button>
              ))}
            </div>
          ))}
          {searched && results.length >= 300 && (
            <p className="text-center text-on-surface-variant/30 py-2 text-[10px]">Mostrando los primeros 300 resultados — refiná la búsqueda</p>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-outline-variant/10 flex items-center gap-3 text-[10px] text-on-surface-variant/30">
          <span className="flex items-center gap-1"><kbd className="bg-surface-container px-1 py-0.5 rounded border border-outline-variant/20 text-[9px]">↵</kbd> buscar</span>
          <span className="flex items-center gap-1"><kbd className="bg-surface-container px-1 py-0.5 rounded border border-outline-variant/20 text-[9px]">Esc</kbd> cerrar</span>
          {searched && <span className="ml-auto">{results.length} coincidencias</span>}
        </div>
      </motion.div>
    </div>
  )
}
