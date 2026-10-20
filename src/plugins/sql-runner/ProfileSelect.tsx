import { Database, Server, Settings2 } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import type { SqlProfile } from '../connections/sql'
import { Picker } from './Picker'
import { EnvChip, SqlServerIcon } from './env'

/** Punto de estado según la última prueba de la conexión. */
export function StatusDot({ p, className = '' }: { p: SqlProfile; className?: string }): JSX.Element {
  const t = p.lastTest
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${!t ? 'bg-on-surface/25' : t.ok ? 'bg-success shadow-[0_0_6px] shadow-success/60' : 'bg-error'} ${className}`} />
}

/** Selector de conexión (perfiles de Conexiones → Bases de datos). */
export function ProfileSelect({ profiles, value, onChange, label }: {
  profiles: SqlProfile[]
  value: string | null
  onChange: (id: string) => void
  label?: string
}): JSX.Element {
  const { dispatch } = useApp()
  const current = profiles.find((p) => p.id === value)
  return (
    <Picker value={value} onPick={onChange} placeholder="Buscar conexión…" className="max-w-[260px]"
      title={current ? `${current.server}${current.database ? ` · ${current.database}` : ''}` : 'Elegí una conexión'}
      trigger={(
        <>
          {label ? <span className="text-[11px] font-semibold text-primary">{label}</span> : current ? <StatusDot p={current} /> : <Server size={13} className="text-on-surface-variant shrink-0" />}
          <span className="min-w-0 truncate text-[12.5px] font-medium text-on-surface">{current?.name ?? 'Elegí una conexión'}</span>
          {current?.tag && <EnvChip tag={current.tag} />}
        </>
      )}
      items={profiles.map((p) => ({
        id: p.id,
        text: `${p.name} ${p.tag} ${p.server} ${p.database}`,
        render: () => (
          <span className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-[9px] bg-on-surface/5 ring-1 ring-on-surface/8 shrink-0"><SqlServerIcon size={20} /></span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-medium text-on-surface">{p.name}</span>
                {p.tag && <EnvChip tag={p.tag} />}
                <StatusDot p={p} className="ml-auto" />
              </span>
              <span className="block truncate font-mono text-[11px] text-on-surface-variant">{p.server}{p.database ? ` · ${p.database}` : ''}</span>
            </span>
          </span>
        ),
      }))}
      footer={(close) => (
        <button type="button" onClick={() => { close(); dispatch({ type: 'OPEN_TAB', pluginId: 'connections' }) }}
          className="w-full flex items-center gap-2 h-[30px] px-2 rounded-[8px] t-footnote text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface">
          <Settings2 size={13} /> Administrar conexiones
        </button>
      )} />
  )
}

/** Base de datos: las del servidor, o escribir otra. Vacío = la de la conexión. */
export function DatabaseSelect({ value, fallback, databases, onChange }: {
  value: string
  /** Base de la conexión (la que se usa si no se elige otra) */
  fallback: string
  databases: string[]
  onChange: (db: string) => void
}): JSX.Element {
  const DEFAULT = '\u0000default'
  const shown = value || fallback
  const system = new Set(['master', 'model', 'msdb', 'tempdb'])
  return (
    <Picker value={value ? value : DEFAULT} onPick={(id) => onChange(id === DEFAULT ? '' : id)} placeholder="Buscar o escribir una base…" width={260}
      className="max-w-[200px]" title="Base de datos"
      trigger={(
        <>
          <Database size={13} className="text-on-surface-variant shrink-0" />
          <span className={`min-w-0 truncate font-mono text-[12.5px] ${shown ? 'text-on-surface' : 'text-on-surface-variant'}`}>{shown || 'predeterminada'}</span>
        </>
      )}
      items={[
        { id: DEFAULT, text: `predeterminada ${fallback}`, render: () => (
          <span className="block">
            <span className="block text-[12.5px] text-on-surface">La de la conexión</span>
            <span className="block font-mono text-[11px] text-on-surface-variant">{fallback || 'predeterminada del usuario'}</span>
          </span>
        ) },
        ...databases.map((d) => ({
          id: d, text: d, render: () => (
            <span className="flex items-center gap-2">
              <Database size={13} className={system.has(d) ? 'text-on-surface-variant/60' : 'text-primary'} />
              <span className={`truncate font-mono text-[12.5px] ${system.has(d) ? 'text-on-surface-variant' : 'text-on-surface'}`}>{d}</span>
              {system.has(d) && <span className="ml-auto t-caption text-on-surface-variant/70">sistema</span>}
            </span>
          ),
        })),
      ]}
      allowCustom={(t) => <span className="t-footnote text-on-surface">Usar <span className="font-mono text-primary">{t}</span></span>} />
  )
}
