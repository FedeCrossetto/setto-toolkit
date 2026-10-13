import type { EditorThemeDef, EditorThemeFamily, ThemeVariant } from './types'

/**
 * Theme registry — canonical palettes taken from each theme's official VS Code port.
 * Pure data: the CodeMirror extensions are built by `buildTheme.ts`.
 */

// ── Setto (default) — follows the app tokens; syntax in a calm sky/blue/lilac family ──
const SETTO_CHROME = {
  bg: 'rgb(var(--c-surface))',
  fg: 'rgb(var(--c-on-surface))',
  muted: 'rgb(var(--c-on-surface-variant))',
  gutterBg: 'rgb(var(--c-surface))',
  gutterFg: 'rgb(var(--c-on-surface-variant) / 0.5)',
  gutterActiveFg: 'rgb(var(--c-on-surface))',
  activeLine: 'rgb(var(--c-on-surface) / 0.035)',
  selection: 'rgb(var(--c-primary) / 0.22)',
  selectionMatch: 'rgb(var(--c-primary) / 0.12)',
  cursor: 'rgb(var(--c-primary))',
  accent: 'rgb(var(--c-primary))',
  border: 'var(--hairline)',
  panelBg: 'rgb(var(--c-sidebar) / 0.4)',
  tooltipBg: 'rgb(var(--c-surface))',
  bracketMatch: 'rgb(var(--c-primary))',
  searchMatch: 'rgb(var(--c-warning))',
}

const settoDark: EditorThemeDef = {
  id: 'setto-dark', name: 'Setto Oscuro', family: 'setto', variant: 'dark', followsApp: true, italicComments: true,
  colors: SETTO_CHROME,
  syntax: {
    keyword: '#B392F0', controlKeyword: '#C9A6FF', string: '#79C0FF', number: '#7DD3E8', bool: '#B392F0', null: '#B392F0',
    function: '#94A8FF', method: '#94A8FF', variable: 'rgb(var(--c-on-surface))', property: '#AFC6E9',
    type: '#C3B5FF', class: '#C3B5FF', constant: '#7DD3E8', operator: 'rgb(var(--c-on-surface-variant))',
    punctuation: 'rgb(var(--c-on-surface-variant) / 0.85)', comment: '#7D8590', tag: '#B392F0', attribute: '#94A8FF',
    regexp: '#7DD3E8', escape: '#7DD3E8', heading: '#B392F0', link: '#79C0FF', invalid: '#FF7B72',
  },
}

const settoLight: EditorThemeDef = {
  id: 'setto-light', name: 'Setto Claro', family: 'setto', variant: 'light', followsApp: true, italicComments: true,
  colors: SETTO_CHROME,
  syntax: {
    keyword: '#8250DF', controlKeyword: '#7C3AED', string: '#0A69DA', number: '#0E7490', bool: '#8250DF', null: '#8250DF',
    function: '#4E5BD9', method: '#4E5BD9', variable: 'rgb(var(--c-on-surface))', property: '#3B5A85',
    type: '#6E40C9', class: '#6E40C9', constant: '#0E7490', operator: 'rgb(var(--c-on-surface-variant))',
    punctuation: 'rgb(var(--c-on-surface-variant) / 0.85)', comment: '#6E7781', tag: '#8250DF', attribute: '#4E5BD9',
    regexp: '#0E7490', escape: '#0E7490', heading: '#8250DF', link: '#0A69DA', invalid: '#CF222E',
  },
}

// ── GitHub ─────────────────────────────────────────────────────────────────────
const githubDark: EditorThemeDef = {
  id: 'github-dark', name: 'GitHub Dark', family: 'github', variant: 'dark',
  colors: {
    bg: '#0d1117', fg: '#e6edf3', muted: '#8b949e', gutterBg: '#0d1117', gutterFg: '#6e7681', gutterActiveFg: '#e6edf3',
    activeLine: '#6e76811a', selection: '#264f78', selectionMatch: '#3fb95040', cursor: '#2f81f7', accent: '#2f81f7',
    border: '#30363d', panelBg: '#010409', tooltipBg: '#161b22', bracketMatch: '#3fb950', searchMatch: '#9e6a03',
  },
  syntax: {
    keyword: '#ff7b72', controlKeyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', bool: '#79c0ff', null: '#79c0ff',
    function: '#d2a8ff', method: '#d2a8ff', variable: '#e6edf3', property: '#79c0ff', type: '#ffa657', class: '#ffa657',
    constant: '#79c0ff', operator: '#ff7b72', punctuation: '#e6edf3', comment: '#8b949e', tag: '#7ee787', attribute: '#79c0ff',
    regexp: '#7ee787', escape: '#79c0ff', heading: '#1f6feb', link: '#a5d6ff', invalid: '#ffa198',
  },
}

