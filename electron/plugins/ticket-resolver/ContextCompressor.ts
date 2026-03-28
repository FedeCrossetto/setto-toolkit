import type { CodeSnippet } from '../../../src/plugins/ticket-resolver/types'

const MAX_SNIPPETS      = 5
const MAX_SNIPPET_LINES = 30
const MAX_LOG_LINES     = 80

/**
 * Truncates each snippet to MAX_SNIPPET_LINES and caps total count at MAX_SNIPPETS.
 */
export function compressSnippets(snippets: CodeSnippet[]): CodeSnippet[] {
  return snippets.slice(0, MAX_SNIPPETS).map(s => {
    const lines = s.context.split('\n')
    if (lines.length <= MAX_SNIPPET_LINES) return s
    return {
      ...s,
      context: lines.slice(0, MAX_SNIPPET_LINES).join('\n')
        + `\n... [${lines.length - MAX_SNIPPET_LINES} more lines truncated]`,
    }
  })
}

/**
 * If the log exceeds MAX_LOG_LINES, keep only error/warning lines.
 */
export function compressLogs(log: string): string {
  const lines = log.split('\n')
  if (lines.length <= MAX_LOG_LINES) return log
  const errorLines = lines.filter(l => {
    const lower = l.toLowerCase()
    return lower.includes('error') || lower.includes('exception')
        || lower.includes('fail')  || lower.includes('warn')
  })
  return errorLines.length > 0
    ? `[Log truncated — keeping ${errorLines.length} error/warning lines from ${lines.length} total]\n${errorLines.join('\n')}`
    : `[Log truncated — ${lines.length} total lines, no errors detected]`
}

/**
 * Formats compressed snippets into a prompt-ready string.
 */
export function formatSnippetsForPrompt(snippets: CodeSnippet[]): string {
  const list = compressSnippets(snippets)
  if (list.length === 0) return 'No se encontró código relevante en el repositorio.'
  return list.map(s => `// ${s.file} (línea ${s.line})\n${s.context}`).join('\n\n---\n\n')
}
