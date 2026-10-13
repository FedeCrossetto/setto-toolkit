/**
 * One-time import of the File Editor's untitled buffers (persisted in
 * localStorage['file-editor:session']) as notes. Read-only over the editor
 * session: buffers are never removed from it.
 */
export const EDITOR_SESSION_KEY = 'file-editor:session'
export const MIGRATION_FLAG_KEY = 'notes:migrated-editor-buffers'

/** Extracts the non-empty contents of untitled (path === null) buffers. */
export function extractUntitledBuffers(raw: string | null): string[] {
  if (!raw) return []
  let data: unknown
  try { data = JSON.parse(raw) } catch { return [] }
  if (!data || typeof data !== 'object') return []
  const tabs = (data as { tabs?: unknown }).tabs
  if (!Array.isArray(tabs)) return []
  const out: string[] = []
  for (const t of tabs) {
    if (!t || typeof t !== 'object') continue
    const tab = t as { path?: unknown; content?: unknown }
    if (tab.path !== null || typeof tab.content !== 'string') continue
    if (!tab.content.trim()) continue
    out.push(tab.content)
  }
  return out
}

/**
 * Runs the migration once (flag in localStorage). Returns how many notes were
 * created. The flag is only set after every write succeeded, so a failure retries
 * on the next load.
 */
export async function migrateEditorBuffers(
  write: (content: string) => Promise<unknown>,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Promise<number> {
  if (storage.getItem(MIGRATION_FLAG_KEY)) return 0
  const buffers = extractUntitledBuffers(storage.getItem(EDITOR_SESSION_KEY))
  for (const content of buffers) await write(content)
  storage.setItem(MIGRATION_FLAG_KEY, String(Date.now()))
  return buffers.length
}
