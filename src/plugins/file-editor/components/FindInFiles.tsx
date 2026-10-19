import { useState, useEffect, useRef } from 'react'
import { Loader2, Replace, Search, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { FileTreeNode, FindResult, OpenFile, ReplaceInFilesResponse } from '../types'
import { languageIcon, detectLanguage } from '../hooks/useEditorTabs'
import { useConfirm } from '../../../core/components/Modal'
import { useToast } from '../../../core/components/Toast'

interface FindInFilesProps {
  folders: FileTreeNode[]
  openTabs: OpenFile[]
  onOpenAt: (path: string, line: number) => void
  onClose: () => void
  /** Called with the paths written by "Reemplazar todo" so open tabs can reload */
  onReplaced?: (paths: string[]) => void
}

const errMsg = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

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

export function FindInFiles({ folders, openTabs, onOpenAt, onClose, onReplaced }: FindInFilesProps): JSX.Element {
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
  // ── Replace mode ──
  const [replaceMode, setReplaceMode] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [replacePreview, setReplacePreview] = useState<ReplaceInFilesResponse | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [replacing, setReplacing] = useState(false)
  const confirm = useConfirm()
  const { show: showToast } = useToast()
  const dirtyPaths = new Set(openTabs.filter((t) => t.isDirty && t.path).map((t) => t.path!))

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
  const canReplace  = !!query.trim() && scopeFolder !== null

  // Any change to the query/options invalidates a previous replace preview
  useEffect(() => { setReplacePreview(null) }, [query, replacement, useRegex, scope])

  const previewReplace = async (): Promise<void> => {
    if (!canReplace) return
    setSearching(true)
    setSearchError(null)
    setReplacePreview(null)
    try {
      const res = await window.api.invoke<ReplaceInFilesResponse>('editor:replace-in-files', {
        root: scopeFolder!.path, query, replacement, useRegex, dryRun: true,
      })
      setReplacePreview(res)
      // Files with unsaved edits in an open tab start unchecked (writing them would conflict)
      setChecked(new Set(res.files.map((f) => f.path).filter((p) => !dirtyPaths.has(p))))
    } catch (e) {
      setSearchError(errMsg(e))
    } finally {
      setSearching(false)
    }
  }

  const replaceAll = async (): Promise<void> => {
    if (!replacePreview || checked.size === 0) return
    const files = replacePreview.files.filter((f) => checked.has(f.path))
    const total = files.reduce((n, f) => n + f.count, 0)
    const ok = await confirm({
      title: '¿Reemplazar en archivos?',
      message: `Se van a reemplazar ${total} coincidencia${total === 1 ? '' : 's'} en ${files.length} archivo${files.length === 1 ? '' : 's'}. Se guarda una copia de cada archivo en el historial local.`,
      confirmLabel: 'Reemplazar todo',
      destructive: true,
    })
    if (!ok) return
    setReplacing(true)
    try {
      const res = await window.api.invoke<ReplaceInFilesResponse>('editor:replace-in-files', {
        root: scopeFolder!.path, query, replacement, useRegex, dryRun: false, paths: files.map((f) => f.path),
      })
      const written = res.files.map((f) => f.path)
      if (res.errors.length > 0) {
        showToast(`${res.totalMatches} reemplazos en ${res.written} archivo${res.written === 1 ? '' : 's'}; ${res.errors.length} con error: ${res.errors[0]!.message}`, 'warning', 6000)
      } else {
        showToast(`${res.totalMatches} reemplazo${res.totalMatches === 1 ? '' : 's'} en ${res.written} archivo${res.written === 1 ? '' : 's'}`, 'success', 3000)
      }
      onReplaced?.(written)
      setReplacePreview(null)
    } catch (e) {
      showToast(`No se pudo reemplazar: ${errMsg(e)}`, 'error', 5000)
    } finally {
      setReplacing(false)
    }
  }

  const run = async (): Promise<void> => {
    if (replaceMode && scopeFolder) { await previewReplace(); return }
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
        className="fl-dialog pointer-events-auto flex flex-col overflow-hidden"
        style={{
          width: 560,
          maxHeight: hasResults ? '72vh' : 'auto',
        }}
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 hairline-b">
          <Search size={15} className="text-on-surface-variant shrink-0" />

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
            placeholder="Buscar en archivos…"
            aria-label="Buscar en archivos"
            className="flex-1 bg-transparent t-body text-on-surface outline-hidden ring-0 focus:ring-0 focus:outline-hidden placeholder:text-on-surface-variant/50 min-w-0"
          />

          <button
            onClick={() => setReplaceMode((v) => !v)}
            title="Reemplazar en archivos"
            aria-label="Reemplazar en archivos"
            aria-pressed={replaceMode}
            className={`ui-btn ui-btn-ghost ui-btn-icon shrink-0 ${replaceMode ? 'bg-on-surface/8! text-on-surface!' : ''}`}
          ><Replace size={14} /></button>

          <button
            onClick={() => setRegex((v) => !v)}
            title="Expresión regular"
            aria-pressed={useRegex}
            className={`ui-btn ui-btn-ghost ui-btn-sm font-mono shrink-0 ${
              useRegex ? 'bg-on-surface/8! text-on-surface!' : ''
            }`}
          >.*</button>

          {hasFolders && (
            <select
              value={scope === 'tabs' ? 'tabs' : String(scope)}
              onChange={(e) => setScope(e.target.value === 'tabs' ? 'tabs' : Number(e.target.value))}
              aria-label="Alcance de la búsqueda"
              className="ui-input py-0.5! px-1.5! t-footnote shrink-0"
            >
              {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          <button
            onClick={() => void run()}
            disabled={(replaceMode ? !canReplace : !canSearch) || searching}
            className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {searching ? 'Buscando…' : replaceMode ? 'Vista previa' : 'Buscar'}
          </button>

          <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar"
            className="ui-btn ui-btn-ghost ui-btn-icon shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Replace row */}
        {replaceMode && (
          <div className="flex items-center gap-2 px-3 py-2 hairline-b">
            <Replace size={15} className="text-on-surface-variant shrink-0" />
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void previewReplace() }}
              placeholder={useRegex ? 'Reemplazar con… ($1, $& para grupos)' : 'Reemplazar con…'}
              aria-label="Reemplazar con"
              className="flex-1 bg-transparent t-body text-on-surface outline-hidden placeholder:text-on-surface-variant/50 min-w-0"
            />
            <button
              onClick={() => void replaceAll()}
              disabled={!replacePreview || checked.size === 0 || replacing}
              className="ui-btn ui-btn-danger ui-btn-sm shrink-0"
            >
              {replacing && <Loader2 size={12} className="animate-spin" />}
              Reemplazar todo
            </button>
          </div>
        )}

        {/* Replace preview */}
        {replaceMode && (replacePreview || !scopeFolder) && (
          <div className="overflow-y-auto t-footnote" style={{ maxHeight: '60vh' }}>
            {!scopeFolder && (
              <p className="text-center text-on-surface-variant py-8">Elegí una carpeta como alcance para reemplazar en archivos</p>
            )}
            {replacePreview && replacePreview.files.length === 0 && (
              <p className="text-center text-on-surface-variant py-8">Sin coincidencias</p>
            )}
            {replacePreview?.files.map((f) => (
              <div key={f.path}>
                <label className="flex items-center gap-2 px-3 py-1 sticky top-0 hairline-b bg-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked.has(f.path)}
                    onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(f.path); else n.delete(f.path); return n })}
                    aria-label={`Incluir ${f.name}`}
                  />
                  <span className="font-medium text-on-surface truncate">{f.name}</span>
                  {dirtyPaths.has(f.path) && <span className="ui-badge ui-badge-warning shrink-0">sin guardar en el editor</span>}
                  <span className="text-on-surface-variant/70 t-caption truncate flex-1">{f.path}</span>
                  <span className="ml-auto t-caption tabular-nums text-on-surface-variant shrink-0">{f.count}</span>
                </label>
                {f.samples.map((s) => (
                  <button
                    key={s.lineNumber}
                    onClick={() => { onOpenAt(f.path, s.lineNumber); onClose() }}
                    className="flex items-start gap-2 w-full px-4 py-1 text-left hover:bg-on-surface/5 transition-colors"
                  >
                    <span className="text-on-surface-variant/60 shrink-0 tabular-nums w-8 text-right t-caption font-mono">{s.lineNumber}</span>
                    <span className="flex flex-col min-w-0 font-mono t-caption">
                      <span className="text-error truncate line-through decoration-error/40">{s.before}</span>
                      <span className="text-success truncate">{s.after}</span>
                    </span>
                  </button>
                ))}
                {f.count > f.samples.length && (
                  <p className="px-14 pb-1 t-caption text-on-surface-variant">y {f.count - f.samples.length} más…</p>
                )}
              </div>
            ))}
            {replacePreview?.limited && (
              <p className="text-center text-on-surface-variant py-2 t-caption">Se muestran los primeros 300 archivos: refiná la búsqueda</p>
            )}
          </div>
        )}

        {/* Results */}
        <div className={`overflow-y-auto t-footnote ${replaceMode && (replacePreview || !scopeFolder) ? 'hidden' : ''}`} style={{ maxHeight: '60vh' }}>
          {!searched && !searching && !hasTabs && !hasFolders && (
            <p className="text-center text-on-surface-variant py-8">Abrí archivos o una carpeta para buscar</p>
          )}
          {!searched && !searching && (hasTabs || hasFolders) && (
            <p className="text-center text-on-surface-variant py-8">Escribí y presioná Enter para buscar</p>
          )}
          {searchError && (
            <p className="mx-3 mt-3 px-3 py-2 rounded-lg border border-error/30 text-error">{searchError}</p>
          )}
          {searched && !searchError && results.length === 0 && (
            <p className="text-center text-on-surface-variant py-8">Sin resultados</p>
          )}
          {Object.entries(grouped).map(([filePath, matches]) => (
            <div key={filePath}>
              <div className="flex items-center gap-2 px-3 py-1 sticky top-0 hairline-b bg-surface">
                {(() => { const Icon = languageIcon(detectLanguage(matches[0]!.name)); return <Icon size={12} className="shrink-0 text-on-surface-variant" /> })()}
                <span className="font-medium text-on-surface truncate">{matches[0]!.name}</span>
                <span className="text-on-surface-variant/70 t-caption truncate hidden sm:block flex-1">{filePath}</span>
                <span className="ml-auto t-caption tabular-nums text-on-surface-variant shrink-0">{matches.length}</span>
              </div>
              {matches.map((r) => (
                <button
                  key={`${r.path}:${r.lineNumber}`}
                  onClick={() => { onOpenAt(r.path, r.lineNumber); onClose() }}
                  className="flex items-start gap-2 w-full px-4 py-1 text-left hover:bg-on-surface/5 transition-colors group"
                >
                  <span className="text-on-surface-variant/60 shrink-0 tabular-nums w-8 text-right t-caption font-mono">{r.lineNumber}</span>
                  <span className="text-on-surface-variant group-hover:text-on-surface truncate font-mono t-caption">{r.lineText}</span>
                </button>
              ))}
            </div>
          ))}
          {searched && results.length >= 300 && (
            <p className="text-center text-on-surface-variant py-2 t-caption">Mostrando los primeros 300 resultados: refiná la búsqueda</p>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 hairline-t flex items-center gap-3 t-caption text-on-surface-variant">
          <span className="flex items-center gap-1"><kbd className="kbd-chip">↵</kbd> buscar</span>
          <span className="flex items-center gap-1"><kbd className="kbd-chip">Esc</kbd> cerrar</span>
          {replaceMode && replacePreview
            ? <span className="ml-auto">{replacePreview.totalMatches} coincidencias en {replacePreview.files.length} archivos · {checked.size} seleccionados</span>
            : searched && <span className="ml-auto">{results.length} coincidencias</span>}
        </div>
      </motion.div>
    </div>
  )
}
