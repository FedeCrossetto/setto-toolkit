import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

// Injected at build time from .env — allow end-users to skip manual setup.
declare const __GITHUB_CLIENT_ID__: string
declare const __GITLAB_CLIENT_ID__: string

export type Provider = 'bitbucket' | 'github' | 'gitlab'

export interface SearchResult {
  repo: string
  path: string
  line: number | null
  fragment: string
  link: string
  branch: string
}

export interface AuthInfo {
  authenticated: boolean
  username: string | null
  workspace: string | null
  org: string | null
  picture: string | null
}

const BITBUCKET_API = 'https://api.bitbucket.org/2.0'
const GITHUB_API = 'https://api.github.com'
const GITLAB_API = 'https://gitlab.com/api/v4'

function settingKey(provider: Provider, field: string): string {
  return `repo-search.${provider}.${field}`
}

// ── Bitbucket types ────────────────────────────────────────────────────────

interface BitbucketLine {
  line?: number
  content?: string
  text?: string
  segments?: Array<{ text?: string; match?: boolean }>
}

interface BitbucketContentMatch {
  lines?: BitbucketLine[]
}

interface BitbucketFileRef {
  path?: string | string[] | { path?: string }
  commit?: {
    repository?: { slug?: string; links?: { self?: { href?: string } } }
    branch?: { name?: string; slug?: string }
  }
}

interface BitbucketSearchValue {
  file?: BitbucketFileRef
  content_matches?: BitbucketContentMatch[]
  path_matches?: unknown[]
}

interface BitbucketSearchResponse {
  values?: BitbucketSearchValue[]
  next?: string
}

// ── GitHub types ───────────────────────────────────────────────────────────

interface GitHubTextMatch {
  fragment: string
}

interface GitHubRepository {
  name: string
  full_name: string
  default_branch?: string
}

interface GitHubSearchItem {
  name: string
  path: string
  html_url: string
  repository: GitHubRepository
  text_matches?: GitHubTextMatch[]
}

interface GitHubSearchResponse {
  total_count?: number
  incomplete_results?: boolean
  items?: GitHubSearchItem[]
  message?: string
}

// ── Bitbucket helpers ──────────────────────────────────────────────────────

/** Returns true when the token should be sent as a Bearer token (Workspace/Repo HTTP Access Tokens). */
function isBitbucketBearerToken(token: string): boolean {
  // Workspace and Repository HTTP Access Tokens start with ATCTT
  return token.startsWith('ATCTT')
}

async function bitbucketFetch(url: string, username: string, token: string): Promise<Record<string, unknown>> {
  const authHeader = isBitbucketBearerToken(token)
    ? `Bearer ${token}`
    : 'Basic ' + Buffer.from(`${username}:${token}`).toString('base64')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: authHeader,
    },
  })

  const text = await response.text()
  let json: Record<string, unknown> = {}
  try {
    if (text.trim()) json = JSON.parse(text) as Record<string, unknown>
  } catch {
    // body is not JSON — use status text as message
  }

  if (!response.ok) {
    const msg =
      ((json.error as Record<string, unknown> | undefined)?.message as string | undefined) ??
      `Error ${response.status}: ${response.statusText || 'Request failed'}`
    throw new Error(msg)
  }
  return json
}

function getRepoSlug(repo: { slug?: string; links?: { self?: { href?: string } } }): string {
  if (repo.slug) return repo.slug
  const href = repo.links?.self?.href
  if (href) {
    const match = href.match(/\/repositories\/[^/]+\/([^/?]+)/)
    if (match) return match[1]
  }
  return 'unknown'
}

function parseBitbucketPath(raw: BitbucketFileRef['path']): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.join('/')
  if (raw && typeof raw === 'object' && 'path' in raw && typeof raw.path === 'string') return raw.path
  return ''
}