const githubLight: EditorThemeDef = {
  id: 'github-light', name: 'GitHub Light', family: 'github', variant: 'light',
  colors: {
    bg: '#ffffff', fg: '#1f2328', muted: '#656d76', gutterBg: '#ffffff', gutterFg: '#8c959f', gutterActiveFg: '#1f2328',
    activeLine: '#eaeef280', selection: '#0969da33', selectionMatch: '#4ac26b40', cursor: '#0969da', accent: '#0969da',
    border: '#d0d7de', panelBg: '#f6f8fa', tooltipBg: '#ffffff', bracketMatch: '#4ac26b', searchMatch: '#bf8700',
  },
  syntax: {
    keyword: '#cf222e', controlKeyword: '#cf222e', string: '#0a3069', number: '#0550ae', bool: '#0550ae', null: '#0550ae',
    function: '#8250df', method: '#8250df', variable: '#1f2328', property: '#0550ae', type: '#953800', class: '#953800',
    constant: '#0550ae', operator: '#cf222e', punctuation: '#1f2328', comment: '#6e7781', tag: '#116329', attribute: '#0550ae',
    regexp: '#116329', escape: '#0550ae', heading: '#0550ae', link: '#0a3069', invalid: '#82071e',
  },
}

// ── One Dark Pro ───────────────────────────────────────────────────────────────
const oneDarkPro: EditorThemeDef = {
  id: 'one-dark-pro', name: 'One Dark Pro', family: 'one-dark', variant: 'dark', italicComments: true,
  colors: {
    bg: '#282c34', fg: '#abb2bf', muted: '#7f848e', gutterBg: '#282c34', gutterFg: '#495162', gutterActiveFg: '#abb2bf',
    activeLine: '#2c313c', selection: '#67769660', selectionMatch: '#67769640', cursor: '#528bff', accent: '#528bff',
    border: '#181a1f', panelBg: '#21252b', tooltipBg: '#21252b', bracketMatch: '#515a6b', searchMatch: '#d19a66',
  },
  syntax: {
    keyword: '#c678dd', controlKeyword: '#c678dd', string: '#98c379', number: '#d19a66', bool: '#d19a66', null: '#d19a66',
    function: '#61afef', method: '#61afef', variable: '#e06c75', property: '#e06c75', type: '#e5c07b', class: '#e5c07b',
    constant: '#d19a66', operator: '#56b6c2', punctuation: '#abb2bf', comment: '#7f848e', tag: '#e06c75', attribute: '#d19a66',
    regexp: '#56b6c2', escape: '#56b6c2', heading: '#e06c75', link: '#61afef', invalid: '#f44747',
  },
}

// ── Tokyo Night ────────────────────────────────────────────────────────────────
const tokyoNight: EditorThemeDef = {
  id: 'tokyo-night', name: 'Tokyo Night', family: 'tokyo-night', variant: 'dark', italicComments: true,
  colors: {
    bg: '#1a1b26', fg: '#c0caf5', muted: '#787c99', gutterBg: '#1a1b26', gutterFg: '#3b3f5c', gutterActiveFg: '#737aa2',
    activeLine: '#1e202e', selection: '#515c7e66', selectionMatch: '#515c7e40', cursor: '#c0caf5', accent: '#7aa2f7',
    border: '#101014', panelBg: '#16161e', tooltipBg: '#16161e', bracketMatch: '#7aa2f7', searchMatch: '#3d59a1',
  },
  syntax: {
    keyword: '#bb9af7', controlKeyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', bool: '#ff9e64', null: '#ff9e64',
    function: '#7aa2f7', method: '#7aa2f7', variable: '#c0caf5', property: '#73daca', type: '#2ac3de', class: '#2ac3de',
    constant: '#ff9e64', operator: '#89ddff', punctuation: '#89ddff', comment: '#565f89', tag: '#f7768e', attribute: '#bb9af7',
    regexp: '#b4f9f8', escape: '#89ddff', heading: '#89ddff', link: '#73daca', invalid: '#db4b4b',
  },
}

