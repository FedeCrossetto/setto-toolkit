import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Render de Markdown en vivo para el split view del editor.
 * El HTML pasa por DOMPurify — los .md abiertos pueden venir de cualquier lado.
 */
export function MarkdownPreview({ content }: { content: string }): JSX.Element {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false, gfm: true, breaks: false })
    return DOMPurify.sanitize(raw)
  }, [content])

  return (
    <div
      className="md-preview h-full overflow-y-auto px-6 py-5 text-[13px] leading-relaxed text-on-surface select-text"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
