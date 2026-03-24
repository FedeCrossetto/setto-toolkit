export type SnippetLanguage =
  | 'plaintext' | 'javascript' | 'typescript' | 'python' | 'sql'
  | 'json' | 'html' | 'css' | 'bash' | 'java' | 'csharp'
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
}

export interface SnippetCollection {
  id: string
  name: string
  createdAt: string
}
