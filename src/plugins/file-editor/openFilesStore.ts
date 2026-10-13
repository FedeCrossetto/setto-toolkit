/**
 * Espejo liviano (sin React) de los archivos abiertos en el Editor, para que el
 * proveedor de Ctrl+K (`search.ts`) pueda listarlos sin importar la UI del plugin.
 * FileEditor lo actualiza; si todavía no se montó, se lee la sesión guardada.
 */
export interface OpenFileRef {
  id: string
  name: string
  path: string | null
  isDirty: boolean
}

const SESSION_KEY = 'file-editor:session'

let current: OpenFileRef[] | null = null

export function publishOpenFiles(files: OpenFileRef[] | null): void {
  current = files
}

export function getOpenFiles(): OpenFileRef[] {
  if (current) return current
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const session = JSON.parse(raw) as { tabs?: Array<{ path: string | null; name: string; dirtyContent?: string }> }
    return (session.tabs ?? []).map((t, i) => ({
      id: `session-${i}`, name: t.name, path: t.path, isDirty: t.dirtyContent !== undefined,
    }))
  } catch {
    return []
  }
}
