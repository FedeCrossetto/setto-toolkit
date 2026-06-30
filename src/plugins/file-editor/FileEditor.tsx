import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, ArrowDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Diff, Eye, EyeOff,
  FileInput, FilePlus, FileSearch, FileText, Filter, Folder, Import,
  FolderOpen, FolderPlus, FolderSearch, PanelLeft, PanelLeftClose, Pause, Pencil, Play,
  RotateCcw, Save, SlidersHorizontal, SquareTerminal, Trash2, WrapText, X,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { dragState } from '../../core/dragState'
import { useEditorTabs, languageIcon, detectLanguage, refineLanguageFromContent } from './hooks/useEditorTabs'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useEditorPrefs, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from './hooks/useEditorPrefs'
import type { EditorColorScheme } from './hooks/useEditorPrefs'
import { useAutoSave } from './hooks/useAutoSave'
import { CodeEditor } from './components/CodeEditor'
import { Breadcrumb } from './components/Breadcrumb'
import { ContextMenu } from './components/ContextMenu'
import { QuickOpen } from './components/QuickOpen'
import { FindInFiles } from './components/FindInFiles'
import type { FileChangedEvent, OpenFile, RecentFile, FileLanguage, FileTreeNode, EditorHandle, WriteFileResponse, GitLineDiff } from './types'
import { Badge } from '../../core/components/Badge'
import { Chip } from '../../core/components/Chip'
import type { MenuItem } from './components/ContextMenu'

let newFileCount = 0

