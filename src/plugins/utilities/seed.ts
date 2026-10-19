/**
 * Texto que llega por Ctrl+K a una herramienta de Utilidades (puro).
 * Se aplica una sola vez y sólo a la herramienta destino; las demás conservan
 * lo que el usuario venía escribiendo.
 */
export interface ToolSeed<T extends string = string> { tool: T | null; input: string; stamp: number }

export const NO_SEED: ToolSeed<never> = { tool: null, input: '', stamp: 0 }

/** Clave de remount y texto inicial del panel de `tool`. */
export function panelSeed<T extends string>(seed: ToolSeed<T>, tool: T): { key: string; initial: string } {
  const mine = seed.tool === tool
  return { key: `${tool}:${mine ? seed.stamp : 0}`, initial: mine ? seed.input : '' }
}

/** Herramientas ya abiertas (quedan montadas y ocultas para no perder lo escrito). */
export function addVisited<T extends string>(visited: T[], tool: T): T[] {
  return visited.includes(tool) ? visited : [...visited, tool]
}
