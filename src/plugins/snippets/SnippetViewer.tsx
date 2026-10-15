import { useEffect, useMemo, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
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
  '.cm-gutters': { backgroundColor: 'rgb(var(--c-on-surface) / 0.02)', color: 'rgb(var(--c-on-surface-variant) / 0.5)', borderRight: '1px solid var(--hairline)', paddingLeft: '6px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgb(var(--c-on-surface) / 0.035)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(var(--c-primary) / 0.22) !important' },
  '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'rgb(var(--c-on-surface-variant))' },
})

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

export function MixedContentViewer({ content }: { content: string }): JSX.Element {
  const blocks = useMemo(() => parseContent(content), [content])
  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      {blocks.map((block, i) =>
        block.type === 'image' ? (
          <div key={i} className="flex justify-center">
            <img src={block.value} alt="" className="max-w-full rounded-lg hairline object-contain" style={{ maxHeight: 400 }} />
          </div>
        ) : block.value.trim() ? (
          <pre key={i} className="t-footnote font-mono text-on-surface whitespace-pre-wrap wrap-break-word">{block.value}</pre>
        ) : null,
      )}
    </div>
  )
}
