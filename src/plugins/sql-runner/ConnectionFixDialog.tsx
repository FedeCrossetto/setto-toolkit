import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Plug, SlidersHorizontal, Unplug } from 'lucide-react'
import { Modal } from '../../core/components/Modal'
import { Field, Toggle } from '../../core/components/Form'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { friendlyError, joinServer, serverFromHostInput, splitServer } from './sql-meta'
import { validateDraft, type SqlAuth, type SqlProfile, type SqlProfileDraft, type SqlTestResult } from '../connections/sql'

/**
 * Conexiones desde Consultas, sin ir a Conexiones:
 * - `auth` / `server`: la consulta no pudo conectar (contraseña vencida, IP que cambió…).
 *   Se pide sólo ese dato, se prueba, se guarda y la consulta se reintenta sola.
 * - `edit` / `new`: el formulario completo para editar la conexión o crear otra.
 */
export type FixReason = 'auth' | 'server' | 'edit' | 'new'

export interface FixRequest {
  /** Vacío para `new` */
  profileId?: string
  reason: FixReason
  error?: string
  /** Lo que hay que volver a intentar después de guardar */
  retry?: () => void
}

const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const EMPTY: SqlProfileDraft = { name: '', server: '', database: '', auth: 'sql', user: '', tag: '', trustCert: true }

