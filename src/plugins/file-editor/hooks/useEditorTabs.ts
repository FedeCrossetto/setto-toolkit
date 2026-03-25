import { useState, useCallback } from 'react'
import type { OpenFile, FileLanguage, ReadFileResponse } from '../types'

let tabCounter = 0
function newId(): string { return `tab-${++tabCounter}` }

/** Detect CodeMirror language from file extension */ // eslint-disable-next-line react-refresh/only-export-components
export function detectLanguage(filename: string): FileLanguage {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, FileLanguage> = {
    // Web
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', jsonc: 'json',
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', less: 'css',
    xml: 'xml', svg: 'xml', xsd: 'xml', xslt: 'xml',
    // Data / Config
    yml: 'yaml', yaml: 'yaml',
    sql: 'sql',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    toml: 'ini', ini: 'ini', conf: 'ini', env: 'ini', properties: 'ini',
    cfg: 'xml',
    // Systems
    cs: 'csharp',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'cpp', h: 'cpp', hpp: 'cpp',
    java: 'java',
    py: 'python', pyw: 'python',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    bat: 'shell', cmd: 'shell', ps1: 'shell',
    // Logs / plain text
    log: 'log', txt: 'text', out: 'log',
  }
  return map[ext] ?? 'text'
}

/** Material icon name for a given language */
export function languageIcon(lang: FileLanguage): string {
  switch (lang) {
    case 'log':        return 'receipt_long'
    case 'json':       return 'data_object'
    case 'typescript':
    case 'javascript': return 'code'
    case 'html':
    case 'xml':        return 'html'
    case 'markdown':   return 'text_fields'
    case 'sql':        return 'storage'
    case 'yaml':       return 'settings'
    case 'python':     return 'terminal'
    case 'css':        return 'style'
    case 'shell':      return 'terminal'
    default:           return 'description'
  }
}

export function useEditorTabs() {
  const [tabs, setTabs] = useState<OpenFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const openFile = useCallback(async (filePath: string, _line?: number): Promise<OpenFile | null> => {
    // If already open, just activate it
    const existing = tabs.find((t) => t.path === filePath)
    if (existing) {
      setActiveId(existing.id)
      return existing
    }

    try {
      const result = await window.api.invoke<ReadFileResponse>('editor:read-file', { path: filePath })
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      const file: OpenFile = {
        id: newId(),
        path: filePath,
        name,
        language: detectLanguage(name),
        content: result.content,
        isDirty: false,
        lastModified: result.mtime,
        watchActive: false,
        tailMode: false,
        frozen: false,
        hasUpdate: false,
        size: result.size,
        wordWrap: true,
      }
      setTabs((prev) => [...prev, file])
      setActiveId(file.id)
      return file
    } catch (e) {
      console.error('Failed to open file:', e)
      return null
    }
  }, [tabs])

  /** Open a temporary buffer (e.g. API response JSON — no fs path) */
  const openBuffer = useCallback((name: string, content: string, language: FileLanguage = 'json'): OpenFile => {
    const file: OpenFile = {
      id: newId(), path: null, name, language, content,
      isDirty: false, lastModified: Date.now(),
      watchActive: false, tailMode: false, frozen: false, hasUpdate: false,
      size: new TextEncoder().encode(content).length,
      wordWrap: true,
    }
    setTabs((prev) => [...prev, file])
    setActiveId(file.id)
    return file
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeId === id) setActiveId(next[next.length - 1]?.id ?? null)
      return next
    })
  }, [activeId])

  const updateTab = useCallback((id: string, patch: Partial<OpenFile>) => {
    setTabs((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const activeTab = tabs.find((t) => t.id === activeId) ?? null

  return { tabs, activeId, activeTab, setActiveId, openFile, openBuffer, closeTab, updateTab }
}
