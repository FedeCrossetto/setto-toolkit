import { useState, useEffect } from 'react'
import {
  Check, CheckCircle2, ChevronDown, CircleAlert, Download,
  Eye, EyeOff, Lock, Moon, Sun, Upload,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { allPlugins } from '../../core/plugin-registry'
import { PluginIcon } from '../../core/pluginIcons'
import { useAppFont, APP_FONT_FAMILIES, APP_FONT_SIZES } from '../../core/hooks/useAppFont'
import { useThemePalette, PALETTES } from '../../core/hooks/useThemePalette'

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-lg p-1',
        'transition-colors duration-200 ease-in-out focus:outline-none',
        enabled ? 'bg-primary' : 'bg-outline-variant/30',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-md bg-white shadow-sm',
          'transform transition-transform duration-200 ease-in-out',
          enabled ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

interface SettingsState {
  'ai.provider': string
  'ai.openai_key': string
  'ai.model': string
  'ai.anthropic_key': string
  'ai.anthropic_model': string
  'ai.ollama_url': string
  'ai.ollama_model': string
  'ai.ollama_timeout': string
  'bitbucket.workspace': string
  'repo-search.github.client_id': string
  'repo-search.gitlab.client_id': string
  'dashboard.mascot': string
}

/** Sentinel returned by the main process when a secure key is already set. */
const SECURE_SET_SENTINEL = '__CONFIGURED__'

const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
const ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']
type AIProvider = 'openai' | 'anthropic' | 'ollama'

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-8 py-5 border-b border-outline-variant/15 last:border-0">
      <div>
        <div className="text-sm font-semibold text-on-surface">{label}</div>
        {description && <div className="text-xs text-on-surface-variant mt-1">{description}</div>}
      </div>
      <div className="flex-shrink-0 w-72">{children}</div>
    </div>
  )
}

