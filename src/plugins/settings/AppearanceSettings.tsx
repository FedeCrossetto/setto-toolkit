import { useEffect } from 'react'
import { Check, Palette } from 'lucide-react'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import {
  CHART_COUNT, DARK_STYLES, PALETTES, getPaletteTokens, previewAppearance, resolveAppearance, setAppearance, useAppearance,
  type Appearance, type DarkStyle, type SurfaceStyle,
} from '../../core/hooks/useThemePalette'
import { PRESET_LIST } from '../../core/themes/presets'

/**
 * Ajustes → Apariencia (debajo de Claro/Oscuro/Sistema): tema completo, color de
 * acento y estilos de fondo. Pasar el mouse por un tema o un color lo muestra en
 * toda la app sin guardarlo; al salir vuelve lo elegido.
 */
export function AppearanceSettings({ isDark }: { isDark: boolean }): JSX.Element {
  const a = useAppearance()
  // Si se sale de Ajustes con el mouse sobre una tarjeta, no dejar la vista previa pegada.
  useEffect(() => () => previewAppearance(null), [])
  const hover = (patch: Partial<Appearance>) => ({
    onMouseEnter: () => previewAppearance(patch),
    onMouseLeave: () => previewAppearance(null),
    onFocus: () => previewAppearance(patch),
    onBlur: () => previewAppearance(null),
  })

  return (
    <div className="px-5 py-4 flex flex-col gap-5">
      {/* ── Tema completo ── */}
      <div>
        <SectionTitle title="Tema" subtitle="Colores de toda la app, el Editor y la Terminal." />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pl-10" role="radiogroup" aria-label="Tema">
          {PRESET_LIST.map((p) => {
            const active = a.preset === p.id
            const { accent, surfaces: s } = resolveAppearance({ ...a, preset: p.id }, isDark)
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { previewAppearance(null); setAppearance({ preset: p.id }) }}
                {...hover({ preset: p.id })}
                className={`group text-left rounded-xl p-1.5 transition-shadow focus:outline-hidden ${
                  active ? 'shadow-[0_0_0_1.5px_rgb(var(--c-primary))]' : 'hairline hover:border-hairline-strong'
                }`}
              >
                {/* Mini ventana con los colores reales del tema */}
                <span className="block h-16 rounded-lg overflow-hidden relative" style={{ background: `rgb(${s.background})` }} aria-hidden>
                  <span className="absolute inset-x-0 top-0 h-2.5" style={{ background: `rgb(${s.topbar})` }} />
                  <span className="absolute left-0 top-2.5 bottom-0 w-6" style={{ background: `rgb(${s.sidebar})`, borderRight: `1px solid rgb(${s.outlineVariant})` }}>
                    <span className="block mx-1.5 mt-2 h-1.5 rounded-sm" style={{ background: `rgb(${accent.primary})` }} />
                    <span className="block mx-1.5 mt-1 h-1 rounded-sm opacity-40" style={{ background: `rgb(${s.onSurface})` }} />
                  </span>
                  <span className="absolute left-8 right-2 top-4 bottom-2 rounded-md p-1.5 flex flex-col gap-1" style={{ background: `rgb(${s.surface})` }}>
                    <span className="h-1 w-2/3 rounded-sm" style={{ background: `rgb(${s.onSurface})` }} />
                    <span className="h-1 w-1/2 rounded-sm opacity-50" style={{ background: `rgb(${s.onSurfaceVariant})` }} />
                    <span className="mt-auto flex gap-1">
                      <span className="h-2.5 w-7 rounded-sm" style={{ background: `rgb(${accent.primary})` }} />
                      <span className="h-2.5 w-3 rounded-sm" style={{ background: `rgb(${accent.secondary})` }} />
                      <span className="h-2.5 w-3 rounded-sm" style={{ background: `rgb(${accent.accent})` }} />
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 px-1 pt-2 pb-0.5">
                  <span className={`t-footnote flex-1 truncate ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}>{p.name}</span>
                  {active && <Check size={12} weight="bold" className="text-primary" />}
                </span>
                <span className="block px-1 t-caption text-on-surface-variant truncate">{p.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Opciones del tema Setto ── */}
      {a.preset === 'setto' ? (
        <>
          <div>
            <SectionTitle title="Color de acento" subtitle="Botones, selección y controles." />
            <div className="flex flex-wrap gap-x-1 gap-y-3 pl-10" role="radiogroup" aria-label="Color de acento">
              {PALETTES.map((p) => {
                const active = a.palette === p.id
                // Mismos tokens que aplica la app en el tema actual.
                const t = getPaletteTokens(p.id, isDark)
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { previewAppearance(null); setAppearance({ palette: p.id }) }}
                    {...hover({ palette: p.id })}
                    title={p.label}
                    className="flex flex-col items-center gap-1.5 w-[64px] rounded-lg py-1 focus:outline-hidden focus-visible:bg-on-surface/5 group"
                  >
                    <span
                      className="relative w-7 h-7 rounded-full flex items-center justify-center transition-transform duration-150 group-hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, rgb(${t.primary}) 0 62%, rgb(${t.accent}) 62% 100%)`,
                        boxShadow: active ? `0 0 0 2px rgb(var(--c-surface)), 0 0 0 4px rgb(${t.primary})` : 'inset 0 0 0 1px var(--hairline-strong)',
                      }}
                    >
                      {active && <Check size={13} weight="bold" style={{ color: `rgb(${t.onPrimary})` }} />}
                    </span>
                    <span className={`t-caption truncate max-w-full ${active ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>{p.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="pl-10 flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <span className="t-footnote font-medium text-on-surface-variant">Fondos</span>
              <SegmentedControl<SurfaceStyle>
                value={a.surface}
                onChange={(v) => setAppearance({ surface: v })}
                options={[{ value: 'neutral', label: 'Neutros' }, { value: 'tinted', label: 'Teñidos con el color' }]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="t-footnote font-medium text-on-surface-variant">Modo oscuro{!isDark && ' (se ve al pasar a oscuro)'}</span>
              <SegmentedControl<DarkStyle>
                value={a.darkStyle}
                onChange={(v) => setAppearance({ darkStyle: v })}
                options={DARK_STYLES.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="pl-10 t-footnote text-on-surface-variant">
          El color y los fondos vienen del tema. Para elegir tu propio color, usá el tema Setto.
          En el Editor y la Terminal, «Tema de la app» / «Sistema» usan la pareja de este tema.
        </p>
      )}

      {/* Vista previa en vivo: usa los tokens aplicados, no datos aparte. */}
      <div className="ml-10 flex flex-wrap items-center gap-3 rounded-lg hairline px-3 py-2.5" aria-hidden>
        <span className="ui-btn ui-btn-primary ui-btn-sm pointer-events-none">Botón</span>
        <span className="bg-selected text-on-surface t-footnote rounded-md px-2 py-1 pointer-events-none">Seleccionado</span>
        <span className="t-footnote font-medium text-primary">Enlace</span>
        <span className="flex items-center gap-1 ml-auto" title="Colores de gráficos y categorías">
          {Array.from({ length: CHART_COUNT }, (_, i) => (
            <span key={i} className="w-2 h-2 rounded-full" style={{ background: `rgb(var(--c-chart-${i + 1}))` }} />
          ))}
        </span>
      </div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="icon-tile w-7 h-7">
        <Palette size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="t-body font-medium text-on-surface">{title}</div>
        <div className="t-footnote text-on-surface-variant mt-0.5">{subtitle}</div>
      </div>
    </div>
  )
}
