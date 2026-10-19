import { useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, Plug, RefreshCw } from 'lucide-react'
import { EmptyState } from '../../../core/components/EmptyState'
import { useApp } from '../../../core/AppContext'
import { useToast } from '../../../core/components/Toast'
import type { SupabaseHealth, SupabaseTableName } from '../types'
import { projectRef } from '../hooks/useSupabaseHealth'

const TABLE_LABEL: Record<SupabaseTableName, string> = {
  servicios: 'servicios (fijos)',
  pagos: 'pagos de servicios',
  gastos: 'gastos variables',
  credenciales: 'credenciales',
  queries: 'queries',
}

/** Abre Conexiones (la sección de Supabase si la soporta). */
export function useOpenConexiones(): () => void {
  const { dispatch } = useApp()
  return () => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'connections', action: 'supabase' })
}

/** Gastos sin Supabase configurado y sin datos locales. */
export function SetupEmpty({ onCheck, checking }: { onCheck: () => void; checking: boolean }): JSX.Element {
  const openConexiones = useOpenConexiones()
  return (
    <div className="ui-card">
      <EmptyState icon={Plug} title="Conectá Gastos con Supabase"
        description={'Tus gastos se guardan en tu propio proyecto de Supabase.\nCargá la URL y la service_role key en Conexiones.'}
        action={
          <div className="flex items-center gap-2">
            <button type="button" className="ui-btn ui-btn-primary" onClick={openConexiones}><Plug size={14} /> Abrir Conexiones</button>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={onCheck} disabled={checking}>
              {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Verificar
            </button>
          </div>
        } />
    </div>
  )
}

/** Tarjeta "Completar la base de datos": tablas faltantes + SQL listo para pegar. */
export function MissingTablesCard({ health, onCheck, checking, pendingCount }: {
  health: SupabaseHealth
  onCheck: () => void
  checking: boolean
  pendingCount: number
}): JSX.Element {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [showSql, setShowSql] = useState(false)
  const preRef = useRef<HTMLTextAreaElement>(null)
  const missing = (Object.keys(health.tables) as SupabaseTableName[]).filter((t) => !health.tables[t] && health.missingSql.includes(`public.${t} (`))
  const ref = projectRef(health.url)
  const sqlEditor = ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard/projects'

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(health.missingSql)
    } catch {
      preRef.current?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    toast.show('SQL copiado. Pegalo en el SQL Editor y tocá Run.', 'success', 3500)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="ui-card px-5 py-4 flex flex-col gap-3" aria-label="Completar la base de datos">
      <div className="flex items-start gap-3">
        <span className="icon-tile w-8 h-8 text-warning">
          <Plug size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="t-callout font-semibold text-on-surface">Completar la base de datos</h2>
          <p className="t-footnote text-on-surface-variant mt-0.5">
            A tu proyecto de Supabase le falta{missing.length > 1 ? 'n las tablas' : ' la tabla'}{' '}
            {missing.map((t, i) => <span key={t}>{i ? ', ' : ''}<b className="font-semibold text-on-surface">{TABLE_LABEL[t]}</b></span>)}.
            {' '}Mientras tanto lo que cargues queda guardado en este equipo
            {pendingCount ? ` (${pendingCount} sin subir)` : ''} y se sube solo cuando la tabla exista.
          </p>
        </div>
      </div>
      <ol className="t-footnote text-on-surface-variant list-decimal pl-5 flex flex-col gap-0.5">
        <li>Copiá el SQL (crea sólo lo que falta; se puede correr más de una vez).</li>
        <li>Abrí el SQL Editor de tu proyecto, pegalo y tocá <b className="font-semibold">Run</b>.</li>
        <li>Volvé y tocá <b className="font-semibold">Verificar de nuevo</b>.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => { void copy() }}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar SQL'}
        </button>
        <a className="ui-btn ui-btn-outline" href={sqlEditor} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Abrir SQL Editor
        </a>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onCheck} disabled={checking}>
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Verificar de nuevo
        </button>
        <button type="button" className="ui-btn ui-btn-ghost ml-auto" onClick={() => setShowSql((v) => !v)} aria-expanded={showSql}>
          {showSql ? 'Ocultar SQL' : 'Ver SQL'}
        </button>
      </div>
      {showSql && (
        <textarea ref={preRef} readOnly value={health.missingSql} spellCheck={false} aria-label="SQL a ejecutar"
          className="ui-input w-full h-56 font-mono text-[12px] leading-relaxed resize-y whitespace-pre" />
      )}
    </section>
  )
}

/** Aviso de conexión: key rechazada / Supabase no responde. */
export function ConnectionProblem({ health, onRetry, checking }: { health: SupabaseHealth; onRetry: () => void; checking: boolean }): JSX.Element {
  const openConexiones = useOpenConexiones()
  const isAuth = health.reachable && !health.authOk
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-surface hairline t-footnote text-on-surface-variant">
      <span className={`icon-tile w-7 h-7 ${isAuth ? 'text-error' : 'text-warning'}`}>
        <Plug size={14} />
      </span>
      <span className="flex-1">
        {health.error ?? (isAuth ? 'Supabase rechazó la key.' : 'No se pudo conectar con Supabase.')}
        {' '}Estás viendo lo guardado en este equipo.
      </span>
      {isAuth && <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={openConexiones}>Conexiones</button>}
      <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={onRetry} disabled={checking}>
        {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reintentar
      </button>
    </div>
  )
}
