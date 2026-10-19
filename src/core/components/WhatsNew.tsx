import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { IS_FRESH_INSTALL, useApp } from '../AppContext'
import { Modal } from './Modal'
import { changelogSection } from './changelog-section'

const SEEN_KEY = 'whatsnew:seen'

// Mismo origen que Ajustes → Acerca de → "Ver novedades".
const CHANGELOG: string = Object.values(
  import.meta.glob('/CHANGELOG.md', { query: '?raw', import: 'default', eager: true }),
)[0] ?? ''

/**
 * Al abrir una versión nueva, una sola vez, muestra qué cambió (sólo a quien ya
 * usaba la app: en una instalación nueva se ve la bienvenida y esto se saltea).
 */
export function WhatsNew(): JSX.Element | null {
  const { state } = useApp()
  const [version, setVersion] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.invoke<string>('app:version').then((v) => { if (alive) setVersion(v) }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  const section = useMemo(() => (version ? changelogSection(CHANGELOG, version) : ''), [version])

  useEffect(() => {
    if (!version) return
    let seen: string | null = null
    try { seen = localStorage.getItem(SEEN_KEY) } catch { return }
    if (seen === version) return
    try { localStorage.setItem(SEEN_KEY, version) } catch { /* ignore */ }
    // Instalación nueva: ya la recibe la bienvenida.
    // (este componente carga diferido: puede montarse después de cerrar la bienvenida)
    if (IS_FRESH_INSTALL || state.onboardingOpen || !section) return
    setOpen(true)
  }, [version, section, state.onboardingOpen])

  const html = useMemo(
    () => (open && section ? DOMPurify.sanitize(marked.parse(section, { async: false, gfm: true }) as string) : ''),
    [open, section],
  )

  if (!open) return null
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={`Novedades de Setto ${version ?? ''}`}
      subtitle="Lo que cambió en esta versión"
      width={600}
      footer={<button className="ui-btn ui-btn-primary" onClick={() => setOpen(false)} autoFocus>Entendido</button>}
    >
      <div className="md-preview select-text" dangerouslySetInnerHTML={{ __html: html }} />
    </Modal>
  )
}
