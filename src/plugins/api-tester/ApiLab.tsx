import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookmarkPlus, Check, ChevronDown, ChevronRight, CircleAlert, CircleStop,
  Copy, Download, Eye, EyeOff, FileUp, FolderOpen, Lock, LockOpen, LoaderCircle, Network, Paperclip, Pencil, Plus,
  RotateCcw, Save, Search, SendHorizontal, Sparkles, Terminal, Trash2, Upload, X,
} from 'lucide-react'
import { useCollections } from './hooks/useCollections'
import { useRequestRunner } from './hooks/useRequestRunner'
import {
  tryFormatJson, highlightJson, formatXml, formatSize, newKV, randomUUID,
  parseCurl, exportToCurl, parseFormPairs, serializeFormPairs,
  importCollectionFromJSON, extractTemplateVars, interpolateVars,
} from './utils'
import type { ActiveRequest, Collection, Environment, HttpMethod, BodyType, KeyValuePair, FormDataField, HistoryEntry } from './types'
import { Modal, useConfirm } from '../../core/components/Modal'
import { SegmentedControl } from '../../core/components/SegmentedControl'

/** Segmented-control look for inline tab rows (matches core SegmentedControl). */
const SEG_GROUP = 'inline-flex items-center gap-1'
const segBtn = (active: boolean): string =>
  `flex items-center gap-1.5 px-3 h-7 rounded-full border t-footnote font-medium transition-colors ${
    active ? 'nav-active text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-on-surface/4'}`

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: 'text-success', POST: 'text-primary', PUT: 'text-warning',
  PATCH: 'text-warning', DELETE: 'text-error',
  HEAD: 'text-on-surface-variant', OPTIONS: 'text-on-surface-variant',
}

/** Badge with colored background — styled like HTTPie method pills */
const METHOD_BG: Record<HttpMethod, string> = {
  GET:     'bg-success/15 text-success',
  POST:    'bg-primary/15 text-primary',
  PUT:     'bg-warning/15 text-warning',
  PATCH:   'bg-warning/15 text-warning',
  DELETE:  'bg-error/15 text-error',
  HEAD:    'bg-on-surface/6 text-on-surface-variant',
  OPTIONS: 'bg-on-surface/6 text-on-surface-variant',
}

/** Thin wrapper over the shared core Modal (kept so call sites stay the same). */
function ModalShell({ onClose, width = 'w-80', children }: { onClose: () => void; width?: string; children: React.ReactNode }): JSX.Element {
  const px = width === 'w-[600px]' ? 600 : 360
  return (
    <Modal open onClose={onClose} width={px}>
      <div className="pt-5 flex flex-col gap-4">{children}</div>
    </Modal>
  )
}

