import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { tags as t } from '@lezer/highlight'
import type { EditorThemeDef } from './types'

/** Translucent variant of any CSS color (hex, rgb(var(--…)), …) */
export const alpha = (color: string, pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`

/**
 * Font stack: the user's choice first, then JetBrains Mono (loaded from Google Fonts in
 * index.html) and crisp system monos, so we never fall to a Courier-like generic.
 */
export function monoStack(family: string): string {
  return `'${family}', 'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', ui-monospace, 'SF Mono', 'SFMono-Regular', 'Menlo', 'Consolas', monospace`
}

function buildChrome(def: EditorThemeDef, fontSize: number, fontFamily: string): Extension {
  const c = def.colors
  const s = def.syntax
  const dark = def.variant === 'dark'
  const font = monoStack(fontFamily)
  const scrollThumb = alpha(c.fg, dark ? 18 : 22)
  return EditorView.theme({
    '&': { height: '100%', backgroundColor: c.bg, color: c.fg },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: font, fontSize: `${fontSize}px`, lineHeight: '1.65',
      fontVariantLigatures: 'contextual', fontFeatureSettings: '"calt" 1, "liga" 1',
    },
    '.cm-content': { caretColor: c.cursor, padding: '12px 0 24px' },
    '.cm-line': { padding: '0 16px 0 4px' },

    // ── Gutter: no hard border, active number highlighted, fold markers on hover ──
    '.cm-gutters': { backgroundColor: c.gutterBg, color: c.gutterFg, border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px', minWidth: '40px', fontVariantNumeric: 'tabular-nums' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c.gutterActiveFg },
    '.cm-activeLine': { backgroundColor: c.activeLine },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
    '.cm-foldGutter span': { color: c.gutterFg, opacity: '0', transition: 'opacity 120ms ease', fontSize: '0.85em' },
    '.cm-gutters:hover .cm-foldGutter span, .cm-foldGutter span[title="Desplegar línea"]': { opacity: '1' },
    '.cm-foldGutter span:hover': { color: c.fg },

    // Git diff gutter (semantic app tokens — readable on every background)
    '.cm-git-gutter': { width: '3px', minWidth: '3px', padding: '0' },
    '.cm-git-added':   { backgroundColor: 'rgb(var(--c-success))', width: '3px', height: '100%', borderRadius: '1px' },
    '.cm-git-changed': { backgroundColor: 'rgb(var(--c-warning))', width: '3px', height: '100%', borderRadius: '1px' },
    '.cm-git-deleted': { backgroundColor: 'rgb(var(--c-error))', width: '100%', height: '2px', marginTop: 'auto', borderRadius: '1px' },

    // ── Caret, selection, matches ──
    '.cm-cursor, .cm-dropCursor': { borderLeft: `2px solid ${c.cursor}`, marginLeft: '-1px' },
    '.cm-selectionBackground': { backgroundColor: `${alpha(c.selection, 70)} !important`, borderRadius: '3px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { backgroundColor: `${c.selection} !important` },
    '.cm-selectionMatch': { backgroundColor: c.selectionMatch, borderRadius: '2px' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: alpha(c.bracketMatch, 14), outline: `1px solid ${alpha(c.bracketMatch, 45)}`, borderRadius: '2px', color: 'inherit',
    },
    '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: alpha(s.invalid, 18), color: 'inherit' },
    '.cm-searchMatch': { backgroundColor: alpha(c.searchMatch, 28), outline: `1px solid ${alpha(c.searchMatch, 55)}`, borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: alpha(c.searchMatch, 50) },
    '.cm-foldPlaceholder': {
      backgroundColor: alpha(c.fg, 8), border: 'none', borderRadius: '4px', color: c.muted, padding: '0 6px', margin: '0 2px',
    },

    // ── Popovers: tooltips + autocomplete ──
    '.cm-tooltip': {
      backgroundColor: c.tooltipBg, color: c.fg, border: `1px solid ${c.border}`, borderRadius: '8px',
      boxShadow: dark ? '0 10px 30px rgb(0 0 0 / 0.45)' : '0 10px 30px rgb(0 0 0 / 0.12)', overflow: 'hidden',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: c.border, borderBottomColor: c.border },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: c.tooltipBg, borderBottomColor: c.tooltipBg },
    '.cm-tooltip-autocomplete > ul': { fontFamily: font, padding: '4px', maxHeight: '16em' },
    '.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px !important', borderRadius: '5px', lineHeight: '1.6' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: alpha(c.accent, 22), color: c.fg },
    '.cm-completionMatchedText': { color: c.accent, textDecoration: 'none', fontWeight: '600' },
    '.cm-completionIcon': { opacity: '0.65', width: '1.1em' },
    '.cm-completionDetail': { color: c.muted, fontStyle: 'normal', marginLeft: '0.8em' },
    '.cm-tooltip.cm-completionInfo': { padding: '6px 10px', maxWidth: '420px' },
    '.cm-tooltip-lint, .cm-tooltip-hover': { padding: '4px 8px' },

    // ── Search / go-to-line panel ──
    '.cm-panels': { backgroundColor: c.panelBg, color: c.fg },
    '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${c.border}` },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${c.border}` },
    '.cm-search': { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', padding: '8px 36px 8px 12px' },
    '.cm-search br': { flexBasis: '100%', height: '0' },
    '.cm-search label': { fontSize: '12px', color: c.muted, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
    '.cm-search input[type=checkbox]': { accentColor: c.accent },
    '.cm-panel button[name=close]': { color: c.muted, fontSize: '16px', right: '10px', top: '6px', cursor: 'pointer' },
    '.cm-textfield': {
      backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.border}`, borderRadius: '6px',
      padding: '3px 8px', fontSize: '12px', outline: 'none', fontFamily: font,
    },
    '.cm-textfield:focus': { borderColor: alpha(c.accent, 70), boxShadow: `0 0 0 3px ${alpha(c.accent, 22)}` },
    '.cm-button': {
      backgroundColor: alpha(c.fg, 6), backgroundImage: 'none', color: c.fg, border: `1px solid ${c.border}`,
      borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
    },
    '.cm-button:hover': { backgroundColor: alpha(c.fg, 11) },
    '.cm-button:active': { backgroundColor: alpha(c.fg, 16), backgroundImage: 'none' },

    // ── Thin scrollbars ──
    '.cm-scroller::-webkit-scrollbar': { width: '10px', height: '10px' },
    '.cm-scroller::-webkit-scrollbar-track, .cm-scroller::-webkit-scrollbar-corner': { background: 'transparent' },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      backgroundColor: scrollThumb, borderRadius: '10px', border: '3px solid transparent', backgroundClip: 'content-box',
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': { backgroundColor: alpha(c.fg, 34) },

    // ── Minimap (@replit/codemirror-minimap) ──
    '.cm-minimap-gutter': { backgroundColor: c.bg, borderLeft: `1px solid ${c.border}` },
    '.cm-minimap-overlay': { background: `${alpha(c.accent, 14)} !important` },
    '.cm-minimap-overlay-mouse-over .cm-minimap-overlay': { background: `${alpha(c.accent, 22)} !important` },

    // ── Plain text (.txt, .cfg) and INI / .env decorations ──
    '.cm-txt-string': { color: s.string },
    '.cm-txt-number': { color: s.number },
    '.cm-txt-bool':   { color: s.bool },
    '.cm-txt-url':    { color: s.link, textDecoration: 'underline' },
    '.cm-ini-section': { color: s.heading, fontWeight: 'bold' },
    '.cm-ini-key':     { color: s.property },
    '.cm-ini-value':   { color: s.string },
    '.cm-ini-string':  { color: s.string },
    '.cm-ini-comment': { color: s.comment, fontStyle: 'italic' },
  }, { dark })
}

