import { useEffect, useState } from 'react'
import { notify } from '../../core/notify'

/**
 * Recordatorios de notas ("recordame el viernes a las 9"). Se guardan en
 * localStorage (por equipo, como el resto de las preferencias de Notas) y los
 * dispara `useNoteReminders`, montado en el shell, con una notificación del
 * sistema que al hacer clic abre la nota.
 */
export interface NoteReminder {
  noteId: string
  title: string
  /** epoch ms */
  at: number
}

const KEY = 'notes:reminders'
const EVENT = 'setto:note-reminders'
const CHECK_MS = 30_000

export function getReminders(): NoteReminder[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((r): r is NoteReminder => !!r && typeof r.noteId === 'string' && typeof r.at === 'number') : []
  } catch {
    return []
  }
}

function save(list: NoteReminder[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* sin storage */ }
  window.dispatchEvent(new Event(EVENT))
}

/** Un recordatorio por nota: setear otro reemplaza al anterior. */
export function setReminder(r: NoteReminder): void {
  save([...getReminders().filter((x) => x.noteId !== r.noteId), r])
}

export function clearReminder(noteId: string): void {
  save(getReminders().filter((x) => x.noteId !== noteId))
}

/** Mapa noteId → recordatorio, actualizado en vivo. */
export function useReminderMap(): Map<string, NoteReminder> {
  const [list, setList] = useState(getReminders)
  useEffect(() => {
    const on = (): void => setList(getReminders())
    window.addEventListener(EVENT, on)
    window.addEventListener('storage', on)
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on) }
  }, [])
  return new Map(list.map((r) => [r.noteId, r]))
}

/** Presets del menú "Recordarme". Exportado para tests. */
export function reminderPresets(now: Date): { label: string; at: Date }[] {
  const at = (d: Date, h: number): Date => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x }
  const inHour = new Date(now.getTime() + 60 * 60_000)
  const tonight = at(now, 20)
  const tomorrow = at(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), 9)
  // Próximo lunes (si hoy es lunes, el de la semana que viene).
  const daysToMon = ((8 - now.getDay()) % 7) || 7
  const monday = at(new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMon), 9)
  return [
    { label: 'En 1 hora', at: inHour },
    ...(tonight.getTime() - now.getTime() > 30 * 60_000 ? [{ label: 'Esta noche (20:00)', at: tonight }] : []),
    { label: 'Mañana a las 9:00', at: tomorrow },
    { label: 'El lunes a las 9:00', at: monday },
  ]
}

/** Montar una vez en el shell: dispara los recordatorios vencidos. */
export function useNoteReminders(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let busy = false
    const check = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const now = Date.now()
        for (const r of getReminders().filter((x) => x.at <= now)) {
          // Se borra antes de avisar: si la notificación falla no queremos un bucle.
          clearReminder(r.noteId)
          await notify(`Recordatorio: ${r.title}`, 'Clic para abrir la nota', { pluginId: 'notes', action: 'open', payload: r.noteId })
        }
      } finally {
        busy = false
      }
    }
    void check()
    const t = setInterval(() => { void check() }, CHECK_MS)
    return () => clearInterval(t)
  }, [enabled])
}