const tokyoNightDay: EditorThemeDef = {
  id: 'tokyo-night-day', name: 'Tokyo Night Day', family: 'tokyo-night', variant: 'light', italicComments: true,
  colors: {
    bg: '#e1e2e7', fg: '#3760bf', muted: '#6172b0', gutterBg: '#e1e2e7', gutterFg: '#a8aecb', gutterActiveFg: '#3760bf',
    activeLine: '#d0d5e3', selection: '#99a7df66', selectionMatch: '#99a7df40', cursor: '#3760bf', accent: '#2e7de9',
    border: '#c4c8da', panelBg: '#d0d5e3', tooltipBg: '#e9e9ec', bracketMatch: '#2e7de9', searchMatch: '#8c6c3e',
  },
  syntax: {
    keyword: '#9854f1', controlKeyword: '#9854f1', string: '#587539', number: '#b15c00', bool: '#b15c00', null: '#b15c00',
    function: '#2e7de9', method: '#2e7de9', variable: '#3760bf', property: '#387068', type: '#007197', class: '#007197',
    constant: '#b15c00', operator: '#006a83', punctuation: '#006a83', comment: '#848cb5', tag: '#f52a65', attribute: '#9854f1',
    regexp: '#2e5857', escape: '#006a83', heading: '#006a83', link: '#387068', invalid: '#c64343',
  },
}

// ── Catppuccin ─────────────────────────────────────────────────────────────────
const catppuccinMocha: EditorThemeDef = {
  id: 'catppuccin-mocha', name: 'Catppuccin Mocha', family: 'catppuccin', variant: 'dark', italicComments: true,
  colors: {
    bg: '#1e1e2e', fg: '#cdd6f4', muted: '#a6adc8', gutterBg: '#1e1e2e', gutterFg: '#6c7086', gutterActiveFg: '#b4befe',
    activeLine: '#31324480', selection: '#9399b240', selectionMatch: '#9399b226', cursor: '#f5e0dc', accent: '#cba6f7',
    border: '#313244', panelBg: '#181825', tooltipBg: '#181825', bracketMatch: '#9399b2', searchMatch: '#f9e2af',
  },
  syntax: {
    keyword: '#cba6f7', controlKeyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', bool: '#fab387', null: '#fab387',
    function: '#89b4fa', method: '#89b4fa', variable: '#cdd6f4', property: '#b4befe', type: '#f9e2af', class: '#f9e2af',
    constant: '#fab387', operator: '#89dceb', punctuation: '#9399b2', comment: '#9399b2', tag: '#89b4fa', attribute: '#f9e2af',
    regexp: '#f5c2e7', escape: '#f5c2e7', heading: '#f38ba8', link: '#f5e0dc', invalid: '#f38ba8',
  },
}

const catppuccinLatte: EditorThemeDef = {
  id: 'catppuccin-latte', name: 'Catppuccin Latte', family: 'catppuccin', variant: 'light', italicComments: true,
  colors: {
    bg: '#eff1f5', fg: '#4c4f69', muted: '#6c6f85', gutterBg: '#eff1f5', gutterFg: '#9ca0b0', gutterActiveFg: '#7287fd',
    activeLine: '#ccd0da80', selection: '#7c7f9340', selectionMatch: '#7c7f9326', cursor: '#dc8a78', accent: '#8839ef',
    border: '#ccd0da', panelBg: '#e6e9ef', tooltipBg: '#e6e9ef', bracketMatch: '#7c7f93', searchMatch: '#df8e1d',
  },
  syntax: {
    keyword: '#8839ef', controlKeyword: '#8839ef', string: '#40a02b', number: '#fe640b', bool: '#fe640b', null: '#fe640b',
    function: '#1e66f5', method: '#1e66f5', variable: '#4c4f69', property: '#7287fd', type: '#df8e1d', class: '#df8e1d',
    constant: '#fe640b', operator: '#04a5e5', punctuation: '#7c7f93', comment: '#7c7f93', tag: '#1e66f5', attribute: '#df8e1d',
    regexp: '#ea76cb', escape: '#ea76cb', heading: '#d20f39', link: '#dc8a78', invalid: '#d20f39',
  },
}

// ── Nord ───────────────────────────────────────────────────────────────────────
const nord: EditorThemeDef = {
  id: 'nord', name: 'Nord', family: 'nord', variant: 'dark', italicComments: true,
  colors: {
    bg: '#2e3440', fg: '#d8dee9', muted: '#81a1c1', gutterBg: '#2e3440', gutterFg: '#4c566a', gutterActiveFg: '#d8dee9',
    activeLine: '#3b4252', selection: '#434c5ecc', selectionMatch: '#434c5e', cursor: '#d8dee9', accent: '#88c0d0',
    border: '#3b4252', panelBg: '#292e39', tooltipBg: '#3b4252', bracketMatch: '#88c0d0', searchMatch: '#88c0d0',
  },
  syntax: {
    keyword: '#81a1c1', controlKeyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', bool: '#81a1c1', null: '#81a1c1',
    function: '#88c0d0', method: '#88c0d0', variable: '#d8dee9', property: '#d8dee9', type: '#8fbcbb', class: '#8fbcbb',
    constant: '#81a1c1', operator: '#81a1c1', punctuation: '#eceff4', comment: '#616e88', tag: '#81a1c1', attribute: '#8fbcbb',
    regexp: '#ebcb8b', escape: '#ebcb8b', heading: '#88c0d0', link: '#88c0d0', invalid: '#bf616a',
  },
}

