import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, Copy, Crop, Grid3x3, Highlighter, Save, Square, Type, Undo2, X, type LucideIcon } from 'lucide-react'
import { backdropMotion, dialogMotion } from '../../core/motion'
import { captureUrl, type CaptureEntry } from './types'

/**
 * Editor de anotaciones sobre una captura: rectángulo, flecha, texto, resaltador,
 * pixelado (tapar datos sensibles: contraseñas, documentos de clientes) y recorte.
 * Se dibuja en coordenadas de la imagen original; el resultado se guarda como
 * captura NUEVA (la original no se toca).
 */

type Tool = 'rect' | 'arrow' | 'text' | 'highlight' | 'pixelate' | 'crop'
type Shape =
  | { kind: 'rect' | 'highlight' | 'pixelate'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { kind: 'text'; x: number; y: number; text: string; color: string }

interface Rect { x: number; y: number; w: number; h: number }

const TOOLS: { id: Tool; label: string; icon: LucideIcon; key: string }[] = [
  { id: 'rect', label: 'Rectángulo', icon: Square, key: 'r' },
  { id: 'arrow', label: 'Flecha', icon: ArrowUpRight, key: 'a' },
  { id: 'text', label: 'Texto', icon: Type, key: 't' },
  { id: 'highlight', label: 'Resaltar', icon: Highlighter, key: 'h' },
  { id: 'pixelate', label: 'Pixelar (tapar datos)', icon: Grid3x3, key: 'p' },
  { id: 'crop', label: 'Recortar', icon: Crop, key: 'c' },
]
const COLORS = ['#E5484D', '#F5A524', '#2E7DE9', '#16A34A', '#111111', '#FFFFFF']

const norm = (r: Rect): Rect => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) })

function drawShapes(ctx: CanvasRenderingContext2D, img: HTMLImageElement, shapes: Shape[]): void {
  const W = img.naturalWidth
  const lw = Math.max(2, Math.round(W / 400))
  ctx.drawImage(img, 0, 0)
  for (const s of shapes) {
    ctx.save()
    if (s.kind === 'pixelate') {
      const r = norm(s)
      if (r.w < 2 || r.h < 2) { ctx.restore(); continue }
      // Bloques grandes: con bloques chicos un texto pixelado se puede llegar a leer.
      const block = Math.max(12, Math.round(W / 70), Math.round(Math.min(r.w, r.h) / 3))
      const small = document.createElement('canvas')
      small.width = Math.max(1, Math.round(r.w / block))
      small.height = Math.max(1, Math.round(r.h / block))
      small.getContext('2d')!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, small.width, small.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(small, 0, 0, small.width, small.height, r.x, r.y, r.w, r.h)
    } else if (s.kind === 'highlight') {
      const r = norm(s)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = s.color
      ctx.globalAlpha = 0.35
      ctx.fillRect(r.x, r.y, r.w, r.h)
    } else if (s.kind === 'rect') {
      const r = norm(s)
      ctx.strokeStyle = s.color
      ctx.lineWidth = lw
      ctx.lineJoin = 'round'
      ctx.strokeRect(r.x, r.y, r.w, r.h)
    } else if (s.kind === 'arrow') {
      const head = Math.max(12, lw * 5)
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
      ctx.strokeStyle = s.color
      ctx.fillStyle = s.color
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2 - Math.cos(ang) * head * 0.8, s.y2 - Math.sin(ang) * head * 0.8)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x2, s.y2)
      ctx.lineTo(s.x2 - head * Math.cos(ang - Math.PI / 7), s.y2 - head * Math.sin(ang - Math.PI / 7))
      ctx.lineTo(s.x2 - head * Math.cos(ang + Math.PI / 7), s.y2 - head * Math.sin(ang + Math.PI / 7))
      ctx.closePath()
      ctx.fill()
    } else if (s.kind === 'text') {
      const size = Math.max(16, Math.round(W / 55))
      ctx.font = `600 ${size}px Inter, "Segoe UI", sans-serif`
      ctx.textBaseline = 'top'
      // Borde de contraste para que se lea sobre cualquier fondo.
      ctx.lineWidth = Math.max(3, size / 6)
      ctx.strokeStyle = s.color === '#FFFFFF' ? '#111111' : '#FFFFFF'
      ctx.lineJoin = 'round'
      s.text.split('\n').forEach((line, i) => {
        ctx.strokeText(line, s.x, s.y + i * size * 1.25)
        ctx.fillStyle = s.color
        ctx.fillText(line, s.x, s.y + i * size * 1.25)
      })
    }
    ctx.restore()
  }
}

