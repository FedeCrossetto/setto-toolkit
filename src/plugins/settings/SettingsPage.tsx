import { useState, useEffect } from 'react'
import { useApp } from '../../core/AppContext'
import { useAppFont, APP_FONT_FAMILIES, APP_FONT_SIZES } from '../../core/hooks/useAppFont'
import { useThemePalette, PALETTES } from '../../core/hooks/useThemePalette'

interface SettingsState {
  'ai.provider': string
  'ai.openai_key': string
  'ai.model': string
  'ai.anthropic_key': string
  'ai.anthropic_model': string
  'ai.ollama_url': string
  'ai.ollama_model': string
  'bitbucket.workspace': string
}

/** Sentinel returned by the main process when a secure key is already set. */
const SECURE_SET_SENTINEL = '__CONFIGURED__'

const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
const ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']
type AIProvider = 'openai' | 'anthropic' | 'ollama'

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
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
    'ai.anthropic_model': 'claude-haiku-4-5-20251001',
    'ai.ollama_url': 'http://localhost:11434',
    'ai.ollama_model': 'llama3',
    'bitbucket.workspace': '',
  })
  const [saved, setSaved] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [openAIKeyConfigured, setOpenAIKeyConfigured] = useState(false)
  const [anthropicKeyConfigured, setAnthropicKeyConfigured] = useState(false)

  useEffect(() => {
    const load = async (): Promise<void> => {
      const keys: (keyof SettingsState)[] = [
        'ai.provider', 'ai.openai_key', 'ai.model',
        'ai.anthropic_key', 'ai.anthropic_model',
        'ai.ollama_url', 'ai.ollama_model',
        'bitbucket.workspace',
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
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {t === 'light' ? 'light_mode' : 'dark_mode'}
                  </span>
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
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
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
                      <span
                        className="material-symbols-outlined absolute top-1.5 right-1.5 text-white"
                        style={{ fontSize: '12px', background: p.from, borderRadius: '50%', padding: '1px' }}
                      >
                        check
                      </span>
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
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>lock</span>
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
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{showOpenAIKey ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>
              </SettingRow>
              <SettingRow label="Model" description="OpenAI model for completions.">
                <div className="relative">
                  <select value={settings['ai.model']} onChange={(e) => update('ai.model', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                    {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" style={{ fontSize: '16px' }}>expand_more</span>
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
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>lock</span>
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
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{showAnthropicKey ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>
              </SettingRow>
              <SettingRow label="Model" description="Anthropic Claude model for completions.">
                <div className="relative">
                  <select value={settings['ai.anthropic_model']} onChange={(e) => update('ai.anthropic_model', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                    {ANTHROPIC_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" style={{ fontSize: '16px' }}>expand_more</span>
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
              <SettingRow label="Model" description="Ollama model tag (e.g. llama3, mistral, phi3).">
                <input
                  type="text"
                  value={settings['ai.ollama_model']}
                  onChange={(e) => update('ai.ollama_model', e.target.value)}
                  placeholder="llama3"
                  className={inputCls}
                />
              </SettingRow>
            </>
          )}

        </div>
      </section>

      {/* Bitbucket Section */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-secondary mb-3">Bitbucket</h2>
        <div className="bg-surface rounded-xl border border-outline-variant/20 px-6">
          <SettingRow label="Default Workspace" description="Bitbucket workspace slug to search in.">
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
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
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
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span>
              Import JSON
            </button>
          </SettingRow>

          {importMsg && (
            <div className={`mx-0 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${importMsg.ok ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-error/10 text-error border border-error/20'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {importMsg.ok ? 'check_circle' : 'error'}
              </span>
              {importMsg.text}
            </div>
          )}
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
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
            Saved
          </div>
        )}
      </div>
    </div>
  )
}
