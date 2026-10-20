import { useEffect, useRef, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, RangeSetBuilder, Compartment } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { ViewPlugin, Decoration, WidgetType, keymap, gutter, GutterMarker } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { gotoLine } from '@codemirror/search'
import { showMinimap } from '@replit/codemirror-minimap'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { csharp } from '@codemirror/legacy-modes/mode/clike'
import { go } from '@codemirror/legacy-modes/mode/go'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import type { EditorHandle, FileLanguage, GitLineDiff } from '../types'
import type { EditorThemeDef } from '../themes/types'
import { buildTheme } from '../themes/buildTheme'
import { logHighlight, logFilterField, setLogFilter, gotoLogLevel } from './logHighlight'
import type { LogViewState } from '../logParsing'

// ── Git diff gutter ─────────────────────────────────────────────────────────
class GitDiffMarker extends GutterMarker {
  constructor(private cls: string) { super() }
  toDOM(): HTMLElement { const el = document.createElement('div'); el.className = this.cls; return el }
}
const ADDED_MARKER   = new GitDiffMarker('cm-git-added')
const CHANGED_MARKER = new GitDiffMarker('cm-git-changed')
const DELETED_MARKER = new GitDiffMarker('cm-git-deleted')

function buildGitGutter(diff: GitLineDiff | null) {
  if (!diff || (diff.added.length === 0 && diff.changed.length === 0 && diff.deleted.length === 0)) return []
  const added = new Set(diff.added), changed = new Set(diff.changed), deleted = new Set(diff.deleted)
  return gutter({
    class: 'cm-git-gutter',
    lineMarker(view, block) {
      const ln = view.state.doc.lineAt(block.from).number
      if (added.has(ln))   return ADDED_MARKER
      if (changed.has(ln)) return CHANGED_MARKER
      if (deleted.has(ln)) return DELETED_MARKER
      return null
    },
  })
}

// ── Plain-text token highlight plugin ────────────────────────────────────────
// Patterns are applied in priority order; first match "wins" per character position
const TXT_PATTERNS: Array<{ re: RegExp; cls: string }> = [
  { re: /"(?:[^"\\]|\\.)*"/g,                                      cls: 'cm-txt-string' },
  { re: /'(?:[^'\\]|\\.)*'/g,                                      cls: 'cm-txt-string' },
  { re: /`(?:[^`\\]|\\.)*`/g,                                      cls: 'cm-txt-string' },
  { re: /https?:\/\/[^\s"'<>)[\]]+/g,                              cls: 'cm-txt-url'    },
  { re: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, cls: 'cm-txt-number' },
  { re: /\b(?:true|false|null|undefined|yes|no)\b/gi,              cls: 'cm-txt-bool'   },
]

const textHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        const ranges: Array<{ from: number; to: number; cls: string }> = []
        const covered: boolean[] = []
        for (const { re, cls } of TXT_PATTERNS) {
          re.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = re.exec(line.text)) !== null) {
            if (!covered[m.index]) {
              ranges.push({ from: line.from + m.index, to: line.from + m.index + m[0].length, cls })
              for (let i = m.index; i < m.index + m[0].length; i++) covered[i] = true
            }
          }
        }
        ranges.sort((a, r) => a.from - r.from)
        for (const r of ranges) b.add(r.from, r.to, Decoration.mark({ class: r.cls }))
        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: (v) => v.decorations })

// ── INI / properties / .env highlight plugin ─────────────────────────────────
// Handles: [section], key = value, key: value, # comment, ; comment
const iniHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        const text = line.text

        // Full-line comment: # ... or ; ...
        const commentMatch = /^\s*[#;]/.exec(text)
        if (commentMatch) {
          b.add(line.from, line.to, Decoration.mark({ class: 'cm-ini-comment' }))
          pos = line.to + 1
          continue
        }

        // Section header: [section name]
        const sectionMatch = /^\s*\[([^\]]*)\]/.exec(text)
        if (sectionMatch) {
          b.add(line.from, line.to, Decoration.mark({ class: 'cm-ini-section' }))
          pos = line.to + 1
          continue
        }

        // key = value  or  key: value  or  key value (export KEY=val)
        const kvMatch = /^(\s*(?:export\s+)?)([\w.\-/\\]+)(\s*[=:]\s*)(.*)$/.exec(text)
        if (kvMatch) {
          const keyStart   = line.from + kvMatch[1]!.length
          const keyEnd     = keyStart  + kvMatch[2]!.length
          const sepEnd     = keyEnd    + kvMatch[3]!.length
          const valStart   = sepEnd
          const valEnd     = line.to

          b.add(keyStart, keyEnd, Decoration.mark({ class: 'cm-ini-key' }))

          if (valStart < valEnd) {
            const val = kvMatch[4]!
            // Quoted value
            if (/^["'`]/.test(val)) {
              b.add(valStart, valEnd, Decoration.mark({ class: 'cm-ini-string' }))
            } else {
              // Inline comment at end of value
              const inlineComment = val.search(/\s+[#;]/)
              if (inlineComment >= 0) {
                const commentStart = valStart + inlineComment
                if (valStart < commentStart) b.add(valStart, commentStart, Decoration.mark({ class: 'cm-ini-value' }))
                b.add(commentStart, valEnd, Decoration.mark({ class: 'cm-ini-comment' }))
              } else {
                b.add(valStart, valEnd, Decoration.mark({ class: 'cm-ini-value' }))
              }
            }
          }
        }

        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: (v) => v.decorations })

