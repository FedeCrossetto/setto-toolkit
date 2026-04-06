import { useState, useCallback, useRef, useEffect, type ComponentType } from 'react'
import { diffLines, diffWords, type Change } from 'diff'
import {
  ArrowLeftRight, CheckCircle2, ChevronLeft, ChevronRight, Code2, Diff,
  FileCode2, FileText, FolderOpen, Palette,
  Settings, Terminal, Trash2, X,
} from 'lucide-react'
import { useEditorPrefs, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX } from '../file-editor/hooks/useEditorPrefs'
import { useApp } from '../../core/AppContext'
import { dragState } from '../../core/dragState'

interface DiffLine {
  content: string
  type: 'added' | 'removed' | 'unchanged'
  lineNum: number
}

interface FileInfo { name: string; size: number }

// ── Diff colors ───────────────────────────────────────────────────────────────
const ADDED_COLOR   = '#4ade80'  // green-400
const REMOVED_COLOR = '#f87171'  // red-400

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
        <mark key={i} style={{ background: REMOVED_COLOR + '40', borderRadius: '2px', padding: '0 1px' }}>
          {ch.value}
        </mark>
      )
    } else if (ch.added) {
      addedSpans.push(
        <mark key={i} style={{ background: ADDED_COLOR + '40', borderRadius: '2px', padding: '0 1px' }}>
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

function fileIcon(name: string): ComponentType<{ size?: number; className?: string }> {
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
    if (lines[i].type === type) {
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
      className="w-3.5 flex-shrink-0 relative cursor-pointer bg-surface-container-low border-x border-outline-variant/15 select-none"
      title="Click to jump"
    >
      {removedBlocks.map((b, i) => (
        <div key={`r${i}`} className="absolute left-0 w-1/2 rounded-sm"
          style={{ backgroundColor: REMOVED_COLOR + 'b3', top: `${(b.start / totalLeft) * 100}%`, height: `${Math.max(0.4, (b.count / totalLeft) * 100)}%`, minHeight: '2px' }}
        />
      ))}
      {addedBlocks.map((b, i) => (
        <div key={`a${i}`} className="absolute right-0 w-1/2 rounded-sm"
          style={{ backgroundColor: ADDED_COLOR + 'b3', top: `${(b.start / totalRight) * 100}%`, height: `${Math.max(0.4, (b.count / totalRight) * 100)}%`, minHeight: '2px' }}
        />
      ))}
      <div className="absolute inset-x-0 bg-on-surface/10 border-y border-outline-variant/30 pointer-events-none"
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

  const headerBg    = isLeft ? 'rgba(248,113,113,0.04)' : `${ADDED_COLOR}0a`
  const dotColor    = isLeft ? REMOVED_COLOR : ADDED_COLOR
  const labelColor  = isLeft ? REMOVED_COLOR + 'bb' : ADDED_COLOR + 'bb'

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isLeft ? '' : 'border-l border-outline-variant/15'}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Pane header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/15 flex-shrink-0"
        style={{ background: headerBg }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>
          {isLeft ? 'Original' : 'Modified'}
        </span>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
        <div className="ml-auto flex items-center gap-1">
          {value && (
            <button onClick={onClear} title="Clear" className="text-on-surface-variant/35 hover:text-error transition-colors">
              <X size={13} />
            </button>
          )}
          <button onClick={() => fileInputRef.current?.click()} title="Open file"
            className="text-on-surface-variant/35 hover:text-primary transition-colors">
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
                  backgroundColor: line.type === 'removed' ? REMOVED_COLOR + '12' :
                                   line.type === 'added'   ? ADDED_COLOR   + '12' : undefined,
                }}>
                  <td className="w-10 text-right pr-3 select-none border-r text-[11px] align-top py-0"
                    style={{
                      color: line.type === 'removed' ? REMOVED_COLOR + '80' :
                             line.type === 'added'   ? ADDED_COLOR   + '80' : 'rgb(100 100 130 / 0.5)',
                      borderColor: line.type === 'removed' ? REMOVED_COLOR + '30' :
                                   line.type === 'added'   ? ADDED_COLOR   + '30' : 'rgb(83 71 206 / 0.1)',
                      backgroundColor: line.type === 'removed' ? REMOVED_COLOR + '18' :
                                       line.type === 'added'   ? ADDED_COLOR   + '18' : undefined,
                    }}>
                    {line.lineNum}
                  </td>
                  <td className="px-4 py-0 whitespace-pre-wrap break-all align-top"
                    style={{ color: line.type === 'unchanged' ? 'rgb(var(--color-on-surface) / 0.55)' : undefined }}>
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
          placeholder={isLeft ? 'Paste original code, or drag & drop a file…' : 'Paste modified code, or drag & drop a file…'}
          className="flex-1 bg-surface-container-low resize-none p-4 text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none"
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
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50">{label}</span>
      </div>
      {info ? (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-surface-container rounded-lg border border-outline-variant/15 group">
          {(() => { const Icon = fileIcon(info.name); return <Icon size={14} className="text-on-surface-variant/50 flex-shrink-0" /> })()}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-on-surface truncate">{info.name}</p>
            <p className="text-[10px] text-on-surface-variant/45">{formatBytes(info.size)}</p>
          </div>
          <button
            onClick={onClear}
            title="Remove file"
            className="opacity-0 group-hover:opacity-100 text-on-surface-variant/40 hover:text-error transition-all flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="px-2 py-1.5 rounded-lg border border-dashed border-outline-variant/20 text-[10px] text-on-surface-variant/30 text-center">
          No file loaded
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
      const rem = removedLines[i]
      const add = addedLines[i]
      const { removedSpans, addedSpans } = buildWordDiff(rem.content, add.content)
      leftWordDiff.set(rem.lineNum, removedSpans)
      rightWordDiff.set(add.lineNum, addedSpans)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar (collapsible — same pattern as File Editor) ───────────── */}
      <aside className={`flex-shrink-0 flex flex-col border-r border-outline-variant/20 bg-surface overflow-hidden transition-[width] duration-200 ${sidebarCollapsed ? 'w-8' : 'w-52'}`}>
        {sidebarCollapsed ? (
          <button type="button" onClick={() => setSidebarCollapsed(false)} title="Expand sidebar"
            className="flex-1 flex flex-col items-center justify-center gap-3 hover:bg-surface-container transition-colors w-full min-h-0 py-4">
            <ChevronRight size={13} className="text-on-surface-variant/40 flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/35 select-none"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
              Compare
            </span>
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0 gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 truncate">Compare files</span>
              <button type="button" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar"
                className="text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container rounded-lg p-0.5 transition-colors flex-shrink-0">
                <ChevronLeft size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <FileCard label="Original" dotColor={REMOVED_COLOR} info={origFile} onClear={() => clearSide('orig')} />
              <div className="mx-3 border-t border-outline-variant/10" />
              <FileCard label="Modified" dotColor={ADDED_COLOR}   info={modFile}  onClear={() => clearSide('mod')} />

              {/* Diff stats */}
              {hasDiff && (
                <>
                  <div className="mx-3 mt-2 border-t border-outline-variant/10" />
                  <div className="px-3 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50">Changes</span>
                    {isIdentical ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-secondary">
                        <CheckCircle2 size={13} />
                        <span className="font-medium">Files are identical</span>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ADDED_COLOR }} />
                          <span className="text-on-surface-variant/70">Added</span>
                          <span className="ml-auto font-mono font-medium" style={{ color: ADDED_COLOR }}>+{addedCount}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: REMOVED_COLOR }} />
                          <span className="text-on-surface-variant/70">Removed</span>
                          <span className="ml-auto font-mono font-medium" style={{ color: REMOVED_COLOR }}>-{removedCount}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Options */}
              <div className="mx-3 mt-2 border-t border-outline-variant/10" />
              <div className="px-3 py-2.5 flex flex-col gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/50">Options</span>
                {([
                  { label: 'Ignore whitespace', value: ignoreWs,   set: setIgnoreWs },
                  { label: 'Sync scroll',       value: syncScroll, set: setSyncScroll },
                ] as const).map(({ label, value, set }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer select-none">
                    <div onClick={() => set((v) => !v)}
                      className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${value ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${value ? 'left-3.5' : 'left-0.5'}`} />
                    </div>
                    <span className="text-[11px] text-on-surface-variant/70">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sidebar actions */}
            <div className="border-t border-outline-variant/15 px-3 py-2 flex-shrink-0 flex flex-col gap-1.5">
              <button type="button" onClick={swapSides} disabled={!original && !modified}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[11px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors disabled:opacity-40">
                <ArrowLeftRight size={14} />
                Swap sides
              </button>
              <button type="button" onClick={clearAll} disabled={!original && !modified}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[11px] text-error/70 hover:bg-error/10 hover:text-error transition-colors disabled:opacity-40">
                <Trash2 size={14} />
                Clear all
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-2.5 bg-surface border-b border-outline-variant/15 flex items-center gap-3 flex-shrink-0">
          <button onClick={runDiff} disabled={!original.trim() || !modified.trim()}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-[12px] font-medium transition-colors disabled:opacity-40 border border-primary/20">
            <Diff size={14} />
            Compare
          </button>

          {hasDiff && (
            <button onClick={cancelDiff}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors border border-outline-variant/20">
              <X size={14} />
              Cancel diff
            </button>
          )}

          {hasDiff && (
            <div className="flex items-center gap-3 ml-2 text-[11px]">
              <span className="font-mono font-medium" style={{ color: ADDED_COLOR }}>+{addedCount}</span>
              <span className="font-mono font-medium" style={{ color: REMOVED_COLOR }}>-{removedCount}</span>
            </div>
          )}

          {/* Settings */}
          <div className="ml-auto relative" ref={settingsRef}>
            <button onClick={() => setSettingsOpen((v) => !v)} title="Editor settings"
              className={`p-1.5 rounded-lg transition-colors ${settingsOpen ? 'text-primary bg-primary/10' : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container'}`}>
              <Settings size={16} />
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-30 p-3 flex flex-col gap-3">
                {/* Font size */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-on-surface-variant/50">Font size</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updatePrefs({ fontSize: Math.max(FONT_SIZE_MIN, prefs.fontSize - 1) })}
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-surface hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20 text-sm font-bold transition-colors">−</button>
                    <span className="flex-1 text-center text-[12px] font-mono text-on-surface">{prefs.fontSize}px</span>
                    <button onClick={() => updatePrefs({ fontSize: Math.min(FONT_SIZE_MAX, prefs.fontSize + 1) })}
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-surface hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20 text-sm font-bold transition-colors">+</button>
                  </div>
                </div>

                {/* Font family */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest font-semibold text-on-surface-variant/50">Font family</span>
                  <div className="flex flex-col gap-1">
                    {FONT_FAMILIES.map((f) => (
                      <button key={f} onClick={() => updatePrefs({ fontFamily: f })}
                        className={`text-left px-2.5 py-1 rounded-lg text-[11px] transition-colors ${prefs.fontFamily === f ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                        style={{ fontFamily: f }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
          {isIdentical && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/50 backdrop-blur-[2px] z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-3 px-10 py-7 rounded-2xl bg-surface-container border border-secondary/20 shadow-xl pointer-events-auto">
                <CheckCircle2 size={40} className="text-secondary" />
                <p className="text-sm font-semibold text-on-surface">There are no differences between files.</p>
                <button
                  onClick={cancelDiff}
                  className="mt-1 text-[11px] text-on-surface-variant hover:text-primary transition-colors underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
