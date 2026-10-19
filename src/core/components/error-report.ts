/** Errores del renderer → app.log del main (Ajustes → Exportar logs). */

/** Un chunk de Vite que no cargó (`import()` dinámico): reintentar el render no sirve, hay que recargar. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \S+ failed|Unable to preload CSS/i.test(msg)
}

/** Deja el error en app.log vía `app:renderer-error`. Nunca lanza. */
export function reportRendererError(kind: string, error: unknown, extra?: string): void {
  try {
    const message = error instanceof Error ? error.message : String(error)
    const stack = [error instanceof Error ? error.stack : undefined, extra].filter(Boolean).join('\n--\n')
    window.api.send('app:renderer-error', { kind, message, stack: stack.slice(0, 4000) })
  } catch { /* preload no disponible */ }
}
