import type { SnippetLanguage } from './types'

/** Order shown in selects and in the sidebar language chips. */
export const LANGUAGES: SnippetLanguage[] = [
  'plaintext', 'sql', 'powershell', 'cmd', 'bash', 'sh', 'javascript', 'typescript', 'python',
  'json', 'yaml', 'xml', 'html', 'css', 'csharp', 'java', 'go', 'rust', 'markdown',
]

export const LANG_LABEL: Record<SnippetLanguage, string> = {
  plaintext: 'Texto',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  bash: 'Bash',
  sh: 'sh',
  powershell: 'PowerShell',
  cmd: 'cmd / batch',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  yaml: 'YAML',
  xml: 'XML',
  markdown: 'Markdown',
}

/** Languages that can be sent to the Terminal module. */
export const SHELL_LANGUAGES = new Set<SnippetLanguage>(['bash', 'sh', 'powershell', 'cmd'])

export function langLabel(lang: string): string {
  return LANG_LABEL[lang as SnippetLanguage] ?? lang
}
