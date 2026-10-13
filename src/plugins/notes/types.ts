/** Shared between the renderer and electron/plugins/notes/handlers.ts */
export interface NoteMeta {
  /** File name inside the notes folder, e.g. "Ideas.md" */
  id: string
  title: string
  preview: string
  updatedAt: number
  pinned: boolean
  /** Títulos enlazados con [[…]] */
  links: string[]
  /** Etiquetas #… en minúsculas */
  tags: string[]
}

export interface NoteContent {
  meta: NoteMeta
  content: string
}
