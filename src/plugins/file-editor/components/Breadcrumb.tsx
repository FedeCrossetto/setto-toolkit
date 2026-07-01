import { ChevronRight } from 'lucide-react'

interface BreadcrumbProps {
  filePath: string
  onPathCopied?: () => void
}

export function Breadcrumb({ filePath, onPathCopied }: BreadcrumbProps): JSX.Element {
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean)

  const copySegment = (idx: number): void => {
    const partial = segments.slice(0, idx + 1).join('/')
    void navigator.clipboard.writeText(partial).then(() => onPathCopied?.()).catch(() => {})
  }

  return (
    <div className="flex items-center px-2 py-1 border-b border-outline-variant/10 overflow-x-auto scrollbar-hide flex-shrink-0 select-none gap-0.5"
      style={{ background: 'rgb(var(--c-surface-container) / 0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        return (
          <span key={i} className="flex items-center gap-0.5 flex-shrink-0">
            {i > 0 && <ChevronRight size={10} className="text-on-surface-variant/25 flex-shrink-0" />}
            <button
              onClick={() => copySegment(i)}
              title={`Copiar: ${segments.slice(0, i + 1).join('/')}`}
              className={`px-1.5 py-0.5 rounded-md text-[10px] transition-all ${
                isLast
                  ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/20'
                  : 'text-on-surface-variant/45 hover:text-on-surface-variant hover:bg-surface-container-high'
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
