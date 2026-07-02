import { useState, useEffect } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

export function isImagePath(p: string | null): boolean {
  if (!p) return false
  const ext = p.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

/** Fondo damero clásico de editores de imagen para ver transparencias */
const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgb(var(--c-surface-container-high)) 25%, transparent 25%), ' +
    'linear-gradient(-45deg, rgb(var(--c-surface-container-high)) 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, rgb(var(--c-surface-container-high)) 75%), ' +
    'linear-gradient(-45deg, transparent 75%, rgb(var(--c-surface-container-high)) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
}

export function ImagePreview({ path }: { path: string }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [dims, setDims]       = useState<{ w: number; h: number } | null>(null)
  const [size, setSize]       = useState<number>(0)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataUrl(null); setDims(null); setError(null)
    window.api.invoke<{ dataUrl: string; size: number }>('editor:read-image', path)
      .then((res) => { if (!cancelled) { setDataUrl(res.dataUrl); setSize(res.size) } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [path])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <ImageOff size={36} className="text-on-surface-variant/40" />
        <p className="text-xs text-on-surface-variant/60">{error}</p>
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={22} className="animate-spin text-primary/60" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center overflow-auto p-6" style={CHECKERBOARD}>
        <img
          src={dataUrl}
          alt={path.split(/[/\\]/).pop() ?? 'imagen'}
          className="max-w-full max-h-full object-contain rounded shadow-lg"
          style={{ animation: 'fadeSlideUp 0.2s ease-out' }}
          onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-outline-variant/15 flex-shrink-0 select-none"
        style={{ background: 'rgb(var(--c-surface-container) / 0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
        {dims && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 text-on-surface-variant/70 tabular-nums">
            {dims.w} × {dims.h}px
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 text-on-surface-variant/60 tabular-nums">
          {(size / 1024).toFixed(1)}KB
        </span>
      </div>
    </div>
  )
}
