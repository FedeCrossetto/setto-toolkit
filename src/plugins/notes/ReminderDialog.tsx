import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Modal } from '../../core/components/Modal'
import { reminderPresets } from './reminders'

const pad = (n: number): string => String(n).padStart(2, '0')
/** Valor para <input type="datetime-local"> en hora local. */
const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export function formatReminder(at: number): string {
  const d = new Date(at)
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `hoy ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `mañana ${time}`
  return `${d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

/** "Recordarme…": presets rápidos o fecha y hora a elección. */
export function ReminderDialog({ open, noteTitle, current, onClose, onSet, onClear }: {
  open: boolean
  noteTitle: string
  current?: number
  onClose: () => void
  onSet: (at: number) => void
  onClear: () => void
}): JSX.Element | null {
  const [custom, setCustom] = useState('')
  useEffect(() => {
    if (open) setCustom(toLocalInput(new Date(current ?? Date.now() + 60 * 60_000)))
  }, [open, current])

  const customAt = custom ? new Date(custom).getTime() : NaN
  const customValid = Number.isFinite(customAt) && customAt > Date.now()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recordarme esta nota"
      subtitle={noteTitle}
      width={400}
      footer={
        <>
          {current && <button type="button" className="ui-btn ui-btn-ghost text-error mr-auto" onClick={onClear}>Quitar recordatorio</button>}
          <button type="button" className="ui-btn ui-btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={!customValid} onClick={() => onSet(customAt)}>Guardar</button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {reminderPresets(new Date()).map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onSet(p.at.getTime())}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-on-surface/[0.05] transition-colors"
          >
            <Bell size={14} className="text-primary shrink-0" />
            <span className="t-body text-on-surface flex-1">{p.label}</span>
            <span className="t-footnote text-on-surface-variant">{formatReminder(p.at.getTime())}</span>
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 mt-3">
        <span className="t-footnote font-medium text-on-surface-variant">Otra fecha y hora</span>
        <input type="datetime-local" className="ui-input" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </label>
      <p className="t-caption text-on-surface-variant mt-3">
        Llega como notificación del sistema mientras Setto esté abierto (o en la bandeja).
      </p>
    </Modal>
  )
}