function buildHighlight(def: EditorThemeDef): HighlightStyle {
  const s = def.syntax
  const commentStyle = def.italicComments ? 'italic' : 'normal'
  return HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self], color: s.keyword },
    { tag: [t.controlKeyword, t.moduleKeyword], color: s.controlKeyword },
    { tag: [t.string, t.special(t.string), t.character, t.attributeValue, t.inserted], color: s.string },
    { tag: t.regexp, color: s.regexp },
    { tag: t.escape, color: s.escape },
    { tag: [t.number, t.integer, t.float, t.color, t.unit], color: s.number },
    { tag: [t.bool, t.atom], color: s.bool },
    { tag: t.null, color: s.null },
    { tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.macroName], color: s.function },
    { tag: [t.function(t.propertyName), t.function(t.definition(t.propertyName))], color: s.method },
    { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: s.variable },
    { tag: [t.propertyName, t.definition(t.propertyName)], color: s.property },
    { tag: [t.typeName, t.namespace], color: s.type },
    { tag: [t.className, t.definition(t.className)], color: s.class },
    { tag: [t.constant(t.variableName), t.standard(t.variableName), t.constant(t.propertyName)], color: s.constant },
    { tag: [t.operator, t.derefOperator, t.compareOperator, t.arithmeticOperator, t.logicOperator], color: s.operator },
    { tag: [t.punctuation, t.separator, t.bracket, t.angleBracket, t.squareBracket, t.paren, t.brace, t.contentSeparator], color: s.punctuation },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.quote], color: s.comment, fontStyle: commentStyle },
    { tag: [t.meta, t.processingInstruction, t.annotation], color: s.comment },
    { tag: t.tagName, color: s.tag },
    { tag: t.attributeName, color: s.attribute },
    { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: s.heading, fontWeight: 'bold' },
    { tag: [t.link, t.url], color: s.link, textDecoration: 'underline' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.monospace, color: s.string },
    { tag: t.deleted, color: s.invalid },
    { tag: t.invalid, color: s.invalid, textDecoration: `underline wavy ${alpha(s.invalid, 70)}` },
  ])
}

