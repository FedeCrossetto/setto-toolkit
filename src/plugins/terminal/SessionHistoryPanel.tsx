import { useState, useEffect, useCallback } from 'react'
import { Trash2, Terminal, RefreshCw } from 'lucide-react'
import type { TerminalSession } from './types'

interface Props {
  onNewSession: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
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
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ${s % 60}s`
    return `${Math.floor(m / 60)}h ${m % 60}m`
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <span className="text-[13px] font-semibold text-on-surface">Session History</span>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            className="p-1.5 rounded-md hover:bg-white/[0.07] transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onNewSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
            style={{ background: 'rgb(var(--c-primary))', color: '#fff' }}
          >
            <Terminal size={12} />
            New Session
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Loading…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Terminal size={24} style={{ color: 'rgba(255,255,255,0.15)' }} />
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No sessions yet</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition-colors"
              >
                {/* Status dot */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: !s.closedAt
                      ? 'rgb(var(--c-primary-light))'
                      : s.exitCode === 0
                        ? '#4ade80'
                        : s.exitCode == null
                          ? 'rgba(255,255,255,0.3)'
                          : '#f87171',
                  }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium truncate text-on-surface">
                      {s.shell.split(/[/\\]/).pop() ?? s.shell}
                    </span>
                    {!s.closedAt && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(var(--c-primary-light-rgb),0.15)', color: 'rgb(var(--c-primary-light))' }}>
                        active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {s.cwd}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {formatDate(s.createdAt)}
                    </span>
                    {s.closedAt && (
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {duration(s.createdAt, s.closedAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteSession(s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-white/[0.1] transition-all"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                  title="Delete"
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
