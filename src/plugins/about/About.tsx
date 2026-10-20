import { useEffect, useState } from 'react'
import { Keyboard, Settings, Sparkles } from 'lucide-react'
import { useApp } from '../../core/AppContext'

export function About(): JSX.Element {
  const { dispatch } = useApp()
  const [version, setVersion] = useState<string>('…')

  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(() => window.api.invoke<string>('app:version'))
      .then((v) => { if (alive) setVersion(v) })
      .catch(() => { if (alive) setVersion('—') })
    return () => { alive = false }
  }, [])

  return (
    <div className="min-h-full w-full flex items-center justify-center px-8 py-10">
      <div className="ui-card flex flex-col items-center text-center max-w-lg w-full px-10 py-10">
        <img
          src="./setto-logo-lg.png"
          alt=""
          width={80}
          height={80}
          className="w-20 h-20 rounded-[20px] select-none object-cover"
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <h1 className="t-title2 text-on-surface mt-5">Setto Toolkit</h1>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-[7px] hairline px-2.5 py-[3px] t-caption font-medium text-on-surface-variant tabular-nums">
          <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/50" aria-hidden />
          Versión {version}
        </span>

        <p className="t-callout text-on-surface-variant mt-6 max-w-sm">
          Tu espacio de trabajo diario: notas, scripts, gastos y herramientas de desarrollo.
          Todo queda guardado en tu equipo; las claves se cifran con el almacén seguro del sistema.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
          <button className="ui-btn ui-btn-outline" onClick={() => dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })}>
            <Keyboard size={14} /> Atajos de teclado
          </button>
          <button className="ui-btn ui-btn-outline" onClick={() => dispatch({ type: 'OPEN_ONBOARDING' })}>
            <Sparkles size={14} /> Bienvenida
          </button>
          <button className="ui-btn ui-btn-outline" onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'settings' })}>
            <Settings size={14} /> Ajustes
          </button>
        </div>

        <p className="t-caption text-on-surface-variant/70 mt-8">Electron · React · TypeScript</p>
      </div>
    </div>
  )
}
