import {
  Braces, Clock, ExternalLink, FolderOpen, Images, KeyRound, NotebookPen, Code2, type LucideIcon,
} from 'lucide-react'
import type { ClipKind } from './clip-utils'
import { findTicket } from './clip-utils'

/**
 * Acciones según lo copiado (ticket → abrir en Jira, ruta → abrir carpeta,
 * stack trace → nota…). Las usan el selector flotante, Utilidades y Ctrl+K.
 * Para abrir módulos se pasa `open`, que en la ventana principal despacha un
 * intent y en el selector flotante pide a main que traiga la ventana principal.
 */
export interface OpenAction { pluginId: string; action?: string; payload?: unknown }

export interface ClipAction {
  id: string
  label: string
  icon: LucideIcon
  run: (text: string, open: (a: OpenAction) => void) => Promise<void> | void
}

async function jiraBase(): Promise<string | null> {
  try {
    const v = await window.api.invoke<string | null>('settings:get', 'ticket-resolver.jira_url')
    return v ? v.replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

const openExternal = (url: string): void => { window.open(url, '_blank', 'noopener') }

export function actionsFor(kind: ClipKind, text: string): ClipAction[] {
  const t = text.trim()
  const ticket = kind === 'ticket' ? t : findTicket(t)
  const out: ClipAction[] = []
  if (ticket) {
    out.push({
      id: 'jira', label: `Abrir ${ticket} en Jira`, icon: ExternalLink,
      run: async () => {
        const base = await jiraBase()
        if (!base) throw new Error('Configurá la URL de Jira en Tickets → Ajustes')
        openExternal(`${base}/browse/${ticket}`)
      },
    })
    out.push({ id: 'captures', label: `Ver capturas de ${ticket}`, icon: Images, run: (_t, open) => open({ pluginId: 'captures', action: 'ticket', payload: ticket }) })
  }
  switch (kind) {
    case 'url': out.push({ id: 'open-url', label: 'Abrir en el navegador', icon: ExternalLink, run: () => openExternal(t) }); break
    case 'path': out.push({ id: 'open-path', label: 'Abrir la carpeta', icon: FolderOpen, run: () => window.api.invoke('clipboard:open-path', t).then(() => undefined) }); break
    case 'json': out.push({ id: 'json', label: 'Ver en Utilidades (JSON)', icon: Braces, run: (_x, open) => open({ pluginId: 'utilities', action: 'open', payload: { tool: 'json', input: t } }) }); break
    case 'jwt': out.push({ id: 'jwt', label: 'Decodificar el JWT', icon: KeyRound, run: (_x, open) => open({ pluginId: 'utilities', action: 'open', payload: { tool: 'jwt', input: t } }) }); break
    case 'timestamp': out.push({ id: 'ts', label: 'Ver como fecha', icon: Clock, run: (_x, open) => open({ pluginId: 'utilities', action: 'open', payload: { tool: 'time', input: t } }) }); break
    case 'stacktrace': out.push({
      id: 'note', label: 'Guardar como nota', icon: NotebookPen,
      run: (_x, open) => open({ pluginId: 'notes', action: 'new', payload: { content: `${ticket ? `${ticket} — ` : ''}Error\n\n\`\`\`\n${t}\n\`\`\`\n` } }),
    }); break
    case 'code': out.push({ id: 'snippet', label: 'Guardar como snippet', icon: Code2, run: (_x, open) => open({ pluginId: 'snippets', action: 'new', payload: { content: t } }) }); break
    case 'sql': out.push({ id: 'snippet', label: 'Guardar como snippet', icon: Code2, run: (_x, open) => open({ pluginId: 'snippets', action: 'new', payload: { content: t, language: 'sql' } }) }); break
  }
  return out
}

export const KIND_LABEL: Record<ClipKind, string> = {
  ticket: 'Ticket', url: 'Link', path: 'Ruta', json: 'JSON', jwt: 'JWT', stacktrace: 'Error', guid: 'GUID',
  timestamp: 'Timestamp', sql: 'SQL', email: 'Email', table: 'Tabla', list: 'Lista', code: 'Código', text: 'Texto',
}