async function bitbucketSearch(
  username: string,
  token: string,
  workspace: string,
  query: string,
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const base = `${BITBUCKET_API}/workspaces/${encodeURIComponent(workspace)}/search/code`
  let nextUrl: string | null =
    `${base}?search_query=${encodeURIComponent(query)}&fields=%2Bvalues.file.commit.repository`
  const maxPages = 20
  let page = 0

  while (nextUrl && page < maxPages) {
    const data = (await bitbucketFetch(nextUrl, username, token)) as BitbucketSearchResponse
    const values = data.values ?? []

    for (const item of values) {
      const file = item.file ?? {}
      const commit = file.commit ?? {}
      const repo = (commit.repository ?? {}) as { slug?: string; links?: { self?: { href?: string } } }
      const repoSlug = getRepoSlug(repo)
      const filePath = parseBitbucketPath(file.path)
      const branch = commit.branch?.name ?? commit.branch?.slug ?? 'main'
      const link = `https://bitbucket.org/${workspace}/${repoSlug}/src/${encodeURIComponent(branch)}/${filePath}`

      for (const m of item.content_matches ?? []) {
        for (const line of m.lines ?? []) {
          // Skip context lines — only keep lines with at least one matched segment
          if (line.segments && !line.segments.some((s) => s.match)) continue
          const lineNum = typeof line.line === 'number' ? line.line : null
          let fragment = line.content ?? line.text ?? ''
          if (!fragment && line.segments) {
            fragment = line.segments.map((s) => s?.text ?? '').join('')
          }
          results.push({
            repo: repoSlug,
            path: filePath,
            line: lineNum,
            fragment: fragment.trim(),
            link: lineNum != null ? `${link}#lines-${lineNum}` : link,
            branch,
          })
        }
      }

      if ((item.content_matches ?? []).length === 0 && (item.path_matches ?? []).length > 0) {
        results.push({ repo: repoSlug, path: filePath, line: null, fragment: '(path match)', link, branch })
      }
    }

    const rawNext = (data.next as string | undefined) ?? null
    nextUrl = rawNext && rawNext.startsWith(BITBUCKET_API) ? rawNext : null
    page++
  }

  return results
}

// ── GitHub helpers ─────────────────────────────────────────────────────────

const CODE_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|py|cs|java|go|rb|php|kt|swift|rs|cpp|cc|c|h|hpp|css|scss|sass|html|vue|svelte)$/i
const BATCH = 20  // parallel file fetches

/** Fallback: directly search file contents via raw GitHub URLs (bypasses search index delays). */
async function githubTreeSearch(token: string, query: string, repoFullName: string): Promise<SearchResult[]> {
  const [owner, repo] = repoFullName.split('/')
  const queryLower = query.toLowerCase()

  // 1. Get repo default branch
  const repoInfo = await githubFetch<{ default_branch?: string }>(
    `${GITHUB_API}/repos/${owner}/${repo}`,
    token
  )
  const branch = repoInfo.default_branch ?? 'main'

  // 2. Get full file tree
  const treeData = await githubFetch<{ tree?: { path: string; type: string }[]; truncated?: boolean }>(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token
  )
  const files = (treeData.tree ?? []).filter((f) => f.type === 'blob' && CODE_EXTS.test(f.path))

  const results: SearchResult[] = []

  // 3. Fetch file contents in parallel batches via raw.githubusercontent.com
  for (let i = 0; i < files.length && results.length < 200; i += BATCH) {
    const batch = files.slice(i, i + BATCH)
    const contents = await Promise.all(
      batch.map(async (f) => {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`
        try {
          const res = await fetch(rawUrl, { headers: { Authorization: `Bearer ${token}` } })
          return res.ok ? { path: f.path, text: await res.text() } : null
        } catch { return null }
      })
    )
    for (const file of contents) {
      if (!file || !file.text.toLowerCase().includes(queryLower)) continue
      const lines = file.text.split('\n')
      for (let ln = 0; ln < lines.length && results.length < 200; ln++) {
        if (!lines[ln].toLowerCase().includes(queryLower)) continue
        const from = Math.max(0, ln - 1)
        const to   = Math.min(lines.length - 1, ln + 2)
        results.push({
          repo,
          path: file.path,
          line: ln + 1,
          fragment: lines.slice(from, to + 1).join('\n').trim(),
          link: `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}#L${ln + 1}`,
          branch,
        })
      }
    }
  }

  return results
}

