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
      <span className="text-on-surface font-semibold underline decoration-primary/60 underline-offset-2">{text.slice(idx, idx + query.length)}</span>
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
      className="fixed inset-0 z-100 flex items-start justify-center pt-[12vh] bg-black/15 dark:bg-black/35"
      onMouseDown={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        className="mac-popover hairline w-[540px] max-h-[65vh] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 hairline-b">
          <Search size={16} className="text-on-surface-variant shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Buscar archivos por nombre…"
            aria-label="Buscar archivos por nombre"
            className="flex-1 bg-transparent t-callout text-on-surface outline-hidden placeholder:text-on-surface-variant/50"
          />
          <kbd className="t-caption text-on-surface-variant hairline px-1.5 rounded bg-on-surface/4">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-center t-body text-on-surface-variant py-10">
              {allFiles.length === 0
                ? 'Abrí una carpeta o un archivo para usar la apertura rápida'
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
                  className={`flex items-center gap-3 w-[calc(100%-12px)] mx-1.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                    isSel ? 'bg-primary/15' : 'hover:bg-on-surface/5'
                  }`}
                >
                  <Icon size={15} className="shrink-0 text-on-surface-variant" />
                  <div className="flex-1 min-w-0">
                    <p className="t-body font-medium text-on-surface truncate">
                      <HighlightMatch text={f.name} query={query} />
                    </p>
                    <p className="t-caption text-on-surface-variant truncate">
                      <HighlightMatch text={f.display} query={query} />
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="px-4 py-2 hairline-t mt-1 flex items-center gap-4 t-caption text-on-surface-variant">
          <span className="flex items-center gap-1"><kbd className="hairline bg-on-surface/4 px-1 rounded">↑↓</kbd> navegar</span>
          <span className="flex items-center gap-1"><kbd className="hairline bg-on-surface/4 px-1 rounded">↵</kbd> abrir</span>
          <span className="flex items-center gap-1"><kbd className="hairline bg-on-surface/4 px-1 rounded">Esc</kbd> cerrar</span>
          <span className="ml-auto">{filtered.length} archivos</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
