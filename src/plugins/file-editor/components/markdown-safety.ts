/**
 * Privacidad de la vista previa de Markdown (Editor y Notas): nada se descarga de
 * internet sin un clic. Las imágenes remotas se cambian por un botón "Cargar imagen
 * remota" (main la baja con `app:fetch-remote-image` y devuelve un data: URL); iframes,
 * video/audio, srcset y `url(…)` remotos en estilos se quitan.
 * Lógica pura (sin DOM) para poder testearla; el DOM se toca en `sanitizeMarkdownHtml`.
 */
import DOMPurify from 'dompurify'

/** http(s) o protocol-relative (`//host/x.png`). */
export function isRemoteUrl(u: string | null | undefined): boolean {
  return !!u && /^\s*(?:https?:)?\/\//i.test(u)
}

/** `style` con `url(http…)` / `url(//…)` (fondos, bordes, cursores remotos). */
export function hasRemoteCssUrl(style: string | null | undefined): boolean {
  return !!style && /url\s*\(\s*['"]?\s*(?:https?:)?\/\//i.test(style)
}

/** Host para el texto del botón ("Cargar imagen remota · ejemplo.com"). */
export function remoteHost(u: string): string {
  try { return new URL(u.trim().startsWith('//') ? `https:${u.trim()}` : u.trim()).host } catch { return '' }
}

export const FORBID_TAGS = ['iframe', 'frame', 'frameset', 'object', 'embed', 'video', 'audio', 'source', 'track', 'picture', 'link', 'meta', 'base', 'form']
export const FORBID_ATTR = ['srcset', 'poster', 'background', 'ping', 'formaction', 'xlink:href']

let purifier: ReturnType<typeof DOMPurify> | null = null

function getPurifier(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier
  // Instancia propia: los hooks no afectan a otros usos de DOMPurify (Novedades, Acerca de).
  const p = DOMPurify(window)
  p.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element
    if (typeof el.getAttribute !== 'function') return
    if (hasRemoteCssUrl(el.getAttribute('style'))) el.removeAttribute('style')
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src')
      if (isRemoteUrl(src)) {
        el.removeAttribute('src')
        el.setAttribute('data-remote-src', (src ?? '').trim())
      }
    }
    // SVG inline: <image href="https://…">
    if (el.tagName.toLowerCase() === 'image' && isRemoteUrl(el.getAttribute('href'))) el.removeAttribute('href')
  })
  purifier = p
  return p
}

/**
 * HTML ya saneado. Cada `img` remota pasa a ser un botón con `data-remote-src`, salvo
 * que `loaded` ya tenga su data: URL (el usuario la cargó antes).
 */
export function sanitizeMarkdownHtml(raw: string, loaded: ReadonlyMap<string, string>): string {
  const frag = getPurifier().sanitize(raw, { FORBID_TAGS, FORBID_ATTR, RETURN_DOM_FRAGMENT: true })
  for (const img of Array.from(frag.querySelectorAll('img[data-remote-src]'))) {
    const src = img.getAttribute('data-remote-src') ?? ''
    const data = loaded.get(src)
    if (data) {
      img.setAttribute('src', data)
      continue
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'md-remote-img'
    btn.setAttribute('data-remote-src', src)
    const host = remoteHost(src)
    btn.textContent = host ? `Cargar imagen remota · ${host}` : 'Cargar imagen remota'
    const alt = img.getAttribute('alt')
    if (alt) btn.title = alt
    img.replaceWith(btn)
  }
  const box = document.createElement('div')
  box.appendChild(frag)
  return box.innerHTML
}
