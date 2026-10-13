import { ClipboardText, Lock, ScanText, Wand2 } from 'lucide-react'
import { matchesQuery, type SearchItem, type SearchProvider } from '../../core/search'
import { scoreMatch } from '../../core/palette-logic'
import { TRANSFORMS, detectKind, type ClipView } from '../../core/clip-utils'
import { KIND_LABEL } from '../../core/clip-actions'

/** Historial del portapapeles (vive en main: electron/core/clipboard-history.ts). */
export type ClipEntry = ClipView

export const clipboardApi = {
  list: () => window.api.invoke<ClipView[]>('clipboard:history'),
  copy: (id: string) => window.api.invoke('clipboard:copy', id),
  remove: (id: string) => window.api.invoke('clipboard:remove', id),
  clear: () => window.api.invoke('clipboard:clear'),
  pin: (id: string, pinned: boolean) => window.api.invoke<ClipView>('clipboard:pin', id, pinned),
  setEnabled: (on: boolean) => window.api.invoke('clipboard:set-enabled', on),
  ocrImage: () => window.api.invoke<{ ok: boolean; text?: string; reason?: string }>('clipboard:ocr-image'),
  queueSet: (items: ({ id: string } | { text: string })[]) => window.api.invoke<{ total: number; pos: number }>('clipboard:queue-set', items),
  queueState: () => window.api.invoke<{ total: number; pos: number; next: string | null }>('clipboard:queue-state'),
  queueClear: () => window.api.invoke('clipboard:queue-clear'),
  shortcuts: () => window.api.invoke<{ next: string | null; ocr: string | null }>('clipboard:shortcuts'),
}

export function clipPreview(text: string, max = 90): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

export function clipAge(at: number, now = Date.now()): string {
  const s = Math.round((now - at) / 1000)
  if (s < 60) return 'recién'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`
  return new Date(at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const BROWSE = /^(portapapeles|clipboard|historial|copiados?)$/i
const OCR = /^(texto de (la )?imagen|ocr|leer imagen|texto imagen)$/i

/**
 * Ctrl+K:
 * - "portapapeles" lista lo último copiado; cualquier búsqueda (3+ letras) trae coincidencias.
 * - "texto de imagen" / "ocr": copia el texto de la imagen que hay en el portapapeles.
 * - "in sql", "tabla jira", "mayúsculas"…: transforma lo que hay en el portapapeles.
 */
export const clipboardSearchProvider: SearchProvider = {
  id: 'clipboard',
  group: 'Portapapeles',
  pluginId: 'utilities',
  async search(query) {
    const out: SearchItem[] = []
    if (!query) return out

    if (OCR.test(query) || scoreMatch(query, 'Copiar texto de la imagen del portapapeles', 'ocr texto imagen captura leer') >= 50) {
      out.push({
        id: 'clipboard:ocr', title: 'Copiar texto de la imagen del portapapeles', subtitle: 'Recortá con Win+Shift+S antes',
        icon: ScanText, hint: 'Enter', score: 120,
        run: async (ctx) => {
          const r = await clipboardApi.ocrImage()
          ctx.notify(r.ok ? 'Texto copiado' : r.reason ?? 'No se pudo leer', r.ok ? 'success' : 'error')
        },
      })
    }

    if (query.length >= 3) {
      for (const t of TRANSFORMS) {
        const score = scoreMatch(query, t.label, 'transformar portapapeles convertir pegar')
        if (score < 50) continue
        out.push({
          id: `clipboard:t:${t.id}`, title: `Portapapeles → ${t.label}`, subtitle: 'Transforma lo que tenés copiado',
          icon: Wand2, hint: 'Enter', score,
          run: async (ctx) => {
            const text = await navigator.clipboard.readText()
            if (!text.trim()) { ctx.notify('No hay texto en el portapapeles', 'error'); return }
            await navigator.clipboard.writeText(t.apply(text))
            ctx.notify(`Listo para pegar (${t.label})`, 'success')
          },
        })
      }
    }

    const browse = BROWSE.test(query)
    if (browse || query.length >= 3) {
      let list: ClipView[]
      try { list = await clipboardApi.list() } catch { return out }
      const found = browse ? list.slice(0, 8) : list.filter((e) => !e.sensitive && matchesQuery(query, e.text)).slice(0, 3)
      out.push(...found.map((e, i): SearchItem => ({
        id: `clipboard:${e.id}`,
        title: e.sensitive ? e.masked ?? '••••' : clipPreview(e.text, 70),
        subtitle: [e.sensitive ? 'Oculto' : KIND_LABEL[e.kind ?? detectKind(e.text)], e.app, clipAge(e.at)].filter(Boolean).join(' · '),
        icon: e.sensitive ? Lock : ClipboardText,
        hint: 'Enter copia',
        score: browse ? 100 - i : 0,
        run: async (ctx) => {
          await clipboardApi.copy(e.id)
          ctx.notify('Copiado', 'success')
        },
      })))
    }
    return out
  },
}
