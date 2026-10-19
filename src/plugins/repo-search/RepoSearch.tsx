import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import {
  ArrowRight, BarChart2, Building2, Check, ChevronDown, CircleAlert,
  Copy, ExternalLink, Eye, EyeOff, FileText, Folder, FolderOpen,
  History, KeyRound, LayoutGrid, Lock, Loader2, Search, SearchX,
  User, Wrench, X,
} from 'lucide-react'

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
    if (/\d/.test(code[i]!) && (i === 0 || /\W/.test(code[i - 1]!))) {
      let j = i
      while (j < code.length && /[\d.]/.test(code[j]!)) j++
      tokens.push({ type: 'number', text: code.slice(i, j) }); i = j; continue
    }
    if (/[a-zA-Z_$]/.test(code[i]!)) {
      let j = i
      while (j < code.length && /[\w$]/.test(code[j]!)) j++
      const word = code.slice(i, j)
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'plain', text: word }); i = j; continue
    }
    const last = tokens[tokens.length - 1]
    if (last?.type === 'plain') last.text += code[i]
    else tokens.push({ type: 'plain', text: code[i]! })
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
          t.type === 'match'   ? 'bg-warning/30 text-inherit rounded-sm px-px' :
          t.type === 'keyword' ? 'text-primary' :
          t.type === 'string'  ? 'text-success' :
          t.type === 'number'  ? 'text-warning' :
          t.type === 'comment' ? 'text-on-surface-variant italic' :
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
          {i > 0 && <span className="text-on-surface-variant/60 t-caption shrink-0">/</span>}
          <span className={`t-caption font-mono truncate ${
            i === parts.length - 1 ? 'text-on-surface' : 'text-on-surface-variant'
          }`}>{part}</span>
        </span>
      ))}
      <span className="t-caption text-on-surface-variant/60 ml-1.5 shrink-0">@ {branch}</span>
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
    <div className="bg-surface hairline rounded-xl overflow-hidden group">
      {/* Header */}
      <div className="px-3 h-9 flex items-center justify-between hairline-b">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-on-surface-variant shrink-0" />
          <span className="t-body font-medium text-on-surface truncate">{fileName}</span>
          {result.line != null && (
            <span className="t-caption text-on-surface-variant shrink-0 font-mono">:{result.line}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copySnippet}
            className="ui-btn ui-btn-ghost ui-btn-sm gap-1!"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={() => window.open(result.link, '_blank')}
            className="ui-btn ui-btn-ghost ui-btn-sm gap-1!"
          >
            Abrir
            <ExternalLink size={12} />
          </button>
        </div>
      </div>

      {/* Code snippet */}
      <div className="px-3 py-2 font-mono t-footnote">
        <div className="flex gap-3 bg-on-surface/4 px-2 py-1.5 rounded-md">
          {result.line != null && (
            <span className="w-6 text-right select-none text-on-surface-variant/60 shrink-0 t-caption pt-px">{result.line}</span>
          )}
          <span className="break-all">
            <SyntaxHighlight code={result.fragment || '(match)'} ext={ext} highlight={query} />
          </span>
        </div>
      </div>

      {/* Path breadcrumb */}
      <div className="px-3 py-1.5 hairline-t">
        <PathBreadcrumb path={result.path} branch={result.branch} />
      </div>
    </div>
  )
}

// ── Repo group ─────────────────────────────────────────────────────────────

