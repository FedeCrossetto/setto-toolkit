import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronDown, ChevronRight, CircleAlert, Eye, EyeOff, Lock, Unlink } from 'lucide-react'
import { StatusPill, type StatusTone } from '../../core/components/StatusPill'

// ── Brand SVG logos ────────────────────────────────────────────────────────────

function LogoOpenAI({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="currentColor"/>
    </svg>
  )
}

function LogoAnthropic({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-3.654 0H6.57L0 20h3.603l1.378-3.504h6.875L10.48 13.02H6.15l3.023-7.71V3.52z" fill="currentColor"/>
    </svg>
  )
}

function LogoOllama({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="42" r="28" stroke="currentColor" strokeWidth="6" fill="none"/>
      <circle cx="38" cy="38" r="4" fill="currentColor"/>
      <circle cx="62" cy="38" r="4" fill="currentColor"/>
      <path d="M38 52 Q50 60 62 52" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M30 70 Q50 80 70 70" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function LogoGitHub({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="currentColor"/>
    </svg>
  )
}

function LogoGitLab({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.845.904c-.435 0-.82.28-.955.692L.016 13.69a.953.953 0 0 0 .346 1.068L12 23.086l11.638-8.328a.953.953 0 0 0 .346-1.068L20.11 1.596a.998.998 0 0 0-.955-.692c-.434 0-.82.28-.954.692l-2.893 8.9H8.692L5.8 1.596A.998.998 0 0 0 4.845.904z" fill="currentColor"/>
    </svg>
  )
}

function LogoBitbucket({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.873 1.022.873h15.386a.77.77 0 0 0 .77-.646l3.261-20.03a.768.768 0 0 0-.768-.899zM14.52 15.53H9.522L8.17 8.466h7.561z" fill="currentColor"/>
    </svg>
  )
}

function LogoNotion({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" fill="currentColor"/>
    </svg>
  )
}

function LogoSupabase({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.3 12.9c-.4-2.8-2.5-4.9-5.1-5.4-1-.6-2.1-.9-3.2-.9-3.5 0-6.4 2.6-6.9 6.1-.5.1-1 .3-1.4.6-1.2.9-1.7 2.5-1.2 4 .5 1.5 1.9 2.5 3.5 2.5h11.8c2.2 0 3.9-1.8 3.9-3.9 0-2-1.5-3.7-3.4-3.9z" fill="currentColor"/>
    </svg>
  )
}

