import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, ArrowDown, ArrowUpRight, CheckCircle2, ChevronRight, Copy, Diff, Eye, EyeOff,
  FileInput, FilePlus, FileSearch, FileText, Filter, Folder, Import,
  FolderOpen, FolderPlus, FolderSearch, PanelLeft, PanelLeftClose, Pause, Pencil, Play,
  Save, SlidersHorizontal, SquareTerminal, Trash2, WrapText, X,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { dragState } from '../../core/dragState'
import { useEditorTabs, languageIcon, detectLanguage, refineLanguageFromContent } from './hooks/useEditorTabs'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useEditorPrefs, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from './hooks/useEditorPrefs'
import { useAutoSave } from './hooks/useAutoSave'
import { CodeEditor } from './components/CodeEditor'
import { Breadcrumb } from './components/Breadcrumb'
import { ContextMenu } from './components/ContextMenu'
import { QuickOpen } from './components/QuickOpen'
import { FindInFiles } from './components/FindInFiles'
import { ImagePreview, isImagePath } from './components/ImagePreview'
import { MarkdownPreview } from './components/MarkdownPreview'
import type { FileChangedEvent, OpenFile, RecentFile, FileLanguage, FileTreeNode, EditorHandle, WriteFileResponse, GitLineDiff } from './types'
import { Badge } from '../../core/components/Badge'
import { Chip } from '../../core/components/Chip'
import { Tooltip } from '../../core/components/Tooltip'
import type { MenuItem } from './components/ContextMenu'

// ── Language color map ────────────────────────────────────────────────────────
const LANG_COLORS: Partial<Record<FileLanguage, string>> = {
  javascript: '#F7DF1E', typescript: '#3178C6',
  json: '#FF7A00', html: '#E34F26', css: '#1572B6',
  python: '#3776AB', rust: '#CE422B', go: '#00ADD8', java: '#ED8B00',
  sql: '#F29111', markdown: '#083FA1', yaml: '#CB171E', xml: '#005FAD',
  shell: '#4EAA25',
}
const langColor = (lang: FileLanguage): string =>
  LANG_COLORS[lang] ?? 'rgb(var(--c-on-surface-variant) / 0.5)'

let newFileCount = 0

// ── Session persistence ───────────────────────────────────────────────────────
const SESSION_KEY = 'file-editor:session'
type SavedTab =
  | { path: string; name: string; dirtyContent?: string }
  | { path: null; name: string; content: string; language: FileLanguage }
/** Cap for persisting unsaved edits per file — avoids blowing the localStorage quota */
const MAX_DIRTY_PERSIST = 1024 * 1024
interface SavedSession { tabs: SavedTab[]; activePath: string | null; activeName: string | null }

// ── Path helpers ──────────────────────────────────────────────────────────────
const getParentDir = (p: string): string => p.replace(/[/\\][^/\\]+$/, '')
const appendPath   = (dir: string, name: string): string => `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`

// ── Tree callbacks interface ──────────────────────────────────────────────────
interface TreeCallbacks {
  onOpen:          (path: string) => Promise<unknown>
  onContextMenu:   (e: React.MouseEvent, node: FileTreeNode, rootPath: string) => void
  renaming:        string | null
  creating:        { parentPath: string; type: 'file' | 'dir' } | null
  onRenameCommit:  (oldPath: string, newName: string) => void
  onCreateCommit:  (parentPath: string, name: string, type: 'file' | 'dir') => void
  onCancel:        () => void
}

