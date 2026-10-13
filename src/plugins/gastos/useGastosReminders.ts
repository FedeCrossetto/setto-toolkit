import { useEffect } from 'react'
import { markSent, notify, wasSent } from '../../core/notify'
import { dueReminders } from './reminders'
import { loadGastosSnapshot } from './summary'

const FIRST_CHECK_MS = 15_000
const EVERY_MS = 30 * 60_000
/** Sin avisos de madrugada: se reintentan en el próximo chequeo dentro del horario. */
const QUIET = { from: 22, to: 8 }

/** Avisos de vencimientos de Gastos mientras la app está abierta (o en la bandeja). */
export function useGastosReminders(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const check = async (): Promise<void> => {
      const now = new Date()
      if (now.getHours() >= QUIET.from || now.getHours() < QUIET.to) return
      const snap = await loadGastosSnapshot().catch(() => null)
      if (!snap || stopped) return
      for (const r of dueReminders(snap.data, snap.prefs.diasVencimiento ?? {}, now)) {
        if (stopped || wasSent(r.key)) continue
        if (await notify(r.title, r.body, { pluginId: 'gastos' })) markSent(r.key)
      }
    }
    const first = setTimeout(() => { void check() }, FIRST_CHECK_MS)
    const every = setInterval(() => { void check() }, EVERY_MS)
    return () => { stopped = true; clearTimeout(first); clearInterval(every) }
  }, [enabled])
}
