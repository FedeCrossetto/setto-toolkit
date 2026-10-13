import { useEffect, useState } from 'react'
import { Diff, History, Loader2, RotateCcw } from 'lucide-react'
import { Sheet } from '../../../core/components/Modal'
import type { HistoryEntry, OpenFile } from '../types'

interface HistorySheetProps {
  open: boolean
  tab: OpenFile | null
  onClose: () => void
  /** Load the version into the tab as unsaved content */
  onRestore: (content: string) => void
  /** Send version vs current to Smart Diff — omitted when the plugin is disabled */
  onCompare?: (label: string, content: string) => void
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000)
  const abs = Math.abs(s)
  if (abs < 45) return 'recién'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day')
  return new Date(ts).toLocaleDateString('es')
}

const formatSize = (b: number): string => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/** Local history for the active file: list of saved versions, read-only preview, restore / compare. */
export function HistorySheet({ open, tab, onClose, onRestore, onCompare }: HistorySheetProps): JSX.Element | null {
  const [entries, setEntries]   = useState<HistoryEntry[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const path = tab?.path ?? null

  // Load the list when opened (line deltas are computed against the current buffer)
  useEffect(() => {
    if (!open || !path) return
    let cancelled = false
    setEntries(null); setSelected(null); setPreview(null); setError(null)
    window.api.invoke<HistoryEntry[]>('editor:history-list', path, tab?.content ?? '')
      .then((list) => { if (!cancelled) { setEntries(list); setSelected(list[0]?.id ?? null) } })
      .catch((e: unknown) => { if (!cancelled) { setEntries([]); setError(e instanceof Error ? e.message : String(e)) } })
    return () => { cancelled = true }
  // Only on open / file change — not on every keystroke of the current buffer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path])

  useEffect(() => {
    if (!open || !path || !selected) { setPreview(null); return }
    let cancelled = false
    setPreview(null)
    window.api.invoke<{ content: string }>('editor:history-read', path, selected)
      .then((r) => { if (!cancelled) setPreview(r.content) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [open, path, selected])

  const current = entries?.find((e) => e.id === selected) ?? null

  const restore = async (): Promise<void> => {
    if (!path || !selected) return
    try {
      const r = await window.api.invoke<{ content: string }>('editor:history-restore', path, selected)
      onRestore(r.content)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Historial local"
      subtitle={tab ? `${tab.name} · se guarda una versión en cada guardado` : undefined}
      width={820}
      footer={current && preview !== null ? (
        <>
          {onCompare && (
            <button className="ui-btn ui-btn-outline" onClick={() => onCompare(`${tab?.name ?? ''} (${new Date(current.ts).toLocaleString('es')})`, preview)}>
              <Diff size={14} />Comparar con el actual
            </button>
          )}
          <button className="ui-btn ui-btn-primary" onClick={() => void restore()}>
            <RotateCcw size={14} />Restaurar
          </button>
        </>
      ) : undefined}
    >
      {!path ? (
        <p className="t-body text-on-surface-variant">Guardá el archivo para empezar a tener historial.</p>
      ) : entries === null ? (
        <div className="flex items-center gap-2 t-footnote text-on-surface-variant"><Loader2 size={14} className="animate-spin" />Cargando versiones…</div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <History size={28} className="text-on-surface-variant" />
          <p className="t-headline text-on-surface">Todavía no hay versiones</p>
          <p className="t-footnote text-on-surface-variant max-w-xs">Cada vez que guardás, la versión anterior queda acá (hasta 50 por archivo).</p>
          {error && <p className="t-footnote text-error">{error}</p>}
        </div>
      ) : (
        <div className="flex gap-4 h-[min(64vh,560px)] -mx-2">
          <ul className="w-56 flex-shrink-0 overflow-y-auto flex flex-col gap-0.5" role="listbox" aria-label="Versiones">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  role="option"
                  aria-selected={e.id === selected}
                  onClick={() => setSelected(e.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors ${e.id === selected ? 'bg-selected text-on-surface' : 'hover:bg-on-surface/[0.04] text-on-surface'}`}
                  title={new Date(e.ts).toLocaleString('es')}
                >
                  <span className="block t-footnote font-medium">{relativeTime(e.ts)}</span>
                  <span className="flex items-center gap-2 t-caption text-on-surface-variant tabular-nums">
                    {formatSize(e.size)}
                    {e.added !== undefined && e.removed !== undefined && (e.added > 0 || e.removed > 0) && (
                      <>
                        <span className="text-success">+{e.added}</span>
                        <span className="text-error">−{e.removed}</span>
                      </>
                    )}
                    {e.added === 0 && e.removed === 0 && <span>igual al actual</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex-1 min-w-0 flex flex-col rounded-lg hairline overflow-hidden">
            {error && <p className="px-3 py-2 t-footnote text-error hairline-b">{error}</p>}
            {preview === null ? (
              <div className="flex items-center gap-2 p-3 t-footnote text-on-surface-variant"><Loader2 size={14} className="animate-spin" />Cargando…</div>
            ) : (
              <pre className="flex-1 overflow-auto p-3 t-caption font-mono text-on-surface bg-on-surface/[0.02] whitespace-pre" aria-label="Vista previa (solo lectura)">{preview}</pre>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
