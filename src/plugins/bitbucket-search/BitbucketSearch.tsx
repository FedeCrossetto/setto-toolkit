import { useState, useEffect, useRef } from 'react'

interface SearchResult {
  repo: string
  path: string
  line: number | null
  fragment: string
  link: string
  branch: string
}

interface SearchState {
  results: SearchResult[]
  count: number
  loading: boolean
  error: string | null
}

interface AuthState {
  authenticated: boolean
  username: string | null
}

function LoginForm({
  onLogin
}: {
  onLogin: (auth: AuthState) => void
}): JSX.Element {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const handleLogin = async (): Promise<void> => {
    if (!username || !token) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.invoke<{ ok: boolean; username: string }>('bitbucket:login', { username, token })
      onLogin({ authenticated: true, username: result.username })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
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
              <h2 className="font-bold text-on-surface">Bitbucket Auth</h2>
              <p className="text-xs text-on-surface-variant">Connect to your workspace</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">Username</label>
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
                API Token / App Password
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
              disabled={loading || !username || !token}
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

function ResultCard({ result }: { result: SearchResult }): JSX.Element {
  const fileName = result.path.split('/').pop() ?? result.path
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/5 hover:border-primary/20 transition-all group">
      {/* File header */}
      <div className="px-4 py-3 bg-surface-container flex items-center justify-between border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>description</span>
          <span className="text-sm font-semibold text-on-surface">{fileName}</span>
          <span className="px-2 py-0.5 bg-surface-container-highest text-[10px] text-primary uppercase tracking-wider rounded font-bold">
            {result.repo}
          </span>
          {ext && (
            <span className="text-[10px] text-on-surface-variant">.{ext}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {result.line != null && (
            <span className="text-xs text-on-surface-variant">Line {result.line}</span>
          )}
          <a
            href={result.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:text-secondary transition-colors opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault()
              window.open(result.link, '_blank')
            }}
          >
            Open
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>open_in_new</span>
          </a>
        </div>
      </div>

      {/* Code snippet */}
      <div className="px-4 py-3 bg-surface-container-lowest font-mono text-xs leading-relaxed">
        <div className="flex gap-4 bg-primary/10 border-l-2 border-primary">
          {result.line != null && (
            <span className="w-8 text-right select-none text-primary flex-shrink-0">{result.line}</span>
          )}
          <span className="text-on-surface break-all">{result.fragment || '(match)'}</span>
        </div>
      </div>
    </div>
  )
}

export function BitbucketSearch(): JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ authenticated: false, username: null })
  const [workspace, setWorkspace] = useState('wigos-dev')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchState>({ results: [], count: 0, loading: false, error: null })
  const [filterRepo, setFilterRepo] = useState('All')
  const inputRef = useRef<HTMLInputElement>(null)

  // Check saved auth on mount
  useEffect(() => {
    const init = async (): Promise<void> => {
      const me = await window.api.invoke<AuthState>('bitbucket:me')
      setAuth(me)
      const savedWorkspace = await window.api.invoke<string | null>('settings:get', 'bitbucket.workspace')
      if (savedWorkspace) setWorkspace(savedWorkspace)
    }
    init()
  }, [])

  if (!auth.authenticated) {
    return <LoginForm onLogin={setAuth} />
  }

  const repos = ['All', ...Array.from(new Set(search.results.map((r) => r.repo)))]
  const filtered = filterRepo === 'All' ? search.results : search.results.filter((r) => r.repo === filterRepo)

  const handleSearch = async (): Promise<void> => {
    if (!query.trim()) return
    setSearch({ results: [], count: 0, loading: true, error: null })
    setFilterRepo('All')
    try {
      const data = await window.api.invoke<{ results: SearchResult[]; count: number }>(
        'bitbucket:search',
        { query: query.trim(), workspace }
      )
      setSearch({ ...data, loading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed'
      setSearch({ results: [], count: 0, loading: false, error: msg })
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.api.invoke('bitbucket:logout')
    setAuth({ authenticated: false, username: null })
    setSearch({ results: [], count: 0, loading: false, error: null })
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <section className="flex-1 flex flex-col overflow-hidden">
        {/* Search bar */}
        <div className="px-8 py-5 border-b border-outline-variant/10 bg-surface-container-low flex items-center gap-4">
          <div className="relative flex-1 max-w-2xl">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>
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

          <div className="relative">
            <input
              type="text"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-xs text-on-surface w-36 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="workspace"
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={search.loading || !query.trim()}
            className="px-5 py-2.5 rounded-full text-sm font-bold text-on-primary-fixed shadow-neon-btn hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            style={{ background: 'linear-gradient(to right, #ba9eff, #53ddfc)' }}
          >
            {search.loading ? (
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
                Searching...
              </span>
            ) : 'Search'}
          </button>
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto p-8 space-y-4">
          {search.error && (
            <div className="flex items-center gap-3 text-error bg-error-container/20 px-4 py-3 rounded-xl border border-error/20">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
              <span className="text-sm">{search.error}</span>
            </div>
          )}

          {!search.loading && search.count > 0 && (
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-extrabold tracking-tight text-on-surface">
                Results{' '}
                <span className="text-on-surface-variant font-normal text-base ml-2">
                  {search.count} matches across {repos.length - 1} {repos.length === 2 ? 'repository' : 'repositories'}
                </span>
              </h2>
            </div>
          )}

          {search.loading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <span className="material-symbols-outlined text-primary block mb-3" style={{ fontSize: '40px' }}>
                  travel_explore
                </span>
                <p className="text-on-surface-variant text-sm">Searching across all repositories...</p>
              </div>
            </div>
          )}

          {!search.loading && !search.error && search.count === 0 && query && (
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

      {/* Right sidebar */}
      <aside className="w-72 bg-surface-container-low border-l border-outline-variant/15 p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Auth info */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Connected As</h3>
          <div className="flex items-center justify-between bg-surface-container rounded-xl px-3 py-2.5 border border-outline-variant/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-secondary" style={{ boxShadow: '0 0 6px #53ddfc' }} />
              <span className="text-sm font-medium text-on-surface">{auth.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-on-surface-variant hover:text-error transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Filter by repo */}
        {repos.length > 1 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Filter by Repo</h3>
            <div className="flex flex-wrap gap-2">
              {repos.map((repo) => (
                <button
                  key={repo}
                  onClick={() => setFilterRepo(repo)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filterRepo === repo
                      ? 'bg-secondary/10 text-secondary border border-secondary/20'
                      : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/10 hover:border-primary/30'
                  }`}
                >
                  {repo}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {search.count > 0 && (
          <div className="bg-surface-container-highest rounded-2xl p-5 border border-primary/10 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
            <div className="relative">
              <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ba9eff, #53ddfc)', boxShadow: '0 0 20px rgba(83,221,252,0.3)' }}>
                <span className="material-symbols-outlined text-on-primary-fixed" style={{ fontSize: '18px' }}>bar_chart</span>
              </div>
              <div className="text-sm font-extrabold text-on-surface">{search.count} matches</div>
              <div className="text-xs text-on-surface-variant mt-1">across {repos.length - 1} repos</div>
              <div className="mt-4 pt-4 border-t border-outline-variant/10 text-[10px] text-primary font-bold">
                {filterRepo !== 'All' && `Filtered: ${filtered.length} shown`}
                {filterRepo === 'All' && 'All results shown'}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
