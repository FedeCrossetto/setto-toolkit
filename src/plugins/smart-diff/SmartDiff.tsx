import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { diffLines, diffWords, type Change } from 'diff'
import {
  ArrowLeftRight, CheckCircle2, ChevronLeft, ChevronRight, Code2, Diff,
  FileCode2, FileText, FolderOpen, Palette,
  Settings, Terminal, Trash2, X,
} from 'lucide-react'
import { useEditorPrefs, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../file-editor/hooks/useEditorPrefs'
import { useApp } from '../../core/AppContext'
import { dragState } from '../../core/dragState'
import type { IconComponent } from '../../core/types'
import { Toggle } from '../../core/components/Form'

interface DiffLine {
  content: string
  type: 'added' | 'removed' | 'unchanged'
  lineNum: number
}

interface FileInfo { name: string; size: number }

// ── Diff colors ───────────────────────────────────────────────────────────────
// Token-based (follow the palette in light & dark): rgb(var(--c-success|error) / alpha)
const ADDED   = (a = 1): string => `rgb(var(--c-success) / ${a})`
const REMOVED = (a = 1): string => `rgb(var(--c-error) / ${a})`

// ── Word-level diff ───────────────────────────────────────────────────────────
/**
 * Given a removed line and its corresponding added line, returns two arrays of
 * React spans where changed words are highlighted with a stronger background.
 * Used only for 'removed'/'added' lines to show intra-line changes.
 */
function buildWordDiff(
  removedText: string,
  addedText: string
): { removedSpans: React.ReactNode; addedSpans: React.ReactNode } {
  const changes = diffWords(removedText, addedText)
  const removedSpans: React.ReactNode[] = []
  const addedSpans: React.ReactNode[] = []

  changes.forEach((ch, i) => {
    if (ch.removed) {
      removedSpans.push(
        <mark key={i} style={{ background: REMOVED(0.25), borderRadius: '2px', padding: '0 1px' }}>
          {ch.value}
        </mark>
      )
    } else if (ch.added) {
      addedSpans.push(
        <mark key={i} style={{ background: ADDED(0.25), borderRadius: '2px', padding: '0 1px' }}>
          {ch.value}
        </mark>
      )
    } else {
      removedSpans.push(<span key={`r${i}`}>{ch.value}</span>)
      addedSpans.push(<span key={`a${i}`}>{ch.value}</span>)
    }
  })

  return { removedSpans, addedSpans }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildDiffLines(changes: Change[]): { left: DiffLine[]; right: DiffLine[] } {
  const left: DiffLine[] = []
  const right: DiffLine[] = []
  let leftNum = 1
  let rightNum = 1

  for (const change of changes) {
    const lines = change.value.endsWith('\n')
      ? change.value.slice(0, -1).split('\n')
      : change.value.split('\n')

    if (change.removed) {
      for (const line of lines) left.push({ content: line, type: 'removed', lineNum: leftNum++ })
    } else if (change.added) {
      for (const line of lines) right.push({ content: line, type: 'added', lineNum: rightNum++ })
    } else {
      for (const line of lines) {
        left.push({ content: line, type: 'unchanged', lineNum: leftNum++ })
        right.push({ content: line, type: 'unchanged', lineNum: rightNum++ })
      }
    }
  }
  return { left, right }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function fileIcon(name: string): IconComponent {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return FileCode2
  if (['py'].includes(ext))                       return Code2
  if (['json'].includes(ext))                     return FileCode2
  if (['md'].includes(ext))                       return FileText
  if (['css', 'scss', 'less'].includes(ext))      return Palette
  if (['html', 'xml', 'svg'].includes(ext))       return FileCode2
  if (['sh', 'bash', 'zsh'].includes(ext))        return Terminal
  return FileText
}

// ── Overview ruler ────────────────────────────────────────────────────────────
function getBlocks(lines: DiffLine[], type: 'removed' | 'added'): { start: number; count: number }[] {
  const blocks: { start: number; count: number }[] = []
  let inBlock = false; let blockStart = 0; let blockCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.type === type) { // bounded by i < lines.length
      if (!inBlock) { inBlock = true; blockStart = i; blockCount = 1 }
      else blockCount++
    } else if (inBlock) {
      blocks.push({ start: blockStart, count: blockCount }); inBlock = false; blockCount = 0
    }
  }
  if (inBlock) blocks.push({ start: blockStart, count: blockCount })
  return blocks
}

function OverviewRuler({
  leftLines, rightLines, scrollTop, scrollHeight, clientHeight, onJump,
}: {
  leftLines: DiffLine[]; rightLines: DiffLine[]
  scrollTop: number; scrollHeight: number; clientHeight: number
  onJump: (scrollTop: number) => void
}): JSX.Element {
  const rulerRef   = useRef<HTMLDivElement>(null)
  const totalLeft  = leftLines.length  || 1
  const totalRight = rightLines.length || 1
  const removedBlocks = getBlocks(leftLines,  'removed')
  const addedBlocks   = getBlocks(rightLines, 'added')
  const maxScroll    = Math.max(1, scrollHeight - clientHeight)
  const viewFraction = Math.min(1, clientHeight / scrollHeight)
  const indicatorTop = (scrollTop / maxScroll) * (1 - viewFraction) * 100
  const indicatorH   = viewFraction * 100

  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = rulerRef.current?.getBoundingClientRect()
    if (!rect) return
    onJump((e.clientY - rect.top) / rect.height * scrollHeight)
  }

  return (
    <div
      ref={rulerRef}
      onClick={handleClick}
      className="w-3.5 flex-shrink-0 relative cursor-pointer bg-sidebar/40 border-x border-hairline select-none"
      title="Clic para saltar"
    >
      {removedBlocks.map((b, i) => (
        <div key={`r${i}`} className="absolute left-0 w-1/2 rounded-sm"
          style={{ backgroundColor: REMOVED(0.7), top: `${(b.start / totalLeft) * 100}%`, height: `${Math.max(0.4, (b.count / totalLeft) * 100)}%`, minHeight: '2px' }}
        />
      ))}
      {addedBlocks.map((b, i) => (
        <div key={`a${i}`} className="absolute right-0 w-1/2 rounded-sm"
          style={{ backgroundColor: ADDED(0.7), top: `${(b.start / totalRight) * 100}%`, height: `${Math.max(0.4, (b.count / totalRight) * 100)}%`, minHeight: '2px' }}
        />
      ))}
      <div className="absolute inset-x-0 bg-on-surface/10 border-y border-hairline pointer-events-none"
        style={{ top: `${indicatorTop}%`, height: `${indicatorH}%` }}
      />
    </div>
  )
}

