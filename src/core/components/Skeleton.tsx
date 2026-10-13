interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

/** Neutral shimmer placeholder block. Compose several to mock a layout. */
export function Skeleton({ className = '', style }: SkeletonProps): JSX.Element {
  return <div className={`ui-skeleton ${className}`} style={style} aria-hidden />
}

/** Generic loading layout shown while a plugin's lazy bundle resolves. */
export function PluginLoadingFallback(): JSX.Element {
  return (
    <div className="flex flex-col h-full w-full px-6 py-5 gap-5" aria-busy="true" aria-label="Cargando…">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-7 w-24 ml-auto" />
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {[92, 78, 85, 60, 70, 50].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}
