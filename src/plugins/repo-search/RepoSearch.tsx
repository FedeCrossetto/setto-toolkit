import { useState, useEffect, useRef } from 'react'
import { GoogleAuthWidget } from '../../core/components/GoogleAuthWidget'

export type Provider = 'bitbucket' | 'github' | 'gitlab'

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
  picture: string | null
}

interface GitHubRepo {
  name: string
  full_name: string
  description: string | null
  language: string | null
  private: boolean
  stars: number
}

const PROVIDERS: { id: Provider; name: string }[] = [
  { id: 'bitbucket', name: 'Bitbucket' },
  { id: 'github',    name: 'GitHub'    },
  { id: 'gitlab',    name: 'GitLab'    },
]

const SUGGESTIONS = ['TODO', 'FIXME', 'console.log', 'deprecated', 'throw new', 'catch (', 'password', 'authentication']

const MAX_HISTORY = 10

// ── Syntax highlighting ────────────────────────────────────────────────────

type TokenType = 'keyword' | 'string' | 'number' | 'comment' | 'plain' | 'match'
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

/** Splits a token's text into sub-tokens, marking occurrences of `hl` as 'match'. */
function splitToken(token: Token, hl: string): Token[] {
  if (!hl) return [token]
  const lower = token.text.toLowerCase()
  const hlLow = hl.toLowerCase()
  if (!lower.includes(hlLow)) return [token]
  const out: Token[] = []
  let i = 0
  while (i < token.text.length) {
    const idx = lower.indexOf(hlLow, i)
    if (idx === -1) { out.push({ type: token.type, text: token.text.slice(i) }); break }
    if (idx > i) out.push({ type: token.type, text: token.text.slice(i, idx) })
    out.push({ type: 'match', text: token.text.slice(idx, idx + hl.length) })
    i = idx + hl.length
  }
  return out
}