function MethodSelect({ value, onChange }: { value: HttpMethod; onChange: (m: HttpMethod) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Método HTTP"
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-[5px] t-footnote font-semibold font-mono focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors ${METHOD_BG[value]}`}
      >
        {value}
        <ChevronDown size={12} className="opacity-50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="ui-menu absolute top-full left-0 mt-1.5 z-50 min-w-[130px] flex flex-col"
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          >
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onChange(m); setOpen(false) }}
                className="ui-menu-item w-full text-left font-mono t-footnote font-semibold"
              >
                <span className="w-3 shrink-0">{m === value ? <Check size={12} /> : null}</span>
                {m}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── History components ─────────────────────────────────────────────────────

function HistoryItem({
  entry,
  collections,
  onRestore,
  onSave,
}: {
  entry: HistoryEntry
  collections: Collection[]
  onRestore: () => void
  onSave: (collectionId: string) => void
}): JSX.Element {
  const [showSave, setShowSave] = useState(false)
  const d = new Date(entry.executedAt)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div className="group mx-1.5 px-2 py-1.5 rounded-[9px] hover:bg-on-surface/4 transition-colors">
      <button onClick={onRestore} className="w-full flex items-start gap-2 text-left">
        <span className={`t-caption font-bold px-1.5 py-0.5 rounded-md shrink-0 ${METHOD_BG[entry.request.method]}`}>
          {entry.request.method}
        </span>
        <div className="flex-1 min-w-0">
          <p className="t-footnote text-on-surface truncate leading-tight">{entry.request.url}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`t-caption font-semibold ${entry.response.status < 400 ? 'text-success' : 'text-error'}`}>
              {entry.response.status}
            </span>
            <span className="t-caption text-on-surface-variant">{entry.response.duration}ms</span>
            <span className="t-caption text-on-surface-variant">{date} {time}</span>
          </div>
        </div>
      </button>
      {collections.length > 0 && (
        <div className="mt-0.5 hidden group-hover:flex justify-end">
          {!showSave ? (
            <button onClick={() => setShowSave(true)}
              className="t-caption text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-0.5">
              <BookmarkPlus size={11} /> Guardar
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <select defaultValue="" onChange={(e) => { if (e.target.value) { onSave(e.target.value); setShowSave(false) } }}
                aria-label="Colección" className="ui-input py-0! px-1! t-caption">
                <option value="" disabled>Colección…</option>
                {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => setShowSave(false)} aria-label="Cancelar" className="text-on-surface-variant hover:text-on-surface">
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryPanel({
  history,
  collections,
  onRestore,
  onClear,
  onSave,
}: {
  history: HistoryEntry[]
  collections: Collection[]
  onRestore: (entry: HistoryEntry) => void
  onClear: () => void
  onSave: (entry: HistoryEntry, collectionId: string) => void
}): JSX.Element {
  const [methodFilter, setMethodFilter] = useState<string>('ALL')
  const [urlSearch, setUrlSearch] = useState('')
  const methods = ['ALL', ...Array.from(new Set(history.map((h) => h.request.method)))]
  const filtered = history
    .filter((h) => methodFilter === 'ALL' || h.request.method === methodFilter)
    .filter((h) => !urlSearch.trim() || h.request.url.toLowerCase().includes(urlSearch.toLowerCase()))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 hairline-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="fl-section px-0!">
            {history.length} request{history.length !== 1 ? 's' : ''}
          </span>
          {history.length > 0 && (
            <button onClick={onClear} className="t-caption text-on-surface-variant hover:text-on-surface transition-colors">
              Limpiar todo
            </button>
          )}
        </div>
        {history.length > 0 && (
          <>
            <div className="fl-search h-7! gap-1.5! px-2! mb-2">
              <Search size={12} className="text-on-surface-variant" />
              <input
                value={urlSearch} onChange={(e) => setUrlSearch(e.target.value)}
                placeholder="Filtrar por URL…"
                aria-label="Filtrar por URL"
                className="flex-1 bg-transparent t-footnote text-on-surface placeholder:text-on-surface-variant/50 outline-hidden"
              />
              {urlSearch && (
                <button onClick={() => setUrlSearch('')} aria-label="Limpiar filtro" className="text-on-surface-variant hover:text-on-surface">
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {methods.map((m) => (
                <button key={m} onClick={() => setMethodFilter(m)}
                  className={`fl-chip h-[22px]! px-2! font-mono transition-colors ${methodFilter === m ? 'is-on' : ''}`}>
                  {m === 'ALL' ? 'Todos' : m}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {history.length === 0 ? (
          <p className="t-footnote text-on-surface-variant text-center py-8 px-4">
            Sin requests aún.<br />Ejecutá uno para ver el historial.
          </p>
        ) : filtered.length === 0 ? (
          <p className="t-footnote text-on-surface-variant text-center py-8">Sin requests {methodFilter}.</p>
        ) : (
          filtered.map((h) => (
            <HistoryItem key={h.id} entry={h} collections={collections}
              onRestore={() => onRestore(h)}
              onSave={(colId) => onSave(h, colId)} />
          ))
        )}
      </div>
    </div>
  )
}

function emptyRequest(collectionId = ''): ActiveRequest {
  return {
    requestId: null, collectionId,
    method: 'GET', url: '',
    headers: [newKV()], params: [newKV()],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
  }
}

type RequestTab = 'headers' | 'params' | 'body' | 'auth' | 'scripts'
type ResponseTab = 'body' | 'headers' | 'raw' | 'sent'

interface SentSnapshot {
  method: string
  url: string
  headers: { key: string; value: string }[]
  bodyType: string
  body: string
  auth: ActiveRequest['auth']
}

export function ApiLab(): JSX.Element {
  const { collections, loading, createCollection, deleteCollection, saveRequest, deleteRequest, duplicateRequest, reload: reloadCollections } = useCollections()
  const [environments, setEnvironments] = useState<Environment[]>([])
  const { status, response, error, history, execute, cancel, loadHistory, clearHistory } = useRequestRunner(environments)

  const [active, setActive] = useState<ActiveRequest>(emptyRequest)
  const [reqTab, setReqTab] = useState<RequestTab>('headers')
  const [resTab, setResTab] = useState<ResponseTab>('body')
  const [newColName, setNewColName] = useState('')
  const [showNewCol, setShowNewCol] = useState(false)
  const [showImportCurl, setShowImportCurl] = useState(false)
  const confirmDialog = useConfirm()
  const [sentSnapshot, setSentSnapshot] = useState<SentSnapshot | null>(null)
  const [curlCopied, setCurlCopied] = useState(false)
  const [beautified, setBeautified] = useState(false)
  const [leftTab, setLeftTab] = useState<'collections' | 'environments' | 'history'>('collections')
  const [showImportCollection, setShowImportCollection] = useState(false)
  const [responseHeight, setResponseHeight] = useState(260)
  const resizeStartRef = useRef<{ y: number; h: number } | null>(null)

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => {
    window.api.invoke<Environment[]>('api-tester:environments-get').then(setEnvironments)
  }, [])

  const handleImportCollection = async (jsonStr: string): Promise<string | null> => {
    const col = importCollectionFromJSON(jsonStr)
    if (!col) return 'Formato inválido. Pegá el JSON de una colección nativa o un export de Postman Collection v2/v2.1.'
    const all = await window.api.invoke<Collection[]>('api-tester:collections-get') ?? []
    await window.api.invoke('api-tester:collections-save', [...all, col])
    await reloadCollections()
    return null
  }

  const saveEnvironments = async (envs: Environment[]): Promise<void> => {
    await window.api.invoke('api-tester:environments-save', envs)
    setEnvironments(envs)
  }

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizeStartRef.current = { y: e.clientY, h: responseHeight }
    const onMove = (ev: MouseEvent): void => {
      if (!resizeStartRef.current) return
      const delta = resizeStartRef.current.y - ev.clientY
      setResponseHeight(Math.max(120, Math.min(600, resizeStartRef.current.h + delta)))
    }
    const onUp = (): void => {
      resizeStartRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [responseHeight])

  const loadRequest = (col: Collection, reqId: string): void => {
    const req = col.requests.find((r) => r.id === reqId)
    if (!req) return
    setActive({ requestId: req.id, collectionId: req.collectionId, method: req.method, url: req.url, headers: req.headers, params: req.params, body: req.body, auth: req.auth })
    setBeautified(false)
  }

  const loadFromHistory = (entry: HistoryEntry): void => {
    setActive({ requestId: null, collectionId: '', method: entry.request.method, url: entry.request.url, headers: entry.request.headers, params: entry.request.params, body: entry.request.body, auth: entry.request.auth })
    setBeautified(false)
  }

  const handleSaveFromHistory = async (entry: HistoryEntry, collectionId: string): Promise<void> => {
    await saveRequest({
      id: randomUUID(), collectionId,
      name: `${entry.request.method} ${entry.request.url}`.slice(0, 60),
      method: entry.request.method, url: entry.request.url,
      headers: entry.request.headers, params: entry.request.params,
      body: entry.request.body, auth: entry.request.auth,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
  }

  const handleRename = async (colId: string, reqId: string, newName: string): Promise<void> => {
    const col = collections.find((c) => c.id === colId)
    const req = col?.requests.find((r) => r.id === reqId)
    if (!req) return
    await saveRequest({ ...req, name: newName })
  }

  const handleSave = async (): Promise<void> => {
    if (!active.collectionId) return
    // Confirm before overwriting an existing saved request
    if (active.requestId !== null) {
      const confirmed = await confirmDialog({
        title: '¿Sobrescribir request?',
        message: `Esto reemplaza el request guardado${active.url ? ` en ${active.url}` : ''} con los cambios actuales.`,
        confirmLabel: 'Guardar',
      })
      if (!confirmed) return
    }
    await saveRequest({
      id: active.requestId ?? randomUUID(),
      collectionId: active.collectionId,
      name: active.url || 'Request sin título',
      method: active.method, url: active.url,
      headers: active.headers, params: active.params,
      body: active.body, auth: active.auth,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
  }

  const handleExecute = (): void => {
    // Build resolved URL with params
    const enabledParams = active.params.filter((p) => p.enabled && p.key)
    let resolvedUrl = interpolateVars(active.url, activeEnvVars)
    if (enabledParams.length) {
      const qs = enabledParams.map((p) => `${encodeURIComponent(interpolateVars(p.key, activeEnvVars))}=${encodeURIComponent(interpolateVars(p.value, activeEnvVars))}`).join('&')
      resolvedUrl += (resolvedUrl.includes('?') ? '&' : '?') + qs
    }
    // Resolved headers
    const resolvedHeaders = active.headers
      .filter((h) => h.enabled && h.key)
      .map((h) => ({ key: interpolateVars(h.key, activeEnvVars), value: interpolateVars(h.value, activeEnvVars) }))
    if (active.auth.type === 'bearer' && active.auth.token)
      resolvedHeaders.push({ key: 'Authorization', value: `Bearer ${interpolateVars(active.auth.token, activeEnvVars)}` })
    // Auto content-type if not set
    const hasContentType = resolvedHeaders.some((h) => h.key.toLowerCase() === 'content-type')
    if (!hasContentType && active.body.type !== 'none') {
      const ct = active.body.type === 'json' ? 'application/json' : active.body.type === 'xml' ? 'application/xml' : active.body.type === 'form' ? 'application/x-www-form-urlencoded' : null
      if (ct) resolvedHeaders.push({ key: 'Content-Type', value: ct })
    }

    setSentSnapshot({
      method: active.method,
      url: resolvedUrl,
      headers: resolvedHeaders,
      bodyType: active.body.type,
      body: active.body.type !== 'none' && active.body.type !== 'form-data'
        ? interpolateVars(active.body.content, activeEnvVars)
        : active.body.content,
      auth: active.auth,
    })

    execute({
      id: active.requestId ?? '', collectionId: active.collectionId ?? '',
      name: '', method: active.method, url: active.url,
      headers: active.headers, params: active.params,
      body: active.body, auth: active.auth,
      preRequestScript: active.preRequestScript,
      postResponseScript: active.postResponseScript,
      createdAt: '', updatedAt: '',
    })
  }

  const handleCopyCurl = (): void => {
    navigator.clipboard.writeText(exportToCurl(active))
    setCurlCopied(true)
    setTimeout(() => setCurlCopied(false), 2000)
  }

  const handleBeautify = (): void => {
    const t = active.body.type
    let formatted = active.body.content
    if (t === 'json') formatted = tryFormatJson(active.body.content)
    else if (t === 'xml') formatted = formatXml(active.body.content)
    setActive((a) => ({ ...a, body: { ...a.body, content: formatted } }))
    setBeautified(true)
    setTimeout(() => setBeautified(false), 1500)
  }

  const formattedBody = response ? tryFormatJson(response.body) : ''
  const activeEnv = environments.find((e) => e.isActive)
  const activeEnvName = activeEnv?.name
  const activeEnvVars = activeEnv?.variables ?? {}

  // For form body type, work with KV pairs derived from content
  const formPairs: KeyValuePair[] = active.body.type === 'form' ? parseFormPairs(active.body.content) : []
  const setFormPairs = (pairs: KeyValuePair[]): void =>
    setActive((a) => ({ ...a, body: { ...a.body, content: serializeFormPairs(pairs) } }))

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: collections / environments ───────────────────────── */}
      <aside className="w-72 shrink-0 hairline-r flex flex-col fl-pane overflow-hidden">

        {/* Tab toggle */}
        <div className="flex items-center justify-center h-[42px] hairline-b shrink-0 px-2">
          <SegmentedControl
            options={[
              { value: 'collections', label: 'Guardado' },
              { value: 'environments', label: 'Entornos' },
              { value: 'history', label: 'Historial', count: history.length > 0 ? history.length : undefined },
            ]}
            value={leftTab}
            onChange={(t) => setLeftTab(t)}
          />
        </div>

        {leftTab === 'collections' ? (
          <>
            <div className="px-3 pt-3 pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="fl-section px-0!">Colecciones</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setShowImportCollection(true)} className="ui-btn ui-btn-ghost ui-btn-icon" title="Importar colección" aria-label="Importar colección">
                    <Upload size={14} />
                  </button>
                  <button onClick={() => setShowNewCol(true)} className="ui-btn ui-btn-ghost ui-btn-icon" title="Nueva colección" aria-label="Nueva colección">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              {showNewCol && (
                <form onSubmit={async (e) => { e.preventDefault(); if (newColName.trim()) { await createCollection(newColName.trim()); setNewColName(''); setShowNewCol(false) } }} className="flex gap-1 mt-2">
                  <input autoFocus value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Nombre de la colección"
                    className="ui-input flex-1 py-1! t-footnote" />
                  <button type="submit" aria-label="Crear colección" className="ui-btn ui-btn-ghost ui-btn-icon"><Check size={14} /></button>
                </form>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pb-2">
              {loading ? (
                <p className="t-footnote text-on-surface-variant text-center py-8">Cargando…</p>
              ) : collections.length === 0 ? (
                <p className="t-footnote text-on-surface-variant text-center py-8 px-4">Sin colecciones aún.<br />Creá una para guardar requests.</p>
              ) : (
                collections.map((col) => (
                  <CollectionItem key={col.id} collection={col} activeRequestId={active.requestId}
                    onSelectRequest={(reqId) => loadRequest(col, reqId)}
                    onNewRequest={() => setActive({ ...emptyRequest(col.id), collectionId: col.id })}
                    onDelete={async () => {
                      const ok = await confirmDialog({ title: `¿Eliminar la colección "${col.name}"?`, message: 'Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', destructive: true })
                      if (ok) deleteCollection(col.id)
                    }}
                    onDuplicate={async (reqId) => { const req = col.requests.find((r) => r.id === reqId); if (req) await duplicateRequest(req) }}
                    onDeleteRequest={async (reqId) => {
                      const req = col.requests.find((r) => r.id === reqId)
                      const ok = await confirmDialog({ title: `¿Eliminar el request "${req?.name ?? reqId}"?`, message: 'Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', destructive: true })
                      if (ok) deleteRequest(col.id, reqId)
                    }}
                    onRename={(reqId, newName) => handleRename(col.id, reqId, newName)}
                  />
                ))
              )}
            </div>

          </>
        ) : leftTab === 'history' ? (
          <HistoryPanel
            history={history}
            collections={collections}
            onRestore={loadFromHistory}
            onClear={clearHistory}
            onSave={handleSaveFromHistory}
          />
        ) : (
          <EnvironmentPanel environments={environments} onChange={saveEnvironments} />
        )}
      </aside>

      {/* ── Center + Bottom: request editor + response ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* URL bar */}
        <div className="flex items-center gap-2 px-3 py-2 hairline-b bg-surface shrink-0">
          <MethodSelect value={active.method} onChange={(m) => setActive((a) => ({ ...a, method: m }))} />

          <input value={active.url} onChange={(e) => setActive((a) => ({ ...a, url: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            placeholder="https://api.ejemplo.com/endpoint"
            aria-label="URL"
            className="ui-input flex-1 font-mono t-footnote" />

          {activeEnvName && (
            <span className="fl-chip shrink-0" title="Entorno activo">
              <Network size={11} />
              {activeEnvName}
            </span>
          )}

          {/* Copy as cURL */}
          <button onClick={handleCopyCurl} title="Copiar como cURL" disabled={!active.url.trim()}
            className="ui-btn ui-btn-outline ui-btn-sm">
            {curlCopied
              ? <><Check size={14} /> ¡Copiado!</>
              : <><Terminal size={14} /> cURL</>
            }
          </button>

          {/* Import cURL */}
          <button onClick={() => setShowImportCurl(true)} title="Importar desde cURL" className="ui-btn ui-btn-outline ui-btn-sm">
            <Download size={14} /> Importar
          </button>

          {status === 'loading' ? (
            <button onClick={cancel} className="ui-btn ui-btn-outline">
              <CircleStop size={14} className="text-error" /> Cancelar
            </button>
          ) : (
            <button onClick={handleExecute} disabled={!active.url.trim()} className="ui-btn ui-btn-primary">
              <SendHorizontal size={14} /> Enviar
            </button>
          )}

          {active.collectionId && (
            <button onClick={handleSave} title="Guardar request" aria-label="Guardar request" className="ui-btn ui-btn-ghost ui-btn-icon">
              <Save size={15} />
            </button>
          )}
        </div>

        {/* Request tabs */}
        <div className="fl-toolbar bg-surface shrink-0">
          <div className={SEG_GROUP}>
          {([
            { id: 'params',  label: 'Parámetros',  dot: active.params.some((p) => p.enabled && p.key) },
            { id: 'headers', label: 'Encabezados', dot: active.headers.some((h) => h.enabled && h.key) },
            { id: 'auth',    label: 'Autenticación', dot: active.auth.type !== 'none' },
            { id: 'body',    label: 'Cuerpo',      dot: active.body.type !== 'none' },
            { id: 'scripts', label: 'Scripts',     dot: !!(active.preRequestScript?.trim() || active.postResponseScript?.trim()) },
          ] as { id: RequestTab; label: string; dot: boolean }[]).map(({ id, label, dot }) => (
            <button key={id} onClick={() => setReqTab(id)} aria-pressed={reqTab === id} className={segBtn(reqTab === id)}>
              {label}
              {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary" />}
            </button>
          ))}
          </div>
        </div>

        {/* Request tab content */}
        <div className="flex-1 overflow-auto p-4 bg-surface min-h-0">
          {reqTab === 'body' && (
            <div className="h-full flex flex-col gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex-1">
                  <div className={SEG_GROUP}>
                  {(['none', 'json', 'text', 'xml', 'form', 'form-data'] as BodyType[]).map((t) => (
                    <button key={t} onClick={() => setActive((a) => ({ ...a, body: { ...a.body, type: t } }))}
                      aria-pressed={active.body.type === t} className={segBtn(active.body.type === t)}>
                      {t === 'none' ? 'ninguno' : t === 'form' ? 'form-urlencoded' : t}
                    </button>
                  ))}
                  </div>
                </div>
                {(active.body.type === 'json' || active.body.type === 'xml') && (
                  <button onClick={handleBeautify}
                    className="ui-btn ui-btn-outline ui-btn-sm">
                    {beautified ? <Check size={13} className="text-success" /> : <Sparkles size={13} />}
                    {beautified ? 'Formateado' : 'Formatear'}
                  </button>
                )}
              </div>

              {active.body.type === 'none' && (
                <div className="flex items-center justify-center flex-1 t-footnote text-on-surface-variant">Este request no tiene cuerpo</div>
              )}
              {active.body.type === 'form-data' ? (
                <div className="flex-1 overflow-auto">
                  <FormDataEditor
                    fields={active.body.formData ?? []}
                    onChange={(formData) => setActive((a) => ({ ...a, body: { ...a.body, formData } }))}
                  />
                </div>
              ) : active.body.type === 'form' ? (
                <div className="flex-1 overflow-auto">
                  <KVEditor pairs={formPairs} onChange={setFormPairs} />
                </div>
              ) : active.body.type !== 'none' && (
                <>
                  <textarea value={active.body.content} onChange={(e) => setActive((a) => ({ ...a, body: { ...a.body, content: e.target.value } }))}
                    className="ui-input flex-1 font-mono t-footnote p-3! resize-none"
                    aria-label="Cuerpo del request"
                    placeholder={
                      active.body.type === 'json' ? '{\n  "key": "value"\n}' :
                      active.body.type === 'xml'  ? '<root>\n  <key>value</key>\n</root>' :
                      'Cuerpo del request…'
                    } />
                  {extractTemplateVars(active.body.content).length > 0 && (
                    <div className="shrink-0 hairline rounded-lg overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 hairline-b">
                        <Eye size={11} className="text-on-surface-variant" />
                        <span className="t-caption font-medium text-on-surface-variant">Vista previa resuelta</span>
                        {!activeEnvName && (
                          <span className="ml-auto t-caption text-on-surface-variant italic">sin entorno activo</span>
                        )}
                      </div>
                      <pre className="font-mono t-footnote p-3 text-on-surface whitespace-pre-wrap break-all max-h-32 overflow-auto bg-surface leading-relaxed">
                        {interpolateVars(active.body.content, activeEnvVars)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {reqTab === 'headers' && (
            <KVEditor pairs={active.headers} onChange={(headers) => setActive((a) => ({ ...a, headers }))} />
          )}
          {reqTab === 'params' && (
            <KVEditor pairs={active.params} onChange={(params) => setActive((a) => ({ ...a, params }))} />
          )}
          {reqTab === 'auth' && (
            <AuthEditor auth={active.auth} onChange={(auth) => setActive((a) => ({ ...a, auth }))} />
          )}
          {reqTab === 'scripts' && (
            <div className="flex flex-col gap-4 h-full">
              <ScriptEditor
                label="Script pre-request"
                description="Se ejecuta antes del request. Usá pm.environment.set('key', value) para definir variables."
                value={active.preRequestScript ?? ''}
                onChange={(v) => setActive((a) => ({ ...a, preRequestScript: v }))}
              />
              <ScriptEditor
                label="Script post-respuesta"
                description="Se ejecuta después de recibir la respuesta. Accedé con pm.response.status, pm.response.json(), pm.response.body."
                value={active.postResponseScript ?? ''}
                onChange={(v) => setActive((a) => ({ ...a, postResponseScript: v }))}
              />
            </div>
          )}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={startResize}
          title="Arrastrar para redimensionar"
          className="h-[5px] mb-[-5px] relative z-10 shrink-0 cursor-row-resize hover:bg-primary/30 transition-colors"
        />

        {/* Response panel */}
        <div className="relative shrink-0 hairline-t flex flex-col bg-surface overflow-hidden" style={{ height: responseHeight }}>
          <div className="fl-toolbar gap-3! shrink-0">
            {/* ── Status / loading / idle ───────────────────────────── */}
            {status === 'loading' && (
              <span className="inline-flex items-center gap-2 t-footnote text-on-surface-variant">
                <LoaderCircle size={13} className="animate-spin text-on-surface-variant" />
                Esperando respuesta…
              </span>
            )}
            {status !== 'loading' && response && (
              <div className="flex items-center gap-3">
                {/* Status pill */}
                <span className={`ui-badge ${
                  response.status < 300 ? 'ui-badge-success'
                  : response.status < 400 ? 'ui-badge-primary'
                  : response.status < 500 ? 'ui-badge-warning'
                  : 'ui-badge-error'}`}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ background: 'currentColor' }} />
                  {response.status} {response.statusText}
                </span>
                {/* Timing */}
                <span className="t-footnote text-on-surface-variant/70 flex items-center gap-1">
                  <span className="font-mono">{response.duration}</span>
                  <span className="text-on-surface-variant">ms</span>
                </span>
                <span className="text-on-surface-variant/60">·</span>
                <span className="t-footnote text-on-surface-variant/70 font-mono">{formatSize(response.size)}</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2">
                <CircleAlert size={14} className="text-error shrink-0" />
                <span className="t-footnote text-on-surface">{error}</span>
                <button onClick={handleExecute} disabled={!active.url.trim()}
                  className="ui-btn ui-btn-outline ui-btn-sm">
                  <RotateCcw size={12} />
                  Reintentar
                </button>
              </div>
            )}
            {error && /ECONNREFUSED|connection refused/i.test(error) && (
              <div className="absolute inset-x-0 top-10 bottom-0 flex flex-col items-center justify-center gap-2 pointer-events-none z-10 bg-surface">
                <CircleAlert size={30} strokeWidth={1.5} className="text-error" />
                <p className="t-headline text-on-surface">Conexión rechazada</p>
                <p className="t-footnote text-on-surface-variant">Revisá que el servidor esté levantado y que la URL sea correcta.</p>
              </div>
            )}
            {status === 'idle' && !response && <span className="t-footnote text-on-surface-variant">Enviá un request para ver la respuesta</span>}

            {/* ── Response tabs (right side) ────────────────────────── */}
            <div className="ml-auto flex items-center">
              <div className={SEG_GROUP}>
                {([['body', 'Cuerpo'], ['headers', 'Encabezados'], ['raw', 'Crudo']] as [ResponseTab, string][]).map(([t, label]) => (
                  <button key={t} onClick={() => setResTab(t)} aria-pressed={resTab === t} className={segBtn(resTab === t)}>
                    {label}
                  </button>
                ))}
                {sentSnapshot && (
                  <button onClick={() => setResTab('sent')} aria-pressed={resTab === 'sent'} className={segBtn(resTab === 'sent')}>
                    Enviado
                  </button>
                )}
              </div>
              {response && resTab !== 'sent' && (
                <button onClick={() => navigator.clipboard.writeText(formattedBody)} title="Copiar respuesta" aria-label="Copiar respuesta"
                  className="ml-1 ui-btn ui-btn-ghost ui-btn-icon">
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 font-mono t-footnote text-on-surface leading-relaxed">
            {resTab !== 'sent' && response && resTab === 'body' && <pre className="whitespace-pre-wrap break-all" dangerouslySetInnerHTML={{ __html: highlightJson(formattedBody) }} />}
            {resTab !== 'sent' && response && resTab === 'headers' && (
              <div className="space-y-1">
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k}><span className="text-primary">{k}:</span> <span>{v}</span></div>
                ))}
              </div>
            )}
            {resTab !== 'sent' && response && resTab === 'raw' && <pre className="whitespace-pre-wrap break-all">{response.body}</pre>}
            {resTab === 'sent' && sentSnapshot && (
              <div className="space-y-4 font-sans">
                {/* Request line */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`t-footnote font-semibold font-mono ${METHOD_COLOR[sentSnapshot.method as import('./types').HttpMethod] ?? 'text-on-surface-variant'}`}>
                    {sentSnapshot.method}
                  </span>
                  <span className="t-footnote text-on-surface break-all font-mono">{sentSnapshot.url}</span>
                </div>

                {/* Headers */}
                <div>
                  <p className="fl-section px-0! mb-1">Encabezados</p>
                  <div className="space-y-1 bg-on-surface/4 rounded-md p-2 font-mono">
                    {sentSnapshot.headers.length === 0
                      ? <span className="text-on-surface-variant t-footnote italic">ninguno</span>
                      : sentSnapshot.headers.map((h, i) => (
                        <div key={i} className="flex gap-2 t-footnote">
                          <span className="text-primary shrink-0">{h.key}:</span>
                          <span className="text-on-surface break-all">{h.value}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* Body */}
                {sentSnapshot.bodyType !== 'none' && (
                  <div>
                    <p className="fl-section px-0! mb-1">
                      Cuerpo <span className="font-normal text-on-surface-variant">({sentSnapshot.bodyType})</span>
                    </p>
                    <pre className="whitespace-pre-wrap break-all bg-on-surface/4 rounded-md p-2 font-mono t-footnote text-on-surface leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: highlightJson(tryFormatJson(sentSnapshot.body)) }} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Import collection modal ───────────────────────────────────────── */}
      {showImportCollection && (
        <ImportCollectionModal
          onImport={async (json) => {
            const err = await handleImportCollection(json)
            if (!err) setShowImportCollection(false)
            return err
          }}
          onClose={() => setShowImportCollection(false)}
        />
      )}

      {/* ── Import cURL modal ─────────────────────────────────────────────── */}
      {showImportCurl && (
        <ImportCurlModal
          activeEnvName={activeEnvName}
          onImport={(parsed, detectedVars) => {
            setActive((a) => ({ ...a, ...parsed }))
            setShowImportCurl(false)
            setReqTab('headers')
            if (detectedVars.length > 0) {
              const activeEnv = environments.find((e) => e.isActive)
              if (activeEnv) {
                // Add missing vars to existing active environment
                const updatedVars = { ...activeEnv.variables }
                for (const v of detectedVars) {
                  if (!(v in updatedVars)) updatedVars[v] = ''
                }
                void saveEnvironments(environments.map((e) => e.id === activeEnv.id ? { ...e, variables: updatedVars } : e))
              } else {
                // No active env — create one automatically
                const newEnv: Environment = {
                  id: randomUUID(),
                  name: 'Variables importadas',
                  isActive: true,
                  variables: Object.fromEntries(detectedVars.map((v) => [v, ''])),
                }
                void saveEnvironments([...environments, newEnv])
              }
              setLeftTab('environments')  // Switch to Envs tab so user fills in the values
            }
          }}
          onClose={() => setShowImportCurl(false)}
        />
      )}

    </div>
  )
}

// ── ImportCollectionModal ─────────────────────────────────────────────────────

function ImportCollectionModal({ onImport, onClose }: {
  onImport: (json: string) => Promise<string | null>
  onClose: () => void
}): JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleBrowse = async (): Promise<void> => {
    const paths = await window.api.invoke<string[]>('editor:open-dialog')
    if (!paths?.length) return
    const res = await window.api.invoke<{ content: string }>('editor:read-file', { path: paths[0] })
    if (res?.content) setValue(res.content)
  }

  const handleImport = async (): Promise<void> => {
    setLoading(true)
    const err = await onImport(value.trim())
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <ModalShell onClose={onClose} width="w-[600px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="t-headline text-on-surface">Importar colección</h2>
          <p className="t-footnote text-on-surface-variant mt-0.5">Compatible con Postman Collection v2/v2.1 y el formato nativo.</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="ui-btn ui-btn-ghost ui-btn-icon">
          <X size={14} />
        </button>
      </div>

      <textarea
        autoFocus
        value={value}
        onChange={(e) => { setValue(e.target.value); setError('') }}
        placeholder={'Pegá el JSON de una Postman Collection o un export de colección nativa…'}
        aria-label="JSON de la colección"
        className="ui-input font-mono t-footnote resize-none h-44"
      />

      {error && (
        <p className="t-footnote text-error flex items-center gap-1.5">
          <CircleAlert size={14} />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => void handleBrowse()} className="ui-btn ui-btn-outline">
          <FolderOpen size={14} /> Buscar archivo
        </button>
        <div className="flex-1" />
        <button onClick={onClose} className="ui-btn ui-btn-outline">Cancelar</button>
        <button onClick={() => void handleImport()} disabled={!value.trim() || loading} className="ui-btn ui-btn-primary">
          {loading ? 'Importando…' : 'Importar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── ImportCurlModal ────────────────────────────────────────────────────────────

function ImportCurlModal({ onImport, onClose, activeEnvName }: {
  onImport: (parsed: Partial<ActiveRequest>, detectedVars: string[]) => void
  onClose: () => void
  activeEnvName?: string
}): JSX.Element {
  const [value, setValue] = useState('')
  const [parseError, setParseError] = useState('')

  const parsed = useMemo(() => value.trim() ? parseCurl(value.trim()) : null, [value])

  const detectedVars = useMemo(() => {
    if (!parsed) return []
    return extractTemplateVars(
      parsed.url ?? '',
      ...(parsed.headers ?? []).map((h) => h.value),
      parsed.body?.content ?? '',
    )
  }, [parsed])

  const handleImport = (): void => {
    if (!parsed) { setParseError('No se pudo interpretar el comando cURL. Revisá que empiece con "curl".'); return }
    onImport(parsed, detectedVars)
  }

  return (
    <ModalShell onClose={onClose} width="w-[600px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="t-headline text-on-surface">Importar desde cURL</h2>
          <p className="t-footnote text-on-surface-variant mt-0.5">Pegá un comando cURL para completar los campos del request.</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="ui-btn ui-btn-ghost ui-btn-icon">
          <X size={14} />
        </button>
      </div>

      <textarea
        autoFocus
        value={value}
        onChange={(e) => { setValue(e.target.value); setParseError('') }}
        placeholder={`curl -X POST 'https://api.example.com/data' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer token123' \\\n  -d '{"key": "value"}'`}
        aria-label="Comando cURL"
        className="ui-input font-mono t-footnote resize-none h-44"
      />

      {detectedVars.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 t-footnote">
          <span className="text-on-surface font-semibold shrink-0">Variables detectadas:</span>
          {detectedVars.map((v) => (
            <span key={v} className="ui-badge ui-badge-primary font-mono">{`{{${v}}}`}</span>
          ))}
          <span className="text-on-surface-variant ml-1">
            {activeEnvName
              ? <>→ se van a agregar a <span className="text-on-surface font-medium">{activeEnvName}</span></>
              : '→ no hay entorno activo (se crea uno nuevo)'}
          </span>
        </div>
      )}

      {parseError && (
        <p className="t-footnote text-error flex items-center gap-1.5">
          <CircleAlert size={14} />
          {parseError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="ui-btn ui-btn-outline">Cancelar</button>
        <button onClick={handleImport} disabled={!value.trim()} className="ui-btn ui-btn-primary">
          Importar
        </button>
      </div>
    </ModalShell>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CollectionItem({ collection, activeRequestId, onSelectRequest, onNewRequest, onDelete, onDuplicate, onDeleteRequest, onRename }: {
  collection: Collection; activeRequestId: string | null
  onSelectRequest: (id: string) => void; onNewRequest: () => void
  onDelete: () => void; onDuplicate: (id: string) => void; onDeleteRequest: (id: string) => void
  onRename: (reqId: string, newName: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; reqId: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const handler = (): void => setCtxMenu(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  // Focus input when rename starts
  useEffect(() => {
    if (renamingId) renameInputRef.current?.select()
  }, [renamingId])

  const startRename = (reqId: string, currentName: string): void => {
    setCtxMenu(null)
    setRenamingId(reqId)
    setRenameValue(currentName)
  }

  const commitRename = (): void => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1 mx-1.5 px-1.5 h-[30px] group hover:bg-on-surface/4 rounded-[9px] cursor-default" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} className="text-on-surface-variant" /> : <ChevronRight size={13} className="text-on-surface-variant" />}
        <span className="t-body font-medium text-on-surface flex-1 truncate min-w-0">{collection.name}</span>
        <button onClick={(e) => { e.stopPropagation(); onNewRequest() }} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface" title="Nuevo request" aria-label="Nuevo request">
          <Plus size={13} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface" title="Eliminar colección" aria-label="Eliminar colección">
          <Trash2 size={13} />
        </button>
      </div>

      {open && collection.requests.map((req) => (
        <div key={req.id}
          onClick={() => { if (renamingId !== req.id) onSelectRequest(req.id) }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, reqId: req.id }) }}
          className={`flex items-center gap-2 mx-1.5 pl-6 pr-2 h-[30px] group rounded-[9px] border cursor-default ${activeRequestId === req.id ? 'nav-active' : 'border-transparent hover:bg-on-surface/4'}`}>
          <span className={`t-caption font-semibold font-mono w-12 shrink-0 ${METHOD_COLOR[req.method]}`}>{req.method}</span>

          {renamingId === req.id ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Nombre del request"
              className="flex-1 t-footnote bg-surface rounded px-1.5 py-0 text-on-surface focus:outline-hidden shadow-[0_0_0_2px_rgb(var(--c-primary)/0.5)]"
            />
          ) : (
            <span className="t-footnote text-on-surface truncate flex-1 min-w-0" title={req.name}>{req.name}</span>
          )}

          <button onClick={(e) => { e.stopPropagation(); onDuplicate(req.id) }} title="Duplicar" aria-label="Duplicar" className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface">
            <Copy size={12} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDeleteRequest(req.id) }} title="Eliminar" aria-label="Eliminar" className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface">
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Context menu */}
      <AnimatePresence>
        {ctxMenu && (() => {
          const req = collection.requests.find((r) => r.id === ctxMenu.reqId)
          if (!req) return null
          return (
            <motion.div
              className="ui-menu fixed z-300 min-w-[140px]"
              style={{ top: ctxMenu.y, left: ctxMenu.x }}
              onMouseDown={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              <button onClick={() => startRename(req.id, req.name)} className="ui-menu-item">
                <Pencil size={14} /> Renombrar
              </button>
              <button onClick={() => { onDuplicate(req.id); setCtxMenu(null) }} className="ui-menu-item">
                <Copy size={14} /> Duplicar
              </button>
              <div className="hairline-t my-1" />
              <button onClick={() => { onDeleteRequest(req.id); setCtxMenu(null) }} className="ui-menu-item text-error! hover:text-on-primary!">
                <Trash2 size={14} /> Eliminar
              </button>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

function KVEditor({ pairs, onChange }: { pairs: KeyValuePair[]; onChange: (p: KeyValuePair[]) => void }): JSX.Element {
  const update = (id: string, field: string, value: string | boolean): void => {
    onChange(pairs.map((p) => p.id === id ? { ...p, [field]: value } : p))
  }
  const add = (): void => onChange([...pairs, newKV()])
  const remove = (id: string): void => onChange(pairs.filter((p) => p.id !== id))

  return (
    <div className="space-y-1.5">
      {pairs.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <input type="checkbox" checked={p.enabled} onChange={(e) => update(p.id, 'enabled', e.target.checked)} className="accent-primary" />
          <input value={p.key} onChange={(e) => update(p.id, 'key', e.target.value)} placeholder="Clave"
            className="ui-input flex-1 py-1! font-mono t-footnote" />
          <input value={p.value} onChange={(e) => update(p.id, 'value', e.target.value)} placeholder="Valor"
            className="ui-input flex-1 py-1! font-mono t-footnote" />
          <button onClick={() => remove(p.id)} title="Quitar fila" aria-label="Quitar fila" className="ui-btn ui-btn-ghost ui-btn-icon">
            <X size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} className="ui-btn ui-btn-ghost ui-btn-sm mt-2">
        <Plus size={14} /> Agregar fila
      </button>
    </div>
  )
}

// ── FormDataEditor ────────────────────────────────────────────────────────────
function FormDataEditor({ fields, onChange }: { fields: FormDataField[]; onChange: (f: FormDataField[]) => void }): JSX.Element {
  const update = (id: string, patch: Partial<FormDataField>): void =>
    onChange(fields.map((f) => f.id === id ? { ...f, ...patch } : f))
  const add = (): void => onChange([...fields, { id: randomUUID(), key: '', value: '', enabled: true, isFile: false }])
  const remove = (id: string): void => onChange(fields.filter((f) => f.id !== id))

  const handleFileChange = (id: string, e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(',')[1] ?? ''
      update(id, { value: `__FILE__:${b64}:${file.name}`, isFile: true })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const getFileLabel = (value: string): string => {
    const parts = value.split(':')
    return parts[2] ?? 'file'
  }

  return (
    <div className="space-y-1.5">
      {fields.map((f) => (
        <div key={f.id} className="flex items-center gap-2">
          <input type="checkbox" checked={f.enabled} onChange={(e) => update(f.id, { enabled: e.target.checked })} className="accent-primary" />
          <input value={f.key} onChange={(e) => update(f.id, { key: e.target.value })} placeholder="Clave"
            className="ui-input flex-1 py-1! font-mono t-footnote" />
          {f.isFile ? (
            <div className="ui-input flex-1 flex items-center gap-1 py-1! t-footnote text-on-surface-variant">
              <Paperclip size={12} />
              <span className="truncate">{getFileLabel(f.value)}</span>
              <button onClick={() => update(f.id, { value: '', isFile: false })} aria-label="Quitar archivo" className="ml-auto text-on-surface-variant hover:text-on-surface">
                <X size={12} />
              </button>
            </div>
          ) : (
            <input value={f.value} onChange={(e) => update(f.id, { value: e.target.value })} placeholder="Valor"
              className="ui-input flex-1 py-1! font-mono t-footnote" />
          )}
          <label title="Adjuntar archivo" className="ui-btn ui-btn-ghost ui-btn-icon cursor-pointer">
            <FileUp size={13} />
            <input type="file" className="hidden" onChange={(e) => handleFileChange(f.id, e)} />
          </label>
          <button onClick={() => remove(f.id)} title="Quitar campo" aria-label="Quitar campo" className="ui-btn ui-btn-ghost ui-btn-icon">
            <X size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} className="ui-btn ui-btn-ghost ui-btn-sm mt-2">
        <Plus size={14} /> Agregar campo
      </button>
    </div>
  )
}

// ── EnvironmentPanel ──────────────────────────────────────────────────────────

function EnvironmentPanel({ environments, onChange }: {
  environments: Environment[]
  onChange: (envs: Environment[]) => Promise<void>
}): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(
    environments.find((e) => e.isActive)?.id ?? environments[0]?.id ?? null
  )
  const [newEnvName, setNewEnvName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [varPairs, setVarPairs] = useState<KeyValuePair[]>([])
  const [varsSaved, setVarsSaved] = useState(false)
  const [secretKeys, setSecretKeys] = useState<Set<string>>(new Set())
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  const selected = environments.find((e) => e.id === selectedId) ?? null

  // Auto-select active env (or keep valid selection) when environments list changes externally
  useEffect(() => {
    const activeId = environments.find((e) => e.isActive)?.id
    if (activeId && activeId !== selectedId) {
      setSelectedId(activeId)
    } else if (!environments.find((e) => e.id === selectedId) && environments.length > 0) {
      setSelectedId(environments[0]!.id)
    }
  }, [environments]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync varPairs when selected env or its variables change externally (e.g. import curl)
  useEffect(() => {
    if (selected) {
      setVarPairs(Object.entries(selected.variables).map(([k, v]) => ({ id: randomUUID(), key: k, value: v, enabled: true })))
      setSecretKeys(new Set(selected.secretKeys ?? []))
      setRevealedKeys(new Set())
    } else {
      setVarPairs([])
      setSecretKeys(new Set())
      setRevealedKeys(new Set())
    }
  }, [selectedId, JSON.stringify(selected?.variables)]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSecret = (key: string): void => {
    setSecretKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    // Hide value again when marking as secret
    setRevealedKeys((prev) => { const n = new Set(prev); n.delete(key); return n })
  }

  const handleSaveVars = async (): Promise<void> => {
    if (!selected) return
    const variables = Object.fromEntries(varPairs.filter((p) => p.key.trim()).map((p) => [p.key, p.value]))
    const activeSecretKeys = Array.from(secretKeys).filter((k) => k in variables)
    await onChange(environments.map((e) => e.id === selected.id ? { ...e, variables, secretKeys: activeSecretKeys } : e))
    setVarsSaved(true)
    setTimeout(() => setVarsSaved(false), 1500)
  }

  const handleSetActive = async (id: string): Promise<void> => {
    await onChange(environments.map((e) => ({ ...e, isActive: e.id === id })))
  }

  const handleAddEnv = async (): Promise<void> => {
    if (!newEnvName.trim()) return
    const newEnv: Environment = { id: randomUUID(), name: newEnvName.trim(), isActive: false, variables: {} }
    await onChange([...environments, newEnv])
    setSelectedId(newEnv.id)
    setVarPairs([])
    setNewEnvName('')
    setShowNew(false)
  }

  const handleDeleteEnv = async (id: string): Promise<void> => {
    const updated = environments.filter((e) => e.id !== id)
    await onChange(updated)
    if (selectedId === id) setSelectedId(updated[0]?.id ?? null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Environment list */}
      <div className="px-3 pt-3 pb-2 hairline-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="fl-section px-0!">Entornos</span>
          <button onClick={() => setShowNew(true)} title="Nuevo entorno" aria-label="Nuevo entorno" className="ui-btn ui-btn-ghost ui-btn-icon">
            <Plus size={14} />
          </button>
        </div>
        {showNew && (
          <form onSubmit={(e) => { e.preventDefault(); void handleAddEnv() }} className="flex gap-1 mb-2">
            <input autoFocus value={newEnvName} onChange={(e) => setNewEnvName(e.target.value)} placeholder="Nombre del entorno"
              className="ui-input flex-1 py-1! t-footnote" />
            <button type="submit" aria-label="Crear entorno" className="ui-btn ui-btn-ghost ui-btn-icon"><Check size={14} /></button>
          </form>
        )}
        <div className="space-y-0.5 max-h-36 overflow-y-auto">
          {environments.map((env) => (
            <div key={env.id} onClick={() => setSelectedId(env.id)}
              className={`flex items-center gap-2 px-2 h-[30px] rounded-[9px] border cursor-default group transition-colors ${selectedId === env.id ? 'nav-active' : 'border-transparent hover:bg-on-surface/4'}`}>
              <button
                onClick={(e) => { e.stopPropagation(); void handleSetActive(env.id) }}
                className={`w-2.5 h-2.5 rounded-full shrink-0 border transition-colors ${env.isActive ? 'bg-success border-success' : 'border-hairline-strong hover:border-success'}`}
                title={env.isActive ? 'Entorno activo' : 'Marcar como activo'}
                aria-label={env.isActive ? 'Entorno activo' : 'Marcar como activo'}
              />
              <span className="t-footnote text-on-surface flex-1 truncate">{env.name}</span>
              {env.isActive && <span className="t-caption text-on-surface-variant">activo</span>}
              <button onClick={(e) => { e.stopPropagation(); void handleDeleteEnv(env.id) }} title="Eliminar entorno" aria-label="Eliminar entorno"
                className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-opacity">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {environments.length === 0 && (
            <p className="t-footnote text-on-surface-variant text-center py-4 px-2">Sin entornos aún.<br />Creá uno para usar variables.</p>
          )}
        </div>
      </div>

      {/* Variable editor */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-1 shrink-0 flex items-center justify-between gap-2">
            <p className="t-caption text-on-surface-variant">
              Usá <code className="bg-on-surface/6 px-1 rounded font-mono">{`{{variable}}`}</code> en URLs, encabezados y cuerpo.
            </p>
            {varsSaved && (
              <span className="flex items-center gap-0.5 t-caption text-success shrink-0" style={{ animation: 'fe-saved-pop 0.2s ease both' }}>
                <Check size={11} /> Guardado
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-1.5">
              {varPairs.map((p) => {
                const isSecret  = secretKeys.has(p.key)
                const isRevealed = revealedKeys.has(p.key)
                return (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <input value={p.key} onChange={(e) => setVarPairs((ps) => ps.map((x) => x.id === p.id ? { ...x, key: e.target.value } : x))}
                      placeholder="Variable"
                      className="ui-input flex-1 py-1! font-mono t-footnote" />
                    <div className="relative flex-1">
                      <input
                        type={isSecret && !isRevealed ? 'password' : 'text'}
                        value={p.value}
                        onChange={(e) => setVarPairs((ps) => ps.map((x) => x.id === p.id ? { ...x, value: e.target.value } : x))}
                        placeholder="Valor"
                        className="ui-input w-full py-1! pr-6! font-mono t-footnote"
                      />
                      {isSecret && (
                        <button
                          type="button"
                          onClick={() => setRevealedKeys((prev) => { const n = new Set(prev); n.has(p.key) ? n.delete(p.key) : n.add(p.key); return n })}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                          title={isRevealed ? 'Ocultar valor' : 'Mostrar valor'}
                        >
                          {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                    </div>
                    {/* Secret toggle */}
                    <button
                      type="button"
                      onClick={() => toggleSecret(p.key)}
                      title={isSecret ? 'Desmarcar como secreto' : 'Marcar como secreto'}
                      aria-label={isSecret ? 'Desmarcar como secreto' : 'Marcar como secreto'}
                      className={`shrink-0 transition-colors ${isSecret ? 'text-on-surface' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
                    >
                      {isSecret ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                    <button onClick={() => void handleSaveVars()} title="Guardar" aria-label="Guardar"
                      className="text-on-surface-variant hover:text-success transition-colors shrink-0">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setVarPairs((ps) => ps.filter((x) => x.id !== p.id))} title="Quitar variable" aria-label="Quitar variable"
                      className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setVarPairs((ps) => [...ps, { id: randomUUID(), key: '', value: '', enabled: true }])}
              className="ui-btn ui-btn-ghost ui-btn-sm mt-2">
              <Plus size={13} /> Agregar variable
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AuthEditor({ auth, onChange }: { auth: ActiveRequest['auth']; onChange: (a: ActiveRequest['auth']) => void }): JSX.Element {
  return (
    <div className="space-y-4 max-w-sm">
      <SegmentedControl
        options={[{ value: 'none', label: 'Ninguna' }, { value: 'bearer', label: 'Bearer Token' }, { value: 'basic', label: 'Básica' }]}
        value={auth.type}
        onChange={(t) => onChange({ ...auth, type: t })}
      />
      {auth.type === 'bearer' && (
        <input value={auth.token ?? ''} onChange={(e) => onChange({ ...auth, token: e.target.value })} placeholder="Token"
          aria-label="Token" className="ui-input w-full font-mono t-footnote" />
      )}
      {auth.type === 'basic' && (
        <div className="space-y-2">
          <input value={auth.username ?? ''} onChange={(e) => onChange({ ...auth, username: e.target.value })} placeholder="Usuario"
            aria-label="Usuario" className="ui-input w-full" />
          <input type="password" value={auth.password ?? ''} onChange={(e) => onChange({ ...auth, password: e.target.value })} placeholder="Contraseña"
            aria-label="Contraseña" className="ui-input w-full" />
        </div>
      )}
    </div>
  )
}

function ScriptEditor({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 flex-1 min-h-0">
      <div className="shrink-0">
        <span className="t-footnote font-semibold text-on-surface">{label}</span>
        <p className="t-caption text-on-surface-variant mt-0.5">{description}</p>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={'// JavaScript\npm.environment.set(\'token\', pm.response.json().access_token)'}
        aria-label={label}
        className="ui-input flex-1 min-h-[80px] font-mono t-footnote resize-none placeholder:text-on-surface-variant/60"
      />
    </div>
  )
}
