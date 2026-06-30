import { createElement, useState, useCallback, useRef, type ComponentType } from 'react'
import { FileCode2 } from 'lucide-react'
import {
  SiTypescript, SiJavascript, SiHtml5, SiCss, SiYaml,
  SiMarkdown, SiPython, SiCplusplus,
} from 'react-icons/si'
import deviconJava from '../../../assets/devicon/java-original.svg?raw'
import deviconCsharp from '../../../assets/devicon/csharp-original.svg?raw'
import deviconGo from '../../../assets/devicon/go-original.svg?raw'
import deviconRust from '../../../assets/devicon/rust-original.svg?raw'
import deviconBash from '../../../assets/devicon/bash-original.svg?raw'
import vmiDocument from '../../../assets/vscode-material-icons/document.svg?raw'
import vmiDatabase from '../../../assets/vscode-material-icons/database.svg?raw'
import vmiLog from '../../../assets/vscode-material-icons/log.svg?raw'
import vmiSettings from '../../../assets/vscode-material-icons/settings.svg?raw'
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

type IconComponent = ComponentType<{ size?: number; className?: string }>

/** Wraps a brand (simple-icons) glyph with a fixed brand color, keeping the same {size, className} signature as Lucide icons. */
function brandIcon(Icon: ComponentType<{ size?: number; className?: string; color?: string }>, color?: string): IconComponent {
  return ({ size, className }) => createElement(Icon, { size, className, color })
}

const TYPESCRIPT_ICON = brandIcon(SiTypescript, '#3178C6')
const JAVASCRIPT_ICON = brandIcon(SiJavascript, '#F7DF1E')
const HTML_ICON       = brandIcon(SiHtml5, '#E34F26')
const CSS_ICON        = brandIcon(SiCss, '#1572B6')
const YAML_ICON       = brandIcon(SiYaml, '#CB171E')
const MARKDOWN_ICON   = brandIcon(SiMarkdown) // brand mark is black/white — inherit currentColor instead
const PYTHON_ICON     = brandIcon(SiPython, '#3776AB')
const CPP_ICON        = brandIcon(SiCplusplus, '#00599C')

/** Wraps a raw SVG (no fixed size/fill) as an inline brand icon. */
function rawSvgIcon(raw: string): IconComponent {
  // Some source SVGs don't set a root fill — paths without their own fill default
  // to black, invisible on a dark UI. Force currentColor on the few that need it.
  const html = raw.includes('fill=') ? raw : raw.replace('<svg ', '<svg fill="currentColor" ')
  return ({ size = 16, className }) => createElement('span', {
    className: ['devicon-svg', className].filter(Boolean).join(' '),
    style: { width: size, height: size },
    dangerouslySetInnerHTML: { __html: html },
  })
}

const JAVA_DEVICON   = rawSvgIcon(deviconJava)
const CSHARP_DEVICON = rawSvgIcon(deviconCsharp)
const GO_DEVICON     = rawSvgIcon(deviconGo)
const RUST_DEVICON   = rawSvgIcon(deviconRust)
const SHELL_DEVICON  = rawSvgIcon(deviconBash)

// VS Code "Material Icon Theme" icons — covers generic extensions (.txt/.sql/.log/.ini)
// that brand-logo sets (Simple Icons, Devicon) don't have, since they aren't products/languages.
const TEXT_ICON     = rawSvgIcon(vmiDocument)
const DATABASE_ICON = rawSvgIcon(vmiDatabase)
const LOG_ICON      = rawSvgIcon(vmiLog)
const INI_ICON      = rawSvgIcon(vmiSettings)

/** Language-specific icon — brand logo (simple-icons) when one exists and reads well at small sizes, Lucide fallback otherwise */
export function languageIcon(lang: FileLanguage): IconComponent {
  switch (lang) {
    case 'log':        return LOG_ICON
    case 'json':       return FileCode2
    case 'typescript': return TYPESCRIPT_ICON
    case 'javascript': return JAVASCRIPT_ICON
    case 'html':       return HTML_ICON
    case 'xml':        return FileCode2
    case 'markdown':   return MARKDOWN_ICON
    case 'sql':        return DATABASE_ICON
    case 'yaml':       return YAML_ICON
    case 'python':     return PYTHON_ICON
    case 'css':        return CSS_ICON
    case 'shell':      return SHELL_DEVICON
    case 'rust':       return RUST_DEVICON
    case 'go':         return GO_DEVICON
    case 'cpp':        return CPP_ICON
    case 'csharp':     return CSHARP_DEVICON
    case 'java':       return JAVA_DEVICON
    case 'ini':        return INI_ICON
    case 'text':       return TEXT_ICON
    default:           return TEXT_ICON
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
      next.splice(to, 0, item)
      return next
    })
  }, [])

  const activeTab = tabs.find((t) => t.id === activeId) ?? null

  return { tabs, activeId, activeTab, setActiveId, openFile, openBuffer, closeTab, updateTab, reorderTabs, isOpening: openingCount > 0 }
}
