interface BreadcrumbProps {
  filePath: string
}

export function Breadcrumb({ filePath }: BreadcrumbProps): JSX.Element {
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean)

  const copySegment = (idx: number): void => {
    const partial = segments.slice(0, idx + 1).join('/')
    navigator.clipboard.writeText(partial)
  }

  return (
    <div className="flex items-center px-3 py-[3px] text-[10px] border-b border-outline-variant/10 overflow-x-auto scrollbar-hide flex-shrink-0 bg-surface-container-low/40 select-none">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-0.5 flex-shrink-0">
          {i > 0 && <span className="text-on-surface-variant/25 mx-0.5">/</span>}
          <button
            onClick={() => copySegment(i)}
            title={`Copy: ${segments.slice(0, i + 1).join('/')}`}
            className={`px-0.5 rounded hover:text-primary transition-colors ${
              i === segments.length - 1
                ? 'text-on-surface-variant/70 font-medium'
                : 'text-on-surface-variant/40 hover:text-on-surface-variant'
            }`}
          >
            {seg}
          </button>
        </span>
      ))}
    </div>
  )
}
