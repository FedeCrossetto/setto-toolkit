import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardText, Copy, ListOrdered, Lock, Pin, PinOff, ScanText, Search, Trash2, Wand2, X,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { EmptyState } from '../../core/components/EmptyState'
import { CLIP_CATEGORIES, clipCategory, guessLanguage, transformsFor, type ClipCategory, type ClipView } from '../../core/clip-utils'
import { actionsFor, KIND_LABEL } from '../../core/clip-actions'
import { clipAge, clipboardApi } from '../utilities/clipboard'
import { CodeViewer } from '../snippets/SnippetViewer'
import type { SnippetLanguage } from '../snippets/types'

/**
 * Portapapeles → Texto: lo que copiaste, separado por tipo (código, links y rutas,
 * tickets, texto). Los últimos 20 y los fijados sobreviven al cerrar la app
 * (cifrados); lo que parece una clave se oculta y se borra al minuto.
 */
type Filter = 'all' | ClipCategory | 'pinned'

const LANG: Record<string, SnippetLanguage> = {
  sql: 'sql', json: 'json', csharp: 'csharp', javascript: 'javascript', powershell: 'powershell', xml: 'xml', plaintext: 'plaintext',
}

const cleanErr = (e: unknown): string =>
  e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)

export function TextClips({ header }: { header: React.ReactNode }): JSX.Element {
  const toast = useToast()
  const { state, dispatch } = useApp()
  const [items, setItems] = useState<ClipView[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [marked, setMarked] = useState<string[]>([])
  const [queue, setQueue] = useState<{ total: number; pos: number; next: string | null } | null>(null)
  const [keys, setKeys] = useState<{ next: string | null; ocr: string | null }>({ next: null, ocr: null })

  const reload = (): void => {
    clipboardApi.list().then(setItems, () => setItems([]))
    clipboardApi.queueState().then(setQueue, () => setQueue(null))
  }
  // Se actualiza solo mientras está a la vista.
  useEffect(() => {
    reload()
    clipboardApi.shortcuts().then(setKeys, () => undefined)
    const t = setInterval(reload, 1500)
    return () => clearInterval(t)
  }, [])

  const err = (e: unknown): void => toast.show(cleanErr(e), 'error')
  const openIn = (a: { pluginId: string; action?: string; payload?: unknown }): void =>
    dispatch(a.action ? { type: 'OPEN_WITH_INTENT', pluginId: a.pluginId, action: a.action, payload: a.payload } : { type: 'OPEN_TAB', pluginId: a.pluginId })

  const catOf = (e: ClipView): ClipCategory => (e.sensitive ? 'text' : clipCategory(e.kind, e.text))
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, pinned: items.filter((e) => e.pinned).length }
    for (const e of items) c[catOf(e)] = (c[catOf(e)] ?? 0) + 1
    return c
  }, [items])

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = items.filter((e) =>
      (filter === 'all' || (filter === 'pinned' ? e.pinned : catOf(e) === filter)) &&
      (!words.length || (!e.sensitive && words.every((w) => `${e.text} ${e.app ?? ''}`.toLowerCase().includes(w)))))
    return [...list.filter((e) => e.pinned), ...list.filter((e) => !e.pinned)]
  }, [items, q, filter])

  const selected = items.find((e) => e.id === selectedId) ?? null

  const copy = (e: ClipView): void => {
    void clipboardApi.copy(e.id).then(() => { toast.show('Copiado', 'success'); reload() }, err)
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 pt-5 pb-3 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {header}
            <span className="t-footnote text-on-surface-variant tabular-nums">{items.length}</span>
            <span className="flex-1" />
            <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" title={keys.ocr ? `También con ${keys.ocr} desde cualquier app` : undefined}
              onClick={() => { void clipboardApi.ocrImage().then((r) => { toast.show(r.ok ? 'Texto de la imagen copiado' : r.reason ?? 'No se pudo leer', r.ok ? 'success' : 'error'); reload() }) }}>
              <ScanText size={13} /> Texto de imagen
            </button>
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={items.every((e) => e.pinned)}
              onClick={() => { void clipboardApi.clear().then(() => { setSelectedId(null); reload() }) }} title="Borra todo menos lo fijado">
              <Trash2 size={13} /> Vaciar
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-72 max-w-full">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en lo copiado" className="ui-input w-full h-8 pl-8" />
            </div>
            {([{ id: 'all', label: 'Todo' }, ...CLIP_CATEGORIES, { id: 'pinned', label: 'Fijados' }] as { id: Filter; label: string }[]).map((c) => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}
                className={`inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full text-[12px] font-medium transition-colors ${
                  filter === c.id ? 'bg-primary text-on-primary' : 'bg-on-surface/6 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface'
                }`}>
                {c.label} <span className="opacity-60 tabular-nums">{counts[c.id] ?? 0}</span>
              </button>
            ))}
          </div>
          {marked.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-selected px-3 py-2 t-footnote text-on-surface">
              <ListOrdered size={14} className="text-primary" />
              <span className="flex-1">{marked.length} para pegar en secuencia, en el orden en que los marcaste</span>
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm"
                onClick={() => { void clipboardApi.queueSet(marked.map((id) => ({ id }))).then(() => { setMarked([]); reload(); toast.show(`Secuencia lista: pegá cada uno con ${keys.next ?? 'el atajo'}`, 'success') }) }}>
                Armar secuencia
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setMarked([])} aria-label="Cancelar"><X size={13} /></button>
            </div>
          )}
          {queue && queue.total > 0 && queue.pos < queue.total && (
            <div className="flex items-center gap-2 rounded-lg hairline px-3 py-2 t-footnote text-on-surface-variant">
              <ListOrdered size={14} />
              <span className="flex-1 truncate">Secuencia {queue.pos}/{queue.total}{queue.next ? ` · siguiente: «${queue.next}»` : ''}{keys.next ? ` · ${keys.next} pega el siguiente` : ''}</span>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { void clipboardApi.queueClear().then(reload) }}>Cancelar</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {shown.length === 0 ? (
            items.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState icon={ClipboardText} title="Todavía no copiaste texto"
                  description={'Lo que copies con Ctrl+C aparece acá, separado en código, links, tickets y texto.\nLos últimos 20 y los fijados se guardan (cifrados) aunque cierres Setto.'} />
              </div>
            ) : <p className="t-body text-on-surface-variant text-center py-16">Nada coincide.</p>
          ) : (
            <div className="ui-card overflow-hidden">
              {shown.map((e) => {
                const order = marked.indexOf(e.id)
                const cat = catOf(e)
                return (
                  <div key={e.id} className={`group flex items-start gap-3 px-4 py-2.5 hairline-b last:border-b-0 cursor-default ${selectedId === e.id ? 'bg-selected' : 'hover:bg-on-surface/3'}`}
                    onClick={() => setSelectedId(e.id)} onDoubleClick={() => copy(e)}>
                    <button type="button" title="Marcar para pegar en secuencia"
                      onClick={(ev) => { ev.stopPropagation(); setMarked((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id])) }}
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded-md text-[11px] font-semibold flex items-center justify-center ${order >= 0 ? 'bg-primary text-on-primary' : 'hairline text-transparent group-hover:text-on-surface-variant'}`}>
                      {order >= 0 ? order + 1 : '+'}
                    </button>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[12.5px] leading-5 text-on-surface whitespace-pre-wrap break-all line-clamp-3 ${e.sensitive ? 'tracking-wider' : cat === 'code' || cat === 'links' ? 'font-mono' : ''}`}>
                        {e.sensitive ? e.masked : e.text}
                      </span>
                      <span className="flex items-center gap-1.5 t-caption text-on-surface-variant mt-0.5">
                        {e.pinned && <Pin size={10} weight="fill" className="text-primary" />}
                        {e.sensitive && <Lock size={10} />}
                        <span>{[e.sensitive ? 'Parece una clave: oculta y se borra en 1 min' : KIND_LABEL[e.kind], e.app, clipAge(e.at)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon opacity-0 group-hover:opacity-100" title="Copiar"
                      onClick={(ev) => { ev.stopPropagation(); copy(e) }}>
                      <Copy size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <p className="t-caption text-on-surface-variant mt-3">
            Doble clic copia · el número arma una secuencia ({keys.next ?? 'atajo'} pega el siguiente) · Ctrl+Alt+V abre el selector desde cualquier app.
            Se guardan los últimos 20 y los fijados (cifrados); nunca lo que copia Credenciales ni lo que parece una clave.
          </p>
        </div>
      </section>

      {selected && (
        <aside className="w-[440px] shrink-0 bg-surface hairline-l flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 px-3 h-12 hairline-b shrink-0">
            <span className="t-footnote text-on-surface-variant flex-1 truncate pl-1">
              {[selected.sensitive ? 'Oculto' : KIND_LABEL[selected.kind], selected.app, clipAge(selected.at), selected.sensitive ? null : `${selected.text.length} caracteres`].filter(Boolean).join(' · ')}
            </span>
            {!selected.sensitive && (
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" title={selected.pinned ? 'Desfijar' : 'Fijar (se guarda cifrado)'}
                onClick={() => { void clipboardApi.pin(selected.id, !selected.pinned).then(reload, err) }}>
                {selected.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon hover:text-error" title="Quitar del historial"
              onClick={() => { void clipboardApi.remove(selected.id).then(() => { setSelectedId(null); reload() }) }}>
              <Trash2 size={14} />
            </button>
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setSelectedId(null)} aria-label="Cerrar"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {selected.sensitive ? (
              <div className="ui-card px-4 py-6 text-center">
                <Lock size={18} className="mx-auto text-on-surface-variant" />
                <p className="t-body text-on-surface mt-2 tracking-wider">{selected.masked}</p>
                <p className="t-caption text-on-surface-variant mt-1">Parece una contraseña o token: no se muestra y se borra al minuto.</p>
              </div>
            ) : catOf(selected) === 'code' ? (
              <div className="rounded-lg hairline overflow-hidden h-[42vh]">
                <CodeViewer content={selected.text} language={LANG[guessLanguage(selected.text, selected.kind)] ?? 'plaintext'} dark={state.theme === 'dark'} />
              </div>
            ) : (
              <pre className="ui-card px-3 py-2.5 text-[12.5px] leading-5 text-on-surface whitespace-pre-wrap wrap-break-word max-h-[42vh] overflow-auto select-text font-sans">{selected.text}</pre>
            )}
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => copy(selected)}><Copy size={13} /> Copiar</button>
            {!selected.sensitive && (
              <>
                {actionsFor(selected.kind, selected.text).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="t-footnote font-medium text-on-surface-variant">Acciones</span>
                    <div className="flex flex-wrap gap-1.5">
                      {actionsFor(selected.kind, selected.text).map((a) => {
                        const Icon = a.icon
                        return (
                          <button key={a.id} type="button" className="ui-btn ui-btn-outline ui-btn-sm"
                            onClick={() => { void Promise.resolve(a.run(selected.text, openIn)).catch(err) }}>
                            <Icon size={12} /> {a.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className="t-footnote font-medium text-on-surface-variant flex items-center gap-1"><Wand2 size={12} /> Copiar transformado</span>
                  <div className="flex flex-wrap gap-1.5">
                    {transformsFor(selected.kind).map((t) => (
                      <button key={t.id} type="button" className="h-7 px-2.5 rounded-md bg-on-surface/6 hover:bg-on-surface/10 t-footnote text-on-surface"
                        onClick={() => { void navigator.clipboard.writeText(t.apply(selected.text)).then(() => toast.show(`Copiado: ${t.label}`, 'success')) }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
