import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { JiraTicket, AnalysisPlan, AnalysisResult, CodeSnippet, HistoryEntry } from '../../../src/plugins/ticket-resolver/types'

const HISTORY_FILE = 'ticket-resolver-history.json'

// ── Atlassian Document Format → plain text ─────────────────────────────────────
function adfToText(node: unknown, depth = 0): string {
  if (!node || typeof node !== 'object' || depth > 10) return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text') return typeof n.text === 'string' ? n.text : ''
  const parts: string[] = []
  if (Array.isArray(n.content)) {
    for (const child of n.content) parts.push(adfToText(child, depth + 1))
  }
  const sep = (n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem') ? '\n' : ' '
  return parts.join(sep).trim()
}

// ── Code search in local repo ──────────────────────────────────────────────────
function searchRepo(repoPath: string, terms: string[], maxResults = 8): CodeSnippet[] {
  const results: CodeSnippet[] = []
  const EXTS = new Set(['.cs', '.vb', '.ts', '.js', '.sql', '.xml', '.config', '.json'])
  const SKIP = new Set(['node_modules', 'bin', 'obj', '.git', '.vs', 'packages', 'dist', 'out', 'TestResults'])

  function walk(dir: string, depth: number): void {
    if (depth > 10 || results.length >= maxResults) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

    for (const entry of entries) {
      if (results.length >= maxResults) break
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) walk(full, depth + 1)
      } else if (entry.isFile() && EXTS.has(path.extname(entry.name).toLowerCase())) {
        let text: string
        try { text = fs.readFileSync(full, 'utf-8') } catch { continue }
        const lines = text.split('\n')
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          if (terms.some(t => lines[i].toLowerCase().includes(t.toLowerCase()))) {
            const from = Math.max(0, i - 3)
            const to   = Math.min(lines.length - 1, i + 6)
            results.push({
              file: path.relative(repoPath, full).replace(/\\/g, '/'),
              line: i + 1,
              context: lines.slice(from, to + 1).join('\n'),
            })
            i += 6 // skip ahead to avoid duplicate hits in same block
          }
        }
      }
    }
  }

  walk(repoPath, 0)
  return results
}

