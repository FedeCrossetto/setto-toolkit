import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Check, Highlighter, PenLine, Plus, Square, Trash2, Type, Undo2, X, type LucideIcon } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { Mascot } from '../../core/components/Mascot'
import { formatBytes, formatTime, videoUrl } from './videos-logic'

/**
 * Editor de marcas sobre un video: se pausa en un cuadro, se dibuja encima (lápiz,
 * resaltador, flecha, rectángulo, tapar, texto) y se elige desde/hasta cuándo se ve.
 * Cada marca es un PNG transparente del tamaño del video; ffmpeg las superpone al exportar
 * (videos:annotate) y el resultado es un video nuevo "(editado)" al lado del original.
 */
type Tool = 'pen' | 'highlight' | 'arrow' | 'rect' | 'block' | 'text'
type Shape =
  | { kind: 'pen' | 'highlight'; points: [number, number][]; color: string; width: number }
  | { kind: 'arrow' | 'rect' | 'block'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: 'text'; x: number; y: number; text: string; color: string; size: number }
interface Layer { id: string; shapes: Shape[]; start: number; end: number; preview: string }

const TOOLS: { id: Tool; label: string; icon: LucideIcon; key: string }[] = [
  { id: 'pen', label: 'Lápiz', icon: PenLine, key: 'p' },
  { id: 'highlight', label: 'Resaltador', icon: Highlighter, key: 'h' },
  { id: 'arrow', label: 'Flecha', icon: ArrowUpRight, key: 'a' },
  { id: 'rect', label: 'Rectángulo', icon: Square, key: 'r' },
  { id: 'block', label: 'Tapar (ocultar datos)', icon: Square, key: 'b' },
  { id: 'text', label: 'Texto', icon: Type, key: 't' },
]
const COLORS = ['#FF3B30', '#FFCC00', '#34C759', '#0A84FF', '#AF52DE', '#FFFFFF', '#111111']
const WIDTHS = [3, 6, 10]

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, scale: number): void {
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (s.kind === 'pen' || s.kind === 'highlight') {
    ctx.strokeStyle = s.color
    ctx.globalAlpha = s.kind === 'highlight' ? 0.38 : 1
    ctx.lineWidth = (s.kind === 'highlight' ? s.width * 3.2 : s.width) * scale
    ctx.beginPath()
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  } else if (s.kind === 'rect' || s.kind === 'block') {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1)
    if (s.kind === 'block') { ctx.fillStyle = s.color; ctx.fillRect(x, y, w, h) }
    else { ctx.strokeStyle = s.color; ctx.lineWidth = s.width * scale; ctx.beginPath(); ctx.roundRect(x, y, w, h, 6 * scale); ctx.stroke() }
  } else if (s.kind === 'arrow') {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width * scale
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
    const head = Math.max(14, s.width * 4) * scale
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2 - Math.cos(ang) * head * 0.6, s.y2 - Math.sin(ang) * head * 0.6); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(s.x2, s.y2)
    ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45))
    ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45))
    ctx.closePath(); ctx.fill()
  } else if (s.kind === 'text') {
    ctx.font = `600 ${s.size * scale}px "Segoe UI Variable Text", "Segoe UI", sans-serif`
    ctx.textBaseline = 'top'
    ctx.lineWidth = 4 * scale; ctx.strokeStyle = s.color === '#111111' ? '#FFFFFF' : 'rgba(0,0,0,0.55)'
    ctx.strokeText(s.text, s.x, s.y)
    ctx.fillStyle = s.color; ctx.fillText(s.text, s.x, s.y)
  }
  ctx.restore()
}

