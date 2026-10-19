import { useEffect, useState } from 'react'
import { Check, CloudCheck, Copy, Lock, Monitor, RefreshCw, TriangleAlert } from 'lucide-react'
import { Sheet, useConfirm } from '../../../core/components/Modal'
import { Field, Toggle } from '../../../core/components/Form'
import { useToast } from '../../../core/components/Toast'
import type { E2EResult, E2EStatus } from '../types'
import { credentialsApi, copyToClipboard, relativeTime } from '../data'
import { estimateStrength } from '../strength'
import { e2eSummary, masterPasswordProblem } from '../e2e-view'
import { MIGRATION_004_SQL } from '../e2e-migration'
import { StrengthMeter } from './StrengthMeter'

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

type Mode = 'idle' | 'setup' | 'change'

const TONE = { success: 'text-success', muted: 'text-on-surface-variant', warning: 'text-warning', error: 'text-error' } as const

/**
 * "Sincronizar contraseñas entre computadoras": end-to-end encrypted with a
 * master password. Setup, unlock, change, disable — all the crypto is in main.
 */
export function SyncSheet({
  open, status, onClose, onChange,
}: {
  open: boolean
  status: E2EStatus | null
  onClose: () => void
  /** New status after an operation; `changed` = passwords came down / went up (reload the list). */
  onChange: (s: E2EStatus, changed: boolean) => void
}): JSX.Element {
  const { show: toast } = useToast()
  const confirm = useConfirm()
  const [mode, setMode] = useState<Mode>('idle')
  const [current, setCurrent] = useState('')
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [remember, setRemember] = useState(true)
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = (): void => { setMode('idle'); setCurrent(''); setPwd(''); setPwd2(''); setUnderstood(false); setError(null) }
  useEffect(() => { if (open) { reset(); setRemember(status?.remembered ?? true) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<E2EResult>, ok: (r: E2EResult) => string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      onChange(r.status, !!(r.pulled || r.pushed))
      if (!r.ok) { setError(r.error ?? 'No se pudo completar'); return }
      toast(ok(r), 'success', 3000)
      reset()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const refresh = async (): Promise<void> => {
    setBusy(true)
    try { onChange(await credentialsApi.e2eStatus(), false) } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  const state = status?.state ?? 'off'
  const problem = mode !== 'idle' ? masterPasswordProblem(pwd, pwd2) : null
  const counted = (r: E2EResult): string => {
    const parts = [r.pulled ? `${r.pulled} traídas` : '', r.pushed ? `${r.pushed} subidas` : ''].filter(Boolean)
    return parts.length ? parts.join(', ') : 'todo al día'
  }

  const submit = (): void => {
    if (busy) return
    if (mode === 'setup') {
      if (problem) { setError(problem); return }
      if (!understood) { setError('Confirmá que entendés que no se puede recuperar'); return }
      void run(() => credentialsApi.e2eSetup(pwd, remember), (r) => `Sincronización activada (${counted(r)})`)
    } else if (mode === 'change') {
      if (!current) { setError('Ingresá la contraseña maestra actual'); return }
      if (problem) { setError(problem); return }
      void run(() => credentialsApi.e2eChange(current, pwd), () => 'Contraseña maestra cambiada')
    } else if (state === 'locked') {
      if (!current) return
      void run(() => credentialsApi.e2eUnlock(current, remember), (r) => `Sincronización desbloqueada (${counted(r)})`)
    }
  }

  const disable = async (): Promise<void> => {
    const ok = await confirm({
      title: '¿Desactivar la sincronización de contraseñas?',
      message: (
        <>
          Se borran de Supabase <strong>todas las copias cifradas</strong> y la contraseña maestra deja de servir.
          Cada computadora conserva las contraseñas que ya tiene; las que estén sólo en la nube se pierden.
        </>
      ),
      confirmLabel: 'Desactivar y borrar copias',
      destructive: true,
    })
    if (ok) void run(() => credentialsApi.e2eDisable(), () => 'Sincronización desactivada')
  }

  const pwdInput = (value: string, set: (v: string) => void, label: string, autoFocus = false): JSX.Element => (
    <Field label={label}>
      <input
        autoFocus={autoFocus}
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        className="ui-input w-full"
        value={value}
        maxLength={1024}
        onChange={(e) => { set(e.target.value); setError(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
      />
    </Field>
  )

  const newPasswordFields = (autoFocus: boolean): JSX.Element => (
    <>
      {pwdInput(pwd, setPwd, mode === 'change' ? 'Contraseña maestra nueva' : 'Contraseña maestra', autoFocus)}
      {pwd && <StrengthMeter score={estimateStrength(pwd).score} />}
      {pwdInput(pwd2, setPwd2, 'Repetila')}
    </>
  )

  const rememberRow = (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <p className="t-body text-on-surface">Recordar en esta computadora</p>
        <p className="t-footnote text-on-surface-variant mt-0.5">Guarda la clave protegida por el sistema para no pedirla en cada inicio.</p>
      </div>
      <Toggle checked={remember} onChange={setRemember} label="Recordar en esta computadora" />
    </div>
  )

  const summary = status ? e2eSummary(status) : null
  const footer = mode !== 'idle' || state === 'locked' ? (
    <>
      {mode !== 'idle' && <button className="ui-btn ui-btn-outline" onClick={reset}>Cancelar</button>}
      <button className="ui-btn ui-btn-primary" onClick={submit} disabled={busy}>
        {busy ? 'Procesando…' : mode === 'setup' ? 'Activar sincronización' : mode === 'change' ? 'Cambiar contraseña maestra' : 'Desbloquear'}
      </button>
    </>
  ) : undefined

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sincronizar contraseñas"
      subtitle="Entre tus computadoras, cifradas de extremo a extremo con una contraseña maestra. Supabase sólo guarda datos ilegibles."
      footer={footer}
      width={440}
    >
      <div className="flex flex-col gap-5">
        {summary && mode === 'idle' && (
          <div className="flex items-center gap-2.5 rounded-xl hairline px-3.5 py-3">
            {state === 'unlocked' ? <CloudCheck size={16} className={TONE[summary.tone]} />
              : state === 'locked' ? <Lock size={16} className={TONE[summary.tone]} />
              : state === 'local-mode' ? <Monitor size={16} className={TONE[summary.tone]} />
              : <TriangleAlert size={16} className={TONE[summary.tone]} />}
            <div className="flex-1 min-w-0">
              <p className="t-body font-medium text-on-surface">{summary.text}</p>
              {status?.lastSyncAt && (state === 'unlocked' || state === 'locked') && (
                <p className="t-caption text-on-surface-variant">Última sincronización en esta PC: {relativeTime(status.lastSyncAt)}</p>
              )}
            </div>
            {(state === 'offline' || state === 'error' || state === 'migration-missing') && (
              <button className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" onClick={() => void refresh()} disabled={busy} title="Reintentar" aria-label="Reintentar">
                <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        )}

        {state === 'local-mode' && (
          <p className="t-body text-on-surface-variant">
            Claves está en modo local: las contraseñas viven sólo en esta computadora y no se suben a ningún servidor.
            Para sincronizarlas, configurá Supabase en Conexiones (eso sale del modo solo local).
          </p>
        )}

        {state === 'migration-missing' && (
          <div className="flex flex-col gap-2.5">
            <p className="t-body text-on-surface-variant">
              La base de Supabase todavía no tiene la columna ni la tabla para guardar las copias cifradas.
              Corré este SQL en Supabase → SQL Editor (es seguro repetirlo) y tocá Reintentar.
            </p>
            <div className="relative">
              <pre className="max-h-56 overflow-auto rounded-xl hairline bg-surface-container dark:bg-white/4 p-3 pr-10 t-caption font-mono text-on-surface whitespace-pre-wrap">{MIGRATION_004_SQL.trim()}</pre>
              <button
                className="absolute top-1.5 right-1.5 ui-btn ui-btn-ghost ui-btn-icon rounded-lg"
                onClick={() => {
                  copyToClipboard(MIGRATION_004_SQL.trim())
                    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
                    .catch(() => toast('No se pudo copiar', 'error'))
                }}
                title="Copiar SQL"
                aria-label="Copiar SQL"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {state === 'off' && mode === 'idle' && (
          <div className="flex flex-col gap-3">
            <p className="t-body text-on-surface-variant">
              Hoy cada contraseña queda cifrada sólo en la computadora donde la guardaste. Con la sincronización, se suben
              cifradas con tu contraseña maestra y en otra PC aparecen al ingresarla.
            </p>
            <div>
              <button className="ui-btn ui-btn-primary" onClick={() => setMode('setup')}>Configurar contraseña maestra</button>
            </div>
          </div>
        )}

        {mode === 'setup' && (
          <div className="flex flex-col gap-3">
            {newPasswordFields(true)}
            <div className="flex items-start gap-2.5 rounded-xl bg-warning/8 px-3.5 py-3">
              <TriangleAlert size={15} className="text-warning mt-px shrink-0" />
              <p className="t-footnote text-on-surface">
                <strong>No se puede recuperar.</strong> Si la olvidás, las copias en la nube no se pueden descifrar
                (las contraseñas de cada computadora siguen ahí). Nadie más la conoce: ni Supabase ni la app.
              </p>
            </div>
            <label className="flex items-center gap-2 t-footnote text-on-surface cursor-pointer">
              <input type="checkbox" checked={understood} onChange={(e) => { setUnderstood(e.target.checked); setError(null) }} />
              Entiendo que no hay forma de recuperarla
            </label>
            {rememberRow}
          </div>
        )}

        {state === 'locked' && mode === 'idle' && (
          <div className="flex flex-col gap-3">
            <p className="t-body text-on-surface-variant">
              La sincronización está activada. Ingresá la contraseña maestra para traer las que faltan acá y subir las nuevas.
            </p>
            {pwdInput(current, setCurrent, 'Contraseña maestra', true)}
            {rememberRow}
          </div>
        )}

        {mode === 'change' && (
          <div className="flex flex-col gap-3">
            {pwdInput(current, setCurrent, 'Contraseña maestra actual', true)}
            {newPasswordFields(false)}
            <p className="t-footnote text-on-surface-variant">
              Se vuelven a cifrar todas con la nueva. Las otras computadoras te la van a pedir de nuevo.
            </p>
          </div>
        )}

        {error && <p className="t-footnote text-error" role="alert">{error}</p>}

        {state === 'unlocked' && mode === 'idle' && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="t-body text-on-surface">Recordar en esta computadora</p>
                <p className="t-footnote text-on-surface-variant mt-0.5">
                  {status?.remembered
                    ? 'La clave está guardada protegida por el sistema; no se pide al iniciar.'
                    : 'Se olvida al bloquear, al suspender la PC o tras unos minutos fuera de la app.'}
                </p>
              </div>
              <Toggle
                checked={!!status?.remembered}
                onChange={(v) => void run(() => credentialsApi.e2eRemember(v), () => (v ? 'Se recuerda en esta computadora' : 'Ya no se recuerda'))}
                label="Recordar en esta computadora"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setMode('change')}>Cambiar contraseña maestra</button>
              {!status?.remembered && (
                <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => void run(() => credentialsApi.e2eLock(), () => 'Sincronización bloqueada')}>
                  <Lock size={12} /> Bloquear
                </button>
              )}
            </div>
          </>
        )}

        {(state === 'unlocked' || state === 'locked') && mode === 'idle' && (
          <div className="hairline-t pt-4 flex flex-col gap-2">
            <p className="t-footnote text-on-surface-variant">
              Desactivarla borra las copias cifradas de Supabase en todas las computadoras.
            </p>
            <div>
              <button className="ui-btn ui-btn-danger ui-btn-sm" onClick={() => void disable()} disabled={busy}>
                Desactivar sincronización
              </button>
            </div>
          </div>
        )}

        <div className="hairline-t pt-4 t-footnote text-on-surface-variant flex flex-col gap-1.5">
          <p>Cifrado AES-256-GCM con una clave derivada de la contraseña maestra (scrypt). La contraseña maestra nunca sale de esta computadora.</p>
          <p>Si una contraseña cambia en dos computadoras, gana la más reciente.</p>
        </div>
      </div>
    </Sheet>
  )
}
