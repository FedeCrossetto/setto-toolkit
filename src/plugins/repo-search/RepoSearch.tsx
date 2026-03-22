import { useState, useEffect, useRef } from 'react'

export type Provider = 'bitbucket' | 'github'

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

// ── Login form ─────────────────────────────────────────────────────────────

function LoginForm({
  provider,
  onLogin,
}: {
  provider: Provider
  onLogin: (auth: AuthInfo) => void
}): JSX.Element {
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [org, setOrg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const isValid =
    provider === 'bitbucket'
      ? !!username.trim() && !!token.trim() && !!workspace.trim()
      : !!token.trim()

  const handleLogin = async (): Promise<void> => {
    if (!isValid) return
    setLoading(true)
    setError(null)
    try {
      await window.api.invoke('repo-search:login', {
        provider,
        token,
        ...(provider === 'bitbucket' && { username, workspace }),
        ...(provider === 'github' && org.trim() && { org }),
      })
      const me = await window.api.invoke<AuthInfo>('repo-search:me', { provider })
      onLogin(me)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
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
              <h2 className="font-bold text-on-surface">
                {provider === 'bitbucket' ? 'Bitbucket' : 'GitHub'} Auth
              </h2>
              <p className="text-xs text-on-surface-variant">Connect to your workspace</p>
            </div>
          </div>

          <div className="space-y-4">
            {provider === 'bitbucket' && (
              <>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your-username"
                    className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                    Workspace
                  </label>
                  <input
                    type="text"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    placeholder="my-workspace"
                    className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </>
            )}

            {provider === 'github' && (
              <div>
                <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                  Organization{' '}
                  <span className="text-on-surface-variant font-normal normal-case">(optional — leave blank to search all)</span>
                </label>
                <input
                  type="text"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="my-org"
                  className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <div>
              <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                {provider === 'bitbucket' ? 'App Password' : 'Personal Access Token'}
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••••••"
                  className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                />
                <button
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
                >
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

            <button
              onClick={handleLogin}
              disabled={loading || !isValid}
              className="w-full py-2.5 rounded-full text-sm font-bold text-on-primary-fixed shadow-neon-btn hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(to right, #ba9eff, #53ddfc)' }}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Result card ────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: SearchResult }): JSX.Element {
  const fileName = result.path.split('/').pop() ?? result.path
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/5 hover:border-primary/20 transition-all group">
      <div className="px-4 py-3 bg-surface-container flex items-center justify-between border-b border-outline-variant/10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-secondary flex-shrink-0" style={{ fontSize: '18px' }}>description</span>
          <span className="text-sm font-semibold text-on-surface truncate">{fileName}</span>
          <span className="px-2 py-0.5 bg-surface-container-highest text-[10px] text-primary uppercase tracking-wider rounded font-bold flex-shrink-0">
            {result.repo}
          </span>
          {ext && <span className="text-[10px] text-on-surface-variant flex-shrink-0">.{ext}</span>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {result.line != null && (
            <span className="text-xs text-on-surface-variant">Line {result.line}</span>
          )}
          <button
            className="flex items-center gap-1 text-xs text-primary hover:text-secondary transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => window.open(result.link, '_blank')}
          >
            Open
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>open_in_new</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-3 bg-surface-container-lowest font-mono text-xs leading-relaxed">
        <div className="flex gap-4 bg-primary/10 border-l-2 border-primary px-2 py-1">
          {result.line != null && (
            <span className="w-8 text-right select-none text-primary flex-shrink-0">{result.line}</span>
          )}
          <span className="text-on-surface break-all">{result.fragment || '(match)'}</span>
        </div>
      </div>

      {/* Full path */}
      <div className="px-4 py-1.5 border-t border-outline-variant/5">
        <span className="text-[10px] text-on-surface-variant font-mono">{result.path}</span>
        <span className="text-[10px] text-on-surface-variant/50 ml-2">@ {result.branch}</span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function RepoSearch(): JSX.Element {
  const [provider, setProvider] = useState<Provider>('bitbucket')
  const [auth, setAuth] = useState<AuthInfo>({ authenticated: false, username: null, workspace: null, org: null })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterRepo, setFilterRepo] = useState('All')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reload auth state when switching provider
  useEffect(() => {
    const init = async (): Promise<void> => {
      const me = await window.api.invoke<AuthInfo>('repo-search:me', { provider })
      setAuth(me)
      setResults([])
      setCount(0)
      setError(null)
      setFilterRepo('All')
    }
    init()
  }, [provider])

  const handleSearch = async (): Promise<void> => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResults([])
    setFilterRepo('All')
    try {
      const data = await window.api.invoke<{ results: SearchResult[]; count: number }>(
        'repo-search:search',
        { provider, query: query.trim() },
      )
      setResults(data.results)
      setCount(data.count)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.api.invoke('repo-search:logout', { provider })
    setAuth({ authenticated: false, username: null, workspace: null, org: null })
    setResults([])
    setCount(0)
  }

  const repos = ['All', ...Array.from(new Set(results.map((r) => r.repo)))]
  const filtered = filterRepo === 'All' ? results : results.filter((r) => r.repo === filterRepo)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Provider tabs */}
      <div className="px-8 py-3 border-b border-outline-variant/10 bg-surface-container flex items-center gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
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
            <div className="px-8 py-5 border-b border-outline-variant/10 bg-surface-container-low flex items-center gap-4">
              <div className="relative flex-1 max-w-2xl">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant"
                  style={{ fontSize: '18px' }}
                >
                  search
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search code across all repositories..."
                  className="w-full bg-surface-container-highest border-none rounded-full pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-on-primary-fixed shadow-neon-btn hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                style={{ background: 'linear-gradient(to right, #ba9eff, #53ddfc)' }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
                    Searching...
                  </span>
                ) : 'Search'}
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
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-extrabold tracking-tight text-on-surface">
                    Results{' '}
                    <span className="text-on-surface-variant font-normal text-base ml-2">
                      {count} matches across {repos.length - 1} {repos.length === 2 ? 'repository' : 'repositories'}
                    </span>
                  </h2>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-primary block mb-3" style={{ fontSize: '40px' }}>
                      travel_explore
                    </span>
                    <p className="text-on-surface-variant text-sm">Searching across all repositories...</p>
                  </div>
                </div>
              )}

              {!loading && !error && count === 0 && query && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-on-surface-variant block mb-3" style={{ fontSize: '40px' }}>
                      search_off
                    </span>
                    <p className="text-on-surface text-sm font-medium">No results found</p>
                    <p className="text-on-surface-variant text-xs mt-1">Try a different search term</p>
                  </div>
                </div>
              )}

              {filtered.map((result, i) => (
                <ResultCard key={`${result.repo}-${result.path}-${i}`} result={result} />
              ))}
            </div>
          </section>

          {/* Sidebar */}
          <aside className="w-72 bg-surface-container-low border-l border-outline-variant/15 p-6 flex flex-col gap-6 overflow-y-auto">

            {/* Connection info */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Connected As</h3>
              <div className="bg-surface-container rounded-xl px-3 py-2.5 border border-outline-variant/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-secondary flex-shrink-0" style={{ boxShadow: '0 0 6px #53ddfc' }} />
                    <span className="text-sm font-medium text-on-surface truncate">{auth.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-on-surface-variant hover:text-error transition-colors flex-shrink-0 ml-2"
                  >
                    Logout
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
            {repos.length > 1 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Filter by Repo</h3>
                <div className="flex flex-wrap gap-2">
                  {repos.map((repo) => {
                    const repoCount = repo === 'All' ? results.length : results.filter((r) => r.repo === repo).length
                    return (
                      <button
                        key={repo}
                        onClick={() => setFilterRepo(repo)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          filterRepo === repo
                            ? 'bg-secondary/10 text-secondary border border-secondary/20'
                            : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/10 hover:border-primary/30'
                        }`}
                      >
                        {repo}
                        <span className="opacity-60">{repoCount}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Stats */}
            {count > 0 && (
              <div className="bg-surface-container-highest rounded-2xl p-5 border border-primary/10 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
                <div className="relative">
                  <div
                    className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #ba9eff, #53ddfc)', boxShadow: '0 0 20px rgba(83,221,252,0.3)' }}
                  >
                    <span className="material-symbols-outlined text-on-primary-fixed" style={{ fontSize: '18px' }}>bar_chart</span>
                  </div>
                  <div className="text-sm font-extrabold text-on-surface">{count} matches</div>
                  <div className="text-xs text-on-surface-variant mt-1">across {repos.length - 1} repos</div>
                  <div className="mt-4 pt-4 border-t border-outline-variant/10 text-[10px] text-primary font-bold">
                    {filterRepo !== 'All' ? `Filtered: ${filtered.length} shown` : 'All results shown'}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
