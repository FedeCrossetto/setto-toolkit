import { useEffect, useRef, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, RangeSetBuilder, Compartment } from '@codemirror/state'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { ViewPlugin, Decoration, keymap, gutter, GutterMarker } from '@codemirror/view'
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
import { tags } from '@lezer/highlight'
import type { EditorHandle, FileLanguage, GitLineDiff } from '../types'
import type { EditorColorScheme } from '../hooks/useEditorPrefs'

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

// ── Nexus palette ─────────────────────────────────────────────────────────────
const C = {
  primary:   '#5347CE', secondary: '#a89bff',
  accent:    '#2adfdd', blue:      '#6ba8ff',
  text:      '#eef0ff', muted:     '#84849c',
  border:    'rgb(83 71 206 / 0.2)',
}

// ── Aurora palette (dark navy + pink/violet/cyan accents) ─────────────────────
const AU = {
  string:   '#FFB870', // warm amber
  property: '#7FE0C8', // teal
  number:   '#FFB870', // amber
  keyword:  '#8B93FF', // blue-violet
  func:     '#FF6FA8', // pink/magenta — macros, function & type calls
  type:     '#5CCFE6', // cyan
  bracket:  '#9DA3C2', // soft lavender-grey
  comment:  '#5B6178', // muted slate
  text:     '#E4E6F1', // off-white
  muted:    '#3A3D52', // dark muted
}

// ── Dracula palette (canonical) ────────────────────────────────────────────────
const DR = {
  string:   '#F1FA8C', // yellow
  property: '#FFB86C', // orange (parameters/properties)
  number:   '#BD93F9', // purple
  keyword:  '#FF79C6', // pink
  func:     '#50FA7B', // green
  type:     '#8BE9FD', // cyan
  bracket:  '#F8F8F2', // foreground
  comment:  '#6272A4', // muted blue-grey
  text:     '#F8F8F2', // foreground
  muted:    '#44475A', // current-line grey
}

// ── Monokai palette (canonical) ────────────────────────────────────────────────
const MK = {
  string:   '#E6DB74', // yellow
  property: '#FD971F', // orange
  number:   '#AE81FF', // purple
  keyword:  '#F92672', // pink/red
  func:     '#A6E22E', // green
  type:     '#66D9EF', // blue/cyan
  bracket:  '#F8F8F2', // foreground
  comment:  '#75715E', // olive grey
  text:     '#F8F8F2', // foreground
  muted:    '#49483E', // dark olive
}

// ── HTTPie / Tokyo Night palette ──────────────────────────────────────────────
const H = {
  string:   '#9ece6a', // green
  property: '#e0af68', // gold
  number:   '#ff9e64', // orange
  keyword:  '#bb9af7', // purple
  func:     '#7aa2f7', // blue
  type:     '#2ac3de', // cyan
  bracket:  '#89ddff', // light cyan
  comment:  '#565f89', // muted blue-gray
  text:     '#c0caf5', // lavender white
  muted:    '#414868', // dark muted
}

/** Plain-text (.txt, .cfg) accents — lime instead of blue */
const TXT_LIME_DARK  = '#BEF264'
const TXT_LIME_LIGHT = '#4D7C0F'

// ── Syntax highlights ─────────────────────────────────────────────────────────
const nexusDarkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword],                color: C.secondary },
  { tag: [tags.controlKeyword, tags.moduleKeyword],           color: C.secondary, fontStyle: 'italic' },
  { tag: tags.definitionKeyword,                              color: C.secondary },
  { tag: [tags.string, tags.special(tags.string)],            color: C.accent },
  { tag: tags.regexp,                                         color: C.accent },
  { tag: tags.escape,                                         color: C.blue },
  { tag: [tags.number, tags.integer, tags.float],             color: C.blue },
  { tag: [tags.bool, tags.null],                              color: C.secondary },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: C.muted, fontStyle: 'italic' },
  { tag: tags.operator,                                       color: '#c5c6e0' },
  { tag: [tags.punctuation, tags.separator],                  color: '#9b9cc0' },
  { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: '#aaabd0' },
  { tag: tags.typeName,                                       color: C.blue },
  { tag: tags.className,                                      color: C.blue, fontWeight: 'bold' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#e6e7f5' },
  { tag: tags.definition(tags.variableName),                  color: C.text },
  { tag: tags.variableName,                                   color: C.text },
  { tag: tags.propertyName,                                   color: '#c0c6ec' },
  { tag: tags.namespace,                                      color: C.blue },
  { tag: tags.tagName,                                        color: C.secondary },
  { tag: tags.attributeName,                                  color: C.blue },
  { tag: tags.attributeValue,                                 color: C.accent },
  { tag: [tags.heading, tags.heading1, tags.heading2],        color: C.secondary, fontWeight: 'bold' },
  { tag: tags.emphasis,                                       color: C.accent, fontStyle: 'italic' },
  { tag: tags.strong,                                         color: C.text, fontWeight: 'bold' },
  { tag: [tags.link, tags.url],                               color: C.blue, textDecoration: 'underline' },
  { tag: tags.color,                                          color: C.accent },
  { tag: tags.unit,                                           color: C.blue },
  { tag: tags.invalid,                                        color: '#ff5555', textDecoration: 'underline wavy' },
])

const nexusLightHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword],                color: '#5347CE' },
  { tag: [tags.controlKeyword, tags.moduleKeyword],           color: '#5347CE', fontStyle: 'italic' },
  { tag: tags.definitionKeyword,                              color: '#5347CE' },
  { tag: [tags.string, tags.special(tags.string)],            color: '#0a9e9e' },
  { tag: tags.regexp,                                         color: '#0a9e9e' },
  { tag: tags.escape,                                         color: '#2b7adf' },
  { tag: [tags.number, tags.integer, tags.float],             color: '#2b7adf' },
  { tag: [tags.bool, tags.null],                              color: '#5347CE' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#8890aa', fontStyle: 'italic' },
  { tag: tags.operator,                                       color: '#3f3f66' },
  { tag: [tags.punctuation, tags.separator],                  color: '#5c5e82' },
  { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: '#52527a' },
  { tag: tags.typeName,                                       color: '#2b7adf' },
  { tag: tags.className,                                      color: '#2b7adf', fontWeight: 'bold' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#1a1a3a' },
  { tag: tags.definition(tags.variableName),                  color: '#1a1a3a' },
  { tag: tags.variableName,                                   color: '#2a2a50' },
  { tag: tags.propertyName,                                   color: '#444470' },
  { tag: tags.tagName,                                        color: '#5347CE' },
  { tag: tags.attributeName,                                  color: '#2b7adf' },
  { tag: tags.attributeValue,                                 color: '#0a9e9e' },
  { tag: [tags.heading, tags.heading1, tags.heading2],        color: '#5347CE', fontWeight: 'bold' },
  { tag: tags.emphasis,                                       color: '#0a9e9e', fontStyle: 'italic' },
  { tag: tags.strong,                                         color: '#1a1a3a', fontWeight: 'bold' },
  { tag: [tags.link, tags.url],                               color: '#2b7adf', textDecoration: 'underline' },
  { tag: tags.color,                                          color: '#0a9e9e' },
  { tag: tags.unit,                                           color: '#2b7adf' },
  { tag: tags.invalid,                                        color: '#cc0000', textDecoration: 'underline wavy' },
])

// ── HTTPie / Tokyo Night highlight styles ─────────────────────────────────────
const httpieDarkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword],                color: H.keyword },
  { tag: [tags.controlKeyword, tags.moduleKeyword],           color: H.keyword, fontStyle: 'italic' },
  { tag: tags.definitionKeyword,                              color: H.keyword },
  { tag: [tags.string, tags.special(tags.string)],            color: H.string },
  { tag: tags.regexp,                                         color: H.string },
  { tag: tags.escape,                                         color: H.bracket },
  { tag: [tags.number, tags.integer, tags.float],             color: H.number },
  { tag: [tags.bool, tags.null],                              color: H.keyword },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: H.comment, fontStyle: 'italic' },
  { tag: tags.operator,                                       color: H.bracket },
  { tag: [tags.punctuation, tags.separator],                  color: H.muted },
  { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: H.bracket },
  { tag: tags.typeName,                                       color: H.type },
  { tag: tags.className,                                      color: H.type, fontWeight: 'bold' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: H.func },
  { tag: tags.definition(tags.variableName),                  color: H.text },
  { tag: tags.variableName,                                   color: H.text },
  { tag: tags.propertyName,                                   color: H.property },
  { tag: tags.namespace,                                      color: H.type },
  { tag: tags.tagName,                                        color: H.func },
  { tag: tags.attributeName,                                  color: H.property },
  { tag: tags.attributeValue,                                 color: H.string },
  { tag: [tags.heading, tags.heading1, tags.heading2],        color: H.func, fontWeight: 'bold' },
  { tag: tags.emphasis,                                       color: H.string, fontStyle: 'italic' },
  { tag: tags.strong,                                         color: H.text, fontWeight: 'bold' },
  { tag: [tags.link, tags.url],                               color: H.func, textDecoration: 'underline' },
  { tag: tags.color,                                          color: H.string },
  { tag: tags.unit,                                           color: H.number },
  { tag: tags.invalid,                                        color: '#f7768e', textDecoration: 'underline wavy' },
])

const httpieLightHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword],                color: '#7c3aed' },
  { tag: [tags.controlKeyword, tags.moduleKeyword],           color: '#7c3aed', fontStyle: 'italic' },
  { tag: tags.definitionKeyword,                              color: '#7c3aed' },
  { tag: [tags.string, tags.special(tags.string)],            color: '#16a34a' },
  { tag: tags.regexp,                                         color: '#16a34a' },
  { tag: tags.escape,                                         color: '#0284c7' },
  { tag: [tags.number, tags.integer, tags.float],             color: '#c2410c' },
  { tag: [tags.bool, tags.null],                              color: '#7c3aed' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#94a3b8', fontStyle: 'italic' },
  { tag: tags.operator,                                       color: '#475569' },
  { tag: [tags.punctuation, tags.separator],                  color: '#64748b' },
  { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: '#0284c7' },
  { tag: tags.typeName,                                       color: '#0369a1' },
  { tag: tags.className,                                      color: '#0369a1', fontWeight: 'bold' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#1d4ed8' },
  { tag: tags.definition(tags.variableName),                  color: '#1e293b' },
  { tag: tags.variableName,                                   color: '#1e293b' },
  { tag: tags.propertyName,                                   color: '#92400e' },
  { tag: tags.tagName,                                        color: '#1d4ed8' },
  { tag: tags.attributeName,                                  color: '#92400e' },
  { tag: tags.attributeValue,                                 color: '#16a34a' },
  { tag: [tags.heading, tags.heading1, tags.heading2],        color: '#1d4ed8', fontWeight: 'bold' },
  { tag: tags.emphasis,                                       color: '#16a34a', fontStyle: 'italic' },
  { tag: tags.strong,                                         color: '#1e293b', fontWeight: 'bold' },
  { tag: [tags.link, tags.url],                               color: '#1d4ed8', textDecoration: 'underline' },
  { tag: tags.color,                                          color: '#16a34a' },
  { tag: tags.unit,                                           color: '#c2410c' },
  { tag: tags.invalid,                                        color: '#dc2626', textDecoration: 'underline wavy' },
])

const auroraDarkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword],                color: AU.keyword },
  { tag: [tags.controlKeyword, tags.moduleKeyword],           color: AU.keyword, fontStyle: 'italic' },
  { tag: tags.definitionKeyword,                              color: AU.keyword },
  { tag: [tags.string, tags.special(tags.string)],            color: AU.string },
  { tag: tags.regexp,                                         color: AU.string },
  { tag: tags.escape,                                         color: AU.bracket },
  { tag: [tags.number, tags.integer, tags.float],             color: AU.number },
  { tag: [tags.bool, tags.null],                              color: AU.keyword },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: AU.comment, fontStyle: 'italic' },
  { tag: tags.operator,                                       color: AU.bracket },
  { tag: [tags.punctuation, tags.separator],                  color: AU.muted },
  { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: AU.bracket },
  { tag: tags.typeName,                                       color: AU.type },
  { tag: tags.className,                                      color: AU.type, fontWeight: 'bold' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: AU.func },
  { tag: tags.definition(tags.variableName),                  color: AU.text },
  { tag: tags.variableName,                                   color: AU.text },
  { tag: tags.propertyName,                                   color: AU.property },
  { tag: tags.namespace,                                      color: AU.type },
  { tag: tags.tagName,                                        color: AU.func },
  { tag: tags.attributeName,                                  color: AU.property },
  { tag: tags.attributeValue,                                 color: AU.string },
  { tag: [tags.heading, tags.heading1, tags.heading2],        color: AU.func, fontWeight: 'bold' },
  { tag: tags.emphasis,                                       color: AU.string, fontStyle: 'italic' },
  { tag: tags.strong,                                         color: AU.text, fontWeight: 'bold' },
  { tag: [tags.link, tags.url],                               color: AU.func, textDecoration: 'underline' },
  { tag: tags.color,                                          color: AU.string },
  { tag: tags.unit,                                           color: AU.number },
  { tag: tags.invalid,                                        color: '#ff5c7a', textDecoration: 'underline wavy' },
])

const auroraLightHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword],                color: '#5B5FE0' },
  { tag: [tags.controlKeyword, tags.moduleKeyword],           color: '#5B5FE0', fontStyle: 'italic' },
  { tag: tags.definitionKeyword,                              color: '#5B5FE0' },
  { tag: [tags.string, tags.special(tags.string)],            color: '#C2660A' },
  { tag: tags.regexp,                                         color: '#C2660A' },
  { tag: tags.escape,                                         color: '#0E7681' },
  { tag: [tags.number, tags.integer, tags.float],             color: '#C2660A' },
  { tag: [tags.bool, tags.null],                              color: '#5B5FE0' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#8A8F9E', fontStyle: 'italic' },
  { tag: tags.operator,                                       color: '#5B6178' },
  { tag: [tags.punctuation, tags.separator],                  color: '#6B7187' },
  { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: '#0E7681' },
  { tag: tags.typeName,                                       color: '#0E7681' },
  { tag: tags.className,                                      color: '#0E7681', fontWeight: 'bold' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#D6336C' },
  { tag: tags.definition(tags.variableName),                  color: '#1E2030' },
  { tag: tags.variableName,                                   color: '#1E2030' },
  { tag: tags.propertyName,                                   color: '#0F8A6E' },
  { tag: tags.tagName,                                        color: '#D6336C' },
  { tag: tags.attributeName,                                  color: '#0F8A6E' },
  { tag: tags.attributeValue,                                 color: '#C2660A' },
  { tag: [tags.heading, tags.heading1, tags.heading2],        color: '#D6336C', fontWeight: 'bold' },
  { tag: tags.emphasis,                                       color: '#C2660A', fontStyle: 'italic' },
  { tag: tags.strong,                                         color: '#1E2030', fontWeight: 'bold' },
  { tag: [tags.link, tags.url],                               color: '#D6336C', textDecoration: 'underline' },
  { tag: tags.color,                                          color: '#C2660A' },
  { tag: tags.unit,                                           color: '#C2660A' },
  { tag: tags.invalid,                                        color: '#dc2626', textDecoration: 'underline wavy' },
])

function buildHighlight(P: typeof AU, invalid: string) {
  return HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword],                color: P.keyword },
    { tag: [tags.controlKeyword, tags.moduleKeyword],           color: P.keyword, fontStyle: 'italic' },
    { tag: tags.definitionKeyword,                              color: P.keyword },
    { tag: [tags.string, tags.special(tags.string)],            color: P.string },
    { tag: tags.regexp,                                         color: P.string },
    { tag: tags.escape,                                         color: P.bracket },
    { tag: [tags.number, tags.integer, tags.float],             color: P.number },
    { tag: [tags.bool, tags.null],                              color: P.keyword },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: P.comment, fontStyle: 'italic' },
    { tag: tags.operator,                                       color: P.bracket },
    { tag: [tags.punctuation, tags.separator],                  color: P.muted },
    { tag: [tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: P.bracket },
    { tag: tags.typeName,                                       color: P.type },
    { tag: tags.className,                                      color: P.type, fontWeight: 'bold' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: P.func },
    { tag: tags.definition(tags.variableName),                  color: P.text },
    { tag: tags.variableName,                                   color: P.text },
    { tag: tags.propertyName,                                   color: P.property },
    { tag: tags.namespace,                                      color: P.type },
    { tag: tags.tagName,                                        color: P.func },
    { tag: tags.attributeName,                                  color: P.property },
    { tag: tags.attributeValue,                                 color: P.string },
    { tag: [tags.heading, tags.heading1, tags.heading2],        color: P.func, fontWeight: 'bold' },
    { tag: tags.emphasis,                                       color: P.string, fontStyle: 'italic' },
    { tag: tags.strong,                                         color: P.text, fontWeight: 'bold' },
    { tag: [tags.link, tags.url],                               color: P.func, textDecoration: 'underline' },
    { tag: tags.color,                                          color: P.string },
    { tag: tags.unit,                                           color: P.number },
    { tag: tags.invalid,                                        color: invalid, textDecoration: 'underline wavy' },
  ])
}

