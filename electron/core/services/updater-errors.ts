/**
 * Clasificación de errores del auto-updater (puro — testeado en updater-errors.test.ts).
 *
 * Los chequeos automáticos fallan seguido por motivos que no son del usuario:
 * el repo todavía no tiene releases publicadas, GitHub devuelve 404/403 (rate
 * limit), o no hay red. Ésos se registran como `info` y NO se muestran.
 */
const QUIET_PATTERNS: RegExp[] = [
  /no published versions/i,
  /cannot find latest\.yml/i,
  /latest\.yml.*(404|not found)/i,
  /\b40[34]\b/,
  /HttpError: 40[34]/i,
  /rate limit/i,
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION_(REFUSED|RESET|TIMED_OUT|CLOSED)|ADDRESS_UNREACHABLE|TIMED_OUT|PROXY_CONNECTION_FAILED)/i,
  /\b(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH)\b/,
  /socket hang up/i,
]

export function isQuietUpdaterError(message: string | null | undefined): boolean {
  if (!message) return true
  return QUIET_PATTERNS.some((re) => re.test(message))
}

/** Texto corto y entendible para mostrar en la UI (chequeo manual o descarga). */
export function friendlyUpdaterError(message: string | null | undefined): string {
  const m = message ?? ''
  if (/no published versions|cannot find latest\.yml|\b404\b/i.test(m)) return 'Todavía no hay versiones publicadas.'
  if (/rate limit|\b403\b/i.test(m)) return 'GitHub limitó las consultas. Probá de nuevo en un rato.'
  if (/net::ERR_|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up/i.test(m)) return 'Sin conexión con el servidor de actualizaciones.'
  if (/sha512 checksum mismatch|signature/i.test(m)) return 'La descarga llegó dañada. Probá de nuevo.'
  const first = m.split('\n')[0]!.trim()
  return first ? first.slice(0, 200) : 'Error desconocido al buscar actualizaciones.'
}
