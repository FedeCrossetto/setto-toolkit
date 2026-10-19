import { useState, useEffect, useRef, type ReactNode } from 'react'
import {
  Bot, Check, Download, Eye, EyeOff, FileText, Info, Lock, Monitor, Moon,
  LayoutGrid, Palette, Plug, RefreshCw, ShieldCheck, Sun, TriangleAlert, Type, Upload, ZoomIn,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { allPlugins } from '../../core/plugin-registry'
import { PluginIcon } from '../../core/pluginIcons'
import { useAppFont, APP_FONT_FAMILIES, APP_FONT_SIZES, APP_SIZE_LABELS, type AppFontPrefs } from '../../core/hooks/useAppFont'
import { useUiScale, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP } from '../../core/hooks/useUiScale'
import { AppearanceSettings } from './AppearanceSettings'
import { useThemeMode, type ThemeMode } from '../../core/themeMode'
import { SettingsGroup, SettingsRow, Toggle } from '../../core/components/Form'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { useToast } from '../../core/components/Toast'
import { DesktopSettings } from './DesktopSettings'
import { BackupSettings } from './BackupSettings'
import { SyncSettings } from './SyncSettings'
import { AboutSettings } from './AboutSettings'
import type { IconComponent, PluginManifest } from '../../core/types'

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
}

/** Sentinel returned by the main process when a secure key is already set. */
const SECURE_SET_SENTINEL = '__CONFIGURED__'

const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
const ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']
type AIProvider = 'openai' | 'anthropic' | 'ollama'

/** Plugins that can't be turned off */
const LOCKED = new Set(['dashboard', 'settings', 'about'])
const SYSTEM_PLUGINS = new Set(['connections', 'settings', 'about'])

/** Secciones de la página (índice lateral con scroll-spy). */
const SECTIONS = [
  { id: 'ajustes-apariencia', label: 'Apariencia', icon: Palette },
  { id: 'ajustes-texto', label: 'Texto', icon: Type },
  { id: 'ajustes-escritorio', label: 'Escritorio', icon: Monitor },
  { id: 'ajustes-sync', label: 'Sincronización', icon: RefreshCw },
  { id: 'ajustes-modulos', label: 'Módulos', icon: LayoutGrid },
  { id: 'ajustes-ia', label: 'IA', icon: Bot },
  { id: 'ajustes-integraciones', label: 'Integraciones', icon: Plug },
  { id: 'ajustes-respaldo', label: 'Respaldo', icon: ShieldCheck },
  { id: 'ajustes-datos', label: 'Datos', icon: Download },
  { id: 'ajustes-acerca', label: 'Acerca de', icon: Info },
] as const

type SectionId = (typeof SECTIONS)[number]['id']
const SECTION_IDS: readonly SectionId[] = SECTIONS.map((x) => x.id)

/** Marca como activa la sección que está arriba del área visible. */
function useScrollSpy(ids: readonly string[]): [string, (id: string) => void] {
  const [active, setActive] = useState(ids[0] ?? '')
  const lock = useRef(0)
  useEffect(() => {
    const visible = new Map<string, boolean>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target.id, e.isIntersecting)
      if (Date.now() < lock.current) return
      const first = ids.find((id) => visible.get(id))
      if (first) setActive(first)
    }, { rootMargin: '-8% 0px -65% 0px' })
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids])
  const go = (id: string): void => {
    lock.current = Date.now() + 700
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return [active, go]
}

/** Wider control column for inputs inside a SettingsRow. */
function Control({ children, width = 280 }: { children: ReactNode; width?: number }): JSX.Element {
  return <div style={{ width }} className="flex flex-col gap-1.5 items-stretch">{children}</div>
}