function SyntaxHighlight({ code, ext, highlight = '' }: { code: string; ext: string; highlight?: string }): JSX.Element {
  const baseTokens = SYNTAX_EXTS.has(ext) ? tokenize(code) : [{ type: 'plain' as TokenType, text: code }]
  const tokens = highlight
    ? baseTokens.flatMap((t) => splitToken(t, highlight))
    : baseTokens
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={
          t.type === 'match'   ? 'bg-yellow-400/50 text-inherit rounded-sm px-px ring-1 ring-yellow-400/60' :
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

function ResultCard({ result, query = '' }: { result: SearchResult; query?: string }): JSX.Element {
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
            <SyntaxHighlight code={result.fragment || '(match)'} ext={ext} highlight={query} />
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

function RepoGroup({ repo, results, defaultOpen, query }: { repo: string; results: SearchResult[]; defaultOpen: boolean; query: string }): JSX.Element {
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
            <ResultCard key={`${result.path}-${i}`} result={result} query={query} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Searching loader ───────────────────────────────────────────────────────

function SearchingLoader({ label, mascot }: { label?: string; mascot?: 'panda' | 'setto-avatar' }): JSX.Element {
  const imgSrc = mascot === 'setto-avatar' ? '/setto-avatar/setto-avatar-search.png' : '/panda-search.png'
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 select-none">
      {/* Mascot with glow halo */}
      <div className="relative">
        {/* Radial glow behind the mascot */}
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-40 scale-75"
          style={{ background: 'radial-gradient(circle, #ba9eff 0%, #53ddfc 60%, transparent 100%)' }}
        />
        <img
          src={imgSrc}
          alt="Buscando…"
          className="relative w-36 h-36 object-contain"
          style={{ animation: 'pandaFloat 2.4s ease-in-out infinite' }}
        />
      </div>

      {/* Label + dots */}
      <div className="text-center space-y-2">
        <p className="text-sm font-semibold text-on-surface">{label ?? 'Buscando…'}</p>
        <div className="flex items-center justify-center gap-1.5">
          {[0, 160, 320].map((delay, i) => (
            <span
              key={i}
              className="block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: 'linear-gradient(90deg, #ba9eff, #53ddfc)', animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pandaFloat {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50%       { transform: translateY(-10px) rotate(1deg); }
        }
      `}</style>
    </div>
  )
}

// ── Login form ─────────────────────────────────────────────────────────────
// ── Provider logos (inline SVG) ────────────────────────────────────────────

function ProviderLogo({ provider, size = 28 }: { provider: Provider; size?: number }): JSX.Element {
  if (provider === 'github') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>
    )
  }
  if (provider === 'bitbucket') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path fill="#2684FF" d="M.778 1.213a.768.768 0 00-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 00.77-.646l3.27-20.03a.768.768 0 00-.768-.891zm11.54 13.5H11.44l-.924-4.181h8.985z"/>
      </svg>
    )
  }
  // GitLab
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#FC6D26" d="M4.845.904a.9.9 0 00-.864.607L.078 13.367a.6.6 0 00.217.67L12 23.095l11.705-9.058a.6.6 0 00.217-.67L20.019 1.511a.9.9 0 00-.864-.607.9.9 0 00-.864.607l-2.52 7.757H8.234L5.71 1.511A.9.9 0 004.845.904z"/>
    </svg>
  )
}

// ── Login form (all providers) ──────────────────────────────────────────────

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
        ...((provider === 'github' || provider === 'gitlab') && org.trim() && { org }),
      })
      const me = await window.api.invoke<AuthInfo>('repo-search:me', { provider })
      onLogin(me)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conexión fallida')
    } finally {
      setLoading(false)
    }
  }

  const providerLabel = provider === 'bitbucket' ? 'Bitbucket' : provider === 'github' ? 'GitHub' : 'GitLab'
  const inputCls = 'w-full bg-surface-container-highest border-none rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-sm">
        <div className="bg-surface-container-low rounded-2xl p-8 border border-outline-variant/10 shadow-neon">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-surface-container rounded-xl">
              <ProviderLogo provider={provider} size={28} />
            </div>
            <div>
              <h2 className="font-bold text-on-surface">{providerLabel} Auth</h2>
              <p className="text-xs text-on-surface-variant">Conectá tu workspace</p>
            </div>
          </div>

          {/* ── Credentials form (all providers) ── */}
          <div className="space-y-4">

            {/* Bitbucket: username + workspace */}
            {provider === 'bitbucket' && (
              <>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">Username</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your-username" className={inputCls} />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">Workspace</label>
                  <input type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="my-workspace" className={inputCls} />
                </div>
              </>
            )}

            {/* GitHub / GitLab: optional org/group */}
            {(provider === 'github' || provider === 'gitlab') && (
              <div>
                <label className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-1.5">
                  {provider === 'gitlab' ? 'Group' : 'Organization'}{' '}
                  <span className="text-on-surface-variant font-normal normal-case">(optional)</span>
                </label>
                <input type="text" value={org} onChange={(e) => setOrg(e.target.value)}
                  placeholder={provider === 'gitlab' ? 'my-group' : 'my-org'} className={inputCls} />
              </div>
            )}

            {/* Token / App Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase font-bold text-primary tracking-wider">
                  {provider === 'bitbucket' ? 'App Password' : 'Personal Access Token'}
                </label>
                <span className="text-[10px] text-on-surface-variant/50">
                  {provider === 'github' && 'Settings → Developer settings → PAT'}
                  {provider === 'gitlab' && 'Preferences → Access Tokens'}
                  {provider === 'bitbucket' && 'Personal settings → App passwords'}
                </span>
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'} value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••••••"
                  className={inputCls + ' pr-10'}
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

          {/* ── Google as alternative ── */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-col items-center gap-4">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant/40 tracking-widest">or</span>
            <div className="w-full">
              <GoogleAuthWidget
                collapsed={false}
                onSignIn={(u) => onLogin({ authenticated: true, username: u.email, workspace: null, org: null, picture: u.picture })}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

// ── GitHub repository browser panel ─────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  'C#': '#178600', Java: '#b07219', Go: '#00ADD8', Ruby: '#701516',
  Rust: '#dea584', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF',
}

function GitHubRepoPanel({
  username,
  selectedRepo,
  onSelect,
}: {
  username: string | null
  selectedRepo: string | null
  onSelect: (repo: string | null) => void
}): JSX.Element {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    window.api.invoke<GitHubRepo[]>('repo-search:github-repos')
      .then((r) => { setRepos(r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Split repos into personal (owned by logged-in user) and org repos
  const personalRepos = repos.filter((r) => r.full_name.split('/')[0].toLowerCase() === (username ?? '').toLowerCase())
  const orgRepos = repos.filter((r) => r.full_name.split('/')[0].toLowerCase() !== (username ?? '').toLowerCase())

  // Group org repos by org name
  const orgGroups = orgRepos.reduce<Record<string, GitHubRepo[]>>((acc, r) => {
    const org = r.full_name.split('/')[0]
    ;(acc[org] = acc[org] ?? []).push(r)
    return acc
  }, {})

  const matchesFilter = (r: GitHubRepo): boolean =>
    !filter || r.name.toLowerCase().includes(filter.toLowerCase()) || r.full_name.toLowerCase().includes(filter.toLowerCase())

  const RepoButton = ({ repo }: { repo: GitHubRepo }): JSX.Element => (
    <button
      key={repo.full_name}
      onClick={() => onSelect(repo.full_name)}
      title={repo.description ?? repo.full_name}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left ${
        selectedRepo === repo.full_name
          ? 'bg-primary/15 text-primary'
          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
      }`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: repo.language ? (LANG_COLORS[repo.language] ?? '#8b949e') : '#484f58' }}
      />
      <span className="truncate">{repo.name}</span>
      {repo.private && (
        <span className="material-symbols-outlined flex-shrink-0 text-[10px] text-on-surface-variant/30">lock</span>
      )}
    </button>
  )

  return (
    <div className="w-52 border-r border-outline-variant/15 bg-surface-container-low flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-outline-variant/10">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50 mb-2">
          Repositorios
        </p>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar..."
          className="w-full bg-surface-container rounded-lg px-2.5 py-1.5 text-xs text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* "All personal repos" option */}
            <button
              onClick={() => onSelect(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left ${
                selectedRepo === null
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined flex-shrink-0 text-[13px]">person</span>
              <span className="font-medium truncate">Mis repos</span>
              <span className="ml-auto text-[10px] text-on-surface-variant/40 flex-shrink-0">{personalRepos.length}</span>
            </button>

            {/* Personal repos */}
            {personalRepos.filter(matchesFilter).map((repo) => (
              <RepoButton key={repo.full_name} repo={repo} />
            ))}

            {/* Org repos grouped by org */}
            {Object.entries(orgGroups).map(([org, orgRepoList]) => {
              const visibleOrgRepos = orgRepoList.filter(matchesFilter)
              if (visibleOrgRepos.length === 0 && filter) return null
              return (
                <div key={org}>
                  {/* Org header */}
                  <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                    <span className="material-symbols-outlined text-on-surface-variant/40 text-[12px]">corporate_fare</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 truncate">{org}</span>
                  </div>
                  {visibleOrgRepos.map((repo) => (
                    <RepoButton key={repo.full_name} repo={repo} />
                  ))}
                </div>
              )
            })}

            {repos.length > 0 && repos.filter(matchesFilter).length === 0 && filter && (
              <p className="text-[10px] text-on-surface-variant/50 text-center py-4">Sin coincidencias</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

interface ProviderSnapshot {
  results: SearchResult[]
  count: number
  query: string
  error: string | null
  filterRepo: string
  selectedRepo: string | null
}

export function RepoSearch(): JSX.Element {
  const [provider, setProvider] = useState<Provider>('bitbucket')
  const [auth, setAuth] = useState<AuthInfo>({ authenticated: false, username: null, workspace: null, org: null, picture: null })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterRepo, setFilterRepo] = useState('All')
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [loadingLabel, setLoadingLabel] = useState<string | undefined>()
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [aliases, setAliases] = useState<RepoAlias[]>([])
  const [newAliasFrom, setNewAliasFrom] = useState('')
  const [newAliasTo, setNewAliasTo] = useState('')
  const [mascot, setMascot] = useState<'panda' | 'setto-avatar'>('setto-avatar')
  const inputRef = useRef<HTMLInputElement>(null)
  const historyContainerRef = useRef<HTMLDivElement>(null)

  // Per-provider state cache so switching tabs preserves results
  const snapshotCache = useRef<Partial<Record<Provider, ProviderSnapshot>>>({})
  const prevProvider = useRef<Provider>(provider)
  // Tracks providers where the user explicitly signed out — Google fallback must not re-authenticate these
  const manuallyLoggedOut = useRef<Set<Provider>>(new Set())

  // Load auth on provider switch, save/restore per-provider state
  useEffect(() => {
    // Save current state for the provider we're leaving
    snapshotCache.current[prevProvider.current] = { results, count, query, error, filterRepo, selectedRepo }
    prevProvider.current = provider

    // Restore cached state for the new provider (or reset to defaults)
    const cached = snapshotCache.current[provider]
    if (cached) {
      setResults(cached.results)
      setCount(cached.count)
      setQuery(cached.query)
      setError(cached.error)
      setFilterRepo(cached.filterRepo)
      setSelectedRepo(cached.selectedRepo)
    } else {
      setResults([]); setCount(0); setQuery(''); setError(null); setFilterRepo('All'); setSelectedRepo(null)
    }

    window.api.invoke<AuthInfo>('repo-search:me', { provider }).then(async (meAuth) => {
      if (!meAuth.authenticated && !manuallyLoggedOut.current.has(provider)) {
        // Fall back to Google session if the user signed in with Google but has no PAT for this provider.
        // Skipped if the user explicitly signed out for this provider.
        const googleUser = await window.api
          .invoke<{ email: string; name: string; picture: string } | null>('auth:google-user')
          .catch(() => null)
        if (googleUser) {
          setAuth({ authenticated: true, username: googleUser.email, workspace: null, org: null, picture: googleUser.picture })
          // Proactively signal that a provider token is still needed so the banner appears immediately
          setError('NOT_AUTHENTICATED')
          return
        }
      }
      setAuth(meAuth)
      // Clear any stale NOT_AUTHENTICATED banner when a real provider token exists
      if (meAuth.authenticated) setError(null)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  // Load aliases, search history, and mascot preference once on mount
  useEffect(() => {
    window.api.invoke<string | null>('settings:get', ALIAS_KEY).then((val) => {
      if (val) {
        try { setAliases(JSON.parse(val) as RepoAlias[]) } catch { /* ignore */ }
      }
    })
    window.api.invoke<string[]>('repo-search:history-get').then((h) => {
      if (Array.isArray(h)) setHistory(h)
    }).catch(() => { /* ignore */ })
    window.api.invoke<string | null>('settings:get', 'dashboard.mascot').then((v) => {
      if (v !== null) setMascot(v === 'panda' ? 'panda' : 'setto-avatar')
    }).catch(() => { /* ignore */ })

    const handler = (e: Event): void => {
      const val = (e as CustomEvent<string>).detail
      setMascot(val === 'panda' ? 'panda' : 'setto-avatar')
    }
    window.addEventListener('mascot-change', handler)
    return () => window.removeEventListener('mascot-change', handler)
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
    window.api.invoke('repo-search:history-save', updated).catch(() => { /* ignore */ })
  }

  const handleSearch = async (q?: string): Promise<void> => {
    const term = (q ?? query).trim()
    if (!term) return
    setShowHistory(false)
    setLoading(true); setLoadingLabel(undefined); setError(null); setResults([]); setFilterRepo('All')

    // If search takes >1.5s (tree-search fallback), show a more descriptive label
    const labelTimer = setTimeout(() => {
      if (provider === 'github' && selectedRepo)
        setLoadingLabel(`Leyendo archivos de ${selectedRepo.split('/')[1]}…`)
    }, 1500)

    try {
      const data = await window.api.invoke<{ results: SearchResult[]; count: number }>(
        'repo-search:search', {
          provider,
          query: term,
          ...(provider === 'github' && selectedRepo ? { repo: selectedRepo } : {}),
        }
      )
      setResults(data.results); setCount(data.count)
      addToHistory(term)
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      // Strip Electron's IPC wrapper prefix if present
      const msg = raw.replace(/^Error invoking remote method[^:]*: /, '')
      setError(msg === 'NOT_AUTHENTICATED' ? 'NOT_AUTHENTICATED' : msg)
    } finally {
      clearTimeout(labelTimer)
      setLoading(false)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.api.invoke('repo-search:logout', { provider })
    manuallyLoggedOut.current.add(provider)
    setAuth({ authenticated: false, username: null, workspace: null, org: null, picture: null })
    setResults([]); setCount(0); setError(null)
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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              provider === p.id
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-on-surface-variant hover:text-on-surface border border-transparent hover:border-outline-variant/20'
            }`}
          >
            <span className={provider === p.id ? '' : 'opacity-60'}>
              <ProviderLogo provider={p.id} size={15} />
            </span>
            {p.name}
          </button>
        ))}
      </div>

      {provider === 'gitlab' ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center flex flex-col items-center gap-4 p-8">
            <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center border border-outline-variant/20">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '28px' }}>construction</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">GitLab — En construcción</p>
              <p className="text-xs text-on-surface-variant mt-1 max-w-xs">La integración con GitLab estará disponible próximamente.</p>
            </div>
          </div>
        </div>
      ) : !auth.authenticated ? (
        <LoginForm provider={provider} onLogin={(auth) => {
          setAuth(auth)
          if (auth.authenticated) {
            setError(null)
            manuallyLoggedOut.current.delete(provider)
          }
        }} />
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* GitHub repo browser — left panel */}
          {provider === 'github' && (
            <GitHubRepoPanel
              username={auth.username}
              selectedRepo={selectedRepo}
              onSelect={(repo) => {
                setSelectedRepo(repo)
                setResults([]); setCount(0); setError(null)
              }}
            />
          )}

          {/* Main content */}
          <section className="flex-1 flex flex-col overflow-hidden">

            {/* No-token banner: logged in with Google but no provider PAT stored */}
            {error === 'NOT_AUTHENTICATED' && (
              <div className="mx-8 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-on-surface">
                <span className="material-symbols-outlined flex-shrink-0 text-warning mt-0.5" style={{ fontSize: '18px' }}>key_off</span>
                <span className="flex-1">
                  <span className="font-semibold text-warning">Token de proveedor requerido.</span>
                  {' '}Tu sesión Google identifica quién sos, pero para buscar en{' '}
                  {provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : 'Bitbucket'}{' '}
                  necesitás un{' '}
                  {provider === 'bitbucket' ? 'App Password' : 'Personal Access Token (PAT)'}.
                  <button
                    onClick={handleLogout}
                    className="ml-2 underline hover:no-underline font-semibold text-primary"
                  >
                    Conectar con token →
                  </button>
                </span>
              </div>
            )}

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
                  placeholder={
                    provider === 'github' && selectedRepo
                      ? `Buscar en ${selectedRepo}…`
                      : provider === 'github'
                        ? `Buscar en mis repos de GitHub…`
                        : 'Buscar código…'
                  }
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
                        onClick={() => { setHistory([]); saveHistory([]); setShowHistory(false) }}
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
              {error && error !== 'NOT_AUTHENTICATED' && (
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

              {loading && <SearchingLoader label={loadingLabel} mascot={mascot} />}

              {/* No results after search */}
              {!loading && !error && count === 0 && query && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center max-w-xs">
                    <span className="material-symbols-outlined text-on-surface-variant block mb-3" style={{ fontSize: '40px' }}>search_off</span>
                    <p className="text-on-surface text-sm font-medium">Sin resultados para "{query}"</p>
                    {provider === 'github' && (
                      <p className="text-on-surface-variant text-xs mt-2 leading-relaxed">
                        {selectedRepo
                          ? <>Se buscó en <span className="text-primary font-medium">{selectedRepo}</span>. Verificá que el contenido exista en ese repositorio.</>
                          : <>Se buscó en todos tus repos. Verificá el término o seleccioná un repositorio específico.</>
                        }
                      </p>
                    )}
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
                  query={query}
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {auth.picture ? (
                      <img
                        src={auth.picture}
                        alt={auth.username ?? ''}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-white/10"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-secondary" style={{ fontSize: '14px' }}>person</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-on-surface truncate">{auth.username}</div>
                      {(auth.workspace ?? auth.org) && (
                        <div className="flex items-center gap-1 text-[10px] text-on-surface-variant mt-0.5">
                          <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>folder</span>
                          <span className="truncate">{auth.workspace ?? auth.org}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={handleLogout} className="text-xs text-on-surface-variant hover:text-error transition-colors flex-shrink-0">
                    Salir
                  </button>
                </div>
              </div>
            </div>

            {/* Search scope indicator */}
            {provider === 'github' && auth.authenticated && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Buscando en</h3>
                <div className="bg-surface-container rounded-xl px-3 py-2 border border-outline-variant/10 text-xs text-on-surface-variant flex items-center gap-2">
                  <span className="material-symbols-outlined flex-shrink-0 text-primary" style={{ fontSize: '14px' }}>
                    {selectedRepo ? 'folder_open' : 'folder_special'}
                  </span>
                  <span className="truncate">
                    {selectedRepo
                      ? <>
                          {selectedRepo.split('/')[0] !== auth.username && (
                            <span className="text-on-surface-variant/50 mr-1">{selectedRepo.split('/')[0]}/</span>
                          )}
                          <span className="text-on-surface font-medium">{selectedRepo.split('/')[1]}</span>
                        </>
                      : <><span className="text-on-surface font-medium">Mis repos</span> <span className="text-on-surface-variant/50">({auth.username})</span></>
                    }
                  </span>
                </div>
              </div>
            )}

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
