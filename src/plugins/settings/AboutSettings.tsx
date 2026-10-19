import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { BookOpen, Info, Keyboard, RefreshCw, Sparkles } from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { SettingsGroup, SettingsRow } from '../../core/components/Form'
import { Modal } from '../../core/components/Modal'

type CheckResult =
  | { ok: true; available: boolean; version?: string; current: string }
  | { ok: false; error: string; current: string; dev?: boolean }

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; version: string }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable'; message: string }

// CHANGELOG.md en la raíz (lo crea el release). `import.meta.glob` devuelve {}
// si no existe, así el build no se rompe y la fila simplemente no aparece.
const CHANGELOG: string = Object.values(
  import.meta.glob('/CHANGELOG.md', { query: '?raw', import: 'default', eager: true }),
)[0] ?? ''

declare global {
  // Tipado mínimo de la API de Vite (el proyecto no incluye vite/client).
  interface ImportMeta {
    glob(pattern: string, opts: { query: string; import: string; eager: true }): Record<string, string>
  }
}

/**
 * Ajustes → Acerca de: versión, "Buscar actualizaciones" (`updater:check`),
 * "Ver novedades" (CHANGELOG.md), atajos y "Volver a ver la bienvenida".
 * La descarga e instalación las maneja `UpdateBanner`.
 */
export function AboutSettings(): JSX.Element {
  const { dispatch } = useApp()
  const [version, setVersion] = useState('…')
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })
  const [notesOpen, setNotesOpen] = useState(false)

  useEffect(() => {
    void window.api.invoke<string>('app:version').then(setVersion).catch(() => setVersion('—'))
    const off = window.api.on('updater:status', (raw: unknown) => {
      const s = raw as { type: string; version?: string; message?: string; phase?: string }
      if (s.type === 'available' && s.version) setCheck({ kind: 'available', version: s.version })
      else if (s.type === 'ready' && s.version) setCheck({ kind: 'ready', version: s.version })
      else if (s.type === 'not-available') setCheck((c) => (c.kind === 'checking' ? { kind: 'latest' } : c))
      else if (s.type === 'error' && s.phase === 'check') setCheck({ kind: 'error', message: s.message ?? 'No se pudo buscar.' })
    })
    return off
  }, [])

  const runCheck = async (): Promise<void> => {
    setCheck({ kind: 'checking' })
    try {
      const r = await window.api.invoke<CheckResult>('updater:check')
      if (!r.ok) setCheck(r.dev ? { kind: 'unavailable', message: 'En modo desarrollo no se buscan actualizaciones.' } : { kind: 'error', message: r.error })
      else if (r.available && r.version) setCheck({ kind: 'available', version: r.version })
      else setCheck({ kind: 'latest' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCheck(/IPC blocked|No handler/i.test(msg)
        ? { kind: 'unavailable', message: 'Esta versión no permite buscar a mano.' }
        : { kind: 'error', message: 'No se pudo buscar. Probá más tarde.' })
    }
  }

  const status = ((): { text: string; tone: string } | null => {
    switch (check.kind) {
      case 'checking': return { text: 'Buscando…', tone: 'text-on-surface-variant' }
      case 'latest': return { text: 'Tenés la última versión.', tone: 'text-success' }
      case 'available': return { text: `Hay una versión nueva: ${check.version}. Descargala desde el aviso de abajo.`, tone: 'text-primary' }
      case 'ready': return { text: `La versión ${check.version} está lista para instalar.`, tone: 'text-primary' }
      case 'error': return { text: check.message, tone: 'text-error' }
      case 'unavailable': return { text: check.message, tone: 'text-on-surface-variant' }
      default: return null
    }
  })()

  const notesHtml = useMemo(
    () => (notesOpen && CHANGELOG ? DOMPurify.sanitize(marked.parse(CHANGELOG, { async: false, gfm: true }) as string) : ''),
    [notesOpen],
  )

  return (
    <SettingsGroup id="ajustes-acerca" title="Acerca de">
      <SettingsRow icon={Info} title="Setto Toolkit" description={`Versión ${version}`}>
        <button onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'about' })} className="ui-btn ui-btn-ghost ui-btn-sm">Más información</button>
      </SettingsRow>
      <SettingsRow
        icon={RefreshCw}
        title="Actualizaciones"
        description={status ? <span role="status" className={status.tone}>{status.text}</span> : 'Se buscan solas cada 4 horas.'}
      >
        <button onClick={() => void runCheck()} disabled={check.kind === 'checking'} className="ui-btn ui-btn-outline ui-btn-sm">
          <RefreshCw size={13} className={check.kind === 'checking' ? 'animate-spin' : ''} />
          Buscar actualizaciones
        </button>
      </SettingsRow>
      {CHANGELOG && (
        <SettingsRow icon={BookOpen} title="Novedades" description="Qué cambió en cada versión.">
          <button onClick={() => setNotesOpen(true)} className="ui-btn ui-btn-ghost ui-btn-sm">Ver novedades</button>
        </SettingsRow>
      )}
      <SettingsRow icon={Keyboard} title="Atajos de teclado" description="También con F1.">
        <button onClick={() => dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })} className="ui-btn ui-btn-ghost ui-btn-sm">Ver atajos</button>
      </SettingsRow>
      <SettingsRow icon={Sparkles} title="Bienvenida" description="Tema, módulos, Supabase y atajos clave.">
        <button onClick={() => dispatch({ type: 'OPEN_ONBOARDING' })} className="ui-btn ui-btn-ghost ui-btn-sm">Volver a ver la bienvenida</button>
      </SettingsRow>

      <Modal open={notesOpen} onClose={() => setNotesOpen(false)} title="Novedades" width={640}>
        <div className="md-preview select-text" dangerouslySetInnerHTML={{ __html: notesHtml }} />
      </Modal>
    </SettingsGroup>
  )
}
