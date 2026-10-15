import { Check } from 'lucide-react'
import { THEME_FAMILIES, hasBothVariants, resolveEditorTheme } from '../themes/registry'
import type { EditorColorScheme } from '../themes/registry'
import type { EditorThemeDef, EditorThemeSyntax } from '../themes/types'
import type { EditorTheme } from '../hooks/useEditorPrefs'

// Tiny fake TS snippet — [text, syntax key | 'fg'] per token, one array per line
type Tok = [string, keyof EditorThemeSyntax | 'fg']
const SNIPPET: Tok[][] = [
  [['// total del carrito', 'comment']],
  [['export ', 'controlKeyword'], ['function ', 'keyword'], ['total', 'function'], ['(', 'punctuation'], ['xs', 'variable'], [': ', 'punctuation'], ['Item', 'type'], ['[]) {', 'punctuation']],
  [['  const ', 'keyword'], ['iva', 'variable'], [' = ', 'operator'], ['0.21', 'number']],
  [['  return ', 'controlKeyword'], ['xs', 'variable'], ['.', 'punctuation'], ['sum', 'method'], ['(', 'punctuation'], ['"precio"', 'string'], [')', 'punctuation']],
  [['}', 'punctuation']],
]

function ThemePreview({ def }: { def: EditorThemeDef }): JSX.Element {
  const c = def.colors
  return (
    <div
      aria-hidden
      className="px-2.5 py-2 font-mono text-[10px] leading-[1.55] whitespace-pre overflow-hidden text-left"
      style={{ background: c.bg, color: c.fg }}
    >
      {SNIPPET.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-3.5 shrink-0 select-none" style={{ color: i === 2 ? c.gutterActiveFg : c.gutterFg }}>{i + 1}</span>
          <span className="flex-1 min-w-0 truncate rounded-[2px]" style={i === 2 ? { background: c.activeLine } : undefined}>
            {line.map(([text, key], j) => (
              <span key={j} style={{
                color: key === 'fg' ? c.fg : def.syntax[key],
                fontStyle: key === 'comment' && def.italicComments ? 'italic' : undefined,
              }}>{text}</span>
            ))}
            {i === 2 && <span className="inline-block w-[1.5px] h-[1.1em] align-middle" style={{ background: c.cursor }} />}
          </span>
        </div>
      ))}
    </div>
  )
}

interface ThemeGridProps {
  value: EditorColorScheme
  editorTheme: EditorTheme
  appDark: boolean
  onChange: (id: EditorColorScheme) => void
  /** Live preview while hovering a card; `null` when the pointer leaves the grid */
  onPreview?: (id: EditorColorScheme | null) => void
  columns?: 2 | 3
}

/** Theme picker: preview cards grouped in "Recomendados" / "Más temas" */
export function ThemeGrid({ value, editorTheme, appDark, onChange, onPreview, columns = 2 }: ThemeGridProps): JSX.Element {
  const groups = [
    { title: 'Recomendados', items: THEME_FAMILIES.filter((f) => f.recommended) },
    { title: 'Más temas', items: THEME_FAMILIES.filter((f) => !f.recommended) },
  ]
  return (
    <div className="flex flex-col gap-3" onMouseLeave={() => onPreview?.(null)}>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1.5">
          <p className="t-section px-1">{g.title}</p>
          <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={g.title}>
            {g.items.map((f) => {
              const def = resolveEditorTheme(f.id, editorTheme, appDark)
              const selected = value === f.id
              const both = hasBothVariants(f.id)
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(f.id)}
                  onMouseEnter={() => onPreview?.(f.id)}
                  onFocus={() => onPreview?.(f.id)}
                  title={both ? `${f.name} · tiene variante clara y oscura (sigue el modo elegido)` : `${f.name} · solo ${def.variant === 'dark' ? 'oscuro' : 'claro'}`}
                  className={`group flex flex-col rounded-lg overflow-hidden text-left transition-shadow ${
                    selected
                      ? 'shadow-[0_0_0_2px_rgb(var(--c-primary))]'
                      : 'shadow-[0_0_0_1px_var(--hairline-strong)] hover:shadow-[0_0_0_1px_rgb(var(--c-primary)/0.6)]'
                  }`}
                >
                  <ThemePreview def={def} />
                  <span className="flex items-center gap-1.5 px-2 py-1.5 bg-surface hairline-t min-w-0">
                    <span className={`t-caption font-medium truncate flex-1 ${selected ? 'text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                      {def.followsApp ? f.name : def.name}
                    </span>
                    {selected && <Check size={12} className="text-primary shrink-0" />}
                    <span className="px-1.5 rounded-full bg-on-surface/6 t-caption text-on-surface-variant shrink-0">
                      {def.variant === 'dark' ? 'Oscuro' : 'Claro'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
