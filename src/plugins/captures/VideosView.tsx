import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, FolderOpen, Pencil, PenLine, Scissors, Sparkles, Trash2, Video } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { EmptyState } from '../../core/components/EmptyState'
import { ListSkeleton } from '../../core/components/Skeleton'
import type { VideoItem } from './types'
import { formatBytes, formatTime, videoFlags, videoSummary, videoUrl } from './videos-logic'
import { VideoAnnotator } from './VideoAnnotator'
import { ForClaude } from './ForClaude'

type Filter = 'all' | 'heavy' | 'unused'
type SortKey = 'name' | 'date' | 'size'
type ListResult = { items: VideoItem[]; folders: string[]; canTrim: boolean }

const invoke = <T,>(ch: string, ...args: unknown[]): Promise<T> => window.api.invoke<T>(ch, ...args)
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function when(ts: number): string {
  const d = new Date(ts)
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days === 0) return `hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}
/** Fecha completa para el tooltip de la columna. */
const fullDate = (ts: number): string => new Date(ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Portapapeles → Videos: las grabaciones de Recortes (y la Game Bar), con aviso de las
 * pesadas o sin uso para ir liberando espacio (van a la Papelera), y recorte de inicio y fin.
 */
export function VideosView({ header }: { header: React.ReactNode }): JSX.Element {
  const toast = useToast()
  const confirm = useConfirm()
  const [data, setData] = useState<ListResult | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true })

  const reload = useCallback(() => {
    invoke<ListResult>('videos:list').then(setData, (e: unknown) => toast.show(errMsg(e), 'error'))
  }, [toast])
  useEffect(() => { reload() }, [reload])
  // Un video copiado que se guardó, un recorte o una exportación: refrescar solo.
  useEffect(() => window.api.on('videos:changed', () => reload()), [reload])

  const items = data?.items ?? []
  const summary = useMemo(() => videoSummary(items), [items])
  const shown = useMemo(() => items.filter((v) => {
    if (filter === 'all') return true
    const f = videoFlags(v)
    return filter === 'heavy' ? f.heavy : f.unused
  }).sort((a, b) => {
    const d = sort.key === 'name' ? a.name.localeCompare(b.name, 'es', { numeric: true }) : sort.key === 'size' ? a.size - b.size : a.modifiedAt - b.modifiedAt
    return sort.desc ? -d : d
  }), [items, filter, sort])
  const sortBy = (key: SortKey): void => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }))
  const sortHead = (k: SortKey, label: string, className: string): JSX.Element => (
    <button type="button" onClick={() => sortBy(k)} className={`flex items-center gap-1 hover:text-on-surface transition-colors ${sort.key === k ? 'text-on-surface' : ''} ${className}`}>
      {label}{sort.key === k && (sort.desc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
    </button>
  )
  const current = items.find((v) => v.path === selected) ?? null
  const checkedSize = items.filter((v) => checked.has(v.path)).reduce((n, v) => n + v.size, 0)

  const trash = async (paths: string[]): Promise<void> => {
    const size = items.filter((v) => paths.includes(v.path)).reduce((n, v) => n + v.size, 0)
    const ok = await confirm({
      title: paths.length === 1 ? '¿Mandar el video a la Papelera?' : `¿Mandar ${paths.length} videos a la Papelera?`,
      message: `Se liberan ${formatBytes(size)}. Se pueden recuperar desde la Papelera de Windows.`,
      confirmLabel: 'Mandar a la Papelera', destructive: true,
    })
    if (!ok) return
    try {
      const r = await invoke<{ done: number }>('videos:trash', paths)
      toast.show(`${r.done} ${r.done === 1 ? 'video' : 'videos'} en la Papelera · ${formatBytes(size)} liberados`, 'success')
      setChecked(new Set())
      if (selected && paths.includes(selected)) setSelected(null)
      reload()
    } catch (e) { toast.show(errMsg(e), 'error') }
  }

  const toggle = (p: string): void => setChecked((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })
  const chips: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'Todos', n: items.length },
    { id: 'heavy', label: 'Pesados', n: items.filter((v) => videoFlags(v).heavy).length },
    { id: 'unused', label: 'Sin uso', n: items.filter((v) => videoFlags(v).unused).length },
  ]

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 pt-4 pb-3 flex flex-col gap-3 hairline-b">
          <div className="flex items-center gap-3 flex-wrap">
            {header}
            {data && <span className="t-footnote text-on-surface-variant tabular-nums">{summary.count} · {formatBytes(summary.total)}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {chips.map((c) => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}
                className={`fl-chip h-[26px]! px-2.5! text-[12px]! transition-colors ${filter === c.id ? 'is-on' : ''}`}>
                {c.label} <span className="opacity-60 tabular-nums">{c.n}</span>
              </button>
            ))}
          </div>
          {/* Aviso: cuánto se puede liberar */}
          {summary.candidates > 0 && (
            <div className="flex items-center gap-3 rounded-(--r-md) bg-warning/[0.07] ring-1 ring-warning/20 px-3 py-2 t-footnote text-on-surface">
              <span className="flex-1">
                <b className="font-semibold">{summary.candidates} {summary.candidates === 1 ? 'video pesado o sin uso' : 'videos pesados o sin uso'}</b> ocupan {formatBytes(summary.reclaimable)}.
                {' '}Revisalos y mandá a la Papelera los que no necesites.
              </span>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => {
                const cand = items.filter((v) => { const f = videoFlags(v); return f.heavy || f.unused }).map((v) => v.path)
                setFilter('all'); setChecked(new Set(cand))
              }}>Seleccionarlos</button>
            </div>
          )}
          {checked.size > 0 && (
            <div className="flex items-center gap-2 rounded-(--r-md) hairline bg-surface px-3 py-2 t-footnote text-on-surface">
              <span className="flex-1">{checked.size} {checked.size === 1 ? 'seleccionado' : 'seleccionados'} · {formatBytes(checkedSize)}</span>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setChecked(new Set())}>Quitar selección</button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => void trash([...checked])}><Trash2 size={13} /> Mandar a la Papelera</button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {!data ? <ListSkeleton rows={8} /> : items.length === 0 ? (
            <div className="h-full grid place-items-center">
              <EmptyState icon={Video} title="Todavía no hay grabaciones"
                description={'Las que grabes con Recortes (Win+Shift+R) aparecen acá.\nSi copiás una con Ctrl+C sin guardarla, Setto la guarda en Videos\\Setto.'} />
            </div>
          ) : shown.length === 0 ? (
            <p className="t-body text-on-surface-variant text-center py-16">Ninguno en este filtro.</p>
          ) : (
            <div className="flex flex-col gap-px">
              {/* Encabezado de columnas (ordenable) */}
              <div className="flex items-center gap-3 px-2.5 h-7 text-[11px] font-medium uppercase tracking-[0.06em] text-on-surface-variant select-none">
                <span className="w-3.5 shrink-0" /><span className="w-8 shrink-0" />
                {sortHead('name', 'Nombre', 'flex-1 min-w-0')}
                {sortHead('date', 'Fecha', 'w-[120px] shrink-0')}
                {sortHead('size', 'Tamaño', 'w-16 shrink-0 justify-end')}
              </div>
              {shown.map((v) => {
                const f = videoFlags(v)
                const on = v.path === selected
                return (
                  <div key={v.path} role="button" tabIndex={-1} onClick={() => setSelected(v.path)} onDoubleClick={() => void invoke('videos:open', v.path)}
                    className={`group flex items-center gap-3 px-2.5 h-12 rounded-(--r-sm) cursor-pointer transition-colors ${on ? 'bg-on-surface/[0.07]' : 'hover:bg-on-surface/[0.04]'}`}>
                    <input type="checkbox" checked={checked.has(v.path)} onChange={() => toggle(v.path)} onClick={(e) => e.stopPropagation()}
                      aria-label={`Seleccionar ${v.name}`} className="accent-(--color-primary) w-3.5 h-3.5 shrink-0" />
                    <span className="grid place-items-center w-8 h-8 rounded-(--r-sm) bg-on-surface/[0.05] text-on-surface-variant shrink-0"><Video size={15} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-on-surface truncate">{v.name.replace(/\.[^.]+$/, '')}</span>
                      <span className="block t-caption text-on-surface-variant truncate">{v.folder}</span>
                    </span>
                    {f.unused && <span className="shrink-0 h-[18px] px-1.5 rounded-[5px] bg-on-surface/[0.06] text-[10.5px] leading-[18px] text-on-surface-variant">Sin uso</span>}
                    {f.heavy && <span className="shrink-0 h-[18px] px-1.5 rounded-[5px] bg-warning/12 text-[10.5px] leading-[18px] font-medium text-warning">Pesado</span>}
                    <span className="shrink-0 w-[120px] text-[12px] tabular-nums text-on-surface-variant truncate" title={fullDate(v.modifiedAt)}>{when(v.modifiedAt)}</span>
                    <span className={`shrink-0 w-16 text-right text-[12px] tabular-nums ${f.heavy ? 'text-warning font-medium' : 'text-on-surface-variant'}`}>{formatBytes(v.size)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {current && (
        <VideoDetail key={current.path} v={current} canTrim={!!data?.canTrim}
          onTrash={() => void trash([current.path])}
          onTrimmed={(p) => { reload(); setSelected(p) }}
          onRenamed={(p) => { setChecked(new Set()); reload(); setSelected(p) }} />
      )}
    </div>
  )
}

/** Reproductor y recorte de inicio y fin. */
function VideoDetail({ v, canTrim, onTrash, onTrimmed, onRenamed }: {
  v: VideoItem; canTrim: boolean; onTrash: () => void; onTrimmed: (path: string) => void; onRenamed: (path: string) => void
}): JSX.Element {
  const toast = useToast()
  const ref = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  const [forClaude, setForClaude] = useState(false)
  useEffect(() => { void invoke('videos:mark-opened', v.path) }, [v.path])
  const base = v.name.replace(/\.[^.]+$/, '')

  const rename = async (name: string): Promise<void> => {
    setRenaming(false)
    if (!name.trim() || name.trim() === base) return
    // El reproductor tiene el archivo abierto: soltarlo antes de moverlo.
    const el = ref.current
    if (el) { el.pause(); el.removeAttribute('src'); el.load() }
    try {
      const r = await invoke<{ path: string }>('videos:rename', { path: v.path, name })
      toast.show('Nombre cambiado', 'success')
      onRenamed(r.path)
    } catch (e) {
      toast.show(errMsg(e), 'error')
      if (el) { el.src = videoUrl(v.path); el.load() }
    }
  }
  const now = (): number => ref.current?.currentTime ?? 0
  const finish = end ?? duration
  const changed = start > 0.05 || (end !== null && end < duration - 0.05)

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await invoke<{ path: string; size: number }>('videos:trim', { path: v.path, start, end: finish })
      toast.show(`Recorte guardado (${formatBytes(r.size)}) al lado del original`, 'success')
      onTrimmed(r.path)
    } catch (e) { toast.show(errMsg(e), 'error') } finally { setBusy(false) }
  }

  const pct = (t: number): number => (duration ? (t / duration) * 100 : 0)
  return (
    <aside className="w-[46%] max-w-[760px] min-w-[420px] shrink-0 hairline-l flex flex-col overflow-y-auto">
      <div className="px-5 pt-4 pb-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <input autoFocus defaultValue={base} aria-label="Nombre del video" className="ui-input h-8 w-full text-[15px] font-semibold"
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.value = base; e.currentTarget.blur() } }}
              onBlur={(e) => void rename(e.currentTarget.value)} />
          ) : (
            <button type="button" className="group/name flex items-center gap-1.5 max-w-full text-left" title="Renombrar" onClick={() => setRenaming(true)}>
              <h2 className="t-headline text-on-surface truncate">{base}</h2>
              <Pencil size={13} className="shrink-0 text-on-surface-variant opacity-0 group-hover/name:opacity-100 transition-opacity" />
            </button>
          )}
          <p className="t-caption text-on-surface-variant mt-0.5">{formatBytes(v.size)} · {duration ? formatTime(duration) : '…'} · {v.folder}</p>
        </div>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" title="Dibujar marcas, flechas, texto o tapar datos" disabled={!canTrim} onClick={() => { ref.current?.pause(); setAnnotating(true) }}>
          <PenLine size={13} /> Marcas
        </button>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" title="Cuadros clave del video para pegarle a Claude (no lee videos, sí imágenes)" disabled={!canTrim} onClick={() => { ref.current?.pause(); setForClaude(true) }}>
          <Sparkles size={13} /> Para Claude
        </button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Abrir con el reproductor de Windows" onClick={() => void invoke('videos:open', v.path)}><ExternalLink size={15} /></button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title="Mostrar en la carpeta" onClick={() => void invoke('videos:reveal', v.path)}><FolderOpen size={15} /></button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-error" title="Mandar a la Papelera" onClick={onTrash}><Trash2 size={15} /></button>
      </div>
      <div className="px-5">
        <video ref={ref} src={videoUrl(v.path)} controls preload="metadata" className="w-full rounded-(--r-lg) bg-black aspect-video"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => { if (end !== null && e.currentTarget.currentTime > end && !e.currentTarget.paused) e.currentTarget.pause() }} />
      </div>

      {/* Recortar: inicio y fin desde la posición del reproductor */}
      <section className="mx-5 my-4 ui-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Scissors size={15} className="text-on-surface-variant" />
          <h3 className="t-body font-medium text-on-surface flex-1">Recortar</h3>
          {changed && <span className="t-caption text-on-surface-variant tabular-nums">Queda {formatTime(finish - start)}</span>}
        </div>
        {/* Barra con el tramo elegido */}
        <div className="relative h-2 rounded-full bg-on-surface/[0.08]">
          <span className="absolute top-0 bottom-0 rounded-full bg-primary/70" style={{ left: `${pct(start)}%`, width: `${Math.max(0, pct(finish) - pct(start))}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="t-caption text-on-surface-variant">Inicio</span>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tabular-nums text-on-surface w-16">{formatTime(start)}</span>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setStart(Math.min(now(), finish - 0.5))}>Marcar acá</button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" title="Ir al inicio del tramo" onClick={() => { if (ref.current) ref.current.currentTime = start }}>Ir</button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="t-caption text-on-surface-variant">Fin</span>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tabular-nums text-on-surface w-16">{formatTime(finish)}</span>
              <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setEnd(Math.max(now(), start + 0.5))}>Marcar acá</button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" title="Ver el tramo desde el inicio" onClick={() => { if (ref.current) { ref.current.currentTime = start; void ref.current.play() } }}>Ver</button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="flex-1 t-caption text-on-surface-variant">
            {canTrim ? 'Se guarda como un video nuevo al lado del original, sin perder calidad. El inicio puede correrse 1–2 s.' : 'Para recortar falta ffmpeg en esta instalación.'}
          </p>
          {changed && <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { setStart(0); setEnd(null) }}>Restablecer</button>}
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!canTrim || !changed || busy} onClick={() => void save()}>
            <Scissors size={13} /> {busy ? 'Guardando…' : 'Guardar recorte'}
          </button>
        </div>
      </section>
      {forClaude && <ForClaude path={v.path} name={base} onClose={() => setForClaude(false)} />}
      {annotating && <VideoAnnotator path={v.path} name={base} onClose={() => setAnnotating(false)} onExported={(p) => { setAnnotating(false); onTrimmed(p) }} />}
    </aside>
  )
}
