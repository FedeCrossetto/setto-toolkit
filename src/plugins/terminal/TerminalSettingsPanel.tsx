import { TERMINAL_THEMES } from './themes'
import type { TerminalPrefs } from './types'
import { Toggle, SettingsGroup, SettingsRow } from '../../core/components/Form'

interface Props {
  prefs: TerminalPrefs
  onChange: (patch: Partial<TerminalPrefs>) => void
}

const SHELLS_WIN  = ['cmd.exe', 'powershell.exe', 'pwsh.exe']
const SHELLS_UNIX = ['/bin/bash', '/bin/zsh', '/bin/sh', '/usr/bin/fish']
const IS_WIN      = navigator.userAgent.toLowerCase().includes('windows')
const SHELL_OPTS  = IS_WIN ? SHELLS_WIN : SHELLS_UNIX

const FONT_SIZES  = [10, 11, 12, 13, 14, 15, 16, 18, 20]

const FONT_FAMILIES = [
  'Consolas, "Cascadia Code", "Fira Code", monospace',
  '"Cascadia Code", Consolas, monospace',
  '"Fira Code", Consolas, monospace',
  '"JetBrains Mono", Consolas, monospace',
  'Consolas, monospace',
  '"Courier New", monospace',
]

export function TerminalSettingsPanel({ prefs, onChange }: Props): JSX.Element {
  const select = 'ui-input py-1! t-footnote cursor-pointer max-w-[160px]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-3 h-10 hairline-b shrink-0">
        <span className="t-headline text-on-surface">Ajustes de la terminal</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        <SettingsGroup title="Apariencia">
          <SettingsRow title="Tema de color">
            <select
              className={select}
              value={prefs.theme}
              onChange={(e) => onChange({ theme: e.target.value })}
              aria-label="Tema de color"
            >
              {Object.entries(TERMINAL_THEMES).map(([key, def]) => (
                <option key={key} value={key}>{def.label}</option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow title="Tamaño de fuente">
            <select
              className={select}
              value={prefs.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              aria-label="Tamaño de fuente"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s} px</option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow title="Fuente" description="Solo fuentes monoespaciadas">
            <select
              className={select}
              value={prefs.fontFamily}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
              aria-label="Fuente"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f.split(',')[0]!.replace(/"/g, '')}</option>
              ))}
            </select>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Cursor">
          <SettingsRow title="Estilo">
            <select
              className={select}
              value={prefs.cursorStyle}
              onChange={(e) => onChange({ cursorStyle: e.target.value as TerminalPrefs['cursorStyle'] })}
              aria-label="Estilo del cursor"
            >
              <option value="bar">Barra ( | )</option>
              <option value="block">Bloque ( █ )</option>
              <option value="underline">Subrayado ( _ )</option>
            </select>
          </SettingsRow>
          <SettingsRow title="Parpadeo">
            <Toggle checked={prefs.cursorBlink} onChange={(v) => onChange({ cursorBlink: v })} label="Parpadeo del cursor" />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Sesiones">
          <SettingsRow title="Shell por defecto" description="Se usa al abrir una sesión nueva">
            <select
              className={select}
              value={prefs.shell || SHELL_OPTS[0]}
              onChange={(e) => onChange({ shell: e.target.value })}
              aria-label="Shell por defecto"
            >
              {SHELL_OPTS.map((s) => (
                <option key={s} value={s}>{s.split(/[/\\]/).pop()}</option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow title="Líneas de historial">
            <select
              className={select}
              value={prefs.scrollback}
              onChange={(e) => onChange({ scrollback: Number(e.target.value) })}
              aria-label="Líneas de historial"
            >
              {[500, 1000, 2000, 3000, 5000, 10000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString('es-AR')}</option>
              ))}
            </select>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  )
}
