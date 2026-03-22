import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

export type Provider = 'bitbucket' | 'github'

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
}

const BITBUCKET_API = 'https://api.bitbucket.org/2.0'
const GITHUB_API = 'https://api.github.com'

function settingKey(provider: Provider, field: string): string {
  return `repo-search.${provider}.${field}`
}

// ── Bitbucket types ────────────────────────────────────────────────────────

interface BitbucketLine {
  line?: number
  content?: string
  text?: string
  segments?: Array<{ text?: string }>
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
  items?: GitHubSearchItem[]
  message?: string
}

// ── Bitbucket helpers ──────────────────────────────────────────────────────

async function bitbucketFetch(url: string, username: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${username}:${token}`).toString('base64'),
    },
  })
  const json = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    const msg =
      ((json.error as Record<string, unknown> | undefined)?.message as string | undefined) ??
      `Request failed: ${response.status}`
    throw { status: response.status, message: msg }
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

async function githubFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.text-match+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  const json = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw { status: response.status, message: (json as { message?: string }).message ?? `Request failed: ${response.status}` }
  }
  return json
}

async function githubSearch(token: string, query: string, org?: string | null): Promise<SearchResult[]> {
  const q = org
    ? `${encodeURIComponent(query)}+org:${encodeURIComponent(org)}`
    : encodeURIComponent(query)
  const url = `${GITHUB_API}/search/code?q=${q}&per_page=100`
  const data = await githubFetch<GitHubSearchResponse>(url, token)
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

// ── IPC handlers ───────────────────────────────────────────────────────────

export const handlers: PluginHandlers = {
  pluginId: 'repo-search',

  register(ipcMain: IpcMain, { settings }: CoreServices): void {

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
        if (!username) throw new Error('Username is required for Bitbucket')
        if (!workspace) throw new Error('Workspace is required for Bitbucket')
        const data = await bitbucketFetch(`${BITBUCKET_API}/user`, username, token) as { username?: string }
        settings.set(settingKey(provider, 'username'), data.username ?? username)
        settings.set(settingKey(provider, 'token'), token)
        settings.set(settingKey(provider, 'workspace'), workspace)
        return { ok: true, username: data.username ?? username }

      } else if (provider === 'github') {
        const { org } = payload
        const data = await githubFetch<{ login?: string }>(`${GITHUB_API}/user`, token)
        const username = data.login ?? 'unknown'
        settings.set(settingKey(provider, 'token'), token)
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
      return { ok: true }
    })

    ipcMain.handle('repo-search:me', (_event, { provider }: { provider: Provider }): AuthInfo => {
      const token = settings.get(settingKey(provider, 'token'))
      return {
        authenticated: !!token,
        username: settings.get(settingKey(provider, 'username')),
        workspace: settings.get(settingKey(provider, 'workspace')),
        org: settings.get(settingKey(provider, 'org')),
      }
    })

    ipcMain.handle('repo-search:search', async (_event, { provider, query }: { provider: Provider; query: string }) => {
      const token = settings.get(settingKey(provider, 'token'))
      if (!token) throw new Error('NOT_AUTHENTICATED')

      let results: SearchResult[] = []

      if (provider === 'bitbucket') {
        const username = settings.get(settingKey(provider, 'username'))
        const workspace = settings.get(settingKey(provider, 'workspace'))
        if (!username || !workspace) throw new Error('NOT_AUTHENTICATED')
        results = await bitbucketSearch(username, token, workspace, query)

      } else if (provider === 'github') {
        const org = settings.get(settingKey(provider, 'org'))
        results = await githubSearch(token, query, org)
      }

      return { results, count: results.length }
    })
  },
}
