import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Toggle } from '../../../core/components/Form'
import { useToast } from '../../../core/components/Toast'
import { DEFAULT_GENERATOR, GENERATOR_MAX, GENERATOR_MIN, clampLength, generatePassword, type GeneratorOptions } from '../generator'
import { estimateStrength } from '../strength'
import { copyToClipboard } from '../data'
import { StrengthMeter } from './StrengthMeter'

const PREFS_KEY = 'credentials.generator'

function loadPrefs(): GeneratorOptions {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<GeneratorOptions>
      return { ...DEFAULT_GENERATOR, ...p, length: clampLength(p.length ?? DEFAULT_GENERATOR.length) }
    }
  } catch { /* ignore */ }
  return DEFAULT_GENERATOR
}

/** Popover anchored by the parent (position: relative). Closes on outside click / Esc. */
export function PasswordGenerator({ onUse, onClose }: { onUse: (pwd: string) => void; onClose: () => void }): JSX.Element {
  const { show: toast } = useToast()
  const ref = useRef<HTMLDivElement>(null)
  const [opts, setOpts] = useState<GeneratorOptions>(loadPrefs)
  const [value, setValue] = useState(() => generatePassword(opts))
  const [copied, setCopied] = useState(false)

  const regenerate = useCallback((o: GeneratorOptions) => setValue(generatePassword(o)), [])

  const update = (patch: Partial<GeneratorOptions>): void => {
    const next = { ...opts, ...patch }
    setOpts(next)
    regenerate(next)
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  useEffect(() => {
    const onDown = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [onClose])

  const copy = async (): Promise<void> => {
    try {
      await copyToClipboard(value, true)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('No se pudo copiar al portapapeles', 'error')
    }
  }

  const strength = estimateStrength(value)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Generador de contraseñas"
      className="mac-popover hairline absolute right-0 top-full mt-2 z-50 w-[340px] p-4 flex flex-col gap-3.5"
      style={{ animation: 'mac-pop-in 0.14s ease both' }}
    >
      <div className="flex items-center gap-1.5 rounded-lg bg-surface-container dark:bg-white/5 pl-3 pr-1 py-1">
        <span className="flex-1 min-w-0 font-mono t-footnote text-on-surface break-all select-all py-1">{value}</span>
        <button type="button" onClick={() => regenerate(opts)} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Generar otra" aria-label="Generar otra">
          <RefreshCw size={14} />
        </button>
        <button type="button" onClick={() => void copy()} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Copiar" aria-label="Copiar contraseña generada">
          {copied ? <Check size={14} className="fx-pop text-success" /> : <Copy size={14} />}
        </button>
      </div>
      <StrengthMeter score={strength.score} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="t-footnote text-on-surface-variant">Longitud</span>
          <span className="t-footnote font-medium tabular-nums text-on-surface">{opts.length}</span>
        </div>
        <input
          type="range"
          min={GENERATOR_MIN}
          max={GENERATOR_MAX}
          value={opts.length}
          onChange={(e) => update({ length: clampLength(Number(e.target.value)) })}
          className="w-full accent-primary"
          aria-label="Longitud"
        />
      </div>

      <div className="flex flex-col gap-2">
        {([
          ['numbers', 'Números'],
          ['symbols', 'Símbolos'],
          ['pronounceable', 'Fácil de pronunciar'],
        ] as const).map(([k, label]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="t-body text-on-surface">{label}</span>
            <Toggle checked={opts[k]} onChange={(v) => update({ [k]: v })} label={label} />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="ui-btn ui-btn-outline ui-btn-sm">Cancelar</button>
        <button type="button" onClick={() => { onUse(value); onClose() }} className="ui-btn ui-btn-primary ui-btn-sm">Usar esta contraseña</button>
      </div>
    </div>
  )
}
