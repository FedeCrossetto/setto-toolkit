import { useEffect, useState } from 'react'
import { ArrowDownToLine, X } from 'lucide-react'

/**
 * Aviso de actualización (abajo a la derecha). Escucha `updater:status` del main:
 * disponible → Descargar; descargando → barra de progreso; lista → Reiniciar e
 * instalar; error de descarga → mensaje + Reintentar. Los chequeos automáticos
 * que fallan (sin releases, sin red) no llegan acá: el main los silencia.
 * El resultado del chequeo manual lo muestra Ajustes (`updater:check`).
 */
type Status =
  | { type: 'available'; version: string }
  | { type: 'downloading'; version: string; percent: number; transferred: number; total: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; version: string; message: string }

type Incoming =
  | { type: 'available' | 'ready'; version?: string }
  | { type: 'downloading'; percent?: number; transferred?: number; total?: number }
  | { type: 'error'; message?: string; phase?: 'check' | 'download' }
  | { type: 'checking' | 'not-available' }

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function UpdateBanner(): JSX.Element | null {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    const off = window.api.on('updater:status', (raw: unknown) => {
      const s = raw as Incoming
      setStatus((prev) => {
        const version = prev?.version ?? ''
        switch (s.type) {
          case 'available': return { type: 'available', version: s.version ?? version }
          case 'ready': return { type: 'ready', version: s.version ?? version }
          case 'downloading':
            return { type: 'downloading', version, percent: s.percent ?? 0, transferred: s.transferred ?? 0, total: s.total ?? 0 }
          case 'error':
            // Errores del chequeo los muestra Ajustes; acá sólo los de la descarga.
            return s.phase === 'download' ? { type: 'error', version, message: s.message ?? 'No se pudo descargar la actualización.' } : prev
          default: return prev
        }
      })
    })
    return off
  }, [])

  if (!status) return null

  const download = (): void => {
    setStatus({ type: 'downloading', version: status.version, percent: 0, transferred: 0, total: 0 })
    void window.api.invoke<{ ok: boolean; error?: string }>('updater:download')
      .then((r) => { if (!r?.ok) setStatus({ type: 'error', version: status.version, message: r?.error ?? 'No se pudo descargar la actualización.' }) })
      .catch((err: unknown) => setStatus({ type: 'error', version: status.version, message: err instanceof Error ? err.message : String(err) }))
  }

  return (
    <div role="status" className="fixed bottom-4 right-4 z-500 flex items-center gap-3 mac-popover hairline px-4 py-2.5 t-body max-w-[420px]">
      <ArrowDownToLine size={18} className={status.type === 'error' ? 'text-error' : 'text-accent'} />
      {status.type === 'available' && (
        <>
          <span className="text-on-surface">Actualización <span className="font-semibold">{status.version}</span> disponible</span>
          <button onClick={download} className="ui-btn ui-btn-primary ui-btn-sm">Descargar</button>
        </>
      )}
      {status.type === 'downloading' && (
        <div className="flex flex-col gap-1 min-w-[200px]">
          <span className="text-on-surface">
            Descargando {status.version}… {status.percent}%
            {status.total > 0 && <span className="text-on-surface-variant"> · {mb(status.transferred)} de {mb(status.total)}</span>}
          </span>
          <div className="h-1 rounded-full bg-surface-container-high overflow-hidden" aria-hidden>
            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(2, status.percent)}%` }} />
          </div>
        </div>
      )}
      {status.type === 'ready' && (
        <>
          <span className="text-on-surface">Lista para instalar <span className="font-semibold">{status.version}</span></span>
          <button onClick={() => window.api.send('updater:install')} className="ui-btn ui-btn-primary ui-btn-sm">Reiniciar e instalar</button>
        </>
      )}
      {status.type === 'error' && (
        <>
          <span className="text-on-surface">{status.message}</span>
          <button onClick={download} className="ui-btn ui-btn-sm">Reintentar</button>
        </>
      )}
      {status.type !== 'downloading' && (
        <button onClick={() => setStatus(null)} aria-label="Descartar" className="text-on-surface-variant hover:text-on-surface transition-colors ml-1">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
