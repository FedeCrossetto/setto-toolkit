import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ClipboardText, Code2, CornerDownLeft, Images, Lock, Pin, ScanText, Search, Wand2,
} from 'lucide-react'
import { matchSnippets, recentSnippets } from './search'
import { initialValues, parseVariables, renderTemplate, stripDataUrls } from './template'
import { loadRemembered, saveRemembered } from './VariablesModal'
import { langLabel } from './langs'
import { reloadAppearanceFromStorage } from '../../core/hooks/useThemePalette'
import { normalize as normText } from '../../core/search'
import { transformsFor, type ClipView } from '../../core/clip-utils'
import { actionsFor, KIND_LABEL, type OpenAction } from '../../core/clip-actions'
import { thumbUrl, type CaptureLite, type CaptureQueryResult } from '../captures/types'
import type { Snippet, SnippetCollection } from './types'

/**
 * Ventanita flotante del atajo global (Ctrl+Alt+V): texto copiado, capturas y
 * snippets en un solo lugar. Enter pega en la app que estaba en primer plano;
 * → transforma antes de pegar (IN de SQL, tabla de Jira…); Shift+Enter arma
 * una secuencia para pegar de a uno con Ctrl+Alt+Shift+V.
 * Se renderiza sola (sin el shell) en la ventana `#snippet-picker`.
 */

type Filter = 'all' | 'clips' | 'captures' | 'snippets' | 'pinned'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todo' }, { id: 'clips', label: 'Copiado' }, { id: 'captures', label: 'Capturas' },
  { id: 'snippets', label: 'Snippets' }, { id: 'pinned', label: 'Fijados' },
]

type Item =
  | { key: string; type: 'clip'; clip: ClipView }
  | { key: string; type: 'capture'; cap: CaptureLite }
  | { key: string; type: 'snippet'; snip: Snippet }

function syncTheme(): void {
  // La ventana queda viva entre usos: re-leer tema y apariencia por si cambiaron en la principal.
  try { document.documentElement.classList.toggle('dark', localStorage.getItem('app-theme') === 'dark') } catch { /* sin storage */ }
  reloadAppearanceFromStorage()
}

