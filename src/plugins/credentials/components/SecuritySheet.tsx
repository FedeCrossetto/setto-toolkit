import { useEffect, useState } from 'react'
import { Sheet } from '../../../core/components/Modal'
import { Field, Toggle } from '../../../core/components/Form'
import { SegmentedControl } from '../../../core/components/SegmentedControl'
import { useToast } from '../../../core/components/Toast'
import type { LockStatus } from '../types'
import { credentialsApi } from '../data'

const MINUTE_OPTIONS = ['1', '5', '15', '30', '60'] as const

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

/** "Pedir PIN para ver contraseñas" (off by default) + duration + lock now. */
export function SecuritySheet({
  open, status, onClose, onChange,
}: {
  open: boolean
  status: LockStatus | null
  onClose: () => void
  onChange: (s: LockStatus) => void
}): JSX.Element {
  const { show: toast } = useToast()
  const [mode, setMode] = useState<'idle' | 'enable' | 'change' | 'disable'>('idle')
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setMode('idle'); setCurrentPin(''); setPin(''); setPin2(''); setError(null) }
  }, [open])

  const enabled = !!status?.pinEnabled
  const minutes = String(status?.minutes ?? 5)
  const digits = (v: string): string => v.replace(/\D/g, '').slice(0, 12)

  const run = async (fn: () => Promise<LockStatus>, ok: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onChange(await fn())
      toast(ok, 'success', 2200)
      setMode('idle'); setCurrentPin(''); setPin(''); setPin2('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (): void => {
    if (mode === 'disable') {
      void run(() => credentialsApi.setPin({ pin: null, currentPin }), 'PIN desactivado')
      return
    }
    if (pin.length < 4) { setError('El PIN tiene que tener entre 4 y 12 números'); return }
    if (pin !== pin2) { setError('Los PIN no coinciden'); return }
    void run(
      () => credentialsApi.setPin({ pin, currentPin: mode === 'change' ? currentPin : undefined, minutes: Number(minutes) }),
      mode === 'change' ? 'PIN actualizado' : 'PIN activado',
    )
  }

  const pinInput = (value: string, set: (v: string) => void, label: string, autoFocus = false): JSX.Element => (
    <Field label={label}>
      <input
        autoFocus={autoFocus}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="ui-input w-full tabular-nums tracking-[0.3em]"
        value={value}
        onChange={(e) => { set(digits(e.target.value)); setError(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
      />
    </Field>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Seguridad"
      subtitle="Las contraseñas se guardan cifradas con el almacenamiento seguro del sistema; solo esta computadora puede descifrarlas."
      footer={mode !== 'idle' ? (
        <>
          <button className="ui-btn ui-btn-outline" onClick={() => setMode('idle')}>Cancelar</button>
          <button className={`ui-btn ${mode === 'disable' ? 'ui-btn-danger' : 'ui-btn-primary'}`} onClick={submit} disabled={busy}>
            {mode === 'disable' ? 'Desactivar PIN' : 'Guardar PIN'}
          </button>
        </>
      ) : undefined}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="t-body font-medium text-on-surface">Pedir PIN para ver contraseñas</p>
            <p className="t-footnote text-on-surface-variant mt-0.5">
              Para mostrar, copiar o exportar contraseñas. Se vuelve a bloquear tras unos minutos sin uso o fuera de la app.
            </p>
          </div>
          <Toggle
            checked={enabled || mode === 'enable'}
            onChange={(v) => setMode(v ? (enabled ? 'idle' : 'enable') : (enabled ? 'disable' : 'idle'))}
            label="Pedir PIN para ver contraseñas"
          />
        </div>

        {mode === 'enable' && (
          <div className="flex flex-col gap-3">
            {pinInput(pin, setPin, 'PIN nuevo (4 a 12 números)', true)}
            {pinInput(pin2, setPin2, 'Repetí el PIN')}
          </div>
        )}
        {mode === 'change' && (
          <div className="flex flex-col gap-3">
            {pinInput(currentPin, setCurrentPin, 'PIN actual', true)}
            {pinInput(pin, setPin, 'PIN nuevo')}
            {pinInput(pin2, setPin2, 'Repetí el PIN nuevo')}
          </div>
        )}
        {mode === 'disable' && pinInput(currentPin, setCurrentPin, 'PIN actual', true)}
        {error && <p className="t-footnote text-error" role="alert">{error}</p>}

        {enabled && mode === 'idle' && (
          <>
            <Field label="Bloquear después de (minutos)">
              <SegmentedControl
                options={MINUTE_OPTIONS.map((m) => ({ value: m, label: m }))}
                value={(MINUTE_OPTIONS as readonly string[]).includes(minutes) ? minutes as typeof MINUTE_OPTIONS[number] : '5'}
                onChange={(m) => void run(() => credentialsApi.setPin({ minutes: Number(m) }), 'Ajuste guardado')}
              />
            </Field>
            <div className="flex gap-2">
              <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => setMode('change')}>Cambiar PIN</button>
              <button
                className="ui-btn ui-btn-outline ui-btn-sm"
                onClick={() => void run(() => credentialsApi.lock(), 'Claves bloqueadas')}
                disabled={!status?.unlocked}
              >
                Bloquear ahora
              </button>
            </div>
          </>
        )}

        <div className="hairline-t pt-4 t-footnote text-on-surface-variant flex flex-col gap-1.5">
          <p>El portapapeles se limpia solo 30 s después de copiar una contraseña.</p>
          <p>Una contraseña visible se vuelve a ocultar a los 20 s.</p>
        </div>
      </div>
    </Sheet>
  )
}
