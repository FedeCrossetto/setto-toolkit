import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, CheckCircle2, Circle, CircleAlert, Clock, Copy, ExternalLink, Eye, EyeOff, Lock, RefreshCw, Settings, Unlink, Zap,
} from 'lucide-react'
import { StatusPill, type StatusTone } from '../../core/components/StatusPill'
import { PageHeader } from '../../core/components/Form'
import { Sheet } from '../../core/components/Modal'
import { useToast } from '../../core/components/Toast'
import { usePluginIntent } from '../../core/AppContext'
import {
  type ConnId, type ConnState, type ConnStatus, type SupabaseHealth, type SupabaseKeyKind, type TestResult,
  SUPABASE_TABLES, detectSupabaseKeyKind, formatCheckedAt, isPublicSupabaseKey, missingTables, normalizeSupabaseUrl,
  shortError, statusFromHealth, statusFromResult, summarizeStatuses, supabaseApiKeysUrl, supabaseSqlEditorUrl,
} from './helpers'
import { SqlConnections } from './SqlConnections'

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

// ── IPC helpers ───────────────────────────────────────────────────────────────

/** async wrapper: the preload throws synchronously on unknown channels — turn that into a rejection. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return await window.api.invoke<T>(channel, ...args)
}

const SENTINEL = '__CONFIGURED__'
const STORAGE_KEY = 'setto:connections:last-status'

async function checkStored(id: ConnId): Promise<ConnStatus> {
  if (id === 'supabase') {
    try {
      return statusFromHealth(await invoke<SupabaseHealth>('gastos:supabase-health'))
    } catch {
      // Health channel not available yet: fall back to "is it configured?"
      const cfg = await invoke<{ url: string; keyConfigured: boolean } | null>('gastos:supabase-config-get').catch(() => null)
      const ok = Boolean(cfg?.url && cfg.keyConfigured)
      return {
        state: ok ? 'idle' : 'unconfigured',
        detail: ok ? 'Configurado (verificación no disponible)' : 'Falta la URL o la clave service_role',
        checkedAt: Date.now(),
      }
    }
  }
  try {
    return statusFromResult(await invoke<TestResult>('settings:test-connection', id))
  } catch (e) {
    return { state: 'error', detail: e instanceof Error ? e.message : 'No se pudo verificar', checkedAt: Date.now() }
  }
}

// ── Catalog ───────────────────────────────────────────────────────────────────

type Logo = React.FC<{ size?: number }>

interface IntegrationMeta {
  id: ConnId
  name: string
  purpose: string
  Logo: Logo
}

const GROUPS: Array<{ title: string; items: IntegrationMeta[] }> = [
  {
    title: 'IA',
    items: [
      { id: 'openai', name: 'OpenAI', purpose: 'Modelos GPT para Tickets y Smart Diff', Logo: LogoOpenAI },
      { id: 'anthropic', name: 'Anthropic', purpose: 'Modelos Claude para Tickets y Smart Diff', Logo: LogoAnthropic },
      { id: 'ollama', name: 'Ollama', purpose: 'IA local, sin clave de API', Logo: LogoOllama },
    ],
  },
  {
    title: 'Código',
    items: [
      { id: 'github', name: 'GitHub', purpose: 'Búsqueda de código en tus repos', Logo: LogoGitHub },
      { id: 'gitlab', name: 'GitLab', purpose: 'Búsqueda de código en proyectos y grupos', Logo: LogoGitLab },
      { id: 'bitbucket', name: 'Bitbucket', purpose: 'Búsqueda de código del workspace', Logo: LogoBitbucket },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { id: 'jira', name: 'Jira', purpose: 'Traer tickets al Ticket Resolver', Logo: LogoJira },
    ],
  },
  {
    title: 'Datos',
    items: [
      { id: 'supabase', name: 'Supabase', purpose: 'Base de Gastos y Credenciales', Logo: LogoSupabase },
    ],
  },
]

const ALL: IntegrationMeta[] = GROUPS.flatMap((g) => g.items)
const META = Object.fromEntries(ALL.map((m) => [m.id, m])) as Record<ConnId, IntegrationMeta>

function loadLastStatuses(): Record<ConnId, ConnStatus> {
  const empty = Object.fromEntries(ALL.map((m) => [m.id, { state: 'idle' } as ConnStatus])) as Record<ConnId, ConnStatus>
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<Record<ConnId, ConnStatus>>
    for (const m of ALL) {
      const s = parsed[m.id]
      if (s && s.state !== 'checking') empty[m.id] = s
    }
  } catch { /* storage unavailable */ }
  return empty
}

// ── Small UI pieces ───────────────────────────────────────────────────────────

function Spinner(): JSX.Element {
  return <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" aria-hidden />
}

const PILL: Record<ConnState, { tone: StatusTone; label: string; pulse?: boolean }> = {
  checking:     { tone: 'neutral', label: 'Verificando…', pulse: true },
  connected:    { tone: 'success', label: 'Conectado' },
  unconfigured: { tone: 'neutral', label: 'Sin configurar' },
  error:        { tone: 'error',   label: 'Error' },
  idle:         { tone: 'neutral', label: 'Sin verificar' },
}

function ConnPill({ status }: { status: ConnStatus }): JSX.Element {
  const p = PILL[status.state]
  const label = status.state === 'error' ? `Error: ${shortError(status.detail, 22)}` : p.label
  return (
    <span title={status.state === 'error' ? status.detail : undefined} className="shrink-0">
      <StatusPill tone={p.tone} label={label} pulse={p.pulse} />
    </span>
  )
}

function LogoTile({ Logo, size = 36 }: { Logo: Logo; size?: number }): JSX.Element {
  return (
    <span
      className="rounded-lg flex items-center justify-center shrink-0 bg-surface hairline shadow-sm text-on-surface"
      style={{ width: size, height: size }}
    >
      <Logo size={Math.round(size / 2)} />
    </span>
  )
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }): JSX.Element {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children}<ExternalLink size={11} />
    </a>
  )
}