function LogoJira({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.001-1.005zM23.016 0H11.464a5.216 5.216 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24.019 12.49V1.005A1.001 1.001 0 0 0 23.016 0z" fill="currentColor"/>
    </svg>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Status = 'connected' | 'partial' | 'disconnected' | 'loading'

// ── Shared UI ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-surface-container border border-outline-variant/25 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-colors'

const STATUS_PILL: Record<Status, { tone: StatusTone; label: string; pulse?: boolean }> = {
  loading:      { tone: 'neutral', label: 'Verificando…', pulse: true },
  connected:    { tone: 'success', label: 'Conectado' },
  partial:      { tone: 'warning', label: 'Incompleto' },
  disconnected: { tone: 'neutral', label: 'Sin configurar' },
}

function ConnStatus({ status }: { status: Status }): JSX.Element {
  const s = STATUS_PILL[status]
  return <StatusPill tone={s.tone} label={s.label} pulse={s.pulse} />
}

function PasswordInput({
  value, onChange, placeholder, configured,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; configured?: boolean
}): JSX.Element {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      {configured && !value && (
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60 font-medium">
          <Lock size={12} />
          Ya configurado — ingresá un valor nuevo para reemplazar
        </div>
      )}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={configured && !value ? '••••••••' : (placeholder ?? '')}
          className={inputCls + ' pr-10'}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}

function SaveButton({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={[
        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
        saved
          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25'
          : 'bg-surface-container-high border border-outline-variant/30 text-on-surface hover:border-primary/40 hover:text-primary',
        'disabled:opacity-40',
      ].join(' ')}
    >
      {saving
        ? <><span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />Guardando…</>
        : saved
          ? <><Check size={13} />Guardado</>
          : 'Guardar'}
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-on-surface-variant/80">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">{hint}</p>}
    </div>
  )
}

function HowToBox({ steps }: { steps: Array<{ title: string; detail?: string | JSX.Element }> }): JSX.Element {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container/40 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-3">Cómo obtener las credenciales</p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-xs text-on-surface-variant/70 leading-relaxed">
            <span className="flex-shrink-0 w-4 h-4 rounded-full border border-outline-variant/40 text-[10px] font-bold flex items-center justify-center text-on-surface-variant/50 mt-0.5">
              {i + 1}
            </span>
            <span>
              <span className="font-semibold text-on-surface/80">{s.title}</span>
              {s.detail && <> — {s.detail}</>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Accordion ──────────────────────────────────────────────────────────────────

function Section({
  id, title, subtitle, Logo, status, open, onToggle, children,
}: {
  id: string
  title: string
  subtitle: string
  Logo: React.FC<{ size?: number }>
  status: Status
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-container/30 transition-colors text-left"
        onClick={() => onToggle(id)}
      >
        {/* Brand logo */}
        <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface/70">
          <Logo size={20} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-on-surface">{title}</div>
          <div className="text-xs text-on-surface-variant/50 mt-0.5 truncate">{subtitle}</div>
        </div>

        {/* Status + chevron */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <ConnStatus status={status} />
          {open
            ? <ChevronDown size={15} className="text-on-surface-variant/40" />
            : <ChevronRight size={15} className="text-on-surface-variant/40" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-5 pb-5 border-t border-outline-variant/15 space-y-4 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── AI Section ─────────────────────────────────────────────────────────────────

function AIOpenAISection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [key, setKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    window.api.invoke<string | null>('settings:get', 'ai.openai_key').then((v) => {
      const ok = v === '__CONFIGURED__'
      setConfigured(ok)
      setStatus(ok ? 'connected' : 'disconnected')
    }).catch(() => setStatus('disconnected'))
  }, [])

  const save = async (): Promise<void> => {
    if (!key.trim()) return
    setSaving(true)
    await window.api.invoke('settings:set', 'ai.openai_key', key.trim())
    setConfigured(true)
    setKey('')
    setSaving(false)
    setSaved(true)
    setStatus('connected')
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Section id="openai" title="OpenAI" subtitle="Modelos GPT para el análisis de Smart Diff" Logo={LogoOpenAI} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Andá a platform.openai.com', detail: 'Iniciá sesión o creá una cuenta.' },
        { title: 'Abrí API keys', detail: 'Menú arriba a la derecha → API keys → Create new secret key.' },
        { title: 'Pegala abajo', detail: 'La key empieza con sk-… y solo se muestra una vez.' },
      ]} />
      <Field label="API Key">
        <PasswordInput value={key} onChange={setKey} placeholder="sk-…" configured={configured} />
      </Field>
      <div className="flex justify-end">
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

function AIAnthropicSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [key, setKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    window.api.invoke<string | null>('settings:get', 'ai.anthropic_key').then((v) => {
      const ok = v === '__CONFIGURED__'
      setConfigured(ok)
      setStatus(ok ? 'connected' : 'disconnected')
    }).catch(() => setStatus('disconnected'))
  }, [])

  const save = async (): Promise<void> => {
    if (!key.trim()) return
    setSaving(true)
    await window.api.invoke('settings:set', 'ai.anthropic_key', key.trim())
    setConfigured(true)
    setKey('')
    setSaving(false)
    setSaved(true)
    setStatus('connected')
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Section id="anthropic" title="Anthropic" subtitle="Modelos Claude para el análisis de Smart Diff" Logo={LogoAnthropic} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Andá a console.anthropic.com', detail: 'Iniciá sesión o creá una cuenta.' },
        { title: 'Abrí API Keys', detail: 'Barra lateral izquierda → API Keys → Create Key.' },
        { title: 'Pegala abajo', detail: 'La key empieza con sk-ant-…' },
      ]} />
      <Field label="API Key">
        <PasswordInput value={key} onChange={setKey} placeholder="sk-ant-…" configured={configured} />
      </Field>
      <div className="flex justify-end">
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

function AILocalSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [url, setUrl] = useState('http://localhost:11434')
  const [model, setModel] = useState('llama3')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    Promise.all([
      window.api.invoke<string | null>('settings:get', 'ai.ollama_url'),
      window.api.invoke<string | null>('settings:get', 'ai.ollama_model'),
    ]).then(([u, m]) => {
      if (u) setUrl(u)
      if (m) setModel(m)
      setStatus(u ? 'connected' : 'disconnected')
    }).catch(() => setStatus('disconnected'))
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    await Promise.all([
      window.api.invoke('settings:set', 'ai.ollama_url', url.trim()),
      window.api.invoke('settings:set', 'ai.ollama_model', model.trim()),
    ])
    setSaving(false)
    setSaved(true)
    setStatus('connected')
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Section id="ollama" title="Ollama (Local)" subtitle="Ejecutá modelos de IA localmente — sin API key" Logo={LogoOllama} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Instalá Ollama', detail: 'Descargalo de ollama.com y ejecutalo. Levanta un servidor local automáticamente.' },
        { title: 'Descargá un modelo', detail: 'Ejecutá: ollama pull llama3 (o qwen3:14b, mistral, etc.) en tu terminal.' },
        { title: 'Configurá abajo', detail: 'La URL por defecto es http://localhost:11434. Ingresá el nombre del modelo que descargaste.' },
      ]} />
      <Field label="URL del servidor">
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:11434" className={inputCls} />
      </Field>
      <Field label="Modelo">
        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3" className={inputCls} />
      </Field>
      <div className="flex justify-end">
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

// ── GitHub Section ─────────────────────────────────────────────────────────────

function GitHubSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [clientId, setClientId] = useState('')
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; username: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')
  const [oauthStep, setOauthStep] = useState<{ user_code: string; verification_uri: string; device_code: string } | null>(null)
  const [polling, setPolling] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const [cid, me] = await Promise.all([
      window.api.invoke<string | null>('settings:get', 'repo-search.github.client_id'),
      window.api.invoke<{ authenticated: boolean; username: string | null; workspace: string | null; org: string | null; picture: string | null } | null>('repo-search:me', { provider: 'github' }),
    ])
    if (cid) setClientId(cid)
    setAuthInfo(me)
    setStatus(me?.authenticated ? 'connected' : cid ? 'partial' : 'disconnected')
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (): Promise<void> => {
    setSaving(true)
    if (clientId.trim()) await window.api.invoke('settings:set', 'repo-search.github.client_id', clientId.trim())
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const startOAuth = async (): Promise<void> => {
    const res = await window.api.invoke<{ user_code: string; verification_uri: string; device_code: string }>('repo-search:github-oauth-start')
    setOauthStep(res)
    setPolling(true)
    const poll = async (): Promise<void> => {
      const result = await window.api.invoke<{ ok: boolean; error?: string }>('repo-search:github-oauth-poll', { device_code: res.device_code })
      if (result.ok) { setOauthStep(null); setPolling(false); await load() }
      else if (result.error === 'authorization_pending' || result.error === 'slow_down') setTimeout(() => void poll(), 5000)
      else { setOauthStep(null); setPolling(false) }
    }
    setTimeout(() => void poll(), 3000)
  }

  const logout = async (): Promise<void> => {
    await window.api.invoke('repo-search:logout', { provider: 'github' })
    await load()
  }

  return (
    <Section id="github" title="GitHub" subtitle="Buscá código en tus repositorios y organizaciones" Logo={LogoGitHub} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Creá una OAuth App en GitHub', detail: 'github.com → Settings → Developer settings → OAuth Apps → New OAuth App.' },
        { title: 'Activá Device Flow', detail: 'Marcá la casilla "Enable Device Flow". La redirect URI puede ser cualquiera.' },
        { title: 'Copiá el Client ID', detail: 'Pegalo abajo y guardá. Después clic en "Iniciar sesión con GitHub".' },
      ]} />

      <Field label="OAuth App — Client ID">
        <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Ov23li…" className={inputCls} />
      </Field>

      {oauthStep && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3">
          <p className="text-xs font-semibold text-on-surface">Autorizá en tu navegador</p>
          <p className="text-xs text-on-surface-variant/60">
            Andá a <span className="font-mono text-on-surface">{oauthStep.verification_uri}</span> e ingresá:
          </p>
          <p className="font-mono text-xl font-bold tracking-widest text-on-surface">{oauthStep.user_code}</p>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant/50">
            <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            Esperando autorización…
          </div>
        </div>
      )}

      {authInfo?.authenticated && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-container/40">
          <span className="text-xs text-on-surface-variant/60">Sesión iniciada como</span>
          <span className="text-sm font-semibold text-on-surface flex-1">{authInfo.username}</span>
          <button onClick={() => void logout()} className="flex items-center gap-1 text-xs text-on-surface-variant/40 hover:text-error transition-colors">
            <Unlink size={12} />Desconectar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        {!authInfo?.authenticated ? (
          <button
            onClick={() => void startOAuth()}
            disabled={!clientId.trim() || polling}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            {polling ? 'Esperando autorización…' : 'Iniciar sesión con GitHub →'}
          </button>
        ) : <span />}
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

// ── GitLab Section ─────────────────────────────────────────────────────────────

function GitLabSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [clientId, setClientId] = useState('')
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; username: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')
  const [oauthStep, setOauthStep] = useState<{ user_code: string; verification_uri: string; device_code: string } | null>(null)
  const [polling, setPolling] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const [cid, me] = await Promise.all([
      window.api.invoke<string | null>('settings:get', 'repo-search.gitlab.client_id'),
      window.api.invoke<{ authenticated: boolean; username: string | null; workspace: string | null; org: string | null; picture: string | null } | null>('repo-search:me', { provider: 'gitlab' }),
    ])
    if (cid) setClientId(cid)
    setAuthInfo(me)
    setStatus(me?.authenticated ? 'connected' : cid ? 'partial' : 'disconnected')
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (): Promise<void> => {
    setSaving(true)
    if (clientId.trim()) await window.api.invoke('settings:set', 'repo-search.gitlab.client_id', clientId.trim())
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const startOAuth = async (): Promise<void> => {
    const res = await window.api.invoke<{ user_code: string; verification_uri: string; device_code: string }>('repo-search:gitlab-oauth-start')
    setOauthStep(res)
    setPolling(true)
    const poll = async (): Promise<void> => {
      const result = await window.api.invoke<{ ok: boolean; error?: string }>('repo-search:gitlab-oauth-poll', { device_code: res.device_code })
      if (result.ok) { setOauthStep(null); setPolling(false); await load() }
      else if (result.error === 'authorization_pending' || result.error === 'slow_down') setTimeout(() => void poll(), 5000)
      else { setOauthStep(null); setPolling(false) }
    }
    setTimeout(() => void poll(), 3000)
  }

  const logout = async (): Promise<void> => {
    await window.api.invoke('repo-search:logout', { provider: 'gitlab' })
    await load()
  }

  return (
    <Section id="gitlab" title="GitLab" subtitle="Buscá código en tus proyectos y grupos de GitLab" Logo={LogoGitLab} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Creá una Application en GitLab', detail: 'gitlab.com → Avatar → Preferences → Applications → New application.' },
        { title: 'Configurá los scopes', detail: 'Scopes: read_api. Activá "Device Authorization Grant". La redirect URI puede quedar vacía.' },
        { title: 'Copiá el Application ID', detail: 'Pegalo abajo, guardá y después clic en "Iniciar sesión con GitLab".' },
      ]} />

      <Field label="OAuth Application — Application ID">
        <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="abc123…" className={inputCls} />
      </Field>

      {oauthStep && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 space-y-3">
          <p className="text-xs font-semibold text-on-surface">Autorizá en tu navegador</p>
          <p className="text-xs text-on-surface-variant/60">
            Andá a <span className="font-mono text-on-surface">{oauthStep.verification_uri}</span> e ingresá:
          </p>
          <p className="font-mono text-xl font-bold tracking-widest text-on-surface">{oauthStep.user_code}</p>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant/50">
            <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            Esperando autorización…
          </div>
        </div>
      )}

      {authInfo?.authenticated && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-container/40">
          <span className="text-xs text-on-surface-variant/60">Sesión iniciada como</span>
          <span className="text-sm font-semibold text-on-surface flex-1">{authInfo.username}</span>
          <button onClick={() => void logout()} className="flex items-center gap-1 text-xs text-on-surface-variant/40 hover:text-error transition-colors">
            <Unlink size={12} />Desconectar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        {!authInfo?.authenticated ? (
          <button
            onClick={() => void startOAuth()}
            disabled={!clientId.trim() || polling}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            {polling ? 'Esperando autorización…' : 'Iniciar sesión con GitLab →'}
          </button>
        ) : <span />}
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

// ── Bitbucket Section ──────────────────────────────────────────────────────────

function BitbucketSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [username, setUsername] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [token, setToken] = useState('')
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; username: string | null; workspace: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  // Detect token type as user types
  const isBearer = token.startsWith('ATCTT')

  const load = useCallback(async (): Promise<void> => {
    const [me, ws] = await Promise.all([
      window.api.invoke<{ authenticated: boolean; username: string | null; workspace: string | null; org: string | null; picture: string | null } | null>('repo-search:me', { provider: 'bitbucket' }),
      window.api.invoke<string | null>('settings:get', 'bitbucket.workspace'),
    ])
    setAuthInfo(me)
    if (ws) setWorkspace(ws)
    setStatus(me?.authenticated ? 'connected' : 'disconnected')
  }, [])

  useEffect(() => { void load() }, [load])

  const canConnect = token.trim() && workspace.trim() && (isBearer || username.trim())

  const connect = async (): Promise<void> => {
    if (!canConnect) return
    setError(null)
    setSaving(true)
    try {
      const result = await window.api.invoke<{ ok: boolean; error?: string }>('repo-search:login', {
        provider: 'bitbucket',
        username: username.trim() || '',
        token: token.trim(),
        workspace: workspace.trim(),
      })
      if (result.ok) {
        await window.api.invoke('settings:set', 'bitbucket.workspace', workspace.trim())
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        await load()
      } else {
        setError(result.error ?? 'Falló la autenticación')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló la autenticación — revisá tus credenciales e intentá de nuevo')
    } finally {
      setSaving(false)
    }
  }

  const logout = async (): Promise<void> => {
    await window.api.invoke('repo-search:logout', { provider: 'bitbucket' })
    await load()
  }

  return (
    <Section id="bitbucket" title="Bitbucket" subtitle="Buscá código en repositorios de Bitbucket" Logo={LogoBitbucket} status={status} open={open} onToggle={onToggle}>

      {/* Token type notice */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container/40 p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">¿Qué token necesito?</p>
        <div className="space-y-2 text-xs text-on-surface-variant/70 leading-relaxed">
          <p>
            <span className="font-semibold text-on-surface/80">API token de Atlassian con scope de Bitbucket</span>
            {' '}(recomendado) — empieza con <span className="font-mono bg-surface-container px-1 rounded">ATATT…</span>.
            Crealo en <span className="font-mono text-on-surface/60">id.atlassian.com → Security → API tokens</span>.
            Elegí <span className="font-semibold">Bitbucket</span> como app y marcá los scopes: <span className="font-mono">Account → Read</span> y <span className="font-mono">Repositories → Read</span>.
            Usá tu <span className="font-semibold">email de Atlassian</span> como usuario.
          </p>
          <p>
            <span className="font-semibold text-on-surface/80">Access Token de Workspace/Repositorio</span>
            {' '}— empieza con <span className="font-mono bg-surface-container px-1 rounded">ATCTT…</span>.
            Crealo en <span className="font-mono text-on-surface/60">bitbucket.org → Workspace Settings → Access tokens</span>. Scopes: <span className="font-mono">repository:read</span>. No necesita usuario.
          </p>
          <p>
            <span className="font-semibold text-on-surface/80">App Password</span>
            {' '}(legacy, discontinuado en sep. 2025) — empieza con <span className="font-mono bg-surface-container px-1 rounded">ATBB…</span>.
            Usá tu <span className="font-semibold">usuario</span> de Bitbucket (no el email).
          </p>
        </div>
      </div>

      {authInfo?.authenticated ? (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-container/40">
          <span className="text-xs text-on-surface-variant/60">Sesión iniciada como</span>
          <span className="text-sm font-semibold text-on-surface flex-1">{authInfo.username}</span>
          {authInfo.workspace && <span className="text-xs text-on-surface-variant/50">· {authInfo.workspace}</span>}
          <button onClick={() => void logout()} className="flex items-center gap-1 text-xs text-on-surface-variant/40 hover:text-error transition-colors">
            <Unlink size={12} />Desconectar
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isBearer ? 'Usuario (opcional)' : 'Usuario / Email'}
              hint={isBearer ? 'No requerido para tokens de Workspace/Repo (ATCTT)' : 'Usá tu email de Atlassian para tokens ATATT, o tu usuario de Bitbucket para App Passwords ATBB'}
            >
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isBearer ? 'opcional' : 'vos@empresa.com'}
                className={inputCls}
              />
            </Field>
            <Field label="Slug del workspace" hint="El slug que aparece en las URLs de tus repos">
              <input type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="my-workspace" className={inputCls} />
            </Field>
          </div>
          <Field label="Access Token">
            <PasswordInput value={token} onChange={setToken} placeholder="ATCTT… o ATBB…" />
          </Field>

          {error && (
            <div className="flex items-center gap-2 text-xs text-error/80">
              <CircleAlert size={13} />{error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => void connect()}
              disabled={!canConnect || saving}
              className={[
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                saved
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25'
                  : 'bg-surface-container-high border border-outline-variant/30 text-on-surface hover:border-primary/40 hover:text-primary',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {saving ? <><span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />Conectando…</>
                : saved ? <><Check size={13} />Conectado</>
                : 'Conectar'}
            </button>
          </div>
        </>
      )}
    </Section>
  )
}

// ── Notion Section ─────────────────────────────────────────────────────────────

function NotionSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [token, setToken] = useState('')
  const [gastosDbId, setGastosDbId] = useState('')
  const [credencialesDbId, setCredencialesDbId] = useState('')
  const [queriesDbId, setQueriesDbId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    Promise.all([
      window.api.invoke<{ token: string; databaseId: string; credencialesDatabaseId?: string } | null>('gastos:notion-config-get'),
      window.api.invoke<{ token: string; databaseId: string } | null>('queries:notion-config-get'),
    ]).then(([g, q]) => {
      const t = g?.token ?? ''
      if (t) setToken(t)
      if (g?.databaseId) setGastosDbId(g.databaseId)
      if (g?.credencialesDatabaseId) setCredencialesDbId(g.credencialesDatabaseId)
      if (q?.databaseId) setQueriesDbId(q.databaseId)
      const hasDb = Boolean(g?.databaseId || g?.credencialesDatabaseId || q?.databaseId)
      setStatus(!t ? 'disconnected' : hasDb ? 'connected' : 'partial')
    }).catch(() => setStatus('disconnected'))
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    await Promise.all([
      window.api.invoke('gastos:notion-config-save', {
        token: token.trim(), databaseId: gastosDbId.trim(), credencialesDatabaseId: credencialesDbId.trim(),
      }),
      window.api.invoke('queries:notion-config-save', {
        token: token.trim(), databaseId: queriesDbId.trim(),
      }),
    ])
    setSaving(false)
    setSaved(true)
    const hasDb = Boolean(gastosDbId.trim() || credencialesDbId.trim() || queriesDbId.trim())
    setStatus(token.trim() ? (hasDb ? 'connected' : 'partial') : 'disconnected')
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Section id="notion" title="Notion" subtitle="Sincronizá gastos, credenciales y queries con tu workspace de Notion" Logo={LogoNotion} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Creá una integración en Notion', detail: 'notion.so/my-integrations → New integration → Internal. Copiá el token (ntn_… o secret_…).' },
        { title: 'Compartí las bases con ella', detail: 'Abrí cada base → menú ••• → Connections → agregá tu integración.' },
        { title: 'Copiá cada Database ID', detail: 'Está en la URL: notion.so/…/<Título>-<ID-de-32-caracteres>. También podés pegar la URL completa.' },
      ]} />

      <Field label="Token de la integración">
        <PasswordInput value={token} onChange={setToken} placeholder="ntn_… o secret_…" configured={Boolean(token)} />
      </Field>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Base de Gastos" hint="La base donde se guardan tus gastos mensuales">
          <input type="text" value={gastosDbId} onChange={(e) => setGastosDbId(e.target.value)} placeholder="ID de 32 caracteres o URL completa de Notion" className={inputCls} />
        </Field>
        <Field label="Base de Credenciales" hint="La base donde viven tus credenciales guardadas">
          <input type="text" value={credencialesDbId} onChange={(e) => setCredencialesDbId(e.target.value)} placeholder="ID de 32 caracteres o URL completa de Notion" className={inputCls} />
        </Field>
        <Field label="Base de Queries" hint="La base que usa el módulo de Queries">
          <input type="text" value={queriesDbId} onChange={(e) => setQueriesDbId(e.target.value)} placeholder="ID de 32 caracteres o URL completa de Notion" className={inputCls} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

// ── Supabase Section ───────────────────────────────────────────────────────────

function SupabaseSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [url, setUrl] = useState('')
  const [serviceKey, setServiceKey] = useState('')
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [backend, setBackend] = useState<'local' | 'supabase'>('local')
  const [migratedAt, setMigratedAt] = useState<string | undefined>()
  const [syncOnStartup, setSyncOnStartup] = useState(true)
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    window.api.invoke<{
      url: string
      backend: 'local' | 'supabase'
      keyConfigured: boolean
      migratedAt?: string
      syncOnStartup?: boolean
      lastSyncAt?: string
    } | null>('gastos:supabase-config-get').then((cfg) => {
      if (cfg?.url) setUrl(cfg.url)
      setKeyConfigured(cfg?.keyConfigured ?? false)
      setBackend(cfg?.backend ?? 'local')
      setMigratedAt(cfg?.migratedAt)
      setSyncOnStartup(cfg?.syncOnStartup !== false)
      setLastSyncAt(cfg?.lastSyncAt)
      const ok = Boolean(cfg?.url && cfg?.keyConfigured)
      setStatus(cfg?.backend === 'supabase' && ok ? 'connected' : ok ? 'partial' : 'disconnected')
    }).catch(() => setStatus('disconnected'))
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.invoke('gastos:supabase-config-save', {
        url: url.trim(),
        serviceKey: serviceKey.trim(),
        backend,
        syncOnStartup,
      })
      if (serviceKey.trim()) setKeyConfigured(true)
      setSaved(true)
      const ok = Boolean(url.trim() && (serviceKey.trim() || keyConfigured))
      setStatus(backend === 'supabase' && ok ? 'connected' : ok ? 'partial' : 'disconnected')
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const migrate = async (): Promise<void> => {
    setMigrating(true)
    try {
      const result = await window.api.invoke<{
        servicios: number
        pagos: number
        credenciales: number
        queries: number
      }>('gastos:supabase-migrate')
      setBackend('supabase')
      setMigratedAt(new Date().toISOString())
      setStatus('connected')
      alert(
        `Migración OK\n` +
        `Servicios: ${result.servicios}\n` +
        `Pagos: ${result.pagos}\n` +
        `Credenciales: ${result.credenciales}\n` +
        `Queries: ${result.queries}`,
      )
    } catch (e) {
      alert(`Error al migrar: ${e}`)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <Section
      id="supabase"
      title="Supabase"
      subtitle="Base de datos para servicios, gastos, contraseñas y queries"
      Logo={LogoSupabase}
      status={status}
      open={open}
      onToggle={onToggle}
    >
      <HowToBox steps={[
        { title: 'Crear proyecto Supabase', detail: 'supabase.com → New project.' },
        { title: 'Ejecutar el SQL del repo', detail: 'SQL Editor → pegar supabase/migrations/001_gastos_schema.sql → Run.' },
        { title: 'Copiar URL y service_role', detail: 'Settings → API → Project URL y service_role (secret).' },
        { title: 'Migrar', detail: 'Guardá credenciales, luego «Migrar datos locales». Si usás Notion, sincronizá antes desde Gastos.' },
      ]} />

      <Field label="Project URL">
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" className={inputCls} />
      </Field>
      <Field label="Service role key" hint="Solo en el proceso principal de Electron; nunca en el renderer.">
        <PasswordInput value={serviceKey} onChange={setServiceKey} placeholder="eyJ..." configured={keyConfigured} />
      </Field>
      <Field label="Backend activo">
        <select
          value={backend}
          onChange={(e) => setBackend(e.target.value as 'local' | 'supabase')}
          className={inputCls}
        >
          <option value="local">Local (JSON en userData)</option>
          <option value="supabase">Supabase</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          checked={syncOnStartup}
          onChange={(e) => setSyncOnStartup(e.target.checked)}
          className="rounded border-outline-variant/40"
        />
        Al abrir la app, subir JSON local a Supabase (upsert)
      </label>
      {migratedAt && (
        <p className="text-xs text-on-surface-variant/60">Última migración: {new Date(migratedAt).toLocaleString()}</p>
      )}
      {lastSyncAt && (
        <p className="text-xs text-on-surface-variant/60">Último sync al inicio: {new Date(lastSyncAt).toLocaleString()}</p>
      )}
      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={() => void migrate()}
          disabled={migrating || !url.trim() || (!serviceKey.trim() && !keyConfigured)}
          className="px-4 py-2 text-sm rounded-lg border border-outline-variant/30 text-on-surface hover:border-primary/40 disabled:opacity-40"
        >
          {migrating ? 'Migrando…' : 'Migrar datos locales a Supabase'}
        </button>
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

// ── Jira Section ───────────────────────────────────────────────────────────────

function JiraSection({ open, onToggle }: { open: boolean; onToggle: (id: string) => void }): JSX.Element {
  const [jiraUrl, setJiraUrl] = useState('')
  const [jiraUser, setJiraUser] = useState('')
  const [jiraToken, setJiraToken] = useState('')
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    Promise.all([
      window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_url'),
      window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_user'),
      window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_token'),
    ]).then(([url, user, tok]) => {
      if (url) setJiraUrl(url)
      if (user) setJiraUser(user)
      const tokOk = tok === '__CONFIGURED__'
      setTokenConfigured(tokOk)
      setStatus(url && user && tokOk ? 'connected' : (url || user) ? 'partial' : 'disconnected')
    }).catch(() => setStatus('disconnected'))
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    const ops: Promise<unknown>[] = []
    if (jiraUrl.trim()) ops.push(window.api.invoke('settings:set', 'ticket-resolver.jira_url', jiraUrl.trim()))
    if (jiraUser.trim()) ops.push(window.api.invoke('settings:set', 'ticket-resolver.jira_user', jiraUser.trim()))
    if (jiraToken.trim() && jiraToken !== '__CONFIGURED__') {
      ops.push(window.api.invoke('settings:set', 'ticket-resolver.jira_token', jiraToken.trim()))
      setTokenConfigured(true)
      setJiraToken('')
    }
    await Promise.all(ops)
    setSaving(false)
    setSaved(true)
    setStatus(jiraUrl.trim() && jiraUser.trim() && (tokenConfigured || jiraToken.trim()) ? 'connected' : 'partial')
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Section id="jira" title="Jira" subtitle="Traé y analizá tickets de Jira en el Ticket Resolver" Logo={LogoJira} status={status} open={open} onToggle={onToggle}>
      <HowToBox steps={[
        { title: 'Conseguí la URL de tu instancia de Jira', detail: 'ej. https://empresa.atlassian.net' },
        { title: 'Creá un API token', detail: 'id.atlassian.com → Security → API tokens → Create API token. Copiá el valor.' },
        { title: 'Ingresá tu email', detail: 'El email asociado a tu cuenta de Atlassian.' },
      ]} />

      <Field label="URL base de Jira">
        <input type="text" value={jiraUrl} onChange={(e) => setJiraUrl(e.target.value)} placeholder="https://company.atlassian.net" className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <input type="email" value={jiraUser} onChange={(e) => setJiraUser(e.target.value)} placeholder="you@company.com" className={inputCls} />
        </Field>
        <Field label="API Token">
          <PasswordInput value={jiraToken} onChange={setJiraToken} placeholder="API token" configured={tokenConfigured} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SaveButton onClick={() => void save()} saving={saving} saved={saved} />
      </div>
    </Section>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

type SectionId = 'openai' | 'anthropic' | 'ollama' | 'github' | 'gitlab' | 'bitbucket' | 'notion' | 'supabase' | 'jira'

export function ConnectionsPlugin(): JSX.Element {
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    openai: false, anthropic: false, ollama: false,
    github: false, gitlab: false, bitbucket: false,
    notion: false, supabase: false, jira: false,
  })

  const toggle = (id: string): void =>
    setOpen((prev) => ({ ...prev, [id]: !prev[id as SectionId] }))

  return (
    <div className="p-8 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-on-surface">Conexiones</h1>
        <p className="text-on-surface-variant/60 mt-1 text-sm">
          Configurá tus integraciones. Expandí un servicio para ver las instrucciones e ingresar las credenciales.
        </p>
      </div>

      {/* AI */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">Inteligencia artificial</p>
        <div className="space-y-2">
          <AIOpenAISection open={open.openai} onToggle={toggle} />
          <AIAnthropicSection open={open.anthropic} onToggle={toggle} />
          <AILocalSection open={open.ollama} onToggle={toggle} />
        </div>
      </div>

      {/* Code repos */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">Repositorios de código</p>
        <div className="space-y-2">
          <GitHubSection open={open.github} onToggle={toggle} />
          <GitLabSection open={open.gitlab} onToggle={toggle} />
          <BitbucketSection open={open.bitbucket} onToggle={toggle} />
        </div>
      </div>

      {/* PM & Notes */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">Gestión de proyectos y notas</p>
        <div className="space-y-2">
          <NotionSection open={open.notion} onToggle={toggle} />
          <SupabaseSection open={open.supabase} onToggle={toggle} />
          <JiraSection open={open.jira} onToggle={toggle} />
        </div>
      </div>
    </div>
  )
}
