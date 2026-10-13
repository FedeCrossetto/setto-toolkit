import { useEffect } from 'react'
import { useApp } from './AppContext'

/**
 * Notificaciones nativas del sistema (vía main: `app:notify`). Respeta Ajustes →
 * Notificaciones. Al hacer clic, main trae la ventana y emite
 * `app:notification-click` con la acción; `useNotificationClicks` la abre.
 */
export interface NotifyAction {
  pluginId: string
  /** Si viene, se manda como intent (OPEN_WITH_INTENT); si no, sólo se abre el módulo. */
  action?: string
  payload?: unknown
}

export const NOTIFICATIONS_SETTING = 'app.notifications'

export async function notificationsEnabled(): Promise<boolean> {
  try {
    return (await window.api.invoke<string | null>('settings:get', NOTIFICATIONS_SETTING)) !== '0'
  } catch {
    return true
  }
}

export async function notify(title: string, body?: string, action?: NotifyAction): Promise<boolean> {
  if (!(await notificationsEnabled())) return false
  try {
    const r = await window.api.invoke<{ ok: boolean }>('app:notify', { title, body, action })
    return r.ok
  } catch {
    return false
  }
}

/** Montar una vez en el shell. */
export function useNotificationClicks(): void {
  const { dispatch } = useApp()
  useEffect(() => {
    return window.api.on('app:notification-click', (raw) => {
      const a = raw as NotifyAction | undefined
      if (!a || typeof a.pluginId !== 'string') return
      if (a.action) dispatch({ type: 'OPEN_WITH_INTENT', pluginId: a.pluginId, action: a.action, payload: a.payload })
      else dispatch({ type: 'OPEN_TAB', pluginId: a.pluginId })
    })
  }, [dispatch])
}

// ── Avisos ya enviados (para no repetir) ─────────────────────────────────────

const SENT_KEY = 'notify:sent'
const SENT_MAX = 300

export function wasSent(key: string): boolean {
  try { return (JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]') as string[]).includes(key) } catch { return false }
}

export function markSent(key: string): void {
  try {
    const list = (JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]') as string[]).filter((k) => k !== key)
    list.push(key)
    localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(-SENT_MAX)))
  } catch { /* sin storage: puede repetirse, no es grave */ }
}
