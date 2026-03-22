export type FileLanguage =
  | 'javascript' | 'typescript' | 'json' | 'xml' | 'html' | 'yaml'
  | 'sql' | 'markdown' | 'text' | 'log' | 'ini'
  | 'csharp' | 'cpp' | 'java' | 'python' | 'css' | 'shell'

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
  /** File size in bytes at last read */
  size: number
  /** Whether line wrapping is enabled */
  wordWrap: boolean
  /** Scroll to this line on first render, then clear */
  jumpToLine?: number
}

/** Handle exposed by CodeEditor via ref */
export interface EditorHandle {
  scrollToBottom: () => void
  scrollToLine: (line: number) => void
  setFilter: (text: string) => void
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
}

export interface ReadFileResponse {
  content: string
  mtime: number
  size: number
  truncated: boolean
}