// ── Handlers ───────────────────────────────────────────────────────────────────
export const handlers: PluginHandlers = {
  pluginId: 'ticket-resolver',

  register(ipcMain: IpcMain, { db, settings, ai }: CoreServices): void {

    // Fetch ticket from Jira REST API v3
    ipcMain.handle('ticket-resolver:fetch', async (_e, ticketKey: string) => {
      const jiraUrl   = settings.get('ticket-resolver.jira_url')   ?? ''
      const jiraUser  = settings.get('ticket-resolver.jira_user')  ?? ''
      const jiraToken = settings.get('ticket-resolver.jira_token') ?? ''
      if (!jiraUrl || !jiraUser || !jiraToken) throw new Error('JIRA_NOT_CONFIGURED')

      // Validate ticket key format to prevent URL path injection
      const normalizedKey = ticketKey.trim().toUpperCase()
      if (!/^[A-Z]+-\d+$/.test(normalizedKey)) {
        throw new Error(`Invalid ticket key format: "${ticketKey}"`)
      }

      const auth = Buffer.from(`${jiraUser}:${jiraToken}`).toString('base64')
      const url  = `${jiraUrl.replace(/\/$/, '')}/rest/api/3/issue/${normalizedKey}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
      if (res.status === 404) throw new Error(`Ticket ${normalizedKey} not found in Jira`)
      if (res.status === 401) throw new Error('Jira authentication failed — check credentials in config')
      if (!res.ok) throw new Error(`Jira API error ${res.status}`)

      const d = await res.json() as {
        key: string
        fields: {
          summary: string
          description: unknown
          issuetype: { name: string }
          priority:  { name: string }
          status:    { name: string }
          components: Array<{ name: string }>
          reporter:   { displayName: string } | null
          assignee:   { displayName: string } | null
          created: string
          updated: string
        }
      }

      return {
        key:         d.key,
        summary:     d.fields.summary,
        description: adfToText(d.fields.description),
        type:        d.fields.issuetype.name,
        priority:    d.fields.priority?.name ?? 'Unknown',
        status:      d.fields.status.name,
        components:  d.fields.components.map(c => c.name),
        reporter:    d.fields.reporter?.displayName ?? '',
        assignee:    d.fields.assignee?.displayName ?? null,
        created:     d.fields.created,
        updated:     d.fields.updated,
      } satisfies JiraTicket
    })

    // AI call 1 — generate analysis plan (~300 tokens)
    ipcMain.handle('ticket-resolver:plan', async (_e, ticket: JiraTicket) => {
      const { text } = await ai.complete([
        {
          role: 'system',
          content: 'You are a code analyst for WinSystems financial software. Return ONLY valid JSON — no markdown fences, no explanation.',
        },
        {
          role: 'user',
          content: `Analyze this Jira ticket and return a JSON analysis plan.

Ticket: ${ticket.key} — ${ticket.summary}
Type: ${ticket.type} | Priority: ${ticket.priority}
Components: ${ticket.components.join(', ') || 'none'}
Description:
${ticket.description.slice(0, 600)}

Return exactly this JSON shape:
{
  "component": "affected component or module name",
  "technology": "main tech involved (C#, VB.NET, SQL, etc)",
  "nature": "one-sentence problem summary",
  "searchTerms": ["ClassName", "methodOrErrorKeyword", "folderOrModule"],
  "steps": [
    { "id": "1", "label": "step label", "detail": "what will be done" }
  ],
  "estimatedTokens": 900
}`,
        },
      ], { skipCache: true })

      const json = text.replace(/```json|```/g, '').trim()
      try {
        return JSON.parse(json) as AnalysisPlan
      } catch {
        throw new Error('AI returned invalid JSON for analysis plan — try again')
      }
    })

    // Search code in wigos local repo
    ipcMain.handle('ticket-resolver:search', (_e, searchTerms: string[]) => {
      const repoPath = settings.get('ticket-resolver.repo_path') ?? ''
      if (!repoPath || !fs.existsSync(repoPath)) return [] as CodeSnippet[]
      return searchRepo(repoPath, searchTerms, 8)
    })

    // AI call 2 — full analysis with code context (~800-1500 tokens)
    ipcMain.handle('ticket-resolver:analyze', async (
      _e,
      ticket: JiraTicket,
      plan: AnalysisPlan,
      snippets: CodeSnippet[],
    ) => {
      const codeCtx = snippets.length > 0
        ? snippets.map(s => `// ${s.file} (line ${s.line})\n${s.context}`).join('\n\n---\n\n')
        : 'No relevant code found in repo — analyze from description only.'

      const { text } = await ai.complete([
        {
          role: 'system',
          content: 'You are a senior developer fixing bugs in WinSystems financial software. Return ONLY valid JSON — no markdown fences.',
        },
        {
          role: 'user',
          content: `TICKET: ${ticket.key} — ${ticket.summary}
TYPE: ${ticket.type} | PRIORITY: ${ticket.priority}
COMPONENT: ${plan.component} | TECH: ${plan.technology}
PROBLEM: ${plan.nature}
DESCRIPTION: ${ticket.description.slice(0, 400)}

RELEVANT CODE:
${codeCtx}

Return exactly this JSON shape:
{
  "rootCause": "clear explanation of root cause",
  "fix": "detailed fix description with code where applicable",
  "affectedFiles": ["relative/path/to/file.cs"],
  "diff": [
    {
      "file": "relative/path/to/file.cs",
      "lineStart": 100,
      "original": "original code line(s)",
      "modified": "fixed code line(s)"
    }
  ]
}`,
        },
      ], { skipCache: true })

      const json = text.replace(/```json|```/g, '').trim()
      try {
        return JSON.parse(json) as AnalysisResult
      } catch {
        throw new Error('AI returned invalid JSON for analysis result — try again')
      }
    })

    // History — get
    ipcMain.handle('ticket-resolver:history-get', () =>
      db.readJSON<HistoryEntry[]>(HISTORY_FILE) ?? [],
    )

    // History — save (upsert, keep last 100)
    ipcMain.handle('ticket-resolver:history-save', (_e, entry: HistoryEntry) => {
      const all = db.readJSON<HistoryEntry[]>(HISTORY_FILE) ?? []
      const idx = all.findIndex(h => h.id === entry.id)
      if (idx >= 0) { all[idx] = entry } else { all.unshift(entry) }
      db.writeJSON(HISTORY_FILE, all.slice(0, 100))
      return { ok: true }
    })

    // History — delete
    ipcMain.handle('ticket-resolver:history-delete', (_e, id: string) => {
      const all = db.readJSON<HistoryEntry[]>(HISTORY_FILE) ?? []
      db.writeJSON(HISTORY_FILE, all.filter(h => h.id !== id))
      return { ok: true }
    })
  },
}