// ── CodePane ──────────────────────────────────────────────────────────────────
function CodePane({
  side, lines, value, onChange, onFileLoad, onClear, scrollRef, onScroll, fontFamily, fontSize,
  wordDiffMap,
}: {
  side: 'original' | 'modified'
  lines: DiffLine[]
  value: string
  onChange: (v: string) => void
  onFileLoad: (info: FileInfo, content: string) => void
  onClear: () => void
  scrollRef: React.RefObject<HTMLDivElement>
  onScroll: () => void
  fontFamily: string
  fontSize: number
  /** Map from lineNum → React nodes with word-level highlighting */
  wordDiffMap: Map<number, React.ReactNode>
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const isLeft = side === 'original'
  const monoFont = `'${fontFamily}', 'JetBrains Mono', 'Fira Code', monospace`

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Accept setto-file drags from the File Editor (module-level drag state)
    const settoFile = dragState.get()
    if (settoFile) {
      dragState.set(null)
      onChange(settoFile.content)
      onFileLoad({ name: settoFile.name, size: new TextEncoder().encode(settoFile.content).length }, settoFile.content)
      return
    }
    // Fall back to filesystem file drop
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      onChange(content)
      onFileLoad({ name: file.name, size: file.size }, content)
    }
    reader.readAsText(file)
  }, [onChange, onFileLoad])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      onChange(content)
      onFileLoad({ name: file.name, size: file.size }, content)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const dotColor    = isLeft ? REMOVED() : ADDED()

  return (
    <div
      className={`relative flex-1 flex flex-col min-w-0 overflow-hidden ${isLeft ? '' : 'hairline-l'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); handleDrop(e) }}
    >
      {/* Drag-over feedback */}
      {dragOver && (
        <div className="absolute inset-2 z-20 pointer-events-none rounded-lg border-2 border-dashed border-primary/60 bg-surface/90 flex items-center justify-center">
          <p className="t-callout font-medium text-on-surface">Soltá el archivo en {isLeft ? 'Original' : 'Modificado'}</p>
        </div>
      )}
      {/* Pane header */}
      <div className="flex items-center gap-2 px-3 h-8 hairline-b bg-sidebar/40 flex-shrink-0">
        <span className="flex items-center gap-1.5 t-footnote font-medium text-on-surface">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
          {isLeft ? 'Original' : 'Modificado'}
        </span>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
        <div className="ml-auto flex items-center gap-0.5">
          {value && (
            <button onClick={onClear} title="Vaciar" aria-label="Vaciar" className="ui-btn ui-btn-ghost ui-btn-icon">
              <X size={13} />
            </button>
          )}
          <button onClick={() => fileInputRef.current?.click()} title="Abrir archivo" aria-label="Abrir archivo"
            className="ui-btn ui-btn-ghost ui-btn-icon">
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {lines.length > 0 ? (
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto bg-surface">
          <table className="w-full border-collapse" style={{ fontFamily: monoFont, fontSize: `${fontSize}px`, lineHeight: '1.7' }}>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} style={{
                  backgroundColor: line.type === 'removed' ? REMOVED(0.07) :
                                   line.type === 'added'   ? ADDED(0.07) : undefined,
                }}>
                  <td className="w-10 text-right pr-3 select-none border-r t-footnote align-top py-0"
                    style={{
                      color: line.type === 'removed' ? REMOVED(0.5) :
                             line.type === 'added'   ? ADDED(0.5) : 'rgb(var(--c-on-surface-variant) / 0.55)',
                      borderColor: line.type === 'removed' ? REMOVED(0.19) :
                                   line.type === 'added'   ? ADDED(0.19) : 'var(--hairline)',
                      backgroundColor: line.type === 'removed' ? REMOVED(0.09) :
                                       line.type === 'added'   ? ADDED(0.09) : undefined,
                    }}>
                    {line.lineNum}
                  </td>
                  <td className="px-4 py-0 whitespace-pre-wrap break-all align-top"
                    style={{ color: line.type === 'unchanged' ? 'rgb(var(--c-on-surface) / 0.75)' : 'rgb(var(--c-on-surface))' }}>
                    {wordDiffMap.get(line.lineNum) ?? line.content ?? '\u00a0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isLeft ? 'Pegá el código original o arrastrá un archivo…' : 'Pegá el código modificado o arrastrá un archivo…'}
          aria-label={isLeft ? 'Código original' : 'Código modificado'}
          className="flex-1 bg-surface resize-none p-4 text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
          style={{ fontFamily: monoFont, fontSize: `${fontSize}px`, lineHeight: '1.7' }}
          spellCheck={false}
        />
      )}
    </div>
  )
}

// ── Sidebar file card ─────────────────────────────────────────────────────────
function FileCard({ label, dotColor, info, onClear }: {
  label: string; dotColor: string; info: FileInfo | null; onClear: () => void
}): JSX.Element {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="t-section">{label}</span>
      </div>
      {info ? (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-on-surface/[0.05] group">
          {(() => { const Icon = fileIcon(info.name); return <Icon size={14} className="text-on-surface-variant flex-shrink-0" /> })()}
          <div className="min-w-0 flex-1">
            <p className="t-footnote font-medium text-on-surface truncate">{info.name}</p>
            <p className="t-caption text-on-surface-variant">{formatBytes(info.size)}</p>
          </div>
          <button
            onClick={onClear}
            title="Quitar archivo"
            aria-label="Quitar archivo"
            className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-opacity flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="px-2 py-1.5 rounded-md border border-dashed border-hairline-strong t-caption text-on-surface-variant text-center">
          Sin archivo
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SmartDiff(): JSX.Element {
  const { prefs, updatePrefs } = useEditorPrefs()
  const { state, dispatch }    = useApp()
  const [original, setOriginal]     = useState('')
  const [modified, setModified]     = useState('')
  const [origFile, setOrigFile]     = useState<FileInfo | null>(null)
  const [modFile, setModFile]       = useState<FileInfo | null>(null)
  const [hasDiff, setHasDiff]       = useState(false)
  const [changes, setChanges]       = useState<Change[]>([])
  const [ignoreWs, setIgnoreWs]     = useState(false)
  const [syncScroll, setSyncScroll] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Keep a stable ref of original so the diffTarget effect can read it without going stale
  const originalRef = useRef(original)
  originalRef.current = original

  // Consume files forwarded from the File Editor.
  // Handles both single-file (SEND_TO_DIFF) and two-file pairs (SEND_PAIR_TO_DIFF).
  useEffect(() => {
    const t1 = state.diffTarget
    const t2 = state.diffTarget2
    if (!t1 && !t2) return

    const makeInfo = (t: NonNullable<typeof t1>): FileInfo =>
      ({ name: t.name, size: new TextEncoder().encode(t.content).length })

    if (t1 && t2) {
      // Pair: always load file1 → Original, file2 → Modified
      setOriginal(t1.content); setOrigFile(makeInfo(t1))
      setModified(t2.content); setModFile(makeInfo(t2))
    } else if (t1) {
      // Single file: first empty pane wins
      if (!originalRef.current.trim()) {
        setOriginal(t1.content); setOrigFile(makeInfo(t1))
      } else {
        setModified(t1.content); setModFile(makeInfo(t1))
      }
    }

    setHasDiff(false); setChanges([])
    dispatch({ type: 'CLEAR_DIFF_TARGET' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.diffTarget, state.diffTarget2])

  const leftScrollRef  = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const scrollingRef   = useRef(false)
  const settingsRef    = useRef<HTMLDivElement>(null)
  const [scrollInfo, setScrollInfo] = useState({ scrollTop: 0, scrollHeight: 1, clientHeight: 1 })

  // ── Sync scroll + ruler tracking ────────────────────────────────────────────
  const handleLeftScroll = (): void => {
    const el = leftScrollRef.current
    if (!el) return
    setScrollInfo({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    if (!syncScroll || scrollingRef.current || !rightScrollRef.current) return
    scrollingRef.current = true
    rightScrollRef.current.scrollTop = el.scrollTop
    scrollingRef.current = false
  }
  const handleRightScroll = (): void => {
    const el = rightScrollRef.current
    if (!el) return
    setScrollInfo({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
    if (!syncScroll || scrollingRef.current || !leftScrollRef.current) return
    scrollingRef.current = true
    leftScrollRef.current.scrollTop = el.scrollTop
    scrollingRef.current = false
  }
  const handleRulerJump = (scrollTop: number): void => {
    if (leftScrollRef.current)  leftScrollRef.current.scrollTop  = scrollTop
    if (rightScrollRef.current) rightScrollRef.current.scrollTop = scrollTop
    setScrollInfo((prev) => ({ ...prev, scrollTop }))
  }

  const clearSide = (side: 'orig' | 'mod'): void => {
    if (side === 'orig') { setOriginal(''); setOrigFile(null) }
    else                 { setModified(''); setModFile(null) }
    setHasDiff(false); setChanges([])
  }

  const runDiff = (): void => {
    if (!original.trim() || !modified.trim()) return
    const result = diffLines(original, modified, { ignoreWhitespace: ignoreWs })
    setChanges(result); setHasDiff(true)
  }

  const clearAll = (): void => {
    setOriginal(''); setModified('')
    setOrigFile(null); setModFile(null)
    setHasDiff(false); setChanges([])
  }

  /** Discard the diff result but keep both files loaded in the editors. */
  const cancelDiff = (): void => {
    setHasDiff(false); setChanges([])
  }

  const swapSides = (): void => {
    setOriginal(modified); setModified(original)
    setOrigFile(modFile);  setModFile(origFile)
    setHasDiff(false); setChanges([])
  }

  const { left, right } = hasDiff ? buildDiffLines(changes) : { left: [], right: [] }
  const addedCount   = changes.filter((c) => c.added).reduce((n, c) => n + c.value.split('\n').filter(Boolean).length, 0)
  const removedCount = changes.filter((c) => c.removed).reduce((n, c) => n + c.value.split('\n').filter(Boolean).length, 0)
  const isIdentical  = hasDiff && addedCount === 0 && removedCount === 0

  // Build word-diff maps: for each changed line, pair removed↔added lines by index
  // and compute intra-line word highlights.
  const leftWordDiff  = new Map<number, React.ReactNode>()
  const rightWordDiff = new Map<number, React.ReactNode>()
  if (hasDiff) {
    const removedLines = left.filter((l) => l.type === 'removed')
    const addedLines   = right.filter((l) => l.type === 'added')
    const pairCount    = Math.min(removedLines.length, addedLines.length)
    for (let i = 0; i < pairCount; i++) {
      const rem = removedLines[i]! // bounded by pairCount = min(removedLines.length, addedLines.length)
      const add = addedLines[i]!
      const { removedSpans, addedSpans } = buildWordDiff(rem.content, add.content)
      leftWordDiff.set(rem.lineNum, removedSpans)
      rightWordDiff.set(add.lineNum, addedSpans)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar (collapsible — same pattern as File Editor) ───────────── */}
      <aside className={`flex-shrink-0 flex flex-col hairline-r bg-sidebar/40 overflow-hidden transition-[width] duration-200 ${sidebarCollapsed ? 'w-9' : 'w-56'}`}>
        {sidebarCollapsed ? (
          <button type="button" onClick={() => setSidebarCollapsed(false)} title="Expandir barra lateral" aria-label="Expandir barra lateral"
            className="flex-1 flex flex-col items-center justify-center gap-3 hover:bg-on-surface/[0.05] transition-colors w-full min-h-0 py-4">
            <ChevronRight size={13} className="text-on-surface-variant flex-shrink-0" />
            <span className="t-section select-none"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
              Comparar
            </span>
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 h-10 hairline-b flex-shrink-0 gap-2">
              <span className="t-section truncate">Comparar archivos</span>
              <button type="button" onClick={() => setSidebarCollapsed(true)} title="Colapsar barra lateral" aria-label="Colapsar barra lateral"
                className="ui-btn ui-btn-ghost ui-btn-icon flex-shrink-0">
                <ChevronLeft size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <FileCard label="Original" dotColor={REMOVED()} info={origFile} onClear={() => clearSide('orig')} />
              <div className="mx-3 hairline-t" />
              <FileCard label="Modificado" dotColor={ADDED()}   info={modFile}  onClear={() => clearSide('mod')} />

              {/* Diff stats */}
              {hasDiff && (
                <>
                  <div className="mx-3 mt-2 hairline-t" />
                  <div className="px-3 py-2.5">
                    <span className="t-section">Cambios</span>
                    {isIdentical ? (
                      <div className="mt-2 flex items-center gap-1.5 t-footnote text-on-surface">
                        <CheckCircle2 size={13} className="text-success" />
                        <span className="font-medium">Los archivos son iguales</span>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-col gap-1">
                        <div className="flex items-center gap-2 t-footnote">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ADDED() }} />
                          <span className="text-on-surface-variant">Agregadas</span>
                          <span className="ml-auto font-mono font-medium" style={{ color: ADDED() }}>+{addedCount}</span>
                        </div>
                        <div className="flex items-center gap-2 t-footnote">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: REMOVED() }} />
                          <span className="text-on-surface-variant">Eliminadas</span>
                          <span className="ml-auto font-mono font-medium" style={{ color: REMOVED() }}>-{removedCount}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Options */}
              <div className="mx-3 mt-2 hairline-t" />
              <div className="px-3 py-2.5 flex flex-col gap-2">
                <span className="t-section">Opciones</span>
                {([
                  { label: 'Ignorar espacios', value: ignoreWs,   set: setIgnoreWs },
                  { label: 'Desplazamiento sincronizado', value: syncScroll, set: setSyncScroll },
                ] as const).map(({ label, value, set }) => (
                  <div key={label} className="flex items-center justify-between gap-2 select-none">
                    <span className="t-footnote text-on-surface">{label}</span>
                    <Toggle checked={value} onChange={(v) => set(v)} label={label} />
                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar actions */}
            <div className="hairline-t px-3 py-2 flex-shrink-0 flex flex-col gap-1.5">
              <button type="button" onClick={swapSides} disabled={!original && !modified}
                className="ui-btn ui-btn-ghost ui-btn-sm w-full !justify-start">
                <ArrowLeftRight size={14} />
                Intercambiar lados
              </button>
              <button type="button" onClick={clearAll} disabled={!original && !modified}
                className="ui-btn ui-btn-ghost ui-btn-sm w-full !justify-start">
                <Trash2 size={14} />
                Vaciar todo
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="px-3 h-10 bg-surface hairline-b flex items-center gap-2 flex-shrink-0">
          <button onClick={runDiff} disabled={!original.trim() || !modified.trim()}
            className="ui-btn ui-btn-primary ui-btn-sm">
            <Diff size={14} />
            Comparar
          </button>

          {hasDiff && (
            <button onClick={cancelDiff}
              className="ui-btn ui-btn-ghost ui-btn-sm">
              <X size={14} />
              Descartar comparación
            </button>
          )}

          {hasDiff && (
            <div className="flex items-center gap-3 ml-2 t-footnote">
              <span className="font-mono font-medium" style={{ color: ADDED() }}>+{addedCount}</span>
              <span className="font-mono font-medium" style={{ color: REMOVED() }}>-{removedCount}</span>
            </div>
          )}

          {/* Settings */}
          <div className="ml-auto relative" ref={settingsRef}>
            <button onClick={() => setSettingsOpen((v) => !v)} title="Ajustes de visualización" aria-label="Ajustes de visualización" aria-pressed={settingsOpen}
              className={`ui-btn ui-btn-ghost ui-btn-icon ${settingsOpen ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
              <Settings size={15} />
            </button>

            <AnimatePresence>
              {settingsOpen && (
                <motion.div
                  className="mac-popover hairline absolute right-0 top-full mt-1 w-60 z-30 p-3 flex flex-col gap-3"
                  initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                >
                  {/* Font size */}
                  <div className="flex flex-col gap-1.5">
                    <span className="t-section">Tamaño de fuente</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updatePrefs({ fontSize: Math.max(FONT_SIZE_MIN, prefs.fontSize - 1) })}
                        aria-label="Achicar fuente" className="ui-btn ui-btn-outline ui-btn-sm w-7 !px-0">−</button>
                      <span className="flex-1 text-center t-footnote tabular-nums text-on-surface">{prefs.fontSize} px</span>
                      <button onClick={() => updatePrefs({ fontSize: Math.min(FONT_SIZE_MAX, prefs.fontSize + 1) })}
                        aria-label="Agrandar fuente" className="ui-btn ui-btn-outline ui-btn-sm w-7 !px-0">+</button>
                    </div>
                  </div>

                  {/* Font family */}
                  <div className="flex flex-col gap-1.5">
                    <span className="t-section">Fuente</span>
                    <div className="flex flex-col">
                      {FONT_FAMILIES.map((f) => (
                        <button key={f} onClick={() => updatePrefs({ fontFamily: f })}
                          className={`text-left px-2.5 py-1 rounded-md t-footnote transition-colors ${prefs.fontFamily === f ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-on-surface/[0.06]'}`}
                          style={{ fontFamily: f }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Code panels */}
        <section className="flex flex-1 overflow-hidden relative">
          <CodePane
            side="original"
            lines={hasDiff ? left : []}
            value={original}
            onChange={(v) => { setOriginal(v); setHasDiff(false) }}
            onFileLoad={(info, content) => { setOrigFile(info); setOriginal(content); setHasDiff(false) }}
            onClear={() => clearSide('orig')}
            scrollRef={leftScrollRef}
            onScroll={handleLeftScroll}
            fontFamily={prefs.fontFamily}
            fontSize={prefs.fontSize}
            wordDiffMap={leftWordDiff}
          />

          {hasDiff && !isIdentical && (
            <OverviewRuler
              leftLines={left} rightLines={right}
              scrollTop={scrollInfo.scrollTop}
              scrollHeight={scrollInfo.scrollHeight}
              clientHeight={scrollInfo.clientHeight}
              onJump={handleRulerJump}
            />
          )}

          <CodePane
            side="modified"
            lines={hasDiff ? right : []}
            value={modified}
            onChange={(v) => { setModified(v); setHasDiff(false) }}
            onFileLoad={(info, content) => { setModFile(info); setModified(content); setHasDiff(false) }}
            onClear={() => clearSide('mod')}
            scrollRef={rightScrollRef}
            onScroll={handleRightScroll}
            fontFamily={prefs.fontFamily}
            fontSize={prefs.fontSize}
            wordDiffMap={rightWordDiff}
          />

          {/* No-differences banner */}
          <AnimatePresence>
            {isIdentical && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center bg-surface/60 z-10 pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              >
                <motion.div
                  className="mac-popover hairline flex flex-col items-center gap-3 px-10 py-7 pointer-events-auto"
                  initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.14, ease: 'easeOut' }}
                >
                  <CheckCircle2 size={36} strokeWidth={1.5} className="text-success" />
                  <p className="t-headline text-on-surface">No hay diferencias entre los archivos.</p>
                  <button
                    onClick={cancelDiff}
                    className="ui-btn ui-btn-outline ui-btn-sm mt-1"
                  >
                    Cerrar
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}
