interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

/** Neutral shimmer placeholder block. Compose several to mock a layout. */
export function Skeleton({ className = '', style }: SkeletonProps): JSX.Element {
  return <div className={`ui-skeleton ${className}`} style={style} aria-hidden />
}

/**
 * Filas de lista mientras carga: misma forma que las reales (avatar o ícono + dos líneas),
 * así no "salta" el contenido cuando aparece. Reemplaza los "Cargando…" en texto.
 */
export function ListSkeleton({ rows = 5, avatar = true, className = '' }: { rows?: number; avatar?: boolean; className?: string }): JSX.Element {
  return (
    <div className={`flex flex-col gap-1 px-2 py-2 ${className}`} aria-busy="true" aria-label="Cargando…">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-[7px]" style={{ opacity: 1 - i * (0.6 / rows) }}>
          {avatar && <Skeleton className="w-8 h-8 rounded-[10px] shrink-0" />}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3" style={{ width: `${68 - ((i * 13) % 30)}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${44 - ((i * 7) % 18)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Detalle mientras carga: título, subtítulo y un bloque grande. */
export function DetailSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-w-[720px] w-full mx-auto" aria-busy="true" aria-label="Cargando…">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-3 w-36" />
      </div>
      <Skeleton className="h-48 w-full rounded-[14px]" />
      <div className="flex flex-col gap-2">
        {[80, 64, 72].map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  )
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
