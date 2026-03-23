import { useState, useEffect, useRef } from 'react'

export type Provider = 'bitbucket' | 'github'

interface RepoAlias { from: string; to: string }

const ALIAS_KEY = 'repo-search.aliases'

function applyAlias(repo: string, aliases: RepoAlias[]): string {
  return aliases.find((a) => a.from.toLowerCase() === repo.toLowerCase())?.to ?? repo
}

interface SearchResult {
  repo: string
  path: string
  line: number | null
  fragment: string
  link: string
  branch: string
}

interface AuthInfo {
  authenticated: boolean
  username: string | null
  workspace: string | null
  org: string | null
}

const PROVIDERS: { id: Provider; name: string; icon: string }[] = [
  { id: 'bitbucket', name: 'Bitbucket', icon: 'hub' },
  { id: 'github', name: 'GitHub', icon: 'code_blocks' },
]

const SUGGESTIONS = ['TODO', 'FIXME', 'console.log', 'deprecated', 'throw new', 'catch (', 'password', 'authentication']

const MAX_HISTORY = 10

// ── Syntax highlighting ────────────────────────────────────────────────────

type TokenType = 'keyword' | 'string' | 'number' | 'comment' | 'plain'
interface Token { type: TokenType; text: string }

const KEYWORDS = new Set([
  'import','export','from','const','let','var','function','class','return','if','else',
  'for','while','switch','case','break','new','this','super','extends','interface','type',
  'enum','async','await','try','catch','finally','throw','typeof','null','undefined',
  'true','false','public','private','protected','static','abstract','readonly',
  'def','print','yield','with','using','namespace','string','int','bool','void',
])

const SYNTAX_EXTS = new Set(['ts','tsx','js','jsx','py','cs','java','go','rb','php','kt','swift','rs','cpp','c','h'])

function tokenize(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < code.length) {
    if ((code[i] === '/' && code[i + 1] === '/') || code[i] === '#') {
      tokens.push({ type: 'comment', text: code.slice(i) }); break
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const q = code[i]; let j = i + 1
      while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++ }
      tokens.push({ type: 'string', text: code.slice(i, j + 1) }); i = j + 1; continue
    }
    if (/\d/.test(code[i]) && (i === 0 || /\W/.test(code[i - 1]))) {
      let j = i
      while (j < code.length && /[\d.]/.test(code[j])) j++
      tokens.push({ type: 'number', text: code.slice(i, j) }); i = j; continue
    }
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i
      while (j < code.length && /[\w$]/.test(code[j])) j++
      const word = code.slice(i, j)
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'plain', text: word }); i = j; continue
    }
    const last = tokens[tokens.length - 1]
    if (last?.type === 'plain') last.text += code[i]
    else tokens.push({ type: 'plain', text: code[i] })
    i++
  }
  return tokens
}

function SyntaxHighlight({ code, ext }: { code: string; ext: string }): JSX.Element {
  if (!SYNTAX_EXTS.has(ext)) return <span className="text-on-surface">{code}</span>
  const tokens = tokenize(code)
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={
          t.type === 'keyword' ? 'text-[#c792ea]' :
          t.type === 'string'  ? 'text-[#c3e88d]' :
          t.type === 'number'  ? 'text-[#f78c6c]' :
          t.type === 'comment' ? 'text-on-surface-variant/55 italic' :
          'text-on-surface'
        }>{t.text}</span>
      ))}
    </>
  )
}

// ── Path breadcrumb ────────────────────────────────────────────────────────

function PathBreadcrumb({ path, branch }: { path: string; branch: string }): JSX.Element {
  const parts = path.split('/')
  return (
    <div className="flex items-center gap-0.5 flex-wrap min-w-0">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-0.5 min-w-0">
          {i > 0 && <span className="text-on-surface-variant/25 text-[10px] flex-shrink-0">/</span>}
          <span className={`text-[10px] font-mono truncate ${
            i === parts.length - 1 ? 'text-on-surface-variant' : 'text-on-surface-variant/45'
          }`}>{part}</span>
        </span>
      ))}
      <span className="text-[10px] text-on-surface-variant/30 ml-1.5 flex-shrink-0">@ {branch}</span>
    </div>
  )
}