/** Field with label, help text, "¿Dónde la consigo?" link and inline error. */
function FormField({
  label, help, whereUrl, whereLabel = '¿Dónde la consigo?', error, children,
}: {
  label: string
  help?: React.ReactNode
  whereUrl?: string
  whereLabel?: string
  error?: string | null
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-footnote font-medium text-on-surface-variant">{label}</span>
        {whereUrl && <span className="t-caption"><ExtLink href={whereUrl}>{whereLabel}</ExtLink></span>}
      </div>
      {children}
      {error
        ? <span className="flex items-start gap-1.5 t-caption text-error"><CircleAlert size={12} className="mt-px shrink-0" />{error}</span>
        : help && <span className="t-caption text-on-surface-variant/80">{help}</span>}
    </div>
  )
}

function SecretInput({
  value, onChange, placeholder, configured, invalid,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; configured?: boolean; invalid?: boolean
}): JSX.Element {
  const [show, setShow] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`ui-input w-full flex items-center gap-2 py-0 pr-1 ${invalid ? 'ring-1 ring-error/60' : ''}`}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={configured && !value ? '••••••••' : (placeholder ?? '')}
          className="flex-1 min-w-0 bg-transparent outline-hidden py-[5px] font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="ui-btn ui-btn-ghost ui-btn-icon"
          aria-label={show ? 'Ocultar valor' : 'Mostrar valor'}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {configured && !value && (
        <span className="flex items-center gap-1.5 t-caption text-on-surface-variant">
          <Lock size={11} />
          Ya configurada. Escribí una nueva solo si querés reemplazarla.
        </span>
      )}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text', invalid }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; invalid?: boolean
}): JSX.Element {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={`ui-input w-full ${invalid ? 'ring-1 ring-error/60' : ''}`}
    />
  )
}