const draculaHighlight = buildHighlight(DR, '#ff5555')
const monokaiHighlight = buildHighlight(MK, '#f92672')

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
          const keyStart   = line.from + kvMatch[1].length
          const keyEnd     = keyStart  + kvMatch[2].length
          const sepEnd     = keyEnd    + kvMatch[3].length
          const valStart   = sepEnd
          const valEnd     = line.to

          b.add(keyStart, keyEnd, Decoration.mark({ class: 'cm-ini-key' }))

          if (valStart < valEnd) {
            const val = kvMatch[4]
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

// ── Log line coloring ─────────────────────────────────────────────────────────
const LOG_LEVELS = [
  { re: /\b(ERROR|FATAL|CRITICAL|SEVERE)\b/i, cls: 'cm-log-error' },
  { re: /\b(WARN|WARNING)\b/i,                cls: 'cm-log-warn'  },
  { re: /\b(INFO|INFORMATION|SUCCESS)\b/i,    cls: 'cm-log-info'  },
  { re: /\b(DEBUG)\b/i,                       cls: 'cm-log-debug' },
  { re: /\b(TRACE)\b/i,                       cls: 'cm-log-trace' },
]

const logLineTheme = EditorView.theme({
  '.cm-log-error': { backgroundColor: 'rgb(239 68 68 / 0.09)', borderLeft: '2px solid rgb(239 68 68 / 0.5)' },
  '.cm-log-warn':  { backgroundColor: 'rgb(234 179 8 / 0.09)',  borderLeft: '2px solid rgb(234 179 8 / 0.5)'  },
  '.cm-log-info':  { backgroundColor: 'rgb(72 150 254 / 0.07)', borderLeft: '2px solid rgb(72 150 254 / 0.4)' },
  '.cm-log-debug': { backgroundColor: 'rgb(136 124 253 / 0.05)' },
  '.cm-log-trace': { opacity: '0.6' },
})

const logColorPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        for (const { re, cls } of LOG_LEVELS) {
          if (re.test(line.text)) { b.add(line.from, line.from, Decoration.line({ class: cls })); break }
        }
        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: (v) => v.decorations })

