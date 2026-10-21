import { ChevronRight, Folder, HardDrive } from 'lucide-react'

interface BreadcrumbProps {
  filePath: string
  onPathCopied?: () => void
  /** Sin fondo ni borde propio: para usarlo dentro de otra barra */
  inline?: boolean
}

/**
 * Ruta del archivo: cada carpeta abre esa carpeta en el Explorador de Windows; Ctrl+clic
 * (o clic en el nombre del archivo) copia la ruta hasta ahí.
 */
export function Breadcrumb({ filePath, onPathCopied, inline = false }: BreadcrumbProps): JSX.Element {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
  const upTo = (idx: number): string => {
    const p = segments.slice(0, idx + 1).join(sep)
    return /^[A-Za-z]:$/.test(segments[0] ?? '') || filePath.startsWith('/') === false ? p : `/${p}`
  }
  const copy = (idx: number): void => {
    void navigator.clipboard.writeText(upTo(idx)).then(() => onPathCopied?.()).catch(() => {})
  }
  // Muchas carpetas: se acortan las del medio para que se vea dónde estás.
  const shown = segments.length > 6 ? [0, -1, ...segments.map((_, i) => i).slice(-4)] : segments.map((_, i) => i)

  return (
    <div className={`flex items-center overflow-x-auto scrollbar-hide select-none gap-0.5 ${inline ? 'min-w-0 flex-1' : 'px-2 h-7 hairline-b bg-surface shrink-0'}`}>
      {shown.map((i, k) => {
        if (i === -1) return <span key="gap" className="flex items-center gap-0.5 shrink-0"><ChevronRight size={10} className="text-on-surface-variant/40" /><span className="px-1 t-caption text-on-surface-variant/60">…</span></span>
        const seg = segments[i]!
        const isLast = i === segments.length - 1
        const isDrive = i === 0 && /^[A-Za-z]:$/.test(seg)
        return (
          <span key={i} className="flex items-center gap-0.5 shrink-0">
            {k > 0 && <ChevronRight size={10} className="text-on-surface-variant/40 shrink-0" />}
            <button
              onClick={(e) => {
                if (isLast || e.ctrlKey || e.metaKey) { copy(i); return }
                void window.api.invoke('editor:reveal', upTo(i + 1 < segments.length ? i + 1 : i)).catch(() => copy(i))
              }}
              title={isLast ? `Copiar la ruta completa` : `Abrir ${upTo(i)} en el Explorador · Ctrl+clic copia la ruta`}
              className={`flex items-center gap-1 px-1.5 py-px rounded-[6px] t-caption transition-colors ${
                isLast ? 'text-on-surface font-semibold hover:bg-on-surface/6' : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/6'}`}
            >
              {!isLast && (isDrive ? <HardDrive size={11} className="opacity-70" /> : <Folder size={11} className="opacity-70" />)}
              {seg}
            </button>
          </span>
        )
      })}
    </div>
  )
}