// ── Result card ────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: SearchResult }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const fileName = result.path.split('/').pop() ?? result.path
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  const copySnippet = (): void => {
    navigator.clipboard.writeText(result.fragment).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/5 hover:border-primary/20 transition-all group">
      {/* Header */}
      <div className="px-4 py-2.5 bg-surface-container flex items-center justify-between border-b border-outline-variant/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-secondary flex-shrink-0" style={{ fontSize: '15px' }}>description</span>
          <span className="text-sm font-semibold text-on-surface truncate">{fileName}</span>
          {result.line != null && (
            <span className="text-[10px] text-on-surface-variant/50 flex-shrink-0 font-mono">:{result.line}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copySnippet}
            className="flex items-center gap-1 text-[10px] text-on-surface-variant hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={() => window.open(result.link, '_blank')}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-secondary transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
          >
            Abrir
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>open_in_new</span>
          </button>
        </div>
      </div>

      {/* Code snippet */}
      <div className="px-4 py-2.5 bg-surface-container-lowest font-mono text-xs leading-relaxed">
        <div className="flex gap-3 bg-primary/8 border-l-2 border-primary px-2 py-1.5 rounded-r">
          {result.line != null && (
            <span className="w-6 text-right select-none text-primary/50 flex-shrink-0 text-[10px] pt-px">{result.line}</span>
          )}
          <span className="break-all">
            <SyntaxHighlight code={result.fragment || '(match)'} ext={ext} />
          </span>
        </div>
      </div>

      {/* Path breadcrumb */}
      <div className="px-4 py-1.5 border-t border-outline-variant/5">
        <PathBreadcrumb path={result.path} branch={result.branch} />
      </div>
    </div>
  )
}

// ── Repo group ─────────────────────────────────────────────────────────────