// ── Filter highlight plugin factory ──────────────────────────────────────────
const filterTheme = EditorView.theme({
  '.cm-filter-match': { backgroundColor: 'rgb(22 200 199 / 0.13)', borderLeft: '2px solid rgb(22 200 199 / 0.7)' },
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

// ── UI themes ─────────────────────────────────────────────────────────────────
function monoStack(family: string): string {
  // `ui-monospace` → SF Mono on macOS / Cascadia on Windows: crisp modern fallbacks
  // so we never drop to the generic (Courier-like) monospace when the chosen
  // family isn't installed.
  return `'${family}', ui-monospace, 'SF Mono', 'SFMono-Regular', 'Menlo', 'Cascadia Code', 'Fira Code', 'Consolas', monospace`
}

function buildNexusDarkTheme(fontSize: number, fontFamily: string) {
  const line = 'rgb(var(--c-primary-light) / 0.08)'
  const sel = 'rgb(var(--c-primary) / 0.28)'
  const selFocus = 'rgb(var(--c-primary) / 0.34)'
  const border = 'rgb(var(--c-outline-variant) / 0.45)'
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: 'rgb(var(--c-surface))' },
    '.cm-scroller': {
      fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7',
      color: '#FFFFFF',
    },
    '.cm-content': { caretColor: 'rgb(var(--c-primary-light))' },
    '.cm-gutters': {
      backgroundColor: 'rgb(var(--c-surface))',
      borderRight: `1px solid ${border}`,
      color: 'rgb(var(--c-on-surface-variant))',
      minWidth: '44px',
    },
    '.cm-activeLineGutter': { backgroundColor: line, color: 'rgb(var(--c-on-surface-variant))' },
    '.cm-activeLine': { backgroundColor: line },
    // Code folding arrows — more visible + interactive
    '.cm-foldGutter span': { color: 'rgb(var(--c-on-surface-variant) / 0.5)', cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: 'rgb(var(--c-primary-light))' },
    // Git diff gutter
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: '#3fb950', width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: '#d29922', width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: '#f85149', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: `${sel} !important` },
    '.cm-focused .cm-selectionBackground': { backgroundColor: `${selFocus} !important` },
    '.cm-cursor': { borderLeftColor: 'rgb(var(--c-primary-light))' },
    '.cm-searchMatch': { backgroundColor: 'rgb(var(--c-secondary) / 0.22)', outline: '1px solid rgb(var(--c-secondary) / 0.45)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgb(var(--c-primary) / 0.38)' },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgb(var(--c-surface-container-high))',
      border: `1px solid ${border}`,
      color: 'rgb(var(--c-on-surface-variant))',
    },
    '.cm-tooltip': {
      backgroundColor: 'rgb(var(--c-surface-container-high))',
      border: `1px solid ${border}`,
      color: 'rgb(var(--c-on-surface))',
    },
    // ── Plain-text (.txt, .cfg) — lime accents ──────────────────────────────
    '.cm-txt-string': { color: C.accent },
    '.cm-txt-number': { color: TXT_LIME_DARK },
    '.cm-txt-bool':   { color: C.secondary },
    '.cm-txt-url':    { color: TXT_LIME_DARK, textDecoration: 'underline' },
    // ── INI / .env / .properties colors ─────────────────────────────────────
    '.cm-ini-section': { color: C.secondary, fontWeight: 'bold' },
    '.cm-ini-key':     { color: C.blue },
    '.cm-ini-value':   { color: C.accent },
    '.cm-ini-string':  { color: C.accent },
    '.cm-ini-comment': { color: C.muted, fontStyle: 'italic' },
    // ── Search / goto panel ──────────────────────────────────────────────────
    '.cm-panels': {
      backgroundColor: 'rgb(var(--c-surface-container-high))',
      borderTop: `1px solid ${border}`,
      color: 'rgb(var(--c-on-surface))',
    },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${border}`, borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': {
      fontSize: '11px',
      color: 'rgb(var(--c-on-surface-variant))',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      cursor: 'pointer',
    },
    '.cm-textfield': {
      backgroundColor: 'rgb(var(--c-surface-container-low))',
      color: 'rgb(var(--c-on-surface))',
      border: `1px solid ${border}`,
      borderRadius: '7px',
      padding: '3px 8px',
      fontSize: '12px',
      outline: 'none',
      fontFamily: monoStack(fontFamily),
    },
    '.cm-textfield:focus': {
      borderColor: 'rgb(var(--c-primary) / 0.55)',
      boxShadow: '0 0 0 2px rgb(var(--c-primary) / 0.12)',
    },
    '.cm-button': {
      backgroundColor: 'rgb(var(--c-primary) / 0.14)',
      color: 'rgb(var(--c-on-surface))',
      border: `1px solid ${border}`,
      borderRadius: '7px',
      padding: '3px 10px',
      fontSize: '11px',
      fontWeight: '500',
      cursor: 'pointer',
      backgroundImage: 'none',
    },
    '.cm-button:hover': { backgroundColor: 'rgb(var(--c-primary) / 0.24)' },
    '.cm-button:active': { backgroundColor: 'rgb(var(--c-primary) / 0.32)' },
  }, { dark: true })
}

function buildNexusLightTheme(fontSize: number, fontFamily: string) {
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: 'rgb(255 255 255)' },
    '.cm-scroller': { fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7', color: '#1a1a3a' },
    '.cm-gutters': { backgroundColor: 'rgb(244 245 249)', borderRight: '1px solid rgb(200 202 216 / 0.5)', color: 'rgb(148 151 168)', minWidth: '44px' },
    '.cm-activeLineGutter': { backgroundColor: 'rgb(236 238 244)' },
    '.cm-activeLine': { backgroundColor: 'rgb(83 71 206 / 0.04)' },
    // Code folding arrows
    '.cm-foldGutter span': { color: 'rgb(148 151 168)', cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: 'rgb(83 71 206)' },
    // Git diff gutter
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: '#2da44e', width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: '#bf8700', width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: '#cf222e', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: 'rgb(83 71 206 / 0.12) !important' },
    '.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(83 71 206 / 0.18) !important' },
    '.cm-cursor': { borderLeftColor: 'rgb(83 71 206)' },
    '.cm-searchMatch': { backgroundColor: 'rgb(72 150 254 / 0.2)', outline: '1px solid rgb(72 150 254 / 0.5)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgb(83 71 206 / 0.3)' },
    '.cm-foldPlaceholder': { backgroundColor: 'rgb(236 238 244)', border: '1px solid rgb(200 202 216)', color: 'rgb(91 94 114)' },
    // ── Plain-text (.txt, .cfg) — lime accents ──────────────────────────────
    '.cm-txt-string': { color: '#0a9e9e' },
    '.cm-txt-number': { color: TXT_LIME_LIGHT },
    '.cm-txt-bool':   { color: '#5347CE' },
    '.cm-txt-url':    { color: TXT_LIME_LIGHT, textDecoration: 'underline' },
    // ── INI / .env / .properties colors ─────────────────────────────────────
    '.cm-ini-section': { color: '#5347CE', fontWeight: 'bold' },
    '.cm-ini-key':     { color: '#2b7adf' },
    '.cm-ini-value':   { color: '#0a9e9e' },
    '.cm-ini-string':  { color: '#0a9e9e' },
    '.cm-ini-comment': { color: '#8890aa', fontStyle: 'italic' },
    // ── Search / goto panel ──────────────────────────────────────────────────
    '.cm-panels': { backgroundColor: 'rgb(244 245 249)', borderTop: '1px solid rgb(200 202 216 / 0.6)', color: 'rgb(30 30 50)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid rgb(200 202 216 / 0.6)', borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': { fontSize: '11px', color: 'rgb(100 104 130)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-textfield': {
      backgroundColor: 'rgb(255 255 255)',
      color: 'rgb(30 30 50)',
      border: '1px solid rgb(200 202 220)',
      borderRadius: '7px',
      padding: '3px 8px',
      fontSize: '12px',
      outline: 'none',
      fontFamily: monoStack(fontFamily),
    },
    '.cm-textfield:focus': { borderColor: 'rgb(83 71 206 / 0.5)', boxShadow: '0 0 0 2px rgb(83 71 206 / 0.12)' },
    '.cm-button': {
      backgroundColor: 'rgb(83 71 206 / 0.08)',
      color: 'rgb(83 71 206)',
      border: '1px solid rgb(83 71 206 / 0.25)',
      borderRadius: '7px',
      padding: '3px 10px',
      fontSize: '11px',
      fontWeight: '500',
      cursor: 'pointer',
      backgroundImage: 'none',
    },
    '.cm-button:hover': { backgroundColor: 'rgb(83 71 206 / 0.15)', borderColor: 'rgb(83 71 206 / 0.4)' },
    '.cm-button:active': { backgroundColor: 'rgb(83 71 206 / 0.25)' },
  }, { dark: false })
}

function buildHttpieDarkTheme(fontSize: number, fontFamily: string) {
  const bg = '#1a1b26', gutterBg = '#16161e', activeLine = '#1e2030'
  const sel = 'rgba(122,162,247,0.2)', selFocus = 'rgba(122,162,247,0.28)'
  const border = 'rgba(89,98,140,0.35)'
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: bg },
    '.cm-scroller': { fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7', color: H.text },
    '.cm-content': { caretColor: H.text },
    '.cm-gutters': { backgroundColor: gutterBg, borderRight: `1px solid ${border}`, color: H.comment, minWidth: '44px' },
    '.cm-activeLineGutter': { backgroundColor: activeLine, color: H.text },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-foldGutter span': { color: H.comment, cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: H.bracket },
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: '#9ece6a', width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: '#e0af68', width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: '#f7768e', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: `${sel} !important` },
    '.cm-focused .cm-selectionBackground': { backgroundColor: `${selFocus} !important` },
    '.cm-cursor': { borderLeftColor: H.text },
    '.cm-searchMatch': { backgroundColor: 'rgba(224,175,104,0.2)', outline: '1px solid rgba(224,175,104,0.5)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(187,154,247,0.3)' },
    '.cm-foldPlaceholder': { backgroundColor: gutterBg, border: `1px solid ${border}`, color: H.comment },
    '.cm-tooltip': { backgroundColor: '#24283b', border: `1px solid ${border}`, color: H.text },
    '.cm-txt-string': { color: H.string },
    '.cm-txt-number': { color: H.number },
    '.cm-txt-bool':   { color: H.keyword },
    '.cm-txt-url':    { color: H.func, textDecoration: 'underline' },
    '.cm-ini-section': { color: H.func, fontWeight: 'bold' },
    '.cm-ini-key':     { color: H.property },
    '.cm-ini-value':   { color: H.string },
    '.cm-ini-string':  { color: H.string },
    '.cm-ini-comment': { color: H.comment, fontStyle: 'italic' },
    '.cm-panels': { backgroundColor: '#24283b', borderTop: `1px solid ${border}`, color: H.text },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${border}`, borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': { fontSize: '11px', color: H.comment, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-textfield': { backgroundColor: '#16161e', color: H.text, border: `1px solid ${border}`, borderRadius: '7px', padding: '3px 8px', fontSize: '12px', outline: 'none', fontFamily: monoStack(fontFamily) },
    '.cm-textfield:focus': { borderColor: 'rgba(122,162,247,0.6)', boxShadow: '0 0 0 2px rgba(122,162,247,0.12)' },
    '.cm-button': { backgroundColor: 'rgba(122,162,247,0.12)', color: H.text, border: `1px solid ${border}`, borderRadius: '7px', padding: '3px 10px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', backgroundImage: 'none' },
    '.cm-button:hover': { backgroundColor: 'rgba(122,162,247,0.22)' },
    '.cm-button:active': { backgroundColor: 'rgba(122,162,247,0.32)' },
  }, { dark: true })
}