export function FileEditor(): JSX.Element {
  const { state, dispatch } = useApp()
  const { tabs, activeId, activeTab, setActiveId, openFile, openBuffer, closeTab, updateTab, reorderTabs, isOpening } = useEditorTabs()
  const { prefs, updatePrefs } = useEditorPrefs()
  const { show: showToast } = useToast()

  const notifySaved = useCallback((): void => {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    showToast('File saved', 'success', 2200)
  }, [showToast])

  const copyPath = useCallback((path: string) => {
    void navigator.clipboard.writeText(path).then(() => {
      showToast('Path copied', 'success', 2000)
    }).catch(() => {
      showToast('Could not copy path', 'error', 2500)
    })
  }, [showToast])

  // ── Core state ────────────────────────────────────────────────────────────
  const [recents, setRecents]       = useState<RecentFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [folders, setFolders]       = useState<FileTreeNode[]>([])
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [cursor, setCursor]         = useState({ ln: 1, col: 1 })
  const [gitDiff, setGitDiff]       = useState<GitLineDiff | null>(null)
  const [logFilter, setLogFilter]   = useState('')
  const [quickOpen, setQuickOpen]   = useState(false)
  const [showFind, setShowFind]     = useState(false)
  const [ctxMenu, setCtxMenu]       = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [renaming, setRenaming]         = useState<string | null>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [creating, setCreating]         = useState<{ parentPath: string; type: 'file' | 'dir' } | null>(null)
  const [openFilesHeight, setOpenFilesHeight] = useState(180)
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [closeConfirm, setCloseConfirm] = useState<{
    tabId: string; name: string; resolve: (r: 'save' | 'discard' | 'cancel') => void
  } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    name: string; isDir: boolean; permanent?: boolean; resolve: (confirmed: boolean) => void
  } | null>(null)

  /** Delete via OS trash; if trash is unavailable, ask again before hard-deleting. */
  const deleteWithFallback = async (targetPath: string, name: string, isDir: boolean): Promise<boolean> => {
    const res = await window.api.invoke<{ ok: boolean; trashFailed?: boolean }>('editor:delete', targetPath)
    if (res.ok) return true
    const confirmed = await new Promise<boolean>((resolve) =>
      setDeleteConfirm({ name, isDir, permanent: true, resolve })
    )
    setDeleteConfirm(null)
    if (!confirmed) return false
    await window.api.invoke('editor:delete-permanent', targetPath)
    return true
  }

  const [savedFlash, setSavedFlash] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  // Paths de archivos abiertos con cambios git sin commitear (dot amber en "Abiertos")
  const [gitModifiedPaths, setGitModifiedPaths] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<{ chars: number; lines: number }>({ chars: 0, lines: 0 })
  const [mdPreview, setMdPreview] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const editorRef      = useRef<EditorHandle | null>(null)
  const restoredRef    = useRef(false)
  const dragTabRef     = useRef<string | null>(null)
  // Stable refs used by the keydown listener so the effect registers once and
  // never needs to re-register (saveTab is a plain function that recreates each render).
  const saveActiveRef  = useRef<() => Promise<void>>(() => Promise.resolve())
  const saveAllRef     = useRef<() => Promise<void>>(() => Promise.resolve())
  const activeTabRef   = useRef<typeof activeTab>(null)
  const recentWritesRef = useRef(new Map<string, { at: number; content: string }>())
  const [dragOverTab, setDragOverTab] = useState<string | null>(null)

  const appDark    = state.theme === 'dark'
  const editorDark = prefs.editorTheme === 'auto' ? appDark : prefs.editorTheme === 'dark'

  // Derived counts from active tab content
  const lineCount = useMemo(() => activeTab?.content.split('\n').length ?? 0, [activeTab?.content])
  // Syntax-highlighting language only — intentionally decoupled from activeTab.language
  // (which drives the icon and must stay extension-only and stable). Lets ambiguous
  // extensions like .cfg get correct XML highlighting without ever touching the icon.
  const highlightLanguage = useMemo(
    () => activeTab ? refineLanguageFromContent(activeTab.language, activeTab.content) : 'text',
    [activeTab?.language, activeTab?.content]
  )
  const wordCount = useMemo(() => {
    const t = activeTab?.content.trim() ?? ''
    return t ? t.split(/\s+/).length : 0
  }, [activeTab?.content])

  // ── Auto-save ─────────────────────────────────────────────────────────────
  useAutoSave(activeTab, prefs, async () => {
    if (!activeTab?.path || !activeTab.isDirty) return
    const result = await window.api.invoke<WriteFileResponse>('editor:write-file', activeTab.path, activeTab.content)
    recentWritesRef.current.set(result.path, { at: Date.now(), content: activeTab.content })
    updateTab(activeTab.id, { isDirty: false, lastModified: result.mtime, size: result.size })
  })

  // ── Report dirty state to global AppContext (drives TabBar dot indicator) ─
  useEffect(() => {
    const hasDirty = tabs.some((t) => t.isDirty)
    dispatch({ type: 'SET_PLUGIN_DIRTY', pluginId: 'file-editor', dirty: hasDirty })
  }, [tabs, dispatch])

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => { window.api.invoke<RecentFile[]>('editor:recent-get').then(setRecents) }, [])

  // Consume OPEN_IN_EDITOR from global state, then clear it so re-mounting FileEditor
  // (e.g. closing and reopening the tab) does not re-fire the openFile call.
  useEffect(() => {
    if (!state.editorTarget) return
    const target = state.editorTarget
    dispatch({ type: 'CLEAR_EDITOR_TARGET' })
    openFile(target.path).catch(() => {
      showToast(`Could not open "${target.path}"`, 'error')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.editorTarget])

  // ── Session restore ───────────────────────────────────────────────────────
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return
    let session: SavedSession
    try { session = JSON.parse(raw) } catch { return }
    if (!session.tabs?.length) return

    // Capture at mount time: if the OS requested a specific file (editorTarget),
    // don't let session restore override the active tab once it completes.
    const hasExternalTarget = !!state.editorTarget

    ;(async () => {
      // Open all file-backed tabs in parallel; unsaved buffers are synchronous
      const results = await Promise.all(
        session.tabs.map(async (saved) => {
          if (saved.path === null) {
            return { tab: openBuffer(saved.name, saved.content, saved.language), path: null as null, name: saved.name }
          }
          const tab = await openFile(saved.path)
          // Re-apply unsaved edits captured before the last close/crash
          if (tab && saved.dirtyContent !== undefined && saved.dirtyContent !== tab.content) {
            updateTab(tab.id, { content: saved.dirtyContent, isDirty: true })
          }
          return { tab, path: saved.path, name: null }
        })
      )
      // Only restore previous active tab if we are NOT opening a file from the OS.
      // Otherwise the session's last active file would steal focus from the target.
      if (!hasExternalTarget) {
        const active = results.find((r) =>
          r.path !== null ? r.path === session.activePath : r.name === session.activeName
        )
        if (active?.tab) setActiveId(active.tab.id)
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Session save ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!restoredRef.current) return
    if (tabs.length === 0) { localStorage.removeItem(SESSION_KEY); return }
    try {
      const session: SavedSession = {
        tabs: tabs.map((t) => t.path === null
          ? { path: null, name: t.name, content: t.content, language: t.language }
          : {
              path: t.path, name: t.name,
              // Persist unsaved edits so a crash or accidental close never loses work
              ...(t.isDirty && t.content.length <= MAX_DIRTY_PERSIST ? { dirtyContent: t.content } : {}),
            }),
        activePath: activeTab?.path ?? null,
        activeName: activeTab?.name ?? null,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch { /* storage full */ }
  }, [tabs, activeId, activeTab])

  // (settings is now a fixed modal — no click-outside needed)

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Keep refs current so the keydown effect (mounted once) always has fresh values.
  useEffect(() => {
    saveActiveRef.current = saveActive
    saveAllRef.current    = saveAllDirty
    activeTabRef.current  = activeTab
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Ctrl+P — quick open
      if (e.ctrlKey && !e.shiftKey && e.key === 'p') { e.preventDefault(); setQuickOpen(true); return }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); createNewFile(); return }
      // Ctrl+Shift+F — find in files
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setShowFind((v) => !v); return }
      if (!e.ctrlKey && !e.shiftKey && e.key === 'F2') {
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
        if (!activeTabRef.current) return
        e.preventDefault()
        setRenamingTabId(activeTabRef.current.id)
        return
      }
      // Ctrl+S — skip when CodeMirror has focus (handled by its own Mod-s keymap)
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        if (!(e.target as HTMLElement)?.closest?.('.cm-editor')) {
          void saveActiveRef.current()
        }
      }
      // Ctrl+Shift+S — save all dirty tabs
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveAllRef.current()
      }
      // Ctrl+Shift+Z — zen mode: solo el código, sin sidebar/breadcrumb/status bar
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        setZenMode((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // stable — all mutable values accessed via refs

  // ── Filter → CodeEditor ───────────────────────────────────────────────────
  useEffect(() => { editorRef.current?.setFilter(logFilter) }, [logFilter])

  // ── Git status por archivo abierto (dot en el listado "Abiertos") ─────────
  useEffect(() => {
    const paths = tabs.filter((t) => t.path !== null).map((t) => t.path!)
    if (paths.length === 0) { setGitModifiedPaths(new Set()); return }
    let cancelled = false
    void (async () => {
      const modified = new Set<string>()
      await Promise.all(paths.map(async (p) => {
        try {
          const diff = await window.api.invoke<GitLineDiff | null>('editor:git-diff', p)
          if (diff && (diff.added.length > 0 || diff.changed.length > 0 || diff.deleted.length > 0)) modified.add(p)
        } catch { /* archivo fuera de un repo git */ }
      }))
      if (!cancelled) setGitModifiedPaths(modified)
    })()
    return () => { cancelled = true }
    // Recalcular al abrir/cerrar tabs y después de cada guardado (lastModified cambia)
  }, [tabs.map((t) => `${t.path}:${t.lastModified}`).join('|')])

  // ── Git diff gutter — recompute on tab switch and after save/external change ─
  useEffect(() => {
    if (!activeTab?.path) { setGitDiff(null); return }
    let cancelled = false
    window.api.invoke<GitLineDiff | null>('editor:git-diff', activeTab.path)
      .then((d) => { if (!cancelled) setGitDiff(d) })
      .catch(() => { if (!cancelled) setGitDiff(null) })
    return () => { cancelled = true }
  }, [activeTab?.path, activeTab?.lastModified])

  // ── File watcher ──────────────────────────────────────────────────────────
  // Tail mode
  useEffect(() => {
    if (activeTab?.tailMode && !activeTab.frozen) editorRef.current?.scrollToBottom()
  }, [activeTab?.content, activeTab?.tailMode, activeTab?.frozen])

  // ── Folder management ─────────────────────────────────────────────────────
  const refreshFolder = useCallback(async (rootPath: string): Promise<void> => {
    try {
      const tree = await window.api.invoke<FileTreeNode>('editor:read-dir', rootPath)
      setFolders((prev) => prev.map((f) => f.path === rootPath ? tree : f))
    } catch {
      setFolders((prev) => prev.filter((f) => f.path !== rootPath))
    }
  }, [])

  const findRootPath = useCallback((nodePath: string): string | null =>
    folders.find((f) => nodePath.startsWith(f.path))?.path ?? null
  , [folders])

  const addFolder = useCallback((tree: FileTreeNode): void => {
    setFolders((prev) => prev.find((f) => f.path === tree.path) ? prev : [...prev, tree])
    setExpanded((prev) => new Set([...prev, tree.path]))
  }, [])

  const removeFolder  = (fp: string): void => setFolders((prev) => prev.filter((f) => f.path !== fp))

  const markDeletedTabs = useCallback((targetPath: string, isDir: boolean): void => {
    tabs.forEach((tab) => {
      if (!isSameOrChildPath(tab.path, targetPath, isDir)) return
      closeTab(tab.id)
    })
  }, [tabs, closeTab])

  const onFileChanged = useCallback((event: FileChangedEvent) => {
    const tab = tabs.find((t) => t.path === event.path)
    if (!tab) return
    const recentWrite = recentWritesRef.current.get(event.path)
    if (event.kind === 'changed' && recentWrite && Date.now() - recentWrite.at < 1500 && recentWrite.content === event.content) {
      recentWritesRef.current.delete(event.path)
      updateTab(tab.id, { hasUpdate: false, isDeleted: false, lastModified: event.mtime, size: event.size })
      return
    }
    if (event.kind === 'deleted') {
      const rootPath = findRootPath(event.path)
      if (rootPath) void refreshFolder(rootPath)
      showToast(`"${tab.name}" was deleted on disk`, 'error')
      closeTab(tab.id)
      return
    }
    // File was modified externally. If we have no unsaved edits, it's safe to just
    // reload — but if the tab is dirty, applying the disk version would silently
    // discard the user's in-progress changes, so stash it for them to resolve instead.
    if (tab.isDirty) {
      updateTab(tab.id, {
        hasUpdate: true,
        isDeleted: false,
        pendingExternalContent: event.content,
        pendingExternalMtime: event.mtime,
        pendingExternalSize: event.size,
      })
      showToast(`"${tab.name}" changed on disk — you have unsaved edits`, 'warning')
      return
    }
    updateTab(tab.id, {
      content: event.content,
      lastModified: event.mtime,
      hasUpdate: false,
      isDeleted: false,
      isDirty: false,
      size: event.size,
    })
    showToast(`"${tab.name}" updated from disk`, 'info')
  }, [tabs, updateTab, closeTab, findRootPath, refreshFolder, showToast])
  useFileWatcher({ tab: activeTab, onFileChanged })

  async function saveTab(tab: OpenFile): Promise<boolean> {
    if (tab.truncated) {
      showToast(`"${tab.name}" está mostrando solo una parte (archivo grande) — cargá el archivo completo antes de guardar para no perder el resto.`, 'error', 5000)
      return false
    }

    let targetPath = tab.path

    if (targetPath === null) {
      const suggestedName = tab.name.includes('.') ? tab.name : `${tab.name}.txt`
      targetPath = await window.api.invoke<string | null>('editor:save-dialog', suggestedName)
      if (!targetPath) return false
    }

    const result = await window.api.invoke<WriteFileResponse>('editor:write-file', targetPath, tab.content)
    const now = Date.now()
    recentWritesRef.current.set(result.path, { at: now, content: tab.content })
    // Evict entries older than 10 s to prevent unbounded growth in long sessions
    recentWritesRef.current.forEach((v, k) => { if (now - v.at > 10_000) recentWritesRef.current.delete(k) })
    const savedName = result.path.split(/[\\/]/).pop() ?? result.path

    updateTab(tab.id, {
      path: result.path,
      name: savedName,
      language: detectLanguage(savedName),
      isDirty: false,
      hasUpdate: false,
      isDeleted: false,
      lastModified: result.mtime,
      size: result.size,
    })
    setRecents((prev) => [
      { path: result.path, name: savedName, openedAt: new Date().toISOString() },
      ...prev.filter((r) => r.path !== result.path),
    ])

    const rootPath = findRootPath(result.path)
    if (rootPath) void refreshFolder(rootPath)

    notifySaved()
    return true
  }

  const handleCloseTab = useCallback(async (tabId: string): Promise<void> => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    if (tab.isDirty) {
      const result = await new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
        setCloseConfirm({ tabId, name: tab.name, resolve })
      })
      setCloseConfirm(null)
      if (result === 'cancel') return
      if (result === 'save') {
        const saved = await saveTab(tab)
        if (!saved) return
      }
    }
    closeTab(tabId)
  }, [tabs, closeTab, saveTab])

  const toggleSelection = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= 2) {
          const [first] = next
          next.delete(first!) // size >= 2 guarantees at least one element
        }
        next.add(id)
      }
      return next
    })
  }, [])

  const sendSelectedToDiff = useCallback((): void => {
    const selected = tabs.filter((t) => selectedIds.has(t.id))
    if (selected.length !== 2) return
    const [a, b] = selected as [typeof selected[0], typeof selected[0]] // length === 2 checked above
    dispatch({
      type: 'SEND_PAIR_TO_DIFF',
      file1: { name: a.name, path: a.path, content: a.content },
      file2: { name: b.name, path: b.path, content: b.content },
    })
    setSelectedIds(new Set())
  }, [tabs, selectedIds, dispatch])

  const toggleExpanded = (p: string): void => setExpanded((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })

  const handleSidebarResizePointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = prefs.sidebarWidth
    const onMove = (ev: PointerEvent): void => {
      updatePrefs({ sidebarWidth: Math.max(SIDEBAR_WIDTH_MIN, Math.min(startW + (ev.clientX - startX), SIDEBAR_WIDTH_MAX)) })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleSplitPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startH = openFilesHeight
    const onMove = (ev: PointerEvent): void => {
      setOpenFilesHeight(Math.max(60, Math.min(startY - ev.clientY + startH, 480)))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const openFolderDialog = async (): Promise<void> => {
    const paths = await window.api.invoke<string[]>('editor:open-folder-dialog')
    for (const p of paths) { const tree = await window.api.invoke<FileTreeNode>('editor:read-dir', p); addFolder(tree) }
  }

  // ── Tree context menu ─────────────────────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode, rootPath: string): void => {
    e.preventDefault(); e.stopPropagation()
    const dirPath = node.isDir ? node.path : getParentDir(node.path)
    const items: MenuItem[] = [
      { label: 'Nuevo archivo', icon: FilePlus,   action: () => setCreating({ parentPath: dirPath, type: 'file' }) },
      { label: 'Nueva carpeta', icon: FolderPlus, action: () => setCreating({ parentPath: dirPath, type: 'dir'  }) },
      { divider: true, label: '', action: () => {} },
      { label: 'Renombrar', icon: Pencil, action: () => setRenaming(node.path) },
      ...(node.path !== rootPath ? [{
        label: 'Eliminar', icon: Trash2, danger: true,
        action: async () => {
          const confirmed = await new Promise<boolean>((resolve) =>
            setDeleteConfirm({ name: node.name, isDir: node.isDir, resolve })
          )
          setDeleteConfirm(null)
          if (!confirmed) return
          if (!await deleteWithFallback(node.path, node.name, node.isDir)) return
          markDeletedTabs(node.path, node.isDir)
          refreshFolder(rootPath)
        },
      }] : []),
      { divider: true, label: '', action: () => {} },
      { label: 'Copiar ruta',          icon: Copy,       action: () => copyPath(node.path) },
      { label: 'Mostrar en el explorador', icon: FolderOpen, action: () => window.api.invoke('editor:reveal', node.path) },
      { label: 'Abrir terminal acá', icon: SquareTerminal, action: () => dispatch({ type: 'OPEN_TERMINAL_HERE', cwd: dirPath }) },
    ]
    setCtxMenu({ x: e.clientX, y: e.clientY, items })
  }

  // ── Inline rename / create ────────────────────────────────────────────────
  const handleRenameCommit = async (oldPath: string, newName: string): Promise<void> => {
    setRenaming(null)
    const newPath = appendPath(getParentDir(oldPath), newName)
    if (oldPath === newPath) return
    try {
      await window.api.invoke('editor:rename', oldPath, newPath)
      tabs.forEach((t) => { if (t.path === oldPath) updateTab(t.id, { path: newPath, name: newName }) })
      const root = findRootPath(oldPath)
      if (root) await refreshFolder(root)
    } catch (err) {
      console.error('Rename failed', err)
      showToast(`Error al renombrar: ${err instanceof Error ? err.message : 'error desconocido'}`, 'error')
    }
  }

  const handleRenameTab = async (tabId: string, newName: string): Promise<void> => {
    setRenamingTabId(null)
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab || !newName.trim() || newName === tab.name) return
    if (tab.path) {
      await handleRenameCommit(tab.path, newName.trim())
    } else {
      const name = newName.trim()
      updateTab(tabId, { name, language: detectLanguage(name) })
    }
  }

  const handleTabContextMenu = (e: React.MouseEvent, tab: OpenFile): void => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Renombrar',          icon: Pencil, action: () => setRenamingTabId(tab.id) },
        { label: 'Guardar',            icon: Save,   action: saveActive },
        { divider: true, label: '', action: () => {} },
        { label: 'Comparar en Smart Diff', icon: Diff, action: () => dispatch({ type: 'SEND_TO_DIFF', name: tab.name, path: tab.path, content: tab.content }) },
        ...(selectedIds.size === 2 && selectedIds.has(tab.id) ? [
          { label: 'Comparar 2 archivos seleccionados', icon: Diff, action: sendSelectedToDiff },
        ] : []),
        { divider: true, label: '', action: () => {} },
        ...(tab.path ? [
          { label: 'Copiar ruta',          icon: Copy,       action: () => copyPath(tab.path!) },
          { label: 'Mostrar en el explorador', icon: FolderOpen, action: () => window.api.invoke('editor:reveal', tab.path!) },
          { divider: true, label: '', action: () => {} },
          {
            label: 'Eliminar', icon: Trash2, danger: true,
            action: async () => {
              const confirmed = await new Promise<boolean>((resolve) =>
                setDeleteConfirm({ name: tab.name, isDir: false, resolve })
              )
              setDeleteConfirm(null)
              if (!confirmed) return
              if (!await deleteWithFallback(tab.path!, tab.name, false)) return
              const root = findRootPath(tab.path!)
              markDeletedTabs(tab.path!, false)
              if (root) await refreshFolder(root)
            },
          },
        ] : []),
        { label: 'Cerrar', icon: X, action: () => handleCloseTab(tab.id), danger: true },
      ],
    })
  }

  const handleOpenFilesPanelContextMenu = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('[data-tab-item]')) return
    e.preventDefault()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Nuevo archivo',   icon: FilePlus,   action: createNewFile },
        { label: 'Abrir archivo…', icon: FileInput, action: openDialog },
        ...(tabs.some((t) => t.isDirty) ? [
          { divider: true, label: '', action: () => {} },
          { label: 'Guardar todo', icon: Save, action: () => void saveAllDirty() },
        ] : []),
      ],
    })
  }

  const handleCreateCommit = async (parentPath: string, name: string, type: 'file' | 'dir'): Promise<void> => {
    setCreating(null)
    const newPath = appendPath(parentPath, name)
    try {
      if (type === 'file') { await window.api.invoke('editor:create-file', newPath); await openFile(newPath) }
      else                 { await window.api.invoke('editor:create-dir', newPath) }
      const root = findRootPath(parentPath) ?? parentPath
      await refreshFolder(root)
      setExpanded((prev) => new Set([...prev, parentPath]))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Could not create ${type}: ${msg}`, 'error')
    }
  }

  const treeCb: TreeCallbacks = {
    onOpen: openFile, onContextMenu: handleContextMenu, renaming, creating,
    onRenameCommit: handleRenameCommit, onCreateCommit: handleCreateCommit,
    onCancel: () => { setRenaming(null); setCreating(null) },
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent): void => { e.preventDefault(); e.dataTransfer.dropEffect = 'open' as DataTransfer['dropEffect']; setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent): void => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }
  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault(); setIsDragging(false)
    for (const f of Array.from(e.dataTransfer.files) as (File & { path: string })[]) {
      if (!f.path) continue
      try { addFolder(await window.api.invoke<FileTreeNode>('editor:read-dir', f.path)) }
      catch { await openFile(f.path) }
    }
  }

  // ── Dialog helpers ────────────────────────────────────────────────────────
  const openDialog = async (): Promise<void> => {
    const paths = await window.api.invoke<string[]>('editor:open-dialog')
    for (const p of paths) await openFile(p)
  }
  const createNewFile = (): void => {
    newFileCount++
    const file = openBuffer(newFileCount === 1 ? 'Untitled.txt' : `Untitled-${newFileCount}.txt`, '', 'text')
    setRenamingTabId(file.id)
  }

  // ── Tab actions ───────────────────────────────────────────────────────────
  const toggleWatch  = (): void => { if (activeTab) updateTab(activeTab.id, { watchActive: !activeTab.watchActive }) }
  const toggleTail   = (): void => { if (activeTab) updateTab(activeTab.id, { tailMode: !activeTab.tailMode }) }
  const toggleFreeze = (): void => { if (activeTab) updateTab(activeTab.id, { frozen: !activeTab.frozen }) }
  const toggleWrap   = (): void => { if (activeTab) updateTab(activeTab.id, { wordWrap: !activeTab.wordWrap }) }

  const saveActive = async (): Promise<void> => {
    if (!activeTab) return
    if (activeTab.path === null || activeTab.isDirty) await saveTab(activeTab)
  }

  const saveAllDirty = async (): Promise<void> => {
    const dirty = tabs.filter((t) => t.isDirty)
    if (dirty.length === 0) return
    let saved = 0
    for (const t of dirty) {
      if (await saveTab(t)) saved++
    }
    if (saved > 0) showToast(`${saved} archivo${saved === 1 ? '' : 's'} guardado${saved === 1 ? '' : 's'}`, 'success', 2200)
  }

  const openFileAtLine = async (path: string, line: number): Promise<void> => {
    await openFile(path)
    setTimeout(() => editorRef.current?.scrollToLine(line), 80)
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden relative">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={[
          'flex-shrink-0 flex flex-col border-r border-outline-variant/15 overflow-hidden',
          sidebarCollapsed ? 'w-10 transition-[width] duration-200 ease-out' : '',
          zenMode ? 'hidden' : '',
        ].join(' ')}
        style={sidebarCollapsed ? {
          background: 'rgb(var(--c-surface) / 0.8)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        } : {
          width: prefs.sidebarWidth,
          background: 'rgb(var(--c-surface) / 0.78)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
      {sidebarCollapsed ? (
        <CollapsedSidebarRail
          tabs={tabs}
          activeId={activeId}
          onExpand={() => setSidebarCollapsed(false)}
          onSelectTab={(id) => { setSelectedIds(new Set()); setActiveId(id) }}
          onTabContextMenu={handleTabContextMenu}
        />
      ) : (<>

        {/* EXPLORER */}
        {folders.length > 0 && (
          <div className="flex flex-col min-h-[60px] overflow-hidden" style={{ flex: '1 1 0' }}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1.5 flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Explorer</span>
              <button onClick={openFolderDialog} title="Open folder" className="text-on-surface-variant hover:text-primary transition-colors">
                <FolderOpen size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pb-1">
              {folders.map((folder) => (
                <FolderRoot key={folder.path} folder={folder} expanded={expanded} onToggle={toggleExpanded} onClose={removeFolder} cb={treeCb} />
              ))}
            </div>
          </div>
        )}

        {/* Resize handle — only visible when Explorer is shown */}
        {folders.length > 0 && (
          <div
            onPointerDown={handleSplitPointerDown}
            className="flex-shrink-0 h-[10px] cursor-row-resize group border-t border-outline-variant/15 hover:bg-primary/20 transition-colors"
            style={{ touchAction: 'none' }}
            title="Drag to resize"
          >
            <div className="mx-auto mt-[3px] w-8 h-[2px] rounded-full bg-outline-variant/30 group-hover:bg-primary/50 transition-colors" />
          </div>
        )}

        {/* OPEN FILES */}
        <div
          className={`flex flex-col border-outline-variant/15 flex-shrink-0 ${folders.length > 0 ? 'border-t-0' : 'border-t flex-1'}`}
          style={folders.length > 0 ? { height: openFilesHeight } : undefined}
          onContextMenu={handleOpenFilesPanelContextMenu}
        >
          <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1 flex-shrink-0 gap-1">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/55 whitespace-nowrap">
              Abiertos
              {tabs.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-surface-container text-on-surface-variant/70 tabular-nums normal-case tracking-normal">
                  {tabs.length}
                </span>
              )}
              {tabs.some((t) => t.isDirty) && (
                <span
                  className="text-[9px] font-bold px-1.5 py-px rounded-full bg-warning/15 text-warning tabular-nums normal-case tracking-normal"
                  title="Archivos sin guardar"
                >
                  {tabs.filter((t) => t.isDirty).length}●
                </span>
              )}
            </span>
            <div className="flex items-center gap-0.5 rounded-lg bg-surface-container/60 p-0.5">
              <Tooltip label="Nuevo archivo" shortcut="Ctrl+T">
                <button onClick={createNewFile} aria-label="Nuevo archivo"
                  className="p-1 rounded-md text-on-surface-variant/70 hover:text-accent hover:bg-accent/10 transition-colors">
                  <FilePlus size={15} />
                </button>
              </Tooltip>
              <Tooltip label="Abrir archivo" shortcut="Ctrl+O">
                <button onClick={openDialog} aria-label="Abrir archivo"
                  className="p-1 rounded-md text-on-surface-variant/70 hover:text-secondary hover:bg-secondary/10 transition-colors">
                  <Import size={15} />
                </button>
              </Tooltip>
              {folders.length === 0 && (
                <Tooltip label="Abrir carpeta">
                  <button onClick={openFolderDialog} aria-label="Abrir carpeta"
                    className="p-1 rounded-md text-on-surface-variant/70 hover:text-warning hover:bg-warning/10 transition-colors">
                    <FolderOpen size={15} />
                  </button>
                </Tooltip>
              )}
              <Tooltip label="Colapsar barra lateral">
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  aria-label="Colapsar barra lateral"
                  className="p-1 rounded-md text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high transition-colors border-l border-outline-variant/20 ml-0.5 pl-1"
                >
                  <PanelLeftClose size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="mx-2 mb-1 px-2.5 py-1.5 rounded-lg flex items-center gap-2 flex-shrink-0 bg-on-surface/[0.06] [box-shadow:inset_0_0_0_1px_rgb(var(--c-outline-variant)_/_0.3)]">
              <span className="text-[10px] font-semibold text-on-surface">
                {selectedIds.size}/2 seleccionados
              </span>
              {selectedIds.size === 2 && (
                <button onClick={sendSelectedToDiff}
                  className="flex items-center gap-1 ml-auto px-2 py-0.5 rounded-md text-[10px] font-bold text-on-surface hover:bg-on-surface/10 transition-colors">
                  <Diff size={12} />
                  Comparar
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())} title="Limpiar selección"
                className="text-on-surface-variant/50 hover:text-on-surface transition-colors">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 px-2">
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 pt-5 px-3 text-center select-none">
                <div className="relative">
                  <div aria-hidden className="absolute inset-[-6px] rounded-full blur-lg" style={{ background: 'rgb(var(--c-primary) / 0.10)' }} />
                  <div className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-surface-container border border-outline-variant/20">
                    <FileText size={18} className="text-primary/60" strokeWidth={1.5} />
                  </div>
                </div>
                <p className="text-[11px] text-on-surface-variant/50 leading-relaxed">
                  No hay archivos abiertos.<br />Soltá un archivo acá o presioná
                  {' '}<kbd className="text-[9px] px-1 py-px rounded border border-outline-variant/25 bg-surface-container font-mono">Ctrl+T</kbd>
                </p>
              </div>
            ) : (
              tabs.map((tab) => (
                <div
                  key={tab.id}
                  onDragOver={(e) => {
                    if (dragTabRef.current && dragTabRef.current !== tab.id) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverTab(tab.id)
                    }
                  }}
                  onDragLeave={() => setDragOverTab((prev) => prev === tab.id ? null : prev)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragTabRef.current && dragTabRef.current !== tab.id) {
                      reorderTabs(dragTabRef.current, tab.id)
                    }
                    dragTabRef.current = null
                    setDragOverTab(null)
                  }}
                  style={dragOverTab === tab.id ? { boxShadow: 'inset 0 2px 0 rgb(var(--c-primary))' } : undefined}
                >
                  <FileListItem
                    tab={tab} isActive={activeId === tab.id}
                    isSelected={selectedIds.has(tab.id)}
                    savedFlash={savedFlash && activeId === tab.id}
                    gitModified={tab.path !== null && gitModifiedPaths.has(tab.path)}
                    onClick={() => { setSelectedIds(new Set()); setActiveId(tab.id) }}
                    onCtrlClick={() => toggleSelection(tab.id)}
                    onClose={() => { setSelectedIds((p) => { const n = new Set(p); n.delete(tab.id); return n }); void handleCloseTab(tab.id) }}
                    onSave={saveActive}
                    onContextMenu={(e) => handleTabContextMenu(e, tab)}
                    renaming={renamingTabId === tab.id}
                    onRenameCommit={(name) => handleRenameTab(tab.id, name)}
                    onRenameCancel={() => setRenamingTabId(null)}
                    onDragStart={() => { dragTabRef.current = tab.id }}
                    onDragEnd={() => { dragTabRef.current = null; setDragOverTab(null) }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* RECENT */}
        {recents.length > 0 && folders.length === 0 && (
          <div className="border-t border-outline-variant/15 flex-shrink-0">
            <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Recientes</p>
              <Tooltip label="Limpiar recientes">
                <button
                  onClick={() => { void window.api.invoke('editor:recent-clear').then(() => setRecents([])) }}
                  aria-label="Limpiar recientes"
                  className="p-0.5 rounded text-on-surface-variant/35 hover:text-error hover:bg-error/10 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </Tooltip>
            </div>
            <div className="overflow-y-auto max-h-36 pb-2">
              {recents.slice(0, 8).map((r) => (
                <button key={r.path} onClick={() => openFile(r.path)} title={r.path}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-surface-container transition-colors group">
                  {(() => { const lang = detectLanguage(r.name); const Icon = languageIcon(lang); return <Icon size={13} className="flex-shrink-0" style={{ color: langColor(lang) }} /> })()}
                  <span className="text-[11px] text-on-surface-variant group-hover:text-on-surface truncate flex-1">{r.name}</span>
                  <ArrowUpRight size={11} className="flex-shrink-0 text-primary opacity-0 group-hover:opacity-70 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}
      </>)}
      </aside>

      {/* Sidebar width resize handle */}
      {!sidebarCollapsed && !zenMode && (
        <div
          onPointerDown={handleSidebarResizePointerDown}
          className="flex-shrink-0 w-[5px] -mx-[2px] z-10 cursor-col-resize group transition-colors relative"
          style={{ touchAction: 'none' }}
          title="Arrastrar para redimensionar"
        >
          <div className="absolute inset-y-0 left-[2px] w-[1px] transition-all duration-150 group-hover:w-[3px] group-hover:left-[1px] group-active:w-[3px]"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, rgb(var(--c-primary) / 0) 20%, rgb(var(--c-primary) / 0.5) 50%, rgb(var(--c-primary) / 0) 80%, transparent 100%)' }}
          />
          <div className="absolute inset-y-0 left-[2px] w-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
            style={{ background: 'rgb(var(--c-primary) / 0.3)', filter: 'blur(4px)' }}
          />
        </div>
      )}

      {/* ── Main editor area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

        {/* Tab bar + settings */}
        <div className={`flex items-center border-b border-outline-variant/20 bg-surface-container-low flex-shrink-0 ${zenMode ? 'hidden' : ''}`}>
          <div
            className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide px-2 py-1.5"
            style={{ maskImage: tabs.length > 1 ? 'linear-gradient(to right, transparent 0, black 8px, black calc(100% - 8px), transparent 100%)' : undefined }}
          >
            <AnimatePresence initial={false}>
            {tabs.map((tab) => (
              <motion.div key={tab.id}
                layout
                initial={{ opacity: 0, scale: 0.88, x: -8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: -6 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                draggable
                onDragStart={(e) => {
                  dragTabRef.current = tab.id
                  dragState.set({ name: tab.name, path: tab.path, content: tab.content })
                  const de = e as unknown as React.DragEvent
                  de.dataTransfer.setData('text/plain', tab.name)
                  de.dataTransfer.effectAllowed = 'copyMove'
                }}
                onDragOver={(e) => {
                  if (dragTabRef.current && dragTabRef.current !== tab.id) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverTab(tab.id)
                  }
                }}
                onDragLeave={() => setDragOverTab((prev) => prev === tab.id ? null : prev)}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragTabRef.current && dragTabRef.current !== tab.id) {
                    reorderTabs(dragTabRef.current, tab.id)
                  }
                  dragTabRef.current = null
                  setDragOverTab(null)
                }}
                onDragEnd={() => {
                  dragTabRef.current = null
                  dragState.set(null)
                  setDragOverTab(null)
                }}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) { e.preventDefault(); toggleSelection(tab.id) }
                  else { setSelectedIds(new Set()); setActiveId(tab.id) }
                }}
                onContextMenu={(e) => handleTabContextMenu(e, tab)}
                title={`${tab.name}${tab.path ? `\n${tab.path}` : ''}\nCtrl+click to select · Drag to reorder · Drag onto Smart Diff to compare`}
                className={`relative flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-[12px] font-medium cursor-grab active:cursor-grabbing whitespace-nowrap group transition-colors duration-150 flex-shrink-0 rounded-lg border ${
                  dragOverTab === tab.id ? 'ring-2 ring-primary/50' : ''
                } ${
                  selectedIds.has(tab.id)
                    ? 'text-on-surface bg-on-surface/[0.1] border-outline-variant/50'
                    : activeId === tab.id
                      ? 'text-white border-transparent'
                      : 'text-on-surface-variant bg-surface-container/60 border-outline-variant/15 hover:text-on-surface hover:bg-surface-container-high'}`}
                style={activeId === tab.id ? { background: 'var(--gradient-brand)', boxShadow: '0 2px 8px rgb(var(--c-primary) / 0.32)' } : undefined}>
                {(() => { const Icon = languageIcon(tab.language); return <Icon size={13} style={{ color: langColor(tab.language) }} /> })()}
                <span className="max-w-[120px] truncate">{tab.name}</span>
                {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                <button onClick={(e) => { e.stopPropagation(); void handleCloseTab(tab.id) }}
                  className="flex items-center justify-center w-4 h-4 rounded-md opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error hover:bg-error/10 transition-all ml-0.5">
                  <X size={11} />
                </button>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-0.5 px-2 flex-shrink-0">
            {activeTab?.language === 'markdown' && (
              <Tooltip label={mdPreview ? 'Ocultar preview' : 'Preview de Markdown'}>
                <button onClick={() => setMdPreview((v) => !v)} aria-label="Preview de Markdown"
                  className={`p-1.5 rounded-lg transition-colors ${mdPreview ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
                  <Eye size={15} />
                </button>
              </Tooltip>
            )}
            <Tooltip label="Apertura rápida" shortcut="Ctrl+P">
              <button onClick={() => setQuickOpen(true)} aria-label="Apertura rápida"
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors">
                <FolderSearch size={15} />
              </button>
            </Tooltip>
            <Tooltip label="Buscar en archivos" shortcut="Ctrl+Shift+F">
              <button onClick={() => setShowFind((v) => !v)} aria-label="Buscar en archivos"
                className={`p-1.5 rounded-lg transition-colors ${showFind ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
                <FileSearch size={15} />
              </button>
            </Tooltip>

            {/* Settings trigger — opens full modal to avoid overflow-hidden clipping */}
            <Tooltip label="Ajustes del editor">
              <button onClick={() => setSettingsOpen(true)} aria-label="Ajustes del editor"
                className={`p-1.5 rounded-lg transition-colors ${settingsOpen ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
                <SlidersHorizontal size={16} />
              </button>
            </Tooltip>

            <AnimatePresence>
            {settingsOpen && (
              <motion.div
                className="fixed inset-0 z-[200] flex items-center justify-end bg-black/30 backdrop-blur-sm"
                onClick={() => setSettingsOpen(false)}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <motion.div
                  className="ui-card h-full w-72 rounded-none border-l border-y-0 border-r-0 flex flex-col overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: 'var(--gradient-brand)' }}>
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={15} className="text-white/80" />
                      <span className="text-sm font-semibold text-white">Ajustes del editor</span>
                    </div>
                    <button onClick={() => setSettingsOpen(false)} className="text-white/70 hover:text-white transition-colors">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex-1 p-4 flex flex-col gap-5">
                  {/* ghost div to maintain old JSX structure below */}
                  <div>
                  {/* Font */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Fuente</p>
                    <div className="flex flex-col gap-0.5">
                      {FONT_FAMILIES.map((f) => (
                        <button key={f} onClick={() => updatePrefs({ fontFamily: f })}
                          className={`text-left text-[11px] px-2 py-1 rounded-lg transition-colors ${prefs.fontFamily === f ? 'bg-primary/10 text-primary font-medium' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
                          style={{ fontFamily: `'${f}', monospace` }}>{f}</button>
                      ))}
                    </div>
                  </div>
                  {/* Size */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Tamaño</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updatePrefs({ fontSize: Math.max(FONT_SIZE_MIN, prefs.fontSize - 0.5) })} disabled={prefs.fontSize <= FONT_SIZE_MIN}
                        className="w-6 h-6 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-30 transition-colors flex items-center justify-center text-sm font-bold">−</button>
                      <span className="text-xs text-on-surface font-medium tabular-nums w-12 text-center">{prefs.fontSize}px</span>
                      <button onClick={() => updatePrefs({ fontSize: Math.min(FONT_SIZE_MAX, prefs.fontSize + 0.5) })} disabled={prefs.fontSize >= FONT_SIZE_MAX}
                        className="w-6 h-6 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-30 transition-colors flex items-center justify-center text-sm font-bold">+</button>
                    </div>
                  </div>
                  {/* Theme */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Tema</p>
                    <div className="flex gap-1">
                      {(['auto', 'dark', 'light'] as const).map((t) => (
                        <button key={t} onClick={() => updatePrefs({ editorTheme: t })}
                          className={`flex-1 text-[11px] py-1 rounded-lg border transition-colors ${prefs.editorTheme === t ? 'border-primary/40 text-primary bg-primary/10 font-medium' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-on-surface'}`}>
                          {t === 'auto' ? 'Auto' : t === 'dark' ? 'Oscuro' : 'Claro'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Auto-save */}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Autoguardado</p>
                    <button onClick={() => updatePrefs({ autoSave: !prefs.autoSave })}
                      className={`relative w-8 h-4 rounded-full transition-colors ${prefs.autoSave ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${prefs.autoSave ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {/* Minimap */}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Minimapa</p>
                    <button onClick={() => updatePrefs({ minimap: !prefs.minimap })}
                      className={`relative w-8 h-4 rounded-full transition-colors ${prefs.minimap ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${prefs.minimap ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {/* Color scheme */}
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Esquema de color</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { id: 'nexus',    label: 'Nexus',    colors: ['#887CFD', '#16C8C7', '#4896FE'] },
                        { id: 'httpie',   label: 'HTTPie',   colors: ['#9ece6a', '#e0af68', '#bb9af7'] },
                        { id: 'aurora',   label: 'Aurora',   colors: ['#8B93FF', '#FF6FA8', '#5CCFE6'] },
                        { id: 'dracula',  label: 'Dracula',  colors: ['#FF79C6', '#BD93F9', '#50FA7B'] },
                        { id: 'monokai',  label: 'Monokai',  colors: ['#F92672', '#A6E22E', '#66D9EF'] },
                      ] as const).map(({ id, label, colors }) => (
                        <button key={id} onClick={() => updatePrefs({ colorScheme: id })}
                          className={`flex flex-col gap-1.5 items-center px-2 py-2 rounded-lg border transition-all ${prefs.colorScheme === id ? 'border-primary bg-primary/10' : 'border-outline-variant/30 hover:border-outline-variant/60'}`}>
                          <div className="flex gap-1">
                            {colors.map((c) => <span key={c} className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c }} />)}
                          </div>
                          <span className={`text-[10px] font-medium ${prefs.colorScheme === id ? 'text-primary' : 'text-on-surface-variant'}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Tail lines */}
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Líneas finales (archivos grandes)</p>
                    <input
                      type="number"
                      min={100}
                      max={50000}
                      step={500}
                      value={prefs.tailLinesCount}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v) && v >= 100) updatePrefs({ tailLinesCount: v })
                      }}
                      className="ui-input w-full text-xs"
                    />
                  </div>
                  </div>{/* end ghost div */}
                  </div>{/* end p-4 flex col */}
                </motion.div>{/* end panel */}
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>

        {/* Monitoring bar — only relevant for files that exist on disk */}
        {activeTab?.path && (
          <div className="flex items-center gap-3 px-3 py-1 border-b flex-shrink-0 text-xs transition-colors duration-300"
            style={activeTab.watchActive ? {
              background: 'rgb(var(--c-accent) / 0.06)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderColor: 'rgb(var(--c-accent) / 0.20)',
            } : {
              background: 'rgb(var(--c-surface))',
              borderColor: 'rgb(var(--c-outline-variant) / 0.15)',
            }}>
            <button onClick={toggleWatch} title={activeTab.watchActive ? 'Dejar de monitorear' : 'Monitorear cambios del archivo'}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors flex-shrink-0 ${activeTab.watchActive ? 'border-accent/40 text-accent bg-accent/10 font-semibold' : 'border-outline-variant/30 text-on-surface-variant hover:border-accent/30 hover:text-accent'}`}>
              {activeTab.watchActive ? <Eye size={14} /> : <EyeOff size={14} />}
              Monitorear
            </button>

            {activeTab.watchActive && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeTab.frozen ? 'bg-on-surface-variant/50' : 'bg-accent animate-pulse'}`} />
                  <span className={`font-medium ${activeTab.frozen ? 'text-on-surface-variant' : 'text-accent'}`}>{activeTab.frozen ? 'Pausado' : 'En vivo'}</span>
                </div>
                {/* Log filter */}
                <div className="ui-input flex items-center gap-1.5 px-2 py-0.5">
                  <Filter size={12} className="text-on-surface-variant/40" />
                  <input value={logFilter} onChange={(e) => setLogFilter(e.target.value)} placeholder="Filtrar líneas…"
                    className="bg-transparent text-[11px] text-on-surface outline-none placeholder:text-on-surface-variant/30 w-28" />
                  {logFilter && (
                    <button onClick={() => setLogFilter('')} className="text-on-surface-variant/40 hover:text-on-surface-variant">
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={toggleTail} title="Auto-scroll al final"
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors ${activeTab.tailMode ? 'border-primary/40 text-primary bg-primary/10' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30'}`}>
                    <ArrowDown size={12} />Seguir
                  </button>
                  <button onClick={toggleFreeze}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors ${activeTab.frozen ? 'border-error/40 text-error bg-error/10' : 'border-outline-variant/30 text-on-surface-variant hover:border-error/30'}`}>
                    {activeTab.frozen ? <Play size={12} /> : <Pause size={12} />}
                    {activeTab.frozen ? 'Reanudar' : 'Pausar'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Loading bar — feedback while a (possibly large/slow) file is being read */}
        {isOpening && (
          <div className="h-[2px] w-full overflow-hidden bg-primary/10 flex-shrink-0">
            <div className="h-full w-1/3 bg-primary fe-loading-bar" />
          </div>
        )}

        {/* Breadcrumb */}
        {activeTab?.path && !zenMode && <Breadcrumb filePath={activeTab.path} onPathCopied={() => showToast('Path copied', 'success', 2000)} />}

        {/* Encoding warning — file doesn't look like valid UTF-8 */}
        {activeTab?.encodingWarning && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-l-[3px] flex-shrink-0 text-xs text-amber-400"
            style={{ borderLeftColor: 'rgb(217 119 6)', borderBottomColor: 'rgba(245,158,11,0.18)', background: 'rgba(245,158,11,0.06)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <AlertTriangle size={15} className="flex-shrink-0 text-amber-400" />
            <span>Este archivo no parece ser UTF-8 válido (¿binario u otra codificación?). Editarlo y guardarlo puede corromperlo.</span>
          </div>
        )}

        {/* Large-file truncation notice */}
        {activeTab?.truncated && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/25 text-xs text-amber-400 flex-shrink-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            Archivo grande — mostrando las últimas 2 000 líneas.
            <button
              className="ml-auto underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity"
              onClick={() => {
                if (!activeTab.path) return
                // Close the current tab and re-open with tailLinesCount = -1 (load all)
                closeTab(activeTab.id)
                void openFile(activeTab.path, undefined, -1)
              }}
            >
              Cargar completo
            </button>
          </div>
        )}

        {/* External-change conflict notice — file changed on disk while we have unsaved edits */}
        {activeTab?.hasUpdate && activeTab.pendingExternalContent !== undefined && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-l-[3px] flex-shrink-0 text-xs text-error"
            style={{ borderLeftColor: 'rgb(var(--c-error))', borderBottomColor: 'rgb(var(--c-error) / 0.18)', background: 'rgb(var(--c-error) / 0.06)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span className="flex-1">Este archivo cambió en disco y tenés ediciones sin guardar.</span>
            <button
              className="underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={() => {
                updateTab(activeTab.id, {
                  content: activeTab.pendingExternalContent!,
                  lastModified: activeTab.pendingExternalMtime,
                  size: activeTab.pendingExternalSize,
                  isDirty: false,
                  hasUpdate: false,
                  pendingExternalContent: undefined,
                  pendingExternalMtime: undefined,
                  pendingExternalSize: undefined,
                })
              }}
            >
              Descartar mis cambios y recargar
            </button>
            <button
              className="underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={() => updateTab(activeTab.id, {
                hasUpdate: false,
                pendingExternalContent: undefined,
                pendingExternalMtime: undefined,
                pendingExternalSize: undefined,
              })}
            >
              Mantener mis cambios
            </button>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden relative">
            {activeTab && isImagePath(activeTab.path) ? (
              <ImagePreview key={activeTab.id} path={activeTab.path!} />
            ) : activeTab ? (
              <div className="flex h-full">
                <div className={mdPreview && activeTab.language === 'markdown' ? 'w-1/2 border-r border-outline-variant/20 min-w-0' : 'flex-1 min-w-0'}>
                  <CodeEditor
                    key={activeTab.id}
                    content={activeTab.content}
                    // The tab's icon (activeTab.language) is purely extension-based and stable.
                    // Highlighting can be smarter about ambiguous extensions (.cfg holding XML vs
                    // ini) without that ever touching the icon — computed separately, content-aware.
                    language={highlightLanguage}
                    isDark={editorDark}
                    wordWrap={activeTab.wordWrap}
                    fontSize={prefs.fontSize}
                    fontFamily={prefs.fontFamily}
                    gitDiff={gitDiff}
                    minimap={prefs.minimap}
                    colorScheme={prefs.colorScheme}
                    onChange={(val) => { updateTab(activeTab.id, { content: val, isDirty: true }) }}
                    onCursorChange={(ln, col) => setCursor({ ln, col })}
                    onSelectionChange={(chars, lines) => setSelection({ chars, lines })}
                    onSaveShortcut={() => { void saveActive() }}
                    onNewFileShortcut={createNewFile}
                    onRenameShortcut={() => setRenamingTabId(activeTab.id)}
                    editorRef={editorRef}
                  />
                </div>
                {mdPreview && activeTab.language === 'markdown' && (
                  <div className="w-1/2 min-w-0 bg-surface">
                    <MarkdownPreview content={activeTab.content} />
                  </div>
                )}
              </div>
            ) : (
              <EmptyState onOpen={openDialog} />
            )}

            {/* Drag overlay — animated gradient border */}
            {isDragging && (
              <div
                className="absolute inset-0 z-20 pointer-events-none"
                style={{ padding: 2, background: 'linear-gradient(90deg, #FF7A00, #FF00D6, #5C00FF, #FF7A00)', backgroundSize: '300% 300%', animation: 'gradient-border-shift 2.5s ease infinite', borderRadius: 'inherit' }}
              >
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 backdrop-blur-sm rounded-[inherit]"
                  style={{ background: 'rgb(var(--c-surface) / 0.88)' }}>
                  <FileInput size={48} className="text-primary animate-bounce" />
                  <p className="text-sm font-semibold text-primary">Soltá un archivo o carpeta para abrir</p>
                </div>
              </div>
            )}
          </div>

          {/* Zen mode — pill flotante para salir */}
          <AnimatePresence>
            {zenMode && (
              <motion.button
                onClick={() => setZenMode(false)}
                className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-on-surface-variant/60 hover:text-on-surface border border-outline-variant/25 transition-colors"
                style={{ background: 'rgb(var(--c-surface-container) / 0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                Zen
                <kbd className="text-[9px] px-1 py-px rounded border border-outline-variant/30 bg-surface font-mono">Ctrl+⇧+Z</kbd>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Flash de guardado — checkmark con spring */}
          <AnimatePresence>
            {savedFlash && (
              <motion.div
                className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold pointer-events-none"
                style={{ background: 'rgb(var(--c-accent) / 0.12)', border: '1px solid rgb(var(--c-accent) / 0.3)', color: 'rgb(var(--c-accent))', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                initial={{ opacity: 0, scale: 0.7, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <CheckCircle2 size={13} />
                Guardado
              </motion.div>
            )}
          </AnimatePresence>

          {/* Find in files panel */}
          {showFind && (
            <FindInFiles folders={folders} openTabs={tabs} onOpenAt={openFileAtLine} onClose={() => setShowFind(false)} />
          )}

          {/* Status bar */}
          {activeTab && !zenMode && (
            <div className="flex items-center gap-1.5 px-3 py-1 border-t border-outline-variant/15 flex-shrink-0 select-none"
              style={{ background: 'rgb(var(--c-surface-container) / 0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              {/* Language pill */}
              <Chip tone="primary" className="uppercase tracking-wide font-semibold text-[10px]">{highlightLanguage}</Chip>
              <button onClick={() => editorRef.current?.openGotoLine()} title="Ir a línea (Ctrl+G)"
                className="tabular-nums text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 text-on-surface-variant/70 hover:text-primary hover:bg-surface-container-high transition-colors">
                Ln {cursor.ln}:{cursor.col}
              </button>
              {selection.chars > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary tabular-nums">
                  {selection.chars} car.{selection.lines > 1 ? ` · ${selection.lines} líneas` : ''}
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 text-on-surface-variant/60 tabular-nums">{lineCount}L</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 text-on-surface-variant/60 tabular-nums">{wordCount}W</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 text-on-surface-variant/60 tabular-nums">{(activeTab.size / 1024).toFixed(1)}KB</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container/80 tabular-nums ${activeTab.encodingWarning ? 'text-warning font-medium' : 'text-on-surface-variant/60'}`}
                title={activeTab.encodingWarning ? 'No parece ser UTF-8 válido' : undefined}
              >UTF-8{activeTab.encodingWarning ? '⚠' : ''}</span>
              {activeTab.isDirty && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-warning/10 text-warning border border-warning/20">
                  <span className="w-1 h-1 rounded-full bg-warning" />Sin guardar
                </span>
              )}

              {/* Actions */}
              <div className="ml-auto flex items-center gap-2.5 pointer-events-auto">
                {activeTab.path && (
                  <>
                    <button onClick={() => copyPath(activeTab.path!)} title="Copiar ruta"
                      className="flex items-center gap-1 hover:text-primary transition-colors">
                      <Copy size={11} />
                      Ruta
                    </button>
                    <button onClick={() => window.api.invoke('editor:reveal', activeTab.path!)} title="Mostrar en el explorador"
                      className="flex items-center gap-1 hover:text-primary transition-colors">
                      <FolderOpen size={11} />
                      Mostrar
                    </button>
                  </>
                )}
                <button onClick={toggleWrap} title="Alternar ajuste de línea"
                  className={`flex items-center gap-1 transition-colors ${activeTab.wordWrap ? 'text-primary' : 'hover:text-primary'}`}>
                  <WrapText size={11} />
                  Ajuste
                </button>
                {(activeTab.isDirty || activeTab.path === null) && (
                  <button onClick={saveActive} title={activeTab.path === null ? 'Guardar como (Ctrl+S)' : 'Guardar (Ctrl+S)'}
                    className="flex items-center gap-1 text-primary hover:opacity-80 transition-opacity font-semibold">
                    <Save size={11} />
                    {activeTab.path === null ? 'Guardar como' : 'Guardar'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {quickOpen && <QuickOpen folders={folders} openTabs={tabs} onOpen={openFile} onClose={() => setQuickOpen(false)} />}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

      {/* ── Delete confirmation modal ──────────────────────────────────────── */}
      <AnimatePresence>
      {deleteConfirm && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <motion.div
            className="ui-card w-[360px] p-5 flex flex-col gap-5"
            initial={{ opacity: 0, scale: 0.96, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="flex items-start gap-3">
              <Trash2 size={22} className="text-error flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-on-surface">
                  {deleteConfirm.permanent ? '¿Eliminar permanentemente?' : `¿Eliminar ${deleteConfirm.isDir ? 'carpeta' : 'archivo'}?`}
                </p>
                <p className="text-[12px] text-on-surface-variant mt-1">
                  {deleteConfirm.permanent ? (
                    <>No se pudo mover <span className="font-medium text-on-surface">"{deleteConfirm.name}"</span> a la papelera. Si continuás, se borra definitivamente.</>
                  ) : (
                    <>
                      <span className="font-medium text-on-surface">"{deleteConfirm.name}"</span>
                      {deleteConfirm.isDir ? ' y todo su contenido se van a mover' : ' se va a mover'}
                      {' '}a la papelera.
                    </>
                  )}
                </p>
                {deleteConfirm.permanent && <p className="text-[11px] text-error/70 mt-1">Esta acción no se puede deshacer.</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => deleteConfirm.resolve(false)} className="ui-btn ui-btn-ghost text-[12px]">Cancelar</button>
              <button
                onClick={() => deleteConfirm.resolve(true)}
                className="ui-btn text-[12px] bg-error text-white hover:bg-error/90"
              >Eliminar</button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Save-on-close confirmation modal ──────────────────────────────── */}
      <AnimatePresence>
      {closeConfirm && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <motion.div
            className="ui-card w-[360px] p-5 flex flex-col gap-5"
            initial={{ opacity: 0, scale: 0.96, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="flex items-start gap-3">
              <Save size={22} className="text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-on-surface">¿Guardar cambios?</p>
                <p className="text-[12px] text-on-surface-variant mt-1">
                  ¿Querés guardar los cambios en{' '}
                  <span className="font-medium text-on-surface">"{closeConfirm.name}"</span>?
                </p>
                <p className="text-[11px] text-on-surface-variant/50 mt-1">Si no los guardás, se van a perder.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => closeConfirm.resolve('cancel')} className="ui-btn ui-btn-ghost text-[12px]">Cancelar</button>
              <button
                onClick={() => closeConfirm.resolve('discard')}
                className="ui-btn ui-btn-outline text-[12px] text-error border-error/30 hover:bg-error/10"
              >No guardar</button>
              <button onClick={() => closeConfirm.resolve('save')} className="ui-btn ui-btn-primary text-[12px]">Guardar</button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InlineInput({ defaultValue, onCommit, onCancel }: {
  defaultValue: string; onCommit: (v: string) => void; onCancel: () => void
}): JSX.Element {
  const [val, setVal] = useState(defaultValue)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.preventDefault(); val.trim() ? onCommit(val.trim()) : onCancel() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => val.trim() ? onCommit(val.trim()) : onCancel()}
      className="flex-1 bg-primary/10 text-primary text-[11px] px-1.5 py-0.5 rounded outline-none border border-primary/40 min-w-0" />
  )
}

function isSameOrChildPath(candidate: string | null, targetPath: string, isDir: boolean): boolean {
  if (!candidate) return false
  if (candidate === targetPath) return true
  if (!isDir) return false
  return candidate.startsWith(`${targetPath}\\`) || candidate.startsWith(`${targetPath}/`)
}

function FolderRoot({ folder, expanded, onToggle, onClose, cb }: {
  folder: FileTreeNode; expanded: Set<string>; onToggle: (p: string) => void
  onClose: (p: string) => void; cb: TreeCallbacks
}): JSX.Element {
  const isOpen = expanded.has(folder.path)
  return (
    <div>
      <div className="flex items-center gap-1 px-2 py-1 group cursor-pointer hover:bg-surface-container transition-colors"
        onContextMenu={(e) => cb.onContextMenu(e, folder, folder.path)}>
        <button onClick={() => onToggle(folder.path)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
          <ChevronRight size={13} className="text-on-surface-variant/50 flex-shrink-0 transition-transform duration-150" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          {isOpen ? <FolderOpen size={14} className="text-primary/70 flex-shrink-0" /> : <Folder size={14} className="text-primary/70 flex-shrink-0" />}
          {cb.renaming === folder.path
            ? <InlineInput defaultValue={folder.name} onCommit={(n) => cb.onRenameCommit(folder.path, n)} onCancel={cb.onCancel} />
            : <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide truncate" title={folder.path}>{folder.name}</span>
          }
        </button>
        <button onClick={() => onClose(folder.path)} title="Close folder"
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant/50 hover:text-error transition-all flex-shrink-0">
          <X size={12} />
        </button>
      </div>
      {isOpen && (
        <>
          {/* New file/folder inline input at top of root children */}
          {cb.creating?.parentPath === folder.path && (
            <div className="flex items-center gap-1 py-[3px]" style={{ paddingLeft: '20px', paddingRight: '8px' }}>
              {cb.creating.type === 'file' ? <FileText size={13} className="text-primary/60 flex-shrink-0" /> : <Folder size={13} className="text-primary/60 flex-shrink-0" />}
              <InlineInput defaultValue="" onCommit={(n) => cb.onCreateCommit(folder.path, n, cb.creating!.type)} onCancel={cb.onCancel} />
            </div>
          )}
          {folder.children?.map((child) => <TreeNode key={child.path} node={child} depth={1} expanded={expanded} onToggle={onToggle} rootPath={folder.path} cb={cb} />)}
          {folder.children?.length === 0 && cb.creating?.parentPath !== folder.path && (
            <p className="text-[11px] text-on-surface-variant/35 italic px-5 py-2">Carpeta vacía</p>
          )}
          {folder.truncated && <p className="text-[10px] text-on-surface-variant/35 italic px-5 py-1">Mostrando los primeros 200 archivos</p>}
        </>
      )}
    </div>
  )
}

function TreeNode({ node, depth, expanded, onToggle, rootPath, cb }: {
  node: FileTreeNode; depth: number; expanded: Set<string>
  onToggle: (p: string) => void; rootPath: string; cb: TreeCallbacks
}): JSX.Element {
  const isOpen = expanded.has(node.path)
  const indent = depth * 10

  return (
    <div>
      <div onClick={() => node.isDir ? onToggle(node.path) : cb.onOpen(node.path)}
        onContextMenu={(e) => cb.onContextMenu(e, node, rootPath)}
        title={node.path}
        className="relative flex items-center gap-1 py-[3px] cursor-pointer hover:bg-surface-container group transition-colors"
        style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}>
        {/* Indent guide lines — one vertical hairline per ancestor level */}
        {Array.from({ length: depth }).map((_, d) => (
          <span key={d} aria-hidden style={{
            position: 'absolute', top: 0, bottom: 0, width: 1,
            left: `${8 + d * 10 + 5}px`,
            background: 'rgb(var(--c-outline-variant) / 0.18)',
            pointerEvents: 'none',
          }} />
        ))}
        {node.isDir
          ? <ChevronRight size={13} className="text-on-surface-variant/40 flex-shrink-0 transition-transform duration-150" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          : <span className="flex-shrink-0" style={{ width: '13px' }} />
        }
        {node.isDir
          ? (isOpen ? <FolderOpen size={13} className="text-primary/60 flex-shrink-0" /> : <Folder size={13} className="text-primary/60 flex-shrink-0" />)
          : (() => { const lang = detectLanguage(node.name); const Icon = languageIcon(lang); return <Icon size={13} className="flex-shrink-0" style={{ color: langColor(lang) }} /> })()
        }
        {cb.renaming === node.path
          ? <InlineInput defaultValue={node.name} onCommit={(n) => cb.onRenameCommit(node.path, n)} onCancel={cb.onCancel} />
          : <span className="text-[11.5px] text-on-surface-variant group-hover:text-on-surface truncate flex-1">{node.name}</span>
        }
        {node.isDir && !isOpen && (node.children?.length ?? 0) > 0 && (
          <Badge className="ml-auto group-hover:opacity-100 opacity-60">{node.children!.length}</Badge>
        )}
      </div>

      {node.isDir && isOpen && (
        <>
          {/* Inline create input inside this directory */}
          {cb.creating?.parentPath === node.path && (
            <div className="flex items-center gap-1 py-[3px]" style={{ paddingLeft: `${8 + (depth + 1) * 10}px`, paddingRight: '8px' }}>
              {cb.creating.type === 'file' ? <FileText size={13} className="text-primary/60 flex-shrink-0" /> : <Folder size={13} className="text-primary/60 flex-shrink-0" />}
              <InlineInput defaultValue="" onCommit={(n) => cb.onCreateCommit(node.path, n, cb.creating!.type)} onCancel={cb.onCancel} />
            </div>
          )}
          {node.children?.map((child) => <TreeNode key={child.path} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} rootPath={rootPath} cb={cb} />)}
          {node.truncated && <p className="text-[10px] text-on-surface-variant/35 italic py-0.5" style={{ paddingLeft: `${8 + (depth + 1) * 10}px` }}>…más archivos no mostrados</p>}
        </>
      )}
    </div>
  )
}

/** Barra lateral colapsada: expandir + iconos de archivos abiertos. */
function CollapsedSidebarRail({
  tabs,
  activeId,
  onExpand,
  onSelectTab,
  onTabContextMenu,
}: {
  tabs: OpenFile[]
  activeId: string | null
  onExpand: () => void
  onSelectTab: (id: string) => void
  onTabContextMenu: (e: React.MouseEvent, tab: OpenFile) => void
}): JSX.Element {
  return (
    <div className="flex flex-1 min-h-0 flex-col w-full">
      <button
        type="button"
        onClick={onExpand}
        title="Expandir barra lateral"
        className="flex-shrink-0 flex items-center justify-center h-9 border-b border-outline-variant/15 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
      >
        <PanelLeft size={15} />
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 flex flex-col items-center gap-0.5">
        {tabs.map((tab) => {
          const isActive = activeId === tab.id
          const Icon = languageIcon(tab.language)
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => onTabContextMenu(e, tab)}
              title={tab.path ? `${tab.name}\n${tab.path}` : tab.name}
              className="relative w-8 h-8 rounded-md flex items-center justify-center transition-all flex-shrink-0 text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              style={isActive ? { background: 'var(--gradient-brand)', boxShadow: '0 2px 8px rgb(var(--c-primary) / 0.32)', color: 'white' } : undefined}
            >
              <Icon size={15} style={isActive ? { color: 'white' } : { color: langColor(tab.language) }} />
              {tab.isDirty && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FileListItem({ tab, isActive, isSelected = false, savedFlash = false, gitModified = false, onClick, onCtrlClick, onClose, onSave, onContextMenu, renaming, onRenameCommit, onRenameCancel, onDragStart: onDragStartProp, onDragEnd: onDragEndProp }: {
  tab: OpenFile; isActive: boolean; isSelected?: boolean; savedFlash?: boolean; gitModified?: boolean
  onClick: () => void; onCtrlClick?: () => void; onClose: () => void; onSave: () => void
  onContextMenu: (e: React.MouseEvent) => void
  renaming: boolean; onRenameCommit: (name: string) => void; onRenameCancel: () => void
  onDragStart?: () => void; onDragEnd?: () => void
}): JSX.Element {
  return (
    <div data-tab-item
      draggable
      onDragStart={(e) => {
        onDragStartProp?.()
        dragState.set({ name: tab.name, path: tab.path, content: tab.content })
        e.dataTransfer.setData('text/plain', tab.name)
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onDragEnd={() => { onDragEndProp?.(); dragState.set(null) }}
      onClick={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); onCtrlClick?.() } else { onClick() } }}
      onContextMenu={onContextMenu}
      title={`${tab.name}${tab.path ? `\n${tab.path}` : ''}\nCtrl+click to select · Drag to reorder · Compare via context menu or Smart Diff tab`}
      className={`flex items-center gap-2 w-full max-w-full py-2 rounded-md mb-0.5 cursor-grab active:cursor-grabbing group overflow-hidden transition-[background-color,box-shadow,color,border-color] ${
        isSelected
          ? 'pl-3 pr-2 bg-on-surface/[0.09] text-on-surface border-l-2 border-primary/40'
          : isActive
            ? 'pl-2.5 pr-2 bg-primary/[0.08] text-on-surface border-l-2 border-primary'
            : 'pl-3 pr-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container/90 border-l-2 border-transparent'
      }`}
      style={isActive ? { boxShadow: '0 0 14px rgb(var(--c-primary) / 0.10), inset 0 0 0 1px rgb(var(--c-primary) / 0.12)' } : undefined}>
      {(() => { const Icon = languageIcon(tab.language); return <Icon size={14} className="flex-shrink-0" style={{ color: langColor(tab.language) }} /> })()}
      {renaming ? (
        <InlineInput defaultValue={tab.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      ) : (
        <span className="text-[12px] font-medium truncate flex-1">{tab.name}</span>
      )}
      {tab.watchActive && !tab.frozen && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />}
      {gitModified && !tab.isDirty && (
        <span title="Cambios git sin commitear" className="w-1.5 h-1.5 rounded-full bg-warning/80 flex-shrink-0" />
      )}
      {savedFlash
        ? <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" style={{ animation: 'fe-saved-pop 0.2s ease both' }} />
        : tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
      {!renaming && (tab.isDirty || tab.path === null) && isActive && (
        <button onClick={(e) => { e.stopPropagation(); onSave() }} title="Save"
          className="opacity-0 group-hover:opacity-100 hover:text-primary transition-all flex-shrink-0">
          <Save size={12} />
        </button>
      )}
      {!renaming && (
        <button onClick={(e) => { e.stopPropagation(); onClose() }}
          className="opacity-0 group-hover:opacity-100 hover:text-error transition-all flex-shrink-0">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function EmptyState({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full gap-6 text-center select-none px-6 relative overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
    >
      {/* Ambient glow blobs */}
      <div aria-hidden className="absolute pointer-events-none inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(var(--c-primary) / 0.08) 0%, transparent 70%)', filter: 'blur(24px)' }} />
        <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 translate-y-1/2 w-48 h-48 rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(var(--c-accent) / 0.06) 0%, transparent 70%)', filter: 'blur(20px)' }} />
      </div>

      {/* Icon */}
      <motion.div className="relative" initial={{ scale: 0.85, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
        <div aria-hidden className="absolute inset-[-12px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(var(--c-primary) / 0.14) 0%, transparent 70%)', filter: 'blur(16px)' }} />
        <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center border border-outline-variant/20"
          style={{ background: 'linear-gradient(135deg, rgb(var(--c-surface-container-high) / 0.9) 0%, rgb(var(--c-surface-container) / 0.6) 100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
          <FileText size={42} className="text-primary/70" strokeWidth={1.3} />
        </div>
      </motion.div>

      {/* Text */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <p className="font-semibold text-on-surface text-base">Ningún archivo abierto</p>
        <p className="text-[12px] text-on-surface-variant/50 mt-1.5 leading-relaxed">
          Soltá un archivo o carpeta acá<br />o usá los atajos para navegar
        </p>
      </motion.div>

      {/* Action button */}
      <motion.button
        onClick={onOpen}
        className="ui-btn ui-btn-primary text-sm px-5"
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.18 }}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      >
        <Import size={15} />Abrir archivo
      </motion.button>

      {/* Keyboard shortcuts grid */}
      <motion.div
        className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-on-surface-variant/45"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.28 }}
      >
        {([
          ['⌘O', 'Abrir archivo'],
          ['⌘P', 'Quick open'],
          ['⌘N', 'Nuevo archivo'],
          ['⌘⇧F', 'Buscar en archivos'],
        ] as const).map(([key, label]) => (
          <span key={key} className="flex items-center gap-2">
            <kbd className="bg-surface-container border border-outline-variant/25 px-1.5 py-0.5 rounded text-[10px] font-mono text-on-surface-variant/60 flex-shrink-0">{key}</kbd>
            <span>{label}</span>
          </span>
        ))}
      </motion.div>
    </motion.div>
  )
}
