import { useEffect, useState } from 'react'
import { CircleAlert, Eye, EyeOff, KeyRound, Plug } from 'lucide-react'
import { Modal } from '../../core/components/Modal'
import { Field } from '../../core/components/Form'
import type { SqlProfile, SqlProfileDraft, SqlTestResult } from '../connections/sql'

/**
 * Cuando una consulta no puede conectar (contraseña vencida, IP que cambió…), se abre
 * esto en el momento: corregís el dato, se prueba y se guarda en la conexión, y la
 * consulta se vuelve a ejecutar sola. También sirve para editar la conexión desde Consultas.
 */
export type FixReason = 'auth' | 'server' | 'edit'

export interface FixRequest {
  profileId: string
  reason: FixReason
  error?: string
  /** Lo que hay que volver a intentar después de guardar */
  retry?: () => void
}

const cleanErr = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function ConnectionFixDialog({ request, profiles, onClose, onSaved }: {
  request: FixRequest | null
  profiles: SqlProfile[]
  onClose: () => void
  onSaved: (p: SqlProfile, retry?: () => void) => void
}): JSX.Element {
  const profile = request ? profiles.find((p) => p.id === request.profileId) ?? null : null
  const [server, setServer] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<SqlTestResult | null>(null)

  useEffect(() => {
    if (!profile) return
    setServer(profile.server); setUser(profile.user); setPassword(''); setShow(false); setTest(null); setBusy(false)
  }, [request]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!request || !profile) return <Modal open={false} onClose={onClose} />

  const sqlAuth = profile.auth === 'sql'
  const reason = request.reason
  const draft = (): SqlProfileDraft => ({
    id: profile.id, name: profile.name, server: server.trim(), database: profile.database, auth: profile.auth,
    user: user.trim(), tag: profile.tag, trustCert: profile.trustCert, password: password ? password : undefined,
  })
  const changed = server.trim() !== profile.server || user.trim() !== profile.user || !!password
  const canSave = !!server.trim() && (!sqlAuth || (!!user.trim() && (profile.hasPassword || !!password)))

  const save = async (skipTest: boolean): Promise<void> => {
    if (!canSave || busy) return
    setBusy(true)
    try {
      if (!skipTest) {
        const r = await window.api.invoke<SqlTestResult>('sql:test', draft())
        setTest(r)
        if (!r.ok) return
      }
      const saved = await window.api.invoke<SqlProfile>('sql:save', draft())
      onSaved(saved, request.retry)
    } catch (e) {
      setTest({ ok: false, detail: cleanErr(e), at: Date.now() })
    } finally {
      setBusy(false)
    }
  }

  const title = reason === 'auth' ? `${profile.name}: la contraseña no funciona`
    : reason === 'server' ? `${profile.name}: no se llega al servidor`
      : `Conexión ${profile.name}`
  const subtitle = reason === 'auth' ? 'Puede haber vencido o cambiado. Poné la nueva y se guarda en la conexión.'
    : reason === 'server' ? '¿Cambió la IP, el nombre o la instancia? Corregilo y se guarda en la conexión.'
      : 'Los cambios se guardan en Conexiones → Bases de datos.'

  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle} width={460}
      footer={(
        <>
          {test && !test.ok && changed && (
            <button type="button" className="ui-btn ui-btn-ghost mr-auto" disabled={busy || !canSave} onClick={() => void save(true)}
              title="Guardar aunque la prueba falle (p. ej. si ahora no tenés VPN)">Guardar igual</button>
          )}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !canSave} onClick={() => void save(false)}>
            {busy ? 'Probando…' : request.retry ? 'Probar, guardar y reintentar' : 'Probar y guardar'}
          </button>
        </>
      )}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); void save(false) }}>
        {request.error && (
          <p className="flex items-start gap-2 rounded-[9px] bg-error/8 px-3 py-2 t-footnote text-on-surface">
            <CircleAlert size={14} className="text-error mt-px shrink-0" />
            <span className="min-w-0 break-words">{request.error}</span>
          </p>
        )}
        <Field label="Servidor" hint="IP o nombre, con instancia o puerto si hace falta: 10.0.0.5\SQL2019 o 10.0.0.5,1433">
          <div className="relative">
            <Plug size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input value={server} onChange={(e) => setServer(e.target.value)} spellCheck={false} autoFocus={reason === 'server'}
              className={`ui-input w-full h-[34px] pl-8 font-mono text-[12.5px] ${reason === 'server' ? 'ring-2 ring-primary/30' : ''}`} />
          </div>
        </Field>
        {sqlAuth ? (
          <>
            <Field label="Usuario">
              <input value={user} onChange={(e) => setUser(e.target.value)} spellCheck={false} className="ui-input w-full h-[34px] font-mono text-[12.5px]" />
            </Field>
            <Field label={reason === 'auth' ? 'Nueva contraseña' : 'Contraseña'} hint={profile.hasPassword ? 'Vacía = dejar la guardada' : undefined}>
              <div className="relative">
                <KeyRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={reason === 'auth'}
                  autoComplete="new-password" spellCheck={false}
                  className={`ui-input w-full h-[34px] pl-8 pr-9 font-mono text-[12.5px] ${reason === 'auth' ? 'ring-2 ring-primary/30' : ''}`} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar' : 'Mostrar'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-[6px] text-on-surface-variant hover:bg-on-surface/6">
                  {show ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </Field>
          </>
        ) : <p className="t-footnote text-on-surface-variant">Usa autenticación de Windows (tu usuario de dominio).</p>}
        {test && (
          <p className={`t-footnote ${test.ok ? 'text-success' : 'text-error'}`}>{test.ok ? test.detail : `No conecta: ${test.detail}`}</p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
