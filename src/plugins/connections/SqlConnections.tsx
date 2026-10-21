import { useCallback, useEffect, useRef, useState } from 'react'
import { EnvChip } from '../sql-runner/env'
import { joinServer, serverFromHostInput, splitServer } from '../sql-runner/sql-meta'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, CircleAlert, Copy, Pencil, Plus, Server, Trash2, Zap } from 'lucide-react'
import { Sheet, useConfirm } from '../../core/components/Modal'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { Toggle } from '../../core/components/Form'
import { useToast } from '../../core/components/Toast'
import { listItemMotion } from '../../core/motion'
import {
  SQL_COPY_LABELS, buildConnectionString, validateDraft,
  type SqlAuth, type SqlCopyFormat, type SqlProfile, type SqlProfileDraft, type SqlTestResult,
} from './sql'

/**
 * Conexiones → Bases de datos: perfiles de SQL Server (Main, LPS, QA…) para
 * probar la conexión y copiar el servidor o la cadena sin buscarla en un .cfg.
 * La contraseña la maneja main (ver electron/plugins/sql-connections).
 */
const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const EMPTY: SqlProfileDraft = { name: '', server: '', database: '', auth: 'sql', user: '', tag: '', trustCert: true }

function relTime(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `hace ${h} h` : new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function SqlConnections(): JSX.Element {
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState<SqlProfile[] | null>(null)
  const [editing, setEditing] = useState<SqlProfile | 'new' | null>(null)
  const [testing, setTesting] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try { setItems(await window.api.invoke<SqlProfile[]>('sql:list')) } catch { setItems([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const test = async (id: string): Promise<void> => {
    setTesting((s) => new Set(s).add(id))
    try {
      const r = await window.api.invoke<SqlTestResult>('sql:test', id)
      toast.show(r.ok ? r.detail : `No conecta: ${r.detail}`, r.ok ? 'success' : 'error')
    } catch (e) { toast.show(cleanErr(e), 'error') }
    setTesting((s) => { const n = new Set(s); n.delete(id); return n })
    void load()
  }

  const copy = async (p: SqlProfile, format: SqlCopyFormat): Promise<void> => {
    try {
      const r = await window.api.invoke<{ clears: boolean }>('sql:copy', p.id, format)
      toast.show(`${SQL_COPY_LABELS[format]} de ${p.name} copiado${r.clears ? ' (con contraseña: se borra en 60 s)' : ''}`, 'success')
      void load()
    } catch (e) { toast.show(cleanErr(e), 'error') }
  }

  const remove = async (p: SqlProfile): Promise<void> => {
    const ok = await confirm({ title: `¿Eliminar "${p.name}"?`, message: 'Se borra de esta computadora, con su contraseña.', confirmLabel: 'Eliminar', destructive: true })
    if (!ok) return
    try { await window.api.invoke('sql:delete', p.id); void load() } catch (e) { toast.show(cleanErr(e), 'error') }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h2 className="t-section flex-1">Bases de datos · SQL Server</h2>
        <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setEditing('new')}><Plus size={12} /> Nueva conexión</button>
      </div>

      {items !== null && items.length === 0 ? (
        <button onClick={() => setEditing('new')}
          className="ui-card ui-card-interactive flex items-center gap-3 px-5 py-4 text-left">
          <span className="icon-tile w-9 h-9"><Server size={16} /></span>
          <span className="flex-1 min-w-0">
            <span className="block t-body font-medium text-on-surface">Guardá tus servidores SQL</span>
            <span className="block t-footnote text-on-surface-variant">Main, LPS, QA… Probás la conexión y copiás el servidor o la cadena con un clic (también desde Ctrl+K).</span>
          </span>
          <Plus size={14} className="text-on-surface-variant" />
        </button>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence initial={false}>
            {(items ?? []).map((p) => (
              <motion.div key={p.id} {...listItemMotion}>
                <ProfileCard p={p} testing={testing.has(p.id)}
                  onTest={() => void test(p.id)} onCopy={(f) => void copy(p, f)}
                  onEdit={() => setEditing(p)} onDelete={() => void remove(p)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {editing && (
        <ProfileSheet profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load() }} />
      )}
    </section>
  )
}

function ProfileCard({ p, testing, onTest, onCopy, onEdit, onDelete }: {
  p: SqlProfile
  testing: boolean
  onTest: () => void
  onCopy: (f: SqlCopyFormat) => void
  onEdit: () => void
  onDelete: () => void
}): JSX.Element {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent): void => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const t = p.lastTest
  const formats: SqlCopyFormat[] = p.auth === 'sql' ? ['server', 'adonet', 'adonet-safe', 'sqlcmd'] : ['server', 'adonet', 'sqlcmd']

  return (
    <article className="ui-card px-5 pt-5 pb-4 flex flex-col gap-3 h-full">
      <div className="flex items-start gap-3">
        <span className="icon-tile w-9 h-9"><Server size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="t-body font-semibold text-on-surface truncate">{p.name}</h3>
            {p.tag && <EnvChip tag={p.tag} />}
          </div>
          <p className="t-footnote text-on-surface-variant font-mono truncate" title={p.server}>{p.server}{p.database ? ` · ${p.database}` : ''}</p>
          <p className="t-caption text-on-surface-variant/80 truncate">{p.auth === 'windows' ? 'Windows' : `SQL · ${p.user}`}</p>
        </div>
        <span className="flex items-center gap-0.5 -mt-1 -mr-1.5 shrink-0">
          <span title={t?.detail ?? 'Sin probar'} className={`w-2 h-2 rounded-full mr-1 ${!t ? 'bg-on-surface/20' : t.ok ? 'bg-success' : 'bg-error'}`} />
          <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onEdit} aria-label="Editar" title="Editar"><Pencil size={13} /></button>
          <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={onDelete} aria-label="Eliminar" title="Eliminar"><Trash2 size={13} /></button>
        </span>
      </div>

      {t && !t.ok && (
        <p className="t-caption text-error flex items-start gap-1.5"><CircleAlert size={12} className="mt-px shrink-0" /><span className="line-clamp-2">{t.detail}</span></p>
      )}
      {t?.ok && <p className="t-caption text-on-surface-variant truncate" title={t.detail}><Check size={11} className="inline -mt-px mr-1 text-success" />{t.detail} · {relTime(t.at)}</p>}

      <div className="flex items-center gap-1.5 mt-auto">
        <div className="relative" ref={menuRef}>
          <div className="inline-flex">
            <button className="ui-btn ui-btn-primary ui-btn-sm rounded-r-none" onClick={() => onCopy('server')} title="Copiar el servidor (como en SSMS)">
              <Copy size={12} /> Servidor
            </button>
            <button className="ui-btn ui-btn-primary ui-btn-sm rounded-l-none border-l border-on-primary/20 px-1.5" onClick={() => setMenu((v) => !v)} aria-label="Más formatos" aria-expanded={menu}>
              <ChevronDown size={12} />
            </button>
          </div>
          <AnimatePresence>
            {menu && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}
                className="absolute z-20 left-0 top-full mt-1 min-w-[200px] ui-menu p-1">
                {formats.map((f) => (
                  <button key={f} onClick={() => { setMenu(false); onCopy(f) }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md t-footnote text-on-surface hover:bg-selected">
                    {SQL_COPY_LABELS[f]}{f === 'adonet' && p.auth === 'sql' ? ' (con contraseña)' : ''}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={onTest} disabled={testing}>
          <Zap size={12} className={testing ? 'animate-pulse' : ''} /> {testing ? 'Probando…' : 'Probar'}
        </button>
      </div>
    </article>
  )
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-footnote font-medium text-on-surface">{label}</span>
      {children}
      {error ? <span className="t-caption text-error">{error}</span> : hint ? <span className="t-caption text-on-surface-variant">{hint}</span> : null}
    </label>
  )
}

function ProfileSheet({ profile, onClose, onSaved }: { profile: SqlProfile | null; onClose: () => void; onSaved: () => void }): JSX.Element {
  const toast = useToast()
  const [d, setD] = useState<SqlProfileDraft>(() => (profile
    ? { id: profile.id, name: profile.name, server: profile.server, database: profile.database, auth: profile.auth, user: profile.user, tag: profile.tag, trustCert: profile.trustCert }
    : EMPTY))
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [result, setResult] = useState<SqlTestResult | null>(null)

  const draft: SqlProfileDraft = { ...d, ...(password ? { password } : {}) }
  const errors = validateDraft(draft, !!profile?.hasPassword)
  const valid = Object.keys(errors).length === 0
  const set = (patch: Partial<SqlProfileDraft>): void => { setD((x) => ({ ...x, ...patch })); setResult(null) }
  const input = 'ui-input w-full'
  const { host, port } = splitServer(d.server)

  const runTest = async (): Promise<void> => {
    setTouched(true)
    if (!valid) return
    setBusy('test')
    try { setResult(await window.api.invoke<SqlTestResult>('sql:test', draft)) } catch (e) { setResult({ ok: false, detail: cleanErr(e), at: Date.now() }) }
    setBusy(null)
  }
  const save = async (): Promise<void> => {
    setTouched(true)
    if (!valid) return
    setBusy('save')
    try { await window.api.invoke('sql:save', draft); toast.show(`"${d.name.trim()}" guardada`, 'success'); onSaved() } catch (e) { toast.show(cleanErr(e), 'error'); setBusy(null) }
  }

  return (
    <Sheet open onClose={onClose} title={profile ? `Editar ${profile.name}` : 'Nueva conexión SQL Server'}
      subtitle="Se guarda cifrada en esta computadora" width={460}
      footer={
        <div className="flex items-center gap-2 w-full">
          <button className="ui-btn ui-btn-outline" onClick={() => void runTest()} disabled={busy !== null}>
            <Zap size={13} /> {busy === 'test' ? 'Probando…' : 'Probar'}
          </button>
          <span className="flex-1" />
          <button className="ui-btn ui-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="ui-btn ui-btn-primary" onClick={() => void save()} disabled={busy !== null}>{busy === 'save' ? 'Guardando…' : 'Guardar'}</button>
        </div>
      }>
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Nombre" error={touched ? errors.name : undefined}>
            <input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Local Main" autoFocus />
          </Field>
          <Field label="Etiqueta">
            <input className={input} value={d.tag} onChange={(e) => set({ tag: e.target.value })} placeholder="Main, LPS…" />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <Field label="Servidor" error={touched ? errors.server : undefined} hint="IP o HOST\INSTANCIA">
            <input className={`${input} font-mono`} value={host} onChange={(e) => set({ server: serverFromHostInput(e.target.value, port) })} placeholder="CROSSETTO\MSSQLSERVER02" spellCheck={false} />
          </Field>
          <Field label="Puerto" hint="Opcional">
            <input className={`${input} font-mono text-center`} value={port} onChange={(e) => set({ server: joinServer(host, e.target.value.replace(/\D/g, '')) })} placeholder="1433" inputMode="numeric" spellCheck={false} />
          </Field>
        </div>
        <Field label="Base de datos" hint="Opcional">
          <input className={`${input} font-mono`} value={d.database} onChange={(e) => set({ database: e.target.value })} placeholder="wgdb_000" spellCheck={false} />
        </Field>
        <Field label="Autenticación">
          <SegmentedControl<SqlAuth> value={d.auth} onChange={(auth) => set({ auth })}
            options={[{ value: 'sql', label: 'SQL Server' }, { value: 'windows', label: 'Windows' }]} />
        </Field>
        {d.auth === 'sql' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usuario" error={touched ? errors.user : undefined}>
              <input className={input} value={d.user} onChange={(e) => set({ user: e.target.value })} placeholder="sa" spellCheck={false} autoComplete="off" />
            </Field>
            <Field label="Contraseña" error={touched ? errors.password : undefined}>
              <input className={input} type="password" value={password} onChange={(e) => { setPassword(e.target.value); setResult(null) }}
                placeholder={profile?.hasPassword ? 'Sin cambios' : ''} autoComplete="new-password" />
            </Field>
          </div>
        )}
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="t-footnote font-medium text-on-surface">Confiar en el certificado del servidor</span>
            <span className="t-caption text-on-surface-variant">Necesario en servidores locales o de prueba sin certificado propio.</span>
          </span>
          <Toggle checked={d.trustCert} onChange={(trustCert) => set({ trustCert })} label="Confiar en el certificado" />
        </label>

        <div className="rounded-lg hairline px-3 py-2">
          <div className="t-caption text-on-surface-variant mb-0.5">Cadena (sin contraseña)</div>
          <code className="block t-caption font-mono text-on-surface break-all">{buildConnectionString(d, null)}</code>
        </div>

        {result && (
          <p className={`t-footnote flex items-start gap-1.5 ${result.ok ? 'text-success' : 'text-error'}`}>
            {result.ok ? <Check size={13} className="mt-px shrink-0" /> : <CircleAlert size={13} className="mt-px shrink-0" />}
            <span>{result.detail}{result.ms ? ` (${result.ms} ms)` : ''}</span>
          </p>
        )}
      </div>
    </Sheet>
  )
}
