import { useState, useEffect, useRef } from 'react'
import { useApp } from '../../core/AppContext'
import { useAppFont, APP_FONT_FAMILIES, APP_FONT_SIZES } from '../../core/hooks/useAppFont'
import { useThemePalette, PALETTES } from '../../core/hooks/useThemePalette'

interface SettingsState {
  'ai.openai_key': string
  'ai.model': string
  'bitbucket.workspace': string
}

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']

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
    'ai.openai_key': '',
    'ai.model': 'gpt-4o-mini',
    'bitbucket.workspace': 'wigos-dev',
  })
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [keyTest, setKeyTest] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; message?: string }>({ status: 'idle' })
  const keyTestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      const keys: (keyof SettingsState)[] = ['ai.openai_key', 'ai.model', 'bitbucket.workspace']
      const values = await Promise.all(keys.map((k) => window.api.invoke<string | null>('settings:get', k)))
      setSettings((prev) => {
        const updated = { ...prev }
        keys.forEach((k, i) => {
          if (values[i]) updated[k] = values[i] as string
        })
        return updated
      })
    }
    load()
  }, [])

  const handleSave = async (): Promise<void> => {
    const entries = Object.entries(settings) as [string, string][]
    await Promise.all(
      entries
        .filter(([, v]) => v.trim())
        .map(([k, v]) => window.api.invoke('settings:set', k, v))
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const update = (key: keyof SettingsState, value: string): void => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (key === 'ai.openai_key') setKeyTest({ status: 'idle' })
  }

  const testApiKey = async (): Promise<void> => {
    const key = settings['ai.openai_key'].trim()
    if (!key) return
    setKeyTest({ status: 'loading' })
    const result = await window.api.invoke<{ valid: boolean; error?: string }>('settings:validate-openai-key', key)
    if (result.valid) {
      setKeyTest({ status: 'ok' })
    } else {
      setKeyTest({ status: 'error', message: result.error })
    }
    if (keyTestTimer.current) clearTimeout(keyTestTimer.current)
    keyTestTimer.current = setTimeout(() => setKeyTest({ status: 'idle' }), 6000)
  }

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
          <SettingRow label="OpenAI API Key" description="Used for Smart Diff semantic analysis. Stored locally.">
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings['ai.openai_key']}
                  onChange={(e) => update('ai.openai_key', e.target.value)}
                  placeholder="sk-..."
                  className={inputCls + ' pr-10'}
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {showKey ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={testApiKey}
                  disabled={!settings['ai.openai_key'].trim() || keyTest.status === 'loading'}
                  className="px-3 py-1.5 text-xs rounded-lg border border-outline-variant/40 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {keyTest.status === 'loading' ? (
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: '13px' }}>progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>wifi_tethering</span>
                  )}
                  Test key
                </button>
                {keyTest.status === 'ok' && (
                  <span className="flex items-center gap-1 text-xs text-accent font-medium">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>check_circle</span>
                    Key valid
                  </span>
                )}
                {keyTest.status === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-error font-medium" title={keyTest.message}>
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>error</span>
                    {keyTest.message && keyTest.message.length > 40 ? keyTest.message.slice(0, 40) + '…' : (keyTest.message ?? 'Invalid key')}
                  </span>
                )}
              </div>
            </div>
          </SettingRow>

          <SettingRow label="Model" description="Default model for AI completions.">
            <div className="relative">
              <select
                value={settings['ai.model']}
                onChange={(e) => update('ai.model', e.target.value)}
                className={inputCls + ' appearance-none pr-8'}
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span
                className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant"
                style={{ fontSize: '16px' }}
              >
                expand_more
              </span>
            </div>
          </SettingRow>
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
