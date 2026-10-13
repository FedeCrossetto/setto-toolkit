import { Asterisk, Binary, Braces, Clock, Fingerprint, Hash, KeyRound, Link } from 'lucide-react'
import { scoreMatch } from '../../core/palette-logic'
import type { SearchContext, SearchItem, SearchProvider } from '../../core/search'
import type { IconComponent } from '../../core/types'
import {
  base64Decode, dateInfo, decodeJwt, formatJson, looksLikeBase64, looksLikeJson, looksLikeJwt, parseDateInput,
  urlDecode, uuid,
} from './tools'
import type { ToolId, UtilitiesIntentPayload } from './UtilitiesPlugin'

/**
 * Ctrl+K: reconoce lo que pegaste (JWT, JSON, timestamp, Base64, URL escapada)
 * y ofrece el resultado directo; Enter lo copia. También lista las herramientas.
 */

function open(ctx: SearchContext, tool: ToolId, input?: string): void {
  const payload: UtilitiesIntentPayload = { tool, input }
  ctx.dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'utilities', action: 'open', payload })
}

async function copy(ctx: SearchContext, text: string, what = 'Copiado'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ctx.notify(what, 'success')
  } catch {
    ctx.notify('No se pudo copiar al portapapeles', 'error')
  }
}

/** Texto imprimible (evita mostrar "decodificaciones" de basura). */
const printable = (s: string): boolean =>
  s.length > 0 && ![...s].some((ch) => {
    const c = ch.charCodeAt(0)
    return (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 0xfffd
  })

const short = (s: string, max = 70): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)

/** Resultados según la forma del texto. Exportado para tests. */
export function detect(query: string, now = Date.now()): SearchItem[] {
  const q = query.trim()
  const out: SearchItem[] = []
  if (!q) return out

  if (looksLikeJwt(q.replace(/^Bearer\s+/i, ''))) {
    const r = decodeJwt(q, now)
    if (r.ok) {
      const p = r.value.payload
      const who = [p.sub, p.name, p.email, p.preferred_username].find((v) => typeof v === 'string') as string | undefined
      const exp = r.value.expiresAt ? `${r.value.expired ? 'vencido' : 'vence'} ${dateInfo(r.value.expiresAt, now).relative}` : 'sin vencimiento'
      out.push({
        id: 'utilities:jwt', title: `JWT${who ? ` de ${who}` : ''} · ${exp}`, subtitle: `alg ${String(r.value.header.alg ?? '?')}`,
        icon: KeyRound, hint: 'Enter abre', score: 200, run: (ctx) => open(ctx, 'jwt', q),
      })
      out.push({
        id: 'utilities:jwt-payload', title: 'Copiar payload del JWT', subtitle: short(JSON.stringify(p)),
        icon: Braces, hint: 'Enter copia', score: 190, run: (ctx) => copy(ctx, JSON.stringify(p, null, 2), 'Payload copiado'),
      })
    }
    return out
  }

  if (looksLikeJson(q)) {
    const r = formatJson(q)
    out.push(r.ok
      ? { id: 'utilities:json', title: 'Copiar JSON formateado', subtitle: short(q), icon: Braces, hint: 'Enter copia', score: 200,
          run: (ctx) => copy(ctx, r.value, 'JSON formateado copiado') }
      : { id: 'utilities:json', title: 'JSON inválido', subtitle: r.error, icon: Braces, hint: 'Enter abre', score: 200,
          run: (ctx) => open(ctx, 'json', q) })
    return out
  }

  const date = parseDateInput(q)
  if (date.ok && /^\d{10}(\d{3})?$|^\d{4}-\d{2}-\d{2}/.test(q)) {
    const info = dateInfo(date.value, now)
    const isNumber = /^\d+$/.test(q)
    out.push({
      id: 'utilities:time', title: isNumber ? info.local : String(info.unixSeconds),
      subtitle: isNumber ? `${info.iso} · ${info.relative}` : `Unix (s) · ${info.iso}`,
      icon: Clock, hint: 'Enter copia', score: 200,
      run: (ctx) => copy(ctx, isNumber ? info.iso : String(info.unixSeconds)),
    })
    return out
  }

  if (/%[0-9A-Fa-f]{2}/.test(q)) {
    const r = urlDecode(q)
    if (r.ok && r.value !== q) {
      out.push({ id: 'utilities:url', title: short(r.value), subtitle: 'URL decodificada', icon: Link, hint: 'Enter copia', score: 150,
        run: (ctx) => copy(ctx, r.value) })
    }
  }

  if (looksLikeBase64(q)) {
    const r = base64Decode(q)
    if (r.ok && printable(r.value)) {
      out.push({ id: 'utilities:b64', title: short(r.value), subtitle: 'Base64 decodificado', icon: Binary, hint: 'Enter copia', score: 150,
        run: (ctx) => copy(ctx, r.value) })
    }
  }

  if (/^(uuid|guid)s?$/i.test(q) || /^(nuevo|generar) (uuid|guid)/i.test(q)) {
    const id = uuid()
    out.push({ id: 'utilities:uuid', title: id, subtitle: 'UUID v4 nuevo', icon: Fingerprint, hint: 'Enter copia', score: 200,
      run: (ctx) => copy(ctx, /guid/i.test(q) ? id.toUpperCase() : id) })
  }

  if (/^(now|ahora|timestamp|epoch)$/i.test(q)) {
    const s = String(Math.floor(now / 1000))
    out.push({ id: 'utilities:now', title: s, subtitle: 'Unix timestamp de ahora (s)', icon: Clock, hint: 'Enter copia', score: 200,
      run: (ctx) => copy(ctx, s) })
  }

  return out
}

const TOOL_ITEMS: { tool: ToolId; title: string; keywords: string; icon: IconComponent }[] = [
  { tool: 'json',   title: 'Formatear JSON',          keywords: 'json pretty validar minificar', icon: Braces },
  { tool: 'base64', title: 'Base64',                  keywords: 'base64 codificar decodificar encode decode', icon: Binary },
  { tool: 'url',    title: 'URL encode / decode',     keywords: 'url encode decode escapar percent', icon: Link },
  { tool: 'jwt',    title: 'Decodificar JWT',         keywords: 'jwt token bearer', icon: KeyRound },
  { tool: 'uuid',   title: 'Generar UUID / GUID',     keywords: 'uuid guid id', icon: Fingerprint },
  { tool: 'time',   title: 'Convertir timestamp',     keywords: 'timestamp unix epoch fecha', icon: Clock },
  { tool: 'regex',  title: 'Probar regex',            keywords: 'regex regexp expresion regular', icon: Asterisk },
  { tool: 'hash',   title: 'Calcular hash',           keywords: 'hash md5 sha sha1 sha256 checksum', icon: Hash },
]

export const utilitiesSearchProvider: SearchProvider = {
  id: 'utilities',
  group: 'Utilidades',
  pluginId: 'utilities',
  // Lo detectado en el texto pegado va antes que cualquier otro grupo.
  order: -1,
  search(query) {
    if (!query) return []
    const detected = detect(query)
    if (detected.length) return detected
    // Textos largos no son nombres de herramientas: no ensuciar los resultados.
    if (query.length > 40) return []
    return TOOL_ITEMS
      .map((t): SearchItem | null => {
        const score = scoreMatch(query, t.title, t.keywords)
        if (score < 0) return null
        return { id: `utilities:tool:${t.tool}`, title: t.title, icon: t.icon, hint: 'Utilidades', score, run: (ctx) => open(ctx, t.tool) }
      })
      .filter((i): i is SearchItem => i !== null)
  },
}
