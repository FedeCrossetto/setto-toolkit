import { useEffect, useState } from 'react'
import { Keyboard, Settings } from 'lucide-react'
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
    <div className="relative min-h-full w-full flex items-center justify-center px-8 py-10">
      {/* Halo de marca muy suave detrás del logo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] dark:opacity-[0.10]"
        style={{
          background: 'var(--gradient-brand)',
          maskImage: 'radial-gradient(320px 260px at 50% 38%, black, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(320px 260px at 50% 38%, black, transparent 70%)',
        }}
      />
      <div className="relative flex flex-col items-center text-center max-w-md">
        <img
          src="./setto-logo-lg.png"
          alt=""
          width={112}
          height={112}
          className="w-28 h-28 rounded-[26px] select-none object-cover shadow-lg"
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <h1 className="t-title1 text-on-surface mt-6">Setto Toolkit</h1>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface hairline shadow-sm px-2.5 py-[3px] t-caption font-medium text-on-surface-variant tabular-nums">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden />
          Versión {version}
        </span>

        <p className="t-callout text-on-surface-variant mt-6 max-w-sm">
          Tu espacio de trabajo diario: notas, scripts, gastos y herramientas de desarrollo.
          Todo queda guardado en tu equipo; las claves se cifran con el almacén seguro del sistema.
        </p>

        <div className="flex items-center gap-2 mt-7">
          <button className="ui-btn ui-btn-outline" onClick={() => dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })}>
            <Keyboard size={14} /> Atajos de teclado
          </button>
          <button className="ui-btn ui-btn-dark" onClick={() => dispatch({ type: 'OPEN_TAB', pluginId: 'settings' })}>
            <Settings size={14} /> Ajustes
          </button>
        </div>

        <p className="t-caption text-on-surface-variant/70 mt-10">Electron · React · TypeScript</p>
      </div>
    </div>
  )
}
