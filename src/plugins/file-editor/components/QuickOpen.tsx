import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
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

function HighlightMatch({ text, query }: { text: string; query: string }): JSX.Element {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-bold bg-primary/15 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
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
    <motion.div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-md"
      onMouseDown={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className="w-[540px] max-h-[65vh] overflow-hidden flex flex-col rounded-2xl border border-outline-variant/25"
        style={{
          background: 'rgb(var(--c-surface) / 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.32), 0 4px 16px rgba(0,0,0,0.16)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-outline-variant/15">
          <Search size={18} className="text-primary/70 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Buscar archivos por nombre…"
            className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/35"
          />
          <kbd className="text-[10px] text-on-surface-variant/40 border border-outline-variant/30 px-1.5 py-0.5 rounded bg-surface-container/60">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant/40 py-10">
              {allFiles.length === 0
                ? 'Abrí una carpeta o archivo para usar Quick Open'
                : `Sin coincidencias para "${query}"`}
            </p>
          ) : (
            filtered.map((f, i) => {
              const lang = detectLanguage(f.name)
              const Icon = languageIcon(lang)
              const isSel = i === selected
              return (
                <button
                  key={f.path}
                  onClick={() => open(i)}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors border-l-2 ${
                    isSel ? 'border-primary bg-primary/[0.07]' : 'border-transparent hover:bg-surface-container-high'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isSel ? 'bg-primary/15' : 'bg-surface-container/60'}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-on-surface truncate">
                      <HighlightMatch text={f.name} query={query} />
                    </p>
                    <p className="text-[10px] text-on-surface-variant/45 truncate">
                      <HighlightMatch text={f.display} query={query} />
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-outline-variant/10 flex items-center gap-4 text-[10px] text-on-surface-variant/35">
          <span className="flex items-center gap-1"><kbd className="bg-surface-container px-1 py-0.5 rounded border border-outline-variant/20 text-[9px]">↑↓</kbd> navegar</span>
          <span className="flex items-center gap-1"><kbd className="bg-surface-container px-1 py-0.5 rounded border border-outline-variant/20 text-[9px]">↵</kbd> abrir</span>
          <span className="flex items-center gap-1"><kbd className="bg-surface-container px-1 py-0.5 rounded border border-outline-variant/20 text-[9px]">Esc</kbd> cerrar</span>
          <span className="ml-auto">{filtered.length} archivos</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