export function SettingsPage(): JSX.Element {
  const { state, dispatch } = useApp()
  const { prefs: fontPrefs, updateFont } = useAppFont()
  const { palette, setPalette } = useThemePalette()
  const [settings, setSettings] = useState<SettingsState>({
    'ai.provider': 'openai',
    'ai.openai_key': '',
    'ai.model': 'gpt-4o-mini',
    'ai.anthropic_key': '',
    'ai.anthropic_model': 'claude-sonnet-4-5-20251001',
    'ai.ollama_url': 'http://localhost:11434',
    'ai.ollama_model': 'llama3',
    'ai.ollama_timeout': '30',
    'bitbucket.workspace': '',
    'repo-search.github.client_id': '',
    'repo-search.gitlab.client_id': '',
    'dashboard.mascot': 'setto-avatar',
  })
  const [saved, setSaved] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [openAIKeyConfigured, setOpenAIKeyConfigured] = useState(false)
  const [anthropicKeyConfigured, setAnthropicKeyConfigured] = useState(false)
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)

  useEffect(() => {
    void window.api.invoke<boolean>('settings:encryption-available').then(setEncryptionAvailable).catch(() => {})
  }, [])

  useEffect(() => {
    const load = async (): Promise<void> => {
      const keys: (keyof SettingsState)[] = [
        'ai.provider', 'ai.openai_key', 'ai.model',
        'ai.anthropic_key', 'ai.anthropic_model',
        'ai.ollama_url', 'ai.ollama_model', 'ai.ollama_timeout',
        'bitbucket.workspace',
        'repo-search.github.client_id',
        'repo-search.gitlab.client_id',
        'dashboard.mascot',
      ]
      const values = await Promise.all(keys.map((k) => window.api.invoke<string | null>('settings:get', k)))
      setSettings((prev) => {
        const updated = { ...prev }
        keys.forEach((k, i) => {
          const v = values[i]
          if (!v) return
          if (k === 'ai.openai_key' && v === SECURE_SET_SENTINEL) {
            setOpenAIKeyConfigured(true)
            updated[k] = ''
          } else if (k === 'ai.anthropic_key' && v === SECURE_SET_SENTINEL) {
            setAnthropicKeyConfigured(true)
            updated[k] = ''
          } else {
            updated[k] = v
          }
        })
        return updated
      })
    }
    load()
  }, [])

  const handleSave = async (): Promise<void> => {
    const MASKED: Record<string, boolean> = {
      'ai.openai_key': openAIKeyConfigured,
      'ai.anthropic_key': anthropicKeyConfigured,
    }
    const entries = Object.entries(settings) as [string, string][]
    await Promise.all(
      entries
        .filter(([k, v]) => {
          if (MASKED[k] && v === '') return false
          if (!v.trim()) return false
          return true
        })
        .map(([k, v]) => window.api.invoke('settings:set', k, v))
    )
    if (settings['ai.openai_key'].trim()) setOpenAIKeyConfigured(true)
    if (settings['ai.anthropic_key'].trim()) setAnthropicKeyConfigured(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const update = (key: keyof SettingsState, value: string): void => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const provider = (settings['ai.provider'] || 'openai') as AIProvider

  const inputCls =
    'w-full bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-colors'

  return (
    <div className="p-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Settings</h1>
        <p className="text-on-surface-variant mt-1 text-sm">Configure API keys and workspace preferences.</p>
      </div>

      {/* Encryption warning */}
      {!encryptionAvailable && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <CircleAlert size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            <span className="font-semibold">El cifrado de credenciales no está disponible</span> en este entorno.
            Las API keys se guardarán en texto plano. Esto puede ocurrir en VMs sin credential manager o en CI.
          </p>
        </div>
      )}

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Appearance</h2>
        <div className="bg-surface rounded-xl border border-outline-variant/20 px-6">
          <SettingRow label="Theme" description="Choose between light and dark interface.">
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => dispatch({ type: 'SET_THEME', theme: t })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    state.theme === t
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/40'
                  }`}
                >
                  {t === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Font family" description="Global UI font. Takes effect immediately.">
            <div className="flex flex-col gap-1.5">
              {APP_FONT_FAMILIES.map((f) => (
                <button
                  key={f.label}
                  onClick={() => updateFont({ fontFamily: f.label })}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-all ${
                    fontPrefs.fontFamily === f.label
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/30'
                  }`}
                  style={{ fontFamily: f.stack }}
                >
                  <span>{f.label}</span>
                  {fontPrefs.fontFamily === f.label && (
                    <Check size={14} />
                  )}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Font size" description="Scales the entire UI. Default is Normal.">
            <div className="flex gap-2">
              {(Object.keys(APP_FONT_SIZES) as Array<keyof typeof APP_FONT_SIZES>).map((size) => (
                <button
                  key={size}
                  onClick={() => updateFont({ fontSize: size })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${
                    fontPrefs.fontSize === size
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/40'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            label="Dashboard mascot"
            description="Character shown on the dashboard tool cards."
          >
            <div className="flex gap-3">
              {([
                { id: 'panda',        label: 'Panda',        icon: '🐼', hint: 'Default mascot' },
                { id: 'setto-avatar', label: 'Setto Avatar', icon: '🎭', hint: 'Custom — add PNGs to public/setto-avatar/' },
              ] as const).map(({ id, label, icon, hint }) => {
                const active = (settings['dashboard.mascot'] || 'setto-avatar') === id
                return (
                  <button
                    key={id}
                    onClick={() => {
                      update('dashboard.mascot', id)
                      void window.api.invoke('settings:set', 'dashboard.mascot', id)
                      window.dispatchEvent(new CustomEvent('mascot-change', { detail: id }))
                    }}
                    title={hint}
                    className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-sm transition-all ${
                      active
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/30'
                    }`}
                  >
                    <span className="text-2xl leading-none">{icon}</span>
                    <span className="text-xs font-semibold">{label}</span>
                    {active && (
                      <CheckCircle2 size={13} className="text-primary" />
                    )}
                  </button>
                )
              })}
            </div>
          </SettingRow>

          <SettingRow label="Color palette" description="Changes the primary accent colors across the entire app.">
            <div className="grid grid-cols-2 gap-2">
              {PALETTES.map((p) => {
                const active = palette === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setPalette(p.id)}
                    className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left ${
                      active
                        ? 'border-transparent ring-2 ring-offset-1 ring-offset-surface bg-surface-container-high'
                        : 'border-outline-variant/30 bg-surface-container hover:border-outline-variant/60'
                    }`}
                    style={active ? { ['--tw-ring-color' as string]: p.from } : undefined}
                  >
                    {/* Gradient swatch */}
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                    />
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold truncate ${active ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                        {p.name}
                      </div>
                      <div className="text-[10px] text-on-surface-variant/60 truncate">{p.label}</div>
                    </div>
                    {active && (
                      <Check
                        size={12}
                        className="absolute top-1.5 right-1.5 text-white"
                        style={{ background: p.from, borderRadius: '50%', padding: '1px' }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </SettingRow>
        </div>
      </section>

      {/* AI Section */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">AI Service</h2>
        <div className="bg-surface rounded-xl border border-outline-variant/20 px-6">

          {/* Provider selector */}
          <SettingRow label="Provider" description="Which AI service to use for Smart Diff analysis.">
            <div className="flex gap-2">
              {(['openai', 'anthropic', 'ollama'] as AIProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => update('ai.provider', p)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize transition-all ${
                    provider === p
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container border-outline-variant/30 text-on-surface-variant hover:border-primary/40'
                  }`}
                >
                  {p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : 'Ollama'}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* OpenAI */}
          {provider === 'openai' && (
            <>
              <SettingRow label="OpenAI API Key" description="Stored encrypted locally. Never leaves your machine.">
                <div className="flex flex-col gap-2">
                  {openAIKeyConfigured && !settings['ai.openai_key'] && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent font-medium">
                      <Lock size={14} />
                      API key is configured
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type={showOpenAIKey ? 'text' : 'password'}
                      value={settings['ai.openai_key']}
                      onChange={(e) => { update('ai.openai_key', e.target.value); if (!e.target.value) setOpenAIKeyConfigured(false) }}
                      placeholder={openAIKeyConfigured ? 'Enter new key to replace…' : 'sk-…'}
                      className={inputCls + ' pr-10'}
                    />
                    <button onClick={() => setShowOpenAIKey((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary">
                      {showOpenAIKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </SettingRow>
              <SettingRow label="Model" description="OpenAI model for completions.">
                <div className="relative">
                  <select value={settings['ai.model']} onChange={(e) => update('ai.model', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                    {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
                </div>
              </SettingRow>
            </>
          )}

          {/* Anthropic */}
          {provider === 'anthropic' && (
            <>
              <SettingRow label="Anthropic API Key" description="Stored encrypted locally. Never leaves your machine.">
                <div className="flex flex-col gap-2">
                  {anthropicKeyConfigured && !settings['ai.anthropic_key'] && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent font-medium">
                      <Lock size={14} />
                      API key is configured
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={settings['ai.anthropic_key']}
                      onChange={(e) => { update('ai.anthropic_key', e.target.value); if (!e.target.value) setAnthropicKeyConfigured(false) }}
                      placeholder={anthropicKeyConfigured ? 'Enter new key to replace…' : 'sk-ant-…'}
                      className={inputCls + ' pr-10'}
                    />
                    <button onClick={() => setShowAnthropicKey((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary">
                      {showAnthropicKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </SettingRow>
              <SettingRow label="Model" description="Anthropic Claude model for completions.">
                <div className="relative">
                  <select value={settings['ai.anthropic_model']} onChange={(e) => update('ai.anthropic_model', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                    {ANTHROPIC_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" />
                </div>
              </SettingRow>
            </>
          )}

          {/* Ollama (local) */}
          {provider === 'ollama' && (
            <>
              <SettingRow label="Ollama URL" description="Base URL of your local Ollama instance.">
                <input
                  type="text"
                  value={settings['ai.ollama_url']}
                  onChange={(e) => update('ai.ollama_url', e.target.value)}
                  placeholder="http://localhost:11434"
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Model" description="Ollama model tag (e.g. llama3, qwen3:14b, mistral).">
                <input
                  type="text"
                  value={settings['ai.ollama_model']}
                  onChange={(e) => update('ai.ollama_model', e.target.value)}
                  placeholder="llama3"
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow
                label="Timeout (minutos)"
                description="Tiempo máximo de espera. Aumentalo para modelos grandes como qwen3:14b en CPU."
              >
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={settings['ai.ollama_timeout']}
                  onChange={(e) => update('ai.ollama_timeout', e.target.value)}
                  placeholder="30"
                  className={inputCls}
                />
              </SettingRow>
            </>
          )}

        </div>
      </section>

      {/* Integrations Section */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-secondary mb-3">Integrations</h2>
        <div className="bg-surface rounded-xl border border-outline-variant/20 px-6">

          {/* GitHub OAuth App Client ID */}
          <SettingRow
            label="GitHub OAuth App — Client ID"
            description={
              <span>
                Required for Sign in with GitHub (Device Flow).{' '}
                <span className="text-on-surface-variant/60">
                  github.com → Settings → Developer settings → OAuth Apps → New OAuth App → Enable Device Flow → copy the Client ID.
                </span>
              </span>
            }
          >
            <input
              type="text"
              value={settings['repo-search.github.client_id']}
              onChange={(e) => update('repo-search.github.client_id', e.target.value)}
              placeholder="Ov23li…"
              className={inputCls}
            />
          </SettingRow>

          {/* GitLab OAuth Application ID */}
          <SettingRow
            label="GitLab OAuth Application — Application ID"
            description={
              <span>
                Required for Sign in with GitLab (Device Flow).{' '}
                <span className="text-on-surface-variant/60">
                  gitlab.com → Preferences → Applications → New application → Scope: read_api → Enable Device Authorization Grant → copy the Application ID.
                </span>
              </span>
            }
          >
            <input
              type="text"
              value={settings['repo-search.gitlab.client_id']}
              onChange={(e) => update('repo-search.gitlab.client_id', e.target.value)}
              placeholder="abc123def456…"
              className={inputCls}
            />
          </SettingRow>

          {/* Bitbucket default workspace */}
          <SettingRow label="Bitbucket — Default Workspace" description="Default workspace slug for Bitbucket searches.">
            <input
              type="text"
              value={settings['bitbucket.workspace']}
              onChange={(e) => update('bitbucket.workspace', e.target.value)}
              placeholder="my-workspace"
              className={inputCls}
            />
          </SettingRow>

        </div>
      </section>

      {/* Backup / Restore */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Backup &amp; Restore</h2>
        <div className="bg-surface rounded-xl border border-outline-variant/20 px-6">
          <SettingRow
            label="Export Settings"
            description="Save non-sensitive settings (models, workspace, aliases) to a JSON file. API keys are never exported."
          >
            <button
              onClick={async () => {
                try {
                  const res = await window.api.invoke<{ ok: boolean; canceled?: boolean }>('settings:export')
                  if (!res.canceled) setImportMsg({ ok: true, text: 'Settings exported.' })
                } catch (e) {
                  setImportMsg({ ok: false, text: e instanceof Error ? e.message : 'Export failed' })
                }
                setTimeout(() => setImportMsg(null), 3000)
              }}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Download size={16} />
              Export JSON
            </button>
          </SettingRow>

          <SettingRow
            label="Import Settings"
            description="Load settings from a previously exported JSON file. Existing values will be overwritten."
          >
            <button
              onClick={async () => {
                try {
                  const res = await window.api.invoke<{ ok: boolean; canceled?: boolean; count?: number }>('settings:import')
                  if (!res.canceled) {
                    setImportMsg({ ok: true, text: `Imported ${res.count ?? 0} setting(s). Reload to apply.` })
                  }
                } catch (e) {
                  setImportMsg({ ok: false, text: e instanceof Error ? e.message : 'Import failed' })
                }
                setTimeout(() => setImportMsg(null), 4000)
              }}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Upload size={16} />
              Import JSON
            </button>
          </SettingRow>

          {importMsg && (
            <div className={`mx-0 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${importMsg.ok ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-error/10 text-error border border-error/20'}`}>
              {importMsg.ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
              {importMsg.text}
            </div>
          )}
        </div>
      </section>

      {/* Modules */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Modules</h2>
        <p className="text-xs text-on-surface-variant mb-3">Enable or disable plugins. Disabled modules are hidden from the sidebar.</p>
        <div className="grid grid-cols-1 gap-2">
          {allPlugins.map((plugin) => {
            const locked   = ['dashboard', 'settings', 'about'].includes(plugin.id)
            const enabled  = !state.disabledPlugins.includes(plugin.id)
            return (
              <div
                key={plugin.id}
                className={[
                  'flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors',
                  enabled
                    ? 'bg-surface border-outline-variant/20'
                    : 'bg-surface/50 border-outline-variant/10 opacity-60',
                ].join(' ')}
              >
                <PluginIcon
                  icon={plugin.icon}
                  size={20}
                  className="flex-shrink-0"
                  style={{ color: enabled ? 'rgb(var(--c-primary))' : undefined, transition: 'color 200ms' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-on-surface">{plugin.name}</div>
                  <div className="text-xs text-on-surface-variant/60 truncate mt-0.5">{plugin.description}</div>
                </div>
                {locked ? (
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/40 px-2 py-1 rounded-full border border-outline-variant/20 flex-shrink-0">
                    Always on
                  </span>
                ) : (
                  <Toggle
                    enabled={enabled}
                    onChange={() => dispatch({ type: 'TOGGLE_PLUGIN', pluginId: plugin.id })}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold text-on-primary transition-all hover:opacity-90 active:scale-95"
          style={{ background: 'var(--gradient-brand)' }}
        >
          Save Settings
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-accent text-sm font-medium">
            <CheckCircle2 size={16} />
            Saved
          </div>
        )}
      </div>
    </div>
  )
}
