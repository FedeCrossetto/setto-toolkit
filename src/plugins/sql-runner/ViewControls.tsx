import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlignLeft, Minus, Palette, Plus, Type } from 'lucide-react'
import { ThemeGrid } from '../file-editor/components/ThemePicker'
import type { EditorColorScheme } from '../file-editor/themes/registry'
import type { EditorTheme } from '../file-editor/hooks/useEditorPrefs'

/**
 * Apariencia propia de Consultas (arriba a la derecha): tamaño del módulo y del texto
 * del editor, y tema de color. No cambia nada del resto de la app.
 */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.35] as const
export const FONT_MIN = 10
export const FONT_MAX = 22

function Popover({ icon, label, active, children, width }: { icon: ReactNode; label: string; active?: boolean; children: (close: () => void) => ReactNode; width: number }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [open])
  return (
    <div ref={ref} className="relative flex">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog"
        className={`grid place-items-center w-[26px] h-[24px] rounded-[7px] transition-colors ${open || active ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
        {icon}
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="ui-menu absolute top-full right-0 mt-1.5 z-50 max-h-[70vh] overflow-y-auto p-3!" style={{ width }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function Stepper({ label, hint, value, onMinus, onPlus, onReset, canMinus, canPlus, isDefault }: {
  label: string; hint: string; value: string; onMinus: () => void; onPlus: () => void; onReset: () => void; canMinus: boolean; canPlus: boolean; isDefault: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="t-footnote font-medium text-on-surface">{label}</div>
        <div className="t-caption text-on-surface-variant">{hint}</div>
      </div>
      <div className="flex items-center rounded-[9px] ring-1 ring-(--hairline-strong) overflow-hidden">
        <button type="button" onClick={onMinus} disabled={!canMinus} aria-label={`Achicar ${label}`} className="grid place-items-center w-8 h-8 hover:bg-on-surface/6 disabled:opacity-35"><Minus size={13} /></button>
        <button type="button" onClick={onReset} disabled={isDefault} title="Volver al tamaño normal"
          className="min-w-[56px] h-8 px-1 t-footnote font-semibold tabular-nums text-on-surface border-x border-(--hairline) hover:bg-on-surface/4 disabled:hover:bg-transparent">{value}</button>
        <button type="button" onClick={onPlus} disabled={!canPlus} aria-label={`Agrandar ${label}`} className="grid place-items-center w-8 h-8 hover:bg-on-surface/6 disabled:opacity-35"><Plus size={13} /></button>
      </div>
    </div>
  )
}

export function ViewControls({ zoom, onZoom, fontSize, defaultFont, onFontSize, scheme, editorTheme, appDark, onPreviewScheme, onPickScheme, onFormat }: {
  zoom: number
  onZoom: (z: number) => void
  fontSize: number
  defaultFont: number
  onFontSize: (n: number) => void
  scheme: EditorColorScheme
  editorTheme: EditorTheme
  appDark: boolean
  onPreviewScheme: (id: EditorColorScheme | null) => void
  onPickScheme: (id: EditorColorScheme) => void
  /** Formatear el SQL (selección o todo); undefined = no disponible (p. ej. en Comparar) */
  onFormat?: () => void
}): JSX.Element {
  const zi = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.001)
  const idx = zi < 0 ? 2 : zi
  return (
    <div className="flex items-center gap-0.5 p-[3px] rounded-[9px] bg-on-surface/5 shrink-0">
      {onFormat && (
        <button type="button" onClick={onFormat} aria-label="Formatear SQL" title="Formatear SQL (Ctrl+Shift+F) — la selección o todo"
          className="grid place-items-center w-[26px] h-[24px] rounded-[7px] text-on-surface-variant hover:text-on-surface transition-colors">
          <AlignLeft size={14} />
        </button>
      )}
      <Popover icon={<Type size={14} />} label="Tamaño de Consultas" width={320} active={zoom !== 1 || fontSize !== defaultFont}>
        {() => (
          <div className="flex flex-col gap-3.5">
            <Stepper label="Interfaz" hint="Todo el módulo Consultas" value={`${Math.round(zoom * 100)}%`}
              onMinus={() => onZoom(ZOOM_STEPS[Math.max(0, idx - 1)]!)} onPlus={() => onZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx + 1)]!)}
              onReset={() => onZoom(1)} canMinus={idx > 0} canPlus={idx < ZOOM_STEPS.length - 1} isDefault={zoom === 1} />
            <Stepper label="Texto del editor" hint="Tamaño de la letra del SQL" value={`${fontSize} px`}
              onMinus={() => onFontSize(Math.max(FONT_MIN, fontSize - 1))} onPlus={() => onFontSize(Math.min(FONT_MAX, fontSize + 1))}
              onReset={() => onFontSize(defaultFont)} canMinus={fontSize > FONT_MIN} canPlus={fontSize < FONT_MAX} isDefault={fontSize === defaultFont} />
            <p className="t-caption text-on-surface-variant/80">Sólo para Consultas: el resto de la app no cambia. Clic en el valor para volver al normal.</p>
          </div>
        )}
      </Popover>
      <Popover icon={<Palette size={14} />} label="Tema de Consultas" width={440}>
        {(close) => (
          <>
            <p className="t-caption text-on-surface-variant px-1 pb-2">Sólo para Consultas: el Editor de archivos conserva el suyo.</p>
            <div onMouseLeave={() => onPreviewScheme(null)}>
              <ThemeGrid value={scheme} editorTheme={editorTheme} appDark={appDark} columns={3}
                onPreview={onPreviewScheme} onChange={(id) => { onPickScheme(id); close() }} />
            </div>
          </>
        )}
      </Popover>
    </div>
  )
}