export function Annotator({ entry, onClose, onSave }: {
  entry: CaptureEntry
  onClose: () => void
  /** `copy`: además de guardar, dejarla en el portapapeles. */
  onSave: (dataUrl: string, copy: boolean) => Promise<void>
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState(COLORS[0]!)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [draft, setDraft] = useState<Shape | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [cropDraft, setCropDraft] = useState<Rect | null>(null)
  const [textAt, setTextAt] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setReady(true) }
    img.src = captureUrl(entry.file)
  }, [entry.file])

  // Redibujar todo en cada cambio (las capturas son chicas: es instantáneo).
  useEffect(() => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    drawShapes(ctx, img, draft ? [...shapes, draft] : shapes)
    const cr = cropDraft ? norm(cropDraft) : crop
    if (cr) {
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.beginPath()
      ctx.rect(0, 0, c.width, c.height)
      ctx.rect(cr.x, cr.y, cr.w, cr.h)
      ctx.fill('evenodd')
      ctx.strokeStyle = '#FFFFFF'
      ctx.setLineDash([8, 6])
      ctx.lineWidth = Math.max(1, c.width / 800)
      ctx.strokeRect(cr.x, cr.y, cr.w, cr.h)
      ctx.restore()
    }
  }, [ready, shapes, draft, crop, cropDraft])

  const toImage = (e: React.PointerEvent): { x: number; y: number } => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  const onDown = (e: React.PointerEvent): void => {
    if (!ready || textAt) return
    const p = toImage(e)
    if (tool === 'text') {
      const r = canvasRef.current!.getBoundingClientRect()
      setTextAt({ x: p.x, y: p.y, sx: e.clientX - r.left, sy: e.clientY - r.top })
      return
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    start.current = p
  }
  const onMove = (e: React.PointerEvent): void => {
    if (!start.current) return
    const p = toImage(e)
    const s = start.current
    if (tool === 'crop') setCropDraft({ x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y })
    else if (tool === 'arrow') setDraft({ kind: 'arrow', x1: s.x, y1: s.y, x2: p.x, y2: p.y, color })
    else if (tool === 'rect' || tool === 'highlight' || tool === 'pixelate') {
      setDraft({ kind: tool, x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y, color: tool === 'highlight' && color === COLORS[0] ? '#FFE100' : color })
    }
  }
  const onUp = (): void => {
    start.current = null
    if (cropDraft) {
      const r = norm(cropDraft)
      setCrop(r.w > 8 && r.h > 8 ? r : null)
      setCropDraft(null)
    }
    if (draft) {
      const big = draft.kind === 'arrow' ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6
        : draft.kind === 'text' ? true : Math.abs(draft.w) > 4 && Math.abs(draft.h) > 4
      if (big) setShapes((s) => [...s, draft])
      setDraft(null)
    }
  }

  const undo = useCallback(() => {
    if (crop) { setCrop(null); return }
    setShapes((s) => s.slice(0, -1))
  }, [crop])

  const exportPng = (): string => {
    const img = imgRef.current!
    const full = document.createElement('canvas')
    full.width = img.naturalWidth
    full.height = img.naturalHeight
    drawShapes(full.getContext('2d')!, img, shapes)
    if (!crop) return full.toDataURL('image/png')
    const out = document.createElement('canvas')
    out.width = Math.round(crop.w)
    out.height = Math.round(crop.h)
    out.getContext('2d')!.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  const save = async (copy: boolean): Promise<void> => {
    setBusy(true)
    try { await onSave(exportPng(), copy) } finally { setBusy(false) }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (textAt) return
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); void save(true); return }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase())
      if (t && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(t.id)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const changed = shapes.length > 0 || !!crop

  return createPortal(
    <motion.div {...backdropMotion} className="fixed inset-0 z-700 bg-black/60 backdrop-blur-[2px] flex flex-col p-4 gap-3">
      <motion.div {...dialogMotion} className="fl-dialog rounded-[12px]! flex items-center gap-1.5 px-2 py-1.5 self-center">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} type="button" onClick={() => setTool(t.id)} aria-pressed={tool === t.id}
              title={`${t.label} (${t.key.toUpperCase()})`}
              className={`ui-btn ui-btn-icon ${tool === t.id ? 'bg-on-surface/[0.07] text-on-surface' : 'ui-btn-ghost'}`}>
              <Icon size={16} weight={tool === t.id ? 'regular' : 'light'} />
            </button>
          )
        })}
        <span className="w-px h-6 bg-(--hairline-strong) mx-1" />
        {COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c}
            className="w-5 h-5 rounded-full transition-transform hover:scale-110"
            style={{ background: c, boxShadow: color === c ? `0 0 0 2px rgb(var(--c-surface)), 0 0 0 4px ${c === '#FFFFFF' ? '#999' : c}` : 'inset 0 0 0 1px var(--hairline-strong)' }} />
        ))}
        <span className="w-px h-6 bg-(--hairline-strong) mx-1" />
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={undo} disabled={!changed} title="Deshacer (Ctrl+Z)"><Undo2 size={15} /></button>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={busy || !changed} onClick={() => void save(false)}>
          <Save size={13} /> Guardar copia
        </button>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy} onClick={() => void save(true)} title="Guarda y copia al portapapeles (Ctrl+C)">
          <Copy size={13} /> Copiar
        </button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)"><X size={15} /></button>
      </motion.div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="relative max-w-full max-h-full">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            className="block max-w-full max-h-[calc(100vh-110px)] rounded-lg shadow-2xl bg-white"
            style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }}
          />
          {textAt && (
            <TextInput
              x={textAt.sx}
              y={textAt.sy}
              color={color}
              onDone={(text) => {
                if (text.trim()) setShapes((s) => [...s, { kind: 'text', x: textAt.x, y: textAt.y, text, color }])
                setTextAt(null)
              }}
            />
          )}
          {!ready && <p className="text-white t-body p-10">Cargando…</p>}
        </div>
      </div>
      <p className="text-center t-caption text-white/70">
        R rectángulo · A flecha · T texto · H resaltar · P pixelar · C recortar · Ctrl+Z deshacer · Ctrl+C copiar · La original no se modifica
      </p>
    </motion.div>,
    document.body,
  )
}

function TextInput({ x, y, color, onDone }: { x: number; y: number; color: string; onDone: (text: string) => void }): JSX.Element {
  const [v, setV] = useState('')
  return (
    <textarea
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onDone(v) }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone('') }
      }}
      placeholder="Texto… (Enter)"
      rows={1}
      className="absolute bg-white/90 dark:bg-black/70 rounded px-1.5 py-0.5 text-[14px] font-semibold outline-hidden shadow-lg resize min-w-[160px]"
      style={{ left: x, top: y, color }}
    />
  )
}