// ── Rosé Pine ──────────────────────────────────────────────────────────────────
const rosePine: EditorThemeDef = {
  id: 'rose-pine', name: 'Rosé Pine', family: 'rose-pine', variant: 'dark', italicComments: true,
  colors: {
    bg: '#191724', fg: '#e0def4', muted: '#908caa', gutterBg: '#191724', gutterFg: '#6e6a86', gutterActiveFg: '#e0def4',
    activeLine: '#21202e', selection: '#403d52', selectionMatch: '#403d5280', cursor: '#ebbcba', accent: '#ebbcba',
    border: '#26233a', panelBg: '#1f1d2e', tooltipBg: '#1f1d2e', bracketMatch: '#908caa', searchMatch: '#f6c177',
  },
  syntax: {
    keyword: '#31748f', controlKeyword: '#31748f', string: '#f6c177', number: '#ebbcba', bool: '#ebbcba', null: '#ebbcba',
    function: '#ebbcba', method: '#ebbcba', variable: '#e0def4', property: '#9ccfd8', type: '#9ccfd8', class: '#9ccfd8',
    constant: '#ebbcba', operator: '#908caa', punctuation: '#908caa', comment: '#6e6a86', tag: '#9ccfd8', attribute: '#c4a7e7',
    regexp: '#f6c177', escape: '#31748f', heading: '#c4a7e7', link: '#c4a7e7', invalid: '#eb6f92',
  },
}

const rosePineDawn: EditorThemeDef = {
  id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', family: 'rose-pine', variant: 'light', italicComments: true,
  colors: {
    bg: '#faf4ed', fg: '#575279', muted: '#797593', gutterBg: '#faf4ed', gutterFg: '#9893a5', gutterActiveFg: '#575279',
    activeLine: '#f4ede8', selection: '#dfdad9', selectionMatch: '#dfdad980', cursor: '#d7827e', accent: '#d7827e',
    border: '#f2e9e1', panelBg: '#fffaf3', tooltipBg: '#fffaf3', bracketMatch: '#797593', searchMatch: '#ea9d34',
  },
  syntax: {
    keyword: '#286983', controlKeyword: '#286983', string: '#ea9d34', number: '#d7827e', bool: '#d7827e', null: '#d7827e',
    function: '#d7827e', method: '#d7827e', variable: '#575279', property: '#56949f', type: '#56949f', class: '#56949f',
    constant: '#d7827e', operator: '#797593', punctuation: '#797593', comment: '#9893a5', tag: '#56949f', attribute: '#907aa9',
    regexp: '#ea9d34', escape: '#286983', heading: '#907aa9', link: '#907aa9', invalid: '#b4637a',
  },
}

// ── Night Owl ──────────────────────────────────────────────────────────────────
const nightOwl: EditorThemeDef = {
  id: 'night-owl', name: 'Night Owl', family: 'night-owl', variant: 'dark', italicComments: true,
  colors: {
    bg: '#011627', fg: '#d6deeb', muted: '#5f7e97', gutterBg: '#011627', gutterFg: '#4b6479', gutterActiveFg: '#c5e4fd',
    activeLine: '#0b253a', selection: '#1d3b53', selectionMatch: '#5f7e9740', cursor: '#80a4c2', accent: '#82aaff',
    border: '#122d42', panelBg: '#01111d', tooltipBg: '#0b2942', bracketMatch: '#5f7e97', searchMatch: '#1085bb',
  },
  syntax: {
    keyword: '#c792ea', controlKeyword: '#c792ea', string: '#ecc48d', number: '#f78c6c', bool: '#ff5874', null: '#ff5874',
    function: '#82aaff', method: '#82aaff', variable: '#d6deeb', property: '#7fdbca', type: '#ffcb8b', class: '#ffcb8b',
    constant: '#82aaff', operator: '#7fdbca', punctuation: '#d9f5dd', comment: '#637777', tag: '#caece6', attribute: '#c5e478',
    regexp: '#5ca7e4', escape: '#82aaff', heading: '#82b1ff', link: '#ff869a', invalid: '#ef5350',
  },
}

