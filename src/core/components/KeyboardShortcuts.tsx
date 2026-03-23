import { useEffect, useState } from 'react'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  group: string
  shortcuts: Shortcut[]
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Global',
    shortcuts: [
      { keys: ['⌘K', 'Ctrl+K'], description: 'Open command palette / search tools' },
      { keys: ['?'],             description: 'Show keyboard shortcuts' },
    ],
  },
  {
    group: 'File Editor',
    shortcuts: [
      { keys: ['Ctrl+S'],        description: 'Save current file' },
      { keys: ['Ctrl+W'],        description: 'Close current tab' },
      { keys: ['Ctrl+P'],        description: 'Quick open file (fuzzy)' },
      { keys: ['Ctrl+F'],        description: 'Find in page' },
      { keys: ['Ctrl+Shift+F'],  description: 'Find in files' },
      { keys: ['Ctrl+N'],        description: 'New unsaved buffer' },
      { keys: ['Alt+↑', 'Alt+↓'], description: 'Switch editor tab' },
    ],
  },
  {
    group: 'Repo Search',
    shortcuts: [
      { keys: ['/'], description: 'Focus search input' },
    ],
  },
  {
    group: 'API Tester',
    shortcuts: [
      { keys: ['Ctrl+Enter'], description: 'Send request' },
    ],
  },
  {
    group: 'Smart Diff',
    shortcuts: [
      { keys: ['Ctrl+Enter'], description: 'Run AI analysis' },
    ],
  },
]

interface KeyboardShortcutsProps {
  open: boolean
  onClose: () => void
}

function Kbd({ label }: { label: string }): JSX.Element {
  return (
    <kbd className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono bg-surface-container-high border border-outline-variant/40 text-on-surface-variant shadow-sm">
      {label}
    </kbd>
  )
}

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps): JSX.Element | null {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[540px] max-h-[80vh] bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>keyboard</span>
            <h2 className="text-sm font-semibold text-on-surface">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-5">
          {SHORTCUTS.map(({ group, shortcuts }) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-2">{group}</p>
              <div className="flex flex-col gap-1.5">
                {shortcuts.map(({ keys, description }) => (
                  <div key={description} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-on-surface-variant">{description}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] text-on-surface-variant/40">/</span>}
                          <Kbd label={k} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-outline-variant/15 flex items-center gap-1">
          <span className="text-[11px] text-on-surface-variant/50">Press</span>
          <Kbd label="?" />
          <span className="text-[11px] text-on-surface-variant/50">or</span>
          <Kbd label="Esc" />
          <span className="text-[11px] text-on-surface-variant/50">to close</span>
        </div>
      </div>
    </div>
  )
}

/** Hook to toggle the shortcuts modal with the "?" key */
export function useKeyboardShortcutsModal(): { open: boolean; toggle: () => void; close: () => void } {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // Only trigger when not typing inside an input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }
}