// ── Session persistence ───────────────────────────────────────────────────────
const SESSION_KEY = 'file-editor:session'
type SavedTab =
  | { path: string; name: string }
  | { path: null; name: string; content: string; language: FileLanguage }
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
    name: string; isDir: boolean; resolve: (confirmed: boolean) => void
  } | null>(null)

  const [savedFlash, setSavedFlash] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const editorRef      = useRef<EditorHandle | null>(null)
  const settingsRef    = useRef<HTMLDivElement>(null) // kept for layout anchor only
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
          : { path: t.path, name: t.name }),
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // stable — all mutable values accessed via refs

  // ── Filter → CodeEditor ───────────────────────────────────────────────────
  useEffect(() => { editorRef.current?.setFilter(logFilter) }, [logFilter])

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
          next.delete(first)
        }
        next.add(id)
      }
      return next
    })
  }, [])

  const sendSelectedToDiff = useCallback((): void => {
    const selected = tabs.filter((t) => selectedIds.has(t.id))
    if (selected.length !== 2) return
    dispatch({
      type: 'SEND_PAIR_TO_DIFF',
      file1: { name: selected[0].name, path: selected[0].path, content: selected[0].content },
      file2: { name: selected[1].name, path: selected[1].path, content: selected[1].content },
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
          await window.api.invoke('editor:delete', node.path)
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
        { divider: true, label: '', icon: '', action: () => {} },
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
              await window.api.invoke('editor:delete', tab.path!)
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
          'flex-shrink-0 flex flex-col border-r border-outline-variant/20 bg-surface overflow-hidden',
          sidebarCollapsed ? 'w-10 transition-[width] duration-200 ease-out' : '',
        ].join(' ')}
        style={sidebarCollapsed ? undefined : { width: prefs.sidebarWidth }}
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/55 whitespace-nowrap">Abiertos</span>
            <div className="flex items-center gap-0.5 rounded-lg bg-surface-container/60 p-0.5">
              <button onClick={createNewFile} title="Nuevo archivo (Ctrl+T)"
                className="p-1 rounded-md text-on-surface-variant/70 hover:text-accent hover:bg-accent/10 transition-colors">
                <FilePlus size={15} />
              </button>
              <button onClick={openDialog} title="Abrir archivo"
                className="p-1 rounded-md text-on-surface-variant/70 hover:text-secondary hover:bg-secondary/10 transition-colors">
                <Import size={15} />
              </button>
              {folders.length === 0 && (
                <button onClick={openFolderDialog} title="Abrir carpeta"
                  className="p-1 rounded-md text-on-surface-variant/70 hover:text-warning hover:bg-warning/10 transition-colors">
                  <FolderOpen size={15} />
                </button>
              )}
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Colapsar barra lateral"
                className="p-1 rounded-md text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high transition-colors border-l border-outline-variant/20 ml-0.5 pl-1"
              >
                <PanelLeftClose size={15} />
              </button>
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
              <p className="text-[11px] text-on-surface-variant/50 text-center pt-4 px-3">
                No hay archivos abiertos.<br />Soltá un archivo o carpeta acá.
              </p>
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
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 px-3 pt-3 pb-1.5">Recientes</p>
            <div className="overflow-y-auto max-h-36 pb-2">
              {recents.slice(0, 8).map((r) => (
                <button key={r.path} onClick={() => openFile(r.path)} title={r.path}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-surface-container transition-colors group">
                  {(() => { const Icon = languageIcon(detectLanguage(r.name)); return <Icon size={13} className="text-on-surface-variant/50 flex-shrink-0" /> })()}
                  <span className="text-[11px] text-on-surface-variant group-hover:text-on-surface truncate">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>)}
      </aside>

      {/* Sidebar width resize handle */}
      {!sidebarCollapsed && (
        <div
          onPointerDown={handleSidebarResizePointerDown}
          className="flex-shrink-0 w-[5px] -mx-[2px] z-10 cursor-col-resize hover:bg-primary/30 transition-colors"
          style={{ touchAction: 'none' }}
          title="Arrastrar para redimensionar"
        />
      )}

      {/* ── Main editor area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

        {/* Tab bar + settings */}
        <div className="flex items-center border-b border-outline-variant/20 bg-surface-container-low flex-shrink-0">
          <div
            className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide px-2 py-1.5"
            style={{ maskImage: tabs.length > 1 ? 'linear-gradient(to right, transparent 0, black 8px, black calc(100% - 8px), transparent 100%)' : undefined }}
          >
            {tabs.map((tab) => (
              <div key={tab.id}
                draggable
                onDragStart={(e) => {
                  dragTabRef.current = tab.id
                  dragState.set({ name: tab.name, path: tab.path, content: tab.content })
                  e.dataTransfer.setData('text/plain', tab.name)
                  e.dataTransfer.effectAllowed = 'copyMove'
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
                className={`relative flex items-center gap-2 pl-3.5 pr-2.5 py-2 text-[13px] font-medium cursor-grab active:cursor-grabbing whitespace-nowrap group transition-all duration-150 flex-shrink-0 rounded-lg border ${
                  dragOverTab === tab.id ? 'ring-2 ring-primary/50' : ''
                } ${
                  selectedIds.has(tab.id)
                    ? 'text-on-surface bg-on-surface/[0.08] border-outline-variant/50'
                    : activeId === tab.id
                      ? 'text-on-surface bg-surface border-outline-variant/40 shadow-sm'
                      : 'text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container-high'}`}>
                {(() => { const Icon = languageIcon(tab.language); return <Icon size={14} className="text-on-surface-variant/70" /> })()}
                <span className="max-w-[140px] truncate">{tab.name}</span>
                {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                <button onClick={(e) => { e.stopPropagation(); void handleCloseTab(tab.id) }}
                  className="flex items-center justify-center w-[18px] h-[18px] rounded-md opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error hover:bg-error/10 transition-all ml-0.5">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-0.5 px-2 flex-shrink-0">
            <button onClick={() => setQuickOpen(true)} title="Apertura rápida (Ctrl+P)"
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors">
              <FolderSearch size={15} />
            </button>
            <button onClick={() => setShowFind((v) => !v)} title="Buscar en archivos (Ctrl+Shift+F)"
              className={`p-1.5 rounded-lg transition-colors ${showFind ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
              <FileSearch size={15} />
            </button>

            {/* Settings trigger — opens full modal to avoid overflow-hidden clipping */}
            <button onClick={() => setSettingsOpen(true)} title="Ajustes del editor"
              className={`p-1.5 rounded-lg transition-colors ${settingsOpen ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
              <SlidersHorizontal size={16} />
            </button>

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
                  <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={15} className="text-primary" />
                      <span className="text-sm font-semibold text-on-surface">Ajustes del editor</span>
                    </div>
                    <button onClick={() => setSettingsOpen(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
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
          <div className="flex items-center gap-3 px-3 py-1 border-b border-outline-variant/15 bg-surface flex-shrink-0 text-xs">
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
        {activeTab?.path && <Breadcrumb filePath={activeTab.path} onPathCopied={() => showToast('Path copied', 'success', 2000)} />}

        {/* Encoding warning — file doesn't look like valid UTF-8 */}
        {activeTab?.encodingWarning && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/25 text-xs text-amber-400 flex-shrink-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            Este archivo no parece ser UTF-8 válido (¿binario u otra codificación?). Editarlo y guardarlo puede corromperlo.
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
          <div className="flex items-center gap-2 px-4 py-1.5 bg-error/10 border-b border-error/25 text-xs text-error flex-shrink-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            Este archivo cambió en disco y tenés ediciones sin guardar.
            <button
              className="ml-auto underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity"
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
              className="underline hover:no-underline opacity-80 hover:opacity-100 transition-opacity"
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
            {activeTab ? (
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
                onSaveShortcut={() => { void saveActive() }}
                onNewFileShortcut={createNewFile}
                onRenameShortcut={() => setRenamingTabId(activeTab.id)}
                editorRef={editorRef}
              />
            ) : (
              <EmptyState onOpen={openDialog} />
            )}

            {/* Drag overlay */}
            {isDragging && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-primary/50 bg-primary/5 backdrop-blur-sm pointer-events-none">
                <FileInput size={48} className="text-primary" />
                <p className="text-sm font-medium text-primary">Soltá un archivo o carpeta para abrir</p>
              </div>
            )}
          </div>

          {/* Find in files panel */}
          {showFind && (
            <FindInFiles folders={folders} openTabs={tabs} onOpenAt={openFileAtLine} onClose={() => setShowFind(false)} />
          )}

          {/* Status bar */}
          {activeTab && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 border-t border-outline-variant/15 bg-surface-container-low flex-shrink-0 text-[11px] text-on-surface-variant/70 select-none">
              {/* Language pill */}
              <Chip tone="primary" className="uppercase tracking-wide font-semibold">{highlightLanguage}</Chip>
              <button onClick={() => editorRef.current?.openGotoLine()} title="Ir a línea (Ctrl+G)"
                className="tabular-nums pointer-events-auto hover:text-primary transition-colors">
                Ln {cursor.ln}, Col {cursor.col}
              </button>
              <span className="text-on-surface-variant/25">·</span>
              <span className="tabular-nums">{lineCount} líneas</span>
              <span className="text-on-surface-variant/25">·</span>
              <span className="tabular-nums">{wordCount} palabras</span>
              <span className="text-on-surface-variant/25">·</span>
              <span className="tabular-nums">{(activeTab.size / 1024).toFixed(1)} KB</span>
              <span className="text-on-surface-variant/25">·</span>
              <span className={activeTab.encodingWarning ? 'text-warning font-medium' : undefined} title={activeTab.encodingWarning ? 'No parece ser UTF-8 válido' : undefined}>
                UTF-8{activeTab.encodingWarning ? ' ⚠' : ''}
              </span>
              {activeTab.isDirty && (
                <span className="flex items-center gap-1 text-warning"><span className="w-1.5 h-1.5 rounded-full bg-warning" />Sin guardar</span>
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
                <p className="text-sm font-semibold text-on-surface">Delete {deleteConfirm.isDir ? 'folder' : 'file'}?</p>
                <p className="text-[12px] text-on-surface-variant mt-1">
                  <span className="font-medium text-on-surface">"{deleteConfirm.name}"</span>
                  {deleteConfirm.isDir ? ' and all its contents will be ' : ' will be '}
                  permanently deleted.
                </p>
                <p className="text-[11px] text-error/70 mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => deleteConfirm.resolve(false)} className="ui-btn ui-btn-ghost text-[12px]">Cancel</button>
              <button
                onClick={() => deleteConfirm.resolve(true)}
                className="ui-btn text-[12px] bg-error text-white hover:bg-error/90"
              >Delete</button>
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
                <p className="text-sm font-semibold text-on-surface">Save changes?</p>
                <p className="text-[12px] text-on-surface-variant mt-1">
                  Do you want to save changes to{' '}
                  <span className="font-medium text-on-surface">"{closeConfirm.name}"</span>?
                </p>
                <p className="text-[11px] text-on-surface-variant/50 mt-1">Your changes will be lost if you don't save them.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => closeConfirm.resolve('cancel')} className="ui-btn ui-btn-ghost text-[12px]">Cancel</button>
              <button
                onClick={() => closeConfirm.resolve('discard')}
                className="ui-btn ui-btn-outline text-[12px] text-error border-error/30 hover:bg-error/10"
              >Don't Save</button>
              <button onClick={() => closeConfirm.resolve('save')} className="ui-btn ui-btn-primary text-[12px]">Save</button>
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
          {isOpen ? <ChevronDown size={13} className="text-on-surface-variant/50 flex-shrink-0" /> : <ChevronRight size={13} className="text-on-surface-variant/50 flex-shrink-0" />}
          {isOpen ? <FolderOpen size={14} className="text-primary/70 flex-shrink-0" /> : <Folder size={14} className="text-primary/70 flex-shrink-0" />}
          {cb.renaming === folder.path
            ? <InlineInput defaultValue={folder.name} onCommit={(n) => cb.onRenameCommit(folder.path, n)} onCancel={cb.onCancel} />
            : <span className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wide truncate" title={folder.path}>{folder.name}</span>
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
        className="flex items-center gap-1 py-[4px] cursor-pointer hover:bg-surface-container group transition-colors"
        style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}>
        {node.isDir
          ? (isOpen ? <ChevronDown size={13} className="text-on-surface-variant/40 flex-shrink-0" /> : <ChevronRight size={13} className="text-on-surface-variant/40 flex-shrink-0" />)
          : <span className="flex-shrink-0" style={{ width: '13px' }} />
        }
        {node.isDir
          ? (isOpen ? <FolderOpen size={13} className="text-primary/60 flex-shrink-0" /> : <Folder size={13} className="text-primary/60 flex-shrink-0" />)
          : (() => { const Icon = languageIcon(detectLanguage(node.name)); return <Icon size={15} className="text-on-surface-variant/50 flex-shrink-0" /> })()
        }
        {cb.renaming === node.path
          ? <InlineInput defaultValue={node.name} onCommit={(n) => cb.onRenameCommit(node.path, n)} onCancel={cb.onCancel} />
          : <span className="text-[12px] text-on-surface-variant group-hover:text-on-surface truncate flex-1">{node.name}</span>
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
              className={[
                'relative w-8 h-8 rounded-md flex items-center justify-center transition-colors flex-shrink-0',
                isActive
                  ? 'bg-on-surface/[0.08] text-on-surface ring-1 ring-outline-variant/40'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
              ].join(' ')}
            >
              <Icon size={15} />
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

function FileListItem({ tab, isActive, isSelected = false, savedFlash = false, onClick, onCtrlClick, onClose, onSave, onContextMenu, renaming, onRenameCommit, onRenameCancel, onDragStart: onDragStartProp, onDragEnd: onDragEndProp }: {
  tab: OpenFile; isActive: boolean; isSelected?: boolean; savedFlash?: boolean
  onClick: () => void; onCtrlClick?: () => void; onClose: () => void; onSave: () => void
  onContextMenu: (e: React.MouseEvent) => void
  renaming: boolean; onRenameCommit: (name: string) => void; onRenameCancel: () => void
  onDragStart?: () => void; onDragEnd?: () => void
}): JSX.Element {
  const dir = tab.path ? tab.path.split(/[\\/]/).slice(0, -1).join('\\') : null
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
      className={`flex items-center gap-2 w-full max-w-full px-3 py-2 rounded-md mb-0.5 cursor-grab active:cursor-grabbing group overflow-hidden transition-[background-color,box-shadow,color] ${
        isSelected
          ? 'bg-on-surface/[0.09] text-on-surface [box-shadow:inset_0_0_0_1px_rgb(var(--c-on-surface)_/_0.18)]'
          : isActive
            ? 'bg-on-surface/[0.07] text-on-surface [box-shadow:inset_0_0_0_1px_rgb(var(--c-outline-variant)_/_0.4)]'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/90'
      }`}>
      {(() => { const Icon = languageIcon(tab.language); return <Icon size={16} className="flex-shrink-0 text-on-surface-variant/60" /> })()}
      {renaming ? (
        <InlineInput defaultValue={tab.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      ) : (
        <span className="text-[13px] font-medium truncate flex-1">{tab.name}</span>
      )}
      {tab.watchActive && !tab.frozen && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />}
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
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center select-none px-6">
      {/* Icon in a soft branded halo (matches the global EmptyState) */}
      <div className="relative">
        <div aria-hidden className="absolute inset-0 rounded-full blur-xl" style={{ background: 'rgb(var(--c-primary) / 0.18)' }} />
        <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center bg-surface-container-high border border-outline-variant/25">
          <FileText size={36} className="text-primary/80" strokeWidth={1.5} />
        </div>
      </div>
      <div>
        <p className="font-semibold text-on-surface text-sm">Ningún archivo abierto</p>
        <p className="text-xs text-on-surface-variant/60 mt-1">Soltá un archivo o carpeta acá, o abrí uno</p>
      </div>
      <button onClick={onOpen} className="ui-btn ui-btn-primary text-sm">
        <Import size={16} />Abrir archivo
      </button>
    </div>
  )
}