const lightOwl: EditorThemeDef = {
  id: 'light-owl', name: 'Light Owl', family: 'night-owl', variant: 'light', italicComments: true,
  colors: {
    bg: '#fbfbfb', fg: '#403f53', muted: '#90a7b2', gutterBg: '#fbfbfb', gutterFg: '#90a7b2', gutterActiveFg: '#403f53',
    activeLine: '#f0f0f0', selection: '#e0e0e0', selectionMatch: '#e0e0e080', cursor: '#90a7b2', accent: '#4876d6',
    border: '#d9d9d9', panelBg: '#f0f0f0', tooltipBg: '#f0f0f0', bracketMatch: '#4876d6', searchMatch: '#93a1a1',
  },
  syntax: {
    keyword: '#994cc3', controlKeyword: '#994cc3', string: '#c96765', number: '#aa0982', bool: '#bc5454', null: '#bc5454',
    function: '#4876d6', method: '#4876d6', variable: '#403f53', property: '#0c969b', type: '#111111', class: '#111111',
    constant: '#bc5454', operator: '#0c969b', punctuation: '#0c969b', comment: '#989fb1', tag: '#994cc3', attribute: '#4876d6',
    regexp: '#5ca7e4', escape: '#aa0982', heading: '#4876d6', link: '#0c969b', invalid: '#e64d49',
  },
}

// ── Vitesse ────────────────────────────────────────────────────────────────────
const vitesseDark: EditorThemeDef = {
  id: 'vitesse-dark', name: 'Vitesse Dark', family: 'vitesse', variant: 'dark',
  colors: {
    bg: '#121212', fg: '#dbd7caee', muted: '#959da5', gutterBg: '#121212', gutterFg: '#dedcd550', gutterActiveFg: '#bfbaaa',
    activeLine: '#181818', selection: '#eeeeee18', selectionMatch: '#eeeeee10', cursor: '#dbd7caee', accent: '#4d9375',
    border: '#191919', panelBg: '#0e0e0e', tooltipBg: '#181818', bracketMatch: '#4d9375', searchMatch: '#e6cc77',
  },
  syntax: {
    keyword: '#4d9375', controlKeyword: '#4d9375', string: '#c98a7d', number: '#4c9a91', bool: '#4d9375', null: '#4d9375',
    function: '#80a665', method: '#80a665', variable: '#bd976a', property: '#b8a965', type: '#5da994', class: '#5da994',
    constant: '#c99076', operator: '#cb7676', punctuation: '#666666', comment: '#758575dd', tag: '#4d9375', attribute: '#bd976a',
    regexp: '#c4704f', escape: '#c4704f', heading: '#4d9375', link: '#c98a7d', invalid: '#fdaeb7',
  },
}

const vitesseLight: EditorThemeDef = {
  id: 'vitesse-light', name: 'Vitesse Light', family: 'vitesse', variant: 'light',
  colors: {
    bg: '#ffffff', fg: '#393a34', muted: '#6a737d', gutterBg: '#ffffff', gutterFg: '#393a3450', gutterActiveFg: '#4e4f47',
    activeLine: '#f7f7f7', selection: '#22222218', selectionMatch: '#22222210', cursor: '#1c6b48', accent: '#1c6b48',
    border: '#f0f0f0', panelBg: '#fafafa', tooltipBg: '#ffffff', bracketMatch: '#1c6b48', searchMatch: '#e6cc77',
  },
  syntax: {
    keyword: '#1e754f', controlKeyword: '#1e754f', string: '#b56959', number: '#2f798a', bool: '#1e754f', null: '#1e754f',
    function: '#59873a', method: '#59873a', variable: '#b07d48', property: '#998418', type: '#2e8f82', class: '#2e8f82',
    constant: '#a65e2b', operator: '#ab5959', punctuation: '#999999', comment: '#a0ada0', tag: '#1e754f', attribute: '#b07d48',
    regexp: '#ab5e3f', escape: '#ab5e3f', heading: '#1e754f', link: '#b56959', invalid: '#b31d28',
  },
}

// ── Ayu ────────────────────────────────────────────────────────────────────────
const ayuMirage: EditorThemeDef = {
  id: 'ayu-mirage', name: 'Ayu Mirage', family: 'ayu', variant: 'dark', italicComments: true,
  colors: {
    bg: '#1f2430', fg: '#cccac2', muted: '#707a8c', gutterBg: '#1f2430', gutterFg: '#8a919966', gutterActiveFg: '#8a9199cc',
    activeLine: '#1a1f29', selection: '#409fff40', selectionMatch: '#409fff1f', cursor: '#ffcc66', accent: '#ffcc66',
    border: '#171b24', panelBg: '#1c212b', tooltipBg: '#1c212b', bracketMatch: '#8a9199', searchMatch: '#ffcc66',
  },
  syntax: {
    keyword: '#ffad66', controlKeyword: '#ffad66', string: '#d5ff80', number: '#dfbfff', bool: '#dfbfff', null: '#dfbfff',
    function: '#ffd173', method: '#ffd173', variable: '#cccac2', property: '#f28779', type: '#73d0ff', class: '#73d0ff',
    constant: '#dfbfff', operator: '#f29e74', punctuation: '#cccac2b3', comment: '#6c7a8b', tag: '#5ccfe6', attribute: '#ffd173',
    regexp: '#95e6cb', escape: '#95e6cb', heading: '#f28779', link: '#5ccfe6', invalid: '#ff6666',
  },
}

