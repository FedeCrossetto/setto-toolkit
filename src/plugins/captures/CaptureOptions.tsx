import { useState } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { Sheet } from '../../core/components/Modal'
import { SettingsRow, Toggle } from '../../core/components/Form'
import { formatBytes } from './logic'
import type { CaptureFacets, CaptureSettings } from './types'

const KEEP = [{ v: 0, l: 'Siempre' }, { v: 7, l: '7 días' }, { v: 30, l: '30 días' }, { v: 90, l: '90 días' }, { v: 365, l: '1 año' }]
const QUOTA = [{ v: 0, l: 'Sin tope' }, { v: 500, l: '500 MB' }, { v: 1024, l: '1 GB' }, { v: 2048, l: '2 GB' }, { v: 5120, l: '5 GB' }]

/** Opciones del módulo Capturas (panel lateral). Los cambios se aplican al instante. */
export function CaptureOptions({ open, settings, facets, dir, onClose, onChange }: {
  open: boolean
  settings: CaptureSettings
  facets: CaptureFacets
  dir: string
  onClose: () => void
  onChange: (patch: Partial<CaptureSettings>) => Promise<void>
}): JSX.Element {
  const [newApp, setNewApp] = useState('')
  const addExcluded = (name: string): void => {
    const n = name.trim()
    if (!n || settings.excludeApps.some((x) => x.toLowerCase() === n.toLowerCase())) return
    void onChange({ excludeApps: [...settings.excludeApps, n] })
    setNewApp('')
  }
  // Sugerencias: apps de las que ya hay capturas y no están ignoradas.
  const suggestions = facets.apps.map((a) => a.name).filter((a) => !settings.excludeApps.some((x) => x.toLowerCase() === a.toLowerCase()))

  return (
    <Sheet open={open} onClose={onClose} title="Opciones de capturas" subtitle={`${facets.count} capturas · ${formatBytes(facets.bytes)} en disco`} width={460}>
      <div className="flex flex-col -mx-6">
        <SettingsRow title="Guardar lo que copio" description="Cada imagen que copies (Win+Shift+S, Recortes…) se guarda sola.">
          <Toggle checked={settings.auto} onChange={(v) => void onChange({ auto: v })} label="Guardar automáticamente" />
        </SettingsRow>
        <SettingsRow title="Avisar al guardar" description="Notificación del sistema con el título y el ticket detectado.">
          <Toggle checked={settings.notify} onChange={(v) => void onChange({ notify: v })} label="Avisar al guardar" />
        </SettingsRow>
        <SettingsRow title="Conservar" description="Las fijadas no se borran nunca.">
          <select className="ui-input w-32" value={settings.keepDays} onChange={(e) => void onChange({ keepDays: Number(e.target.value) })} aria-label="Conservar">
            {KEEP.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </SettingsRow>
        <SettingsRow title="Espacio máximo" description="Al pasarse, se borran las más viejas (no fijadas).">
          <select className="ui-input w-32" value={settings.maxMb} onChange={(e) => void onChange({ maxMb: Number(e.target.value) })} aria-label="Espacio máximo">
            {QUOTA.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </SettingsRow>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <div>
          <div className="t-body font-medium text-on-surface">Ignorar estas apps</div>
          <div className="t-footnote text-on-surface-variant mt-0.5">Lo que copies desde ellas no se guarda (juegos, home banking…).</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {settings.excludeApps.length === 0 && <span className="t-footnote text-on-surface-variant/70">Ninguna</span>}
          {settings.excludeApps.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 h-[26px] pl-2.5 pr-1 rounded-full bg-on-surface/[0.07] t-footnote text-on-surface">
              {a}
              <button type="button" className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-on-surface/10" aria-label={`Dejar de ignorar ${a}`}
                onClick={() => void onChange({ excludeApps: settings.excludeApps.filter((x) => x !== a) })}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addExcluded(newApp) }}>
          <input className="ui-input flex-1" placeholder="Nombre de la app o del proceso (p. ej. Overwatch)" value={newApp} onChange={(e) => setNewApp(e.target.value)} />
          <button type="submit" className="ui-btn ui-btn-outline" disabled={!newApp.trim()}><Plus size={13} /> Agregar</button>
        </form>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 t-caption text-on-surface-variant">
            Sugeridas:
            {suggestions.slice(0, 8).map((a) => (
              <button key={a} type="button" onClick={() => addExcluded(a)}
                className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full hairline hover:bg-on-surface/[0.05] text-on-surface">
                <Plus size={10} /> {a}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2 t-caption text-on-surface-variant">
        <span className="truncate flex-1" title={dir}>{dir}</span>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => void window.api.invoke('captures:reveal')}>
          <FolderOpen size={12} /> Abrir carpeta
        </button>
      </div>
    </Sheet>
  )
}
