import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useApp } from '../../core/AppContext'
import { useEditorTabs, languageIcon, detectLanguage } from './hooks/useEditorTabs'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useEditorPrefs, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX } from './hooks/useEditorPrefs'
import { useAutoSave } from './hooks/useAutoSave'
import { CodeEditor } from './components/CodeEditor'
import { Breadcrumb } from './components/Breadcrumb'
import { ContextMenu } from './components/ContextMenu'
import { QuickOpen } from './components/QuickOpen'
import { FindInFiles } from './components/FindInFiles'
import type { FileChangedEvent, OpenFile, RecentFile, FileLanguage, FileTreeNode, EditorHandle } from './types'
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
  const { tabs, activeId, activeTab, setActiveId, openFile, openBuffer, closeTab, updateTab } = useEditorTabs()
  const { prefs, updatePrefs } = useEditorPrefs()

  // ── Core state ────────────────────────────────────────────────────────────
  const [recents, setRecents]       = useState<RecentFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [folders, setFolders]       = useState<FileTreeNode[]>([])
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [cursor, setCursor]         = useState({ ln: 1, col: 1 })
  const [logFilter, setLogFilter]   = useState('')
  const [quickOpen, setQuickOpen]   = useState(false)
  const [showFind, setShowFind]     = useState(false)
  const [ctxMenu, setCtxMenu]       = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [renaming, setRenaming]     = useState<string | null>(null)
  const [creating, setCreating]     = useState<{ parentPath: string; type: 'file' | 'dir' } | null>(null)
  const [openFilesHeight, setOpenFilesHeight] = useState(180)
  const [closeConfirm, setCloseConfirm] = useState<{
    tabId: string; name: string; resolve: (r: 'save' | 'discard' | 'cancel') => void
  } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    name: string; isDir: boolean; resolve: (confirmed: boolean) => void
  } | null>(null)

  const editorRef    = useRef<EditorHandle | null>(null)
  const settingsRef  = useRef<HTMLDivElement>(null)
  const restoredRef  = useRef(false)

  const appDark    = state.theme === 'dark'
  const editorDark = prefs.editorTheme === 'auto' ? appDark : prefs.editorTheme === 'dark'

  // Derived counts from active tab content
  const lineCount = useMemo(() => activeTab?.content.split('\n').length ?? 0, [activeTab?.content])
  const wordCount = useMemo(() => {
    const t = activeTab?.content.trim() ?? ''
    return t ? t.split(/\s+/).length : 0
  }, [activeTab?.content])

  // ── Auto-save ─────────────────────────────────────────────────────────────
  useAutoSave(activeTab, prefs, async () => {
    if (!activeTab?.path || !activeTab.isDirty) return
    await window.api.invoke('editor:write-file', activeTab.path, activeTab.content)
    updateTab(activeTab.id, { isDirty: false })
  })

  // ── Report dirty state to global AppContext (drives TabBar dot indicator) ─
  useEffect(() => {
    const hasDirty = tabs.some((t) => t.isDirty)
    dispatch({ type: 'SET_PLUGIN_DIRTY', pluginId: 'file-editor', dirty: hasDirty })
  }, [tabs, dispatch])

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => { window.api.invoke<RecentFile[]>('editor:recent-get').then(setRecents) }, [])

  // Consume OPEN_IN_EDITOR from global state
  useEffect(() => {
    if (state.editorTarget) openFile(state.editorTarget.path)
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
    ;(async () => {
      let activeTabId: string | null = null
      for (const saved of session.tabs) {
        if (saved.path === null) {
          const tab = openBuffer(saved.name, saved.content, saved.language)
          if (session.activePath === null && saved.name === session.activeName) activeTabId = tab.id
        } else {
          const tab = await openFile(saved.path)
          if (tab && saved.path === session.activePath) activeTabId = tab.id
        }
      }
      if (activeTabId) setActiveId(activeTabId)
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

  // ── Settings popover click-outside ────────────────────────────────────────
  useEffect(() => {
    if (!settingsOpen) return
    const h = (e: MouseEvent) => { if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [settingsOpen])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      // Ctrl+P — quick open
      if (e.ctrlKey && !e.shiftKey && e.key === 'p') { e.preventDefault(); setQuickOpen(true); return }
      // Ctrl+Shift+F — find in files
      if (e.ctrlKey && e.shiftKey && e.key === 'F') { e.preventDefault(); setShowFind((v) => !v); return }
      // Ctrl+S — save
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        if (!activeTab) return
        if (activeTab.path === null) {
          const name = activeTab.name.endsWith('.txt') ? activeTab.name : `${activeTab.name}.txt`
          const fp = await window.api.invoke<string | null>('editor:save-dialog', name)
          if (!fp) return
          await window.api.invoke('editor:write-file', fp, activeTab.content)
          const n = fp.split(/[\\/]/).pop() ?? fp
          updateTab(activeTab.id, { path: fp, name: n, isDirty: false })
          setRecents((prev) => [{ path: fp, name: n, openedAt: new Date().toISOString() }, ...prev.filter((r) => r.path !== fp)])
        } else {
          await window.api.invoke('editor:write-file', activeTab.path, activeTab.content)
          updateTab(activeTab.id, { isDirty: false })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, updateTab])

  // ── Filter → CodeEditor ───────────────────────────────────────────────────
  useEffect(() => { editorRef.current?.setFilter(logFilter) }, [logFilter])

  // ── File watcher ──────────────────────────────────────────────────────────
  const onFileChanged = useCallback((event: FileChangedEvent) => {
    const tab = tabs.find((t) => t.path === event.path)
    if (!tab) return
    tab.frozen
      ? updateTab(tab.id, { hasUpdate: true })
      : updateTab(tab.id, { content: event.content, lastModified: event.mtime, hasUpdate: false })
  }, [tabs, updateTab])
  useFileWatcher({ tab: activeTab, onFileChanged })

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
        if (tab.path) {
          await window.api.invoke('editor:write-file', tab.path, tab.content)
          updateTab(tabId, { isDirty: false })
        } else {
          const fp = await window.api.invoke<string | null>('editor:save-dialog', tab.name)
          if (!fp) return
          await window.api.invoke('editor:write-file', fp, tab.content)
        }
      }
    }
    closeTab(tabId)
  }, [tabs, closeTab, updateTab])
  const toggleExpanded = (p: string): void => setExpanded((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })

  const handleSplitPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    let currentH = openFilesHeight
    const onMove = (ev: PointerEvent): void => {
      currentH = Math.max(60, Math.min(startY - ev.clientY + openFilesHeight, 480))
      setOpenFilesHeight(currentH)
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
      { label: 'New File',   icon: 'note_add',          action: () => setCreating({ parentPath: dirPath, type: 'file' }) },
      { label: 'New Folder', icon: 'create_new_folder', action: () => setCreating({ parentPath: dirPath, type: 'dir'  }) },
      { divider: true, label: '', icon: '', action: () => {} },
      { label: 'Rename', icon: 'drive_file_rename_outline', action: () => setRenaming(node.path) },
      ...(node.path !== rootPath ? [{
        label: 'Delete', icon: 'delete', danger: true,
        action: async () => {
          const confirmed = await new Promise<boolean>((resolve) =>
            setDeleteConfirm({ name: node.name, isDir: node.isDir, resolve })
          )
          setDeleteConfirm(null)
          if (!confirmed) return
          await window.api.invoke('editor:delete', node.path)
          refreshFolder(rootPath)
        },
      }] : []),
      { divider: true, label: '', icon: '', action: () => {} },
      { label: 'Copy Path',          icon: 'content_copy', action: () => navigator.clipboard.writeText(node.path) },
      { label: 'Reveal in Explorer', icon: 'folder_open',  action: () => window.api.invoke('editor:reveal', node.path) },
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
    } catch (err) { console.error('Rename failed', err) }
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
    } catch (err) { console.error('Create failed', err) }
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
  const createNewFile = (): void => { newFileCount++; openBuffer(newFileCount === 1 ? 'Untitled.txt' : `Untitled-${newFileCount}.txt`, '', 'text') }

  // ── Tab actions ───────────────────────────────────────────────────────────
  const toggleWatch  = (): void => { if (activeTab) updateTab(activeTab.id, { watchActive: !activeTab.watchActive, hasUpdate: false }) }
  const toggleTail   = (): void => { if (activeTab) updateTab(activeTab.id, { tailMode: !activeTab.tailMode }) }
  const toggleFreeze = (): void => { if (activeTab) updateTab(activeTab.id, { frozen: !activeTab.frozen }) }
  const toggleWrap   = (): void => { if (activeTab) updateTab(activeTab.id, { wordWrap: !activeTab.wordWrap }) }

  const applyUpdate = (): void => {
    if (!activeTab?.path || !activeTab.hasUpdate) return
    window.api.invoke<{ content: string; mtime: number; size: number }>('editor:read-file', { path: activeTab.path })
      .then((r) => updateTab(activeTab.id, { content: r.content, lastModified: r.mtime, hasUpdate: false }))
  }

  const saveActive = async (): Promise<void> => {
    if (!activeTab) return
    if (activeTab.path === null) {
      const name = activeTab.name.endsWith('.txt') ? activeTab.name : `${activeTab.name}.txt`
      const fp = await window.api.invoke<string | null>('editor:save-dialog', name)
      if (!fp) return
      await window.api.invoke('editor:write-file', fp, activeTab.content)
      const n = fp.split(/[\\/]/).pop() ?? fp
      updateTab(activeTab.id, { path: fp, name: n, isDirty: false })
    } else if (activeTab.isDirty) {
      await window.api.invoke('editor:write-file', activeTab.path, activeTab.content)
      updateTab(activeTab.id, { isDirty: false })
    }
  }

  const openFileAtLine = async (path: string, line: number): Promise<void> => {
    await openFile(path)
    setTimeout(() => editorRef.current?.scrollToLine(line), 80)
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-outline-variant/20 bg-surface overflow-hidden">

        {/* EXPLORER */}
        {folders.length > 0 && (
          <div className="flex flex-col min-h-[60px] overflow-hidden" style={{ flex: '1 1 0' }}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1.5 flex-shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Explorer</span>
              <button onClick={openFolderDialog} title="Open folder" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>create_new_folder</span>
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
            className="flex-shrink-0 h-[5px] cursor-row-resize group border-t border-outline-variant/15 hover:bg-primary/20 transition-colors"
            title="Drag to resize"
          >
            <div className="mx-auto mt-[1px] w-8 h-[2px] rounded-full bg-outline-variant/30 group-hover:bg-primary/50 transition-colors" />
          </div>
        )}

        {/* OPEN FILES */}
        <div
          className={`flex flex-col border-outline-variant/15 flex-shrink-0 ${folders.length > 0 ? 'border-t-0' : 'border-t flex-1'}`}
          style={folders.length > 0 ? { height: openFilesHeight } : undefined}
        >
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">Open files</span>
            <div className="flex items-center gap-1">
              {folders.length === 0 && (
                <button onClick={openFolderDialog} title="Open folder" className="text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>create_new_folder</span>
                </button>
              )}
              <button onClick={createNewFile} title="New file (Untitled)" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>note_add</span>
              </button>
              <button onClick={openDialog} title="Open file" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>folder_open</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1 min-h-0">
            {tabs.length === 0 ? (
              <p className="text-[11px] text-on-surface-variant/50 text-center pt-4 px-3">
                No files open.<br />Drop a file or folder here.
              </p>
            ) : (
              tabs.map((tab) => (
                <FileListItem
                  key={tab.id} tab={tab} isActive={activeId === tab.id}
                  onClick={() => setActiveId(tab.id)}
                  onClose={() => handleCloseTab(tab.id)}
                  onSave={saveActive}
                />
              ))
            )}
          </div>
        </div>

        {/* RECENT */}
        {recents.length > 0 && folders.length === 0 && (
          <div className="border-t border-outline-variant/15 flex-shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 px-3 pt-3 pb-1.5">Recent</p>
            <div className="overflow-y-auto max-h-36 pb-2">
              {recents.slice(0, 8).map((r) => (
                <button key={r.path} onClick={() => openFile(r.path)} title={r.path}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-surface-container transition-colors group">
                  <span className="material-symbols-outlined text-on-surface-variant/50 flex-shrink-0" style={{ fontSize: '13px' }}>history</span>
                  <span className="text-[11px] text-on-surface-variant group-hover:text-on-surface truncate">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main editor area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

        {/* Tab bar + settings */}
        <div className="flex items-center border-b border-outline-variant/20 bg-surface flex-shrink-0">
          <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <div key={tab.id} onClick={() => setActiveId(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium cursor-pointer border-b-2 whitespace-nowrap group transition-colors flex-shrink-0 ${
                  activeId === tab.id ? 'border-primary text-primary bg-surface-container-low' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{languageIcon(tab.language)}</span>
                <span className={`max-w-[120px] truncate ${tab.path === null ? 'italic' : ''}`}>{tab.name}</span>
                {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                {tab.hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />}
                <button onClick={(e) => { e.stopPropagation(); void handleCloseTab(tab.id) }}
                  className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-all ml-0.5">
                  <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>close</span>
                </button>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-0.5 px-2 flex-shrink-0">
            <button onClick={() => setQuickOpen(true)} title="Quick Open (Ctrl+P)"
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>manage_search</span>
            </button>
            <button onClick={() => setShowFind((v) => !v)} title="Find in files (Ctrl+Shift+F)"
              className={`p-1.5 rounded-lg transition-colors ${showFind ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>find_in_page</span>
            </button>

            {/* Settings */}
            <div className="relative" ref={settingsRef}>
              <button onClick={() => setSettingsOpen((v) => !v)} title="Editor settings"
                className={`p-1.5 rounded-lg transition-colors ${settingsOpen ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>tune</span>
              </button>

              {settingsOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-surface-container border border-outline-variant/30 rounded-xl shadow-xl z-30 p-3 flex flex-col gap-3">
                  {/* Font */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Font</p>
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
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Size</p>
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
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-1.5">Theme</p>
                    <div className="flex gap-1">
                      {(['auto', 'dark', 'light'] as const).map((t) => (
                        <button key={t} onClick={() => updatePrefs({ editorTheme: t })}
                          className={`flex-1 text-[11px] py-1 rounded-lg border capitalize transition-colors ${prefs.editorTheme === t ? 'border-primary/40 text-primary bg-primary/10 font-medium' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-on-surface'}`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {/* Auto-save */}
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Auto-save</p>
                    <button onClick={() => updatePrefs({ autoSave: !prefs.autoSave })}
                      className={`relative w-8 h-4 rounded-full transition-colors ${prefs.autoSave ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${prefs.autoSave ? 'left-4.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Monitoring bar */}
        {activeTab && (
          <div className="flex items-center gap-3 px-3 py-1 border-b border-outline-variant/15 bg-surface flex-shrink-0 text-xs">
            <button onClick={toggleWatch} title={activeTab.watchActive ? 'Stop monitoring' : 'Monitor file for changes'}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors flex-shrink-0 ${activeTab.watchActive ? 'border-accent/40 text-accent bg-accent/10 font-semibold' : 'border-outline-variant/30 text-on-surface-variant hover:border-accent/30 hover:text-accent'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{activeTab.watchActive ? 'visibility' : 'visibility_off'}</span>
              Monitoring
            </button>

            {activeTab.watchActive && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeTab.frozen ? 'bg-on-surface-variant/50' : 'bg-accent animate-pulse'}`} />
                  <span className={`font-medium ${activeTab.frozen ? 'text-on-surface-variant' : 'text-accent'}`}>{activeTab.frozen ? 'Frozen' : 'Live'}</span>
                </div>
                {activeTab.hasUpdate && !activeTab.frozen && (
                  <button onClick={applyUpdate} className="text-accent underline hover:no-underline">File changed — refresh</button>
                )}
                {/* Log filter */}
                <div className="flex items-center gap-1.5 bg-surface-container border border-outline-variant/20 rounded-lg px-2 py-0.5">
                  <span className="material-symbols-outlined text-on-surface-variant/40" style={{ fontSize: '12px' }}>filter_alt</span>
                  <input value={logFilter} onChange={(e) => setLogFilter(e.target.value)} placeholder="Filter lines…"
                    className="bg-transparent text-[11px] text-on-surface outline-none placeholder:text-on-surface-variant/30 w-28" />
                  {logFilter && (
                    <button onClick={() => setLogFilter('')} className="text-on-surface-variant/40 hover:text-on-surface-variant">
                      <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>close</span>
                    </button>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={toggleTail} title="Auto-scroll to bottom"
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors ${activeTab.tailMode ? 'border-primary/40 text-primary bg-primary/10' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30'}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>arrow_downward</span>Tail
                  </button>
                  <button onClick={toggleFreeze}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors ${activeTab.frozen ? 'border-error/40 text-error bg-error/10' : 'border-outline-variant/30 text-on-surface-variant hover:border-error/30'}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{activeTab.frozen ? 'play_arrow' : 'pause'}</span>
                    {activeTab.frozen ? 'Resume' : 'Freeze'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Breadcrumb */}
        {activeTab?.path && <Breadcrumb filePath={activeTab.path} />}

        {/* Editor */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden relative">
            {activeTab ? (
              <CodeEditor
                key={activeTab.id}
                content={activeTab.content}
                language={activeTab.language}
                isDark={editorDark}
                wordWrap={activeTab.wordWrap}
                fontSize={prefs.fontSize}
                fontFamily={prefs.fontFamily}
                onChange={(val) => updateTab(activeTab.id, { content: val, isDirty: true })}
                onCursorChange={(ln, col) => setCursor({ ln, col })}
                editorRef={editorRef}
              />
            ) : (
              <EmptyState onOpen={openDialog} />
            )}

            {/* Drag overlay */}
            {isDragging && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-primary/50 bg-primary/5 backdrop-blur-sm pointer-events-none">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '48px' }}>file_open</span>
                <p className="text-sm font-medium text-primary">Drop file or folder to open</p>
              </div>
            )}
          </div>

          {/* Find in files panel */}
          {showFind && (
            <FindInFiles folders={folders} onOpenAt={openFileAtLine} onClose={() => setShowFind(false)} />
          )}

          {/* Status bar */}
          {activeTab && (
            <div className="flex items-center gap-3 px-3 py-1 border-t border-outline-variant/15 bg-surface-container-low flex-shrink-0 text-[10px] text-on-surface-variant/50 select-none">
              {/* Info */}
              <span className="tabular-nums">Ln {cursor.ln}, Col {cursor.col}</span>
              <span className="tabular-nums">{lineCount} lines</span>
              <span className="tabular-nums">{wordCount} words</span>
              <span className="uppercase">{activeTab.language}</span>
              <span>{(activeTab.size / 1024).toFixed(1)} KB</span>
              <span>UTF-8</span>

              {/* Actions */}
              <div className="ml-auto flex items-center gap-2 pointer-events-auto">
                {activeTab.path && (
                  <>
                    <button onClick={() => navigator.clipboard.writeText(activeTab.path!)} title="Copy path"
                      className="flex items-center gap-0.5 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>content_copy</span>
                      Path
                    </button>
                    <button onClick={() => window.api.invoke('editor:reveal', activeTab.path!)} title="Reveal in Explorer"
                      className="flex items-center gap-0.5 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>folder_open</span>
                      Reveal
                    </button>
                  </>
                )}
                <button onClick={toggleWrap} title="Toggle word wrap"
                  className={`flex items-center gap-0.5 transition-colors ${activeTab.wordWrap ? 'text-primary' : 'hover:text-primary'}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>wrap_text</span>
                  Wrap
                </button>
                {(activeTab.isDirty || activeTab.path === null) && (
                  <button onClick={saveActive} title={activeTab.path === null ? 'Save As (Ctrl+S)' : 'Save (Ctrl+S)'}
                    className="flex items-center gap-0.5 text-primary hover:opacity-80 transition-opacity">
                    <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>save</span>
                    {activeTab.path === null ? 'Save As' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {quickOpen && <QuickOpen folders={folders} onOpen={openFile} onClose={() => setQuickOpen(false)} />}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

      {/* ── Delete confirmation modal ──────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[360px] bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl p-5 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-error flex-shrink-0 mt-0.5" style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1" }}>
                {deleteConfirm.isDir ? 'folder_delete' : 'delete'}
              </span>
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
              <button
                onClick={() => deleteConfirm.resolve(false)}
                className="px-3 py-1.5 text-[12px] rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >Cancel</button>
              <button
                onClick={() => deleteConfirm.resolve(true)}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-error text-white hover:bg-error/90 transition-colors font-medium"
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save-on-close confirmation modal ──────────────────────────────── */}
      {closeConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[360px] bg-surface-container border border-outline-variant/30 rounded-2xl shadow-2xl p-5 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary flex-shrink-0 mt-0.5" style={{ fontSize: '22px' }}>save</span>
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
              <button
                onClick={() => closeConfirm.resolve('cancel')}
                className="px-3 py-1.5 text-[12px] rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >Cancel</button>
              <button
                onClick={() => closeConfirm.resolve('discard')}
                className="px-3 py-1.5 text-[12px] rounded-lg text-error hover:bg-error/10 border border-error/30 transition-colors"
              >Don't Save</button>
              <button
                onClick={() => closeConfirm.resolve('save')}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors font-medium"
              >Save</button>
            </div>
          </div>
        </div>
      )}
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
          <span className="material-symbols-outlined text-on-surface-variant/50 flex-shrink-0" style={{ fontSize: '13px' }}>{isOpen ? 'expand_more' : 'chevron_right'}</span>
          <span className="material-symbols-outlined text-primary/70 flex-shrink-0" style={{ fontSize: '14px' }}>{isOpen ? 'folder_open' : 'folder'}</span>
          {cb.renaming === folder.path
            ? <InlineInput defaultValue={folder.name} onCommit={(n) => cb.onRenameCommit(folder.path, n)} onCancel={cb.onCancel} />
            : <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide truncate" title={folder.path}>{folder.name}</span>
          }
        </button>
        <button onClick={() => onClose(folder.path)} title="Close folder"
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant/50 hover:text-error transition-all flex-shrink-0">
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
        </button>
      </div>
      {isOpen && (
        <>
          {/* New file/folder inline input at top of root children */}
          {cb.creating?.parentPath === folder.path && (
            <div className="flex items-center gap-1 py-[3px]" style={{ paddingLeft: '20px', paddingRight: '8px' }}>
              <span className="material-symbols-outlined text-primary/60 flex-shrink-0" style={{ fontSize: '13px' }}>
                {cb.creating.type === 'file' ? 'description' : 'folder'}
              </span>
              <InlineInput defaultValue="" onCommit={(n) => cb.onCreateCommit(folder.path, n, cb.creating!.type)} onCancel={cb.onCancel} />
            </div>
          )}
          {folder.children?.map((child) => <TreeNode key={child.path} node={child} depth={1} expanded={expanded} onToggle={onToggle} rootPath={folder.path} cb={cb} />)}
          {folder.truncated && <p className="text-[10px] text-on-surface-variant/35 italic px-5 py-1">Showing first 200 files</p>}
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
        className="flex items-center gap-1 py-[3px] cursor-pointer hover:bg-surface-container group transition-colors"
        style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}>
        {node.isDir
          ? <span className="material-symbols-outlined text-on-surface-variant/40 flex-shrink-0" style={{ fontSize: '13px' }}>{isOpen ? 'expand_more' : 'chevron_right'}</span>
          : <span className="flex-shrink-0" style={{ width: '13px' }} />
        }
        <span className={`material-symbols-outlined flex-shrink-0 ${node.isDir ? 'text-primary/60' : 'text-on-surface-variant/50'}`} style={{ fontSize: '13px' }}>
          {node.isDir ? (isOpen ? 'folder_open' : 'folder') : languageIcon(detectLanguage(node.name))}
        </span>
        {cb.renaming === node.path
          ? <InlineInput defaultValue={node.name} onCommit={(n) => cb.onRenameCommit(node.path, n)} onCancel={cb.onCancel} />
          : <span className="text-[11px] text-on-surface-variant group-hover:text-on-surface truncate flex-1">{node.name}</span>
        }
      </div>

      {node.isDir && isOpen && (
        <>
          {/* Inline create input inside this directory */}
          {cb.creating?.parentPath === node.path && (
            <div className="flex items-center gap-1 py-[3px]" style={{ paddingLeft: `${8 + (depth + 1) * 10}px`, paddingRight: '8px' }}>
              <span className="material-symbols-outlined text-primary/60 flex-shrink-0" style={{ fontSize: '13px' }}>
                {cb.creating.type === 'file' ? 'description' : 'folder'}
              </span>
              <InlineInput defaultValue="" onCommit={(n) => cb.onCreateCommit(node.path, n, cb.creating!.type)} onCancel={cb.onCancel} />
            </div>
          )}
          {node.children?.map((child) => <TreeNode key={child.path} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} rootPath={rootPath} cb={cb} />)}
          {node.truncated && <p className="text-[10px] text-on-surface-variant/35 italic py-0.5" style={{ paddingLeft: `${8 + (depth + 1) * 10}px` }}>…more files not shown</p>}
        </>
      )}
    </div>
  )
}

function FileListItem({ tab, isActive, onClick, onClose, onSave }: {
  tab: OpenFile; isActive: boolean; onClick: () => void; onClose: () => void; onSave: () => void
}): JSX.Element {
  const dir = tab.path ? tab.path.split(/[\\/]/).slice(0, -1).join('\\') : null
  return (
    <div onClick={onClick} title={dir ?? 'Unsaved — not on disk'}
      className={`flex items-center gap-2 w-full px-3 py-2 cursor-pointer group transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}>
      <span className={`material-symbols-outlined flex-shrink-0 ${isActive ? 'text-primary' : 'text-on-surface-variant/60'}`} style={{ fontSize: '15px' }}>
        {languageIcon(tab.language)}
      </span>
      <span className={`text-[11px] font-medium truncate flex-1 ${tab.path === null ? 'italic' : ''}`}>{tab.name}</span>
      {tab.watchActive && !tab.frozen && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />}
      {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
      {(tab.isDirty || tab.path === null) && isActive && (
        <button onClick={(e) => { e.stopPropagation(); onSave() }} title="Save"
          className="opacity-0 group-hover:opacity-100 hover:text-primary transition-all flex-shrink-0">
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>save</span>
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onClose() }}
        className="opacity-0 group-hover:opacity-100 hover:text-error transition-all flex-shrink-0">
        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
      </button>
    </div>
  )
}

function EmptyState({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center select-none">
      <span className="material-symbols-outlined text-on-surface-variant/20" style={{ fontSize: '72px' }}>text_snippet</span>
      <div>
        <p className="font-medium text-on-surface-variant text-sm">No file open</p>
        <p className="text-xs text-on-surface-variant/50 mt-1">Drop a file or folder here</p>
      </div>
      <button onClick={onOpen}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-on-primary hover:opacity-90 transition-opacity"
        style={{ background: 'var(--gradient-brand)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>folder_open</span>Open file
      </button>
    </div>
  )
}
