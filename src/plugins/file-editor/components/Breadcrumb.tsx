import { ChevronRight } from 'lucide-react'

interface BreadcrumbProps {
  filePath: string
  onPathCopied?: () => void
  /** Sin fondo ni borde propio: para usarlo dentro de otra barra */
  inline?: boolean
}

export function Breadcrumb({ filePath, onPathCopied, inline = false }: BreadcrumbProps): JSX.Element {
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean)

  const copySegment = (idx: number): void => {
    const partial = segments.slice(0, idx + 1).join('/')
    void navigator.clipboard.writeText(partial).then(() => onPathCopied?.()).catch(() => {})
  }

  return (
    <div className={`flex items-center overflow-x-auto scrollbar-hide select-none gap-0.5 ${inline ? 'min-w-0 flex-1' : 'px-2 h-7 hairline-b bg-surface flex-shrink-0'}`}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-0.5 flex-shrink-0">
            {i > 0 && <ChevronRight size={10} className="text-on-surface-variant/40 flex-shrink-0" />}
            <button
              onClick={() => copySegment(i)}
              title={`Copiar: ${segments.slice(0, i + 1).join('/')}`}
              className={`px-1.5 py-px rounded t-caption transition-colors ${
                isLast
                  ? 'text-on-surface font-medium hover:bg-on-surface/[0.06]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]'
              }`}
            >
              {seg}
            </button>
          </span>
        )
      })}
    </div>
  )
}
