import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, CloudCheck, Monitor } from 'lucide-react'
import { ONBOARDING_KEY, useApp } from '../AppContext'
import { allPlugins } from '../plugin-registry'
import { PluginIcon } from '../pluginIcons'
import { useThemeMode, type ThemeMode } from '../themeMode'
import { useUiScale } from '../hooks/useUiScale'
import { Modal } from './Modal'
import { SegmentedControl } from './SegmentedControl'
import { Toggle } from './Form'
import { useToast } from './Toast'
import { Kbd } from './KeyboardShortcutsModal'

/** Módulos que no se pueden ocultar (igual que en Ajustes → Módulos). */
const LOCKED = new Set(['dashboard', 'settings', 'about'])

const STEPS = ['Bienvenida', 'Módulos', 'Datos', 'Atajos'] as const

const SHORTCUTS: { keys: string[]; text: string }[] = [
  { keys: ['Ctrl', 'K'], text: 'Buscar en todo: módulos, notas, snippets, claves, comandos' },
  { keys: ['Ctrl', 'Shift', 'Espacio'], text: 'Captura rápida, aunque Setto esté de fondo' },
  { keys: ['Ctrl', 'Alt', 'D'], text: 'Barra flotante con lo último que copiaste' },
  { keys: ['Ctrl', 'Alt', 'V'], text: 'Elegir y pegar un clip o snippet en cualquier app' },
  { keys: ['Ctrl', '1…9'], text: 'Ir al módulo N de la barra lateral' },
]

/**
 * Bienvenida: se muestra una vez (primer arranque) y se puede volver a abrir
 * desde Ajustes → Acerca de. Pasos: tema y tamaño, módulos visibles, Supabase
 * o modo solo local, atajos clave.
 */