const ayuLight: EditorThemeDef = {
  id: 'ayu-light', name: 'Ayu Light', family: 'ayu', variant: 'light', italicComments: true,
  colors: {
    bg: '#fcfcfc', fg: '#5c6166', muted: '#8a9199', gutterBg: '#fcfcfc', gutterFg: '#8a919999', gutterActiveFg: '#8a9199',
    activeLine: '#8a91991a', selection: '#035bd626', selectionMatch: '#035bd614', cursor: '#ffaa33', accent: '#ffaa33',
    border: '#6b7d8f1f', panelBg: '#f3f4f5', tooltipBg: '#fcfcfc', bracketMatch: '#8a9199', searchMatch: '#ffaa33',
  },
  syntax: {
    keyword: '#fa8d3e', controlKeyword: '#fa8d3e', string: '#86b300', number: '#a37acc', bool: '#a37acc', null: '#a37acc',
    function: '#f2ae49', method: '#f2ae49', variable: '#5c6166', property: '#f07171', type: '#399ee6', class: '#399ee6',
    constant: '#a37acc', operator: '#ed9366', punctuation: '#5c6166b3', comment: '#787b8099', tag: '#55b4d4', attribute: '#f2ae49',
    regexp: '#4cbf99', escape: '#4cbf99', heading: '#f07171', link: '#55b4d4', invalid: '#e65050',
  },
}

// ── Solarized ──────────────────────────────────────────────────────────────────
const solarizedDark: EditorThemeDef = {
  id: 'solarized-dark', name: 'Solarized Dark', family: 'solarized', variant: 'dark', italicComments: true,
  colors: {
    bg: '#002b36', fg: '#839496', muted: '#586e75', gutterBg: '#002b36', gutterFg: '#586e75', gutterActiveFg: '#93a1a1',
    activeLine: '#073642', selection: '#274642', selectionMatch: '#005a6f80', cursor: '#d30102', accent: '#268bd2',
    border: '#073642', panelBg: '#00212b', tooltipBg: '#073642', bracketMatch: '#586e75', searchMatch: '#b58900',
  },
  syntax: {
    keyword: '#859900', controlKeyword: '#859900', string: '#2aa198', number: '#d33682', bool: '#b58900', null: '#b58900',
    function: '#268bd2', method: '#268bd2', variable: '#839496', property: '#93a1a1', type: '#cb4b16', class: '#cb4b16',
    constant: '#cb4b16', operator: '#859900', punctuation: '#657b83', comment: '#586e75', tag: '#268bd2', attribute: '#93a1a1',
    regexp: '#dc322f', escape: '#dc322f', heading: '#268bd2', link: '#2aa198', invalid: '#dc322f',
  },
}

const solarizedLight: EditorThemeDef = {
  id: 'solarized-light', name: 'Solarized Light', family: 'solarized', variant: 'light', italicComments: true,
  colors: {
    bg: '#fdf6e3', fg: '#657b83', muted: '#93a1a1', gutterBg: '#fdf6e3', gutterFg: '#93a1a1', gutterActiveFg: '#586e75',
    activeLine: '#eee8d5', selection: '#ddd6c1', selectionMatch: '#eee8d5', cursor: '#657b83', accent: '#268bd2',
    border: '#ddd6c1', panelBg: '#eee8d5', tooltipBg: '#eee8d5', bracketMatch: '#93a1a1', searchMatch: '#b58900',
  },
  syntax: {
    keyword: '#859900', controlKeyword: '#859900', string: '#2aa198', number: '#d33682', bool: '#b58900', null: '#b58900',
    function: '#268bd2', method: '#268bd2', variable: '#657b83', property: '#586e75', type: '#cb4b16', class: '#cb4b16',
    constant: '#cb4b16', operator: '#859900', punctuation: '#93a1a1', comment: '#93a1a1', tag: '#268bd2', attribute: '#586e75',
    regexp: '#dc322f', escape: '#dc322f', heading: '#268bd2', link: '#2aa198', invalid: '#dc322f',
  },
}

