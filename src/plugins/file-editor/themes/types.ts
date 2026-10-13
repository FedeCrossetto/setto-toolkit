/**
 * Data model for File Editor color themes.
 *
 * Every theme is plain data (no CodeMirror imports) so it can be rendered by the
 * generic builder (`buildTheme.ts`), previewed in the picker with plain DOM, and
 * unit-tested in a node environment.
 *
 * Color values are any CSS color: hex for canonical themes, `rgb(var(--c-…))`
 * for Setto (which follows the app tokens). Alpha variants are derived by the
 * builder with `color-mix()`, so a theme only lists base colors.
 */

export type ThemeVariant = 'dark' | 'light'

export interface EditorThemeColors {
  /** Editor background */
  bg: string
  /** Default text */
  fg: string
  /** Secondary text in the editor chrome (inactive tabs, status line) */
  muted: string
  gutterBg: string
  gutterFg: string
  gutterActiveFg: string
  /** Final color of the active-line band (usually translucent) */
  activeLine: string
  /** Final color of the selection (usually translucent) */
  selection: string
  /** Final color of other occurrences of the selected word */
  selectionMatch: string
  cursor: string
  /** Theme accent (focus rings, matched completion text, links in the chrome) */
  accent: string
  border: string
  /** Search panel / inactive tab strip / status line */
  panelBg: string
  /** Tooltips and autocomplete popovers */
  tooltipBg: string
  /** Solid base color; the builder applies the transparency */
  bracketMatch: string
  /** Solid base color; the builder applies the transparency */
  searchMatch: string
}

export interface EditorThemeSyntax {
  keyword: string
  controlKeyword: string
  string: string
  number: string
  bool: string
  null: string
  function: string
  method: string
  variable: string
  property: string
  type: string
  class: string
  constant: string
  operator: string
  punctuation: string
  comment: string
  tag: string
  attribute: string
  regexp: string
  escape: string
  heading: string
  link: string
  invalid: string
}

export interface EditorThemeDef {
  /** Unique id of this variant, e.g. `github-dark` */
  id: string
  /** Display name of this variant, e.g. `GitHub Dark` */
  name: string
  /** Family id stored in prefs (`EditorColorScheme`), e.g. `github` */
  family: string
  variant: ThemeVariant
  /** True when the colors come from the app tokens (Setto) instead of fixed hex */
  followsApp?: boolean
  /** Comments in italic (most canonical themes do) */
  italicComments?: boolean
  colors: EditorThemeColors
  syntax: EditorThemeSyntax
}

export interface EditorThemeFamily {
  id: string
  name: string
  /** Shown first in the picker */
  recommended: boolean
  dark?: EditorThemeDef
  light?: EditorThemeDef
}

export const COLOR_KEYS: ReadonlyArray<keyof EditorThemeColors> = [
  'bg', 'fg', 'muted', 'gutterBg', 'gutterFg', 'gutterActiveFg', 'activeLine', 'selection', 'selectionMatch',
  'cursor', 'accent', 'border', 'panelBg', 'tooltipBg', 'bracketMatch', 'searchMatch',
]

export const SYNTAX_KEYS: ReadonlyArray<keyof EditorThemeSyntax> = [
  'keyword', 'controlKeyword', 'string', 'number', 'bool', 'null', 'function', 'method', 'variable', 'property',
  'type', 'class', 'constant', 'operator', 'punctuation', 'comment', 'tag', 'attribute', 'regexp', 'escape',
  'heading', 'link', 'invalid',
]