export function ConnectionFixDialog({ request, profiles, onClose, onSaved }: {
  request: FixRequest | null
  profiles: SqlProfile[]
  onClose: () => void
  onSaved: (p: SqlProfile, request: FixRequest) => void
}): JSX.Element {
  const profile = request?.profileId ? profiles.find((p) => p.id === request.profileId) ?? null : null
  const [d, setD] = useState<SqlProfileDraft>(EMPTY)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<SqlTestResult | null>(null)
  const [touched, setTouched] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState(false)

  useEffect(() => {
    if (!request) return
    setD(profile
      ? { id: profile.id, name: profile.name, server: profile.server, database: profile.database, auth: profile.auth, user: profile.user, tag: profile.tag, trustCert: profile.trustCert }
      : EMPTY)
    setShow(false); setTest(null); setBusy(false); setTouched(false); setExpanded(false); setDetail(false)
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!request || (request.reason !== 'new' && !profile)) return <Modal open={false} onClose={onClose} />

  const reason = request.reason
  const full = reason === 'edit' || reason === 'new' || expanded
  const set = (patch: Partial<SqlProfileDraft>): void => { setD((x) => ({ ...x, ...patch })); setTest(null) }
  const errors = validateDraft(d, !!profile?.hasPassword)
  const valid = Object.keys(errors).length === 0
  const payload = (): SqlProfileDraft => ({ ...d, password: d.password ? d.password : undefined })

  const save = async (skipTest: boolean): Promise<void> => {
    setTouched(true)
    if (!valid || busy) return
    setBusy(true)
    try {
      if (!skipTest) {
        const r = await window.api.invoke<SqlTestResult>('sql:test', payload())
        setTest(r)
        if (!r.ok) return
      }
      const saved = await window.api.invoke<SqlProfile>('sql:save', payload())
      onSaved(saved, request)
    } catch (e) {
      setTest({ ok: false, detail: cleanErr(e), at: Date.now() })
    } finally {
      setBusy(false)
    }
  }

  const quick = reason === 'auth' || reason === 'server'
  const fe = quick ? friendlyError(request.error, reason) : null
  const title = reason === 'new' ? 'Nueva conexión' : quick ? profile!.name : `Editar ${profile!.name}`
  const subtitle = quick ? (reason === 'auth' ? 'Poné la contraseña nueva y se guarda en la conexión.' : 'Corregí el servidor y se guarda en la conexión.')
    : 'Se guarda cifrada en esta PC, junto a las de Conexiones → Bases de datos.'
  const err = (k: keyof typeof errors): string | undefined => (touched ? errors[k] : undefined)
  const input = 'ui-input w-full h-[34px] font-mono text-[12.5px]'
  const { host, port } = splitServer(d.server)
  const ring = (on: boolean): string => (on ? 'ring-2 ring-primary/30' : '')

  const passwordField = (
    <Field label={reason === 'auth' ? 'Nueva contraseña' : 'Contraseña'} hint={err('password') ?? (profile?.hasPassword ? 'Vacía = dejar la guardada' : undefined)}>
      <div className="relative">
        <KeyRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input type={show ? 'text' : 'password'} value={d.password ?? ''} onChange={(e) => set({ password: e.target.value })} autoFocus={reason === 'auth'}
          autoComplete="new-password" spellCheck={false} className={`${input} pl-8 pr-9 ${ring(reason === 'auth')}`} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar' : 'Mostrar'}
          className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-[6px] text-on-surface-variant hover:bg-on-surface/6">
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </Field>
  )

  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle} width={full ? 520 : 460}
      footer={(
        <>
          {test && !test.ok && (
            <button type="button" className="ui-btn ui-btn-ghost mr-auto" disabled={busy || !valid} onClick={() => void save(true)}
              title="Guardar aunque la prueba falle (p. ej. si ahora no tenés VPN)">Guardar igual</button>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => void save(false)}>
            {busy ? 'Probando…' : request.retry && !full ? 'Probar, guardar y reintentar' : 'Probar y guardar'}
          </button>
        </>
      )}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); void save(false) }}>
        {fe && (
          <div className="flex items-start gap-3 rounded-[12px] ring-1 ring-error/20 bg-error/[0.05] p-3">
            <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-error/12 text-error shrink-0">{reason === 'auth' ? <KeyRound size={16} /> : <Unplug size={16} />}</span>
            <div className="flex-1 min-w-0">
              <p className="t-body font-semibold text-on-surface">{fe.title}</p>
              <p className="t-caption text-on-surface-variant">{fe.hint}</p>
              {request.error && (
                <button type="button" onClick={() => setDetail((v) => !v)} className="t-caption text-on-surface-variant/80 hover:text-on-surface hover:underline underline-offset-2 mt-1">
                  {detail ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              )}
              {detail && <p className="mt-1.5 rounded-[8px] bg-on-surface/5 px-2.5 py-2 font-mono text-[11px] leading-[16px] text-on-surface-variant break-words">{request.error}</p>}
            </div>
          </div>
        )}
        {full && (
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="Nombre" hint={err('name')}>
              <input value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder="Cliente Mesas" className="ui-input w-full h-[34px] text-[13px]" />
            </Field>
            <Field label="Etiqueta">
              <input value={d.tag} onChange={(e) => set({ tag: e.target.value })} placeholder="Prod, QA, LPS…" className="ui-input w-full h-[34px] text-[13px]" />
            </Field>
          </div>
        )}
        <div className={full ? 'grid grid-cols-[1fr_160px] gap-3' : ''}>
          <Field label={reason === 'server' && !expanded ? 'Servidor nuevo (IP o nombre)' : 'Servidor'} hint={err('server') ?? (full ? undefined : 'Con instancia si hace falta: 10.0.0.5\\SQL2019. El puerto va aparte.')}>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Plug size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input value={host} onChange={(e) => set({ server: serverFromHostInput(e.target.value, port) })} spellCheck={false} autoFocus={reason === 'server'}
                  placeholder="10.0.0.5" className={`${input} pl-8 ${ring(reason === 'server')}`} />
              </div>
              <input value={port} onChange={(e) => set({ server: joinServer(host, e.target.value.replace(/\D/g, '')) })} inputMode="numeric" spellCheck={false}
                placeholder="Puerto" aria-label="Puerto" title="Puerto (vacío: el de siempre, 1433)" className={`${input} w-[84px]! text-center`} />
            </div>
          </Field>
          {full && (
            <Field label="Base">
              <input value={d.database} onChange={(e) => set({ database: e.target.value })} spellCheck={false} placeholder="opcional" className={input} />
            </Field>
          )}
        </div>
        {full && (
          <div className="flex items-center justify-between gap-3">
            <span className="t-footnote font-medium text-on-surface-variant">Autenticación</span>
            <SegmentedControl<SqlAuth> value={d.auth} onChange={(auth) => set({ auth })}
              options={[{ value: 'sql', label: 'SQL Server' }, { value: 'windows', label: 'Windows' }]} />
          </div>
        )}
        {d.auth === 'sql' ? (
          <div className={full ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3.5'}>
            <Field label="Usuario" hint={err('user')}>
              <input value={d.user} onChange={(e) => set({ user: e.target.value })} spellCheck={false} className={input} />
            </Field>
            {passwordField}
          </div>
        ) : !full && <p className="t-footnote text-on-surface-variant">Usa autenticación de Windows (tu usuario de dominio).</p>}
        {full && (
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>
              <span className="block t-footnote font-medium text-on-surface">Confiar en el certificado del servidor</span>
              <span className="block t-caption text-on-surface-variant">Necesario en la mayoría de los servidores internos</span>
            </span>
            <Toggle checked={d.trustCert} onChange={(v) => set({ trustCert: v })} label="Confiar en el certificado" />
          </label>
        )}
        {test && (test.ok
          ? <p className="flex items-center gap-1.5 t-footnote text-success"><span className="w-1.5 h-1.5 rounded-full bg-success" /> Conecta</p>
          : <p className="flex items-center gap-1.5 t-footnote text-error" title={test.detail}><span className="w-1.5 h-1.5 rounded-full bg-error" /> Sigue sin conectar: {friendlyError(test.detail, null).title === 'Algo falló' ? test.detail.slice(0, 90) : friendlyError(test.detail, null).title.toLowerCase()}</p>)}
        {quick && !expanded && (
          <button type="button" onClick={() => setExpanded(true)} className="self-start flex items-center gap-1.5 t-footnote text-on-surface-variant hover:text-on-surface">
            <SlidersHorizontal size={12} /> Editar todo (base, usuario, autenticación…)
          </button>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
