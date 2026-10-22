import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Asterisk, Binary, Braces, Clock, Copy, Fingerprint, Hash, KeyRound, Link, RefreshCw, type LucideIcon,
} from 'lucide-react'
import { usePluginIntent } from '../../core/AppContext'
import { addVisited, NO_SEED, panelSeed, type ToolSeed } from './seed'
import { useToast } from '../../core/components/Toast'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { SPRING } from '../../core/motion'
import {
  base64Decode, base64Encode, dateInfo, decodeJwt, formatJson, hash, HASH_ALGOS, minifyJson, parseDateInput,
  testRegex, urlDecode, urlEncode, uuid, type HashAlgo, type Result,
} from './tools'

export type ToolId = 'json' | 'base64' | 'url' | 'jwt' | 'uuid' | 'time' | 'regex' | 'hash'

/** Intent desde Ctrl+K: abre una herramienta con el texto ya cargado. */
export interface UtilitiesIntentPayload { tool: ToolId; input?: string }

const TOOLS: { id: ToolId; name: string; hint: string; icon: LucideIcon }[] = [
  { id: 'json',   name: 'JSON',            hint: 'Formatear, validar, minificar', icon: Braces },
  { id: 'base64', name: 'Base64',          hint: 'Codificar y decodificar',       icon: Binary },
  { id: 'url',    name: 'URL encode',      hint: 'Escapar parámetros',            icon: Link },
  { id: 'jwt',    name: 'JWT',             hint: 'Ver header, payload y vencimiento', icon: KeyRound },
  { id: 'uuid',   name: 'UUID / GUID',     hint: 'Generar identificadores',       icon: Fingerprint },
  { id: 'time',   name: 'Timestamp',       hint: 'Unix ⇄ fecha',                  icon: Clock },
  { id: 'regex',  name: 'Regex',           hint: 'Probar expresiones',            icon: Asterisk },
  { id: 'hash',   name: 'Hash',            hint: 'MD5, SHA-1, SHA-256, SHA-512',  icon: Hash },
]

const LAST_TOOL_KEY = 'utilities:last-tool'

function readLastTool(): ToolId {
  try {
    const v = localStorage.getItem(LAST_TOOL_KEY)
    if (v && TOOLS.some((t) => t.id === v)) return v as ToolId
  } catch { /* storage unavailable */ }
  return 'json'
}

