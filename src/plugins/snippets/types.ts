export type SnippetLanguage =
  | 'plaintext' | 'javascript' | 'typescript' | 'python' | 'sql'
  | 'json' | 'html' | 'css' | 'bash' | 'powershell' | 'cmd' | 'sh' | 'java' | 'csharp'
  | 'go' | 'rust' | 'yaml' | 'xml' | 'markdown'

export interface Snippet {
  id: string
  title: string
  language: SnippetLanguage
  content: string
  tags: string[]
  description: string
  pinned: boolean
  collectionId: string | null
  createdAt: string
  updatedAt: string
  /** epoch ms of the last copy/run (updated by `snippets:mark-used`) */
  lastUsedAt?: number
  /** number of copies/runs (updated by `snippets:mark-used`) */
  useCount?: number
}

export interface SnippetCollection {
  id: string
  name: string
  createdAt: string
}

/** Persisted flags for one-time migrations (`snippets-meta.json`). */
export interface SnippetsMeta {
  queriesImportedAt?: string
}
