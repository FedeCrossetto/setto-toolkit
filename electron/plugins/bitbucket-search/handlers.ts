import type { PluginHandlers, CoreServices } from '../../core/types'
import type { IpcMain } from 'electron'

const BITBUCKET_API = 'https://api.bitbucket.org/2.0'

interface BitbucketAuth {
  username: string
  password: string
}

interface SearchResultValue {
  file?: {
    path?: string | string[] | { path?: string }
    commit?: {
      repository?: Record<string, unknown>
      branch?: { name?: string; slug?: string }
    }
  }
  content_matches?: Array<{
    lines?: Array<{
      line?: number
      content?: string
      text?: string
      segments?: Array<{ text?: string }>
    }>
  }>
  path_matches?: unknown[]
}

interface SearchResponse {
  values?: SearchResultValue[]
  next?: string
}

async function bitbucketFetch(url: string, auth: BitbucketAuth): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
    }
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

function getRepoSlug(repo: Record<string, unknown>): string {
  let slug = repo.slug as string | undefined
  if (!slug && repo.links && typeof repo.links === 'object') {
    const links = repo.links as Record<string, { href?: string }>
    const self = links.self
    if (self && typeof self.href === 'string') {
      const match = self.href.match(/\/repositories\/[^/]+\/([^/?]+)/)
      if (match) slug = match[1]
    }
  }
  return slug ?? 'unknown'
}

export const handlers: PluginHandlers = {
  pluginId: 'bitbucket-search',

  register(ipcMain: IpcMain, { settings }: CoreServices): void {
    ipcMain.handle('bitbucket:login', async (_event, { username, token }: { username: string; token: string }) => {
      if (!username || !token) {
        throw new Error('Username and token are required')
      }
      await bitbucketFetch(`${BITBUCKET_API}/user`, { username, password: token })
      settings.set('bitbucket.username', username)
      settings.set('bitbucket.token', token)
      return { ok: true, username }
    })

    ipcMain.handle('bitbucket:logout', (_event) => {
      settings.delete('bitbucket.username')
      settings.delete('bitbucket.token')
      return { ok: true }
    })

    ipcMain.handle('bitbucket:me', (_event) => {
      const username = settings.get('bitbucket.username')
      const token = settings.get('bitbucket.token')
      return { authenticated: !!(username && token), username: username ?? null }
    })

    ipcMain.handle('bitbucket:search', async (_event, { query, workspace }: { query: string; workspace: string }) => {
      const username = settings.get('bitbucket.username')
      const token = settings.get('bitbucket.token')
      if (!username || !token) throw new Error('NOT_AUTHENTICATED')

      const auth: BitbucketAuth = { username, password: token }
      const results: {
        repo: string
        path: string
        line: number | null
        fragment: string
        link: string
        branch: string
      }[] = []

      let nextUrl: string | null =
        `${BITBUCKET_API}/workspaces/${workspace}/search/code?search_query=${encodeURIComponent(query)}&fields=%2Bvalues.file.commit.repository`
      const maxPages = 20
      let pageCount = 0

      while (nextUrl && pageCount < maxPages) {
        const data = (await bitbucketFetch(nextUrl, auth)) as SearchResponse
        const values = data.values ?? []

        for (const item of values) {
          const file = item.file ?? {}
          const commit =
            (file as { commit?: { repository?: Record<string, unknown>; branch?: { name?: string; slug?: string } } })
              .commit ?? {}
          const repo = (commit.repository ?? {}) as Record<string, unknown>
          const repoSlug = getRepoSlug(repo)
          const rawPath = (file as { path?: string | string[] | { path?: string } }).path
          let filePath = ''
          if (typeof rawPath === 'string') filePath = rawPath
          else if (Array.isArray(rawPath)) filePath = rawPath.join('/')
          else if (rawPath && typeof rawPath === 'object' && (rawPath as { path?: string }).path)
            filePath = (rawPath as { path: string }).path

          const branch = (commit.branch && (commit.branch.name || commit.branch.slug)) || 'main'
          const contentMatches = item.content_matches ?? []
          const pathMatches = item.path_matches ?? []
          const link = `https://bitbucket.org/${workspace}/${repoSlug}/src/${encodeURIComponent(branch)}/${filePath}`

          for (const m of contentMatches) {
            const lines = m.lines ?? []
            for (const line of lines) {
              const lineNum = typeof line.line === 'number' ? line.line : null
              let fragment = line.content || line.text || ''
              if (!fragment && line.segments && Array.isArray(line.segments)) {
                fragment = line.segments.map((s) => s?.text ?? '').join('')
              }
              results.push({
                repo: repoSlug,
                path: filePath,
                line: lineNum,
                fragment: fragment.trim(),
                link: lineNum != null ? `${link}#lines-${lineNum}` : link,
                branch
              })
            }
          }

          if (contentMatches.length === 0 && pathMatches.length > 0) {
            results.push({ repo: repoSlug, path: filePath, line: null, fragment: '(path match)', link, branch })
          }
        }

        const rawNext = (data.next as string | undefined) ?? null
        nextUrl = rawNext && rawNext.startsWith(BITBUCKET_API) ? rawNext : null
        pageCount++
      }

      return { results, count: results.length }
    })
  }
}