function buildHttpieLightTheme(fontSize: number, fontFamily: string) {
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: '#f8f8f0' },
    '.cm-scroller': { fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7', color: '#1e293b' },
    '.cm-content': { caretColor: '#1e293b' },
    '.cm-gutters': { backgroundColor: '#f0f0e8', borderRight: '1px solid rgba(0,0,0,0.08)', color: '#94a3b8', minWidth: '44px' },
    '.cm-activeLineGutter': { backgroundColor: '#e8e8e0' },
    '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
    '.cm-foldGutter span': { color: '#94a3b8', cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: '#0284c7' },
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: '#16a34a', width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: '#d97706', width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: '#dc2626', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(29,78,216,0.12) !important' },
    '.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(29,78,216,0.18) !important' },
    '.cm-cursor': { borderLeftColor: '#1e293b' },
    '.cm-searchMatch': { backgroundColor: 'rgba(146,64,14,0.12)', outline: '1px solid rgba(146,64,14,0.3)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(124,58,237,0.18)' },
    '.cm-foldPlaceholder': { backgroundColor: '#e8e8e0', border: '1px solid rgba(0,0,0,0.12)', color: '#94a3b8' },
    '.cm-tooltip': { backgroundColor: '#f0f0e8', border: '1px solid rgba(0,0,0,0.12)', color: '#1e293b' },
    '.cm-txt-string': { color: '#16a34a' },
    '.cm-txt-number': { color: '#c2410c' },
    '.cm-txt-bool':   { color: '#7c3aed' },
    '.cm-txt-url':    { color: '#1d4ed8', textDecoration: 'underline' },
    '.cm-ini-section': { color: '#1d4ed8', fontWeight: 'bold' },
    '.cm-ini-key':     { color: '#92400e' },
    '.cm-ini-value':   { color: '#16a34a' },
    '.cm-ini-string':  { color: '#16a34a' },
    '.cm-ini-comment': { color: '#94a3b8', fontStyle: 'italic' },
    '.cm-panels': { backgroundColor: '#f0f0e8', borderTop: '1px solid rgba(0,0,0,0.1)', color: '#1e293b' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid rgba(0,0,0,0.1)', borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': { fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-textfield': { backgroundColor: '#ffffff', color: '#1e293b', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '7px', padding: '3px 8px', fontSize: '12px', outline: 'none', fontFamily: monoStack(fontFamily) },
    '.cm-textfield:focus': { borderColor: 'rgba(29,78,216,0.5)', boxShadow: '0 0 0 2px rgba(29,78,216,0.1)' },
    '.cm-button': { backgroundColor: 'rgba(29,78,216,0.08)', color: '#1d4ed8', border: '1px solid rgba(29,78,216,0.25)', borderRadius: '7px', padding: '3px 10px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', backgroundImage: 'none' },
    '.cm-button:hover': { backgroundColor: 'rgba(29,78,216,0.15)' },
    '.cm-button:active': { backgroundColor: 'rgba(29,78,216,0.25)' },
  }, { dark: false })
}

