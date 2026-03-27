import { TERMINAL_THEMES } from './themes'
import type { TerminalPrefs } from './types'

interface Props {
  prefs: TerminalPrefs
  onChange: (patch: Partial<TerminalPrefs>) => void
}

const SHELLS_WIN  = ['cmd.exe', 'powershell.exe', 'pwsh.exe']
const SHELLS_UNIX = ['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/fish']
const IS_WIN      = navigator.userAgent.toLowerCase().includes('windows')
const SHELL_OPTS  = IS_WIN ? SHELLS_WIN : SHELLS_UNIX

const FONT_SIZES  = [10, 11, 12, 13, 14, 15, 16, 18, 20]

export function TerminalSettingsPanel({ prefs, onChange }: Props): JSX.Element {
  const row = 'flex items-center justify-between gap-4 py-2.5 border-b border-outline-variant/20'
  const label = 'text-[12px] text-on-surface font-medium'
  const sublabel = 'text-[11px] mt-0.5 text-on-surface-variant'
  const select = 'text-[12px] px-2 py-1 rounded-md focus:outline-none cursor-pointer border border-outline-variant/40'

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4">
      <div className="text-[13px] font-semibold text-on-surface mb-4">Terminal Settings</div>

      {/* Theme */}
      <div className={row}>
        <div>
          <div className={label}>Color Theme</div>
        </div>
        <select
          className={select}
          value={prefs.theme}
          onChange={(e) => onChange({ theme: e.target.value })}
        >
          {Object.entries(TERMINAL_THEMES).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div className={row}>
        <div>
          <div className={label}>Font Size</div>
        </div>
        <select
          className={select}
          value={prefs.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      {/* Font family */}
      <div className={row}>
        <div>
          <div className={label}>Font Family</div>
          <div className={sublabel} style={{ color: 'rgb(var(--c-on-surface-variant))' }}>
            Monospace fonts only
          </div>
        </div>
        <select
          className={select}
          value={prefs.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
        >
          {[
            'Consolas, "Cascadia Code", "Fira Code", monospace',
            '"Cascadia Code", Consolas, monospace',
            '"Fira Code", Consolas, monospace',
            '"JetBrains Mono", Consolas, monospace',
            'Consolas, monospace',
            '"Courier New", monospace',
          ].map((f) => (
            <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>
          ))}
        </select>
      </div>

      {/* Cursor style */}
      <div className={row}>
        <div>
          <div className={label}>Cursor Style</div>
        </div>
        <select
          className={select}
          value={prefs.cursorStyle}
          onChange={(e) => onChange({ cursorStyle: e.target.value as TerminalPrefs['cursorStyle'] })}
        >
          <option value="bar">Bar ( | )</option>
          <option value="block">Block ( █ )</option>
          <option value="underline">Underline ( _ )</option>
        </select>
      </div>

      {/* Cursor blink */}
      <div className={row}>
        <div>
          <div className={label}>Cursor Blink</div>
        </div>
        <button
          onClick={() => onChange({ cursorBlink: !prefs.cursorBlink })}
          className="relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200"
          style={{ background: prefs.cursorBlink ? 'rgb(var(--c-primary))' : 'rgb(var(--c-outline-variant))' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
            style={{ left: prefs.cursorBlink ? '1.25rem' : '0.125rem' }}
          />
        </button>
      </div>

      {/* Shell */}
      <div className={row}>
        <div>
          <div className={label}>Default Shell</div>
          <div className={sublabel} style={{ color: 'rgb(var(--c-on-surface-variant))' }}>
            Used when opening a new session
          </div>
        </div>
        <select
          className={select}
          value={prefs.shell || SHELL_OPTS[0]}
          onChange={(e) => onChange({ shell: e.target.value })}
        >
          {SHELL_OPTS.map((s) => (
            <option key={s} value={s}>{s.split(/[/\\]/).pop()}</option>
          ))}
        </select>
      </div>

      {/* Scrollback */}
      <div className={row}>
        <div>
          <div className={label}>Scrollback Lines</div>
        </div>
        <select
          className={select}
          value={prefs.scrollback}
          onChange={(e) => onChange({ scrollback: Number(e.target.value) })}
        >
          {[500, 1000, 2000, 3000, 5000, 10000].map((n) => (
            <option key={n} value={n}>{n.toLocaleString()}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
