import { useState, useEffect, useCallback } from 'react'
import type {
  JiraTicket, AnalysisPlan, AnalysisResult, CodeSnippet,
  HistoryEntry, Phase, AnalysisStepUI, DiffChunk,
} from './types'

// ── Config shape ───────────────────────────────────────────────────────────────
interface ConfigValues {
  jiraUrl: string
  jiraUser: string
  jiraToken: string
  repoPath: string
  projectPrefix: string
}

// ── Priority colors ────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string, string> = {
  Highest: 'text-red-400',
  High:    'text-orange-400',
  Medium:  'text-yellow-400',
  Low:     'text-green-400',
  Lowest:  'text-blue-400',
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner(): JSX.Element {
  return (
    <svg className="animate-spin h-4 w-4 text-primary flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Step item ──────────────────────────────────────────────────────────────────
function StepItem({ step }: { step: AnalysisStepUI }): JSX.Element {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-shrink-0 mt-0.5">
        {step.status === 'done'    && <span className="material-symbols-outlined text-green-400" style={{ fontSize: '18px' }}>check_circle</span>}
        {step.status === 'running' && <Spinner />}
        {step.status === 'pending' && <span className="material-symbols-outlined text-on-surface-variant/25" style={{ fontSize: '18px' }}>radio_button_unchecked</span>}
        {step.status === 'error'   && <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-medium ${step.status === 'pending' ? 'text-on-surface-variant/40' : 'text-on-surface'}`}>
          {step.label}
        </div>
        {step.detail && (
          <div className="text-[11px] text-on-surface-variant/60 mt-0.5">{step.detail}</div>
        )}
      </div>
    </div>
  )
}

// ── Diff view ──────────────────────────────────────────────────────────────────
function DiffView({ diff }: { diff: DiffChunk[] }): JSX.Element {
  if (diff.length === 0) return <></>
  return (
    <div className="flex flex-col gap-3 mt-4">
      {diff.map((chunk, i) => (
        <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/20 text-[12px] font-mono">
          <div className="px-3 py-1.5 bg-surface-container/80 text-on-surface-variant/50 text-[11px] border-b border-outline-variant/10 truncate">
            {chunk.file}  ·  line {chunk.lineStart}
          </div>
          <div className="bg-red-500/8 px-3 py-2 whitespace-pre-wrap text-red-300/90 border-b border-outline-variant/10">
            {chunk.original.split('\n').map((l, j) => (
              <div key={j}><span className="select-none text-red-400/40 mr-2">−</span>{l}</div>
            ))}
          </div>
          <div className="bg-green-500/8 px-3 py-2 whitespace-pre-wrap text-green-300/90">
            {chunk.modified.split('\n').map((l, j) => (
              <div key={j}><span className="select-none text-green-400/40 mr-2">+</span>{l}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Ticket header card ─────────────────────────────────────────────────────────
function TicketHeader({ ticket }: { ticket: JiraTicket }): JSX.Element {
  const priorityColor = PRIORITY_COLOR[ticket.priority] ?? 'text-on-surface-variant'
  return (
    <div className="bg-surface-container rounded-2xl px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-primary flex-shrink-0 mt-0.5" style={{ fontSize: '18px' }}>confirmation_number</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[12px] font-bold text-primary">{ticket.key}</span>
            {ticket.type   && <span className="text-[11px] text-on-surface-variant/50">{ticket.type}</span>}
            {ticket.priority && <span className={`text-[11px] font-semibold uppercase tracking-wide ${priorityColor}`}>{ticket.priority}</span>}
            {ticket.status && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-on-surface-variant/70">
                {ticket.status}
              </span>
            )}
          </div>
          <p className="text-[14px] font-semibold text-on-surface leading-snug">{ticket.summary}</p>
          {ticket.components.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {ticket.components.map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Plan card ──────────────────────────────────────────────────────────────────
function InfoPill({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="bg-surface rounded-xl px-3 py-2">
      <div className="text-[10px] text-on-surface-variant/40 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-[12px] font-medium text-on-surface truncate">{value || '—'}</div>
    </div>
  )
}

function PlanCard({ plan }: { plan: AnalysisPlan }): JSX.Element {
  return (
    <div className="bg-surface-container rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>checklist</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Analysis plan</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <InfoPill label="Component"   value={plan.component} />
        <InfoPill label="Technology"  value={plan.technology} />
        <InfoPill label="Est. tokens" value={plan.estimatedTokens.toString()} />
        <InfoPill label="Search terms" value={plan.searchTerms.slice(0, 3).join(', ')} />
      </div>
      <div className="mb-4">
        <div className="text-[10px] text-on-surface-variant/50 uppercase tracking-wide mb-1">Problem</div>
        <p className="text-[13px] text-on-surface leading-snug">{plan.nature}</p>
      </div>
      <div>
        <div className="text-[10px] text-on-surface-variant/50 uppercase tracking-wide mb-2">Steps</div>
        <div className="flex flex-col gap-2">
          {plan.steps.map(s => (
            <div key={s.id} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                {s.id}
              </span>
              <div>
                <div className="text-[12px] font-medium text-on-surface">{s.label}</div>
                <div className="text-[11px] text-on-surface-variant/50">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Config panel ───────────────────────────────────────────────────────────────
function ConfigPanel({
  config, onSave, onClose,
}: {
  config: ConfigValues
  onSave: (c: ConfigValues) => Promise<void>
  onClose: () => void
}): JSX.Element {
  const [local, setLocal]   = useState<ConfigValues>(config)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof ConfigValues) =>
    (e: React.ChangeEvent<HTMLInputElement>): void =>
      setLocal(prev => ({ ...prev, [k]: e.target.value }))

  const save = async (): Promise<void> => {
    setSaving(true)
    await onSave(local)
    setSaving(false)
    onClose()
  }

  const inputCls =
    'w-full bg-surface border border-outline-variant/30 rounded-lg px-3 py-2 text-[13px] ' +
    'text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/60 transition-colors'

  const labelCls = 'block text-[11px] text-on-surface-variant/60 mb-1'

  return (
    <div className="absolute inset-0 bg-surface z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/15 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>settings</span>
          <span className="text-[14px] font-semibold text-on-surface">Configuration</span>
        </div>
        <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">

        {/* Jira section */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-3">Jira</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>Base URL</label>
              <input className={inputCls} placeholder="https://company.atlassian.net" value={local.jiraUrl} onChange={set('jiraUrl')} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} placeholder="you@company.com" value={local.jiraUser} onChange={set('jiraUser')} />
            </div>
            <div>
              <label className={labelCls}>API Token</label>
              <input
                className={inputCls}
                type="password"
                placeholder={local.jiraToken === '__CONFIGURED__' ? '●●●●●●●● (already configured)' : 'Jira API token'}
                value={local.jiraToken === '__CONFIGURED__' ? '' : local.jiraToken}
                onChange={set('jiraToken')}
              />
              <p className="text-[11px] text-on-surface-variant/40 mt-1">
                Jira → Account settings → Security → API tokens
              </p>
            </div>
            <div>
              <label className={labelCls}>Project prefix</label>
              <input className={inputCls} placeholder="WIN" value={local.projectPrefix} onChange={set('projectPrefix')} />
              <p className="text-[11px] text-on-surface-variant/40 mt-1">
                Used when entering only a number (e.g. 1234 → WIN-1234)
              </p>
            </div>
          </div>
        </div>

        {/* Repo section */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-3">Repository</div>
          <div>
            <label className={labelCls}>Wigos repo path</label>
            <input className={inputCls} placeholder="C:\Repos\wigos" value={local.repoPath} onChange={set('repoPath')} />
            <p className="text-[11px] text-on-surface-variant/40 mt-1">
              Local path to the wigos repository for code search
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-outline-variant/15 flex-shrink-0">
        <button
          onClick={() => { void save() }}
          disabled={saving}
          className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--gradient-brand)' }}
        >
          {saving ? 'Saving...' : 'Save configuration'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TicketResolver(): JSX.Element {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [ticketInput, setTicketInput] = useState('')
  const [ticket, setTicket]         = useState<JiraTicket | null>(null)
  const [plan, setPlan]             = useState<AnalysisPlan | null>(null)
  const [snippets, setSnippets]     = useState<CodeSnippet[]>([])
  const [result, setResult]         = useState<AnalysisResult | null>(null)
  const [steps, setSteps]           = useState<AnalysisStepUI[]>([])
  const [history, setHistory]       = useState<HistoryEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)
  const [config, setConfig]         = useState<ConfigValues>({
    jiraUrl: '', jiraUser: '', jiraToken: '', repoPath: '', projectPrefix: 'WIN',
  })

  // Load config + history on mount
  useEffect(() => {
    void (async () => {
      const [url, user, token, repo, prefix] = await Promise.all([
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_url'),
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_user'),
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_token'),
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.repo_path'),
        window.api.invoke<string | null>('settings:get', 'ticket-resolver.project_prefix'),
      ])
      setConfig({
        jiraUrl:       url    ?? '',
        jiraUser:      user   ?? '',
        jiraToken:     token  ?? '',
        repoPath:      repo   ?? '',
        projectPrefix: prefix ?? 'WIN',
      })
      const hist = await window.api.invoke<HistoryEntry[]>('ticket-resolver:history-get')
      setHistory(hist)
    })()
  }, [])

  const saveConfig = useCallback(async (c: ConfigValues): Promise<void> => {
    await Promise.all([
      window.api.invoke('settings:set', 'ticket-resolver.jira_url',        c.jiraUrl),
      window.api.invoke('settings:set', 'ticket-resolver.jira_user',       c.jiraUser),
      window.api.invoke('settings:set', 'ticket-resolver.repo_path',       c.repoPath),
      window.api.invoke('settings:set', 'ticket-resolver.project_prefix',  c.projectPrefix),
    ])
    if (c.jiraToken && c.jiraToken !== '__CONFIGURED__') {
      await window.api.invoke('settings:set', 'ticket-resolver.jira_token', c.jiraToken)
    }
    setConfig(c)
  }, [])

  const updateStep = (id: string, status: AnalysisStepUI['status'], detail?: string): void => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail: detail ?? s.detail } : s))
  }

  const normalizeKey = (input: string): string => {
    const t = input.trim().toUpperCase()
    if (/^[A-Z]+-\d+$/.test(t)) return t
    if (/^\d+$/.test(t)) return `${config.projectPrefix || 'WIN'}-${t}`
    return t
  }

  const resetToIdle = (): void => {
    setPhase('idle')
    setTicketInput('')
    setTicket(null)
    setPlan(null)
    setSnippets([])
    setResult(null)
    setSteps([])
    setError(null)
    setSelectedId(null)
  }

  const handleFetch = async (): Promise<void> => {
    if (!ticketInput.trim()) return
    const key = normalizeKey(ticketInput)
    setError(null)
    setPhase('fetching')
    try {
      const t = await window.api.invoke<JiraTicket>('ticket-resolver:fetch', key)
      setTicket(t)
      setPhase('planning')
      const p = await window.api.invoke<AnalysisPlan>('ticket-resolver:plan', t)
      setPlan(p)
      setPhase('awaiting')
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  const handleExecute = async (): Promise<void> => {
    if (!ticket || !plan) return
    setSteps([
      { id: 'search',  label: 'Searching code in repository', status: 'pending' },
      { id: 'analyze', label: 'Analyzing with AI',            status: 'pending' },
    ])
    setPhase('analyzing')
    try {
      updateStep('search', 'running', `Looking for: ${plan.searchTerms.slice(0, 3).join(', ')}`)
      const found = await window.api.invoke<CodeSnippet[]>('ticket-resolver:search', plan.searchTerms)
      setSnippets(found)
      updateStep('search', 'done', found.length > 0
        ? `Found ${found.length} snippet${found.length !== 1 ? 's' : ''}`
        : 'No code found — AI will work from description')

      updateStep('analyze', 'running', 'Generating root cause and fix...')
      const res = await window.api.invoke<AnalysisResult>('ticket-resolver:analyze', ticket, plan, found)
      setResult(res)
      updateStep('analyze', 'done', 'Analysis complete')
      setPhase('done')
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  const handleSaveHistory = async (): Promise<void> => {
    if (!ticket || !plan || !result) return
    const entry: HistoryEntry = {
      id:           `${ticket.key}-${Date.now()}`,
      ticketKey:    ticket.key,
      summary:      ticket.summary,
      component:    plan.component,
      technology:   plan.technology,
      nature:       plan.nature,
      rootCause:    result.rootCause,
      fix:          result.fix,
      affectedFiles: result.affectedFiles,
      diff:         result.diff,
      createdAt:    new Date().toISOString(),
    }
    await window.api.invoke('ticket-resolver:history-save', entry)
    setHistory(prev => [entry, ...prev.filter(h => h.id !== entry.id)])
    setSelectedId(entry.id)
  }

  const handleDeleteHistory = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    await window.api.invoke('ticket-resolver:history-delete', id)
    setHistory(prev => prev.filter(h => h.id !== id))
    if (selectedId === id) resetToIdle()
  }

  const handleSelectHistory = (entry: HistoryEntry): void => {
    setSelectedId(entry.id)
    setTicket({
      key: entry.ticketKey, summary: entry.summary, description: '',
      type: '', priority: '', status: '', components: [],
      reporter: '', assignee: null, created: entry.createdAt, updated: entry.createdAt,
    })
    setPlan({ component: entry.component, technology: entry.technology, nature: entry.nature, searchTerms: [], steps: [], estimatedTokens: 0 })
    setResult({ rootCause: entry.rootCause, fix: entry.fix, affectedFiles: entry.affectedFiles, diff: entry.diff })
    setSnippets([])
    setError(null)
    setPhase('done')
  }

  const copy = (text: string, key: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const isConfigured = Boolean(config.jiraUrl && config.jiraUser && config.jiraToken)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden relative">

      {/* Config overlay */}
      {showConfig && (
        <ConfigPanel config={config} onSave={saveConfig} onClose={() => setShowConfig(false)} />
      )}

      {/* ── Left: History ────────────────────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-outline-variant/15 bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-4 pb-2 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">History</span>
          <button
            onClick={resetToIdle}
            title="New ticket"
            className="text-on-surface-variant/50 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {history.length === 0 ? (
            <p className="text-[11px] text-on-surface-variant/35 text-center px-4 pt-8 leading-relaxed">
              No tickets analyzed yet.<br />Enter a ticket number to start.
            </p>
          ) : (
            history.map(entry => (
              <div
                key={entry.id}
                onClick={() => handleSelectHistory(entry)}
                className={[
                  'group relative flex flex-col px-3 py-2.5 mx-1 mb-0.5 rounded-xl cursor-pointer transition-colors',
                  selectedId === entry.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-white/[0.04] text-on-surface',
                ].join(' ')}
              >
                <span className="text-[12px] font-bold truncate">{entry.ticketKey}</span>
                <span className="text-[11px] text-on-surface-variant/60 truncate mt-0.5">{entry.summary}</span>
                <span className="text-[10px] text-on-surface-variant/40 mt-0.5 truncate">{entry.component}</span>
                <button
                  onClick={e => { void handleDeleteHistory(entry.id, e) }}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-on-surface-variant/40 hover:text-red-400 transition-all"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Center: Main panel ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/15 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary flex-shrink-0" style={{ fontSize: '20px' }}>confirmation_number</span>
            <span className="text-[14px] font-semibold text-on-surface">Ticket Resolver</span>
            {ticket && phase !== 'idle' && (
              <span className="text-[12px] text-on-surface-variant/50 truncate">· {ticket.key}</span>
            )}
          </div>
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-1.5 text-[12px] text-on-surface-variant/60 hover:text-on-surface transition-colors flex-shrink-0 ml-3"
            title="Configuration"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>settings</span>
            {!isConfigured && <span className="text-amber-400 text-[11px] font-medium">Not configured</span>}
          </button>
        </div>

        {/* Phase content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              {!isConfigured && (
                <div className="flex items-center gap-2 text-amber-400 text-[13px] bg-amber-400/10 border border-amber-400/20 px-4 py-3 rounded-xl">
                  <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '16px' }}>warning</span>
                  <span>Configure Jira credentials before resolving tickets.</span>
                  <button onClick={() => setShowConfig(true)} className="underline font-medium ml-1 hover:no-underline">
                    Open config
                  </button>
                </div>
              )}
              <div className="w-full max-w-xs">
                <label className="block text-[12px] text-on-surface-variant/60 mb-2 text-center">
                  Ticket number
                </label>
                <div className="flex gap-2">
                  <input
                    value={ticketInput}
                    onChange={e => setTicketInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleFetch() }}
                    placeholder={`${config.projectPrefix || 'WIN'}-1234`}
                    autoFocus
                    className="flex-1 bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2.5 text-[14px] text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                  <button
                    onClick={() => { void handleFetch() }}
                    disabled={!ticketInput.trim() || !isConfigured}
                    className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 transition-opacity"
                    style={{ background: 'var(--gradient-brand)' }}
                  >
                    Load
                  </button>
                </div>
                <p className="text-[11px] text-on-surface-variant/40 text-center mt-2">
                  Enter only the number or the full key (e.g. 1234 or WIN-1234)
                </p>
              </div>
            </div>
          )}

          {/* ── FETCHING ── */}
          {phase === 'fetching' && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant/60">
              <Spinner />
              <span className="text-[13px]">Fetching ticket from Jira...</span>
            </div>
          )}

          {/* ── PLANNING ── */}
          {phase === 'planning' && ticket && (
            <div className="flex flex-col gap-4 max-w-xl mx-auto">
              <TicketHeader ticket={ticket} />
              <div className="flex items-center gap-3 text-on-surface-variant/60 text-[13px] bg-surface-container rounded-2xl px-5 py-4">
                <Spinner />
                <span>Generating analysis plan...</span>
              </div>
            </div>
          )}

          {/* ── AWAITING CONFIRMATION ── */}
          {phase === 'awaiting' && ticket && plan && (
            <div className="flex flex-col gap-4 max-w-xl mx-auto">
              <TicketHeader ticket={ticket} />
              <PlanCard plan={plan} />
              <div className="flex gap-3">
                <button
                  onClick={() => { void handleExecute() }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>play_arrow</span>
                  Execute analysis
                </button>
                <button
                  onClick={resetToIdle}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── ANALYZING ── */}
          {phase === 'analyzing' && ticket && plan && (
            <div className="flex flex-col gap-4 max-w-xl mx-auto">
              <TicketHeader ticket={ticket} />
              <div className="bg-surface-container rounded-2xl p-5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1">
                  Analysis in progress
                </div>
                <div className="divide-y divide-outline-variant/10">
                  {steps.map(step => <StepItem key={step.id} step={step} />)}
                </div>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && ticket && result && (
            <div className="flex flex-col gap-4 max-w-xl mx-auto">

              {/* Ticket header + close */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <TicketHeader ticket={ticket} />
                </div>
                <button
                  onClick={resetToIdle}
                  title="New ticket"
                  className="flex-shrink-0 mt-1 text-on-surface-variant/40 hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>

              {/* Root cause */}
              <div className="bg-surface-container rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '17px' }}>search</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Root cause</span>
                  </div>
                  <button
                    onClick={() => copy(result.rootCause, 'root')}
                    className="text-on-surface-variant/40 hover:text-primary transition-colors"
                    title="Copy"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                      {copied === 'root' ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
                <p className="text-[13px] text-on-surface leading-relaxed">{result.rootCause}</p>
              </div>

              {/* Fix */}
              <div className="bg-surface-container rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-400" style={{ fontSize: '17px' }}>build</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Proposed fix</span>
                  </div>
                  <button
                    onClick={() => copy(result.fix, 'fix')}
                    className="text-on-surface-variant/40 hover:text-primary transition-colors"
                    title="Copy"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                      {copied === 'fix' ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
                <p className="text-[13px] text-on-surface leading-relaxed">{result.fix}</p>
                <DiffView diff={result.diff} />
              </div>

              {/* Affected files */}
              {result.affectedFiles.length > 0 && (
                <div className="bg-surface-container rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-on-surface-variant/50" style={{ fontSize: '16px' }}>folder_open</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Affected files</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {result.affectedFiles.map(f => (
                      <span key={f} className="text-[12px] font-mono text-on-surface-variant bg-surface px-2.5 py-1 rounded-lg">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap pb-2">
                <button
                  onClick={() => { void handleSaveHistory() }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>save</span>
                  Save to history
                </button>
                <button
                  onClick={() => copy(`ROOT CAUSE:\n${result.rootCause}\n\nFIX:\n${result.fix}`, 'all')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04] transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                    {copied === 'all' ? 'check' : 'content_copy'}
                  </span>
                  Copy full analysis
                </button>
                <button
                  onClick={resetToIdle}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04] transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                  New ticket
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="flex items-center gap-2 text-red-400">
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>error</span>
                <span className="text-[14px] font-medium">
                  {error === 'JIRA_NOT_CONFIGURED' ? 'Jira is not configured' : error}
                </span>
              </div>
              <div className="flex gap-2">
                {error === 'JIRA_NOT_CONFIGURED' && (
                  <button
                    onClick={() => setShowConfig(true)}
                    className="px-4 py-2 rounded-xl text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    Open config
                  </button>
                )}
                <button
                  onClick={resetToIdle}
                  className="px-4 py-2 rounded-xl text-[12px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-white/[0.04] transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Right: Code context ──────────────────────────────────────────────── */}
      {snippets.length > 0 && (
        <aside className="w-72 flex-shrink-0 flex flex-col border-l border-outline-variant/15 bg-surface overflow-hidden">
          <div className="px-3 pt-4 pb-2 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
              Code context · {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1 flex flex-col gap-2 pb-4">
            {snippets.map((s, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/15">
                <div className="px-3 py-1.5 bg-surface-container text-[10px] font-mono text-on-surface-variant/50 border-b border-outline-variant/10 truncate">
                  {s.file} · {s.line}
                </div>
                <pre className="px-3 py-2 text-[11px] font-mono text-on-surface/75 overflow-x-auto whitespace-pre bg-surface/40 leading-relaxed">
                  {s.context}
                </pre>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