function RepoGroup({ repo, results, defaultOpen }: { repo: string; results: SearchResult[]; defaultOpen: boolean }): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-outline-variant/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface-container hover:bg-surface-container-high transition-colors text-left"
      >
        <span
          className="material-symbols-outlined text-on-surface-variant transition-transform duration-200 flex-shrink-0"
          style={{ fontSize: '16px', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          expand_more
        </span>
        <span className="material-symbols-outlined text-secondary flex-shrink-0" style={{ fontSize: '16px' }}>folder_open</span>
        <span className="text-sm font-bold text-on-surface flex-1 truncate">{repo}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
          {results.length} {results.length === 1 ? 'match' : 'matches'}
        </span>
      </button>
      {open && (
        <div className="bg-surface-container-lowest/30 px-3 py-2 space-y-2">
          {results.map((result, i) => (
            <ResultCard key={`${result.path}-${i}`} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Login form ─────────────────────────────────────────────────────────────

function LoginForm({ provider, onLogin }: { provider: Provider; onLogin: (auth: AuthInfo) => void }): JSX.Element {
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [org, setOrg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const isValid = provider === 'bitbucket'
    ? !!username.trim() && !!token.trim() && !!workspace.trim()
    : !!token.trim()

  const handleLogin = async (): Promise<void> => {
    if (!isValid) return
    setLoading(true); setError(null)
    try {
      await window.api.invoke('repo-search:login', {
        provider, token,
        ...(provider === 'bitbucket' && { username, workspace }),
        ...(provider === 'github' && org.trim() && { org }),
      })
      const me = await window.api.invoke<AuthInfo>('repo-search:me', { provider })
      onLogin(me)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conexión fallida')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-sm">
        <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10 shadow-neon">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-secondary/10 rounded-xl">
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: '24px' }}>travel_explore</span>
            </div>
            <div>
              <h2 className="font-bold text-on-surface">{provider === 'bitbucket' ? 'Bitbucket' : 'GitHub'} Auth</h2>
              <p className="text-xs text-on-surface-variant">Conectá tu workspace</p>
            </div>
          </div>

          <div className="space-y-4">
            {provider === 'bitbucket' && (
              <>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">Username</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your-username"
                    className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">Workspace</label>
                  <input type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="my-workspace"
                    className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </>
            )}

            {provider === 'github' && (
              <div>
                <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                  Organización <span className="text-on-surface-variant font-normal normal-case">(opcional)</span>
                </label>
                <input type="text" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="my-org"
                  className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            )}

            <div>
              <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                {provider === 'bitbucket' ? 'App Password' : 'Personal Access Token'}
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'} value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••••••"
                  className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                />
                <button onClick={() => setShowToken((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {showToken ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-error text-xs bg-error-container/20 px-3 py-2 rounded-lg">
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
                {error}
              </div>
            )}

            <button onClick={handleLogin} disabled={loading || !isValid}
              className="w-full py-2.5 rounded-full text-sm font-bold text-on-primary-fixed shadow-neon-btn hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(to right, #ba9eff, #53ddfc)' }}>
              {loading ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface ProviderSnapshot {
  results: SearchResult[]
  count: number
  query: string
  error: string | null
  filterRepo: string
}

export function RepoSearch(): JSX.Element {
  const [provider, setProvider] = useState<Provider>('bitbucket')
  const [auth, setAuth] = useState<AuthInfo>({ authenticated: false, username: null, workspace: null, org: null })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterRepo, setFilterRepo] = useState('All')
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [aliases, setAliases] = useState<RepoAlias[]>([])
  const [newAliasFrom, setNewAliasFrom] = useState('')
  const [newAliasTo, setNewAliasTo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const historyContainerRef = useRef<HTMLDivElement>(null)

  // Per-provider state cache so switching tabs preserves results
  const snapshotCache = useRef<Partial<Record<Provider, ProviderSnapshot>>>({})
  const prevProvider = useRef<Provider>(provider)

  // Load auth on provider switch, save/restore per-provider state
  useEffect(() => {
    // Save current state for the provider we're leaving
    snapshotCache.current[prevProvider.current] = { results, count, query, error, filterRepo }
    prevProvider.current = provider

    // Restore cached state for the new provider (or reset to defaults)
    const cached = snapshotCache.current[provider]
    if (cached) {
      setResults(cached.results)
      setCount(cached.count)
      setQuery(cached.query)
      setError(cached.error)
      setFilterRepo(cached.filterRepo)
    } else {
      setResults([]); setCount(0); setQuery(''); setError(null); setFilterRepo('All')
    }

    window.api.invoke<AuthInfo>('repo-search:me', { provider }).then(setAuth)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  // Load aliases once on mount
  useEffect(() => {
    window.api.invoke<string | null>('settings:get', ALIAS_KEY).then((val) => {
      if (val) {
        try { setAliases(JSON.parse(val) as RepoAlias[]) } catch { /* ignore */ }
      }
    })
  }, [])

  // Global shortcut: / focuses search input
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Load search history from backend on mount
  useEffect(() => {
    window.api.invoke<string[]>('repo-search:history-get').then(setHistory).catch(() => {})
  }, [])

  // Close history dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (!historyContainerRef.current?.contains(e.target as Node)) setShowHistory(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addToHistory = (q: string): void => {
    const updated = [q, ...history.filter((h) => h !== q)].slice(0, MAX_HISTORY)
    setHistory(updated)
    void window.api.invoke('repo-search:history-save', q)
  }

  const handleSearch = async (q?: string): Promise<void> => {
    const term = (q ?? query).trim()
    if (!term) return
    setShowHistory(false)
    setLoading(true); setError(null); setResults([]); setFilterRepo('All')
    try {
      const data = await window.api.invoke<{ results: SearchResult[]; count: number }>(
        'repo-search:search', { provider, query: term }
      )
      setResults(data.results); setCount(data.count)
      addToHistory(term)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Búsqueda fallida')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.api.invoke('repo-search:logout', { provider })
    setAuth({ authenticated: false, username: null, workspace: null, org: null })
    setResults([]); setCount(0)
  }

  // Group results by repo (applying aliases so aliased repos merge into one group)
  const repoMap = new Map<string, SearchResult[]>()
  for (const r of results) {
    const displayName = applyAlias(r.repo, aliases)
    const arr = repoMap.get(displayName) ?? []
    arr.push(r)
    repoMap.set(displayName, arr)
  }
  const allRepos = Array.from(repoMap.keys())
  const filteredMap = filterRepo === 'All'
    ? repoMap
    : new Map([[filterRepo, repoMap.get(filterRepo) ?? []]])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Provider tabs */}
      <div className="px-8 py-3 border-b border-outline-variant/10 bg-surface-container flex items-center gap-2">
        {PROVIDERS.map((p) => (
          <button key={p.id} onClick={() => setProvider(p.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              provider === p.id
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-on-surface-variant hover:text-on-surface border border-transparent hover:border-outline-variant/20'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>

      {!auth.authenticated ? (
        <LoginForm provider={provider} onLogin={setAuth} />
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* Main content */}
          <section className="flex-1 flex flex-col overflow-hidden">

            {/* Search bar */}
            <div className="px-8 py-4 border-b border-outline-variant/10 bg-surface-container-low flex items-center gap-4">
              <div className="relative flex-1 max-w-2xl" ref={historyContainerRef}>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => history.length > 0 && setShowHistory(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch()
                    if (e.key === 'Escape') setShowHistory(false)
                  }}
                  placeholder="Buscar código en todos los repositorios…"
                  className="w-full bg-surface-container-highest border-none rounded-lg pl-10 pr-10 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-on-surface-variant/40 font-mono bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/20 pointer-events-none">
                  /
                </kbd>

                {/* History dropdown */}
                {showHistory && history.length > 0 && (
                  <div className="absolute top-full mt-1.5 left-0 right-0 z-20 bg-surface-container-low border border-outline-variant/15 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 border-b border-outline-variant/10 flex items-center justify-between">
                      <span>Historial</span>
                      <button
                        onClick={() => { setHistory([]); void window.api.invoke('repo-search:history-clear'); setShowHistory(false) }}
                        className="text-[10px] text-on-surface-variant hover:text-error transition-colors normal-case font-normal"
                      >
                        Limpiar
                      </button>
                    </div>
                    {history.map((h) => (
                      <button key={h}
                        onClick={() => { setQuery(h); setShowHistory(false); void handleSearch(h) }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-on-surface hover:bg-primary/5 transition-colors text-left"
                      >
                        <span className="material-symbols-outlined text-on-surface-variant/50" style={{ fontSize: '14px' }}>history</span>
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => void handleSearch()}
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-on-primary-fixed shadow-neon-btn hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                style={{ background: 'linear-gradient(to right, #ba9eff, #53ddfc)' }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
                    Buscando…
                  </span>
                ) : 'Buscar'}
              </button>
            </div>

            {/* Results area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              {error && (
                <div className="flex items-center gap-3 text-error bg-error-container/20 px-4 py-3 rounded-xl border border-error/20">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {!loading && count > 0 && (
                <h2 className="text-xl font-extrabold tracking-tight text-on-surface">
                  Resultados{' '}
                  <span className="text-on-surface-variant font-normal text-base ml-2">
                    {count} coincidencias en {allRepos.length} {allRepos.length === 1 ? 'repositorio' : 'repositorios'}
                  </span>
                </h2>
              )}

              {loading && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-primary block mb-3" style={{ fontSize: '40px' }}>travel_explore</span>
                    <p className="text-on-surface-variant text-sm">Buscando en todos los repositorios…</p>
                  </div>
                </div>
              )}

              {/* No results after search */}
              {!loading && !error && count === 0 && query && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-on-surface-variant block mb-3" style={{ fontSize: '40px' }}>search_off</span>
                    <p className="text-on-surface text-sm font-medium">Sin resultados</p>
                    <p className="text-on-surface-variant text-xs mt-1">Probá con otro término de búsqueda</p>
                  </div>
                </div>
              )}

              {/* Empty state — no search yet */}
              {!loading && !error && count === 0 && !query && (
                <div className="py-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-3">Sugerencias</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s}
                        onClick={() => { setQuery(s); void handleSearch(s) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-surface-container border border-outline-variant/15 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors font-mono"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>search</span>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Grouped results */}
              {Array.from(filteredMap.entries()).map(([repo, repoResults]) => (
                <RepoGroup
                  key={repo}
                  repo={repo}
                  results={repoResults}
                  defaultOpen={allRepos.length <= 4}
                />
              ))}
            </div>
          </section>

          {/* Sidebar */}
          <aside className="w-64 bg-surface-container-low border-l border-outline-variant/15 p-5 flex flex-col gap-5 overflow-y-auto">

            {/* Connection info */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Conectado como</h3>
              <div className="bg-surface-container rounded-xl px-3 py-2.5 border border-outline-variant/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-secondary flex-shrink-0" style={{ boxShadow: '0 0 6px #53ddfc' }} />
                    <span className="text-sm font-medium text-on-surface truncate">{auth.username}</span>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-on-surface-variant hover:text-error transition-colors flex-shrink-0 ml-2">
                    Salir
                  </button>
                </div>
                {(auth.workspace ?? auth.org) && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>folder</span>
                    {auth.workspace ?? auth.org}
                  </div>
                )}
              </div>
            </div>

            {/* Repo filter */}
            {allRepos.length > 1 && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Filtrar por repo</h3>
                <div className="space-y-0.5">
                  {['All', ...allRepos].map((repo) => {
                    const c = repo === 'All' ? results.length : (repoMap.get(repo)?.length ?? 0)
                    return (
                      <button key={repo} onClick={() => setFilterRepo(repo)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          filterRepo === repo
                            ? 'bg-primary/10 text-primary'
                            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '13px' }}>
                            {repo === 'All' ? 'select_all' : 'folder'}
                          </span>
                          <span className="truncate">{repo === 'All' ? 'Todos' : repo}</span>
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                          filterRepo === repo ? 'bg-primary/20 text-primary' : 'bg-surface-container text-on-surface-variant'
                        }`}>{c}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Repo aliases */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Alias de repos</h3>
              <div className="space-y-1 mb-2">
                {aliases.length === 0 && (
                  <p className="text-[10px] text-on-surface-variant/50 px-1">Sin alias definidos.</p>
                )}
                {aliases.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-surface-container rounded-lg px-2 py-1.5">
                    <span className="text-[10px] font-mono text-on-surface flex-1 truncate">{a.from}</span>
                    <span className="material-symbols-outlined text-on-surface-variant/40 flex-shrink-0" style={{ fontSize: '11px' }}>arrow_forward</span>
                    <span className="text-[10px] font-mono text-primary flex-1 truncate">{a.to}</span>
                    <button
                      onClick={() => {
                        const updated = aliases.filter((_, j) => j !== i)
                        setAliases(updated)
                        void window.api.invoke('settings:set', ALIAS_KEY, JSON.stringify(updated))
                      }}
                      className="text-on-surface-variant hover:text-error transition-colors flex-shrink-0"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>close</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mb-1">
                <input
                  value={newAliasFrom}
                  onChange={(e) => setNewAliasFrom(e.target.value)}
                  placeholder="repo"
                  className="flex-1 min-w-0 bg-surface-container-highest border-none rounded-lg px-2 py-1.5 text-[11px] font-mono text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="material-symbols-outlined text-on-surface-variant/40 self-center flex-shrink-0" style={{ fontSize: '12px' }}>arrow_forward</span>
                <input
                  value={newAliasTo}
                  onChange={(e) => setNewAliasTo(e.target.value)}
                  placeholder="alias"
                  className="flex-1 min-w-0 bg-surface-container-highest border-none rounded-lg px-2 py-1.5 text-[11px] font-mono text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                disabled={!newAliasFrom.trim() || !newAliasTo.trim()}
                onClick={() => {
                  const updated = [...aliases, { from: newAliasFrom.trim(), to: newAliasTo.trim() }]
                  setAliases(updated)
                  void window.api.invoke('settings:set', ALIAS_KEY, JSON.stringify(updated))
                  setNewAliasFrom(''); setNewAliasTo('')
                }}
                className="w-full py-1.5 rounded-lg text-[11px] font-bold text-on-surface-variant border border-outline-variant/20 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Agregar alias
              </button>
            </div>

            {/* Stats */}
            {count > 0 && (
              <div className="bg-surface-container-highest rounded-2xl p-4 border border-primary/10 relative overflow-hidden mt-auto">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl mb-3 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #ba9eff, #53ddfc)', boxShadow: '0 0 20px rgba(83,221,252,0.3)' }}>
                    <span className="material-symbols-outlined text-on-primary-fixed" style={{ fontSize: '16px' }}>bar_chart</span>
                  </div>
                  <div className="text-sm font-extrabold text-on-surface">{count} resultados</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    {allRepos.length} {allRepos.length === 1 ? 'repositorio' : 'repositorios'}
                  </div>
                  {filterRepo !== 'All' && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/10 text-[10px] text-primary font-bold">
                      Filtrado: {repoMap.get(filterRepo)?.length ?? 0} mostrados
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
