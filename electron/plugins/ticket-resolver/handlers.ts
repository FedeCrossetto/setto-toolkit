import type { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { JiraTicket, AnalysisPlan, AnalysisResult, CodeSnippet, HistoryEntry, DiffChunk } from '../../../src/plugins/ticket-resolver/types'

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
            i += 6
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

      try {
        const parsed = new URL(jiraUrl)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
      } catch {
        throw new Error('JIRA_NOT_CONFIGURED')
      }

      const normalizedKey = ticketKey.trim().toUpperCase()
      if (!/^[A-Z]+-\d+$/.test(normalizedKey)) {
        throw new Error(`Invalid ticket key format: "${ticketKey}"`)
      }

      const auth = Buffer.from(`${jiraUser}:${jiraToken}`).toString('base64')
      const url  = `${jiraUrl.replace(/\/$/, '')}/rest/api/3/issue/${normalizedKey}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      let res: Response
      try {
        res = await fetch(url, {
          headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
          signal: controller.signal,
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Jira request timed out after 15 seconds — check the Jira URL and your network connection')
        }
        throw err
      } finally {
        clearTimeout(timeout)
      }
      if (res.status === 404) throw new Error(`Ticket ${normalizedKey} not found in Jira`)
      if (res.status === 401) throw new Error('Jira authentication failed — check credentials in config')
      if (!res.ok) throw new Error(`Jira API error ${res.status}`)

      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(
          `Jira returned non-JSON response (${contentType || 'no content-type'}) — ` +
          `the URL may be wrong or redirecting to an SSO/login page. Check the Jira URL in settings.`
        )
      }

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
          content: [
            'Eres un analista de código para WinSystems, software financiero.',
            'REGLA ABSOLUTA E INQUEBRANTABLE: escribir SOLO en idioma español.',
            'Está estrictamente PROHIBIDO usar inglés en cualquier campo.',
            'Responde ÚNICAMENTE con JSON válido. Sin bloques markdown, sin texto extra.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `IMPORTANTE: TODA tu respuesta debe estar en español. Ningún campo puede contener inglés.

Analiza este ticket de Jira y devuelve un plan de análisis en JSON.

Ticket: ${ticket.key} — ${ticket.summary}
Tipo: ${ticket.type} | Prioridad: ${ticket.priority}
Componentes: ${ticket.components.join(', ') || 'ninguno'}
Descripción:
${ticket.description.slice(0, 600)}

Devuelve SOLO este JSON con todos los textos en español:
{
  "component": "nombre del componente o módulo afectado",
  "technology": "tecnología principal (C#, VB.NET, SQL, etc)",
  "nature": "resumen del problema en una oración en español",
  "searchTerms": ["NombreClase", "metodoOErrorClave", "carpetaOModulo"],
  "steps": [
    { "id": "1", "label": "etiqueta del paso en español", "detail": "descripción en español de qué se hará" }
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

    // Search code in local repo
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
        ? snippets.map(s => `// ${s.file} (línea ${s.line})\n${s.context}`).join('\n\n---\n\n')
        : 'Sin código encontrado en el repositorio. Analizar únicamente desde la descripción del ticket.'

      const { text } = await ai.complete([
        {
          role: 'system',
          content: [
            'Eres un desarrollador senior resolviendo bugs en WinSystems, software financiero.',
            'REGLA ABSOLUTA E INQUEBRANTABLE: escribir SOLO en idioma español.',
            'Está estrictamente PROHIBIDO escribir en inglés.',
            'Responde ÚNICAMENTE con JSON válido. Sin bloques markdown, sin texto extra.',
          ].join(' '),
        },
        {
          role: 'user',
          content: `IMPORTANTE: TODA tu respuesta debe estar en español. Ningún campo puede contener inglés.

TICKET: ${ticket.key} — ${ticket.summary}
TIPO: ${ticket.type} | PRIORIDAD: ${ticket.priority}
COMPONENTE: ${plan.component} | TECNOLOGÍA: ${plan.technology}
PROBLEMA: ${plan.nature}
DESCRIPCIÓN: ${ticket.description.slice(0, 400)}

CÓDIGO RELEVANTE:
${codeCtx}

Devuelve SOLO este JSON con TODOS los textos en español:
{
  "rootCause": "explicación clara de la causa raíz EN ESPAÑOL",
  "fix": "descripción detallada del fix EN ESPAÑOL, con código donde corresponda",
  "affectedFiles": ["ruta/relativa/archivo.cs"],
  "diff": [
    {
      "file": "ruta/relativa/archivo.cs",
      "lineStart": 100,
      "original": "línea(s) de código original",
      "modified": "línea(s) de código corregido"
    }
  ],
  "ticketComment": {
    "causa": "causa raíz concisa EN ESPAÑOL para comentar en el ticket",
    "solucion": "solución implementada EN ESPAÑOL para comentar en el ticket",
    "comoProbarlo": "pasos concretos EN ESPAÑOL para verificar que el fix funciona"
  }
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

    // AI usage — get / reset session stats
    ipcMain.handle('ticket-resolver:ai-usage-get', () => ai.getSessionUsage())
    ipcMain.handle('ticket-resolver:ai-usage-reset', () => {
      ai.resetSessionUsage()
      return { ok: true }
    })

    // Apply AI-suggested code changes directly to repo files
    ipcMain.handle('ticket-resolver:apply-changes', (_e, chunks: DiffChunk[]) => {
      const repoPath = (settings.get('ticket-resolver.repo_path') as string | null) ?? ''
      if (!repoPath) throw new Error('Ruta del repositorio no configurada — configurala en Ajustes')
      const resolvedRepo = path.resolve(repoPath)
      if (!fs.existsSync(resolvedRepo)) throw new Error(`Ruta no encontrada: ${repoPath}`)

      return chunks.map(chunk => {
        const fullPath = path.resolve(resolvedRepo, chunk.file)
        if (!fullPath.startsWith(resolvedRepo + path.sep) && fullPath !== resolvedRepo) {
          return { file: chunk.file, status: 'error', message: 'Ruta inválida' }
        }
        if (!fs.existsSync(fullPath)) {
          return { file: chunk.file, status: 'not_found', message: 'Archivo no encontrado en el repositorio' }
        }
        try {
          const raw      = fs.readFileSync(fullPath, 'utf-8')
          const usesCRLF = raw.includes('\r\n')
          const content  = raw.replace(/\r\n/g, '\n')
          const original = chunk.original.replace(/\r\n/g, '\n').trim()
          const modified = chunk.modified.replace(/\r\n/g, '\n')
          if (!content.includes(original)) {
            return { file: chunk.file, status: 'not_found', message: 'El código original no se encontró — puede haber cambiado desde el análisis' }
          }
          const updated = content.replace(original, modified)
          fs.writeFileSync(fullPath, usesCRLF ? updated.replace(/\n/g, '\r\n') : updated, 'utf-8')
          return { file: chunk.file, status: 'applied' }
        } catch (e) {
          return { file: chunk.file, status: 'error', message: (e as Error).message.slice(0, 200) }
        }
      })
    })
  },
}