export function VideoAnnotator({ path, name, onClose, onExported }: {
  path: string; name: string; onClose: () => void; onExported: (newPath: string) => void
}): JSX.Element {
  const toast = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  /** Tamaño en pantalla: el video entero dentro del escenario, sin deformarse. */
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [duration, setDuration] = useState(0)
  const [now, setNow] = useState(0)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0]!)
  const [width, setWidth] = useState(WIDTHS[1]!)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [textAt, setTextAt] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null)
  const [range, setRange] = useState<{ start: number; end: number | null }>({ start: 0, end: null })
  const [layers, setLayers] = useState<Layer[]>([])
  const [exporting, setExporting] = useState<number | null>(null)
  /** Escala de trazo: en videos grandes (1080p+) las líneas tienen que ser más gruesas. */
  const k = size ? Math.max(1, Math.min(size.w, size.h) / 720) : 1

  useEffect(() => {
    const el = stageRef.current
    if (!el || !size) return
    const calc = (): void => {
      const cw = el.clientWidth - 40, ch = el.clientHeight - 40
      const w = Math.max(1, Math.min(cw, ch * (size.w / size.h)))
      setFit({ w, h: w * (size.h / size.w) })
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size])

  // Dibujar la marca en curso.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !size) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    for (const s of shapes) drawShape(ctx, s, k)
    if (draft) drawShape(ctx, draft, k)
  }, [shapes, draft, size, k])

  useEffect(() => window.api.on('videos:progress', (p) => {
    const v = p as { path: string; ratio: number }
    if (v.path === path) setExporting(v.ratio)
  }), [path])

  const toVideo = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * size!.w, ((e.clientY - r.top) / r.height) * size!.h]
  }
  const down = (e: React.PointerEvent): void => {
    if (!size || exporting !== null) return
    videoRef.current?.pause()
    const [x, y] = toVideo(e)
    if (tool === 'text') { setTextAt({ x, y, sx: e.clientX, sy: e.clientY }); return }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft(tool === 'pen' || tool === 'highlight'
      ? { kind: tool, points: [[x, y]], color, width }
      : { kind: tool, x1: x, y1: y, x2: x, y2: y, color, width })
  }
  const move = (e: React.PointerEvent): void => {
    if (!draft || !size) return
    const [x, y] = toVideo(e)
    setDraft((d) => !d ? d : d.kind === 'pen' || d.kind === 'highlight' ? { ...d, points: [...d.points, [x, y]] } : d.kind === 'text' ? d : { ...d, x2: x, y2: y })
  }
  const up = (): void => {
    if (!draft) return
    const d = draft
    const ok = 'points' in d ? d.points.length > 1 : 'x1' in d ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 4 : true
    if (ok) setShapes((s) => [...s, draft])
    setDraft(null)
  }

  const undo = useCallback(() => setShapes((s) => s.slice(0, -1)), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (textAt) return
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t && !e.ctrlKey && !e.altKey) setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, undo, textAt])

  const end = range.end ?? Math.min(duration, range.start + 5)
  const addLayer = (): void => {
    if (!shapes.length || !canvasRef.current) return
    const preview = canvasRef.current.toDataURL('image/png')
    setLayers((l) => [...l, { id: Math.random().toString(36).slice(2), shapes, start: range.start, end, preview }])
    setShapes([])
    setRange({ start: end, end: null })
  }

  const exportVideo = async (): Promise<void> => {
    const all = shapes.length ? [...layers, { id: 'cur', shapes, start: range.start, end, preview: canvasRef.current!.toDataURL('image/png') }] : layers
    if (!all.length) return
    setExporting(0)
    try {
      const r = await window.api.invoke<{ path: string; size: number }>('videos:annotate', { path, layers: all.map((l) => ({ png: l.preview, start: l.start, end: l.end })) })
      toast.show(`Video con marcas guardado (${formatBytes(r.size)})`, 'success')
      onExported(r.path)
    } catch (e) {
      toast.show((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error')
      setExporting(null)
    }
  }

  const seek = (t: number): void => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(duration, t)) }
  const btn = 'grid place-items-center w-9 h-9 rounded-(--r-md) transition-colors'

  return createPortal(
    <div className="fixed inset-0 z-[900] flex flex-col bg-[rgb(12_12_14)] text-white" style={{ animation: 'fadeIn 0.15s ease both' }}>
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 h-14 shrink-0 border-b border-white/10">
        <span className="text-[13px] font-semibold truncate flex-1">Marcas · {name}</span>
        {exporting !== null ? (
          <div className="flex items-center gap-3 w-[360px]">
            <Mascot pose="actualizando" size={40} className="-my-2" />
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(exporting * 100)}%` }} /></div>
            <span className="text-[12px] tabular-nums text-white/70 w-24 text-right">Exportando {Math.round(exporting * 100)}%</span>
          </div>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn-ghost text-white! hover:bg-white/10!" onClick={onClose}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={!layers.length && !shapes.length} onClick={() => void exportVideo()}>
              <Check size={14} /> Exportar video
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Herramientas */}
        <div className="w-[64px] shrink-0 flex flex-col items-center gap-1.5 py-3 border-r border-white/10">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" title={`${t.label} (${t.key.toUpperCase()})`} onClick={() => setTool(t.id)}
              className={`${btn} ${tool === t.id ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white'}`}>
              <t.icon size={17} weight={t.id === 'block' ? 'fill' : 'regular'} />
            </button>
          ))}
          <span className="w-8 h-px bg-white/10 my-1.5" />
          {COLORS.map((c) => (
            <button key={c} type="button" title="Color" onClick={() => setColor(c)} aria-label={`Color ${c}`}
              className={`w-6 h-6 rounded-full ring-2 transition-transform ${color === c ? 'ring-white scale-110' : c === '#111111' ? 'ring-white/25 hover:scale-105' : 'ring-transparent hover:scale-105'}`} style={{ background: c }} />
          ))}
          <span className="w-8 h-px bg-white/10 my-1.5" />
          {WIDTHS.map((w) => (
            <button key={w} type="button" title="Grosor" onClick={() => setWidth(w)} className={`${btn} ${width === w ? 'bg-white/15' : 'hover:bg-white/8'}`}>
              <span className="rounded-full bg-white" style={{ width: 4 + w * 1.4, height: 4 + w * 1.4 }} />
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" title="Deshacer (Ctrl+Z)" className={`${btn} text-white/70 hover:bg-white/8`} onClick={undo}><Undo2 size={17} /></button>
        </div>

        {/* Escenario: el video y el lienzo encima, con la misma relación de aspecto */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={stageRef} className="flex-1 min-h-0 min-w-0 grid place-items-center overflow-hidden">
            <div className="relative" style={fit ? { width: fit.w, height: fit.h } : { width: 1, height: 1 }}>
              <video ref={videoRef} src={videoUrl(path)} preload="auto" className="w-full h-full rounded-(--r-md) bg-black"
                onLoadedMetadata={(e) => { const v = e.currentTarget; setSize({ w: v.videoWidth, h: v.videoHeight }); setDuration(v.duration || 0) }}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
              {size && (
                <canvas ref={canvasRef} width={size.w} height={size.h} onPointerDown={down} onPointerMove={move} onPointerUp={up}
                  className="absolute inset-0 w-full h-full" style={{ cursor: tool === 'text' ? 'text' : 'crosshair', touchAction: 'none' }} />
              )}
              {textAt && (
                <input autoFocus className="fixed z-[901] bg-black/60 text-white px-2 py-1 rounded-md outline-hidden ring-2 ring-primary text-[15px] font-semibold"
                  style={{ left: textAt.sx, top: textAt.sy }} placeholder="Escribí y Enter"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.stopPropagation(); setTextAt(null) }
                    if (e.key === 'Enter') {
                      const text = e.currentTarget.value.trim()
                      if (text) setShapes((s) => [...s, { kind: 'text', x: textAt.x, y: textAt.y, text, color, size: 28 + width * 2 }])
                      setTextAt(null)
                    }
                  }} onBlur={() => setTextAt(null)} />
              )}
            </div>
          </div>

          {/* Línea de tiempo: dónde estás y el tramo en que se ve la marca */}
          <div className="shrink-0 px-5 pb-4 flex flex-col gap-2.5">
            <div className="relative h-8 cursor-pointer" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration) }}>
              <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-white/10" />
              {layers.map((l) => (
                <div key={l.id} className="absolute top-3 h-2 rounded-full bg-white/30" style={{ left: `${(l.start / (duration || 1)) * 100}%`, width: `${((l.end - l.start) / (duration || 1)) * 100}%` }} />
              ))}
              <div className="absolute top-3 h-2 rounded-full bg-primary" style={{ left: `${(range.start / (duration || 1)) * 100}%`, width: `${((end - range.start) / (duration || 1)) * 100}%` }} />
              <div className="absolute top-1 w-0.5 h-6 bg-white rounded-full" style={{ left: `${(now / (duration || 1)) * 100}%` }} />
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
              <button type="button" className="ui-btn ui-btn-sm bg-white/10! text-white! hover:bg-white/15!" onClick={() => { const v = videoRef.current; if (v) void (v.paused ? v.play() : v.pause()) }}>
                {videoRef.current?.paused === false ? 'Pausa' : 'Reproducir'}
              </button>
              <span className="tabular-nums text-white/70 w-24">{formatTime(now)} / {formatTime(duration)}</span>
              <span className="w-px h-5 bg-white/10" />
              <span className="text-white/70">Esta marca se ve</span>
              <button type="button" className="ui-btn ui-btn-sm bg-white/10! text-white! hover:bg-white/15!" onClick={() => setRange((r) => ({ ...r, start: Math.min(now, (r.end ?? duration) - 0.2) }))}>desde {formatTime(range.start)}</button>
              <button type="button" className="ui-btn ui-btn-sm bg-white/10! text-white! hover:bg-white/15!" onClick={() => setRange((r) => ({ ...r, end: Math.max(now, r.start + 0.2) }))}>hasta {formatTime(end)}</button>
              <span className="text-white/45">(tocá para usar la posición actual)</span>
              <span className="flex-1" />
              <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" disabled={!shapes.length} onClick={addLayer}><Plus size={13} /> Agregar marca</button>
            </div>
          </div>
        </div>

        {/* Marcas agregadas */}
        <div className="w-[230px] shrink-0 border-l border-white/10 flex flex-col">
          <div className="px-4 pt-4 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Marcas ({layers.length})</div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
            {layers.length === 0 && <p className="text-[12px] text-white/50 px-1">Dibujá sobre el video, elegí el tramo y tocá "Agregar marca". Podés sumar varias.</p>}
            {layers.map((l, i) => (
              <div key={l.id} className="group rounded-(--r-md) bg-white/5 ring-1 ring-white/10 p-2 flex items-center gap-2">
                <img src={l.preview} alt="" className="w-14 h-9 object-contain rounded bg-black/60" />
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => seek(l.start)}>
                  <span className="block text-[12px] font-medium">Marca {i + 1}</span>
                  <span className="block text-[11px] text-white/60 tabular-nums">{formatTime(l.start)} – {formatTime(l.end)}</span>
                </button>
                <button type="button" title="Quitar" aria-label="Quitar marca" className="grid place-items-center w-6 h-6 rounded text-white/50 hover:text-white hover:bg-white/10"
                  onClick={() => setLayers((x) => x.filter((y) => y.id !== l.id))}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-[11px] text-white/45">Se guarda como un video nuevo "(editado)" al lado del original. Recodificar tarda más o menos lo que dura el video.</p>
        </div>
      </div>
      <button type="button" aria-label="Cerrar" className="hidden" onClick={onClose}><X size={1} /></button>
    </div>,
    document.body,
  )
}
