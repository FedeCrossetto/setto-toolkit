import { useCallback, useEffect, useState } from 'react'
import { CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { SettingsGroup, SettingsRow, Toggle } from '../../core/components/Form'
import { useToast } from '../../core/components/Toast'

interface SyncSummary { pushed: number; pulled: number; deleted: number; conflicts: number; skipped: number }
interface SyncStatus {
  enabled: boolean
  configured: boolean
  running: boolean
  lastSync: number | null
  lastError: string | null
  lastSummary: SyncSummary | null
}

function describe(s: SyncSummary): string {
  const parts = [
    s.pushed && `${s.pushed} subidos`,
    s.pulled && `${s.pulled} bajados`,
    s.deleted && `${s.deleted} borrados`,
    s.conflicts && `${s.conflicts} en conflicto`,
    s.skipped && `${s.skipped} para la próxima`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Todo al día'
}

/** Ajustes → Sincronización: Notas y Snippets entre equipos vía Supabase (opcional). */
export function SyncSettings(): JSX.Element {
  const toast = useToast()
  const [st, setSt] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try { setSt(await window.api.invoke<SyncStatus>('sync:status')) } catch { /* sin canal */ }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const toggle = async (on: boolean): Promise<void> => {
    setSt(await window.api.invoke<SyncStatus>('sync:set-enabled', on))
    if (on) void runNow()
  }

  const runNow = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.invoke<{ ok: boolean; summary?: SyncSummary; error?: string }>('sync:run')
      if (r.ok && r.summary) toast.show(`Sincronizado: ${describe(r.summary)}`, 'success')
      else toast.show(r.error ?? 'No se pudo sincronizar', 'error', 6000)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const last = st?.lastSync ? new Date(st.lastSync).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : null

  return (
    <SettingsGroup
      id="ajustes-sync"
      title="Sincronización"
      description="Notas y Snippets entre tus equipos, en el mismo Supabase de Gastos."
      footer={<>Requiere correr una vez <code className="font-mono">supabase/migrations/003_setto_sync.sql</code> en el SQL Editor de Supabase. Si una nota cambió en los dos equipos, se conservan las dos versiones.</>}
    >
      <SettingsRow
        icon={st?.lastError ? CloudOff : CloudCheck}
        title="Sincronizar Notas y Snippets"
        description={!st ? 'Cargando…'
          : !st.configured ? 'Primero configurá Supabase en Conexiones.'
          : st.lastError ? <span className="text-error">{st.lastError}</span>
          : last ? `Última: ${last}${st.lastSummary ? ` · ${describe(st.lastSummary)}` : ''}`
          : st.enabled ? 'Todavía no se sincronizó.' : 'Cada 5 minutos mientras Setto esté abierto.'}
      >
        <div className="flex items-center gap-2.5">
          {st?.enabled && (
            <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" disabled={busy || !st.configured} onClick={() => void runNow()}>
              <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> {busy ? 'Sincronizando…' : 'Ahora'}
            </button>
          )}
          <Toggle checked={!!st?.enabled} disabled={!st?.configured} onChange={(v) => void toggle(v)} label="Sincronizar Notas y Snippets" />
        </div>
      </SettingsRow>
    </SettingsGroup>
  )
}
