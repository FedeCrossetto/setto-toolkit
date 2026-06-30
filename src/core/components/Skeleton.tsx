interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

/** Shimmer placeholder block. Compose several to mock a layout. */
export function Skeleton({ className = '', style }: SkeletonProps): JSX.Element {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />
}

/** Generic loading layout shown while a plugin's lazy bundle resolves. */
export function PluginLoadingFallback(): JSX.Element {
  return (
    <div className="flex flex-col h-full w-full p-6 gap-5" aria-busy="true" aria-label="Cargando…">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 !rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="h-8 w-28 !rounded-lg ml-auto" />
      </div>

      {/* Toolbar */}
      <div className="flex gap-2">
        <Skeleton className="h-7 w-20 !rounded-lg" />
        <Skeleton className="h-7 w-20 !rounded-lg" />
        <Skeleton className="h-7 w-7 !rounded-lg" />
      </div>

      {/* Body lines */}
      <div className="flex flex-col gap-3 flex-1">
        {[92, 78, 85, 60, 70, 50].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}