const ago = (t: number): string => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'recién'
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86_400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86_400)} d`
}
const oneLine = (s: string, n = 90): string => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

export function SnippetPicker(): JSX.Element {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [collections, setCollections] = useState<SnippetCollection[]>([])
  const [clips, setClips] = useState<ClipView[]>([])
  const [caps, setCaps] = useState<CaptureLite[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sel, setSel] = useState(0)
  const [marked, setMarked] = useState<string[]>([])
  const [mode, setMode] = useState<'list' | 'transform' | 'vars'>('list')
  const [tSel, setTSel] = useState(0)
  const [filling, setFilling] = useState<Snippet | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [autoPaste, setAutoPaste] = useState(true)
  const [shortcuts, setShortcuts] = useState<{ picker: string | null; next: string | null; ocr: string | null }>({ picker: null, next: null, ocr: null })
  const [flash, setFlash] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const firstVarRef = useRef<HTMLInputElement>(null)

  const say = (msg: string, ms = 2500): void => { setFlash(msg); setTimeout(() => setFlash(null), ms) }
  const cleanErr = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  /** Errores al pegar/copiar: aviso en la barra de abajo (la ventanita queda abierta para reintentar). */
  const guard = async (what: string, fn: () => Promise<void>): Promise<void> => {
    try { await fn() } catch (err) { say(`${what}: ${cleanErr(err)}`, 4000) }
  }

  const loadStatic = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.invoke<{ snippets: Snippet[]; collections: SnippetCollection[] }>('snippets:load')
      setSnippets(data.snippets)
      setCollections(data.collections)
    } catch { /* sin snippets */ }
    try { setClips(await window.api.invoke<ClipView[]>('clipboard:history')) } catch { setClips([]) }
    try {
      setAutoPaste((await window.api.invoke<string | null>('settings:get', 'snippets.auto_paste')) !== '0')
      const s = await window.api.invoke<{ next: string | null; ocr: string | null }>('clipboard:shortcuts')
      setShortcuts({ picker: await window.api.invoke<string | null>('snippet-picker:shortcut'), next: s.next, ocr: s.ocr })
    } catch { /* valores por defecto */ }
  }, [])

  useEffect(() => {
    void loadStatic()
    return window.api.on('snippet-picker:opened', () => {
      syncTheme()
      setQuery('')
      setSel(0)
      setMarked([])
      setMode('list')
      setFilling(null)
      void loadStatic()
      setTimeout(() => inputRef.current?.focus(), 0)
    })
  }, [loadStatic])

  // Capturas: las busca main (por el texto de la imagen, ticket, app…).
  useEffect(() => {
    const t = setTimeout(() => {
      window.api.invoke<CaptureQueryResult>('captures:query', { text: query.trim(), limit: 8 })
        .then((r) => setCaps(r.items), () => setCaps([]))
    }, query ? 120 : 0)
    return () => clearTimeout(t)
  }, [query])

  const items = useMemo((): Item[] => {
    const q = normText(query.trim())
    const words = q.split(/\s+/).filter(Boolean)
    const clipMatch = (c: ClipView): boolean =>
      !words.length || words.every((w) => normText(`${c.sensitive ? '' : c.text} ${c.app ?? ''} ${KIND_LABEL[c.kind]}`).includes(w))
    const clipItems = clips.filter(clipMatch).map((c): Item => ({ key: `c:${c.id}`, type: 'clip', clip: c }))
    const pinned = clipItems.filter((i) => i.type === 'clip' && i.clip.pinned)
    const recent = clipItems.filter((i) => i.type === 'clip' && !i.clip.pinned)
    const capItems = caps.map((c): Item => ({ key: `i:${c.id}`, type: 'capture', cap: c }))
    const snipList = query.trim() ? matchSnippets(snippets, query.trim(), 12).map((r) => r.snippet) : recentSnippets(snippets, 8)
    const snipItems = snipList.map((s): Item => ({ key: `s:${s.id}`, type: 'snippet', snip: s }))
    switch (filter) {
      case 'clips': return [...pinned, ...recent]
      case 'pinned': return pinned
      case 'captures': return capItems
      case 'snippets': return snipItems
      default: return [...pinned, ...recent.slice(0, query ? 12 : 8), ...capItems.slice(0, 4), ...snipItems.slice(0, 6)]
    }
  }, [clips, caps, snippets, query, filter])

  const current = items[Math.min(sel, items.length - 1)]
  const close = (): void => window.api.send('snippet-picker:close')
  const openInMain = (a: OpenAction): void => { window.api.send('app:open-in-main', a); close() }
  useEffect(() => { document.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' }) }, [sel, items])

  // ── Pegar ──────────────────────────────────────────────────────────────────

  const pasteText = async (text: string, copyOnly: boolean): Promise<void> => {
    await window.api.invoke('snippet-picker:paste', text, autoPaste && !copyOnly)
  }
  const pasteCurrentClipboard = async (copyOnly: boolean): Promise<void> => {
    await window.api.invoke('snippet-picker:paste-current', autoPaste && !copyOnly)
  }
  /** Texto "real" de un ítem para transformar o secuenciar (null si no aplica). */
  const textOf = (it: Item): string | null => {
    if (it.type === 'clip') return it.clip.sensitive ? null : it.clip.text
    if (it.type === 'snippet') {
      const content = stripDataUrls(it.snip.content)
      return renderTemplate(content, initialValues(parseVariables(content), loadRemembered(it.snip.id)))
    }
    return null
  }

  const choose = (it: Item, copyOnly: boolean): Promise<void> => guard('No se pudo pegar', () => chooseUnsafe(it, copyOnly))
  const chooseUnsafe = async (it: Item, copyOnly: boolean): Promise<void> => {
    if (it.type === 'clip') {
      if (it.clip.sensitive) { await window.api.invoke('clipboard:copy', it.clip.id); await pasteCurrentClipboard(copyOnly) }
      else await pasteText(it.clip.text, copyOnly)
    } else if (it.type === 'capture') {
      await window.api.invoke('captures:copy', it.cap.id)
      await pasteCurrentClipboard(copyOnly)
    } else {
      const content = stripDataUrls(it.snip.content)
      const vars = parseVariables(content)
      if (vars.length === 0) {
        await pasteText(content, copyOnly)
        void window.api.invoke('snippets:mark-used', it.snip.id).catch(() => undefined)
        return
      }
      setFilling(it.snip)
      setValues(initialValues(vars, loadRemembered(it.snip.id)))
      setMode('vars')
      setTimeout(() => firstVarRef.current?.focus(), 0)
    }
  }

  const submitVars = (copyOnly: boolean): Promise<void> => guard('No se pudo pegar', async () => {
    if (!filling) return
    saveRemembered(filling.id, values)
    await pasteText(renderTemplate(stripDataUrls(filling.content), values), copyOnly)
    void window.api.invoke('snippets:mark-used', filling.id).catch(() => undefined)
  })

  /** Pegar en secuencia: el primero ahora, el resto con el atajo "siguiente". */
  const startSequence = async (): Promise<void> => {
    const chosen = items.filter((it) => marked.includes(it.key))
    const queue = chosen.flatMap((it): ({ id: string } | { text: string })[] => {
      if (it.type === 'clip' && it.clip.sensitive) return [{ id: it.clip.id }]
      const t = textOf(it)
      return t ? [{ text: t }] : []
    })
    if (!queue.length) { say('Las capturas no se pueden pegar en secuencia'); return }
    await guard('No se pudo armar la secuencia', async () => {
      await window.api.invoke('clipboard:queue-set', queue)
      await window.api.invoke('clipboard:queue-advance')
      await pasteCurrentClipboard(false)
    })
  }

  const toggleMark = (it: Item | undefined): void => {
    if (!it || it.type === 'capture') return
    setMarked((m) => (m.includes(it.key) ? m.filter((k) => k !== it.key) : [...m, it.key]))
  }

  const togglePin = async (it: Item | undefined): Promise<void> => {
    if (!it || it.type !== 'clip') return
    try {
      await window.api.invoke('clipboard:pin', it.clip.id, !it.clip.pinned)
      setClips(await window.api.invoke<ClipView[]>('clipboard:history'))
    } catch (err) { say(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)) }
  }

  const ocr = async (): Promise<void> => {
    const r = await window.api.invoke<{ ok: boolean; text?: string; reason?: string }>('clipboard:ocr-image')
    if (!r.ok) { say(r.reason ?? 'No se pudo leer el texto'); return }
    setClips(await window.api.invoke<ClipView[]>('clipboard:history'))
    setQuery('')
    setFilter('all')
    say('Texto de la imagen copiado: Enter para pegarlo')
    // El texto queda primero en "Copiado" cuando el historial lo registre.
    setTimeout(() => { void window.api.invoke<ClipView[]>('clipboard:history').then(setClips); setSel(0) }, 900)
  }

  // ── Transformaciones ───────────────────────────────────────────────────────

  const currentText = current ? textOf(current) : null
  const transforms = useMemo(() => transformsFor(current?.type === 'clip' ? current.clip.kind : 'text'), [current])
  const tCurrent = transforms[Math.min(tSel, transforms.length - 1)]
  const preview = mode === 'transform' && currentText && tCurrent ? tCurrent.apply(currentText) : ''
  const kindActions = current?.type === 'clip' && !current.clip.sensitive ? actionsFor(current.clip.kind, current.clip.text) : []

  // ── Teclado ────────────────────────────────────────────────────────────────

  const onKey = (e: React.KeyboardEvent): void => {
    const ctrl = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') {
      e.preventDefault()
      if (mode !== 'list') { setMode('list'); setFilling(null); setTimeout(() => inputRef.current?.focus(), 0) } else close()
      return
    }
    if (mode === 'vars') {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitVars(ctrl) }
      return
    }
    if (mode === 'transform') {
      if (e.key === 'ArrowDown') { e.preventDefault(); setTSel((i) => Math.min(i + 1, transforms.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setTSel((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setMode('list') }
      else if (e.key === 'Enter') { e.preventDefault(); if (preview) void pasteText(preview, ctrl) }
      return
    }
    if (ctrl && /^[1-5]$/.test(e.key)) { e.preventDefault(); setFilter(FILTERS[Number(e.key) - 1]!.id); setSel(0); return }
    if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); void ocr(); return }
    if (ctrl && e.key.toLowerCase() === 'p') { e.preventDefault(); void togglePin(current); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)) }
    else if ((e.key === 'ArrowRight' || e.key === 'Tab') && currentText && (inputRef.current?.selectionStart ?? 0) >= query.length) {
      e.preventDefault(); setTSel(0); setMode('transform')
    } else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); toggleMark(current) }
    else if (e.key === 'Enter' && e.altKey) { e.preventDefault(); if (kindActions[0] && current?.type === 'clip') void Promise.resolve(kindActions[0].run(current.clip.text, openInMain)).catch((err) => say(String(err instanceof Error ? err.message : err))) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (marked.length) void startSequence()
      else if (current) void choose(current, ctrl)
    }
  }

  const vars = filling ? parseVariables(stripDataUrls(filling.content)) : []
  const colName = (id: string | null): string | undefined => collections.find((c) => c.id === id)?.name

  return (
    <div className="h-screen w-screen p-3" onKeyDown={onKey}>
      <div className="h-full flex flex-col fl-dialog overflow-hidden mac-pop-in">
        {mode === 'vars' && filling ? (
          <>
            <div className="flex items-center gap-2 px-4 h-14 hairline-b">
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setMode('list')} aria-label="Volver"><ArrowLeft size={15} /></button>
              <span className="t-headline text-on-surface truncate">{filling.title}</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {vars.map((v, i) => (
                <label key={v.name} className="flex flex-col gap-1">
                  <span className="t-footnote font-medium text-on-surface-variant">{v.name}</span>
                  <input ref={i === 0 ? firstVarRef : undefined} className="ui-input" value={values[v.name] ?? ''} placeholder={v.defaultValue}
                    onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))} />
                </label>
              ))}
              <pre className="ui-card px-3 py-2 font-mono text-[12px] leading-5 text-on-surface-variant whitespace-pre-wrap break-all max-h-28 overflow-auto">
                {renderTemplate(stripDataUrls(filling.content), values)}
              </pre>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 h-14 hairline-b">
              <Search size={17} className="text-on-surface-variant shrink-0" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSel(0); setMode('list') }}
                placeholder="Buscar en lo copiado, capturas y snippets…"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent outline-hidden text-on-surface"
                style={{ fontSize: 16 }}
              />
              <button type="button" onClick={() => void ocr()} className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" title="Copiar el texto de la imagen que hay en el portapapeles (Ctrl+T)">
                <ScanText size={13} /> Texto de imagen
              </button>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 hairline-b">
              {FILTERS.map((f, i) => (
                <button key={f.id} type="button" onClick={() => { setFilter(f.id); setSel(0); inputRef.current?.focus() }}
                  title={`Ctrl+${i + 1}`}
                  className={`fl-chip h-6! transition-colors ${filter === f.id ? 'is-on' : 'border-transparent!'}`}>
                  {f.label}
                </button>
              ))}
              {marked.length > 0 && <span className="ml-auto t-caption font-medium text-primary">{marked.length} en secuencia</span>}
            </div>
            <div className="flex-1 min-h-0 flex">
              <div className={`${mode === 'transform' ? 'w-1/2 hairline-r' : 'w-full'} overflow-y-auto p-2`} role="listbox">
                {items.length === 0 ? (
                  <p className="t-body text-on-surface-variant text-center py-10">{query ? `Nada para «${query}»` : 'Todavía no copiaste nada.'}</p>
                ) : items.map((it, i) => (
                  <Row key={it.key} item={it} selected={i === sel} marked={marked.includes(it.key)} colName={colName}
                    onHover={() => mode === 'list' && setSel(i)} onClick={() => { setSel(i); void choose(it, false) }} />
                ))}
              </div>
              {mode === 'transform' && currentText && (
                <div className="w-1/2 flex flex-col min-h-0">
                  <div className="overflow-y-auto p-2 max-h-[55%]">
                    {transforms.map((t, i) => (
                      <button key={t.id} type="button" onMouseMove={() => setTSel(i)} onClick={() => void pasteText(t.apply(currentText), false)}
                        className={`w-full flex items-center gap-2 px-3 h-8 rounded-[9px] border text-left t-body text-on-surface ${i === tSel ? 'bg-on-surface/[0.045] dark:bg-white/[0.06] border-hairline' : 'border-transparent'}`}>
                        <Wand2 size={13} className={i === tSel ? 'text-on-surface' : 'text-on-surface-variant'} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <pre className="flex-1 m-2 mt-0 ui-card px-3 py-2 font-mono text-[11.5px] leading-[18px] text-on-surface whitespace-pre-wrap break-all overflow-auto">{preview}</pre>
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex items-center gap-3 px-4 h-9 hairline-t t-caption text-on-surface-variant overflow-hidden whitespace-nowrap">
          {flash ? <span className="text-primary font-medium truncate">{flash}</span> : mode === 'transform' ? (
            <><span className="flex items-center gap-1"><CornerDownLeft size={11} /> Pegar transformado</span><span>← volver</span></>
          ) : mode === 'vars' ? (
            <><span className="flex items-center gap-1"><CornerDownLeft size={11} /> {autoPaste ? 'Pegar' : 'Copiar'}</span><span>Esc vuelve</span></>
          ) : (
            <>
              <span className="flex items-center gap-1"><CornerDownLeft size={11} /> {marked.length ? `Pegar secuencia (${marked.length})` : autoPaste ? 'Pegar' : 'Copiar'}</span>
              {currentText && <span>→ Transformar</span>}
              <span>Shift+Enter secuencia</span>
              {current?.type === 'clip' && <span>Ctrl+P {current.clip.pinned ? 'desfijar' : 'fijar'}</span>}
              {kindActions[0] && <span className="truncate">Alt+Enter {kindActions[0].label}</span>}
              {marked.length > 0 && shortcuts.next && <span className="ml-auto">luego {shortcuts.next}</span>}
              {!marked.length && shortcuts.picker && <span className="ml-auto">{shortcuts.picker}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ item, selected, marked, colName, onHover, onClick }: {
  item: Item
  selected: boolean
  marked: boolean
  colName: (id: string | null) => string | undefined
  onHover: () => void
  onClick: () => void
}): JSX.Element {
  const base = `w-full flex items-center gap-3 px-3 min-h-12 py-1.5 rounded-[10px] border text-left ${selected ? 'bg-on-surface/[0.045] dark:bg-white/[0.06] border-hairline' : 'border-transparent'} ${marked ? 'shadow-[inset_3px_0_0_rgb(var(--c-primary))]' : ''}`
  const iconCls = selected ? 'text-on-surface shrink-0' : 'text-on-surface-variant shrink-0'
  if (item.type === 'capture') {
    const c = item.cap
    return (
      <button type="button" role="option" aria-selected={selected} data-sel={selected} onMouseMove={onHover} onClick={onClick} className={base}>
        <img src={thumbUrl(c.file)} alt="" className="w-14 h-9 rounded object-cover object-top hairline shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block t-body font-medium text-on-surface truncate">{c.title}</span>
          <span className="block t-caption text-on-surface-variant truncate">{[c.ticket, c.app, `${c.width}×${c.height}`].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="t-caption text-on-surface-variant shrink-0 flex items-center gap-1"><Images size={11} /> {ago(c.createdAt)}</span>
      </button>
    )
  }
  if (item.type === 'snippet') {
    const s = item.snip
    return (
      <button type="button" role="option" aria-selected={selected} data-sel={selected} onMouseMove={onHover} onClick={onClick} className={base}>
        <Code2 size={15} className={iconCls} />
        <span className="flex-1 min-w-0">
          <span className="block t-body font-medium text-on-surface truncate">{s.title || 'Sin título'}</span>
          <span className="block t-caption text-on-surface-variant truncate font-mono">{oneLine(stripDataUrls(s.content))}</span>
        </span>
        <span className="t-caption text-on-surface-variant shrink-0">{[langLabel(s.language), colName(s.collectionId)].filter(Boolean).join(' · ')}</span>
      </button>
    )
  }
  const c = item.clip
  return (
    <button type="button" role="option" aria-selected={selected} data-sel={selected} onMouseMove={onHover} onClick={onClick} className={base}>
      {c.sensitive ? <Lock size={15} className={iconCls} /> : c.pinned ? <Pin size={15} weight="fill" className={iconCls} /> : <ClipboardText size={15} className={iconCls} />}
      <span className="flex-1 min-w-0">
        <span className={`block t-body text-on-surface truncate ${c.kind === 'sql' || c.kind === 'json' || c.kind === 'path' ? 'font-mono text-[13px]' : ''}`}>
          {c.sensitive ? c.masked : oneLine(c.text)}
        </span>
        <span className="block t-caption text-on-surface-variant truncate">
          {[c.sensitive ? 'Oculto (parece una clave) · se borra en 1 min' : KIND_LABEL[c.kind], c.app].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="t-caption text-on-surface-variant shrink-0">{ago(c.at)}</span>
    </button>
  )
}