async function githubFetch<T>(url: string, token: string, textMatch = false): Promise<T> {
  const accept = textMatch
    ? 'application/vnd.github.text-match+json'
    : 'application/vnd.github+json'
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const json = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    // Throw a proper Error so Electron IPC serializes it correctly to the renderer
    const msg = (json as { message?: string }).message ?? `GitHub API error ${response.status}`
    throw new Error(msg)
  }
  return json
}

async function githubSearch(token: string, query: string, org?: string | null, username?: string | null, repoFullName?: string | null): Promise<SearchResult[]> {
  const validUsername = username && username !== 'unknown' ? username : null

  // Priority: specific repo > org > user > all accessible
  const q = repoFullName
    ? `${encodeURIComponent(query)}+repo:${repoFullName}`
    : org
      ? `${encodeURIComponent(query)}+org:${org}`
      : validUsername
        ? `${encodeURIComponent(query)}+user:${validUsername}`
        : encodeURIComponent(query)

  const url = `${GITHUB_API}/search/code?q=${q}&per_page=100`
  const data = await githubFetch<GitHubSearchResponse>(url, token, true)

  // When code search returns 0 for a specific repo, it's usually an indexing delay (recently pushed).
  // Fall back to direct file-tree search which doesn't depend on GitHub's search index.
  if (data.total_count === 0 && repoFullName) {
    return githubTreeSearch(token, query, repoFullName)
  }

  const results: SearchResult[] = []

  for (const item of data.items ?? []) {
    const repo = item.repository.name
    const branch = item.repository.default_branch ?? 'main'
    const matches = item.text_matches ?? []

    if (matches.length > 0) {
      for (const match of matches) {
        results.push({
          repo,
          path: item.path,
          line: null,
          fragment: match.fragment.trim(),
          link: item.html_url,
          branch,
        })
      }
    } else {
      results.push({ repo, path: item.path, line: null, fragment: '(match)', link: item.html_url, branch })
    }
  }

  return results
}

// ── GitLab types ───────────────────────────────────────────────────────────

interface GitLabProject {
  id: number
  path_with_namespace: string
  default_branch?: string
  web_url: string
}

interface GitLabBlobResult {
  project_id: number
  path: string
  ref: string
  startline: number
  data: string
}

interface GitLabSearchResponse {
  results?: GitLabBlobResult[]
}

// ── GitLab helpers ─────────────────────────────────────────────────────────

async function gitlabFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' },
  })
  if (!response.ok) {
    const err = (await response.json()) as { message?: string }
    throw new Error(err.message ?? `GitLab API error: ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function gitlabSearch(token: string, query: string, group?: string | null): Promise<SearchResult[]> {
  const results: SearchResult[] = []

  // Fetch accessible projects (first 100 in the group or user-visible)
  const projectsUrl = group
    ? `${GITLAB_API}/groups/${encodeURIComponent(group)}/projects?per_page=100&include_subgroups=true`
    : `${GITLAB_API}/projects?membership=true&per_page=100`
  const projects = await gitlabFetch<GitLabProject[]>(projectsUrl, token)

  // Search blobs in each project (GitLab requires project-scoped blob search)
  for (const project of projects) {
    const searchUrl = `${GITLAB_API}/projects/${project.id}/search?scope=blobs&search=${encodeURIComponent(query)}&per_page=20`
    let blobs: GitLabBlobResult[] = []
    try {
      const raw = await gitlabFetch<GitLabBlobResult[] | GitLabSearchResponse>(searchUrl, token)
      blobs = Array.isArray(raw) ? raw : (raw as GitLabSearchResponse).results ?? []
    } catch {
      continue // skip projects where search fails (e.g. archived, no permissions)
    }

    const branch = project.default_branch ?? 'main'
    for (const blob of blobs) {
      const link = `${project.web_url}/-/blob/${encodeURIComponent(blob.ref)}/${blob.path}#L${blob.startline}`
      results.push({
        repo: project.path_with_namespace,
        path: blob.path,
        line: blob.startline,
        fragment: blob.data.trim(),
        link,
        branch,
      })
    }
  }

  return results
}

