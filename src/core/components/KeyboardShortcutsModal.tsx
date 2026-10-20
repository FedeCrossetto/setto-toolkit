import { useEffect, type ReactNode } from 'react'
import { useApp } from '../AppContext'
import { Modal } from './Modal'

interface Shortcut {
  /** Each entry is one combo; keys inside a combo are joined with "+" */
  combos: string[][]
  description: string
}

interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

// Only shortcuts that really exist in the code (grep keydown handlers before adding).
const LEFT: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { combos: [['Ctrl', 'K'], ['/']], description: 'Buscar en todo' },
      { combos: [['Ctrl', 'Shift', 'Espacio']], description: 'Captura rápida (funciona aunque la app esté de fondo)' },
      { combos: [['Ctrl', '1…9']], description: 'Ir al módulo N de la barra lateral' },
      { combos: [['Ctrl', '`'], ['Ctrl', 'Tab']], description: 'Recorrer los módulos recientes (en el Editor, Ctrl+Tab alterna archivos)' },
      { combos: [['Ctrl', 'Shift', 'L']], description: 'Alternar tema claro / oscuro' },
      { combos: [['Ctrl', 'Alt', 'V']], description: 'Selector de portapapeles, capturas y snippets (pega en cualquier app)' },
      { combos: [['Ctrl', 'Alt', 'Shift', 'V']], description: 'Pegar el siguiente de la secuencia' },
      { combos: [['Ctrl', 'Alt', 'T']], description: 'Copiar el texto de un recorte (Win+Shift+S antes)' },
      { combos: [['Ctrl', 'Alt', 'D']], description: 'Abrir / cerrar la barra flotante de la derecha' },
      { combos: [['Ctrl', 'F']], description: 'Buscar en la página (salvo Editor y Notas)' },
      { combos: [['F11']], description: 'Modo foco: sólo el contenido, sin barras' },
      { combos: [['F1'], ['?']], description: 'Mostrar estos atajos' },
      { combos: [['Esc']], description: 'Cerrar la búsqueda o el diálogo abierto' },
    ],
  },
  {
    title: 'Búsqueda (Ctrl+K)',
    items: [
      { combos: [['↑'], ['↓']], description: 'Moverse entre resultados' },
      { combos: [['Tab']], description: 'Saltar al siguiente grupo' },
      { combos: [['Enter']], description: 'Abrir o ejecutar' },
      { combos: [['Shift', 'Enter']], description: 'Acción alternativa (p. ej. copiar el usuario de una clave)' },
    ],
  },
  {
    title: 'Notas y snippets',
    items: [
      { combos: [['Ctrl', 'N']], description: 'Nueva nota o nuevo snippet (en su módulo)' },
      { combos: [['Ctrl', 'F']], description: 'Buscar entre las notas' },
      { combos: [['Ctrl', 'S']], description: 'Guardar la nota ahora' },
      { combos: [['Ctrl', 'Enter']], description: 'Guardar el snippet que estás editando' },
    ],
  },
]

const RIGHT: ShortcutGroup[] = [
  {
    title: 'Editor',
    items: [
      { combos: [['Ctrl', 'P']], description: 'Abrir archivo rápido' },
      { combos: [['Ctrl', 'T']], description: 'Archivo nuevo' },
      { combos: [['Ctrl', 'S']], description: 'Guardar' },
      { combos: [['Ctrl', 'Shift', 'S']], description: 'Guardar todo' },
      { combos: [['Ctrl', 'Shift', 'F']], description: 'Buscar en archivos' },
      { combos: [['F2']], description: 'Renombrar pestaña' },
      { combos: [['Ctrl', 'Shift', 'Z']], description: 'Modo zen' },
    ],
  },
  {
    title: 'Terminal',
    items: [
      { combos: [['Ctrl', 'T']], description: 'Nueva sesión' },
    ],
  },
  {
    title: 'Búsqueda en repos',
    items: [
      { combos: [['/']], description: 'Ir al buscador' },
    ],
  },
]

export function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return (
    <kbd
      className="kbd-chip px-1.5! whitespace-nowrap"
    >
      {children}
    </kbd>
  )
}

function Combo({ keys }: { keys: string[] }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((k, i) => <Kbd key={`${k}-${i}`}>{k}</Kbd>)}
    </span>
  )
}

function Group({ group }: { group: ShortcutGroup }): JSX.Element {
  return (
    <section className="flex flex-col">
      <h3 className="fl-section px-2.5! mb-0.5">{group.title}</h3>
      {group.items.map((s) => (
        <div key={s.description} className="flex items-center justify-between gap-3 px-2.5 min-h-8 py-1 rounded-[9px] hover:bg-on-surface/3 transition-colors">
          <span className="t-body text-on-surface-variant">{s.description}</span>
          <span className="flex items-center gap-1 shrink-0">
            {s.combos.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="t-caption text-on-surface-variant/60">o</span>}
                <Combo keys={c} />
              </span>
            ))}
          </span>
        </div>
      ))}
    </section>
  )
}

/**
 * The one shortcuts sheet of the app. Opens with F1, "?", Ctrl+Shift+/ or the
 * "Atajos de teclado" action of the palette. State lives in AppState.keyboardShortcutsOpen.
 */
export function KeyboardShortcutsModal(): JSX.Element | null {
  const { state, dispatch } = useApp()
  const open = state.keyboardShortcutsOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F1') {
        e.preventDefault()
        dispatch({ type: open ? 'CLOSE_KEYBOARD_SHORTCUTS' : 'OPEN_KEYBOARD_SHORTCUTS' })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Slash') {
        e.preventDefault()
        dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })
        return
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = document.activeElement as HTMLElement | null
        const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest('.cm-editor, .xterm'))
        if (typing) return
        e.preventDefault()
        dispatch({ type: open ? 'CLOSE_KEYBOARD_SHORTCUTS' : 'OPEN_KEYBOARD_SHORTCUTS' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, open])

  return (
    <Modal
      open={open}
      onClose={() => dispatch({ type: 'CLOSE_KEYBOARD_SHORTCUTS' })}
      title="Atajos de teclado"
      subtitle="Los de cada módulo funcionan cuando ese módulo está abierto."
      width={760}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 pt-2">
        <div className="flex flex-col gap-5">{LEFT.map((g) => <Group key={g.title} group={g} />)}</div>
        <div className="flex flex-col gap-5">{RIGHT.map((g) => <Group key={g.title} group={g} />)}</div>
      </div>
    </Modal>
  )
}
