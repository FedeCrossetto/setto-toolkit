/**
 * Helpers puros del módulo Capturas (sin Electron ni fs — testeados en captures-utils.test.ts).
 * Pensado para miles de capturas: la búsqueda/orden/paginado corre en main sobre el
 * índice en memoria y al renderer sólo viaja la página visible, sin el texto OCR.
 */
import type { CaptureEntry, CaptureFacets, CaptureLite, CaptureQuery, CaptureSort } from '../../../src/plugins/captures/types'
export type { CaptureEntry }

const pad = (n: number): string => String(n).padStart(2, '0')

/** Nombre de archivo ordenable y legible: 2026-10-12_14-03-22_ab12.png */
export function captureFileName(d: Date, suffix: string): string {
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  return `${stamp}_${suffix.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'x'}.png`
}

/** Sólo nombres generados por captureFileName (defensa contra rutas raras en el protocolo). */
export function isValidCaptureFile(name: unknown): name is string {
  return typeof name === 'string' && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[a-z0-9]{1,8}\.png$/i.test(name)
}

/** Miniatura asociada a una captura. */
export const thumbFileName = (file: string): string => file.replace(/\.png$/i, '.jpg')

/** Claves de ticket tipo Jira (WIGOS-123967, ABC-12). La primera que aparezca. */
export function detectTicket(text: string | null | undefined): string {
  if (!text) return ''
  // El OCR a veces separa con espacios: se acepta "WIGOS - 123".
  const m = /\b([A-Z][A-Z0-9]{1,9})\s?-\s?(\d{2,7})\b/.exec(text)
  return m ? `${m[1]}-${m[2]}` : ''
}

/**
 * Huella barata de un bitmap (tamaño + ~4096 píxeles muestreados) para que el
 * sondeo del portapapeles no tenga que hashear la imagen entera cada 900 ms.
 * Sólo decide si vale la pena calcular el hash completo.
 */
export function quickImageFingerprint(bitmap: Uint8Array, width: number, height: number, samples = 4096): string {
  let h = 0x811c9dc5
  const pixels = Math.floor(bitmap.length / 4)
  const step = Math.max(1, Math.floor(pixels / samples))
  for (let i = 0; i < pixels; i += step) {
    const o = i * 4
    for (let k = 0; k < 4; k++) {
      h ^= bitmap[o + k]!
      h = Math.imul(h, 0x01000193)
    }
  }
  return `${width}x${height}:${bitmap.length}:${(h >>> 0).toString(16)}`
}

// ── Origen de la captura ─────────────────────────────────────────────────────

/** Procesos que están en primer plano al recortar pero no son "la app capturada". */
const CAPTURE_TOOLS = new Set([
  'snippingtool', 'screenclippinghost', 'shellexperiencehost', 'shellhost', 'searchhost', 'startmenuexperiencehost',
  'applicationframehost', 'textinputhost', 'lockapp', 'electron', 'setto', 'sharex', 'greenshot', 'lightshot',
])

/** Nombre lindo para algunos procesos conocidos. */
const APP_NAMES: Record<string, string> = {
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', code: 'VS Code', devenv: 'Visual Studio', ssms: 'SSMS',
  teams: 'Teams', 'ms-teams': 'Teams', outlook: 'Outlook', excel: 'Excel', winword: 'Word', powerpnt: 'PowerPoint',
  explorer: 'Explorador', windowsterminal: 'Terminal', cmd: 'CMD', powershell: 'PowerShell', slack: 'Slack',
  notepad: 'Bloc de notas', 'notepad++': 'Notepad++', mstsc: 'Escritorio remoto', wigosgui: 'WigosGUI', claude: 'Claude',
}

export interface CaptureSource { app: string; window: string }

/** Normaliza lo que devuelve la ventana en primer plano; null si es la herramienta de recorte. */
export function normalizeSource(raw: { app?: string; title?: string } | null | undefined): CaptureSource | null {
  const proc = (raw?.app ?? '').trim()
  if (!proc || CAPTURE_TOOLS.has(proc.toLowerCase())) return null
  const app = APP_NAMES[proc.toLowerCase()] ?? proc
  // "Ticket WIGOS-1 - Jira - Google Chrome" → sin el sufijo del navegador/editor.
  const window = (raw?.title ?? '').replace(/\s+[-–—|]\s+(Google Chrome|Microsoft\s?Edge|Mozilla Firefox|Visual Studio Code)$/i, '').trim()
  return { app, window: window.slice(0, 160) }
}

