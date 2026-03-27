import { useState, useEffect, useRef, useMemo } from 'react'
import { Search } from 'lucide-react'
import { detectLanguage, languageIcon } from '../hooks/useEditorTabs'
import type { FileTreeNode } from '../types'

interface FileEntry { path: string; name: string; display: string }

function flattenTree(node: FileTreeNode, rootName: string): FileEntry[] {
  if (!node.isDir) return [{ path: node.path, name: node.name, display: node.path }]
  const rel = (p: string) => rootName + p.slice(node.path.length).replace(/\\/g, '/')
  const recurse = (n: FileTreeNode): FileEntry[] =>
    n.isDir ? (n.children ?? []).flatMap(recurse) : [{ path: n.path, name: n.name, display: rel(n.path) }]
  return (node.children ?? []).flatMap(recurse)
}

interface QuickOpenProps {
  folders: FileTreeNode[]
  openTabs?: { path: string | null; name: string }[]
  onOpen: (path: string) => void
  onClose: () => void
}

export function QuickOpen({ folders, openTabs = [], onOpen, onClose }: QuickOpenProps): JSX.Element {
  const [query, setQuery]   = useState('')
  const [selected, setSel]  = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const allFiles = useMemo(() => {
    const fromFolders = folders.flatMap((f) => flattenTree(f, f.name))
    const folderPaths = new Set(fromFolders.map((f) => f.path))
    // Include open tabs that have a path and aren't already in the folder tree
    const fromTabs = openTabs
      .filter((t) => t.path !== null && !folderPaths.has(t.path!))
      .map((t) => ({ path: t.path!, name: t.name, display: t.path! }))
    return [...fromFolders, ...fromTabs]
  }, [folders, openTabs])

  const filtered = useMemo(() => {
    if (!query.trim()) return allFiles.slice(0, 60)
    const q = query.toLowerCase()
    return allFiles
      .filter((f) => f.name.toLowerCase().includes(q) || f.display.toLowerCase().includes(q))
      .slice(0, 60)
  }, [allFiles, query])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSel(0) }, [filtered])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const open = (idx: number): void => {
    const f = filtered[idx]
    if (f) { onOpen(f.path); onClose() }
  }

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape')    { e.preventDefault(); onClose() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); open(selected) }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-[540px] max-h-[65vh] bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-outline-variant/20">
          <Search size={18} className="text-on-surface-variant/50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search files by name…"
            className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35"
          />
          <kbd className="text-[10px] text-on-surface-variant/40 border border-outline-variant/30 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant/40 py-10">
              {allFiles.length === 0
                ? 'Open a folder or file first to use Quick Open'
                : `No files match "${query}"`}
            </p>
          ) : (
            filtered.map((f, i) => (
              <button
                key={f.path}
                onClick={() => open(i)}
                className={`flex items-center gap-3 w-full px-4 py-2 text-left transition-colors ${
                  i === selected ? 'bg-primary/10' : 'hover:bg-surface-container-high'
                }`}
              >
                {(() => { const Icon = languageIcon(detectLanguage(f.name)); return <Icon size={14} className="text-on-surface-variant/50 flex-shrink-0" /> })()}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-on-surface truncate">{f.name}</p>
                  <p className="text-[10px] text-on-surface-variant/45 truncate">{f.display}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-1.5 border-t border-outline-variant/15 flex items-center gap-3 text-[10px] text-on-surface-variant/40">
          <span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span>
          <span className="ml-auto">{filtered.length} files</span>
        </div>
      </div>
    </div>
  )
}
