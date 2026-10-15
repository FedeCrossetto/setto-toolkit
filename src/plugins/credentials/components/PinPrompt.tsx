import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { Modal } from '../../../core/components/Modal'
import { credentialsApi } from '../data'

/** Asks for the PIN; resolves `onDone(true)` once main accepted it. */
export function PinPrompt({ open, onDone }: { open: boolean; onDone: (ok: boolean) => void }): JSX.Element {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setPin(''); setError(null); setBusy(false) }
  }, [open])

  const submit = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault()
    if (!pin || busy) return
    setBusy(true)
    try {
      const r = await credentialsApi.verifyPin(pin)
      if (r.ok) { onDone(true); return }
      setPin('')
      setError(r.retryInMs ? `Demasiados intentos. Probá de nuevo en ${Math.ceil(r.retryInMs / 1000)} s.` : 'PIN incorrecto')
    } catch {
      setError('No se pudo verificar el PIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => onDone(false)}
      width={360}
      footer={
        <>
          <button className="ui-btn ui-btn-outline" onClick={() => onDone(false)}>Cancelar</button>
          <button className="ui-btn ui-btn-primary" onClick={() => void submit()} disabled={!pin || busy}>Desbloquear</button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="pt-6 flex flex-col items-center text-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-selected text-primary">
          <Lock size={19} weight="fill" />
        </div>
        <div>
          <p className="t-headline text-on-surface">Credenciales bloqueadas</p>
          <p className="t-footnote text-on-surface-variant mt-1">Ingresá tu PIN para ver o copiar contraseñas.</p>
        </div>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 12)); setError(null) }}
          className="ui-input w-40 text-center tabular-nums tracking-[0.3em]"
          aria-label="PIN"
        />
        <p className="t-caption text-error min-h-[16px]" role="alert">{error ?? ''}</p>
      </form>
    </Modal>
  )
}
