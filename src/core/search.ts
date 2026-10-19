import type { AppAction, IconComponent } from './types'

/**
 * Universal search (Ctrl+K). Each plugin can contribute results through a
 * SearchProvider declared in `src/plugins/<id>/search.ts` and listed in
 * `src/core/search-registry.ts`. Providers are imported eagerly (they must not
 * import the plugin's heavy UI) and fetch their data on demand via IPC.
 */
export interface SearchContext {
  dispatch: React.Dispatch<AppAction>
  /** Show a toast — e.g. "Copiado al portapapeles" */
  notify: (message: string, kind?: 'success' | 'error' | 'info') => void
}

export interface SearchItem {
  /** Unique across providers — prefix with the provider id */
  id: string
  title: string
  subtitle?: string
  icon?: IconComponent
  /** Short right-aligned hint, e.g. "Enter copia" or a date */
  hint?: string
  /** Higher = earlier inside its group. Default 0 */
  score?: number
  run: (ctx: SearchContext) => void | Promise<void>
  /**
   * Optional alternative action for Shift+Enter (e.g. on a credential:
   * Enter copies the password, Shift+Enter the username). The palette shows
   * `altHint` next to "⇧↵" on the selected row and in the footer.
   */
  altRun?: (ctx: SearchContext) => void | Promise<void>
  altHint?: string
}

export interface SearchProvider {
  id: string
  /** Group header shown in the palette, e.g. "Notas" */
  group: string
  /** Plugin that owns the provider; it's skipped when the plugin is disabled */
  pluginId?: string
  /** Group position (lower first). Default: after the built-in groups, in registry order. */
  order?: number
  /**
   * Return results for `query` (already trimmed). With an empty query return
   * a few "recent"/"pinned" items or quick actions (or nothing).
   */
  search: (query: string) => Promise<SearchItem[]> | SearchItem[]
}

/** Simple case/accent-insensitive "all words present" matcher for providers. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function matchesQuery(query: string, ...fields: (string | undefined | null)[]): boolean {
  const haystack = normalize(fields.filter(Boolean).join(' '))
  return normalize(query).split(/\s+/).filter(Boolean).every(word => haystack.includes(word))
}
