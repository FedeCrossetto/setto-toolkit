import { findTicket } from '../core/clip-utils'

/**
 * Qué estás haciendo según la app de adelante (la de antes de abrir la barra):
 * la barra sugiere lo que sirve ahí. Sólo heurística por nombre de proceso y título.
 */
export type ContextKind = 'sql' | 'code' | 'ticket' | 'chat'

export interface DockContext {
  kind: ContextKind
  /** "SSMS", "Visual Studio", "WIGOS-123"… para el rótulo "Para …" */
  label: string
  ticket?: string
}

const SQL_APPS: Record<string, string> = { ssms: 'SSMS', azuredatastudio: 'Azure Data Studio', dbeaver: 'DBeaver', heidisql: 'HeidiSQL' }
const CODE_APPS: Record<string, string> = {
  devenv: 'Visual Studio', code: 'VS Code', cursor: 'Cursor', rider64: 'Rider', rider: 'Rider', 'notepad++': 'Notepad++',
  windowsterminal: 'Terminal', powershell: 'PowerShell', pwsh: 'PowerShell', cmd: 'Consola', idea64: 'IntelliJ',
}
const CHAT_APPS: Record<string, string> = { 'ms-teams': 'Teams', teams: 'Teams', outlook: 'Outlook', olk: 'Outlook', slack: 'Slack', whatsapp: 'WhatsApp' }

export function classifyContext(app: string | undefined | null, title: string | undefined | null): DockContext | null {
  const a = (app ?? '').toLowerCase().replace(/\.exe$/, '')
  const t = title ?? ''
  if (!a) return null
  // Un ticket en el título (Jira en el navegador, el correo, el chat) manda sobre la app.
  const ticket = findTicket(t)
  if (ticket) return { kind: 'ticket', label: ticket, ticket }
  if (SQL_APPS[a] || /SQL Server Management Studio/i.test(t)) return { kind: 'sql', label: SQL_APPS[a] ?? 'SSMS' }
  if (CODE_APPS[a]) return { kind: 'code', label: CODE_APPS[a]! }
  if (CHAT_APPS[a]) return { kind: 'chat', label: CHAT_APPS[a]! }
  return null
}

/** ¿El snippet es SQL? Por lenguaje, etiqueta o porque arranca como una consulta. */
export function isSqlSnippet(s: { language?: string; tags?: string[]; content?: string }): boolean {
  if ((s.language ?? '').toLowerCase() === 'sql') return true
  if ((s.tags ?? []).some((t) => /^(sql|tsql|t-sql|query|consulta)$/i.test(t))) return true
  return /^\s*(select|insert|update|delete|with|exec|declare|create|alter|use)\b/i.test(s.content ?? '')
}