// ── Color swatches (CSS/SCSS/HTML) ────────────────────────────────────────────
// Muestra un cuadradito con el color al lado de cada valor hex/rgb/hsl.
const COLOR_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgb|hsl)a?\(\s*[\d.,%\s/]+\)/g

class ColorSwatchWidget extends WidgetType {
  constructor(private readonly color: string) { super() }
  override eq(other: ColorSwatchWidget): boolean { return other.color === this.color }
  override toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-color-swatch'
    el.style.backgroundColor = this.color
    return el
  }
  override ignoreEvent(): boolean { return true }
}

function buildColorSwatches(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    for (const m of text.matchAll(COLOR_RE)) {
      const start = from + (m.index ?? 0)
      builder.add(start, start, Decoration.widget({ widget: new ColorSwatchWidget(m[0]), side: -1 }))
    }
  }
  return builder.finish()
}

const colorSwatchPlugin = [
  ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildColorSwatches(view) }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = buildColorSwatches(u.view)
    }
  }, { decorations: (v) => v.decorations }),
  EditorView.theme({
    '.cm-color-swatch': {
      display: 'inline-block',
      width: '0.85em', height: '0.85em',
      borderRadius: '3px',
      border: '1px solid var(--hairline-strong)',
      marginRight: '4px',
      verticalAlign: 'middle',
    },
  }),
]

const SWATCH_LANGUAGES = new Set(['css', 'html'])

// ── Log mode: see ./logHighlight.ts ──────────────────────────────────────────

// ── Filter highlight plugin factory ──────────────────────────────────────────
const filterTheme = EditorView.theme({
  '.cm-filter-match': { backgroundColor: 'rgb(var(--c-primary) / 0.08)', borderLeft: '2px solid rgb(var(--c-primary) / 0.6)' },
})

function buildFilterPlugin(text: string) {
  if (!text) return []
  let re: RegExp
  try { re = new RegExp(text, 'i') } catch { try { re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } catch { return [] } }

  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = this.build(view) }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
    build(view: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>()
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos)
          if (re.test(line.text)) b.add(line.from, line.from, Decoration.line({ class: 'cm-filter-match' }))
          pos = line.to + 1
        }
      }
      return b.finish()
    }
  }, { decorations: (v) => v.decorations })

  return [filterTheme, plugin]
}

// ── Spanish copy for CodeMirror's built-in panels (search, go to line, folding) ──
const CM_PHRASES_ES: Record<string, string> = {
  'Find': 'Buscar',
  'Replace': 'Reemplazar',
  'next': 'siguiente',
  'previous': 'anterior',
  'all': 'todos',
  'match case': 'mayúsculas',
  'regexp': 'regex',
  'by word': 'palabra completa',
  'replace': 'reemplazar',
  'replace all': 'reemplazar todo',
  'close': 'cerrar',
  'current match': 'coincidencia actual',
  'replaced $ matches': '$ coincidencias reemplazadas',
  'replaced match on line $': 'coincidencia reemplazada en la línea $',
  'on line': 'en la línea',
  'Go to line': 'Ir a la línea',
  'go': 'ir',
  'Folded lines': 'Líneas plegadas',
  'Unfolded lines': 'Líneas desplegadas',
  'to': 'a',
  'folded code': 'código plegado',
  'unfold': 'desplegar',
  'Fold line': 'Plegar línea',
  'Unfold line': 'Desplegar línea',
  'Selection deleted': 'Selección eliminada',
}

