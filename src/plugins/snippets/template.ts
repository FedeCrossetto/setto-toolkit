/**
 * Snippet variables: `{{nombre}}` or `{{nombre:valor por defecto}}`.
 * Pure helpers (no DOM / IPC) so they can be unit-tested and reused by the
 * Ctrl+K provider.
 */

export interface TemplateVariable {
  name: string
  /** Default value from the first `{{name:default}}` occurrence (undefined if none) */
  defaultValue?: string
}

const VAR_RE = /\{\{\s*([^{}:\n]+?)\s*(?::([^{}\n]*))?\}\}/g

/** Unique variables in order of first appearance. */
export function parseVariables(content: string): TemplateVariable[] {
  const out: TemplateVariable[] = []
  const byName = new Map<string, TemplateVariable>()
  VAR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = VAR_RE.exec(content)) !== null) {
    const name = m[1]!.trim()
    if (!name) continue
    const def = m[2]
    const existing = byName.get(name)
    if (existing) {
      if (existing.defaultValue === undefined && def !== undefined) existing.defaultValue = def
      continue
    }
    const v: TemplateVariable = def !== undefined ? { name, defaultValue: def } : { name }
    byName.set(name, v)
    out.push(v)
  }
  return out
}

export function hasVariables(content: string): boolean {
  return parseVariables(content).length > 0
}

/**
 * Replace every placeholder. Missing values fall back to the placeholder's own
 * default, then to the variable's first default, then to an empty string.
 */
export function renderTemplate(content: string, values: Record<string, string>): string {
  const vars = parseVariables(content)
  const firstDefault = new Map(vars.map((v) => [v.name, v.defaultValue]))
  return content.replace(VAR_RE, (_all, rawName: string, def: string | undefined) => {
    const name = rawName.trim()
    const val = values[name]
    if (val !== undefined && val !== '') return val
    return def ?? firstDefault.get(name) ?? ''
  })
}

/** Initial values for the fill-in form: last used values, else defaults. */
export function initialValues(vars: TemplateVariable[], remembered: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of vars) out[v.name] = remembered[v.name] ?? v.defaultValue ?? ''
  return out
}

// ── Search helpers ───────────────────────────────────────────────────────────

const IMAGE_MD_RE = /!\[[^\]]*\]\(data:[^)]*\)/g
const DATA_URL_RE = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

/** Content without embedded base64 images (pasted screenshots), for indexing. */
export function stripDataUrls(content: string): string {
  return content.replace(IMAGE_MD_RE, ' ').replace(DATA_URL_RE, ' ')
}
