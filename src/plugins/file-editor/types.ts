export type FileLanguage =
  | 'javascript' | 'typescript' | 'json' | 'xml' | 'html' | 'yaml'
  | 'sql' | 'markdown' | 'text' | 'log' | 'ini'
  | 'csharp' | 'cpp' | 'java' | 'python' | 'css' | 'shell'
  | 'rust' | 'go'

/** Codificación de un archivo en disco (se preserva al guardar) */
export type FileEncoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be' | 'windows1252'
/** Fin de línea en disco — el contenido en memoria siempre usa `
` */
export type EolKind = 'crlf' | 'lf'

export interface OpenFile {
  /** Unique tab key — nanoid */
  id: string
  /** Absolute fs path. null for unsaved buffers (e.g. API response JSON) */
  path: string | null
  name: string
  language: FileLanguage
  content: string
  isDirty: boolean
  /** fs mtime at last read */
  lastModified: number
  /** fs watcher is active */
  watchActive: boolean
  /** Auto-scroll to bottom on refresh */
  tailMode: boolean
  /** Pause auto-refresh even if watchActive */
  frozen: boolean
  /** File was updated on disk since last read */
  hasUpdate: boolean
  /** File no longer exists on disk */
  isDeleted: boolean
  /** File size in bytes at last read */
  size: number
  /** Whether line wrapping is enabled */
  wordWrap: boolean
  /** Scroll to this line on first render, then clear */
  jumpToLine?: number
  /** True when file exceeded MAX_FULL_SIZE and only the last N lines were loaded */
  truncated?: boolean
  /** True when the file looks binary (NUL bytes) — editing/saving may corrupt it */
  encodingWarning?: boolean
  /** Codificación con la que se guarda (la detectada al abrir, o la elegida por el usuario) */
  encoding?: FileEncoding
  /** Fin de línea con el que se guarda */
  eol?: EolKind
  /** El archivo tenía CRLF y LF mezclados al abrirlo (se unifica al guardar) */
  eolMixed?: boolean
  /**
   * Disk content captured when an external change was detected while this tab had
   * unsaved edits — held here instead of overwriting `content` so the user's edits
   * aren't silently discarded. Cleared once the conflict is resolved (reload or keep).
   */
  pendingExternalContent?: string
  pendingExternalMtime?: number
  pendingExternalSize?: number
}

/** Handle exposed by CodeEditor via ref */
/** Changed line numbers for a file vs. its git HEAD */
export interface GitLineDiff { added: number[]; changed: number[]; deleted: number[] }

export interface EditorHandle {
  scrollToBottom: () => void
  scrollToLine: (line: number) => void
  setFilter: (text: string) => void
  /** Focus the editor and open CodeMirror's "go to line" panel */
  openGotoLine: () => void
  /** Scroll container of the editor (log mode uses it to pause "Seguir" when the user scrolls up) */
  getScrollDOM?: () => HTMLElement | null
  /** Move to previous/next ERROR line (log mode, F8 / Shift+F8). False if none */
  gotoLogError?: (dir: 1 | -1) => boolean
}

/** A single find-in-files match */
export interface FindResult {
  path: string
  name: string
  lineNumber: number
  lineText: string
}

export interface RecentFile {
  path: string
  name: string
  openedAt: string
  /** Optional: jump to this line on open */
  line?: number
}

/** Payload emitted from main → renderer when a watched file changes */
export interface FileChangedEvent {
  path: string
  kind: 'changed' | 'deleted'
  content: string
  mtime: number
  size: number
}

export interface FileTreeNode {
  name: string
  path: string
  isDir: boolean
  children?: FileTreeNode[]
  /** True when children were truncated due to MAX_CHILDREN limit */
  truncated?: boolean
}

/** Request payload for editor:read-file */
export interface ReadFileRequest {
  path: string
  /** If set, only return content from this line onward (for large files) */
  fromLine?: number
  /** Override the default tail-lines count for large files (default: 2000) */
  tailLinesCount?: number
}

export interface ReadFileResponse {
  content: string
  mtime: number
  size: number
  truncated: boolean
  /** True when the file looks binary (NUL bytes in the first 8 KB) */
  encodingWarning: boolean
  encoding: FileEncoding
  eol: EolKind
  eolMixed: boolean
}

/** Opciones opcionales de editor:write-file. Sin ellas se escribe UTF-8 tal cual. */
export interface WriteFileOptions {
  encoding?: FileEncoding
  eol?: EolKind
  /** Guardado automático: el historial agrupa versiones cercanas */
  autosave?: boolean
}

/** Una versión guardada en el historial local */
export interface HistoryEntry {
  id: string
  /** epoch ms del momento del snapshot */
  ts: number
  size: number
  /** Líneas que el contenido actual tiene y esta versión no (solo si se pidió comparar) */
  added?: number
  removed?: number
}

export interface ReplaceInFilesRequest {
  root: string
  query: string
  replacement: string
  useRegex: boolean
  /** Si se indica, solo se tocan estos archivos (los tildados en la vista previa) */
  paths?: string[]
  /** true → no escribe, solo devuelve la vista previa */
  dryRun?: boolean
}

export interface ReplaceFilePreview {
  path: string
  name: string
  count: number
  /** Primeras líneas afectadas: antes/después */
  samples: Array<{ lineNumber: number; before: string; after: string }>
}

export interface ReplaceInFilesResponse {
  files: ReplaceFilePreview[]
  totalMatches: number
  /** Archivos efectivamente escritos (0 en dryRun) */
  written: number
  /** Archivos que no se pudieron escribir, con motivo */
  errors: Array<{ path: string; message: string }>
  /** Se alcanzó el límite de archivos/coincidencias */
  limited: boolean
}

export interface WriteFileResponse {
  ok: true
  path: string
  mtime: number
  size: number
}
