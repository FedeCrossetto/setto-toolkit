import { useEffect, type ReactNode } from 'react'
import { Keyboard } from 'lucide-react'
import { useApp } from '../AppContext'

function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-surface-container border border-outline-variant/35 text-on-surface shadow-sm whitespace-nowrap">
      {children}
    </kbd>
  )
}

function Row({ combo, description }: { combo: ReactNode; description: string }): JSX.Element {
  return (
    <tr className="border-b border-outline-variant/12 last:border-0">
      <td className="py-2.5 pr-4 align-top">{combo}</td>
      <td className="py-2.5 text-sm text-on-surface-variant">{description}</td>
    </tr>
  )
}

export function KeyboardShortcutsModal(): JSX.Element | null {
  const { state, dispatch } = useApp()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F1') {
        e.preventDefault()
        dispatch({ type: state.keyboardShortcutsOpen ? 'CLOSE_KEYBOARD_SHORTCUTS' : 'OPEN_KEYBOARD_SHORTCUTS' })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Slash') {
        e.preventDefault()
        dispatch({ type: 'OPEN_KEYBOARD_SHORTCUTS' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, state.keyboardShortcutsOpen])

  useEffect(() => {
    if (!state.keyboardShortcutsOpen) return
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dispatch({ type: 'CLOSE_KEYBOARD_SHORTCUTS' })
      }
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [state.keyboardShortcutsOpen, dispatch])

  if (!state.keyboardShortcutsOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center pt-20 px-4 bg-on-surface/25 backdrop-blur-sm"
      role="presentation"
      onClick={() => dispatch({ type: 'CLOSE_KEYBOARD_SHORTCUTS' })}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-shortcuts-title"
        className="w-full max-w-lg rounded-2xl border border-outline-variant/25 shadow-card-hover bg-surface overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/15">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Keyboard size={22} className="text-primary" />
          </div>
          <div>
            <h2 id="kbd-shortcuts-title" className="text-base font-semibold text-on-surface">
              Keyboard shortcuts
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Global and tool-specific shortcuts</p>
          </div>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70 mb-2">App</p>
          <table className="w-full text-left">
            <tbody>
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>K</Kbd></span>}
                description="Open command palette"
              />
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>F</Kbd></span>}
                description="Find in page (hidden when File Editor is focused — it uses its own search)"
              />
              <Row
                combo={<Kbd>F1</Kbd>}
                description="Open or close this shortcuts panel"
              />
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>Shift</Kbd><span className="text-on-surface-variant">+</span><Kbd>/</Kbd></span>}
                description="Open shortcuts panel"
              />
              <Row combo={<Kbd>Esc</Kbd>} description="Close command palette, find bar, or this panel" />
            </tbody>
          </table>

          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70 mt-5 mb-2">File Editor</p>
          <table className="w-full text-left">
            <tbody>
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>S</Kbd></span>}
                description="Save / Save as"
              />
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>P</Kbd></span>}
                description="Quick open file"
              />
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>Shift</Kbd><span className="text-on-surface-variant">+</span><Kbd>F</Kbd></span>}
                description="Find in files"
              />
            </tbody>
          </table>

          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70 mt-5 mb-2">Snippets</p>
          <table className="w-full text-left">
            <tbody>
              <Row
                combo={<span className="flex flex-wrap gap-1"><Kbd>Ctrl</Kbd><span className="text-on-surface-variant">+</span><Kbd>N</Kbd></span>}
                description="New snippet"
              />
              <Row combo={<Kbd>Esc</Kbd>} description="Cancel editing (when the form is open)" />
            </tbody>
          </table>

          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70 mt-5 mb-2">Repo search</p>
          <table className="w-full text-left">
            <tbody>
              <Row combo={<Kbd>/</Kbd>} description="Focus search input" />
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-outline-variant/15 flex justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-on-primary hover:opacity-95 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            onClick={() => dispatch({ type: 'CLOSE_KEYBOARD_SHORTCUTS' })}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