// ── Language extensions ───────────────────────────────────────────────────────
function getLanguageExt(lang: FileLanguage) {
  switch (lang) {
    case 'typescript': return javascript({ typescript: true, jsx: true })
    case 'javascript': return javascript({ jsx: true })
    case 'json':       return json()
    case 'html':       return html()
    case 'xml':        return xml()
    case 'css':        return css()
    case 'sql':        return sql()
    case 'markdown':   return markdown()
    case 'yaml':       return yaml()
    case 'python':     return python()
    case 'cpp':        return cpp()
    case 'java':       return java()
    case 'csharp':     return StreamLanguage.define(csharp)
    case 'rust':       return rust()
    case 'go':         return StreamLanguage.define(go)
    case 'shell':      return StreamLanguage.define(shell)
    case 'text':       return [textHighlightPlugin]
    case 'ini':        return [iniHighlightPlugin]
    default:           return []
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface CodeEditorProps {
  content: string
  language: FileLanguage
  /** Resolved theme variant (see themes/registry.ts → resolveEditorTheme) */
  theme: EditorThemeDef
  readOnly?: boolean
  wordWrap?: boolean
  initialLine?: number
  fontSize?: number
  fontFamily?: string
  gitDiff?: GitLineDiff | null
  minimap?: boolean
  onChange?: (value: string) => void
  onCursorChange?: (line: number, col: number) => void
  onSelectionChange?: (chars: number, lines: number) => void
  onSaveShortcut?: () => void
  onNewFileShortcut?: () => void
  onRenameShortcut?: () => void
  editorRef?: React.MutableRefObject<EditorHandle | null>
  /** Log mode: level tint/badges, timestamps, stack traces. Default: language === 'log' */
  logMode?: boolean
  /** Log mode filter (collapses non-matching lines). null = show everything */
  logView?: LogViewState | null
}

export function CodeEditor({
  content, language, theme, readOnly = false, wordWrap = true,
  initialLine, fontSize = 14, fontFamily = 'JetBrains Mono', gitDiff = null, minimap = false,
  onChange, onCursorChange, onSelectionChange, onSaveShortcut, onNewFileShortcut, onRenameShortcut, editorRef,
  logMode, logView = null,
}: CodeEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef      = useRef<EditorView | null>(null)
  const logActive = logMode ?? language === 'log'
  const logCompartment = useRef(new Compartment())
  const logActiveRef = useRef(logActive)
  logActiveRef.current = logActive
  const logViewRef = useRef(logView)
  logViewRef.current = logView
  const filterCompartment = useRef(new Compartment())
  const gitCompartment = useRef(new Compartment())
  // Theme + font live in a compartment: switching (or hover-previewing) a theme
  // reconfigures in place instead of remounting, so undo history and scroll survive.
  const themeCompartment = useRef(new Compartment())
  const saveShortcutRef = useRef(onSaveShortcut)
  const newFileShortcutRef = useRef(onNewFileShortcut)
  const renameShortcutRef = useRef(onRenameShortcut)

  saveShortcutRef.current = onSaveShortcut
  newFileShortcutRef.current = onNewFileShortcut
  renameShortcutRef.current = onRenameShortcut

  const scrollToBottom = useCallback(() => {
    viewRef.current?.dispatch({ effects: EditorView.scrollIntoView(viewRef.current.state.doc.length, { y: 'end' }) })
  }, [])

  const scrollToLine = useCallback((line: number) => {
    const view = viewRef.current
    if (!view) return
    const docLine = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines))
    view.dispatch({ effects: EditorView.scrollIntoView(docLine.from, { y: 'center' }) })
  }, [])

  const setFilter = useCallback((text: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: filterCompartment.current.reconfigure(buildFilterPlugin(text)) })
  }, [])

  const openGotoLine = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    view.focus()
    gotoLine(view)
  }, [])

  const getScrollDOM = useCallback(() => viewRef.current?.scrollDOM ?? null, [])
  const gotoLogError = useCallback((dir: 1 | -1) => {
    const view = viewRef.current
    return view ? gotoLogLevel(view, dir) : false
  }, [])

  useEffect(() => {
    const getSelection = (): { text: string; fromLine: number } => {
      const v = viewRef.current
      if (!v) return { text: '', fromLine: 1 }
      const { from, to } = v.state.selection.main
      return { text: v.state.sliceDoc(from, to), fromLine: v.state.doc.lineAt(from).number }
    }
    const focusLine = (line: number): void => {
      const v = viewRef.current
      if (!v) return
      const l = v.state.doc.line(Math.min(Math.max(line, 1), v.state.doc.lines))
      v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) })
      v.focus()
    }
    const insertText = (text: string): void => {
      const v = viewRef.current
      if (!v) return
      v.dispatch(v.state.replaceSelection(text))
      v.focus()
    }
    if (editorRef) editorRef.current = { scrollToBottom, scrollToLine, setFilter, openGotoLine, getScrollDOM, gotoLogError, getSelection, focusLine, insertText }
  }, [editorRef, scrollToBottom, scrollToLine, setFilter, openGotoLine, getScrollDOM, gotoLogError])

  // Build and mount editor
  useEffect(() => {
    if (!containerRef.current) return

    const listeners = EditorView.updateListener.of((u) => {
      if (u.docChanged && onChange) onChange(u.state.doc.toString())
      if ((u.selectionSet || u.docChanged) && onCursorChange) {
        const pos  = u.state.selection.main.head
        const line = u.state.doc.lineAt(pos)
        onCursorChange(line.number, pos - line.from + 1)
      }
      if (u.selectionSet && onSelectionChange) {
        const { from, to } = u.state.selection.main
        if (from === to) onSelectionChange(0, 0)
        else {
          const lines = u.state.doc.lineAt(to).number - u.state.doc.lineAt(from).number + 1
          onSelectionChange(to - from, lines)
        }
      }
    })

    const extensions = [
      keymap.of([
        { key: 'Ctrl-g', run: gotoLine },
        { key: 'Mod-s', run: () => { saveShortcutRef.current?.(); return true } },
        { key: 'Mod-t', run: () => { newFileShortcutRef.current?.(); return true } },
        { key: 'F2', run: () => { renameShortcutRef.current?.(); return true } },
      ]),   // must be before basicSetup to override defaults
      basicSetup,
      getLanguageExt(language),
      themeCompartment.current.of(buildTheme(theme, fontSize, fontFamily)),
      wordWrap ? EditorView.lineWrapping : [],
      logCompartment.current.of(logActiveRef.current ? logHighlight : []),
      logFilterField,
      SWATCH_LANGUAGES.has(language) ? colorSwatchPlugin : [],
      filterCompartment.current.of([]),
      gitCompartment.current.of(buildGitGutter(gitDiff)),
      minimap ? showMinimap.compute([], () => ({
        create: () => ({ dom: document.createElement('div') }),
        displayText: 'blocks',
        showOverlay: 'always',
      })) : [],
      EditorState.readOnly.of(readOnly),
      EditorState.phrases.of(CM_PHRASES_ES),
      listeners,
    ]

    const state = EditorState.create({ doc: content, extensions })
    const view  = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    if (logViewRef.current) view.dispatch({ effects: setLogFilter.of(logViewRef.current) })

    if (initialLine && initialLine > 1) {
      const line = view.state.doc.line(Math.min(initialLine, view.state.doc.lines))
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
    }

    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, wordWrap, minimap])

  // Swap theme / font without remounting the editor
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.current.reconfigure(buildTheme(theme, fontSize, fontFamily)) })
  }, [theme, fontSize, fontFamily])

  // Update the git diff gutter without remounting the editor
  useEffect(() => {
    viewRef.current?.dispatch({ effects: gitCompartment.current.reconfigure(buildGitGutter(gitDiff)) })
  }, [gitDiff])

  // Log mode on/off and log filter without remounting
  useEffect(() => {
    viewRef.current?.dispatch({ effects: logCompartment.current.reconfigure(logActive ? logHighlight : []) })
  }, [logActive])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setLogFilter.of(logView) })
  }, [logView])

  // Patch content without remounting
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === content) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
  }, [content])

  return <div ref={containerRef} className="w-full h-full overflow-hidden" />
}