export function UtilitiesPlugin(): JSX.Element {
  const [tool, setTool] = useState<ToolId>(readLastTool)
  // Texto que trae Ctrl+K: sólo para su herramienta y una vez (remonta ese panel).
  const [seed, setSeed] = useState<ToolSeed<ToolId>>(NO_SEED)
  // Las herramientas abiertas quedan montadas (ocultas): al volver, sigue lo que escribiste.
  const [visited, setVisited] = useState<ToolId[]>(() => [tool])

  useEffect(() => {
    try { localStorage.setItem(LAST_TOOL_KEY, tool) } catch { /* ignore */ }
    setVisited((v) => addVisited(v, tool))
  }, [tool])

  usePluginIntent('utilities', (intent) => {
    const p = intent.payload as UtilitiesIntentPayload | undefined
    if (intent.action !== 'open' || !p || !TOOLS.some((t) => t.id === p.tool)) return
    setTool(p.tool)
    setSeed({ tool: p.tool, input: p.input ?? '', stamp: intent.stamp })
  })

  const current = TOOLS.find((t) => t.id === tool)!

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <aside className="pane-nav shrink-0 flex flex-col hairline-r">
        <div className="px-3 pt-4 pb-3 pl-[18px]">
          <h1 className="t-headline text-on-surface">Utilidades</h1>
          <p className="t-caption text-on-surface-variant mt-0.5">También desde Ctrl+K: pegá un JWT, JSON o timestamp.</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5" aria-label="Herramientas">
          {TOOLS.map((t) => {
            const active = t.id === tool
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  active ? '' : 'hover:bg-on-surface/3 dark:hover:bg-white/4'
                }`}
              >
                {active && <motion.span layoutId="utilities-active" className="absolute inset-0 z-0 rounded-lg nav-active" transition={SPRING.snappy} />}
                <Icon size={16} className={`relative z-10 shrink-0 ${active ? 'text-on-surface' : 'text-on-surface-variant'}`} />
                <span className="relative z-10 min-w-0">
                  <span className={`block text-[13px] ${active ? 'font-medium text-on-surface' : 'font-medium text-on-surface/90'}`}>{t.name}</span>
                  <span className="block t-caption text-on-surface-variant truncate">{t.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="pane-detail flex flex-col gap-5">
          <div>
            <h2 className="t-title2 text-on-surface">{current.name}</h2>
            <p className="t-callout text-on-surface-variant mt-1">{current.hint}</p>
          </div>
          {addVisited(visited, tool).map((t) => {
            const ps = panelSeed(seed, t)
            return (
              <div key={t} className={t === tool ? 'flex flex-col gap-4' : 'hidden'}>
                <ToolPanel key={ps.key} tool={t} initial={ps.initial} />
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function ToolPanel({ tool, initial }: { tool: ToolId; initial: string }): JSX.Element {
  switch (tool) {
    case 'json': return <JsonTool initial={initial} />
    case 'base64': return <Base64Tool initial={initial} />
    case 'url': return <UrlTool initial={initial} />
    case 'jwt': return <JwtTool initial={initial} />
    case 'uuid': return <UuidTool />
    case 'time': return <TimeTool initial={initial} />
    case 'regex': return <RegexTool />
    case 'hash': return <HashTool initial={initial} />
  }
}

// ─── Piezas comunes ──────────────────────────────────────────────────────────

function useCopy(): (text: string) => void {
  const toast = useToast()
  return (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.show('Copiado', 'success'),
      () => toast.show('No se pudo copiar al portapapeles', 'error'),
    )
  }
}

function Field({ label, value, onChange, rows = 8, placeholder, mono = true }: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  mono?: boolean
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="t-footnote font-medium text-on-surface-variant">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        autoFocus
        className={`ui-input resize-y min-h-[72px] ${mono ? 'font-mono text-[12.5px] leading-5' : ''}`}
      />
    </label>
  )
}

function Output({ label, result, rows }: { label: string; result: Result<string> | null; rows?: number }): JSX.Element {
  const copy = useCopy()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="t-footnote font-medium text-on-surface-variant flex-1">{label}</span>
        {result?.ok && result.value && (
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => copy(result.value)}>
            <Copy size={12} /> Copiar
          </button>
        )}
      </div>
      {result && !result.ok ? (
        <p className="t-footnote text-error bg-error/8 rounded-lg px-3 py-2.5 font-mono wrap-break-word">{result.error}</p>
      ) : (
        <pre
          className="ui-card px-3 py-2.5 font-mono text-[12.5px] leading-5 text-on-surface whitespace-pre-wrap break-all overflow-auto select-text"
          style={rows ? { maxHeight: rows * 20 + 24 } : { maxHeight: 420 }}
        >
          {result?.value || <span className="text-on-surface-variant/60">—</span>}
        </pre>
      )}
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }): JSX.Element {
  const copy = useCopy()
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hairline-b last:border-b-0">
      {label && <span className="t-footnote text-on-surface-variant w-36 shrink-0">{label}</span>}
      <span className="flex-1 min-w-0 font-mono text-[12.5px] text-on-surface truncate select-text">{value}</span>
      <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => copy(value)} aria-label={`Copiar ${label}`} title="Copiar">
        <Copy size={13} />
      </button>
    </div>
  )
}

// ─── Herramientas ────────────────────────────────────────────────────────────

function JsonTool({ initial }: { initial: string }): JSX.Element {
  const [input, setInput] = useState(initial)
  const [mode, setMode] = useState<'pretty' | 'tabs' | 'min'>('pretty')
  const result = useMemo(() => {
    if (!input.trim()) return null
    return mode === 'min' ? minifyJson(input) : formatJson(input, mode === 'tabs' ? '\t' : 2)
  }, [input, mode])
  return (
    <>
      <Field label="JSON" value={input} onChange={setInput} placeholder='{"pegá": "tu JSON acá"}' />
      <SegmentedControl<'pretty' | 'tabs' | 'min'>
        value={mode}
        onChange={setMode}
        options={[{ value: 'pretty', label: '2 espacios' }, { value: 'tabs', label: 'Tabs' }, { value: 'min', label: 'Minificado' }]}
        className="self-start"
      />
      <Output label={result?.ok === false ? 'Error' : 'Resultado'} result={result} />
    </>
  )
}

function Base64Tool({ initial }: { initial: string }): JSX.Element {
  const [input, setInput] = useState(initial)
  const [dir, setDir] = useState<'decode' | 'encode' | 'encode-url'>(initial ? 'decode' : 'encode')
  const result = useMemo((): Result<string> | null => {
    if (!input) return null
    if (dir === 'decode') return base64Decode(input)
    return { ok: true, value: base64Encode(input, dir === 'encode-url') }
  }, [input, dir])
  return (
    <>
      <SegmentedControl<'decode' | 'encode' | 'encode-url'>
        value={dir}
        onChange={setDir}
        options={[{ value: 'encode', label: 'Codificar' }, { value: 'encode-url', label: 'Codificar (URL-safe)' }, { value: 'decode', label: 'Decodificar' }]}
        className="self-start"
      />
      <Field label={dir === 'decode' ? 'Base64' : 'Texto'} value={input} onChange={setInput} rows={6} />
      <Output label={dir === 'decode' ? 'Texto' : 'Base64'} result={result} />
    </>
  )
}

function UrlTool({ initial }: { initial: string }): JSX.Element {
  const [input, setInput] = useState(initial)
  const [dir, setDir] = useState<'encode' | 'decode'>(/%[0-9A-F]{2}/i.test(initial) ? 'decode' : 'encode')
  const result = useMemo((): Result<string> | null => {
    if (!input) return null
    return dir === 'decode' ? urlDecode(input) : { ok: true, value: urlEncode(input) }
  }, [input, dir])
  return (
    <>
      <SegmentedControl<'encode' | 'decode'>
        value={dir}
        onChange={setDir}
        options={[{ value: 'encode', label: 'Codificar' }, { value: 'decode', label: 'Decodificar' }]}
        className="self-start"
      />
      <Field label="Texto" value={input} onChange={setInput} rows={5} />
      <Output label="Resultado" result={result} />
    </>
  )
}

function JwtTool({ initial }: { initial: string }): JSX.Element {
  const [input, setInput] = useState(initial)
  const decoded = useMemo(() => (input.trim() ? decodeJwt(input) : null), [input])
  return (
    <>
      <Field label="Token" value={input} onChange={setInput} rows={4} placeholder="eyJhbGciOi… (también acepta «Bearer …»)" />
      {decoded && !decoded.ok && <Output label="Error" result={decoded} />}
      {decoded?.ok && (
        <>
          {decoded.value.expiresAt && (
            <div className={`ui-card px-4 py-3 flex items-center gap-2 t-body ${decoded.value.expired ? 'text-error' : 'text-success'}`}>
              <Clock size={15} />
              <span className="font-medium">{decoded.value.expired ? 'Vencido' : 'Vigente'}</span>
              <span className="text-on-surface-variant">
                · vence {dateInfo(decoded.value.expiresAt).relative} ({decoded.value.expiresAt.toLocaleString('es-AR')})
              </span>
            </div>
          )}
          <Output label="Header" result={{ ok: true, value: JSON.stringify(decoded.value.header, null, 2) }} />
          <Output label="Payload" result={{ ok: true, value: JSON.stringify(decoded.value.payload, null, 2) }} />
          <p className="t-caption text-on-surface-variant">La firma no se verifica: sólo se decodifica para inspeccionar.</p>
        </>
      )}
    </>
  )
}

function UuidTool(): JSX.Element {
  const copy = useCopy()
  const [count, setCount] = useState(5)
  const [upper, setUpper] = useState(false)
  const [braces, setBraces] = useState(false)
  const [ids, setIds] = useState<string[]>(() => Array.from({ length: 5 }, uuid))
  const fmt = (id: string): string => {
    const v = upper ? id.toUpperCase() : id
    return braces ? `{${v}}` : v
  }
  const regen = (n = count): void => setIds(Array.from({ length: n }, uuid))
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 t-footnote text-on-surface-variant">
          Cantidad
          <input
            type="number" min={1} max={100} value={count}
            onChange={(e) => { const n = Math.max(1, Math.min(100, Number(e.target.value) || 1)); setCount(n); regen(n) }}
            className="ui-input w-20"
          />
        </label>
        <label className="flex items-center gap-1.5 t-footnote text-on-surface-variant">
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} className="accent-primary" /> Mayúsculas
        </label>
        <label className="flex items-center gap-1.5 t-footnote text-on-surface-variant">
          <input type="checkbox" checked={braces} onChange={(e) => setBraces(e.target.checked)} className="accent-primary" /> Con llaves (GUID)
        </label>
        <span className="flex-1" />
        <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" onClick={() => regen()}><RefreshCw size={12} /> Generar</button>
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => copy(ids.map(fmt).join('\n'))}><Copy size={12} /> Copiar todos</button>
      </div>
      <div className="ui-card overflow-hidden">
        {ids.map((id) => <CopyRow key={id} label="" value={fmt(id)} />)}
      </div>
    </>
  )
}

function TimeTool({ initial }: { initial: string }): JSX.Element {
  const [input, setInput] = useState(initial || String(Math.floor(Date.now() / 1000)))
  const parsed = useMemo(() => parseDateInput(input), [input])
  const info = parsed.ok ? dateInfo(parsed.value) : null
  return (
    <>
      <div className="flex items-end gap-2">
        <label className="flex-1 flex flex-col gap-1.5">
          <span className="t-footnote font-medium text-on-surface-variant">Timestamp (s o ms) o fecha</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus spellCheck={false} className="ui-input font-mono" placeholder="1700000000 · 2024-05-01 13:00 · 2024-05-01T13:00:00Z" />
        </label>
        <button type="button" className="ui-btn ui-btn-outline" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>Ahora</button>
      </div>
      {!parsed.ok && input.trim() && <Output label="Error" result={parsed} />}
      {info && (
        <div className="ui-card overflow-hidden">
          <CopyRow label="Fecha local" value={info.local} />
          <CopyRow label="ISO 8601 (UTC)" value={info.iso} />
          <CopyRow label="Unix (segundos)" value={String(info.unixSeconds)} />
          <CopyRow label="Unix (ms)" value={String(info.unixMs)} />
          <CopyRow label="Relativo" value={info.relative} />
        </div>
      )}
    </>
  )
}

function RegexTool(): JSX.Element {
  const [pattern, setPattern] = useState('(\\d{4})-(\\d{2})-(\\d{2})')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('Vence 2026-10-15, pagado 2026-09-30.')
  const result = useMemo(() => (pattern ? testRegex(pattern, flags, text) : null), [pattern, flags, text])

  // Texto con las coincidencias resaltadas (sólo spans, sin HTML del usuario).
  const highlighted = useMemo(() => {
    if (!result?.ok || result.value.length === 0) return [text]
    const out: (string | JSX.Element)[] = []
    let last = 0
    result.value.forEach((m, i) => {
      if (m.text.length === 0) return
      out.push(text.slice(last, m.index))
      out.push(<mark key={i} className="bg-primary/20 text-on-surface rounded-[3px] px-0.5">{m.text}</mark>)
      last = m.index + m.text.length
    })
    out.push(text.slice(last))
    return out
  }, [result, text])

  return (
    <>
      <div className="flex items-end gap-2">
        <label className="flex-1 flex flex-col gap-1.5">
          <span className="t-footnote font-medium text-on-surface-variant">Expresión</span>
          <div className="flex items-center ui-input font-mono gap-1 focus-within:shadow-[0_0_0_3px_rgb(var(--c-primary)/0.16)]">
            <span className="text-on-surface-variant">/</span>
            <input value={pattern} onChange={(e) => setPattern(e.target.value)} autoFocus spellCheck={false} className="flex-1 min-w-0 bg-transparent outline-hidden" />
            <span className="text-on-surface-variant">/</span>
            <input value={flags} onChange={(e) => setFlags(e.target.value.replace(/[^dgimsuy]/g, ''))} spellCheck={false} className="w-12 bg-transparent outline-hidden" aria-label="Flags" />
          </div>
        </label>
      </div>
      <Field label="Texto de prueba" value={text} onChange={setText} rows={5} />
      {result && !result.ok && <Output label="Error" result={result} />}
      {result?.ok && (
        <>
          <div className="ui-card px-3 py-2.5 font-mono text-[12.5px] leading-6 whitespace-pre-wrap wrap-break-word">{highlighted}</div>
          <p className="t-footnote text-on-surface-variant">
            {result.value.length === 0 ? 'Sin coincidencias' : `${result.value.length} coincidencia${result.value.length === 1 ? '' : 's'}`}
          </p>
          {result.value.length > 0 && (
            <div className="ui-card overflow-hidden">
              {result.value.slice(0, 100).map((m, i) => (
                <div key={i} className="flex gap-3 px-4 py-2 hairline-b last:border-b-0 font-mono text-[12px]">
                  <span className="text-on-surface-variant w-10 shrink-0">#{i + 1}</span>
                  <span className="text-on-surface">{m.text || '(vacía)'}</span>
                  {m.groups.length > 0 && (
                    <span className="text-on-surface-variant truncate">
                      {m.groups.map((g, gi) => `$${gi + 1}=${g ?? '∅'}`).join('  ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function HashTool({ initial }: { initial: string }): JSX.Element {
  const [input, setInput] = useState(initial)
  const [hashes, setHashes] = useState<Partial<Record<HashAlgo, string>>>({})
  useEffect(() => {
    let cancelled = false
    void Promise.all(HASH_ALGOS.map(async (a) => [a, await hash(input, a)] as const)).then((pairs) => {
      if (!cancelled) setHashes(Object.fromEntries(pairs))
    })
    return () => { cancelled = true }
  }, [input])
  return (
    <>
      <Field label="Texto (UTF-8)" value={input} onChange={setInput} rows={5} />
      <div className="ui-card overflow-hidden">
        {HASH_ALGOS.map((a) => <CopyRow key={a} label={a} value={hashes[a] ?? '…'} />)}
      </div>
    </>
  )
}
