import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BookmarkPlus, Check, ChevronDown, ChevronRight, CircleAlert, CircleStop,
  Copy, Download, FileUp, FolderOpen, Network, Paperclip, Pencil, Plus,
  RotateCcw, Save, Search, Send, Sparkles, Terminal, Trash2, Upload, X,
} from 'lucide-react'
import { useCollections } from './hooks/useCollections'
import { useRequestRunner } from './hooks/useRequestRunner'
import {
  tryFormatJson, highlightJson, formatXml, formatSize, newKV, randomUUID,
  parseCurl, exportToCurl, parseFormPairs, serializeFormPairs,
  importCollectionFromJSON,
} from './utils'
import type { ActiveRequest, Collection, Environment, HttpMethod, BodyType, KeyValuePair, FormDataField } from './types'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: 'text-accent', POST: 'text-primary', PUT: 'text-secondary',
  PATCH: 'text-yellow-400', DELETE: 'text-error',
  HEAD: 'text-on-surface-variant', OPTIONS: 'text-on-surface-variant',
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
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors hover:border-outline-variant/60 ${METHOD_COLOR[value]}`}
      >
        {value}
        <ChevronDown size={14} className="text-on-surface-variant/40" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-outline-variant/25 rounded-xl shadow-xl overflow-hidden py-1 min-w-[110px]">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange(m); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm font-bold hover:bg-surface-container transition-colors ${METHOD_COLOR[m]} ${m === value ? 'bg-surface-container-high' : ''}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
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
    <div className="group px-2 py-1.5 hover:bg-surface-container transition-colors">
      <button onClick={onRestore} className="w-full flex items-start gap-2 text-left">
        <span className={`text-[10px] font-bold mt-0.5 w-12 flex-shrink-0 ${METHOD_COLOR[entry.request.method]}`}>
          {entry.request.method}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-on-surface truncate leading-tight">{entry.request.url}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-semibold ${entry.response.status < 400 ? 'text-accent' : 'text-error'}`}>
              {entry.response.status}
            </span>
            <span className="text-[10px] text-on-surface-variant/50">{entry.response.duration}ms</span>
            <span className="text-[10px] text-on-surface-variant/40">{date} {time}</span>
          </div>
        </div>
      </button>
      {collections.length > 0 && (
        <div className="mt-0.5 hidden group-hover:flex justify-end">
          {!showSave ? (
            <button onClick={() => setShowSave(true)}
              className="text-[10px] text-on-surface-variant/50 hover:text-primary transition-colors flex items-center gap-0.5">
              <BookmarkPlus size={11} /> Save
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <select defaultValue="" onChange={(e) => { if (e.target.value) { onSave(e.target.value); setShowSave(false) } }}
                className="text-[10px] bg-surface-container border border-outline-variant/30 rounded px-1 py-0.5 text-on-surface focus:outline-none">
                <option value="" disabled>Collection...</option>
                {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => setShowSave(false)} className="text-on-surface-variant/50 hover:text-error">
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
      <div className="px-3 pt-3 pb-2 border-b border-outline-variant/15 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
            {history.length} request{history.length !== 1 ? 's' : ''}
          </span>
          {history.length > 0 && (
            <button onClick={onClear} className="text-[10px] text-on-surface-variant hover:text-error transition-colors">
              Clear all
            </button>
          )}
        </div>
        {history.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 bg-surface-container border border-outline-variant/25 rounded-lg px-2 py-1 mb-2">
              <Search size={12} className="text-on-surface-variant/40" />
              <input
                value={urlSearch} onChange={(e) => setUrlSearch(e.target.value)}
                placeholder="Filter by URL…"
                className="flex-1 bg-transparent text-[11px] text-on-surface placeholder-on-surface-variant/40 outline-none"
              />
              {urlSearch && (
                <button onClick={() => setUrlSearch('')} className="text-on-surface-variant/40 hover:text-on-surface-variant">
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {methods.map((m) => (
                <button key={m} onClick={() => setMethodFilter(m)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full border transition-colors ${
                    methodFilter === m
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant/30 text-on-surface-variant/60 hover:text-on-surface'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {history.length === 0 ? (
          <p className="text-xs text-on-surface-variant/60 text-center py-8 px-4">
            No requests yet.<br />Execute a request to see history.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-on-surface-variant/60 text-center py-8">No {methodFilter} requests.</p>
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
type ResponseTab = 'body' | 'headers' | 'raw'

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
    if (!col) return 'Invalid format. Paste a native collection JSON or a Postman Collection v2/v2.1 export.'
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
    await saveRequest({
      id: active.requestId ?? randomUUID(),
      collectionId: active.collectionId,
      name: active.url || 'Untitled request',
      method: active.method, url: active.url,
      headers: active.headers, params: active.params,
      body: active.body, auth: active.auth,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
  }

  const handleExecute = (): void => {
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

  const isOk = response && response.status < 400
  const formattedBody = response ? tryFormatJson(response.body) : ''
  const activeEnvName = environments.find((e) => e.isActive)?.name

  // For form body type, work with KV pairs derived from content
  const formPairs: KeyValuePair[] = active.body.type === 'form' ? parseFormPairs(active.body.content) : []
  const setFormPairs = (pairs: KeyValuePair[]): void =>
    setActive((a) => ({ ...a, body: { ...a.body, content: serializeFormPairs(pairs) } }))

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: collections / environments ───────────────────────── */}
      <aside className="w-60 flex-shrink-0 border-r border-outline-variant/20 flex flex-col bg-surface overflow-hidden">

        {/* Tab toggle */}
        <div className="flex border-b border-outline-variant/15 flex-shrink-0">
          {([['collections', 'Saved'], ['environments', 'Envs'], ['history', 'History']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setLeftTab(t)}
              className={`flex-1 py-2 text-[11px] font-semibold transition-colors border-b-2 ${leftTab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant/60 hover:text-on-surface'}`}>
              {label}
              {t === 'history' && history.length > 0 && (
                <span className="ml-1 text-[9px] bg-primary/20 text-primary rounded-full px-1.5 py-0.5">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        {leftTab === 'collections' ? (
          <>
            <div className="px-4 pt-3 pb-3 border-b border-outline-variant/15 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Collections</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowImportCollection(true)} className="text-on-surface-variant hover:text-primary transition-colors" title="Import collection">
                    <Upload size={16} />
                  </button>
                  <button onClick={() => setShowNewCol(true)} className="text-on-surface-variant hover:text-primary transition-colors" title="New collection">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              {showNewCol && (
                <form onSubmit={async (e) => { e.preventDefault(); if (newColName.trim()) { await createCollection(newColName.trim()); setNewColName(''); setShowNewCol(false) } }} className="flex gap-1">
                  <input autoFocus value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="Collection name"
                    className="flex-1 text-xs bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <button type="submit" className="text-primary"><Check size={16} /></button>
                </form>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {loading ? (
                <p className="text-xs text-on-surface-variant text-center py-8">Loading...</p>
              ) : collections.length === 0 ? (
                <p className="text-xs text-on-surface-variant/60 text-center py-8 px-4">No collections yet.<br />Create one to save requests.</p>
              ) : (
                collections.map((col) => (
                  <CollectionItem key={col.id} collection={col} activeRequestId={active.requestId}
                    onSelectRequest={(reqId) => loadRequest(col, reqId)}
                    onNewRequest={() => setActive({ ...emptyRequest(col.id), collectionId: col.id })}
                    onDelete={() => deleteCollection(col.id)}
                    onDuplicate={async (reqId) => { const req = col.requests.find((r) => r.id === reqId); if (req) await duplicateRequest(req) }}
                    onDeleteRequest={(reqId) => deleteRequest(col.id, reqId)}
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
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant/20 bg-surface flex-shrink-0">
          <MethodSelect value={active.method} onChange={(m) => setActive((a) => ({ ...a, method: m }))} />

          <input value={active.url} onChange={(e) => setActive((a) => ({ ...a, url: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            placeholder="https://api.example.com/endpoint"
            className="flex-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />

          {activeEnvName && (
            <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/20" title="Active environment">
              <Network size={11} />
              {activeEnvName}
            </span>
          )}

          {/* Copy as cURL */}
          <button onClick={handleCopyCurl} title="Copy as cURL" disabled={!active.url.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-primary/40 transition-colors disabled:opacity-40">
            {curlCopied
              ? <><Check size={14} /> Copied!</>
              : <><Terminal size={14} /> cURL</>
            }
          </button>

          {/* Import cURL */}
          <button onClick={() => setShowImportCurl(true)} title="Import from cURL"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-primary/40 transition-colors">
            <Download size={14} /> Import
          </button>

          {status === 'loading' ? (
            <button onClick={cancel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-error/40 text-error hover:bg-error/10 transition-all">
              <CircleStop size={15} /> Cancel
            </button>
          ) : (
            <button onClick={handleExecute} disabled={!active.url.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-on-primary transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--gradient-brand)' }}>
              <Send size={15} /> Send
            </button>
          )}

          {active.collectionId && (
            <button onClick={handleSave} title="Save request" className="p-2 text-on-surface-variant hover:text-primary transition-colors">
              <Save size={18} />
            </button>
          )}
        </div>

        {/* Request tabs */}
        <div className="flex items-center gap-0 px-4 border-b border-outline-variant/15 bg-surface flex-shrink-0">
          {(['headers', 'params', 'body', 'auth', 'scripts'] as RequestTab[]).map((t) => (
            <button key={t} onClick={() => setReqTab(t)}
              className={`px-4 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors ${reqTab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Request tab content */}
        <div className="flex-1 overflow-auto p-4 bg-surface-container-low min-h-0">
          {reqTab === 'body' && (
            <div className="h-full flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex gap-1.5 flex-1">
                  {(['none', 'json', 'text', 'xml', 'form', 'form-data'] as BodyType[]).map((t) => (
                    <button key={t} onClick={() => setActive((a) => ({ ...a, body: { ...a.body, type: t } }))}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${active.body.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30'}`}>
                      {t === 'form' ? 'form-urlencoded' : t}
                    </button>
                  ))}
                </div>
                {(active.body.type === 'json' || active.body.type === 'xml') && (
                  <button onClick={handleBeautify}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${beautified ? 'border-accent/50 text-accent bg-accent/10' : 'border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/40'}`}>
                    <Sparkles size={13} />
                    {beautified ? 'Beautified!' : 'Beautify'}
                  </button>
                )}
              </div>

              {active.body.type === 'none' && (
                <div className="flex items-center justify-center flex-1 text-xs text-on-surface-variant/50">No body</div>
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
                <textarea value={active.body.content} onChange={(e) => setActive((a) => ({ ...a, body: { ...a.body, content: e.target.value } }))}
                  className="flex-1 font-mono text-xs bg-surface border border-outline-variant/20 rounded-xl p-4 text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                  placeholder={
                    active.body.type === 'json' ? '{\n  "key": "value"\n}' :
                    active.body.type === 'xml'  ? '<root>\n  <key>value</key>\n</root>' :
                    'Request body...'
                  } />
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
                label="Pre-request Script"
                description="Runs before the request. Use pm.environment.set('key', value) to set variables."
                value={active.preRequestScript ?? ''}
                onChange={(v) => setActive((a) => ({ ...a, preRequestScript: v }))}
              />
              <ScriptEditor
                label="Post-response Script"
                description="Runs after the response. Use pm.response.status, pm.response.json(), pm.response.body."
                value={active.postResponseScript ?? ''}
                onChange={(v) => setActive((a) => ({ ...a, postResponseScript: v }))}
              />
            </div>
          )}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={startResize}
          className="h-1.5 flex-shrink-0 cursor-row-resize bg-outline-variant/10 hover:bg-primary/30 transition-colors group flex items-center justify-center"
        >
          <div className="w-8 h-0.5 rounded-full bg-outline-variant/40 group-hover:bg-primary/60 transition-colors" />
        </div>

        {/* Response panel */}
        <div className="flex-shrink-0 border-t border-outline-variant/20 flex flex-col bg-surface overflow-hidden" style={{ height: responseHeight }}>
          <div className="flex items-center gap-4 px-4 py-2 border-b border-outline-variant/15 flex-shrink-0">
            {response && (
              <>
                <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-2 py-0.5 rounded-md ${isOk ? 'bg-accent/10 text-accent' : 'bg-error/10 text-error'}`}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'currentColor' }} />
                  {response.status} {response.statusText}
                </span>
                <span className="text-xs text-on-surface-variant">{response.duration}ms</span>
                <span className="text-xs text-on-surface-variant">{formatSize(response.size)}</span>
              </>
            )}
            {error && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-error">{error}</span>
                <button onClick={handleExecute} disabled={!active.url.trim()}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border border-error/30 text-error hover:bg-error/10 transition-colors disabled:opacity-40">
                  <RotateCcw size={12} />
                  Retry
                </button>
              </div>
            )}
            {status === 'idle' && !response && <span className="text-xs text-on-surface-variant">Send a request to see the response</span>}

            <div className="ml-auto flex items-center gap-1">
              {(['body', 'headers', 'raw'] as ResponseTab[]).map((t) => (
                <button key={t} onClick={() => setResTab(t)}
                  className={`px-3 py-1 text-xs capitalize border-b-2 transition-colors ${resTab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
                  {t}
                </button>
              ))}
              {response && (
                <button onClick={() => navigator.clipboard.writeText(formattedBody)} title="Copy response"
                  className="ml-2 text-on-surface-variant hover:text-primary transition-colors">
                  <Copy size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 font-mono text-xs text-on-surface leading-relaxed">
            {response && resTab === 'body' && <pre className="whitespace-pre-wrap break-all" dangerouslySetInnerHTML={{ __html: highlightJson(formattedBody) }} />}
            {response && resTab === 'headers' && (
              <div className="space-y-1">
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k}><span className="text-primary">{k}:</span> <span>{v}</span></div>
                ))}
              </div>
            )}
            {response && resTab === 'raw' && <pre className="whitespace-pre-wrap break-all">{response.body}</pre>}
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
          onImport={(parsed) => {
            setActive((a) => ({ ...a, ...parsed }))
            setShowImportCurl(false)
            setReqTab('headers')
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-outline-variant/20 rounded-2xl shadow-2xl w-[600px] max-w-[90vw] p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Import Collection</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Supports Postman Collection v2/v2.1 and native format.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <X size={20} />
          </button>
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          placeholder={'Paste a Postman Collection JSON or a native collection export…'}
          className="font-mono text-xs bg-surface-container border border-outline-variant/20 rounded-xl p-4 text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none h-44"
        />

        {error && (
          <p className="text-xs text-error flex items-center gap-1.5">
            <CircleAlert size={14} />
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button onClick={() => void handleBrowse()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:border-primary/40 transition-colors">
            <FolderOpen size={14} /> Browse file
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={() => void handleImport()} disabled={!value.trim() || loading}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-on-primary disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: 'var(--gradient-brand)' }}>
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ImportCurlModal ────────────────────────────────────────────────────────────

function ImportCurlModal({ onImport, onClose }: {
  onImport: (parsed: Partial<ActiveRequest>) => void
  onClose: () => void
}): JSX.Element {
  const [value, setValue] = useState('')
  const [parseError, setParseError] = useState('')

  const handleImport = (): void => {
    const result = parseCurl(value.trim())
    if (!result) { setParseError('Could not parse cURL command. Make sure it starts with "curl".'); return }
    onImport(result)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-outline-variant/20 rounded-2xl shadow-2xl w-[600px] max-w-[90vw] p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Import from cURL</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Paste a cURL command to populate the request fields.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <X size={20} />
          </button>
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setParseError('') }}
          placeholder={`curl -X POST 'https://api.example.com/data' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer token123' \\\n  -d '{"key": "value"}'`}
          className="font-mono text-xs bg-surface-container border border-outline-variant/20 rounded-xl p-4 text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none h-44"
        />

        {parseError && (
          <p className="text-xs text-error flex items-center gap-1.5">
            <CircleAlert size={14} />
            {parseError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={handleImport} disabled={!value.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-on-primary disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: 'var(--gradient-brand)' }}>
            Import
          </button>
        </div>
      </div>
    </div>
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
    <div className="mb-1">
      <div className="flex items-center gap-1 px-3 py-1.5 group hover:bg-surface-container rounded-lg cursor-pointer" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} className="text-on-surface-variant" /> : <ChevronRight size={14} className="text-on-surface-variant" />}
        <span className="text-xs font-medium text-on-surface flex-1 truncate">{collection.name}</span>
        <button onClick={(e) => { e.stopPropagation(); onNewRequest() }} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary" title="New request">
          <Plus size={13} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error" title="Delete collection">
          <Trash2 size={13} />
        </button>
      </div>

      {open && collection.requests.map((req) => (
        <div key={req.id}
          onClick={() => { if (renamingId !== req.id) onSelectRequest(req.id) }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, reqId: req.id }) }}
          className={`flex items-center gap-2 pl-7 pr-3 py-1.5 group hover:bg-surface-container rounded-lg cursor-pointer ${activeRequestId === req.id ? 'bg-primary/10' : ''}`}>
          <span className={`text-[9px] font-bold w-10 flex-shrink-0 ${METHOD_COLOR[req.method]}`}>{req.method}</span>

          {renamingId === req.id ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-xs bg-surface border border-primary/50 rounded px-1.5 py-0.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          ) : (
            <span className="text-xs text-on-surface truncate flex-1">{req.name}</span>
          )}

          <button onClick={(e) => { e.stopPropagation(); onDuplicate(req.id) }} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary">
            <Copy size={12} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDeleteRequest(req.id) }} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error">
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Context menu */}
      {ctxMenu && (() => {
        const req = collection.requests.find((r) => r.id === ctxMenu.reqId)
        if (!req) return null
        return (
          <div
            className="fixed z-[300] bg-surface border border-outline-variant/25 rounded-xl shadow-xl overflow-hidden py-1 min-w-[140px]"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button onClick={() => startRename(req.id, req.name)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface hover:bg-surface-container transition-colors">
              <Pencil size={14} /> Rename
            </button>
            <button onClick={() => { onDuplicate(req.id); setCtxMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface hover:bg-surface-container transition-colors">
              <Copy size={14} /> Duplicate
            </button>
            <div className="border-t border-outline-variant/15 my-1" />
            <button onClick={() => { onDeleteRequest(req.id); setCtxMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 transition-colors">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )
      })()}
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
          <input value={p.key} onChange={(e) => update(p.id, 'key', e.target.value)} placeholder="Key"
            className="flex-1 text-xs bg-surface border border-outline-variant/20 rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
          <input value={p.value} onChange={(e) => update(p.id, 'value', e.target.value)} placeholder="Value"
            className="flex-1 text-xs bg-surface border border-outline-variant/20 rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
          <button onClick={() => remove(p.id)} className="text-on-surface-variant hover:text-error transition-colors">
            <X size={14} />
          </button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors mt-2">
        <Plus size={14} /> Add row
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
          <input value={f.key} onChange={(e) => update(f.id, { key: e.target.value })} placeholder="Key"
            className="flex-1 text-xs bg-surface border border-outline-variant/20 rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
          {f.isFile ? (
            <div className="flex-1 flex items-center gap-1 text-xs text-on-surface-variant bg-surface border border-outline-variant/20 rounded-lg px-2.5 py-1.5">
              <Paperclip size={12} />
              <span className="truncate">{getFileLabel(f.value)}</span>
              <button onClick={() => update(f.id, { value: '', isFile: false })} className="ml-auto text-on-surface-variant/50 hover:text-error">
                <X size={12} />
              </button>
            </div>
          ) : (
            <input value={f.value} onChange={(e) => update(f.id, { value: e.target.value })} placeholder="Value"
              className="flex-1 text-xs bg-surface border border-outline-variant/20 rounded-lg px-2.5 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
          )}
          <label title="Attach file" className="cursor-pointer text-on-surface-variant/50 hover:text-primary transition-colors">
            <FileUp size={14} />
            <input type="file" className="hidden" onChange={(e) => handleFileChange(f.id, e)} />
          </label>
          <button onClick={() => remove(f.id)} className="text-on-surface-variant hover:text-error transition-colors">
            <X size={14} />
          </button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors mt-2">
        <Plus size={14} /> Add field
      </button>
    </div>
  )
}

// ── EnvironmentPanel ──────────────────────────────────────────────────────────

function EnvironmentPanel({ environments, onChange }: {
  environments: Environment[]
  onChange: (envs: Environment[]) => Promise<void>
}): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(environments[0]?.id ?? null)
  const [newEnvName, setNewEnvName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [varPairs, setVarPairs] = useState<KeyValuePair[]>([])

  const selected = environments.find((e) => e.id === selectedId) ?? null

  useEffect(() => {
    if (selected) {
      setVarPairs(Object.entries(selected.variables).map(([k, v]) => ({ id: randomUUID(), key: k, value: v, enabled: true })))
    } else {
      setVarPairs([])
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveVars = async (): Promise<void> => {
    if (!selected) return
    const variables = Object.fromEntries(varPairs.filter((p) => p.key.trim()).map((p) => [p.key, p.value]))
    await onChange(environments.map((e) => e.id === selected.id ? { ...e, variables } : e))
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
      <div className="px-3 pt-3 pb-2 border-b border-outline-variant/15 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Environments</span>
          <button onClick={() => setShowNew(true)} className="text-on-surface-variant hover:text-primary transition-colors">
            <Plus size={16} />
          </button>
        </div>
        {showNew && (
          <form onSubmit={(e) => { e.preventDefault(); void handleAddEnv() }} className="flex gap-1 mb-2">
            <input autoFocus value={newEnvName} onChange={(e) => setNewEnvName(e.target.value)} placeholder="Environment name"
              className="flex-1 text-xs bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <button type="submit" className="text-primary"><Check size={16} /></button>
          </form>
        )}
        <div className="space-y-0.5">
          {environments.map((env) => (
            <div key={env.id} onClick={() => setSelectedId(env.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors ${selectedId === env.id ? 'bg-primary/10' : 'hover:bg-surface-container'}`}>
              <button
                onClick={(e) => { e.stopPropagation(); void handleSetActive(env.id) }}
                className={`w-2 h-2 rounded-full flex-shrink-0 border-2 transition-colors ${env.isActive ? 'bg-accent border-accent' : 'border-outline-variant/50 hover:border-accent'}`}
                title={env.isActive ? 'Active environment' : 'Set as active'}
              />
              <span className="text-xs text-on-surface flex-1 truncate">{env.name}</span>
              {env.isActive && <span className="text-[9px] text-accent font-bold">ACTIVE</span>}
              <button onClick={(e) => { e.stopPropagation(); void handleDeleteEnv(env.id) }}
                className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {environments.length === 0 && (
            <p className="text-xs text-on-surface-variant/50 text-center py-4 px-2">No environments yet.<br />Create one to use variables.</p>
          )}
        </div>
      </div>

      {/* Variable editor */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            <p className="text-[10px] text-on-surface-variant/50">
              Use <code className="bg-surface-container px-1 rounded text-primary/80">{`{{varName}}`}</code> in URLs, headers and body.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-1.5">
              {varPairs.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <input value={p.key} onChange={(e) => setVarPairs((ps) => ps.map((x) => x.id === p.id ? { ...x, key: e.target.value } : x))}
                    placeholder="Variable"
                    className="flex-1 text-xs bg-surface border border-outline-variant/20 rounded-lg px-2 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <input value={p.value} onChange={(e) => setVarPairs((ps) => ps.map((x) => x.id === p.id ? { ...x, value: e.target.value } : x))}
                    placeholder="Value"
                    className="flex-1 text-xs bg-surface border border-outline-variant/20 rounded-lg px-2 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  <button onClick={() => setVarPairs((ps) => ps.filter((x) => x.id !== p.id))} className="text-on-surface-variant hover:text-error transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setVarPairs((ps) => [...ps, { id: randomUUID(), key: '', value: '', enabled: true }])}
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors mt-2">
              <Plus size={13} /> Add variable
            </button>
          </div>
          <div className="px-3 pb-3 flex-shrink-0">
            <button onClick={() => void handleSaveVars()}
              className="w-full py-1.5 text-xs font-semibold rounded-lg text-on-primary transition-all hover:opacity-90"
              style={{ background: 'var(--gradient-brand)' }}>
              Save
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
      <div className="flex gap-2">
        {(['none', 'bearer', 'basic'] as const).map((t) => (
          <button key={t} onClick={() => onChange({ ...auth, type: t })}
            className={`px-3 py-1.5 text-xs rounded-full border capitalize transition-colors ${auth.type === t ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30'}`}>
            {t === 'bearer' ? 'Bearer Token' : t}
          </button>
        ))}
      </div>
      {auth.type === 'bearer' && (
        <input value={auth.token ?? ''} onChange={(e) => onChange({ ...auth, token: e.target.value })} placeholder="Token"
          className="w-full text-xs bg-surface border border-outline-variant/20 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
      )}
      {auth.type === 'basic' && (
        <div className="space-y-2">
          <input value={auth.username ?? ''} onChange={(e) => onChange({ ...auth, username: e.target.value })} placeholder="Username"
            className="w-full text-xs bg-surface border border-outline-variant/20 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
          <input type="password" value={auth.password ?? ''} onChange={(e) => onChange({ ...auth, password: e.target.value })} placeholder="Password"
            className="w-full text-xs bg-surface border border-outline-variant/20 rounded-lg px-3 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/50" />
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
      <div className="flex-shrink-0">
        <span className="text-xs font-semibold text-on-surface">{label}</span>
        <p className="text-[10px] text-on-surface-variant mt-0.5">{description}</p>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={'// JavaScript\npm.environment.set(\'token\', pm.response.json().access_token)'}
        className="flex-1 min-h-[80px] font-mono text-xs bg-surface border border-outline-variant/20 rounded-lg px-3 py-2 text-on-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-on-surface-variant/40"
      />
    </div>
  )
}
