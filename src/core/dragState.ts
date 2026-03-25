/** Shared module-level singleton for cross-component file drag state.
 *  Avoids MIME-type / event-ordering issues with dataTransfer.getData().
 */
export interface DraggedFile {
  name: string
  path: string | null
  content: string
}

let _pending: DraggedFile | null = null

export const dragState = {
  set: (f: DraggedFile | null): void => { _pending = f },
  get: (): DraggedFile | null => _pending,
}
