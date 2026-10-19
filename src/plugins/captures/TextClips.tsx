import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardText, Copy, ListOrdered, Lock, Pin, PinOff, ScanText, Search, Trash2, Wand2, X,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { useUndo } from '../../core/hooks/useUndo'
import { useSoftDelete } from '../../core/soft-delete'
import { EmptyState } from '../../core/components/EmptyState'
import { CLIP_CATEGORIES, clipCategory, guessLanguage, transformsFor, type ClipCategory, type ClipView } from '../../core/clip-utils'
import { actionsFor, KIND_LABEL } from '../../core/clip-actions'
import { clipAge, clipboardApi } from '../utilities/clipboard'
import { CodeViewer } from '../snippets/SnippetViewer'
import type { SnippetLanguage } from '../snippets/types'
import { splitHighlights, type ClipSearchItem } from './clip-search'

/**
 * Portapapeles → Texto: lo que copiaste, separado por tipo (código, links y rutas,
 * tickets, texto). Lo último copiado y lo fijado sobreviven al cerrar la app
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
  const confirm = useConfirm()
  const { undoable } = useUndo()
  const rootRef = useRef<HTMLDivElement>(null)
  const softDelete = useSoftDelete((_id, e) => toast.show(cleanErr(e), 'error'))
  const hiddenIds = softDelete.hidden
  const [allItems, setItems] = useState<ClipView[]>([])
  const items = useMemo(() => allItems.filter((e) => !hiddenIds.has(e.id)), [allItems, hiddenIds])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  /** Buscando: orden y resaltado de main (clipboard:search); null → filtro local. */
  const [ranked, setRanked] = useState<Map<string, ClipSearchItem> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [marked, setMarked] = useState<string[]>([])
  const [queue, setQueue] = useState<{ total: number; pos: number; next: string | null } | null>(null)
  const [keys, setKeys] = useState<{ next: string | null; ocr: string | null }>({ next: null, ocr: null })

  const reload = (): void => {
    clipboardApi.list().then(setItems, () => setItems([]))
    clipboardApi.queueState().then(setQueue, () => setQueue(null))
  }
  // Se actualiza sólo mientras está a la vista: pestaña del módulo activa y ventana visible.
  useEffect(() => {
    reload()
    clipboardApi.shortcuts().then(setKeys, () => undefined)
    let wasVisible = true
    const t = setInterval(() => {
      const visible = document.visibilityState === 'visible' && !!rootRef.current && rootRef.current.offsetParent !== null
      if (visible) reload()
      wasVisible = visible
    }, 1500)
    const onVis = (): void => { if (document.visibilityState === 'visible' && !wasVisible && rootRef.current?.offsetParent) reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
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

  useEffect(() => {
    const query = q.trim()
    if (!query) { setRanked(null); return }
    let alive = true
    const t = setTimeout(() => {
      clipboardApi.search(query, { kinds: ['text'], limit: 200 })
        .then((r) => { if (alive) setRanked(new Map(r.items.map((h) => [h.id, h]))) }, () => { if (alive) setRanked(null) })
    }, 160)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  const shown = useMemo(() => {
    if (q.trim() && ranked) {
      const byId = new Map(items.map((e) => [e.id, e]))
      return [...ranked.keys()].map((id) => byId.get(id)).filter((e): e is ClipView => !!e)
        .filter((e) => filter === 'all' || (filter === 'pinned' ? e.pinned : catOf(e) === filter))
    }
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const list = items.filter((e) =>
      (filter === 'all' || (filter === 'pinned' ? e.pinned : catOf(e) === filter)) &&
      (!words.length || (!e.sensitive && words.every((w) => `${e.text} ${e.app ?? ''}`.toLowerCase().includes(w)))))
    return [...list.filter((e) => e.pinned), ...list.filter((e) => !e.pinned)]
  }, [items, q, filter, ranked])

  const selected = items.find((e) => e.id === selectedId) ?? null

  /** Quitar uno: al instante, con "Deshacer"; se borra de verdad cuando vence. */
  const removeOne = (e: ClipView): void => {
    if (selectedId === e.id) setSelectedId(null)
    void undoable({
      message: 'Quitado del historial',
      undoneMessage: 'Restaurado',
      apply: () => softDelete.hide(e.id, async () => { await clipboardApi.remove(e.id); reload() }),
      undo: () => { if (!softDelete.restore(e.id)) throw new Error('ya se había quitado') },
    })
  }

  /** Vaciar es masivo e irreversible: confirmar. */
  const clearAll = async (): Promise<void> => {
    const n = items.filter((e) => !e.pinned).length
    const ok = await confirm({
      title: '¿Vaciar el historial?',
      message: `Se borran ${n === 1 ? '1 copiado' : `${n} copiados`} (lo fijado se queda). No se puede deshacer.`,
      confirmLabel: 'Vaciar',
      destructive: true,
    })
    if (!ok) return
    await clipboardApi.clear().then(() => { setSelectedId(null); reload() }, err)
  }

  const copy = (e: ClipView): void => {
    void clipboardApi.copy(e.id).then(() => { toast.show('Copiado', 'success'); reload() }, err)
  }

  return (
    <div ref={rootRef} className="flex h-full w-full overflow-hidden bg-background">
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 pt-4 pb-3 flex flex-col gap-3 hairline-b mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            {header}
            <span className="t-footnote text-on-surface-variant tabular-nums">{items.length}</span>
            <span className="flex-1" />
            <button type="button" className="ui-btn ui-btn-outline ui-btn-sm" title={keys.ocr ? `También con ${keys.ocr} desde cualquier app` : undefined}
              onClick={() => { void clipboardApi.ocrImage().then((r) => { toast.show(r.ok ? 'Texto de la imagen copiado' : r.reason ?? 'No se pudo leer', r.ok ? 'success' : 'error'); reload() }) }}>
              <ScanText size={13} /> Texto de imagen
            </button>
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={items.every((e) => e.pinned)}
              onClick={() => void clearAll()} title="Borra todo menos lo fijado">
              <Trash2 size={13} /> Vaciar
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-72 max-w-full">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en lo copiado" className="ui-input w-full h-8 pl-8 rounded-full" />
            </div>
            {([{ id: 'all', label: 'Todo' }, ...CLIP_CATEGORIES, { id: 'pinned', label: 'Fijados' }] as { id: Filter; label: string }[]).map((c) => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}
                className={`fl-chip h-[26px]! px-2.5! text-[12px]! transition-colors ${filter === c.id ? 'is-on' : ''}`}>
                {c.label} <span className="opacity-60 tabular-nums">{counts[c.id] ?? 0}</span>
              </button>
            ))}
          </div>
          {marked.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl hairline bg-surface px-3 py-2 t-footnote text-on-surface">
              <ListOrdered size={14} className="text-on-surface-variant" />
              <span className="flex-1">{marked.length} para pegar en secuencia, en el orden en que los marcaste</span>
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm"
                onClick={() => { void clipboardApi.queueSet(marked.map((id) => ({ id }))).then(() => { setMarked([]); reload(); toast.show(`Secuencia lista: pegá cada uno con ${keys.next ?? 'el atajo'}`, 'success') }) }}>
                Armar secuencia
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setMarked([])} aria-label="Cancelar"><X size={13} /></button>
            </div>
          )}
          {queue && queue.total > 0 && queue.pos < queue.total && (
            <div className="flex items-center gap-2 rounded-xl hairline px-3 py-2 t-footnote text-on-surface-variant">
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
                  description={'Lo que copies con Ctrl+C aparece acá, separado en código, links, tickets y texto.\nLo último y lo fijado se guardan (cifrados) aunque cierres Setto.'} />
              </div>
            ) : <p className="t-body text-on-surface-variant text-center py-16">Nada coincide.</p>
          ) : (
            <div className="ui-card overflow-hidden">
              {shown.map((e) => {
                const order = marked.indexOf(e.id)
                const cat = catOf(e)
                return (
                  <div key={e.id} className={`group flex items-start gap-3 px-4 py-2.5 hairline-b last:border-b-0 cursor-default ${selectedId === e.id ? 'bg-on-surface/[0.045] dark:bg-white/[0.05]' : 'hover:bg-on-surface/3'}`}
                    onClick={() => setSelectedId(e.id)} onDoubleClick={() => copy(e)}>
                    <button type="button" title="Marcar para pegar en secuencia"
                      onClick={(ev) => { ev.stopPropagation(); setMarked((s) => (s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id])) }}
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded-md text-[11px] font-semibold flex items-center justify-center ${order >= 0 ? 'bg-primary text-on-primary' : 'hairline text-transparent group-hover:text-on-surface-variant'}`}>
                      {order >= 0 ? order + 1 : '+'}
                    </button>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[12.5px] leading-5 text-on-surface whitespace-pre-wrap break-all line-clamp-3 ${e.sensitive ? 'tracking-wider' : cat === 'code' || cat === 'links' ? 'font-mono' : ''}`}>
                        {e.sensitive ? e.masked : ranked?.get(e.id)
                          ? splitHighlights(ranked.get(e.id)!.snippet, ranked.get(e.id)!.ranges).map((p, i) => (p.hit
                            ? <mark key={i} className="bg-primary/15 text-on-surface rounded-[3px] px-px">{p.text}</mark>
                            : <span key={i}>{p.text}</span>))
                          : e.text}
                      </span>
                      <span className="flex items-center gap-1.5 t-caption text-on-surface-variant mt-0.5">
                        {e.pinned && <Pin size={10} weight="fill" className="text-on-surface-variant" />}
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
            Lo último copiado y lo fijado se guardan (cifrados); nunca lo que copia Claves ni lo que parece una clave.
          </p>
        </div>
      </section>

      {selected && (
        <aside className="w-[440px] shrink-0 bg-surface hairline-l flex flex-col overflow-hidden">
          <div className="fl-toolbar gap-1! shrink-0">
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
              onClick={() => removeOne(selected)}>
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
                      <button key={t.id} type="button" className="ui-btn ui-btn-outline ui-btn-sm"
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
