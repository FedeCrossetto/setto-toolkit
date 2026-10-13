import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ChevronDown, ChevronUp, Eraser, Eye, EyeOff, Filter, Pause, Play, RotateCcw, X } from 'lucide-react'
import { Tooltip } from '../../../core/components/Tooltip'
import type { EditorHandle, OpenFile } from '../types'
import { countLogLevels, lineAfterEnd, type LogLevelFilter, type LogViewState } from '../logParsing'

interface LogToolbarProps {
  tab: OpenFile
  /** Archivo tratado como log (ver isLogFile): habilita filtros, contadores y navegación */
  logMode: boolean
  view: LogViewState
  onViewChange: (view: LogViewState) => void
  editorRef: React.MutableRefObject<EditorHandle | null>
  onToggleWatch: () => void
  onSetTail: (on: boolean) => void
  onToggleFreeze: () => void
}

const ACTIVE = '!bg-on-surface/[0.08] !text-on-surface'

const LEVELS: Array<{ value: LogLevelFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'errors', label: 'Errores' },
  { value: 'warnings', label: 'Warnings+' },
]

/**
 * Barra del modo log: Monitorear, Seguir (se pausa sola si scrolleás hacia arriba),
 * filtros por nivel y texto, contadores, error anterior/siguiente (F8) y "Limpiar vista".
 * Para archivos que no son log sólo muestra "Monitorear".
 */
