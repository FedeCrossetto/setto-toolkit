import { uniqueExportNames } from './naming'
import { isSensitive, redactSecrets } from '../../core/clip-utils'
import type { CaptureEntry } from './types'

/**
 * Comentario de evidencia para un ticket: capturas (en orden cronológico, con el
 * mismo nombre que al exportarlas), nota, texto reconocido, notas relacionadas y
 * lo copiado que menciona el ticket. Formato Jira (wiki) o Markdown.
 */
export type CommentFormat = 'jira' | 'md'

export interface TicketMaterial {
  ticket: string
  captures: CaptureEntry[]
  notes: string[]
  clips: string[]
}

const MAX_OCR_LINES = 12

const fecha = (t: number): string =>
  new Date(t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function ocrExcerpt(ocr: string | null): string | null {
  if (!ocr?.trim()) return null
  const lines = ocr.split('\n').map((l) => l.trim()).filter(Boolean)
  // Lo que se lee en una captura puede incluir claves (ventanas de login, configs): taparlas.
  return redactSecrets(lines.slice(0, MAX_OCR_LINES).join('\n')) + (lines.length > MAX_OCR_LINES ? '\n…' : '')
}

export function buildTicketComment(m: TicketMaterial, format: CommentFormat, withOcr = true): string {
  const caps = [...m.captures].sort((a, b) => a.createdAt - b.createdAt)
  const names = uniqueExportNames(caps)
  const out: string[] = []
  const jira = format === 'jira'

  out.push(jira ? `h3. Evidencia — ${m.ticket}` : `### Evidencia — ${m.ticket}`, '')
  caps.forEach((c, i) => {
    const meta = [fecha(c.createdAt), c.app].filter(Boolean).join(', ')
    out.push(jira ? `# *${c.title}* (${meta})` : `${i + 1}. **${c.title}** (${meta})`)
    out.push(jira ? `!${names[i]}|thumbnail!` : `   ![${c.title}](${encodeURI(names[i]!)})`)
    const note = redactSecrets(c.note.trim())
    if (note) out.push(jira ? note : `   ${note.replace(/\n/g, '\n   ')}`)
    const ocr = withOcr ? ocrExcerpt(c.ocr) : null
    if (ocr) out.push(jira ? `{noformat}\n${ocr}\n{noformat}` : `   \`\`\`\n   ${ocr.replace(/\n/g, '\n   ')}\n   \`\`\``)
    out.push('')
  })
  if (m.notes.length) {
    out.push(jira ? `*Notas relacionadas:* ${m.notes.join(', ')}` : `**Notas relacionadas:** ${m.notes.join(', ')}`, '')
  }
  if (m.clips.length) {
    out.push(jira ? '*Datos copiados:*' : '**Datos copiados:**')
    for (const c of m.clips.filter((x) => !isSensitive(x)).map(redactSecrets).slice(0, 5)) out.push(jira ? `{code}\n${c.trim()}\n{code}` : `\`\`\`\n${c.trim()}\n\`\`\``)
    out.push('')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
