import { useState, useEffect, useRef } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { FileTreeNode, FindResult, OpenFile } from '../types'
import { languageIcon, detectLanguage } from '../hooks/useEditorTabs'

interface FindInFilesProps {
  folders: FileTreeNode[]
  openTabs: OpenFile[]
  onOpenAt: (path: string, line: number) => void
  onClose: () => void
}

type Scope = 'tabs' | number  // number = folder index

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
      const line = lines[i]
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

  const [query, setQuery]     = useState('')
  const [useRegex, setRegex]  = useState(false)
  const [results, setResults] = useState<FindResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched]   = useState(false)
  const [scope, setScope]         = useState<Scope>(() => (hasFolders ? 0 : 'tabs'))
  const inputRef = useRef<HTMLInputElement>(null)

  // If folders change (e.g. first folder opened), keep scope on tabs unless it was already a folder
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
    try {
      if (scope === 'tabs') {
        setResults(searchInTabs(openTabs, query, useRegex))
      } else {
        const res = await window.api.invoke<FindResult[]>('editor:find-in-files', {
          dir: scopeFolder!.path, query, useRegex,
        })
        setResults(res)
      }
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') void run()
    if (e.key === 'Escape') onClose()
  }

  // Group results by file
  const grouped = results.reduce<Record<string, FindResult[]>>((acc, r) => {
    ;(acc[r.path] = acc[r.path] ?? []).push(r)
    return acc
  }, {})

  const scopeOptions: { value: string; label: string }[] = [
    { value: 'tabs', label: 'Open tabs' },
    ...folders.map((f, i) => ({ value: String(i), label: f.name })),
  ]

  return (
    <div className="flex flex-col border-t border-outline-variant/20 bg-surface flex-shrink-0" style={{ height: '220px' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-outline-variant/15 flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Find in files</span>

        {/* Scope selector — only show when a folder is also open (tabs are always an option) */}
        {hasFolders && (
          <select
            value={scope === 'tabs' ? 'tabs' : String(scope)}
            onChange={(e) => setScope(e.target.value === 'tabs' ? 'tabs' : Number(e.target.value))}
            className="text-[11px] bg-surface-container border border-outline-variant/30 rounded-lg px-1.5 py-0.5 text-on-surface-variant outline-none"
          >
            {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        <div className="flex-1 flex items-center gap-1.5 bg-surface-container border border-outline-variant/25 rounded-lg px-2 py-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search…"
            className="flex-1 bg-transparent text-[12px] text-on-surface outline-none placeholder:text-on-surface-variant/35"
          />
          <button
            onClick={() => setRegex((v) => !v)}
            title="Toggle regex"
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
              useRegex ? 'border-primary/50 text-primary bg-primary/10' : 'border-outline-variant/30 text-on-surface-variant/50 hover:border-primary/30'
            }`}
          >.*</button>
        </div>

        <button
          onClick={() => void run()}
          disabled={!canSearch || searching}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
        >
          {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {searching ? 'Searching…' : 'Search'}
        </button>

        <button onClick={onClose} className="text-on-surface-variant/40 hover:text-on-surface-variant transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto text-[11px]">
        {!searched && !searching && !hasTabs && !hasFolders && (
          <p className="text-center text-on-surface-variant/30 pt-6">Open files or a folder to search</p>
        )}
        {!searched && !searching && (hasTabs || hasFolders) && (
          <p className="text-center text-on-surface-variant/30 pt-6">Enter a query and press Enter or Search</p>
        )}
        {searched && results.length === 0 && (
          <p className="text-center text-on-surface-variant/40 pt-6">No matches found</p>
        )}
        {Object.entries(grouped).map(([filePath, matches]) => (
          <div key={filePath}>
            <div className="flex items-center gap-2 px-3 py-1 bg-surface-container-low/60 sticky top-0">
              {(() => { const Icon = languageIcon(detectLanguage(matches[0].name)); return <Icon size={12} className="text-on-surface-variant/50" /> })()}
              <span className="font-medium text-on-surface-variant truncate">{matches[0].name}</span>
              <span className="text-on-surface-variant/30 text-[10px] truncate hidden sm:block">{filePath}</span>
              <span className="ml-auto text-on-surface-variant/40 text-[10px] flex-shrink-0">{matches.length}</span>
            </div>
            {matches.map((r) => (
              <button
                key={`${r.path}:${r.lineNumber}`}
                onClick={() => onOpenAt(r.path, r.lineNumber)}
                className="flex items-start gap-2 w-full px-4 py-1 text-left hover:bg-surface-container transition-colors group"
              >
                <span className="text-on-surface-variant/30 flex-shrink-0 tabular-nums w-8 text-right">{r.lineNumber}</span>
                <span className="text-on-surface-variant group-hover:text-on-surface truncate">{r.lineText}</span>
              </button>
            ))}
          </div>
        ))}
        {searched && results.length >= 300 && (
          <p className="text-center text-on-surface-variant/30 py-2 text-[10px]">Showing first 300 results — refine your query</p>
        )}
      </div>
    </div>
  )
}
