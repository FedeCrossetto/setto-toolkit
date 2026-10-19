import type { IpcMain } from 'electron'
import { logger } from './logger'

/**
 * Imágenes remotas de la vista previa de Markdown (Notas, Editor).
 *
 * La vista previa no carga nada de internet por su cuenta (una imagen remota en un
 * .md delata que lo abriste: IP, hora). Muestra "Cargar imagen remota" y, si el
 * usuario hace clic, main la descarga y la devuelve como `data:` — así la CSP del
 * renderer puede seguir sin `https:` en `img-src`.
 */
export const REMOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 15_000

/** URL http(s) válida y sin credenciales embebidas; si no, null. */
export function parseRemoteImageUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null
  let u: URL
  try { u = new URL(raw.trim().startsWith('//') ? `https:${raw.trim()}` : raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  return u
}

/** Tipo de imagen aceptado (sin parámetros), o null. */
export function imageMime(contentType: string | null): string | null {
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  return /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(mime) ? mime : null
}

export type RemoteImageResult = { ok: true; dataUrl: string } | { ok: false; error: string }

export async function fetchRemoteImage(
  raw: unknown,
  fetcher: (url: string, init: { signal: AbortSignal; redirect: 'follow' }) => Promise<Response>,
): Promise<RemoteImageResult> {
  const url = parseRemoteImageUrl(raw)
  if (!url) return { ok: false, error: 'URL no válida' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetcher(url.toString(), { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const mime = imageMime(res.headers.get('content-type'))
    if (!mime) return { ok: false, error: 'No es una imagen' }
    const len = Number(res.headers.get('content-length') ?? '0')
    if (len > REMOTE_IMAGE_MAX_BYTES) return { ok: false, error: 'La imagen es demasiado grande' }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > REMOTE_IMAGE_MAX_BYTES) return { ok: false, error: 'La imagen es demasiado grande' }
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  } catch (err) {
    return { ok: false, error: ctrl.signal.aborted ? 'Tiempo de espera agotado' : (err instanceof Error ? err.message : String(err)) }
  } finally {
    clearTimeout(timer)
  }
}

export function registerRemoteImage(ipc: IpcMain, fetcher: (url: string, init: { signal: AbortSignal; redirect: 'follow' }) => Promise<Response>): void {
  ipc.handle('app:fetch-remote-image', async (_e, url: unknown) => {
    const r = await fetchRemoteImage(url, fetcher)
    if (!r.ok) logger.info('remote-image', `no se cargó: ${r.error}`)
    return r
  })
}