/** The one theme builder: chrome + syntax highlighting for any registry theme. */
export function buildTheme(def: EditorThemeDef, fontSize: number, fontFamily: string): Extension[] {
  return [buildChrome(def, fontSize, fontFamily), syntaxHighlighting(buildHighlight(def))]
}

// ── Pane variables ────────────────────────────────────────────────────────────

/** `#rrggbb` / `#rrggbbaa` / `#rgb` → `"r g b"` triplet used by the app's Tailwind tokens */
export function hexToTriplet(hex: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]!
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16)
  return `${n(0)} ${n(2)} ${n(4)}`
}

/**
 * CSS variables for the editor pane wrapper, so tabs, breadcrumb, the "Monitorear" bar and
 * the status line share the active theme. For canonical themes the app surface tokens are
 * also re-pointed inside the pane (so `bg-surface`, `text-on-surface-variant`, `ui-btn`,
 * hairlines… adopt the theme); Setto keeps the app tokens untouched.
 */
export function paneStyle(def: EditorThemeDef): Record<string, string> {
  const c = def.colors
  const vars: Record<string, string> = {
    '--ed-bg': c.bg,
    '--ed-fg': c.fg,
    '--ed-muted': c.muted,
    '--ed-border': c.border,
    '--ed-accent': c.accent,
    '--ed-tab-active': c.bg,
    '--ed-tab-inactive': c.panelBg,
  }
  if (def.followsApp) return vars
  const bg = hexToTriplet(c.bg), fg = hexToTriplet(c.fg), muted = hexToTriplet(c.muted)
  if (bg) vars['--c-surface'] = bg
  if (fg) vars['--c-on-surface'] = fg
  if (muted) vars['--c-on-surface-variant'] = muted
  vars['--hairline'] = c.border
  vars['--hairline-strong'] = alpha(c.fg, 18)
  vars.colorScheme = def.variant
  return vars
}