export function SettingsPage(): JSX.Element {
  const { state, dispatch } = useApp()
  const toast = useToast()
  const { prefs: fontPrefs, updateFont } = useAppFont()
  const { scale: uiScale, setScale: setUiScale, resetScale: resetUiScale } = useUiScale()
  const [themeMode, setThemeMode] = useThemeMode()
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
  })
  const [dirty, setDirty] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [openAIKeyConfigured, setOpenAIKeyConfigured] = useState(false)
  const [anthropicKeyConfigured, setAnthropicKeyConfigured] = useState(false)
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)
  const [keyTest, setKeyTest] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; message?: string }>({ status: 'idle' })
  const keyTestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.api.invoke<boolean>('settings:encryption-available').then(setEncryptionAvailable).catch(() => {})
  }, [])

  useEffect(() => {
    const load = async (): Promise<void> => {
      const keys = Object.keys(settings) as (keyof SettingsState)[]
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
    load().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (): Promise<void> => {
    const MASKED: Record<string, boolean> = {
      'ai.openai_key': openAIKeyConfigured,
      'ai.anthropic_key': anthropicKeyConfigured,
    }
    const entries = Object.entries(settings) as [string, string][]
    try {
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
      setDirty(false)
      toast.show('Ajustes guardados', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'No se pudieron guardar los ajustes', 'error')
    }
  }

  const update = (key: keyof SettingsState, value: string): void => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
    if (key === 'ai.openai_key') setKeyTest({ status: 'idle' })
  }

  const testApiKey = async (): Promise<void> => {
    const key = settings['ai.openai_key'].trim()
    if (!key) return
    setKeyTest({ status: 'loading' })
    try {
      const result = await window.api.invoke<{ valid: boolean; error?: string }>('settings:validate-openai-key', key)
      setKeyTest(result.valid ? { status: 'ok' } : { status: 'error', message: result.error })
    } catch (e) {
      setKeyTest({ status: 'error', message: e instanceof Error ? e.message : undefined })
    }
    if (keyTestTimer.current) clearTimeout(keyTestTimer.current)
    keyTestTimer.current = setTimeout(() => setKeyTest({ status: 'idle' }), 6000)
  }

  const runDataAction = async (
    channel: 'settings:export' | 'settings:import' | 'settings:export-logs',
  ): Promise<void> => {
    try {
      const res = await window.api.invoke<{ ok: boolean; canceled?: boolean; count?: number; error?: string }>(channel)
      if (res.canceled) return
      if (channel === 'settings:import') {
        toast.show(`Se importaron ${res.count ?? 0} ajuste(s). Recargá la app para aplicarlos.`, 'success', 5000)
      } else if (channel === 'settings:export-logs' && !res.ok) {
        toast.show(res.error ?? 'No se pudieron exportar los logs', 'error')
      } else {
        toast.show(channel === 'settings:export' ? 'Ajustes exportados' : 'Logs exportados', 'success')
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'La operación falló', 'error')
    }
  }

  const provider = (settings['ai.provider'] || 'openai') as AIProvider
  const inputCls = 'ui-input w-full'

  const personal = allPlugins.filter((p) => p.section === 'personal')
  const dev = allPlugins.filter((p) => p.section !== 'personal' && !SYSTEM_PLUGINS.has(p.id))
  const system = allPlugins.filter((p) => p.section !== 'personal' && SYSTEM_PLUGINS.has(p.id))

  const [activeSection, goToSection] = useScrollSpy(SECTION_IDS)

  const moduleRows = (plugins: PluginManifest[]): JSX.Element[] =>
    plugins.map((plugin) => {
      const enabled = !state.disabledPlugins.includes(plugin.id)
      const Icon: IconComponent = (props) => <PluginIcon icon={plugin.icon} size={props.size} className={props.className} />
      return (
        <SettingsRow
          key={plugin.id}
          icon={Icon}
          title={plugin.name}
          description={plugin.description}
        >
          {LOCKED.has(plugin.id) ? (
            <span className="t-footnote text-on-surface-variant">Siempre activo</span>
          ) : (
            <Toggle
              checked={enabled}
              label={`${enabled ? 'Desactivar' : 'Activar'} ${plugin.name}`}
              onChange={() => dispatch({ type: 'TOGGLE_PLUGIN', pluginId: plugin.id })}
            />
          )}
        </SettingsRow>
      )
    })

  return (
    <div className="px-8 py-7 max-w-[1000px] mx-auto w-full flex gap-10">
      {/* ── Índice de secciones ────────────────────────────────────────────── */}
      <nav aria-label="Secciones de ajustes" className="hidden lg:flex flex-col gap-0.5 w-44 shrink-0 sticky top-7 self-start pt-[76px]">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const on = activeSection === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => goToSection(id)}
              aria-current={on ? 'true' : undefined}
              className={`flex items-center gap-2.5 h-8 px-2.5 rounded-lg t-body text-left border border-transparent transition-colors ${
                on ? 'nav-active text-on-surface font-medium' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 min-w-0 max-w-[760px] flex flex-col gap-8">
      <div>
        <h1 className="t-title2 text-on-surface">Ajustes</h1>
        <p className="t-callout text-on-surface-variant mt-1">Apariencia, módulos, servicios y datos.</p>
      </div>

      {!encryptionAvailable && (
        <div className="ui-card flex items-start gap-3 px-4 py-3">
          <span className="icon-tile w-7 h-7 text-warning">
            <TriangleAlert size={15} />
          </span>
          <p className="t-footnote text-on-surface-variant">
            <span className="font-semibold text-on-surface">El cifrado de credenciales no está disponible</span> en este equipo.
            Las API keys se guardarán en texto plano (pasa en VMs sin almacén de credenciales o en CI).
          </p>
        </div>
      )}

      {/* ── Apariencia ─────────────────────────────────────────────────────── */}
      <SettingsGroup id="ajustes-apariencia" title="Apariencia" description="Claro u oscuro, tema y color de acento.">
        <SettingsRow icon={themeMode === 'dark' ? Moon : themeMode === 'light' ? Sun : Monitor} title="Modo"
          description={themeMode === 'system' ? 'Sigue el modo claro u oscuro del sistema.' : undefined}>
          <SegmentedControl<ThemeMode>
            value={themeMode}
            onChange={setThemeMode}
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
              { value: 'system', label: 'Sistema' },
            ]}
          />
        </SettingsRow>
        <AppearanceSettings isDark={state.theme === 'dark'} />
      </SettingsGroup>

      {/* ── Tipografía y escala ────────────────────────────────────────────── */}
      <SettingsGroup id="ajustes-texto" title="Texto y tamaño" description="Fuente, tamaño y escala de la interfaz.">
        <SettingsRow icon={Type} title="Fuente" description="Se aplica al instante en toda la app.">
          <select
            value={fontPrefs.fontFamily}
            onChange={(e) => updateFont({ fontFamily: e.target.value })}
            className="ui-input w-44"
            aria-label="Fuente"
          >
            {APP_FONT_FAMILIES.map((f) => <option key={f.label} value={f.label}>{f.label}</option>)}
          </select>
        </SettingsRow>
        <SettingsRow icon={Type} title="Tamaño de la interfaz" description="Compacto achica todo sin perder nitidez.">
          <SegmentedControl<AppFontPrefs['fontSize']>
            value={fontPrefs.fontSize}
            onChange={(size) => updateFont({ fontSize: size })}
            options={(Object.keys(APP_FONT_SIZES) as AppFontPrefs['fontSize'][]).map((size) => ({
              value: size,
              label: APP_SIZE_LABELS[size],
            }))}
          />
        </SettingsRow>
        <SettingsRow icon={ZoomIn} title="Escala de la interfaz" description="Zoom de toda la ventana, para ajuste fino.">
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={uiScale}
              onChange={(e) => setUiScale(parseFloat(e.target.value))}
              className="w-36 accent-primary"
              aria-label="Escala de la interfaz"
            />
            <span className="t-footnote text-on-surface tabular-nums w-10 text-right">{Math.round(uiScale * 100)}%</span>
            <button onClick={resetUiScale} disabled={uiScale === 1} className="ui-btn ui-btn-outline ui-btn-sm">
              Restablecer
            </button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* ── Módulos ────────────────────────────────────────────────────────── */}
      <DesktopSettings />

      <SyncSettings />

      <div id="ajustes-modulos" className="flex flex-col gap-5 scroll-mt-6">
        <SettingsGroup title="Módulos" description="Los módulos desactivados se ocultan de la barra lateral y de la búsqueda.">
          <SubHeader>Personal</SubHeader>
          {moduleRows(personal)}
        </SettingsGroup>
        <SettingsGroup>
          <SubHeader>Desarrollo</SubHeader>
          {moduleRows(dev)}
        </SettingsGroup>
        <SettingsGroup>
          <SubHeader>Sistema</SubHeader>
          {moduleRows(system)}
        </SettingsGroup>
      </div>

      {/* ── Servicio de IA ─────────────────────────────────────────────────── */}
      <SettingsGroup id="ajustes-ia" title="Servicio de IA" footer="Las API keys se guardan cifradas en tu equipo y nunca se exportan.">
        <SettingsRow icon={Bot} title="Proveedor">
          <SegmentedControl<AIProvider>
            value={provider}
            onChange={(p) => update('ai.provider', p)}
            options={[
              { value: 'openai', label: 'OpenAI' },
              { value: 'anthropic', label: 'Anthropic' },
              { value: 'ollama', label: 'Ollama' },
            ]}
          />
        </SettingsRow>

        {provider === 'openai' && (
          <>
            <SettingsRow title="API key de OpenAI" description={openAIKeyConfigured && !settings['ai.openai_key'] ? <span className="inline-flex items-center gap-1 text-success"><Lock size={11} /> Configurada</span> : undefined}>
              <Control>
                <div className="relative">
                  <input
                    type={showOpenAIKey ? 'text' : 'password'}
                    value={settings['ai.openai_key']}
                    onChange={(e) => { update('ai.openai_key', e.target.value); if (!e.target.value) setOpenAIKeyConfigured(false) }}
                    placeholder={openAIKeyConfigured ? 'Pegá una nueva para reemplazarla…' : 'sk-…'}
                    className={inputCls + ' pr-8'}
                    aria-label="API key de OpenAI"
                  />
                  <button
                    onClick={() => setShowOpenAIKey((s) => !s)}
                    aria-label={showOpenAIKey ? 'Ocultar key' : 'Mostrar key'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    {showOpenAIKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void testApiKey()}
                    disabled={keyTest.status === 'loading' || !settings['ai.openai_key'].trim()}
                    className="ui-btn ui-btn-outline ui-btn-sm"
                  >
                    {keyTest.status === 'loading' ? 'Validando…' : 'Probar key'}
                  </button>
                  {keyTest.status === 'ok' && <span className="flex items-center gap-1 t-footnote text-success"><Check size={12} /> Válida</span>}
                  {keyTest.status === 'error' && <span className="t-footnote text-error truncate">{keyTest.message ?? 'Key inválida'}</span>}
                </div>
              </Control>
            </SettingsRow>
            <SettingsRow title="Modelo">
              <select value={settings['ai.model']} onChange={(e) => update('ai.model', e.target.value)} className="ui-input w-52" aria-label="Modelo de OpenAI">
                {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </SettingsRow>
          </>
        )}

        {provider === 'anthropic' && (
          <>
            <SettingsRow title="API key de Anthropic" description={anthropicKeyConfigured && !settings['ai.anthropic_key'] ? <span className="inline-flex items-center gap-1 text-success"><Lock size={11} /> Configurada</span> : undefined}>
              <Control>
                <div className="relative">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={settings['ai.anthropic_key']}
                    onChange={(e) => { update('ai.anthropic_key', e.target.value); if (!e.target.value) setAnthropicKeyConfigured(false) }}
                    placeholder={anthropicKeyConfigured ? 'Pegá una nueva para reemplazarla…' : 'sk-ant-…'}
                    className={inputCls + ' pr-8'}
                    aria-label="API key de Anthropic"
                  />
                  <button
                    onClick={() => setShowAnthropicKey((s) => !s)}
                    aria-label={showAnthropicKey ? 'Ocultar key' : 'Mostrar key'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    {showAnthropicKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Control>
            </SettingsRow>
            <SettingsRow title="Modelo">
              <select value={settings['ai.anthropic_model']} onChange={(e) => update('ai.anthropic_model', e.target.value)} className="ui-input w-52" aria-label="Modelo de Anthropic">
                {ANTHROPIC_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </SettingsRow>
          </>
        )}

        {provider === 'ollama' && (
          <>
            <SettingsRow title="URL de Ollama">
              <Control>
                <input type="text" value={settings['ai.ollama_url']} onChange={(e) => update('ai.ollama_url', e.target.value)} placeholder="http://localhost:11434" className={inputCls} aria-label="URL de Ollama" />
              </Control>
            </SettingsRow>
            <SettingsRow title="Modelo" description="Tag del modelo (llama3, qwen3:14b, mistral…).">
              <Control width={200}>
                <input type="text" value={settings['ai.ollama_model']} onChange={(e) => update('ai.ollama_model', e.target.value)} placeholder="llama3" className={inputCls} aria-label="Modelo de Ollama" />
              </Control>
            </SettingsRow>
            <SettingsRow title="Tiempo máximo (minutos)" description="Subilo para modelos grandes en CPU.">
              <Control width={90}>
                <input type="number" min="5" max="120" value={settings['ai.ollama_timeout']} onChange={(e) => update('ai.ollama_timeout', e.target.value)} placeholder="30" className={inputCls} aria-label="Tiempo máximo en minutos" />
              </Control>
            </SettingsRow>
          </>
        )}
      </SettingsGroup>

      {/* ── Integraciones ──────────────────────────────────────────────────── */}
      <SettingsGroup id="ajustes-integraciones" title="Integraciones" description="Credenciales OAuth para buscar en tus repositorios.">
        <SettingsRow
          icon={Plug}
         
          title="GitHub · Client ID de OAuth"
          description="github.com → Settings → Developer settings → OAuth Apps. Activá Device Flow."
        >
          <Control width={220}>
            <input type="text" value={settings['repo-search.github.client_id']} onChange={(e) => update('repo-search.github.client_id', e.target.value)} placeholder="Ov23li…" className={inputCls} aria-label="Client ID de GitHub" />
          </Control>
        </SettingsRow>
        <SettingsRow
          icon={Plug}
         
          title="GitLab · Application ID"
          description="gitlab.com → Preferences → Applications. Scope read_api y Device Authorization Grant."
        >
          <Control width={220}>
            <input type="text" value={settings['repo-search.gitlab.client_id']} onChange={(e) => update('repo-search.gitlab.client_id', e.target.value)} placeholder="abc123def456…" className={inputCls} aria-label="Application ID de GitLab" />
          </Control>
        </SettingsRow>
        <SettingsRow icon={Plug} title="Bitbucket · Workspace por defecto">
          <Control width={220}>
            <input type="text" value={settings['bitbucket.workspace']} onChange={(e) => update('bitbucket.workspace', e.target.value)} placeholder="mi-workspace" className={inputCls} aria-label="Workspace de Bitbucket" />
          </Control>
        </SettingsRow>
      </SettingsGroup>

      <div className={`-mt-3 flex items-center justify-end gap-3 ${dirty ? 'sticky bottom-5 z-10 ui-card shadow-md pl-4 pr-2 py-2' : ''}`}>
        {dirty && (
          <span className="flex-1 flex items-center gap-2 t-footnote text-on-surface-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
            Tenés cambios sin guardar
          </span>
        )}
        <button onClick={() => void handleSave()} className="ui-btn ui-btn-primary">Guardar cambios</button>
      </div>

      <BackupSettings />

      {/* ── Datos ──────────────────────────────────────────────────────────── */}
      <SettingsGroup id="ajustes-datos" title="Datos" footer="Las API keys nunca se incluyen en la exportación.">
        <SettingsRow icon={Download} title="Exportar ajustes" description="Modelos, workspace y preferencias en un JSON.">
          <button onClick={() => void runDataAction('settings:export')} className="ui-btn ui-btn-outline ui-btn-sm">Exportar…</button>
        </SettingsRow>
        <SettingsRow icon={Upload} title="Importar ajustes" description="Sobrescribe los valores actuales.">
          <button onClick={() => void runDataAction('settings:import')} className="ui-btn ui-btn-outline ui-btn-sm">Importar…</button>
        </SettingsRow>
        <SettingsRow icon={FileText} title="Exportar logs" description="Para diagnosticar un problema.">
          <button onClick={() => void runDataAction('settings:export-logs')} className="ui-btn ui-btn-outline ui-btn-sm">Exportar…</button>
        </SettingsRow>
      </SettingsGroup>

      {/* ── Acerca de ──────────────────────────────────────────────────────── */}
      <AboutSettings />
      </div>
    </div>
  )
}

/** Sub-encabezado dentro de una tarjeta de grupo (Personal / Desarrollo / Sistema). */
function SubHeader({ children }: { children: ReactNode }): JSX.Element {
  return <div className="px-5 pt-3.5 pb-1.5 t-section">{children}</div>
}
