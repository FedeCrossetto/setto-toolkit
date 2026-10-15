import { useState, useEffect, useCallback } from 'react'
import { Trash2, Terminal, RefreshCw } from 'lucide-react'
import type { TerminalSession } from './types'

interface Props {
  onNewSession: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function duration(start: string, end?: string): string {
  try {
    const ms = new Date(end ?? new Date().toISOString()).getTime() - new Date(start).getTime()
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s} s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min ${s % 60} s`
    return `${Math.floor(m / 60)} h ${m % 60} min`
  } catch {
    return '—'
  }
}

export function SessionHistoryPanel({ onNewSession }: Props): JSX.Element {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    window.api.invoke<TerminalSession[]>('terminal:sessions-get')
      .then((s) => setSessions(s))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const deleteSession = async (id: string): Promise<void> => {
    await window.api.invoke('terminal:session-delete', id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 hairline-b shrink-0">
        <span className="t-headline text-on-surface">Historial</span>
        <div className="flex items-center gap-1">
          <button onClick={load} className="ui-btn ui-btn-ghost ui-btn-icon" title="Actualizar" aria-label="Actualizar">
            <RefreshCw size={13} />
          </button>
          <button onClick={onNewSession} className="ui-btn ui-btn-outline ui-btn-sm">
            <Terminal size={12} />
            Nueva sesión
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 t-footnote text-on-surface-variant">
            Cargando…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Terminal size={22} className="text-on-surface-variant/40" strokeWidth={1.5} />
            <span className="t-footnote text-on-surface-variant">Todavía no hay sesiones</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-on-surface/5 transition-colors"
              >
                {/* Status dot */}
                <div
                  title={!s.closedAt ? 'Activa' : s.exitCode === 0 ? 'Terminó bien' : s.exitCode == null ? 'Cerrada' : `Salió con código ${s.exitCode}`}
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    !s.closedAt
                      ? 'bg-primary'
                      : s.exitCode === 0
                        ? 'bg-success'
                        : s.exitCode == null
                          ? 'bg-on-surface-variant/40'
                          : 'bg-error'
                  }`}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="t-body font-medium truncate text-on-surface">
                      {s.shell.split(/[/\\]/).pop() ?? s.shell}
                    </span>
                    {!s.closedAt && <span className="ui-badge ui-badge-primary">activa</span>}
                  </div>
                  <div className="t-caption truncate text-on-surface-variant mt-0.5" title={s.cwd}>
                    {s.cwd}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 t-caption text-on-surface-variant/70 tabular-nums">
                    <span>{formatDate(s.createdAt)}</span>
                    {s.closedAt && <span>{duration(s.createdAt, s.closedAt)}</span>}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteSession(s.id)}
                  className="ui-btn ui-btn-ghost ui-btn-icon opacity-0 group-hover:opacity-100"
                  title="Eliminar del historial"
                  aria-label="Eliminar del historial"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
