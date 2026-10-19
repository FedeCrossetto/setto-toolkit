import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { sanitizeMarkdownHtml } from './markdown-safety'

/** Imágenes remotas que el usuario ya cargó (URL → data:), por sesión. */
const loadedRemote = new Map<string, string>()

/**
 * Render de Markdown en vivo (split view del editor y vista previa de Notas).
 * El HTML pasa por DOMPurify — los .md abiertos pueden venir de cualquier lado — y no
 * descarga nada de internet: las imágenes remotas se cargan sólo con un clic
 * (ver markdown-safety.ts).
 */
export function MarkdownPreview({ content }: { content: string }): JSX.Element {
  const [loadedVersion, setLoadedVersion] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false, gfm: true, breaks: false })
    return sanitizeMarkdownHtml(raw, loadedRemote)
    // loadedVersion: volver a armar el HTML cuando se carga una imagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, loadedVersion])

  // Clic en "Cargar imagen remota" (listener nativo: el HTML no lo maneja React).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClick = (e: MouseEvent): void => {
      const btn = (e.target as Element | null)?.closest?.('button.md-remote-img')
      if (!(btn instanceof HTMLButtonElement) || !el.contains(btn)) return
      e.preventDefault()
      e.stopPropagation()
      const url = btn.getAttribute('data-remote-src') ?? ''
      if (!url || btn.disabled) return
      btn.disabled = true
      btn.textContent = 'Cargando imagen…'
      window.api.invoke<{ ok: true; dataUrl: string } | { ok: false; error: string }>('app:fetch-remote-image', url)
        .then((r) => {
          if (r.ok) {
            loadedRemote.set(url, r.dataUrl)
            setLoadedVersion((v) => v + 1)
          } else {
            btn.disabled = false
            btn.textContent = `No se pudo cargar (${r.error}) · reintentar`
          }
        })
        .catch(() => { btn.disabled = false; btn.textContent = 'No se pudo cargar · reintentar' })
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [])

  return (
    <div
      ref={ref}
      className="md-preview h-full overflow-y-auto px-8 py-6 t-body leading-relaxed text-on-surface select-text"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