function RepoGroup({ repo, results, defaultOpen, query }: { repo: string; results: SearchResult[]; defaultOpen: boolean; query: string }): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="hairline rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 h-10 bg-surface hover:bg-on-surface/3 transition-colors text-left"
      >
        <ChevronDown
          size={14}
          className="text-on-surface-variant transition-transform duration-200 shrink-0"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <FolderOpen size={15} className="text-on-surface-variant shrink-0" />
        <span className="t-body font-medium text-on-surface flex-1 truncate">{repo}</span>
        <span className="t-caption tabular-nums text-on-surface-variant shrink-0">
          {results.length} {results.length === 1 ? 'coincidencia' : 'coincidencias'}
        </span>
      </button>
      {open && (
        <div className="hairline-t px-3 py-3 space-y-2">
          {results.map((result, i) => (
            <ResultCard key={`${result.path}-${i}`} result={result} query={query} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Searching loader ───────────────────────────────────────────────────────

/** Calm loader (the old mascot prop is accepted but no longer rendered — no mascots in the macOS look). */
function SearchingLoader({ label }: { label?: string; mascot?: 'panda' | 'setto-avatar' }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 select-none">
      <Loader2 size={22} className="animate-spin text-on-surface-variant" />
      <p className="t-body text-on-surface-variant">{label ?? 'Buscando…'}</p>
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
  const [showTokenHelp, setShowTokenHelp] = useState(false)

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
      setError(e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setLoading(false)
    }
  }

  const providerLabel = provider === 'bitbucket' ? 'Bitbucket' : provider === 'github' ? 'GitHub' : 'GitLab'
  const inputCls = 'ui-input w-full'
  const labelCls = 't-footnote font-medium text-on-surface-variant block mb-1.5'

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-sm">
        <div className="ui-card p-7">
          <div className="flex items-center gap-3 mb-6">
            <ProviderLogo provider={provider} size={28} />
            <div>
              <h2 className="t-headline text-on-surface">Conectar {providerLabel}</h2>
              <p className="t-footnote text-on-surface-variant">Conectá tu espacio de trabajo</p>
            </div>
          </div>

          {/* ── Credentials form (all providers) ── */}
          <div className="space-y-4">

            {/* Bitbucket: username + workspace */}
            {provider === 'bitbucket' && (
              <>
                <div>
                  <label className={labelCls}>Usuario</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="tu-usuario" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Workspace</label>
                  <input type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="mi-workspace" className={inputCls} />
                </div>
              </>
            )}

            {/* GitHub / GitLab: optional org/group */}
            {(provider === 'github' || provider === 'gitlab') && (
              <div>
                <label className={labelCls}>
                  {provider === 'gitlab' ? 'Grupo' : 'Organización'}{' '}
                  <span className="text-on-surface-variant/70 font-normal">(opcional)</span>
                </label>
                <input type="text" value={org} onChange={(e) => setOrg(e.target.value)}
                  placeholder={provider === 'gitlab' ? 'mi-grupo' : 'mi-org'} className={inputCls} />
              </div>
            )}

            {/* Token / App Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="t-footnote font-medium text-on-surface-variant">
                  {provider === 'bitbucket' ? 'App Password' : 'Token de acceso personal'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowTokenHelp((s) => !s)}
                  className="t-caption text-primary hover:underline underline-offset-2"
                >
                  {showTokenHelp ? 'Ocultar ayuda' : '¿Cómo obtenerlo?'}
                </button>
              </div>

              {showTokenHelp && (
                <div className="mb-3 bg-on-surface/4 rounded-md px-3 py-2.5 t-footnote text-on-surface-variant leading-relaxed">
                  {provider === 'github' && (
                    <ol className="flex flex-col gap-1 list-none">
                      <li><span className="text-primary font-semibold">1.</span> github.com → tu avatar → <strong>Settings</strong></li>
                      <li><span className="text-primary font-semibold">2.</span> Scroll abajo → <strong>Developer settings</strong></li>
                      <li><span className="text-primary font-semibold">3.</span> <strong>Personal access tokens</strong> → Tokens (classic)</li>
                      <li><span className="text-primary font-semibold">4.</span> <strong>Generate new token (classic)</strong></li>
                      <li><span className="text-primary font-semibold">5.</span> Scopes: marcá <code className="bg-on-surface/10 px-1 rounded">repo</code> (+ <code className="bg-on-surface/10 px-1 rounded">read:org</code> si filtrás por org)</li>
                      <li><span className="text-primary font-semibold">6.</span> Copiá el token — no se vuelve a mostrar</li>
                    </ol>
                  )}
                  {provider === 'gitlab' && (
                    <ol className="flex flex-col gap-1 list-none">
                      <li><span className="text-primary font-semibold">1.</span> gitlab.com → tu avatar → <strong>Preferences</strong></li>
                      <li><span className="text-primary font-semibold">2.</span> <strong>Access Tokens</strong> → Add new token</li>
                      <li><span className="text-primary font-semibold">3.</span> Scopes: <code className="bg-on-surface/10 px-1 rounded">read_api</code>, <code className="bg-on-surface/10 px-1 rounded">read_repository</code></li>
                      <li><span className="text-primary font-semibold">4.</span> Copiá el token — no se vuelve a mostrar</li>
                    </ol>
                  )}
                  {provider === 'bitbucket' && (
                    <ol className="flex flex-col gap-1 list-none">
                      <li><span className="text-primary font-semibold">1.</span> bitbucket.org → tu avatar → <strong>Personal settings</strong></li>
                      <li><span className="text-primary font-semibold">2.</span> <strong>App passwords</strong> → Create app password</li>
                      <li><span className="text-primary font-semibold">3.</span> Permissions: <code className="bg-on-surface/10 px-1 rounded">Repositories — Read</code></li>
                      <li><span className="text-primary font-semibold">4.</span> Copiá la contraseña generada</li>
                    </ol>
                  )}
                </div>
              )}

              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'} value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••••••"
                  className={inputCls + ' pr-10'}
                />
                <button onClick={() => setShowToken((s) => !s)} aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-error t-footnote bg-error/10 px-3 py-2 rounded-md">
                <CircleAlert size={14} />
                {error}
              </div>
            )}

            <button onClick={handleLogin} disabled={loading || !isValid}
              className="ui-btn ui-btn-primary w-full">
              {loading ? 'Conectando…' : 'Conectar'}
            </button>
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
  const personalRepos = repos.filter((r) => r.full_name.split('/')[0]!.toLowerCase() === (username ?? '').toLowerCase())
  const orgRepos = repos.filter((r) => r.full_name.split('/')[0]!.toLowerCase() !== (username ?? '').toLowerCase())

  // Group org repos by org name
  const orgGroups = orgRepos.reduce<Record<string, GitHubRepo[]>>((acc, r) => {
    const org = r.full_name.split('/')[0]! // full_name is always "owner/repo"
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
      className={`fl-row w-[calc(100%-12px)]! mx-1.5 t-body ${selectedRepo === repo.full_name ? 'nav-active' : ''}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: repo.language ? (LANG_COLORS[repo.language] ?? 'rgb(var(--c-on-surface-variant) / 0.6)') : 'rgb(var(--c-on-surface-variant) / 0.35)' }}
      />
      <span className="truncate">{repo.name}</span>
      {repo.private && (
        <Lock size={10} className="shrink-0 text-on-surface-variant/60" />
      )}
    </button>
  )

  return (
    <div className="w-60 hairline-r fl-pane flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 hairline-b">
        <p className="fl-section px-0! mb-1.5">
          Repositorios
        </p>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          aria-label="Filtrar repositorios"
          className="fl-search w-full outline-hidden t-footnote text-on-surface"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={16} className="animate-spin text-on-surface-variant" />
          </div>
        ) : (
          <>
            {/* "All personal repos" option */}
            <button
              onClick={() => onSelect(null)}
              className={`fl-row w-[calc(100%-12px)]! mx-1.5 t-body ${selectedRepo === null ? 'nav-active' : ''}`}
            >
              <User size={13} className="shrink-0 text-on-surface-variant" />
              <span className="font-medium truncate">Mis repos</span>
              <span className="ml-auto t-caption text-on-surface-variant shrink-0">{personalRepos.length}</span>
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
                    <Building2 size={12} className="text-on-surface-variant" />
                    <span className="fl-section px-0! truncate">{org}</span>
                  </div>
                  {visibleOrgRepos.map((repo) => (
                    <RepoButton key={repo.full_name} repo={repo} />
                  ))}
                </div>
              )
            })}

            {repos.length > 0 && repos.filter(matchesFilter).length === 0 && filter && (
              <p className="t-caption text-on-surface-variant text-center py-4">Sin coincidencias</p>
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

    window.api.invoke<AuthInfo>('repo-search:me', { provider }).then((meAuth) => {
      setAuth(meAuth)
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
      <div className="px-4 h-[42px] hairline-b flex items-center justify-center shrink-0">
        <SegmentedControl
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
          value={provider}
          onChange={(v) => setProvider(v)}
        />
      </div>

      {provider === 'gitlab' ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center flex flex-col items-center gap-4 p-8">
            <span className="icon-tile w-12 h-12 rounded-xl"><Wrench size={22} /></span>
            <div>
              <p className="t-headline text-on-surface">GitLab: próximamente</p>
              <p className="t-footnote text-on-surface-variant mt-1 max-w-xs">La integración con GitLab va a estar disponible pronto.</p>
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
              <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-lg bg-warning/10 t-body text-on-surface">
                <KeyRound size={16} className="shrink-0 text-warning mt-0.5" />
                <span className="flex-1">
                  <span className="font-semibold">Falta el token del proveedor.</span>
                  {' '}Tu sesión de Google te identifica, pero para buscar en{' '}
                  {provider === 'github' ? 'GitHub' : 'Bitbucket'}{' '}
                  necesitás un{' '}
                  {provider === 'bitbucket' ? 'App Password' : 'token de acceso personal (PAT)'}.
                  <button
                    onClick={handleLogout}
                    className="ui-btn ui-btn-outline ui-btn-sm ml-2"
                  >
                    Conectar con token
                  </button>
                </span>
              </div>
            )}

            {/* Search bar */}
            <div className="px-6 py-3 hairline-b flex items-center gap-3">
              <div className="relative flex-1 max-w-2xl" ref={historyContainerRef}>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
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
                  aria-label="Buscar código"
                  className="ui-input w-full rounded-full! pl-9! pr-10!"
                />
                <kbd className="kbd-chip absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  /
                </kbd>

                {/* History dropdown */}
                <AnimatePresence>
                  {showHistory && history.length > 0 && (
                    <motion.div
                      className="ui-menu absolute top-full mt-1.5 left-0 right-0 z-20 overflow-hidden"
                      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.1, ease: 'easeOut' }}
                    >
                      <div className="fl-section justify-between px-2! pt-1 pb-1">
                        <span>Búsquedas recientes</span>
                        <button
                          onClick={() => { setHistory([]); void window.api.invoke('repo-search:history-clear'); setShowHistory(false) }}
                          className="t-caption text-on-surface-variant hover:text-on-surface transition-colors font-normal"
                        >
                          Borrar
                        </button>
                      </div>
                      {history.map((h) => (
                        <button key={h}
                          onClick={() => { setQuery(h); setShowHistory(false); void handleSearch(h) }}
                          className="ui-menu-item w-full text-left"
                        >
                          <History size={14} className="opacity-60" />
                          {h}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => void handleSearch()}
                disabled={loading || !query.trim()}
                className="ui-btn ui-btn-primary shrink-0"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Buscando…
                  </span>
                ) : 'Buscar'}
              </button>
            </div>

            {/* Results area */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {error && error !== 'NOT_AUTHENTICATED' && (
                <div className="flex items-center gap-3 text-on-surface bg-error/10 px-4 py-3 rounded-lg">
                  <CircleAlert size={16} className="text-error shrink-0" />
                  <span className="t-body">{error}</span>
                </div>
              )}

              {!loading && count > 0 && (
                <h2 className="t-title3 text-on-surface">
                  Resultados{' '}
                  <span className="text-on-surface-variant font-normal t-body ml-2">
                    {count} coincidencias en {allRepos.length} {allRepos.length === 1 ? 'repositorio' : 'repositorios'}
                  </span>
                </h2>
              )}

              {loading && <SearchingLoader label={loadingLabel} mascot={mascot} />}

              {/* No results after search */}
              {!loading && !error && count === 0 && query && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center max-w-xs">
                    <SearchX size={36} strokeWidth={1.4} className="text-on-surface-variant/50 block mb-3 mx-auto" />
                    <p className="text-on-surface t-headline">Sin resultados para "{query}"</p>
                    {provider === 'github' && (
                      <p className="text-on-surface-variant t-footnote mt-2">
                        {selectedRepo
                          ? <>Se buscó en <span className="text-on-surface font-medium">{selectedRepo}</span>. Revisá que el contenido exista en ese repositorio.</>
                          : <>Se buscó en todos tus repos. Revisá el término o elegí un repositorio puntual.</>
                        }
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state — no search yet */}
              {!loading && !error && count === 0 && !query && (
                <div className="py-6">
                  <p className="fl-section px-0! mb-2">Sugerencias</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s}
                        onClick={() => { setQuery(s); void handleSearch(s) }}
                        className="ui-btn ui-btn-outline ui-btn-sm font-mono font-normal!"
                      >
                        <Search size={12} />
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
          <aside className="w-64 fl-pane hairline-l p-4 flex flex-col gap-5 overflow-y-auto">

            {/* Connection info */}
            <div>
              <h3 className="fl-section px-0! mb-1.5">Conectado como</h3>
              <div className="ui-card shadow-none px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {auth.picture ? (
                      <img
                        src={auth.picture}
                        alt={auth.username ?? ''}
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full shrink-0 hairline"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-on-surface/8 flex items-center justify-center shrink-0">
                        <User size={14} className="text-on-surface-variant" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="t-body font-medium text-on-surface truncate">{auth.username}</div>
                      {(auth.workspace ?? auth.org) && (
                        <div className="flex items-center gap-1 t-caption text-on-surface-variant mt-0.5">
                          <Folder size={11} />
                          <span className="truncate">{auth.workspace ?? auth.org}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={handleLogout} className="ui-btn ui-btn-ghost ui-btn-sm shrink-0">
                    Salir
                  </button>
                </div>
              </div>
            </div>

            {/* Search scope indicator */}
            {provider === 'github' && auth.authenticated && (
              <div>
                <h3 className="fl-section px-0! mb-1.5">Buscando en</h3>
                <div className="ui-card shadow-none px-3 py-2 t-footnote text-on-surface-variant flex items-center gap-2">
                  <FolderOpen size={14} className="shrink-0 text-on-surface-variant" />
                  <span className="truncate">
                    {selectedRepo
                      ? <>
                          {selectedRepo.split('/')[0] !== auth.username && (
                            <span className="text-on-surface-variant mr-1">{selectedRepo.split('/')[0]}/</span>
                          )}
                          <span className="text-on-surface font-medium">{selectedRepo.split('/')[1]}</span>
                        </>
                      : <><span className="text-on-surface font-medium">Mis repos</span> <span className="text-on-surface-variant">({auth.username})</span></>
                    }
                  </span>
                </div>
              </div>
            )}

            {/* Repo filter */}
            {allRepos.length > 1 && (
              <div>
                <h3 className="fl-section px-0! mb-1.5">Filtrar por repo</h3>
                <div className="space-y-0.5">
                  {['All', ...allRepos].map((repo) => {
                    const c = repo === 'All' ? results.length : (repoMap.get(repo)?.length ?? 0)
                    return (
                      <button key={repo} onClick={() => setFilterRepo(repo)}
                        className={`fl-row justify-between t-body ${filterRepo === repo ? 'nav-active' : ''}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {repo === 'All' ? <LayoutGrid size={13} className="shrink-0 text-on-surface-variant" /> : <Folder size={13} className="shrink-0 text-on-surface-variant" />}
                          <span className="truncate">{repo === 'All' ? 'Todos' : repo}</span>
                        </span>
                        <span className="t-caption tabular-nums text-on-surface-variant shrink-0 ml-2">{c}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Repo aliases */}
            <div>
              <h3 className="fl-section px-0! mb-1.5">Alias de repos</h3>
              <div className="space-y-1 mb-2">
                {aliases.length === 0 && (
                  <p className="t-caption text-on-surface-variant px-1">No hay alias definidos.</p>
                )}
                {aliases.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-surface hairline rounded-lg px-2 py-1.5">
                    <span className="t-caption font-mono text-on-surface flex-1 truncate">{a.from}</span>
                    <ArrowRight size={11} className="text-on-surface-variant shrink-0" />
                    <span className="t-caption font-mono text-primary flex-1 truncate">{a.to}</span>
                    <button
                      onClick={() => {
                        const updated = aliases.filter((_, j) => j !== i)
                        setAliases(updated)
                        void window.api.invoke('settings:set', ALIAS_KEY, JSON.stringify(updated))
                      }}
                      title="Quitar alias" aria-label="Quitar alias"
                      className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mb-1">
                <input
                  value={newAliasFrom}
                  onChange={(e) => setNewAliasFrom(e.target.value)}
                  placeholder="repo"
                  className="ui-input flex-1 min-w-0 t-footnote font-mono"
                />
                <ArrowRight size={12} className="text-on-surface-variant self-center shrink-0" />
                <input
                  value={newAliasTo}
                  onChange={(e) => setNewAliasTo(e.target.value)}
                  placeholder="alias"
                  aria-label="Alias"
                  className="ui-input flex-1 min-w-0 t-footnote font-mono"
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
                className="ui-btn ui-btn-outline ui-btn-sm w-full"
              >
                + Agregar alias
              </button>
            </div>

            {/* Stats */}
            {count > 0 && (
              <div className="ui-card shadow-none p-4 mt-auto">
                <div>
                  <BarChart2 size={16} className="text-on-surface-variant mb-2" />
                  <div className="t-headline text-on-surface tabular-nums">{count} resultados</div>
                  <div className="t-footnote text-on-surface-variant mt-0.5">
                    {allRepos.length} {allRepos.length === 1 ? 'repositorio' : 'repositorios'}
                  </div>
                  {filterRepo !== 'All' && (
                    <div className="mt-3 pt-3 hairline-t t-caption text-on-surface-variant">
                      Filtrado: se muestran {repoMap.get(filterRepo)?.length ?? 0}
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