export function Onboarding(): JSX.Element {
  const { state, dispatch } = useApp()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useThemeMode()
  const { scale, setScale } = useUiScale()
  const toast = useToast()

  const finish = (): void => {
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* sin storage: se volverá a mostrar */ }
    dispatch({ type: 'CLOSE_ONBOARDING' })
    setStep(0)
  }

  const chooseLocal = async (): Promise<void> => {
    try {
      await window.api.invoke('settings:set', 'app.local_only', '1')
      toast.show('Modo solo local: tus datos quedan en esta computadora', 'success')
    } catch {
      toast.show('No se pudo guardar la preferencia', 'error')
    }
    setStep(3)
  }

  const configureSupabase = (): void => {
    void window.api.invoke('settings:set', 'app.local_only', '0').catch(() => {})
    finish()
    dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'connections', action: 'supabase' })
  }

  const modules = allPlugins.filter((p) => !p.pinned && !LOCKED.has(p.id))

  return (
    <Modal open={state.onboardingOpen} onClose={finish} width={560} closeOnBackdrop={false}>
      <div className="pt-6" aria-live="polite">
        {/* Progreso */}
        <ol className="flex items-center gap-1.5 mb-5" aria-label="Pasos de la bienvenida">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`${label}${i < step ? ' (hecho)' : ''}`}
              className={`h-1 rounded-full transition-all duration-200 ${i === step ? 'w-7 bg-primary' : i < step ? 'w-3.5 bg-primary/45' : 'w-3.5 bg-on-surface/12'}`}
            />
          ))}
          <span className="ml-auto t-caption text-on-surface-variant">{step + 1} de {STEPS.length}</span>
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.16 }}
            className="min-h-[248px] flex flex-col"
          >
            {step === 0 && (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <img src="./setto-logo.png" alt="" className="w-10 h-10 rounded-[10px]" draggable={false} />
                  <div>
                    <h2 className="t-title2 text-on-surface">Te damos la bienvenida a Setto</h2>
                    <p className="t-footnote text-on-surface-variant">Tus herramientas de todos los días, en un solo lugar.</p>
                  </div>
                </div>
                <p className="t-body text-on-surface-variant mt-4">Antes de empezar, dejalo a tu gusto. Todo se puede cambiar después en Ajustes.</p>
                <div className="mt-5 flex flex-col gap-4">
                  <Row label="Tema">
                    <SegmentedControl<ThemeMode>
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: 'light', label: 'Claro' },
                        { value: 'dark', label: 'Oscuro' },
                        { value: 'system', label: 'Sistema' },
                      ]}
                    />
                  </Row>
                  <Row label="Tamaño">
                    <SegmentedControl<string>
                      value={String(scale)}
                      onChange={(v) => setScale(parseFloat(v))}
                      options={[
                        { value: '0.9', label: 'Chico' },
                        { value: '1', label: 'Normal' },
                        { value: '1.1', label: 'Grande' },
                      ]}
                    />
                  </Row>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="t-title3 text-on-surface">¿Qué módulos querés ver?</h2>
                <p className="t-footnote text-on-surface-variant mt-1">Los que apagues no aparecen en la barra lateral ni en la búsqueda.</p>
                <div className="mt-4 ui-card overflow-y-auto max-h-[300px] divide-y divide-(--hairline)">
                  {modules.map((p) => {
                    const on = !state.disabledPlugins.includes(p.id)
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <PluginIcon icon={p.icon} size={16} weight={on ? 'fill' : 'regular'} className={on ? 'text-primary' : 'text-on-surface-variant'} />
                        <div className="flex-1 min-w-0">
                          <div className="t-body font-medium text-on-surface">{p.name}</div>
                          <div className="t-caption text-on-surface-variant truncate">{p.description}</div>
                        </div>
                        <Toggle checked={on} label={`${on ? 'Ocultar' : 'Mostrar'} ${p.name}`} onChange={() => dispatch({ type: 'TOGGLE_PLUGIN', pluginId: p.id })} />
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="t-title3 text-on-surface">¿Usás Supabase?</h2>
                <p className="t-footnote text-on-surface-variant mt-1">
                  Gastos y Claves pueden guardarse en tu propio proyecto de Supabase para tenerlos en varias computadoras.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Choice
                    icon={<CloudCheck size={20} />}
                    title="Configurar ahora"
                    text="Abre Conexiones → Supabase para cargar la URL y la clave."
                    onClick={configureSupabase}
                  />
                  <Choice
                    icon={<Monitor size={20} />}
                    title="Modo solo local"
                    text="Todo queda en esta computadora. Podés conectarlo más adelante."
                    onClick={() => void chooseLocal()}
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="t-title3 text-on-surface">Atajos para ir rápido</h2>
                <p className="t-footnote text-on-surface-variant mt-1">Con F1 ves la lista completa cuando quieras.</p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {SHORTCUTS.map((s) => (
                    <li key={s.text} className="flex items-center gap-3">
                      <span className="flex items-center gap-1 w-[150px] shrink-0">
                        {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                      </span>
                      <span className="t-body text-on-surface">{s.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Pie */}
        <div className="flex items-center gap-2 pt-4 mt-2 hairline-t">
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)} className="ui-btn ui-btn-ghost ui-btn-sm">
              <ArrowLeft size={13} /> Atrás
            </button>
          ) : (
            <button onClick={finish} className="ui-btn ui-btn-ghost ui-btn-sm text-on-surface-variant">Saltar</button>
          )}
          <span className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button autoFocus onClick={() => setStep(step + 1)} className="ui-btn ui-btn-primary">
              {step === 2 ? 'Decidir después' : 'Siguiente'}
            </button>
          ) : (
            <button autoFocus onClick={finish} className="ui-btn ui-btn-primary">
              <Check size={14} /> Empezar
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="t-body font-medium text-on-surface">{label}</span>
      {children}
    </div>
  )
}

function Choice({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="ui-card ui-card-interactive text-left p-4 flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-primary">
      <span className="w-9 h-9 rounded-[10px] grid place-items-center bg-primary/10 text-primary">{icon}</span>
      <span className="t-headline text-on-surface">{title}</span>
      <span className="t-footnote text-on-surface-variant">{text}</span>
    </button>
  )
}