// ── Aurora (house theme kept from the previous editor) ─────────────────────────
const auroraDark: EditorThemeDef = {
  id: 'aurora-dark', name: 'Aurora', family: 'aurora', variant: 'dark', italicComments: true,
  colors: {
    bg: '#13151d', fg: '#e4e6f1', muted: '#9da3c2', gutterBg: '#13151d', gutterFg: '#5b6178', gutterActiveFg: '#e4e6f1',
    activeLine: '#1b1d2b', selection: '#8b93ff38', selectionMatch: '#8b93ff20', cursor: '#ff6fa8', accent: '#ff6fa8',
    border: '#9da3c22e', panelBg: '#0f1018', tooltipBg: '#1b1d2b', bracketMatch: '#8b93ff', searchMatch: '#ffb870',
  },
  syntax: {
    keyword: '#8b93ff', controlKeyword: '#8b93ff', string: '#ffb870', number: '#ffb870', bool: '#8b93ff', null: '#8b93ff',
    function: '#ff6fa8', method: '#ff6fa8', variable: '#e4e6f1', property: '#7fe0c8', type: '#5ccfe6', class: '#5ccfe6',
    constant: '#ffb870', operator: '#9da3c2', punctuation: '#9da3c2', comment: '#5b6178', tag: '#ff6fa8', attribute: '#7fe0c8',
    regexp: '#ffb870', escape: '#9da3c2', heading: '#ff6fa8', link: '#ff6fa8', invalid: '#ff5c7a',
  },
}

const auroraLight: EditorThemeDef = {
  id: 'aurora-light', name: 'Aurora Claro', family: 'aurora', variant: 'light', italicComments: true,
  colors: {
    bg: '#fbfaf7', fg: '#1e2030', muted: '#6b7187', gutterBg: '#fbfaf7', gutterFg: '#8a8f9e', gutterActiveFg: '#1e2030',
    activeLine: '#0000000a', selection: '#5b5fe024', selectionMatch: '#5b5fe014', cursor: '#d6336c', accent: '#d6336c',
    border: '#00000014', panelBg: '#f3f1ea', tooltipBg: '#f3f1ea', bracketMatch: '#5b5fe0', searchMatch: '#c2660a',
  },
  syntax: {
    keyword: '#5b5fe0', controlKeyword: '#5b5fe0', string: '#c2660a', number: '#c2660a', bool: '#5b5fe0', null: '#5b5fe0',
    function: '#d6336c', method: '#d6336c', variable: '#1e2030', property: '#0f8a6e', type: '#0e7681', class: '#0e7681',
    constant: '#c2660a', operator: '#5b6178', punctuation: '#6b7187', comment: '#8a8f9e', tag: '#d6336c', attribute: '#0f8a6e',
    regexp: '#c2660a', escape: '#0e7681', heading: '#d6336c', link: '#d6336c', invalid: '#dc2626',
  },
}

// ── Dracula / Monokai (dark-only) ──────────────────────────────────────────────
const dracula: EditorThemeDef = {
  id: 'dracula', name: 'Dracula', family: 'dracula', variant: 'dark',
  colors: {
    bg: '#282a36', fg: '#f8f8f2', muted: '#6272a4', gutterBg: '#282a36', gutterFg: '#6272a4', gutterActiveFg: '#f8f8f2',
    activeLine: '#44475a75', selection: '#44475a', selectionMatch: '#424450', cursor: '#f8f8f2', accent: '#bd93f9',
    border: '#191a21', panelBg: '#21222c', tooltipBg: '#21222c', bracketMatch: '#f8f8f2', searchMatch: '#ffb86c',
  },
  syntax: {
    keyword: '#ff79c6', controlKeyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', bool: '#bd93f9', null: '#bd93f9',
    function: '#50fa7b', method: '#50fa7b', variable: '#f8f8f2', property: '#f8f8f2', type: '#8be9fd', class: '#8be9fd',
    constant: '#bd93f9', operator: '#ff79c6', punctuation: '#f8f8f2', comment: '#6272a4', tag: '#ff79c6', attribute: '#50fa7b',
    regexp: '#ff5555', escape: '#ff79c6', heading: '#bd93f9', link: '#8be9fd', invalid: '#ff5555',
  },
}