export function LogToolbar({
  tab, logMode, view, onViewChange, editorRef, onToggleWatch, onSetTail, onToggleFreeze,
}: LogToolbarProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange
  const onSetTailRef = useRef(onSetTail)
  onSetTailRef.current = onSetTail

  // ── Filtro de texto (con un pequeño debounce: en 50k líneas recalcular por tecla se nota)
  const [text, setText] = useState(view.text)
  useEffect(() => { setText(view.text) }, [view.text])
  useEffect(() => {
    if (text === viewRef.current.text) return
    const t = setTimeout(() => onViewChangeRef.current({ ...viewRef.current, text }), 150)
    return () => clearTimeout(t)
  }, [text])

  const counts = useMemo(
    () => logMode ? countLogLevels(tab.content, view.fromLine) : { errors: 0, warnings: 0 },
    [logMode, tab.content, view.fromLine],
  )

  // ── Seguir: se pausa cuando el usuario sube; se reanuda al volver al final ───────
  const [pausedByScroll, setPausedByScroll] = useState(false)
  const following = tab.watchActive && tab.tailMode && !tab.frozen

  useEffect(() => {
    if (!following) return
    const inScroller = (target: EventTarget | null): boolean => {
      const dom = editorRef.current?.getScrollDOM?.()
      return !!dom && target instanceof Node && dom.contains(target)
    }
    const pause = (): void => { setPausedByScroll(true); onSetTailRef.current(false) }
    const onWheel = (e: WheelEvent): void => { if (e.deltaY < 0 && inScroller(e.target)) pause() }
    const onKey = (e: KeyboardEvent): void => {
      if (!inScroller(e.target)) return
      if (e.key === 'PageUp' || e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'Home')) pause()
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('wheel', onWheel, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [following, editorRef])

  useEffect(() => {
    if (!pausedByScroll || !tab.watchActive) return
    const onScroll = (e: Event): void => {
      const dom = editorRef.current?.getScrollDOM?.()
      if (!dom || e.target !== dom) return
      if (dom.scrollHeight - dom.scrollTop - dom.clientHeight < 4) {
        setPausedByScroll(false)
        onSetTailRef.current(true)
      }
    }
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [pausedByScroll, tab.watchActive, editorRef])

  const resumeFollow = (): void => {
    setPausedByScroll(false)
    onSetTail(true)
    editorRef.current?.scrollToBottom()
  }

  // ── F8 / Shift+F8: error siguiente / anterior ─────────────────────────────────
  useEffect(() => {
    if (!logMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F8' || e.ctrlKey || e.altKey) return
      if (!rootRef.current || rootRef.current.offsetParent === null) return // pestaña oculta
      e.preventDefault()
      editorRef.current?.gotoLogError?.(e.shiftKey ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [logMode, editorRef])

  const setLevel = (level: LogLevelFilter): void => onViewChange({ ...view, level })
  const cleared = view.fromLine > 1

  return (
    <div ref={rootRef} className="flex items-center gap-2 px-2 h-8 hairline-b bg-surface flex-shrink-0 t-footnote whitespace-nowrap overflow-hidden">
      <button onClick={onToggleWatch} title={tab.watchActive ? 'Dejar de monitorear' : 'Monitorear cambios del archivo'} aria-pressed={tab.watchActive}
        className={`ui-btn ui-btn-ghost ui-btn-sm gap-1.5 flex-shrink-0 ${tab.watchActive ? ACTIVE : ''}`}>
        {tab.watchActive ? <Eye size={13} /> : <EyeOff size={13} />}
        Monitorear
      </button>

      {tab.watchActive && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tab.frozen ? 'bg-on-surface-variant/50' : 'bg-success'}`} />
          <span className="text-on-surface-variant">{tab.frozen ? 'Pausado' : 'En vivo'}</span>
        </div>
      )}

      {logMode && (
        <>
          <span className="hairline-l h-4 flex-shrink-0" aria-hidden />
          <div className="flex items-center gap-0.5 flex-shrink-0" role="group" aria-label="Filtrar por nivel">
            {LEVELS.map((l) => (
              <button key={l.value} onClick={() => setLevel(l.value)} aria-pressed={view.level === l.value}
                className={`ui-btn ui-btn-ghost ui-btn-sm ${view.level === l.value ? ACTIVE : ''}`}>
                {l.label}
              </button>
            ))}
          </div>

          <div className="ui-input flex items-center gap-1.5 !py-0.5 !px-2 w-44 min-w-[7rem] flex-shrink">
            <Filter size={12} className="text-on-surface-variant/50 flex-shrink-0" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filtrar líneas…" aria-label="Filtrar líneas"
              onKeyDown={(e) => { if (e.key === 'Escape' && text) { e.stopPropagation(); setText('') } }}
              className="bg-transparent t-footnote text-on-surface outline-none placeholder:text-on-surface-variant/50 flex-1 min-w-0" />
            {text && (
              <button onClick={() => setText('')} aria-label="Limpiar filtro" className="text-on-surface-variant/50 hover:text-on-surface">
                <X size={11} />
              </button>
            )}
          </div>

          <span className="tabular-nums flex-shrink-0 text-on-surface-variant" aria-live="polite">
            <span className={counts.errors > 0 ? 'text-error font-medium' : ''}>{counts.errors} {counts.errors === 1 ? 'error' : 'errores'}</span>
            {' · '}
            <span className={counts.warnings > 0 ? 'text-warning font-medium' : ''}>{counts.warnings} {counts.warnings === 1 ? 'warning' : 'warnings'}</span>
          </span>

          <div className="flex items-center flex-shrink-0">
            <Tooltip label="Error anterior" shortcut="Shift+F8">
              <button onClick={() => editorRef.current?.gotoLogError?.(-1)} disabled={counts.errors === 0} aria-label="Error anterior"
                className="ui-btn ui-btn-ghost ui-btn-icon">
                <ChevronUp size={14} />
              </button>
            </Tooltip>
            <Tooltip label="Error siguiente" shortcut="F8">
              <button onClick={() => editorRef.current?.gotoLogError?.(1)} disabled={counts.errors === 0} aria-label="Error siguiente"
                className="ui-btn ui-btn-ghost ui-btn-icon">
                <ChevronDown size={14} />
              </button>
            </Tooltip>
          </div>

          {cleared ? (
            <Tooltip label={`Volver a mostrar las ${view.fromLine - 1} líneas anteriores`}>
              <button onClick={() => onViewChange({ ...view, fromLine: 1 })} className={`ui-btn ui-btn-ghost ui-btn-sm gap-1 flex-shrink-0 ${ACTIVE}`}>
                <RotateCcw size={12} />Mostrar todo
              </button>
            </Tooltip>
          ) : (
            <Tooltip label="Ocultar lo que hay hasta ahora y mostrar sólo lo nuevo">
              <button onClick={() => onViewChange({ ...view, fromLine: lineAfterEnd(tab.content) })} className="ui-btn ui-btn-ghost ui-btn-sm gap-1 flex-shrink-0">
                <Eraser size={12} />Limpiar vista
              </button>
            </Tooltip>
          )}
        </>
      )}

      {tab.watchActive && (
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {pausedByScroll && !tab.tailMode ? (
            <button onClick={resumeFollow} title="Volver al final y seguir las líneas nuevas"
              className="ui-btn ui-btn-outline ui-btn-sm gap-1">
              <ArrowDownToLine size={12} />Reanudar seguimiento
            </button>
          ) : (
            <button onClick={() => { setPausedByScroll(false); onSetTail(!tab.tailMode); if (!tab.tailMode) editorRef.current?.scrollToBottom() }}
              title="Desplazar automáticamente al final (se pausa si subís)" aria-pressed={tab.tailMode}
              className={`ui-btn ui-btn-ghost ui-btn-sm gap-1 ${tab.tailMode ? ACTIVE : ''}`}>
              <ArrowDownToLine size={12} />Seguir
            </button>
          )}
          <button onClick={onToggleFreeze} aria-pressed={tab.frozen}
            className={`ui-btn ui-btn-ghost ui-btn-sm gap-1 ${tab.frozen ? ACTIVE : ''}`}>
            {tab.frozen ? <Play size={12} /> : <Pause size={12} />}
            {tab.frozen ? 'Reanudar' : 'Pausar'}
          </button>
        </div>
      )}
    </div>
  )
}