/** Título por defecto: la ventana capturada; si no hay, la app; si no, la hora. */
export function buildTitle(source: CaptureSource | null, d: Date): string {
  const w = source?.window.trim()
  if (w && w.length >= 3) return w.length > 90 ? `${w.slice(0, 89)}…` : w
  if (source?.app) return `Captura de ${source.app}`
  return `Captura ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export { exportFileName, uniqueExportNames } from '../../../src/plugins/captures/naming'

// ── Búsqueda, orden, paginado ────────────────────────────────────────────────

export const normText = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Texto donde se busca (main lo cachea por entrada). */
export function searchText(c: CaptureEntry): string {
  return normText([c.title, c.ticket, c.tags.join(' '), c.note, c.app ?? '', c.window ?? '', c.ocr ?? ''].join(' \n '))
}

/** Lo que viaja a la galería: sin OCR ni nota (pueden ser largos). */
export function toLite(c: CaptureEntry): CaptureLite {
  const { ocr, note, ...rest } = c
  return { ...rest, hasNote: !!note, ocrState: ocr === null ? 'pending' : ocr ? 'done' : 'empty' }
}

const SORTERS: Record<CaptureSort, (a: CaptureEntry, b: CaptureEntry) => number> = {
  new: (a, b) => b.createdAt - a.createdAt,
  old: (a, b) => a.createdAt - b.createdAt,
  size: (a, b) => b.bytes - a.bytes || b.createdAt - a.createdAt,
  // Sin ticket / sin app al final; dentro de cada grupo, más nuevas primero.
  ticket: (a, b) => Number(!a.ticket) - Number(!b.ticket) || a.ticket.localeCompare(b.ticket) || b.createdAt - a.createdAt,
  app: (a, b) => Number(!a.app) - Number(!b.app) || (a.app ?? '').localeCompare(b.app ?? '') || b.createdAt - a.createdAt,
}

export function queryCaptures(
  list: CaptureEntry[],
  q: CaptureQuery,
  haystack: (c: CaptureEntry) => string = searchText,
): { items: CaptureEntry[]; total: number } {
  const words = normText(q.text ?? '').split(/\s+/).filter(Boolean)
  const filtered = list.filter((c) => {
    if (q.pinned && !c.pinned) return false
    if (q.ticket && c.ticket !== q.ticket) return false
    if (q.app && c.app !== q.app) return false
    if (!words.length) return true
    const h = haystack(c)
    return words.every((w) => h.includes(w))
  })
  filtered.sort(SORTERS[q.sort ?? 'new'] ?? SORTERS.new)
  const offset = Math.max(0, q.offset ?? 0)
  const limit = Math.min(500, Math.max(1, q.limit ?? 60))
  return { items: filtered.slice(offset, offset + limit), total: filtered.length }
}

/** Filtros rápidos (tickets recientes, apps más usadas) y uso de disco. */
export function captureFacets(list: CaptureEntry[], max = 12): CaptureFacets {
  const tickets = new Map<string, number>()
  const apps = new Map<string, number>()
  let bytes = 0
  for (const c of list) {
    bytes += c.bytes
    if (c.ticket) tickets.set(c.ticket, Math.max(tickets.get(c.ticket) ?? 0, c.createdAt))
    if (c.app) apps.set(c.app, (apps.get(c.app) ?? 0) + 1)
  }
  return {
    count: list.length,
    bytes,
    tickets: [...tickets.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t),
    apps: [...apps.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([name, count]) => ({ name, count })),
  }
}

// ── Limpieza ─────────────────────────────────────────────────────────────────

/**
 * La limpieza automática nunca toca lo que el usuario "trabajó": fijadas, anotadas
 * (y su original), con ticket, nota o etiquetas.
 */
export function isRetentionProtected(c: CaptureEntry, annotatedSources?: Set<string>): boolean {
  return c.pinned || !!c.annotatedFrom || !!annotatedSources?.has(c.id) ||
    !!c.ticket?.trim() || !!c.note?.trim() || (c.tags?.length ?? 0) > 0
}

const annotatedSourcesOf = (list: CaptureEntry[]): Set<string> =>
  new Set(list.map((c) => c.annotatedFrom).filter((x): x is string => !!x))

/** Capturas a borrar por antigüedad (`keepDays` 0 = nunca). Las protegidas no se borran. */
export function expiredCaptures(list: CaptureEntry[], keepDays: number, now: number): CaptureEntry[] {
  if (!keepDays || keepDays <= 0) return []
  const limit = now - keepDays * 86_400_000
  const sources = annotatedSourcesOf(list)
  return list.filter((c) => !isRetentionProtected(c, sources) && c.createdAt < limit)
}

/** Si se pasa del tope de espacio: las más viejas (no protegidas) hasta volver a entrar. */
export function overQuota(list: CaptureEntry[], maxBytes: number): CaptureEntry[] {
  if (!maxBytes || maxBytes <= 0) return []
  let total = list.reduce((s, c) => s + c.bytes, 0)
  const sources = annotatedSourcesOf(list)
  const out: CaptureEntry[] = []
  for (const c of [...list].sort((a, b) => a.createdAt - b.createdAt)) {
    if (total <= maxBytes) break
    if (isRetentionProtected(c, sources)) continue
    out.push(c)
    total -= c.bytes
  }
  return out
}

/** ¿Está en la lista de apps ignoradas? (comparación sin mayúsculas, por nombre visible o de proceso). */
export function isExcludedApp(app: string | undefined, excluded: string[]): boolean {
  if (!app) return false
  const a = app.toLowerCase()
  return excluded.some((x) => x.trim().toLowerCase() === a)
}
