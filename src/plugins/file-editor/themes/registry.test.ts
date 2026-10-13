import { describe, it, expect } from 'vitest'
import {
  ALL_THEMES, THEME_FAMILIES, DEFAULT_COLOR_SCHEME, LEGACY_SCHEME_IDS,
  migrateColorScheme, resolveEditorTheme, hasBothVariants,
} from './registry'
import { COLOR_KEYS, SYNTAX_KEYS } from './types'
import { hexToTriplet } from './buildTheme'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

describe('theme registry', () => {
  it('every theme defines all color and syntax keys with non-empty values', () => {
    for (const t of ALL_THEMES) {
      for (const k of COLOR_KEYS) expect(t.colors[k], `${t.id}.colors.${k}`).toMatch(/\S/)
      for (const k of SYNTAX_KEYS) expect(t.syntax[k], `${t.id}.syntax.${k}`).toMatch(/\S/)
    }
  })

  it('fixed-palette themes use valid hex colors (needed for the pane token override)', () => {
    for (const t of ALL_THEMES.filter((x) => !x.followsApp)) {
      for (const k of COLOR_KEYS) expect(t.colors[k], `${t.id}.colors.${k}`).toMatch(HEX)
      for (const k of SYNTAX_KEYS) expect(t.syntax[k], `${t.id}.syntax.${k}`).toMatch(HEX)
      expect(hexToTriplet(t.colors.bg)).not.toBeNull()
    }
  })

  it('theme ids and family ids are unique', () => {
    const ids = ALL_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const fams = THEME_FAMILIES.map((f) => f.id)
    expect(new Set(fams).size).toBe(fams.length)
  })

  it('each variant belongs to its family and matches its slot', () => {
    for (const f of THEME_FAMILIES) {
      const dark = 'dark' in f ? f.dark : undefined
      const light = 'light' in f ? f.light : undefined
      expect(dark || light, f.id).toBeTruthy()
      if (dark) { expect(dark.family).toBe(f.id); expect(dark.variant).toBe('dark') }
      if (light) { expect(light.family).toBe(f.id); expect(light.variant).toBe('light') }
    }
  })

  it('migrates legacy and unknown ids', () => {
    expect(migrateColorScheme('nexus')).toBe('setto')
    expect(migrateColorScheme('httpie')).toBe('tokyo-night')
    expect(migrateColorScheme('dracula')).toBe('dracula')
    expect(migrateColorScheme('does-not-exist')).toBe(DEFAULT_COLOR_SCHEME)
    expect(migrateColorScheme(undefined)).toBe(DEFAULT_COLOR_SCHEME)
    for (const target of Object.values(LEGACY_SCHEME_IDS)) {
      expect(THEME_FAMILIES.some((f) => f.id === target)).toBe(true)
    }
  })

  it('resolves the variant: auto follows the app, dark/light force it', () => {
    expect(resolveEditorTheme('github', 'auto', true).id).toBe('github-dark')
    expect(resolveEditorTheme('github', 'auto', false).id).toBe('github-light')
    expect(resolveEditorTheme('github', 'dark', false).id).toBe('github-dark')
    expect(resolveEditorTheme('github', 'light', true).id).toBe('github-light')
    expect(resolveEditorTheme('nexus', 'auto', false).id).toBe('setto-light')
    expect(resolveEditorTheme('httpie', 'auto', true).id).toBe('tokyo-night')
  })

  it('single-variant families always use their own variant', () => {
    expect(hasBothVariants('dracula')).toBe(false)
    expect(resolveEditorTheme('dracula', 'light', false).id).toBe('dracula')
    expect(resolveEditorTheme('monokai', 'auto', false).variant).toBe('dark')
    expect(hasBothVariants('catppuccin')).toBe(true)
  })

  it('hexToTriplet handles 3/6/8-digit hex and rejects non-hex', () => {
    expect(hexToTriplet('#fff')).toBe('255 255 255')
    expect(hexToTriplet('#0d1117')).toBe('13 17 23')
    expect(hexToTriplet('#dbd7caee')).toBe('219 215 202')
    expect(hexToTriplet('rgb(var(--c-surface))')).toBeNull()
  })
})
