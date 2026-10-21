import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ZoomIn } from 'lucide-react'
import { EditorView, basicSetup } from 'codemirror'
import { Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { Modal } from '../../core/components/Modal'
import { EditorState, type Extension } from '@codemirror/state'
import { StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { rust } from '@codemirror/lang-rust'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import type { SnippetLanguage } from './types'

function langExtension(lang: SnippetLanguage): Extension | null {
  switch (lang) {
    case 'javascript': return javascript()
    case 'typescript': return javascript({ typescript: true })
    case 'json':       return json()
    case 'html':       return html()
    case 'css':        return css()
    case 'sql':        return sql()
    case 'markdown':   return markdown()
    case 'yaml':       return yaml()
    case 'python':     return python()
    case 'xml':        return xml()
    case 'java':       return java()
    case 'csharp':     return cpp()
    case 'rust':       return rust()
    case 'bash':
    case 'sh':         return StreamLanguage.define(shell)
    case 'powershell': return StreamLanguage.define(powerShell)
    default:           return null
  }
}

/** Token-based CodeMirror chrome: transparent background, hairline gutter. */
const tokenTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent', color: 'rgb(var(--c-on-surface))' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "'JetBrains Mono','Cascadia Code','Fira Code',Consolas,monospace", lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { padding: '14px 0', caretColor: 'rgb(var(--c-primary))' },
  // Opaco: con scroll horizontal el código pasa por debajo de los números de línea.
  '.cm-gutters': { backgroundColor: 'rgb(var(--c-surface))', color: 'rgb(var(--c-on-surface-variant) / 0.5)', borderRight: '1px solid var(--hairline)', paddingLeft: '6px', zIndex: '3' },
  '.cm-snippet-var': { backgroundColor: 'rgb(var(--c-primary) / 0.12)', color: 'rgb(var(--c-primary))', borderRadius: '4px', boxShadow: '0 0 0 1px rgb(var(--c-primary) / 0.25)', fontWeight: '600' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(var(--c-on-surface) / 0.035)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(var(--c-primary) / 0.22) !important' },
  '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'rgb(var(--c-on-surface-variant))' },
})

/** Variables `{{nombre}}` / `{{nombre:valor}}` resaltadas: se ve qué te va a pedir al copiar. */
const varMatcher = new MatchDecorator({ regexp: /\{\{[^{}\n]+\}\}/g, decoration: Decoration.mark({ class: 'cm-snippet-var' }) })
const highlightVars = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = varMatcher.createDeco(view) }
  update(u: ViewUpdate): void { this.decorations = varMatcher.updateDeco(u, this.decorations) }
}, { decorations: (v) => v.decorations })

export function CodeViewer({ content, language, dark }: { content: string; language: SnippetLanguage; dark: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const ext = langExtension(language)
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          ...(ext ? [ext] : []),
          ...(dark ? [syntaxHighlighting(oneDarkHighlightStyle)] : []),
          highlightVars,
          tokenTheme,
        ],
      }),
      parent: ref.current,
    })
    return () => view.destroy()
  }, [content, language, dark])

  return <div ref={ref} className="h-full overflow-hidden" />
}

// ── Mixed content (text + pasted images) ─────────────────────────────────────

type ContentBlock = { type: 'text'; value: string } | { type: 'image'; value: string }

export const IMAGE_MARKER_RE = /!\[\]\((data:image\/[^)]+)\)/g

function parseContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(IMAGE_MARKER_RE.source, 'g')
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) blocks.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    blocks.push({ type: 'image', value: match[1]! })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) blocks.push({ type: 'text', value: content.slice(lastIndex) })
  return blocks
}

export function hasImages(content: string): boolean {
  return /!\[\]\(data:image\//.test(content)
}

/** Copia una imagen (data URL) al portapapeles como PNG. */
export async function copyImage(dataUrl: string): Promise<void> {
  let blob = await (await fetch(dataUrl)).blob()
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    c.getContext('2d')!.drawImage(bmp, 0, 0)
    blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo convertir la imagen'))), 'image/png'))
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/** Imagen del snippet: clic la agranda; botones para copiarla o verla grande. */
function ImageCard({ src, n, onZoom }: { src: string; n: number; onZoom: () => void }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = (): void => { void copyImage(src).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }, () => undefined) }
  return (
    <figure className="group relative w-fit max-w-full mx-auto rounded-[12px] overflow-hidden ring-1 ring-(--hairline-strong) bg-on-surface/[0.03]">
      <img src={src} alt={`Imagen ${n}`} onClick={onZoom} className="block max-w-full object-contain cursor-zoom-in" style={{ maxHeight: 420 }} />
      <figcaption className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={copy} title="Copiar imagen" className="ui-btn ui-btn-sm bg-surface/90! backdrop-blur ring-1 ring-(--hairline-strong)">
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />} {copied ? 'Copiada' : 'Copiar'}
        </button>
        <button type="button" onClick={onZoom} title="Ver grande" aria-label="Ver grande" className="ui-btn ui-btn-sm ui-btn-icon bg-surface/90! backdrop-blur ring-1 ring-(--hairline-strong)"><ZoomIn size={13} /></button>
      </figcaption>
    </figure>
  )
}

export function MixedContentViewer({ content }: { content: string }): JSX.Element {
  const blocks = useMemo(() => parseContent(content), [content])
  const [zoom, setZoom] = useState<string | null>(null)
  let n = 0
  return (
    <div className="h-full overflow-auto px-6 py-5 space-y-4">
      {blocks.map((block, i) => {
        if (block.type === 'image') { const k = ++n; return <ImageCard key={i} src={block.value} n={k} onZoom={() => setZoom(block.value)} /> }
        return block.value.trim() ? (
          <pre key={i} className="t-footnote font-mono leading-relaxed text-on-surface whitespace-pre-wrap wrap-break-word">{block.value.replace(/^\n+|\n+$/g, '')}</pre>
        ) : null
      })}
      <Modal open={!!zoom} onClose={() => setZoom(null)} width={1100}>
        {zoom && <img src={zoom} alt="" className="block max-w-full max-h-[75vh] mx-auto object-contain rounded-[8px]" />}
      </Modal>
    </div>
  )
}
