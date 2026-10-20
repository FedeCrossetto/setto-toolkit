import { useState, useCallback, useRef } from 'react'
import {
  FileCodeIcon, FileCppIcon, FileCSharpIcon, FileCssIcon, FileHtmlIcon, FileIniIcon, FileJsIcon, FileLinesIcon,
  FileMdIcon, FilePyIcon, FileRsIcon, FileSqlIcon, FileTsIcon, FileTxtIcon,
} from 'lucide-react'
import type { IconComponent } from '../../../core/types'
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
    toml: 'ini', ini: 'ini', conf: 'ini', env: 'ini', properties: 'ini', cfg: 'ini',
    // Systems
    cs: 'csharp',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'cpp', h: 'cpp', hpp: 'cpp',
    java: 'java',
    py: 'python', pyw: 'python',
    rs: 'rust',
    go: 'go',
    sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
    bat: 'shell', cmd: 'shell', ps1: 'shell',
    // Logs / plain text
    log: 'log', txt: 'text', out: 'log',
  }
  return map[ext] ?? 'text'
}

/**
 * Some extensions are ambiguous (.cfg can hold XML or ini-style key=value pairs).
 * Sniff the actual content for those and override the extension-based guess —
 * gets both the icon and the syntax highlighting right.
 */
export function refineLanguageFromContent(lang: FileLanguage, content: string): FileLanguage {
  if (lang !== 'ini' && lang !== 'text') return lang
  // Strip a possible UTF-8 BOM (U+FEFF) — trimStart() doesn't remove it, so a
  // BOM-prefixed XML file would otherwise fail the '<' sniff below.
  const firstChar = content.replace(/^\uFEFF/, '').trimStart().charAt(0)
  if (firstChar === '<') return 'xml'
  return lang
}

/**
 * Ícono por lenguaje: una sola familia (Phosphor, mismo trazo que el resto de la app) y
 * sin color propio — toma el color del texto, así sigue al tema y al archivo activo.
 */
export function languageIcon(lang: FileLanguage): IconComponent {
  switch (lang) {
    case 'typescript': return FileTsIcon
    case 'javascript': return FileJsIcon
    case 'html':       return FileHtmlIcon
    case 'css':        return FileCssIcon
    case 'sql':        return FileSqlIcon
    case 'markdown':   return FileMdIcon
    case 'python':     return FilePyIcon
    case 'cpp':        return FileCppIcon
    case 'csharp':     return FileCSharpIcon
    case 'rust':       return FileRsIcon
    case 'ini':
    case 'yaml':       return FileIniIcon
    case 'log':        return FileLinesIcon
    case 'json':
    case 'xml':
    case 'shell':
    case 'go':
    case 'java':       return FileCodeIcon
    default:           return FileTxtIcon
  }
}

export function useEditorTabs() {
  const [tabs, setTabs] = useState<OpenFile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  // Tracks in-flight openFile() reads so the UI can show a thin loading bar —
  // there was previously zero feedback while a large/slow file was being read.
  const [openingCount, setOpeningCount] = useState(0)

  // Stable ref so openFile never goes stale during parallel session-restore calls.
  // Without this, all concurrent openFile() calls in Promise.all() capture the same
  // empty tabs=[] snapshot and cannot detect already-open files.
  const tabsRef = useRef<OpenFile[]>(tabs)
  tabsRef.current = tabs

  const openFile = useCallback(async (filePath: string, _line?: number, tailLinesCount?: number): Promise<OpenFile | null> => {
    // If already open, just activate it (use ref — always current, no stale closure)
    const existing = tabsRef.current.find((t) => t.path === filePath)
    if (existing) {
      setActiveId(existing.id)
      return existing
    }

    setOpeningCount((n) => n + 1)
    try {
      const result = await window.api.invoke<ReadFileResponse>('editor:read-file', { path: filePath, tailLinesCount })
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      const file: OpenFile = {
        id: newId(),
        path: filePath,
        name,
        // Stays purely extension-derived — the icon must never change while editing or
        // differ between two files with the same extension. Syntax highlighting (which
        // CAN be smarter about ambiguous extensions like .cfg) is resolved separately,
        // inline where CodeEditor is rendered — see refineLanguageFromContent.
        language: detectLanguage(name),
        content: result.content,
        isDirty: false,
        lastModified: result.mtime,
        watchActive: false,
        tailMode: false,
        frozen: false,
        hasUpdate: false,
        isDeleted: false,
        size: result.size,
        wordWrap: true,
        truncated: result.truncated,
        encodingWarning: result.encodingWarning,
        encoding: result.encoding,
        eol: result.eol,
        eolMixed: result.eolMixed,
      }
      setTabs((prev) => [...prev, file])
      setActiveId(file.id)
      return file
    } catch (e) {
      console.error('Failed to open file:', e)
      return null
    } finally {
      setOpeningCount((n) => n - 1)
    }
  }, [])  // stable — tabs lookup goes through tabsRef, not captured state

  /** Open a temporary buffer (e.g. API response JSON — no fs path) */
  const openBuffer = useCallback((name: string, content: string, language: FileLanguage = 'json'): OpenFile => {
    const file: OpenFile = {
      id: newId(), path: null, name, language, content,
      isDirty: false, lastModified: Date.now(),
      watchActive: false, tailMode: false, frozen: false, hasUpdate: false, isDeleted: false,
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

  const reorderTabs = useCallback((fromId: string, toId: string) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === fromId)
      const to   = prev.findIndex((t) => t.id === toId)
      if (from === -1 || to === -1 || from === to) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!) // from !== -1 guarantees an element existed at that index
      return next
    })
  }, [])

  const activeTab = tabs.find((t) => t.id === activeId) ?? null

  return { tabs, activeId, activeTab, setActiveId, openFile, openBuffer, closeTab, updateTab, reorderTabs, isOpening: openingCount > 0 }
}