// ── IPC handlers ───────────────────────────────────────────────────────────

const HISTORY_FILE = 'repo-search-history.json'
const MAX_HISTORY  = 10

export const handlers: PluginHandlers = {
  pluginId: 'repo-search',

  register(ipcMain: IpcMain, { settings, db }: CoreServices): void {

    // ── GitHub OAuth Device Flow ───────────────────────────────────────────
    // Starts the flow: returns the user_code to display and the device_code
    // to poll with. The renderer is responsible for polling at the given interval.

    ipcMain.handle('repo-search:github-oauth-start', async () => {
      const clientId = settings.get('repo-search.github.client_id') || __GITHUB_CLIENT_ID__
      if (!clientId) throw new Error('NO_CLIENT_ID')

      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scope: 'repo read:org' }),
      })
      if (!response.ok) throw new Error(`GitHub error: ${response.status}`)

      const data = (await response.json()) as {
        device_code: string
        user_code: string
        verification_uri: string
        expires_in: number
        interval: number
        error?: string
        error_description?: string
      }
      if (data.error) throw new Error(data.error_description ?? data.error)

      return {
        device_code:      data.device_code,
        user_code:        data.user_code,
        verification_uri: data.verification_uri,
        expires_in:       data.expires_in,
        interval:         data.interval,
      }
    })

    // Polls once for the access token. Returns status so the renderer
    // can decide whether to keep polling or stop.
    ipcMain.handle('repo-search:github-oauth-poll', async (_event, { device_code }: { device_code: string }) => {
      const clientId = settings.get('repo-search.github.client_id') || __GITHUB_CLIENT_ID__
      if (!clientId) throw new Error('NO_CLIENT_ID')

      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:  clientId,
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      if (!response.ok) throw new Error(`GitHub error: ${response.status}`)

      const data = (await response.json()) as {
        access_token?: string
        error?: string
        error_description?: string
        interval?: number
      }

      if (data.access_token) {
        // Fetch the authenticated user (including avatar) and persist the token
        const user = await githubFetch<{ login?: string; avatar_url?: string }>(`${GITHUB_API}/user`, data.access_token)
        const username = user.login ?? 'unknown'
        const picture  = user.avatar_url ?? null
        settings.set(settingKey('github', 'token'), data.access_token)
        settings.set(settingKey('github', 'username'), username)
        if (picture) settings.set(settingKey('github', 'picture'), picture)
        return { status: 'authorized' as const, username }
      }
      if (data.error === 'authorization_pending') return { status: 'pending' as const }
      if (data.error === 'slow_down')             return { status: 'slow_down' as const, interval: data.interval }
      if (data.error === 'expired_token')         return { status: 'expired' as const }
      if (data.error === 'access_denied')         return { status: 'denied' as const }
      return { status: 'error' as const, message: data.error_description ?? data.error ?? 'Unknown error' }
    })


    ipcMain.handle('repo-search:login', async (_event, payload: {
      provider: Provider
      token: string
      username?: string
      workspace?: string
      org?: string
    }) => {
      const { provider, token } = payload
      if (!token) throw new Error('Token is required')

      if (provider === 'bitbucket') {
        const { username, workspace } = payload
        const isBearer = isBitbucketBearerToken(token)
        if (!isBearer && !username) throw new Error('Username is required for Bitbucket App Passwords')
        if (!workspace) throw new Error('Workspace is required for Bitbucket')

        // Validate by hitting the workspace endpoint — only requires repository:read scope.
        // /user requires account:read which may not be granted on repository-only tokens.
        let resolvedUsername = username ?? ''
        let picture: string | null = null
        try {
          const userData = await bitbucketFetch(`${BITBUCKET_API}/user`, username ?? '', token) as {
            username?: string; links?: { avatar?: { href?: string } }
          }
          resolvedUsername = userData.username ?? username ?? ''
          picture = userData.links?.avatar?.href ?? null
        } catch {
          // /user failed (e.g. account scope not granted) — validate via repositories listing instead
          await bitbucketFetch(`${BITBUCKET_API}/repositories/${encodeURIComponent(workspace)}?pagelen=1`, username ?? '', token)
          resolvedUsername = username ?? workspace
        }

        settings.set(settingKey(provider, 'username'), resolvedUsername)
        settings.set(settingKey(provider, 'token'), token)
        settings.set(settingKey(provider, 'workspace'), workspace)
        if (picture) settings.set(settingKey(provider, 'picture'), picture)
        return { ok: true, username: resolvedUsername }

      } else if (provider === 'github') {
        const { org } = payload
        const data = await githubFetch<{ login?: string; avatar_url?: string }>(`${GITHUB_API}/user`, token)
        const username = data.login ?? 'unknown'
        const picture = data.avatar_url ?? null
        settings.set(settingKey(provider, 'token'), token)
        settings.set(settingKey(provider, 'username'), username)
        if (picture) settings.set(settingKey(provider, 'picture'), picture)
        if (org) settings.set(settingKey(provider, 'org'), org)
        return { ok: true, username }

      } else if (provider === 'gitlab') {
        const { org } = payload
        const data = await gitlabFetch<{ username?: string; avatar_url?: string }>(`${GITLAB_API}/user`, token)
        const username = data.username ?? 'unknown'
        const picture = data.avatar_url ?? null
        settings.set(settingKey(provider, 'token'), token)
        settings.set(settingKey(provider, 'username'), username)
        if (picture) settings.set(settingKey(provider, 'picture'), picture)
        if (org) settings.set(settingKey(provider, 'org'), org)
        return { ok: true, username }

      } else {
        throw new Error(`Unknown provider: ${String(provider)}`)
      }
    })

    ipcMain.handle('repo-search:logout', (_event, { provider }: { provider: Provider }) => {
      settings.delete(settingKey(provider, 'username'))
      settings.delete(settingKey(provider, 'token'))
      settings.delete(settingKey(provider, 'workspace'))
      settings.delete(settingKey(provider, 'org'))
      settings.delete(settingKey(provider, 'picture'))
      return { ok: true }
    })

    ipcMain.handle('repo-search:me', (_event, { provider }: { provider: Provider }): AuthInfo => {
      const token = settings.get(settingKey(provider, 'token'))
      return {
        authenticated: !!token,
        username: settings.get(settingKey(provider, 'username')),
        workspace: settings.get(settingKey(provider, 'workspace')),
        org: settings.get(settingKey(provider, 'org')),
        picture: settings.get(settingKey(provider, 'picture')),
      }
    })

    // ── GitLab OAuth Device Flow ───────────────────────────────────────────
    ipcMain.handle('repo-search:gitlab-oauth-start', async () => {
      const clientId = settings.get('repo-search.gitlab.client_id') || __GITLAB_CLIENT_ID__
      if (!clientId) throw new Error('NO_CLIENT_ID')

      const response = await fetch('https://gitlab.com/oauth/authorize_device', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, scope: 'read_api' }),
      })
      if (!response.ok) throw new Error(`GitLab error: ${response.status}`)

      const data = (await response.json()) as {
        device_code: string
        user_code: string
        verification_uri: string
        expires_in: number
        interval: number
        error?: string
        error_description?: string
      }
      if (data.error) throw new Error(data.error_description ?? data.error)

      return {
        device_code:      data.device_code,
        user_code:        data.user_code,
        verification_uri: data.verification_uri,
        expires_in:       data.expires_in,
        interval:         data.interval,
      }
    })

    ipcMain.handle('repo-search:gitlab-oauth-poll', async (_event, { device_code }: { device_code: string }) => {
      const clientId = settings.get('repo-search.gitlab.client_id') || __GITLAB_CLIENT_ID__
      if (!clientId) throw new Error('NO_CLIENT_ID')

      const response = await fetch('https://gitlab.com/oauth/token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id:  clientId,
          device_code,
        }),
      })

      const data = (await response.json()) as {
        access_token?: string
        error?: string
        error_description?: string
        interval?: number
      }

      if (data.access_token) {
        const user = await gitlabFetch<{ username?: string; avatar_url?: string }>(
          `${GITLAB_API}/user`, data.access_token
        )
        const username = user.username ?? 'unknown'
        const picture  = user.avatar_url ?? null
        settings.set(settingKey('gitlab', 'token'), data.access_token)
        settings.set(settingKey('gitlab', 'username'), username)
        if (picture) settings.set(settingKey('gitlab', 'picture'), picture)
        return { status: 'authorized' as const, username }
      }
      if (data.error === 'authorization_pending') return { status: 'pending'    as const }
      if (data.error === 'slow_down')             return { status: 'slow_down'  as const, interval: data.interval }
      if (data.error === 'expired_token')         return { status: 'expired'    as const }
      if (data.error === 'access_denied')         return { status: 'denied'     as const }
      return { status: 'error' as const, message: data.error_description ?? data.error ?? 'Unknown error' }
    })

    // Returns whether an OAuth client ID is available for a provider
    // (either compiled in via .env or manually saved in settings).
    // Used by the UI to skip the "enter Client ID" setup screen.
    ipcMain.handle('repo-search:oauth-configured', (_event, { provider }: { provider: 'github' | 'gitlab' }): boolean => {
      const fromSettings = settings.get(`repo-search.${provider}.client_id`)
      const builtIn = provider === 'github' ? __GITHUB_CLIENT_ID__ : __GITLAB_CLIENT_ID__
      return !!(fromSettings || builtIn)
    })

    // Returns the list of repos owned by the authenticated GitHub user
    ipcMain.handle('repo-search:github-repos', async () => {
      const token = settings.get(settingKey('github', 'token'))
      if (!token) throw new Error('NOT_AUTHENTICATED')

      interface GHRepo {
        name: string; full_name: string; description: string | null
        language: string | null; private: boolean; updated_at: string
        stargazers_count: number
      }
      const repos = await githubFetch<GHRepo[]>(
        `${GITHUB_API}/user/repos?per_page=100&type=owner&sort=updated`,
        token
      )
      return repos.map(r => ({
        name: r.name, full_name: r.full_name, description: r.description,
        language: r.language, private: r.private, updated_at: r.updated_at,
        stars: r.stargazers_count,
      }))
    })

    ipcMain.handle('repo-search:search', async (_event, { provider, query, repo }: { provider: Provider; query: string; repo?: string }) => {
      const token = settings.get(settingKey(provider, 'token'))
      if (!token) throw new Error('NOT_AUTHENTICATED')

      let results: SearchResult[] = []

      if (provider === 'bitbucket') {
        const username = settings.get(settingKey(provider, 'username'))
        const workspace = settings.get(settingKey(provider, 'workspace'))
        if (!username || !workspace) throw new Error('NOT_AUTHENTICATED')
        results = await bitbucketSearch(username, token, workspace, query)

      } else if (provider === 'github') {
        const org      = settings.get(settingKey(provider, 'org'))
        const username = settings.get(settingKey(provider, 'username'))
        results = await githubSearch(token, query, org, username, repo)

      } else if (provider === 'gitlab') {
        const org = settings.get(settingKey(provider, 'org'))
        results = await gitlabSearch(token, query, org)
      }

      return { results, count: results.length }
    })

    // ── Search history (persisted in userData, not localStorage) ───────────

    ipcMain.handle('repo-search:history-get', () => {
      return db.readJSON<string[]>(HISTORY_FILE) ?? []
    })

    ipcMain.handle('repo-search:history-save', (_event, query: string) => {
      if (typeof query !== 'string' || !query.trim()) return { ok: true }
      const history = db.readJSON<string[]>(HISTORY_FILE) ?? []
      const deduped = [query, ...history.filter((q) => q !== query)].slice(0, MAX_HISTORY)
      db.writeJSON(HISTORY_FILE, deduped)
      return { ok: true }
    })

    ipcMain.handle('repo-search:history-clear', () => {
      db.writeJSON(HISTORY_FILE, [])
      return { ok: true }
    })
  },
}
