/**
 * Local mode for Claves (pure). Without Supabase (not configured, or the user
 * chose `app.local_only`), credentials live only in this computer's vault:
 * no sync retries, no "offline" warnings, just a calm "Solo en esta computadora".
 */
import type { CredentialsListResult } from './types'

/** `app.local_only` setting: '1' / 'true' turn local mode on. */
export function localOnlySetting(value: string | null | undefined): boolean {
  return value === '1' || value === 'true'
}

export type SyncTone = 'success' | 'muted' | 'error'

export interface SyncView {
  kind: 'synced' | 'offline' | 'error' | 'local'
  text: string
  sub: string
  tone: SyncTone
  /** Show the "Reintentar" button and retry periodically. */
  retry: boolean
}

/** What the footer shows for a list result. `rel` formats a timestamp ("hace 5 min"). */
export function syncView(data: Pick<CredentialsListResult, 'status' | 'syncedAt' | 'pendingCount' | 'error'>, rel: (ts: number) => string): SyncView {
  const pending = data.pendingCount
  const pendingText = pending ? `${pending} ${pending === 1 ? 'cambio pendiente' : 'cambios pendientes'}` : ''
  switch (data.status) {
    case 'local':
      return { kind: 'local', text: 'Solo en esta computadora', sub: 'No se suben a ningún servidor', tone: 'muted', retry: false }
    case 'synced':
      return { kind: 'synced', text: 'Sincronizado', sub: pendingText || (data.syncedAt ? rel(data.syncedAt) : ''), tone: 'success', retry: pending > 0 }
    case 'offline':
      return {
        kind: 'offline', text: 'Sin conexión — mostrando copia local',
        sub: pendingText || (data.syncedAt ? `Última sincronización: ${rel(data.syncedAt)}` : 'Nunca se sincronizó'),
        tone: 'muted', retry: true,
      }
    default:
      return { kind: 'error', text: 'Error al sincronizar', sub: pendingText || (data.error ?? ''), tone: 'error', retry: true }
  }
}

/** Whether the module should keep retrying the sync (never in local mode). */
export function needsSync(data: Pick<CredentialsListResult, 'status' | 'pendingCount'> | null): boolean {
  if (!data || data.status === 'local') return false
  return data.status !== 'synced' || data.pendingCount > 0
}
