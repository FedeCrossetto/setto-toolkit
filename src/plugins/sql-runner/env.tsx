import sqlServerSvg from './sql-server.svg'

/**
 * Identidad visual de Consultas: color por ambiente (según la etiqueta de la conexión)
 * y el ícono de SQL Server.
 */
export type EnvTone = 'prod' | 'qa' | 'dev' | 'lps' | 'neutral'

/**
 * Se trabaja casi siempre en Prod: Prod queda neutro (sin rojo) y el color marca lo
 * distinto: QA/Test en ámbar, Dev/Local en verde, LPS en celeste.
 */
export function envTone(tag: string | undefined): EnvTone {
  const t = (tag ?? '').toLowerCase()
  if (/prod|cliente|live|real/.test(t)) return 'prod'
  if (/qa|test|uat|stag|pre/.test(t)) return 'qa'
  if (/dev|local|desa/.test(t)) return 'dev'
  if (/lps/.test(t)) return 'lps'
  return 'neutral'
}

/** Clases por ambiente: chip, punto/acento y texto (vacío = sin acento). */
export const TONE: Record<EnvTone, { chip: string; dot: string; text: string; bar: string }> = {
  prod: { chip: 'bg-on-surface/7 text-on-surface ring-1 ring-on-surface/10', dot: '', text: 'text-on-surface-variant', bar: '' },
  qa: { chip: 'bg-warning/12 text-warning ring-1 ring-warning/25', dot: 'bg-warning', text: 'text-warning', bar: 'from-warning/70' },
  dev: { chip: 'bg-success/12 text-success ring-1 ring-success/25', dot: 'bg-success', text: 'text-success', bar: 'from-success/70' },
  lps: { chip: 'bg-sky-500/12 text-sky-500 ring-1 ring-sky-500/25', dot: 'bg-sky-500', text: 'text-sky-500', bar: 'from-sky-500/70' },
  neutral: { chip: 'bg-on-surface/6 text-on-surface-variant ring-1 ring-on-surface/8', dot: '', text: 'text-on-surface-variant', bar: '' },
}

export function EnvChip({ tag, className = '' }: { tag: string; className?: string }): JSX.Element | null {
  if (!tag) return null
  return <span className={`inline-flex items-center text-[10.5px] leading-[16px] font-semibold px-1.5 rounded-[5px] shrink-0 ${TONE[envTone(tag)].chip} ${className}`}>{tag}</span>
}

/** Ícono oficial de SQL Server (2025, Wikimedia Commons). */
export function SqlServerIcon({ size = 18, className = '' }: { size?: number; className?: string }): JSX.Element {
  return <img src={sqlServerSvg} width={size} height={size} alt="" draggable={false} className={`shrink-0 select-none ${className}`} />
}
