/**
 * Pesos de Phosphor que se incluyen en el bundle.
 *
 * Cada ícono de `@phosphor-icons/react` trae los 6 pesos (thin, light, regular, bold,
 * fill, duotone) dentro del mismo módulo, así que importar sólo los íconos usados no
 * alcanza: con ~160 íconos el chunk pesaba ~540 KB. El plugin de Vite de
 * `electron.vite.config.ts` usa `stripPhosphorWeights` para borrar del código de cada
 * ícono los pesos que la app no usa. Si se pide un peso que no está, el shim
 * (`lucide-shim.tsx`) lo cambia por el más parecido de esta lista.
 *
 * Para usar `thin` o `duotone`: agregarlo acá (y rebuild).
 */
export const KEPT_PHOSPHOR_WEIGHTS = ['light', 'regular', 'bold', 'fill'] as const

export type KeptWeight = (typeof KEPT_PHOSPHOR_WEIGHTS)[number]

const ALL_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const

/** Índice del corchete que cierra el que abre en `open` (saltea strings). -1 si no cierra. */
function matchBracket(code: string, open: number): number {
  let depth = 0
  for (let i = open; i < code.length; i++) {
    const ch = code[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      // Saltar el literal completo (con escapes).
      for (i++; i < code.length && code[i] !== ch; i++) if (code[i] === '\\') i++
      continue
    }
    if (ch === '[' || ch === '(' || ch === '{') depth++
    else if (ch === ']' || ch === ')' || ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Quita de un módulo `dist/defs/<Icono>.es.js` de Phosphor las entradas
 * `["<peso>", …]` del `new Map([...])` cuyo peso no esté en `keep`.
 * Devuelve el código sin cambios si no reconoce el formato (nunca rompe el build).
 */
export function stripPhosphorWeights(code: string, keep: readonly string[] = KEPT_PHOSPHOR_WEIGHTS): string {
  let out = code
  for (const w of ALL_WEIGHTS) {
    if (keep.includes(w)) continue
    const re = new RegExp(`\\[\\s*"${w}"\\s*,`)
    const m = re.exec(out)
    if (!m) continue
    const start = m.index
    const end = matchBracket(out, start)
    if (end < 0) return code
    // Comer la coma que separa la entrada de la siguiente (o la anterior si es la última).
    let from = start
    let to = end + 1
    const after = /^\s*,/.exec(out.slice(to))
    if (after) to += after[0].length
    else {
      const before = /,\s*$/.exec(out.slice(0, from))
      if (before) from -= before[0].length
    }
    out = out.slice(0, from) + out.slice(to)
  }
  return out
}

/** Peso que se usa en lugar de uno que no se incluyó en el bundle. */
export function coerceWeight(w: string): KeptWeight {
  if ((KEPT_PHOSPHOR_WEIGHTS as readonly string[]).includes(w)) return w as KeptWeight
  return w === 'thin' ? 'light' : 'regular'
}