function buildAuroraDarkTheme(fontSize: number, fontFamily: string) {
  const bg = '#13151D', gutterBg = '#0F1018', activeLine = '#1B1D2B'
  const sel = 'rgba(139,147,255,0.22)', selFocus = 'rgba(139,147,255,0.3)'
  const border = 'rgba(157,163,194,0.18)'
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: bg },
    '.cm-scroller': { fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7', color: AU.text },
    '.cm-content': { caretColor: AU.func },
    '.cm-gutters': { backgroundColor: gutterBg, borderRight: `1px solid ${border}`, color: AU.comment, minWidth: '44px' },
    '.cm-activeLineGutter': { backgroundColor: activeLine, color: AU.text },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-foldGutter span': { color: AU.comment, cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: AU.bracket },
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: '#7FE0C8', width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: '#FFB870', width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: '#ff5c7a', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: `${sel} !important` },
    '.cm-focused .cm-selectionBackground': { backgroundColor: `${selFocus} !important` },
    '.cm-cursor': { borderLeftColor: AU.func },
    '.cm-searchMatch': { backgroundColor: 'rgba(255,184,112,0.2)', outline: '1px solid rgba(255,184,112,0.5)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(255,111,168,0.3)' },
    '.cm-foldPlaceholder': { backgroundColor: gutterBg, border: `1px solid ${border}`, color: AU.comment },
    '.cm-tooltip': { backgroundColor: '#1B1D2B', border: `1px solid ${border}`, color: AU.text },
    '.cm-txt-string': { color: AU.string },
    '.cm-txt-number': { color: AU.number },
    '.cm-txt-bool':   { color: AU.keyword },
    '.cm-txt-url':    { color: AU.func, textDecoration: 'underline' },
    '.cm-ini-section': { color: AU.func, fontWeight: 'bold' },
    '.cm-ini-key':     { color: AU.property },
    '.cm-ini-value':   { color: AU.string },
    '.cm-ini-string':  { color: AU.string },
    '.cm-ini-comment': { color: AU.comment, fontStyle: 'italic' },
    '.cm-panels': { backgroundColor: '#1B1D2B', borderTop: `1px solid ${border}`, color: AU.text },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${border}`, borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': { fontSize: '11px', color: AU.comment, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-textfield': { backgroundColor: '#0F1018', color: AU.text, border: `1px solid ${border}`, borderRadius: '7px', padding: '3px 8px', fontSize: '12px', outline: 'none', fontFamily: monoStack(fontFamily) },
    '.cm-textfield:focus': { borderColor: 'rgba(139,147,255,0.6)', boxShadow: '0 0 0 2px rgba(139,147,255,0.12)' },
    '.cm-button': { backgroundColor: 'rgba(255,111,168,0.14)', color: AU.text, border: `1px solid ${border}`, borderRadius: '7px', padding: '3px 10px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', backgroundImage: 'none' },
    '.cm-button:hover': { backgroundColor: 'rgba(255,111,168,0.24)' },
    '.cm-button:active': { backgroundColor: 'rgba(255,111,168,0.34)' },
  }, { dark: true })
}

function buildAuroraLightTheme(fontSize: number, fontFamily: string) {
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: '#fbfaf7' },
    '.cm-scroller': { fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7', color: '#1E2030' },
    '.cm-content': { caretColor: '#D6336C' },
    '.cm-gutters': { backgroundColor: '#f3f1ea', borderRight: '1px solid rgba(0,0,0,0.08)', color: '#8A8F9E', minWidth: '44px' },
    '.cm-activeLineGutter': { backgroundColor: '#ebe8de' },
    '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
    '.cm-foldGutter span': { color: '#8A8F9E', cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: '#0E7681' },
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: '#0F8A6E', width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: '#C2660A', width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: '#dc2626', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(91,95,224,0.12) !important' },
    '.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(91,95,224,0.18) !important' },
    '.cm-cursor': { borderLeftColor: '#D6336C' },
    '.cm-searchMatch': { backgroundColor: 'rgba(194,102,10,0.12)', outline: '1px solid rgba(194,102,10,0.3)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(91,95,224,0.18)' },
    '.cm-foldPlaceholder': { backgroundColor: '#ebe8de', border: '1px solid rgba(0,0,0,0.12)', color: '#8A8F9E' },
    '.cm-tooltip': { backgroundColor: '#f3f1ea', border: '1px solid rgba(0,0,0,0.12)', color: '#1E2030' },
    '.cm-txt-string': { color: '#C2660A' },
    '.cm-txt-number': { color: '#C2660A' },
    '.cm-txt-bool':   { color: '#5B5FE0' },
    '.cm-txt-url':    { color: '#D6336C', textDecoration: 'underline' },
    '.cm-ini-section': { color: '#D6336C', fontWeight: 'bold' },
    '.cm-ini-key':     { color: '#0F8A6E' },
    '.cm-ini-value':   { color: '#C2660A' },
    '.cm-ini-string':  { color: '#C2660A' },
    '.cm-ini-comment': { color: '#8A8F9E', fontStyle: 'italic' },
    '.cm-panels': { backgroundColor: '#f3f1ea', borderTop: '1px solid rgba(0,0,0,0.1)', color: '#1E2030' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid rgba(0,0,0,0.1)', borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': { fontSize: '11px', color: '#8A8F9E', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-textfield': { backgroundColor: '#ffffff', color: '#1E2030', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '7px', padding: '3px 8px', fontSize: '12px', outline: 'none', fontFamily: monoStack(fontFamily) },
    '.cm-textfield:focus': { borderColor: 'rgba(91,95,224,0.5)', boxShadow: '0 0 0 2px rgba(91,95,224,0.1)' },
    '.cm-button': { backgroundColor: 'rgba(214,51,108,0.08)', color: '#D6336C', border: '1px solid rgba(214,51,108,0.25)', borderRadius: '7px', padding: '3px 10px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', backgroundImage: 'none' },
    '.cm-button:hover': { backgroundColor: 'rgba(214,51,108,0.15)' },
    '.cm-button:active': { backgroundColor: 'rgba(214,51,108,0.25)' },
  }, { dark: false })
}

// Dracula and Monokai are canonically dark-only themes (no official light variant) —
// they render with their dark palette regardless of the app's light/dark UI mode,
// same as picking a dark editor theme in VS Code while the OS chrome stays light.
function buildFixedDarkTheme(P: typeof AU, bg: string, gutterBg: string, activeLine: string, accent: string, fontSize: number, fontFamily: string) {
  const sel = `${accent}38`, selFocus = `${accent}50`
  const border = `${P.muted}aa`
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: bg },
    '.cm-scroller': { fontFamily: monoStack(fontFamily), fontSize: `${fontSize}px`, lineHeight: '1.7', color: P.text },
    '.cm-content': { caretColor: accent },
    '.cm-gutters': { backgroundColor: gutterBg, borderRight: `1px solid ${border}`, color: P.comment, minWidth: '44px' },
    '.cm-activeLineGutter': { backgroundColor: activeLine, color: P.text },
    '.cm-activeLine': { backgroundColor: activeLine },
    '.cm-foldGutter span': { color: P.comment, cursor: 'pointer', fontSize: '11px' },
    '.cm-foldGutter span:hover': { color: P.bracket },
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: P.func, width: '3px', height: '100%' },
    '.cm-git-changed': { backgroundColor: P.property, width: '3px', height: '100%' },
    '.cm-git-deleted': { backgroundColor: P.keyword, width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },
    '.cm-selectionBackground': { backgroundColor: `${sel} !important` },
    '.cm-focused .cm-selectionBackground': { backgroundColor: `${selFocus} !important` },
    '.cm-cursor': { borderLeftColor: accent },
    '.cm-searchMatch': { backgroundColor: `${P.string}33`, outline: `1px solid ${P.string}80` },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: `${P.keyword}4d` },
    '.cm-foldPlaceholder': { backgroundColor: gutterBg, border: `1px solid ${border}`, color: P.comment },
    '.cm-tooltip': { backgroundColor: activeLine, border: `1px solid ${border}`, color: P.text },
    '.cm-txt-string': { color: P.string },
    '.cm-txt-number': { color: P.number },
    '.cm-txt-bool':   { color: P.keyword },
    '.cm-txt-url':    { color: P.func, textDecoration: 'underline' },
    '.cm-ini-section': { color: P.func, fontWeight: 'bold' },
    '.cm-ini-key':     { color: P.property },
    '.cm-ini-value':   { color: P.string },
    '.cm-ini-string':  { color: P.string },
    '.cm-ini-comment': { color: P.comment, fontStyle: 'italic' },
    '.cm-panels': { backgroundColor: activeLine, borderTop: `1px solid ${border}`, color: P.text },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${border}`, borderBottom: 'none' },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 12px' },
    '.cm-search label': { fontSize: '11px', color: P.comment, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-textfield': { backgroundColor: gutterBg, color: P.text, border: `1px solid ${border}`, borderRadius: '7px', padding: '3px 8px', fontSize: '12px', outline: 'none', fontFamily: monoStack(fontFamily) },
    '.cm-textfield:focus': { borderColor: `${accent}99`, boxShadow: `0 0 0 2px ${accent}1f` },
    '.cm-button': { backgroundColor: `${accent}24`, color: P.text, border: `1px solid ${border}`, borderRadius: '7px', padding: '3px 10px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', backgroundImage: 'none' },
    '.cm-button:hover': { backgroundColor: `${accent}3d` },
    '.cm-button:active': { backgroundColor: `${accent}57` },
  }, { dark: true })
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

