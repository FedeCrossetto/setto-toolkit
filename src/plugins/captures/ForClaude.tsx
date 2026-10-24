import { useEffect, useState } from 'react'
import { Copy, FolderOpen, Sparkles } from 'lucide-react'
import { Modal } from '../../core/components/Modal'
import { useToast } from '../../core/components/Toast'
import { formatTime } from './videos-logic'

type Frame = { name: string; time: number; dataUrl: string }
type FramesResult = { dir: string; duration: number; frames: Frame[] }

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
const toPng = (c: HTMLCanvasElement): Promise<Blob> => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo armar la imagen'))), 'image/png'))
async function copyBlob(b: Blob): Promise<void> { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]) }

/**
 * Una sola imagen con todos los cuadros en grilla y el minuto de cada uno: se pega en el chat
 * de Claude con Ctrl+V. Claude achica las imágenes grandes, así que las celdas no pasan de 800 px.
 */
async function collage(title: string, frames: Frame[]): Promise<Blob> {
  const imgs = await Promise.all(frames.map((f) => loadImg(f.dataUrl)))
  const cols = frames.length <= 4 ? 2 : 3
  const rows = Math.ceil(frames.length / cols)
  const cw = 800, ch = Math.round(cw * (imgs[0]!.naturalHeight / imgs[0]!.naturalWidth))
  const gap = 12, head = 56
  const c = document.createElement('canvas')
  c.width = cols * cw + (cols + 1) * gap
  c.height = head + rows * ch + (rows + 1) * gap
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#1b1b1f'; ctx.font = '600 24px "Segoe UI Variable Text", "Segoe UI", sans-serif'; ctx.textBaseline = 'middle'
  ctx.fillText(`${title} · ${frames.length} cuadros clave en orden`, gap + 4, head / 2 + 4)
  imgs.forEach((img, i) => {
    const x = gap + (i % cols) * (cw + gap), y = head + gap + Math.floor(i / cols) * (ch + gap)
    ctx.drawImage(img, x, y, cw, ch)
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1)
    const label = `${i + 1} · ${formatTime(frames[i]!.time)}`
    ctx.font = '600 20px "Segoe UI Variable Text", "Segoe UI", sans-serif'
    const w = ctx.measureText(label).width + 20
    ctx.fillStyle = 'rgba(17,17,20,0.82)'; ctx.beginPath(); ctx.roundRect(x + 10, y + 10, w, 32, 8); ctx.fill()
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, x + 20, y + 27)
  })
  return toPng(c)
}

/** Claude no lee videos pero sí imágenes: cuadros clave del video para pegarle o arrastrarle. */
export function ForClaude({ path, name, onClose }: { path: string; name: string; onClose: () => void }): JSX.Element {
  const toast = useToast()
  const [data, setData] = useState<FramesResult | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    window.api.invoke<FramesResult>('videos:frames', { path, max: 12 }).then(setData, (e: unknown) => { setFailed(true); toast.show(errMsg(e), 'error') })
  }, [path, toast])

  const copyAll = async (): Promise<void> => {
    if (!data) return
    try { await copyBlob(await collage(name, data.frames)); toast.show('Resumen copiado: pegalo en el chat de Claude con Ctrl+V', 'success') }
    catch (e) { toast.show(errMsg(e), 'error') }
  }
  const copyOne = async (f: Frame): Promise<void> => {
    try {
      const img = await loadImg(f.dataUrl)
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      await copyBlob(await toPng(c))
      toast.show(`Cuadro de ${formatTime(f.time)} copiado`, 'success')
    } catch (e) { toast.show(errMsg(e), 'error') }
  }

  return (
    <Modal open onClose={onClose} width={880}
      title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-primary" /> Para Claude</span>}
      subtitle={data
        ? `${data.frames.length} cuadros donde cambia la pantalla, de ${formatTime(data.duration)}. Claude no lee videos pero sí imágenes.`
        : 'Buscando los momentos en que cambia la pantalla…'}
      footer={<>
        <span className="flex-1 t-caption text-on-surface-variant">Para más detalle, arrastrá al chat las imágenes de la carpeta (tiene una nota que las explica).</span>
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={!data} onClick={() => data && void window.api.invoke('videos:frames-reveal', data.dir)}>
          <FolderOpen size={13} /> Abrir carpeta
        </button>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!data} onClick={() => void copyAll()}>
          <Copy size={13} /> Copiar resumen
        </button>
      </>}>
      {failed ? <p className="t-body text-on-surface-variant py-8 text-center">No se pudieron sacar los cuadros.</p> : (
        <div className="grid grid-cols-3 gap-3">
          {(data?.frames ?? Array.from({ length: 6 }, () => null)).map((f, i) => f ? (
            <button key={f.name} type="button" title="Copiar este cuadro" onClick={() => void copyOne(f)}
              className="group relative rounded-(--r-md) overflow-hidden ring-1 ring-on-surface/10 bg-black aspect-video hover:ring-2 hover:ring-primary transition-shadow">
              <img src={f.dataUrl} alt={`Cuadro ${i + 1}`} className="w-full h-full object-contain" />
              <span className="absolute left-1.5 top-1.5 px-1.5 h-5 rounded-[5px] bg-black/75 text-white text-[11px] leading-5 font-medium tabular-nums">{i + 1} · {formatTime(f.time)}</span>
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white text-[12px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex items-center gap-1.5"><Copy size={13} /> Copiar</span>
              </span>
            </button>
          ) : <div key={i} className="rounded-(--r-md) aspect-video bg-on-surface/[0.06] animate-pulse" />)}
        </div>
      )}
    </Modal>
  )
}