/** Result of the last test inside a sheet. */
function Outcome({ result }: { result: { ok: boolean; detail: string } | null }): JSX.Element | null {
  if (!result) return null
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 t-footnote ${result.ok ? 'bg-success/10 text-success' : 'bg-error/8 text-error'}`}>
      {result.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <CircleAlert size={14} className="mt-px shrink-0" />}
      <span className="min-w-0 wrap-break-word">{result.detail}</span>
    </div>
  )
}

function StatusBanner({ meta, status }: { meta: IntegrationMeta; status: ConnStatus }): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl hairline px-3.5 py-3">
      <LogoTile Logo={meta.Logo} />
      <div className="flex-1 min-w-0">
        <p className={`t-footnote truncate ${status.state === 'error' ? 'text-error' : 'text-on-surface'}`} title={status.detail}>
          {status.detail ?? 'Todavía no se verificó'}
        </p>
        <p className="t-caption text-on-surface-variant">{formatCheckedAt(status.checkedAt)}</p>
      </div>
      <ConnPill status={status} />
    </div>
  )
}

function HowTo({ steps }: { steps: React.ReactNode[] }): JSX.Element {
  return (
    <ol className="flex flex-col gap-2 rounded-xl bg-on-surface/[0.035] dark:bg-on-surface/5 px-4 py-3.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5 t-footnote text-on-surface-variant">
          <span className="shrink-0 w-5 h-5 rounded-full bg-selected text-primary t-caption font-semibold flex items-center justify-center">{i + 1}</span>
          <span className="min-w-0">{s}</span>
        </li>
      ))}
    </ol>
  )
}

function SessionRow({ username, extra, onLogout }: { username: string | null; extra?: string | null; onLogout: () => void }): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-on-surface/[0.035] dark:bg-on-surface/5">
      <span className="t-footnote text-on-surface-variant">Sesión iniciada como</span>
      <span className="t-body font-medium text-on-surface flex-1 truncate">
        {username}{extra && <span className="text-on-surface-variant font-normal"> · {extra}</span>}
      </span>
      <button onClick={onLogout} className="ui-btn ui-btn-ghost ui-btn-sm hover:text-error">
        <Unlink size={12} />Desconectar
      </button>
    </div>
  )
}

function DeviceCodeBox({ uri, code }: { uri: string; code: string }): JSX.Element {
  return (
    <div className="rounded-xl bg-selected px-4 py-3.5 flex flex-col gap-2">
      <p className="t-footnote font-medium text-on-surface">Autorizá en tu navegador</p>
      <p className="t-footnote text-on-surface-variant">
        Andá a <ExtLink href={uri}><span className="font-mono">{uri}</span></ExtLink> e ingresá:
      </p>
      <p className="font-mono t-title2 tracking-[0.2em] text-on-surface select-all">{code}</p>
      <div className="flex items-center gap-2 t-caption text-on-surface-variant">
        <Spinner /> Esperando autorización…
      </div>
    </div>
  )
}

/** Decide under which field a failed test message belongs. */
function fieldForError(detail: string): 'secret' | 'url' | 'general' {
  if (/401|403|Credenciales|clave|token|permisos/i.test(detail)) return 'secret'
  if (/URL|host|404|rechazada|timeout|conectar|responde|modelo/i.test(detail)) return 'url'
  return 'general'
}

// ── Shared sheet footer + test/save logic ─────────────────────────────────────

interface SheetProps {
  meta: IntegrationMeta
  status: ConnStatus
  onStatus: (s: ConnStatus) => void
  onClose: () => void
}

interface FooterState {
  testing: boolean
  saving: boolean
  canTest: boolean
  canSave: boolean
  onTest: () => void
  onSave: () => void
  saveLabel?: string
}

function SheetFooter({ testing, saving, canTest, canSave, onTest, onSave, saveLabel = 'Guardar' }: FooterState): JSX.Element {
  return (
    <>
      <button className="ui-btn ui-btn-outline" disabled={!canTest || testing || saving} onClick={onTest}>
        {testing ? <><Spinner />Probando…</> : <><Zap size={13} />Probar sin guardar</>}
      </button>
      <button className="ui-btn ui-btn-primary" disabled={!canSave || saving || testing} onClick={onSave}>
        {saving ? <><Spinner />Guardando…</> : saveLabel}
      </button>
    </>
  )
}

/**
 * Generic "fill fields → Probar sin guardar → Guardar" flow for key-based integrations.
 * `values` go to `settings:test-connection`; `persist` writes settings; after saving the
 * stored config is re-tested so the overview card reflects reality.
 */
function useTestSave(
  id: ConnId,
  values: () => Record<string, string>,
  persist: () => Promise<void>,
  onStatus: (s: ConnStatus) => void,
): { testing: boolean; saving: boolean; result: TestResult | null; setResult: (r: TestResult | null) => void; test: () => Promise<void>; save: () => Promise<void> } {
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await invoke<TestResult>('settings:test-connection', id, values()))
    } catch (e) {
      setResult({ ok: false, configured: true, detail: e instanceof Error ? e.message : 'No se pudo probar' })
    } finally {
      setTesting(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await persist()
      onStatus({ state: 'checking' })
      const s = await checkStored(id)
      onStatus(s)
      setResult({ ok: s.state === 'connected', configured: s.state !== 'unconfigured', detail: s.detail ?? '' })
      toast.show(s.state === 'connected' ? 'Guardado y verificado' : 'Guardado', s.state === 'connected' ? 'success' : 'info')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return { testing, saving, result, setResult, test, save }
}

// ── OpenAI / Anthropic ─────────────────────────────────────────────────────────

const KEY_PROVIDERS = {
  openai: {
    setting: 'ai.openai_key', prefix: 'sk-', placeholder: 'sk-…',
    where: 'https://platform.openai.com/api-keys',
    help: 'Empieza con sk-. OpenAI la muestra una sola vez al crearla.',
  },
  anthropic: {
    setting: 'ai.anthropic_key', prefix: 'sk-ant-', placeholder: 'sk-ant-…',
    where: 'https://console.anthropic.com/settings/keys',
    help: 'Empieza con sk-ant-. Creala en la consola de Anthropic → API Keys.',
  },
} as const

function ApiKeySheet({ meta, onStatus, id }: SheetProps & { id: 'openai' | 'anthropic' }): JSX.Element {
  const cfg = KEY_PROVIDERS[id]
  const [key, setKey] = useState('')
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    invoke<string | null>('settings:get', cfg.setting).then((v) => setConfigured(v === SENTINEL)).catch(() => undefined)
  }, [cfg.setting])

  const formatError = key.trim() && !key.trim().startsWith(cfg.prefix) ? `La clave debería empezar con ${cfg.prefix}` : null
  const ts = useTestSave(id, () => ({ key: key.trim() }), async () => {
    if (key.trim()) await invoke('settings:set', cfg.setting, key.trim())
    if (key.trim()) { setConfigured(true); setKey('') }
  }, onStatus)

  const failed = ts.result && !ts.result.ok ? ts.result.detail : null
  return (
    <SheetBody
      meta={meta}
      footer={<SheetFooter testing={ts.testing} saving={ts.saving} canTest={Boolean(key.trim() || configured)} canSave={Boolean(key.trim()) && !formatError} onTest={() => void ts.test()} onSave={() => void ts.save()} />}
    >
      <FormField label="Clave de API" help={cfg.help} whereUrl={cfg.where} error={formatError ?? failed}>
        <SecretInput value={key} onChange={(v) => { setKey(v); ts.setResult(null) }} placeholder={cfg.placeholder} configured={configured} invalid={Boolean(formatError ?? failed)} />
      </FormField>
      {ts.result?.ok && <Outcome result={ts.result} />}
    </SheetBody>
  )
}

// ── Ollama ─────────────────────────────────────────────────────────────────────

function OllamaSheet({ meta, onStatus }: SheetProps): JSX.Element {
  const [url, setUrl] = useState('http://localhost:11434')
  const [model, setModel] = useState('llama3')

  useEffect(() => {
    Promise.all([
      invoke<string | null>('settings:get', 'ai.ollama_url'),
      invoke<string | null>('settings:get', 'ai.ollama_model'),
    ]).then(([u, m]) => { if (u) setUrl(u); if (m) setModel(m) }).catch(() => undefined)
  }, [])

  const urlError = url.trim() && !/^https?:\/\//i.test(url.trim()) ? 'La URL tiene que empezar con http:// o https://' : null
  const ts = useTestSave('ollama', () => ({ url: url.trim(), model: model.trim() }), async () => {
    await Promise.all([
      invoke('settings:set', 'ai.ollama_url', url.trim()),
      invoke('settings:set', 'ai.ollama_model', model.trim()),
    ])
  }, onStatus)

  const failed = ts.result && !ts.result.ok ? ts.result.detail : null
  const modelMissing = failed && /modelo/i.test(failed)
  return (
    <SheetBody
      meta={meta}
      footer={<SheetFooter testing={ts.testing} saving={ts.saving} canTest={Boolean(url.trim()) && !urlError} canSave={Boolean(url.trim()) && !urlError} onTest={() => void ts.test()} onSave={() => void ts.save()} />}
    >
      <HowTo steps={[
        <>Instalá Ollama desde <ExtLink href="https://ollama.com/download">ollama.com</ExtLink>; levanta un servidor local solo.</>,
        <>Descargá un modelo: <span className="font-mono text-on-surface">ollama pull llama3</span> (o qwen3:14b, mistral…).</>,
      ]} />
      <FormField label="URL del servidor" help="Por defecto http://localhost:11434" error={urlError ?? (failed && !modelMissing ? failed : null)}>
        <TextInput value={url} onChange={(v) => { setUrl(v); ts.setResult(null) }} placeholder="http://localhost:11434" invalid={Boolean(urlError ?? (failed && !modelMissing))} />
      </FormField>
      <FormField label="Modelo" help="El nombre exacto que descargaste (ollama list)." error={modelMissing ? failed : null}>
        <TextInput value={model} onChange={(v) => { setModel(v); ts.setResult(null) }} placeholder="llama3" invalid={Boolean(modelMissing)} />
      </FormField>
      {ts.result?.ok && <Outcome result={ts.result} />}
    </SheetBody>
  )
}

// ── Jira ───────────────────────────────────────────────────────────────────────

function JiraSheet({ meta, onStatus }: SheetProps): JSX.Element {
  const [jiraUrl, setJiraUrl] = useState('')
  const [jiraUser, setJiraUser] = useState('')
  const [jiraToken, setJiraToken] = useState('')
  const [tokenConfigured, setTokenConfigured] = useState(false)

  useEffect(() => {
    Promise.all([
      invoke<string | null>('settings:get', 'ticket-resolver.jira_url'),
      invoke<string | null>('settings:get', 'ticket-resolver.jira_user'),
      invoke<string | null>('settings:get', 'ticket-resolver.jira_token'),
    ]).then(([u, usr, tok]) => {
      if (u) setJiraUrl(u)
      if (usr) setJiraUser(usr)
      setTokenConfigured(tok === SENTINEL)
    }).catch(() => undefined)
  }, [])

  const urlError = jiraUrl.trim() && !/^https?:\/\/[^\s/]+/i.test(jiraUrl.trim()) ? 'Usá la URL completa, por ejemplo https://empresa.atlassian.net' : null
  const userError = jiraUser.trim() && !jiraUser.includes('@') ? 'Para Jira Cloud va el email de tu cuenta de Atlassian' : null
  const ts = useTestSave('jira', () => ({ url: jiraUrl.trim(), user: jiraUser.trim(), token: jiraToken.trim() }), async () => {
    const ops: Promise<unknown>[] = []
    if (jiraUrl.trim()) ops.push(invoke('settings:set', 'ticket-resolver.jira_url', jiraUrl.trim().replace(/\/+$/, '')))
    if (jiraUser.trim()) ops.push(invoke('settings:set', 'ticket-resolver.jira_user', jiraUser.trim()))
    if (jiraToken.trim()) ops.push(invoke('settings:set', 'ticket-resolver.jira_token', jiraToken.trim()))
    await Promise.all(ops)
    if (jiraToken.trim()) { setTokenConfigured(true); setJiraToken('') }
  }, onStatus)

  const failed = ts.result && !ts.result.ok ? ts.result.detail : null
  const where = failed ? fieldForError(failed) : null
  const complete = Boolean(jiraUrl.trim() && jiraUser.trim() && (jiraToken.trim() || tokenConfigured))
  return (
    <SheetBody
      meta={meta}
      footer={<SheetFooter testing={ts.testing} saving={ts.saving} canTest={complete && !urlError} canSave={Boolean(jiraUrl.trim() || jiraUser.trim() || jiraToken.trim()) && !urlError} onTest={() => void ts.test()} onSave={() => void ts.save()} />}
    >
      <FormField label="URL base de Jira" help="La dirección de tu instancia, ej. https://empresa.atlassian.net" error={urlError ?? (where === 'url' ? failed : null)}>
        <TextInput value={jiraUrl} onChange={(v) => { setJiraUrl(v); ts.setResult(null) }} placeholder="https://empresa.atlassian.net" invalid={Boolean(urlError ?? (where === 'url'))} />
      </FormField>
      <FormField label="Email" help="El de tu cuenta de Atlassian." error={userError}>
        <TextInput type="email" value={jiraUser} onChange={(v) => { setJiraUser(v); ts.setResult(null) }} placeholder="vos@empresa.com" invalid={Boolean(userError)} />
      </FormField>
      <FormField
        label="Token de API"
        help="Se usa junto con el email; no es tu contraseña."
        whereUrl="https://id.atlassian.com/manage-profile/security/api-tokens"
        error={where === 'secret' || where === 'general' ? failed : null}
      >
        <SecretInput value={jiraToken} onChange={(v) => { setJiraToken(v); ts.setResult(null) }} placeholder="Token de API" configured={tokenConfigured} invalid={where === 'secret'} />
      </FormField>
      {ts.result?.ok && <Outcome result={ts.result} />}
    </SheetBody>
  )
}

// ── GitHub / GitLab (OAuth device flow) ────────────────────────────────────────

type PollResult = { status: 'authorized' | 'pending' | 'slow_down' | 'expired' | 'denied' | 'error'; interval?: number; message?: string }

const OAUTH = {
  github: {
    label: 'OAuth App — Client ID', placeholder: 'Ov23li…',
    where: 'https://github.com/settings/developers',
    help: 'OAuth App con "Enable Device Flow" activado. La redirect URI puede ser cualquiera.',
    steps: ['Creá una OAuth App en GitHub → Settings → Developer settings → OAuth Apps.', 'Marcá "Enable Device Flow" y copiá el Client ID.', 'Guardalo y tocá "Iniciar sesión con GitHub".'],
  },
  gitlab: {
    label: 'Application ID', placeholder: 'abc123…',
    where: 'https://gitlab.com/-/user_settings/applications',
    help: 'Application con scope read_api y "Device Authorization Grant" activado.',
    steps: ['Creá una Application en GitLab → Preferences → Applications.', 'Scope read_api y activá "Device Authorization Grant".', 'Guardá el Application ID y tocá "Iniciar sesión con GitLab".'],
  },
} as const

function OAuthSheet({ meta, status, onStatus, id }: SheetProps & { id: 'github' | 'gitlab' }): JSX.Element {
  const cfg = OAUTH[id]
  const toast = useToast()
  const [clientId, setClientId] = useState('')
  const [builtIn, setBuiltIn] = useState(false)
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; username: string | null } | null>(null)
  const [oauthStep, setOauthStep] = useState<{ user_code: string; verification_uri: string; device_code: string } | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = useCallback(async (): Promise<void> => {
    const [cid, me, conf] = await Promise.all([
      invoke<string | null>('settings:get', `repo-search.${id}.client_id`).catch(() => null),
      invoke<{ authenticated: boolean; username: string | null } | null>('repo-search:me', { provider: id }).catch(() => null),
      invoke<boolean>('repo-search:oauth-configured', { provider: id }).catch(() => false),
    ])
    if (cid) setClientId(cid)
    setAuthInfo(me)
    setBuiltIn(Boolean(conf))
  }, [id])

  useEffect(() => { void load() }, [load])

  const recheck = async (): Promise<void> => {
    setTesting(true)
    onStatus({ state: 'checking' })
    onStatus(await checkStored(id))
    setTesting(false)
  }

  const saveClientId = async (): Promise<void> => {
    if (!clientId.trim()) return
    setSaving(true)
    try {
      await invoke('settings:set', `repo-search.${id}.client_id`, clientId.trim())
      setBuiltIn(true)
      toast.show('Client ID guardado', 'success')
    } finally {
      setSaving(false)
    }
  }

  const startOAuth = async (): Promise<void> => {
    setOauthError(null)
    try {
      if (clientId.trim()) await invoke('settings:set', `repo-search.${id}.client_id`, clientId.trim())
      const res = await invoke<{ user_code: string; verification_uri: string; device_code: string; interval?: number }>(`repo-search:${id}-oauth-start`)
      setOauthStep(res)
      let interval = Math.max(5, res.interval ?? 5) * 1000
      const poll = async (): Promise<void> => {
        if (!alive.current) return
        try {
          const r = await invoke<PollResult & { ok?: boolean; error?: string }>(`repo-search:${id}-oauth-poll`, { device_code: res.device_code })
          if (r.status === 'authorized' || r.ok) {
            setOauthStep(null)
            await load()
            await recheck()
            return
          }
          if (r.status === 'pending' || r.error === 'authorization_pending') { setTimeout(() => void poll(), interval); return }
          if (r.status === 'slow_down' || r.error === 'slow_down') { interval = Math.max(interval + 5000, (r.interval ?? 0) * 1000); setTimeout(() => void poll(), interval); return }
          setOauthStep(null)
          setOauthError(r.status === 'expired' ? 'El código expiró. Volvé a intentar.' : r.status === 'denied' ? 'Cancelaste la autorización.' : (r.message ?? r.error ?? 'No se pudo iniciar sesión'))
        } catch (e) {
          setOauthStep(null)
          setOauthError(e instanceof Error ? e.message : 'No se pudo iniciar sesión')
        }
      }
      setTimeout(() => void poll(), interval)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setOauthError(msg.includes('NO_CLIENT_ID') ? 'Falta el Client ID' : msg || 'No se pudo iniciar sesión')
    }
  }

  const logout = async (): Promise<void> => {
    await invoke('repo-search:logout', { provider: id })
    await load()
    onStatus({ state: 'unconfigured', detail: 'No iniciaste sesión', checkedAt: Date.now() })
  }

  const providerName = id === 'github' ? 'GitHub' : 'GitLab'
  return (
    <SheetBody
      meta={meta}
      footer={
        <>
          <button className="ui-btn ui-btn-outline" disabled={!authInfo?.authenticated || testing} onClick={() => void recheck()}>
            {testing ? <><Spinner />Probando…</> : <><Zap size={13} />Probar</>}
          </button>
          <button className="ui-btn ui-btn-primary" disabled={!clientId.trim() || saving} onClick={() => void saveClientId()}>
            {saving ? <><Spinner />Guardando…</> : 'Guardar'}
          </button>
        </>
      }
    >
      {authInfo?.authenticated ? (
        <SessionRow username={authInfo.username} onLogout={() => void logout()} />
      ) : (
        <HowTo steps={cfg.steps.map((s) => s)} />
      )}
      <FormField label={cfg.label} help={builtIn && !clientId ? 'Usando el Client ID incluido en la app. Podés poner el tuyo.' : cfg.help} whereUrl={cfg.where} whereLabel="Crear la app">
        <TextInput value={clientId} onChange={setClientId} placeholder={cfg.placeholder} />
      </FormField>
      {oauthStep && <DeviceCodeBox uri={oauthStep.verification_uri} code={oauthStep.user_code} />}
      {oauthError && <Outcome result={{ ok: false, detail: oauthError }} />}
      {!authInfo?.authenticated && !oauthStep && (
        <button className="ui-btn ui-btn-dark self-start" disabled={!clientId.trim() && !builtIn} onClick={() => void startOAuth()}>
          Iniciar sesión con {providerName}
        </button>
      )}
      {status.state === 'error' && authInfo?.authenticated && (
        <p className="t-caption text-on-surface-variant">Si la sesión expiró, desconectá y volvé a iniciar sesión.</p>
      )}
    </SheetBody>
  )
}

// ── Bitbucket ──────────────────────────────────────────────────────────────────

function BitbucketSheet({ meta, onStatus }: SheetProps): JSX.Element {
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [token, setToken] = useState('')
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; username: string | null; workspace: string | null } | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const isBearer = token.startsWith('ATCTT')

  const load = useCallback(async (): Promise<void> => {
    const [me, ws] = await Promise.all([
      invoke<{ authenticated: boolean; username: string | null; workspace: string | null } | null>('repo-search:me', { provider: 'bitbucket' }).catch(() => null),
      invoke<string | null>('settings:get', 'bitbucket.workspace').catch(() => null),
    ])
    setAuthInfo(me)
    if (ws) setWorkspace(ws)
  }, [])
  useEffect(() => { void load() }, [load])

  const canConnect = Boolean(token.trim() && workspace.trim() && (isBearer || username.trim()))
  const values = (): Record<string, string> => ({ token: token.trim(), username: username.trim(), workspace: workspace.trim() })

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try { setResult(await invoke<TestResult>('settings:test-connection', 'bitbucket', values())) }
    catch (e) { setResult({ ok: false, configured: true, detail: e instanceof Error ? e.message : 'No se pudo probar' }) }
    finally { setTesting(false) }
  }

  const connect = async (): Promise<void> => {
    if (!canConnect) return
    setSaving(true)
    setResult(null)
    try {
      const r = await invoke<{ ok: boolean; error?: string }>('repo-search:login', { provider: 'bitbucket', ...values() })
      if (!r.ok) { setResult({ ok: false, configured: true, detail: r.error ?? 'Falló la autenticación' }); return }
      await invoke('settings:set', 'bitbucket.workspace', workspace.trim())
      setToken('')
      await load()
      onStatus({ state: 'checking' })
      onStatus(await checkStored('bitbucket'))
      toast.show('Bitbucket conectado', 'success')
    } catch (e) {
      setResult({ ok: false, configured: true, detail: e instanceof Error ? e.message : 'Falló la autenticación — revisá tus credenciales' })
    } finally {
      setSaving(false)
    }
  }

  const logout = async (): Promise<void> => {
    await invoke('repo-search:logout', { provider: 'bitbucket' })
    await load()
    onStatus({ state: 'unconfigured', detail: 'Falta el token de acceso', checkedAt: Date.now() })
  }

  const failed = result && !result.ok ? result.detail : null
  if (authInfo?.authenticated) {
    return (
      <SheetBody meta={meta} footer={<button className="ui-btn ui-btn-outline" disabled={testing} onClick={() => { setTesting(true); onStatus({ state: 'checking' }); void checkStored('bitbucket').then((s) => { onStatus(s); setTesting(false) }) }}>{testing ? <><Spinner />Probando…</> : <><Zap size={13} />Probar</>}</button>}>
        <SessionRow username={authInfo.username} extra={authInfo.workspace} onLogout={() => void logout()} />
      </SheetBody>
    )
  }
  return (
    <SheetBody
      meta={meta}
      footer={<SheetFooter testing={testing} saving={saving} canTest={canConnect} canSave={canConnect} onTest={() => void test()} onSave={() => void connect()} saveLabel="Conectar" />}
    >
      <HowTo steps={[
        <><span className="font-medium text-on-surface">API token de Atlassian</span> (recomendado, ATATT…): elegí Bitbucket con scopes Account → Read y Repositories → Read; usuario = tu email.</>,
        <><span className="font-medium text-on-surface">Access token de workspace</span> (ATCTT…): Workspace settings → Access tokens, scope repository:read; no necesita usuario.</>,
        <><span className="font-medium text-on-surface">App Password</span> (ATBB…, legacy): usá tu usuario de Bitbucket, no el email.</>,
      ]} />
      <div className="grid grid-cols-2 gap-3">
        <FormField label={isBearer ? 'Usuario (opcional)' : 'Usuario / email'} help={isBearer ? 'No hace falta para tokens ATCTT' : 'Email para ATATT, usuario para ATBB'}>
          <TextInput value={username} onChange={(v) => { setUsername(v); setResult(null) }} placeholder={isBearer ? 'opcional' : 'vos@empresa.com'} />
        </FormField>
        <FormField label="Workspace" help="El que aparece en la URL de tus repos" error={failed && /workspace|404/i.test(failed) ? failed : null}>
          <TextInput value={workspace} onChange={(v) => { setWorkspace(v); setResult(null) }} placeholder="mi-workspace" />
        </FormField>
      </div>
      <FormField label="Token de acceso" whereUrl="https://id.atlassian.com/manage-profile/security/api-tokens" error={failed && !/workspace|404/i.test(failed) ? failed : null}>
        <SecretInput value={token} onChange={(v) => { setToken(v); setResult(null) }} placeholder="ATATT…, ATCTT… o ATBB…" invalid={Boolean(failed)} />
      </FormField>
      {result?.ok && <Outcome result={result} />}
    </SheetBody>
  )
}

// ── Supabase (guided setup) ────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  settings: 'Ajustes de la app',
  'local-file': 'archivo gastos-supabase.local.json',
  env: 'variables de entorno (.env)',
  none: 'sin configurar',
}

const KEY_KIND_INFO: Record<SupabaseKeyKind, { tone: 'ok' | 'warn' | 'none'; text: string }> = {
  service_role: { tone: 'ok', text: 'Clave service_role detectada.' },
  secret: { tone: 'ok', text: 'Clave secreta (sb_secret_…) detectada.' },
  anon: { tone: 'warn', text: 'Esta es la clave anon (pública). Gastos necesita la service_role: en API Keys tocá "Reveal" en service_role.' },
  publishable: { tone: 'warn', text: 'Esta es la clave publishable (pública). Usá una clave secreta (sb_secret_…) o la service_role.' },
  'other-jwt': { tone: 'warn', text: 'El token no es de tipo service_role. Revisá que hayas copiado la clave correcta.' },
  unknown: { tone: 'warn', text: 'No parece una clave de Supabase (JWT eyJ… o sb_secret_…).' },
  empty: { tone: 'none', text: '' },
}

function CheckRow({ ok, pending, label, detail }: { ok: boolean | null; pending?: boolean; label: string; detail?: string }): JSX.Element {
  return (
    <li className="flex items-start gap-2.5 t-footnote">
      <span className="mt-px shrink-0">
        {pending ? <Spinner />
          : ok === true ? <CheckCircle2 size={14} className="text-success" />
          : ok === false ? <CircleAlert size={14} className="text-error" />
          : <Circle size={14} className="text-on-surface-variant/50" />}
      </span>
      <span className="min-w-0">
        <span className={ok === false ? 'text-error' : 'text-on-surface'}>{label}</span>
        {detail && <span className="text-on-surface-variant"> — {detail}</span>}
      </span>
    </li>
  )
}

function SupabaseSheet({ meta, onStatus }: SheetProps): JSX.Element {
  const toast = useToast()
  const [current, setCurrent] = useState<{ url: string; keyConfigured: boolean } | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [health, setHealth] = useState<SupabaseHealth | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadCurrent = useCallback(async (): Promise<void> => {
    const [cfg, src] = await Promise.all([
      invoke<{ url: string; keyConfigured: boolean } | null>('gastos:supabase-config-get').catch(() => null),
      invoke<{ source: string }>('settings:supabase-source').catch(() => null),
    ])
    setCurrent(cfg)
    setSource(src?.source ?? null)
    if (cfg?.url) setUrlInput((prev) => prev || cfg.url)
  }, [])
  useEffect(() => { void loadCurrent() }, [loadCurrent])

  const norm = normalizeSupabaseUrl(urlInput)
  const urlError = urlInput.trim() && !norm ? 'Pegá la Project URL (https://xxxx.supabase.co) o el Reference ID del proyecto' : null
  const kind = detectSupabaseKeyKind(key)
  const kindInfo = KEY_KIND_INFO[kind]
  const sameAsCurrent = Boolean(norm && current?.url && norm.url === normalizeSupabaseUrl(current.url)?.url)
  const usingStoredKey = !key.trim() && sameAsCurrent && Boolean(current?.keyConfigured)
  const canVerify = Boolean(norm) && (Boolean(key.trim()) || usingStoredKey)
  const ref = norm?.ref ?? null
  const missing = health ? missingTables(health) : []
  const healthy = Boolean(health?.reachable && health.authOk && missing.length === 0)

  const verify = async (): Promise<void> => {
    if (!norm) return
    setChecking(true)
    setCheckError(null)
    setHealth(null)
    try {
      const h = usingStoredKey
        ? await invoke<SupabaseHealth>('gastos:supabase-health')
        : await invoke<SupabaseHealth>('gastos:supabase-test', norm.url, key.trim())
      setHealth(h)
      if (usingStoredKey) onStatus(statusFromHealth(h))
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setCheckError(msg.includes('IPC invoke blocked') ? 'La verificación todavía no está disponible en esta versión. Podés guardar igual.' : msg || 'No se pudo verificar')
    } finally {
      setChecking(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!norm) return
    setSaving(true)
    try {
      await invoke('gastos:supabase-config-save', { url: norm.url, serviceKey: key.trim() })
      window.dispatchEvent(new CustomEvent('setto:supabase-config-changed'))
      setKey('')
      await loadCurrent()
      onStatus({ state: 'checking' })
      const s = await checkStored('supabase')
      onStatus(s)
      toast.show(s.state === 'connected' ? 'Supabase guardado y verificado' : 'Supabase guardado', s.state === 'connected' ? 'success' : 'info')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const copySql = async (): Promise<void> => {
    if (!health?.missingSql) return
    try {
      await navigator.clipboard.writeText(health.missingSql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.show('No se pudo copiar', 'error')
    }
  }

  const step = (n: number, title: string, body: React.ReactNode, done?: boolean): JSX.Element => (
    <section className="flex gap-3">
      <span className={`shrink-0 w-6 h-6 rounded-full t-caption font-semibold flex items-center justify-center ${done ? 'bg-success/[0.14] text-success' : 'bg-selected text-primary'}`}>
        {done ? <Check size={12} /> : n}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-3 pt-0.5">
        <p className="t-body font-medium text-on-surface">{title}</p>
        {body}
      </div>
    </section>
  )

  return (
    <SheetBody
      meta={meta}
      footer={
        <>
          <button className="ui-btn ui-btn-outline" disabled={!canVerify || checking || saving} onClick={() => void verify()}>
            {checking ? <><Spinner />Verificando…</> : <><Zap size={13} />{health ? 'Verificar de nuevo' : 'Verificar'}</>}
          </button>
          <button
            className="ui-btn ui-btn-primary"
            disabled={!norm || saving || checking || (!key.trim() && sameAsCurrent) || isPublicSupabaseKey(kind)}
            onClick={() => void save()}
          >
            {saving ? <><Spinner />Guardando…</> : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="rounded-xl bg-on-surface/[0.035] dark:bg-on-surface/5 px-3.5 py-2.5 t-footnote text-on-surface-variant flex flex-col gap-0.5">
        <span>
          En uso: <span className="font-mono text-on-surface break-all">{current?.url || '—'}</span>
        </span>
        {source && <span>Origen: {SOURCE_LABEL[source] ?? source}{current?.url && !current.keyConfigured ? ' · falta la clave' : ''}</span>}
      </div>

      {step(1, 'Proyecto y clave', (
        <>
          <FormField
            label="Project URL o Reference ID"
            help={norm && norm.url !== urlInput.trim() ? <>Se va a usar <span className="font-mono">{norm.url}</span></> : 'Podés pegar la URL del proyecto, la del dashboard o solo el ID.'}
            whereUrl={supabaseApiKeysUrl(ref)}
            whereLabel="Abrir API Keys"
            error={urlError}
          >
            <TextInput value={urlInput} onChange={(v) => { setUrlInput(v); setHealth(null) }} placeholder="https://xxxx.supabase.co" invalid={Boolean(urlError)} />
          </FormField>
          <FormField
            label="Clave service_role"
            help={kindInfo.tone === 'ok'
              ? <span className="text-success">{kindInfo.text}</span>
              : 'Settings → API Keys → service_role (secret). Se usa solo en el proceso principal; nunca llega a la interfaz.'}
            error={kindInfo.tone === 'warn' ? kindInfo.text : null}
          >
            <SecretInput
              value={key}
              onChange={(v) => { setKey(v); setHealth(null) }}
              placeholder="eyJ… o sb_secret_…"
              configured={sameAsCurrent && Boolean(current?.keyConfigured)}
              invalid={kindInfo.tone === 'warn'}
            />
          </FormField>
          {norm && !sameAsCurrent && !key.trim() && current?.url && (
            <p className="t-caption text-warning">Cambiaste de proyecto: pegá la clave service_role del proyecto nuevo.</p>
          )}
        </>
      ), Boolean(norm && (key.trim() ? !isPublicSupabaseKey(kind) && kind !== 'unknown' : usingStoredKey)))}

      {step(2, 'Verificar conexión', (
        <>
          {!health && !checking && !checkError && (
            <p className="t-footnote text-on-surface-variant">Tocá “Verificar” para probar la URL y la clave sin guardarlas.</p>
          )}
          {checkError && <Outcome result={{ ok: false, detail: checkError }} />}
          {(checking || health) && (
            <ul className="flex flex-col gap-1.5">
              <CheckRow pending={checking} ok={health ? health.reachable : null} label="El proyecto responde" detail={health?.reachable && health.latencyMs !== undefined ? `${health.latencyMs} ms` : !health?.reachable ? health?.error : undefined} />
              <CheckRow pending={checking} ok={health ? (health.reachable ? health.authOk : null) : null} label="La clave es válida" detail={health?.reachable && !health.authOk ? health.error : undefined} />
              {SUPABASE_TABLES.map((t) => (
                <CheckRow key={t} pending={checking} ok={health?.authOk ? (health.tables?.[t] ?? null) : null} label={`Tabla ${t}`} detail={health?.authOk && health.tables?.[t] === false ? 'falta crearla' : undefined} />
              ))}
            </ul>
          )}
          {healthy && <Outcome result={{ ok: true, detail: 'Todo en orden. Guardá para empezar a usar este proyecto.' }} />}
        </>
      ), healthy)}

      {health?.authOk && missing.length > 0 && step(3, 'Crear las tablas que faltan', (
        <>
          <p className="t-footnote text-on-surface-variant">
            Copiá este SQL, pegalo en el SQL Editor del proyecto y tocá <span className="font-medium text-on-surface">Run</span>. Después volvé y tocá “Verificar de nuevo”.
          </p>
          {health.missingSql ? (
            <div className="relative">
              <pre className="ui-input font-mono t-caption max-h-56 overflow-auto whitespace-pre pr-12 py-2.5">{health.missingSql}</pre>
              <button className="ui-btn ui-btn-ghost ui-btn-sm absolute top-1.5 right-1.5" onClick={() => void copySql()} aria-label="Copiar SQL">
                {copied ? <><Check size={12} className="text-success" />Copiado</> : <><Copy size={12} />Copiar</>}
              </button>
            </div>
          ) : (
            <p className="t-footnote text-on-surface-variant">Aplicá las migraciones de <span className="font-mono">supabase/migrations</span> del repo.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {ref && (
              <a href={supabaseSqlEditorUrl(ref)} target="_blank" rel="noreferrer" className="ui-btn ui-btn-outline ui-btn-sm">
                <ExternalLink size={12} />Abrir SQL Editor
              </a>
            )}
            <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={checking} onClick={() => void verify()}>
              <RefreshCw size={12} />Verificar de nuevo
            </button>
          </div>
        </>
      ))}

      {step(health?.authOk && missing.length > 0 ? 4 : 3, 'Guardar', (
        <p className="t-footnote text-on-surface-variant">
          Se guarda cifrado en esta computadora y tiene prioridad sobre .env y gastos-supabase.local.json. Gastos y Credenciales se reconectan solos.
        </p>
      ))}
    </SheetBody>
  )
}

// ── Sheet wrapper ──────────────────────────────────────────────────────────────

/** Sheet content: status banner + fields. Footer is lifted to the Sheet via context-free prop drilling. */
function SheetBody({ meta, footer, children }: { meta: IntegrationMeta; footer?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  const ctx = useContext(SheetCtx)
  return (
    <Sheet open onClose={ctx.onClose} title={meta.name} subtitle={meta.purpose} width={480} footer={footer}>
      <div className="flex flex-col gap-4">
        <StatusBanner meta={meta} status={ctx.status} />
        {children}
      </div>
    </Sheet>
  )
}

const SheetCtx = createContext<{ status: ConnStatus; onClose: () => void }>({ status: { state: 'idle' }, onClose: () => undefined })

function ConfigSheet(props: SheetProps): JSX.Element {
  const { meta } = props
  const body = ((): JSX.Element => {
    switch (meta.id) {
      case 'openai':
      case 'anthropic': return <ApiKeySheet {...props} id={meta.id} />
      case 'ollama': return <OllamaSheet {...props} />
      case 'github':
      case 'gitlab': return <OAuthSheet {...props} id={meta.id} />
      case 'bitbucket': return <BitbucketSheet {...props} />
      case 'jira': return <JiraSheet {...props} />
      case 'supabase': return <SupabaseSheet {...props} />
    }
  })()
  return <SheetCtx.Provider value={{ status: props.status, onClose: props.onClose }}>{body}</SheetCtx.Provider>
}

// ── Overview ───────────────────────────────────────────────────────────────────

function IntegrationCard({
  meta, status, onTest, onConfigure,
}: {
  meta: IntegrationMeta; status: ConnStatus; onTest: () => void; onConfigure: () => void
}): JSX.Element {
  const checking = status.state === 'checking'
  return (
    <article className="ui-card p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <LogoTile Logo={meta.Logo} />
        <div className="flex-1 min-w-0">
          <h3 className="t-body font-semibold text-on-surface truncate">{meta.name}</h3>
          <p className="t-footnote text-on-surface-variant truncate" title={meta.purpose}>{meta.purpose}</p>
        </div>
        <ConnPill status={status} />
      </div>
      <p
        className={`t-footnote min-h-[18px] truncate ${status.state === 'error' ? 'text-error' : 'text-on-surface-variant'}`}
        title={status.detail}
      >
        {checking ? 'Probando conexión…' : status.detail ?? 'Todavía no se verificó'}
      </p>
      {/* La hora de la última prueba va en su propia línea: en el pie no entra junto a los botones. */}
      <p className="t-caption text-on-surface-variant/80 -mt-2 truncate inline-flex items-center gap-1">
        <Clock size={11} className="shrink-0" />{formatCheckedAt(status.checkedAt)}
      </p>
      <div className="flex items-center justify-end gap-2 hairline-t pt-3 -mx-4 px-4">
        <button className="ui-btn ui-btn-ghost ui-btn-sm" disabled={checking} onClick={onTest}>
          {checking ? <Spinner /> : <Zap size={12} />}Probar
        </button>
        <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={onConfigure}>
          <Settings size={12} />Configurar
        </button>
      </div>
    </article>
  )
}

export function ConnectionsPlugin(): JSX.Element {
  const [statuses, setStatuses] = useState<Record<ConnId, ConnStatus>>(loadLastStatuses)
  const [openId, setOpenId] = useState<ConnId | null>(null)
  // Otros módulos (p. ej. Gastos → "Abrir Conexiones") piden abrir una integración puntual
  usePluginIntent('connections', (intent) => {
    if (intent.action === 'supabase') setOpenId('supabase')
  })

  const setStatus = useCallback((id: ConnId, s: ConnStatus): void => {
    setStatuses((prev) => ({ ...prev, [id]: s }))
  }, [])

  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  const check = useCallback(async (id: ConnId): Promise<void> => {
    setStatus(id, { ...statusesRef.current[id], state: 'checking' })
    setStatus(id, await checkStored(id))
  }, [setStatus])

  const checkAll = useCallback(async (): Promise<void> => {
    await Promise.all(ALL.map((m) => check(m.id)))
  }, [check])

  useEffect(() => { void checkAll() }, [checkAll])

  // Persist the last finished results so "last checked" survives reopening the module.
  useEffect(() => {
    if (Object.values(statuses).some((s) => s.state === 'checking')) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses)) } catch { /* ignore */ }
  }, [statuses])

  // Gastos (or anything else) may change the Supabase config: re-check it.
  useEffect(() => {
    const onChange = (): void => { void check('supabase') }
    window.addEventListener('setto:supabase-config-changed', onChange)
    return () => window.removeEventListener('setto:supabase-config-changed', onChange)
  }, [check])

  const summary = useMemo(() => summarizeStatuses(ALL.map((m) => statuses[m.id])), [statuses])
  const anyChecking = summary.checking > 0

  return (
    <div className="px-6 py-5 max-w-5xl mx-auto w-full flex flex-col gap-6">
      <PageHeader
        title="Conexiones"
        subtitle={summary.text}
        actions={
          <button className="ui-btn ui-btn-outline" disabled={anyChecking} onClick={() => void checkAll()}>
            {anyChecking ? <Spinner /> : <RefreshCw size={13} />}Probar todas
          </button>
        }
      />

      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-2.5">
          <h2 className="t-section">{g.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {g.items.map((m) => (
              <IntegrationCard
                key={m.id}
                meta={m}
                status={statuses[m.id]}
                onTest={() => void check(m.id)}
                onConfigure={() => setOpenId(m.id)}
              />
            ))}
          </div>
        </section>
      ))}

      <SqlConnections />

      <p className="t-caption text-on-surface-variant">
        Las claves se guardan cifradas en esta computadora y nunca se muestran en texto plano.
      </p>

      {openId && (
        <ConfigSheet
          key={openId}
          meta={META[openId]}
          status={statuses[openId]}
          onStatus={(s) => setStatus(openId, s)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
