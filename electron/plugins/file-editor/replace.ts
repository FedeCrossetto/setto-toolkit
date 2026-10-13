/**
 * Núcleo puro de "Reemplazar en archivos": arma el matcher (con las mismas reglas
 * que "Buscar en archivos": sin distinguir mayúsculas, regex opcional con guarda
 * anti-ReDoS) y aplica el reemplazo línea por línea preservando los separadores
 * originales (CRLF, LF o CR sueltos, aunque estén mezclados).
 */

export const MAX_QUERY_LENGTH = 500

/** Patrones con cuantificadores anidados como (a+)+ — los mismos que rechaza find-in-files. */
const DANGEROUS_PATTERN = /(\(.*[+*]\).*[+*]|\[[^\]]*\][+*][+*]|\{.*[+*]\}.*[+*])/

export function buildMatcher(query: string, useRegex: boolean): RegExp {
  if (!query || typeof query !== 'string') throw new Error('Búsqueda vacía')
  if (query.length > MAX_QUERY_LENGTH) throw new Error('Búsqueda demasiado larga')
  if (!useRegex) return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  if (DANGEROUS_PATTERN.test(query)) {
    throw new Error('Regex peligroso: los cuantificadores anidados como (a+)+ pueden causar cuelgues')
  }
  let re: RegExp
  try { re = new RegExp(query, 'gi') } catch (e) { throw new Error(`Regex inválida: ${(e as Error).message}`) }
  if (re.test('')) throw new Error('La expresión coincide con texto vacío: no se puede usar para reemplazar')
  re.lastIndex = 0
  return re
}

export interface ReplaceSample { lineNumber: number; before: string; after: string }
export interface ReplaceTextResult { output: string; count: number; samples: ReplaceSample[] }

const clip = (s: string): string => { const t = s.trim(); return t.length > 200 ? `${t.slice(0, 200)}…` : t }

/**
 * Reemplaza en `text` (con sus saltos de línea originales). En modo regex se admiten
 * referencias `$1`, `$&`…; en modo literal el reemplazo se inserta tal cual.
 */
export function replaceInText(
  text: string, matcher: RegExp, replacement: string, useRegex: boolean, maxSamples = 5,
): ReplaceTextResult {
  const parts = text.split(/(\r\n|\n|\r)/)   // even = line, odd = separator
  let count = 0
  const samples: ReplaceSample[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i]!
    matcher.lastIndex = 0
    let n = 0
    for (const _m of line.matchAll(matcher)) n++
    if (n > 0) {
      // Regex: native semantics ($1, $&, $<name>, lookarounds keep their context).
      // Literal: function replacer so "$" in the replacement is inserted verbatim.
      const next = useRegex ? line.replace(matcher, replacement) : line.replace(matcher, () => replacement)
      count += n
      parts[i] = next
      if (samples.length < maxSamples) samples.push({ lineNumber: i / 2 + 1, before: clip(line), after: clip(next) })
    }
  }
  return { output: count > 0 ? parts.join('') : text, count, samples }
}