const monokai: EditorThemeDef = {
  id: 'monokai', name: 'Monokai', family: 'monokai', variant: 'dark',
  colors: {
    bg: '#272822', fg: '#f8f8f2', muted: '#90908a', gutterBg: '#272822', gutterFg: '#90908a', gutterActiveFg: '#c2c2bf',
    activeLine: '#3e3d32', selection: '#878b9180', selectionMatch: '#575b6180', cursor: '#f8f8f0', accent: '#a6e22e',
    border: '#1e1f1c', panelBg: '#1e1f1c', tooltipBg: '#1e1f1c', bracketMatch: '#f8f8f2', searchMatch: '#e6db74',
  },
  syntax: {
    keyword: '#f92672', controlKeyword: '#f92672', string: '#e6db74', number: '#ae81ff', bool: '#ae81ff', null: '#ae81ff',
    function: '#a6e22e', method: '#a6e22e', variable: '#f8f8f2', property: '#f8f8f2', type: '#66d9ef', class: '#a6e22e',
    constant: '#ae81ff', operator: '#f92672', punctuation: '#f8f8f2', comment: '#75715e', tag: '#f92672', attribute: '#a6e22e',
    regexp: '#e6db74', escape: '#ae81ff', heading: '#a6e22e', link: '#66d9ef', invalid: '#f44747',
  },
}

// ── Families ───────────────────────────────────────────────────────────────────
export const THEME_FAMILIES = [
  { id: 'setto',       name: 'Tema de la app', recommended: true,  dark: settoDark,       light: settoLight },
  { id: 'github',      name: 'GitHub',         recommended: true,  dark: githubDark,      light: githubLight },
  { id: 'one-dark',    name: 'One Dark Pro',   recommended: true,  dark: oneDarkPro },
  { id: 'tokyo-night', name: 'Tokyo Night',    recommended: true,  dark: tokyoNight,      light: tokyoNightDay },
  { id: 'catppuccin',  name: 'Catppuccin',     recommended: true,  dark: catppuccinMocha, light: catppuccinLatte },
  { id: 'nord',        name: 'Nord',           recommended: false, dark: nord },
  { id: 'rose-pine',   name: 'Rosé Pine',      recommended: false, dark: rosePine,        light: rosePineDawn },
  { id: 'night-owl',   name: 'Night Owl',      recommended: false, dark: nightOwl,        light: lightOwl },
  { id: 'vitesse',     name: 'Vitesse',        recommended: false, dark: vitesseDark,     light: vitesseLight },
  { id: 'ayu',         name: 'Ayu',            recommended: false, dark: ayuMirage,       light: ayuLight },
  { id: 'solarized',   name: 'Solarized',      recommended: false, dark: solarizedDark,   light: solarizedLight },
  { id: 'aurora',      name: 'Aurora',         recommended: false, dark: auroraDark,      light: auroraLight },
  { id: 'dracula',     name: 'Dracula',        recommended: false, dark: dracula },
  { id: 'monokai',     name: 'Monokai',        recommended: false, dark: monokai },
] as const satisfies readonly EditorThemeFamily[]

/** Family id persisted in the editor prefs */
export type EditorColorScheme = (typeof THEME_FAMILIES)[number]['id']

export const DEFAULT_COLOR_SCHEME: EditorColorScheme = 'setto'

/** Ids from older versions of the editor that must keep working in saved prefs */
export const LEGACY_SCHEME_IDS: Readonly<Record<string, EditorColorScheme>> = {
  nexus: 'setto',
  httpie: 'tokyo-night',
}

export const ALL_THEMES: readonly EditorThemeDef[] = THEME_FAMILIES.flatMap((f): EditorThemeDef[] =>
  [('dark' in f ? f.dark : undefined), ('light' in f ? f.light : undefined)].filter((t): t is EditorThemeDef => !!t))

export function getFamily(id: EditorColorScheme): EditorThemeFamily {
  return THEME_FAMILIES.find((f) => f.id === id) ?? THEME_FAMILIES[0]
}

/** Maps any stored value (current id, legacy id or garbage) to a valid scheme id */
export function migrateColorScheme(value: unknown): EditorColorScheme {
  if (typeof value !== 'string') return DEFAULT_COLOR_SCHEME
  const legacy = LEGACY_SCHEME_IDS[value]
  if (legacy) return legacy
  return THEME_FAMILIES.some((f) => f.id === value) ? (value as EditorColorScheme) : DEFAULT_COLOR_SCHEME
}

/**
 * Picks the concrete variant to render.
 * - `editorTheme: 'auto'` follows the app (`appDark`); 'dark'/'light' force it.
 * - Single-variant families (Dracula, Monokai, One Dark Pro, Nord) always use their variant.
 */
export function resolveEditorTheme(
  scheme: string,
  editorTheme: 'auto' | ThemeVariant,
  appDark: boolean = typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
): EditorThemeDef {
  const family = getFamily(migrateColorScheme(scheme))
  const wanted: ThemeVariant = editorTheme === 'auto' ? (appDark ? 'dark' : 'light') : editorTheme
  return family[wanted] ?? family.dark ?? family.light!
}

/** True when the family ships both a dark and a light variant */
export function hasBothVariants(id: EditorColorScheme): boolean {
  const f = getFamily(id)
  return !!f.dark && !!f.light
}