function getThemeExtensions(colorScheme: EditorColorScheme, isDark: boolean, fontSize: number, fontFamily: string) {
  switch (colorScheme) {
    case 'httpie':
      return isDark
        ? [buildHttpieDarkTheme(fontSize, fontFamily), syntaxHighlighting(httpieDarkHighlight)]
        : [buildHttpieLightTheme(fontSize, fontFamily), syntaxHighlighting(httpieLightHighlight)]
    case 'aurora':
      return isDark
        ? [buildAuroraDarkTheme(fontSize, fontFamily), syntaxHighlighting(auroraDarkHighlight)]
        : [buildAuroraLightTheme(fontSize, fontFamily), syntaxHighlighting(auroraLightHighlight)]
    case 'dracula':
      return [buildFixedDarkTheme(DR, '#282A36', '#21222C', '#44475A', '#FF79C6', fontSize, fontFamily), syntaxHighlighting(draculaHighlight)]
    case 'monokai':
      return [buildFixedDarkTheme(MK, '#272822', '#1E1F1A', '#3E3D32', '#F92672', fontSize, fontFamily), syntaxHighlighting(monokaiHighlight)]
    default:
      return isDark
        ? [buildNexusDarkTheme(fontSize, fontFamily), syntaxHighlighting(nexusDarkHighlight)]
        : [buildNexusLightTheme(fontSize, fontFamily), syntaxHighlighting(nexusLightHighlight)]
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface CodeEditorProps {
  content: string
  language: FileLanguage
  isDark: boolean
  readOnly?: boolean
  wordWrap?: boolean
  initialLine?: number
  fontSize?: number
  fontFamily?: string
  gitDiff?: GitLineDiff | null
  minimap?: boolean
  colorScheme?: EditorColorScheme
  onChange?: (value: string) => void
  onCursorChange?: (line: number, col: number) => void
  onSaveShortcut?: () => void
  onNewFileShortcut?: () => void
  onRenameShortcut?: () => void
  editorRef?: React.MutableRefObject<EditorHandle | null>
}

export function CodeEditor({
  content, language, isDark, readOnly = false, wordWrap = true,
  initialLine, fontSize = 13, fontFamily = 'SF Mono', gitDiff = null, minimap = false,
  colorScheme = 'nexus',
  onChange, onCursorChange, onSaveShortcut, onNewFileShortcut, onRenameShortcut, editorRef,
}: CodeEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef      = useRef<EditorView | null>(null)
  const filterCompartment = useRef(new Compartment())
  const gitCompartment = useRef(new Compartment())
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

  useEffect(() => {
    if (editorRef) editorRef.current = { scrollToBottom, scrollToLine, setFilter, openGotoLine }
  }, [editorRef, scrollToBottom, scrollToLine, setFilter, openGotoLine])

  // Build and mount editor
  useEffect(() => {
    if (!containerRef.current) return

    const themeExts = getThemeExtensions(colorScheme, isDark, fontSize, fontFamily)

    const listeners = EditorView.updateListener.of((u) => {
      if (u.docChanged && onChange) onChange(u.state.doc.toString())
      if ((u.selectionSet || u.docChanged) && onCursorChange) {
        const pos  = u.state.selection.main.head
        const line = u.state.doc.lineAt(pos)
        onCursorChange(line.number, pos - line.from + 1)
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
      ...themeExts,
      wordWrap ? EditorView.lineWrapping : [],
      language === 'log' ? [logLineTheme, logColorPlugin] : [],
      filterCompartment.current.of([]),
      gitCompartment.current.of(buildGitGutter(gitDiff)),
      minimap ? showMinimap.compute([], () => ({
        create: () => ({ dom: document.createElement('div') }),
        displayText: 'blocks',
        showOverlay: 'always',
      })) : [],
      EditorState.readOnly.of(readOnly),
      listeners,
    ]

    const state = EditorState.create({ doc: content, extensions })
    const view  = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    if (initialLine && initialLine > 1) {
      const line = view.state.doc.line(Math.min(initialLine, view.state.doc.lines))
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
    }

    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, isDark, readOnly, wordWrap, fontSize, fontFamily, minimap, colorScheme])

  // Update the git diff gutter without remounting the editor
  useEffect(() => {
    viewRef.current?.dispatch({ effects: gitCompartment.current.reconfigure(buildGitGutter(gitDiff)) })
  }, [gitDiff])

  // Patch content without remounting
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === content) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
  }, [content])

  return <div ref={containerRef} className="w-full h-full overflow-hidden" />
}
