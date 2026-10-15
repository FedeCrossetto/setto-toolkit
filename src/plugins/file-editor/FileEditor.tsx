import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Diff, Eye,
  FileInput, FilePlus, FileSearch, FileText, Filter, Folder, Import,
  FolderOpen, FolderPlus, FolderSearch, Palette, PanelLeft, PanelLeftClose, Pencil,
  Save, SlidersHorizontal, SquareTerminal, Trash2, WrapText, X,
} from 'lucide-react'
import { useApp } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { Modal, Sheet, useConfirm } from '../../core/components/Modal'
import { Toggle, SettingsGroup, SettingsRow } from '../../core/components/Form'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { dragState } from '../../core/dragState'
import { useEditorTabs, languageIcon, detectLanguage, refineLanguageFromContent } from './hooks/useEditorTabs'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useEditorPrefs, FONT_FAMILIES, FONT_SIZE_MIN, FONT_SIZE_MAX, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from './hooks/useEditorPrefs'
import { useAutoSave } from './hooks/useAutoSave'
import { CodeEditor } from './components/CodeEditor'
import { ThemeGrid } from './components/ThemePicker'
import { resolveEditorTheme } from './themes/registry'
import { presetCodeThemes, useAppearance } from '../../core/hooks/useThemePalette'
import type { EditorColorScheme } from './themes/registry'
import { paneStyle } from './themes/buildTheme'
import { Breadcrumb } from './components/Breadcrumb'
import { ContextMenu } from './components/ContextMenu'
import { QuickOpen } from './components/QuickOpen'
import { FindInFiles } from './components/FindInFiles'
import { ImagePreview, isImagePath } from './components/ImagePreview'
import { MarkdownPreview } from './components/MarkdownPreview'
import { HistorySheet } from './components/HistorySheet'
import { formatDocument, isFormatSupported } from './format'
import type { FileEncoding, EolKind, ReadFileResponse } from './types'
import { Check, History, Wand2 } from 'lucide-react'
import type { FileChangedEvent, OpenFile, RecentFile, FileLanguage, FileTreeNode, EditorHandle, WriteFileResponse, GitLineDiff } from './types'
import { Badge } from '../../core/components/Badge'
import { Tooltip } from '../../core/components/Tooltip'
import type { MenuItem } from './components/ContextMenu'
import { usePluginIntent } from '../../core/AppContext'
import { LogToolbar } from './components/LogToolbar'
import { TabSwitcher } from './components/TabSwitcher'
import { SplitLayout, SplitPaneHeader } from './components/SplitView'
import { useSplitView } from './hooks/useSplitView'
import { useOpenFilesView } from './hooks/useOpenFilesView'
import { publishOpenFiles } from './openFilesStore'
import { arrangeOpenFiles, tabsToClose, type BulkCloseMode } from './navigation'
import { DEFAULT_LOG_VIEW, isLogFile, isLogViewFiltered, type LogViewState } from './logParsing'
import { Columns2, FolderTree, Pin, PinOff } from 'lucide-react'

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
  | { path: string; name: string; dirtyContent?: string; encoding?: FileEncoding; eol?: EolKind }
  | { path: null; name: string; content: string; language: FileLanguage; encoding?: FileEncoding; eol?: EolKind }
/** Labels for the status-bar encoding chip */
const ENCODING_LABEL: Record<FileEncoding, string> = {
  utf8: 'UTF-8', utf8bom: 'UTF-8 con BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', windows1252: 'Windows-1252',
}
/** Strip Electron's "Error invoking remote method 'x': Error:" prefix from IPC errors */
const ipcErrorMessage = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
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
  const confirmDialog = useConfirm()

  const notifySaved = useCallback((): void => {
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    showToast('Archivo guardado', 'success', 2200)
  }, [showToast])

  const copyPath = useCallback((path: string) => {
    void navigator.clipboard.writeText(path).then(() => {
      showToast('Ruta copiada', 'success', 2000)
    }).catch(() => {
      showToast('No se pudo copiar la ruta', 'error', 2500)
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
  // Vista de log por pestaña (filtros de nivel/texto y "Limpiar vista")
  const [logViews, setLogViews]     = useState<Record<string, LogViewState>>({})
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
  const askDelete = (opts: { name: string; isDir: boolean; permanent?: boolean }): Promise<boolean> =>
    confirmDialog(opts.permanent
      ? {
          title: '¿Eliminar permanentemente?',
          message: `No se pudo mover "${opts.name}" a la papelera. Si continuás, se borra definitivamente. Esta acción no se puede deshacer.`,
          confirmLabel: 'Eliminar',
          destructive: true,
        }
      : {
          title: `¿Eliminar ${opts.isDir ? 'carpeta' : 'archivo'}?`,
          message: `"${opts.name}"${opts.isDir ? ' y todo su contenido se van a mover' : ' se va a mover'} a la papelera.`,
          confirmLabel: 'Eliminar',
          destructive: true,
        })

  /** Delete via OS trash; if trash is unavailable, ask again before hard-deleting. */
  const deleteWithFallback = async (targetPath: string, name: string, isDir: boolean): Promise<boolean> => {
    const res = await window.api.invoke<{ ok: boolean; trashFailed?: boolean }>('editor:delete', targetPath)
    if (res.ok) return true
    const confirmed = await askDelete({ name, isDir, permanent: true })
    if (!confirmed) return false
    await window.api.invoke('editor:delete-permanent', targetPath)
    return true
  }

  const [savedFlash, setSavedFlash] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  // Status-bar encoding/EOL menu (anchored bottom-left of the chip) and local history sheet
  const [encodingMenu, setEncodingMenu] = useState<{ x: number; y: number } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const formatActiveRef = useRef<() => void>(() => {})
  const autosaveErrorRef = useRef<string | null>(null)
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
  // Hovering a theme card previews it live; clicking persists it in prefs
  const [previewScheme, setPreviewScheme] = useState<EditorColorScheme | null>(null)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  // "Tema de la app" (setto) + un tema completo activo (Nord, Catppuccin…): usar su pareja.
  const appearance = useAppearance()
  const presetEditor = prefs.colorScheme === 'setto' ? presetCodeThemes(appearance, appDark)?.editor ?? null : null
  const editorThemeDef = useMemo(
    () => resolveEditorTheme(previewScheme ?? presetEditor ?? prefs.colorScheme, prefs.editorTheme, appDark),
    // `appearance`: los temas que siguen a la app leen los tokens --c-* al construirse.
    [previewScheme, presetEditor, prefs.colorScheme, prefs.editorTheme, appDark, appearance],
  )
  const editorPaneStyle = useMemo(() => paneStyle(editorThemeDef) as React.CSSProperties, [editorThemeDef])
  const pickScheme = useCallback((id: EditorColorScheme) => {
    setPreviewScheme(null)
    updatePrefs({ colorScheme: id })
  }, [updatePrefs])

  // Close the quick theme popover on outside click / Escape
  useEffect(() => {
    if (!themeMenuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!themeMenuRef.current?.contains(e.target as Node)) { setThemeMenuOpen(false); setPreviewScheme(null) }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); setThemeMenuOpen(false); setPreviewScheme(null) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  }, [themeMenuOpen])

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
    if (!activeTab?.path || !activeTab.isDirty || activeTab.truncated) return
    let result: WriteFileResponse
    try {
      result = await window.api.invoke<WriteFileResponse>('editor:write-file', activeTab.path, activeTab.content, { ...writeOptions(activeTab), autosave: true })
    } catch (e) {
      // e.g. a char that doesn't exist in Windows-1252 — keep the tab dirty and tell the user
      // once per distinct error (autosave retries on every edit).
      const msg = ipcErrorMessage(e)
      if (autosaveErrorRef.current !== `${activeTab.id}:${msg}`) showToast(`Autoguardado: ${msg}`, 'error', 6000)
      autosaveErrorRef.current = `${activeTab.id}:${msg}`
      return
    }
    autosaveErrorRef.current = null
    recentWritesRef.current.set(result.path, { at: Date.now(), content: activeTab.content })
    updateTab(activeTab.id, { isDirty: false, lastModified: result.mtime, size: result.size, eolMixed: false })
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
      showToast(`No se pudo abrir "${target.path}"`, 'error')
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
            const buf = openBuffer(saved.name, saved.content, saved.language)
            if (saved.encoding || saved.eol) updateTab(buf.id, { encoding: saved.encoding, eol: saved.eol })
            return { tab: buf, path: null as null, name: saved.name }
          }
          const tab = await openFile(saved.path)
          // Re-apply unsaved edits captured before the last close/crash
          if (tab && saved.dirtyContent !== undefined && saved.dirtyContent !== tab.content) {
            updateTab(tab.id, { content: saved.dirtyContent, isDirty: true })
          }
          // Re-apply a pending "save with encoding / EOL" choice (only persisted while dirty)
          if (tab && (saved.encoding || saved.eol) && (saved.encoding !== tab.encoding || saved.eol !== tab.eol)) {
            updateTab(tab.id, { encoding: saved.encoding ?? tab.encoding, eol: saved.eol ?? tab.eol, isDirty: true })
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
          ? { path: null, name: t.name, content: t.content, language: t.language, encoding: t.encoding, eol: t.eol }
          : {
              path: t.path, name: t.name,
              // Persist unsaved edits so a crash or accidental close never loses work
              ...(t.isDirty && t.content.length <= MAX_DIRTY_PERSIST ? { dirtyContent: t.content } : {}),
              // Clean tabs re-detect encoding/EOL from disk on restore; dirty ones keep the user's choice
              ...(t.isDirty ? { encoding: t.encoding, eol: t.eol } : {}),
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
      // Shift+Alt+F — formatear documento
      if (e.shiftKey && e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyF') {
        e.preventDefault()
        formatActiveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // stable — all mutable values accessed via refs

  // ── Filter → CodeEditor ───────────────────────────────────────────────────
  // ── Navegación: split, lista "Abiertos", Ctrl+K, intents ────────────────────
  const split = useSplitView(tabs, activeId, setActiveId)
  const splitEditorRef = useRef<EditorHandle | null>(null)
  const splitTab = split.open ? split.tab : null
  const openView = useOpenFilesView()
  const openGroups = useMemo(
    () => arrangeOpenFiles(tabs, { isPinned: openView.isPinned, query: openView.filter, groupByFolder: openView.groupByFolder }),
    [tabs, openView.isPinned, openView.filter, openView.groupByFolder],
  )
  // Compactar: sólo las carpetas (como "Collapse Folders" de los IDE). Filtrando, se ve todo.
  const foldableKeys = openGroups.filter((g) => g.label).map((g) => g.key)
  const isGroupCollapsed = (key: string): boolean => !openView.filter && openView.collapsed.has(key)
  const allCollapsed = openView.groupByFolder && foldableKeys.length > 0 && foldableKeys.every((k) => openView.collapsed.has(k))
  const toggleCompact = (): void => {
    if (allCollapsed) { openView.setAllCollapsed([]); return }
    if (!openView.groupByFolder) {
      // Lista plana: agrupar primero y plegar todas las carpetas que van a aparecer.
      const grouped = arrangeOpenFiles(tabs, { isPinned: openView.isPinned, query: '', groupByFolder: true })
      openView.setGroupByFolder(true)
      openView.setAllCollapsed(grouped.filter((g) => g.label).map((g) => g.key))
      return
    }
    openView.setAllCollapsed(foldableKeys)
  }
  const selectTab = (id: string): void => { setSelectedIds(new Set()); split.routeSelect(id) }

  // Espejo de los abiertos para el proveedor de Ctrl+K (src/plugins/file-editor/search.ts)
  const openRefsKey = tabs.map((t) => `${t.id}\u0000${t.name}\u0000${t.path ?? ''}\u0000${t.isDirty ? 1 : 0}`).join('\u0001')
  useEffect(() => {
    publishOpenFiles(tabs.map((t) => ({ id: t.id, name: t.name, path: t.path, isDirty: t.isDirty })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRefsKey])
  useEffect(() => () => publishOpenFiles(null), [])

  usePluginIntent('file-editor', (intent) => {
    if (intent.action !== 'activate-tab') return
    const p = intent.payload as { id?: string; name?: string } | undefined
    const target = tabs.find((t) => t.id === p?.id) ?? tabs.find((t) => t.path === null && t.name === p?.name)
    if (target) setActiveId(target.id)
  })

  const activeLogMode = !!activeTab && isLogFile(activeTab.name, activeTab.language, activeTab.watchActive)
  const activeLogView = (activeTab && logViews[activeTab.id]) || DEFAULT_LOG_VIEW
  const setActiveLogView = (v: LogViewState): void => {
    if (activeTab) setLogViews((prev) => ({ ...prev, [activeTab.id]: v }))
  }

  // Ctrl+\ — dividir / cerrar división (sólo con el Editor visible)
  const splitToggleRef = useRef(split.toggle)
  splitToggleRef.current = split.toggle
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === '\\' || e.code === 'Backslash'))) return
      if (!rootRef.current || rootRef.current.offsetParent === null) return
      e.preventDefault()
      splitToggleRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      showToast(`"${tab.name}" se eliminó del disco`, 'error')
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
      showToast(`"${tab.name}" cambió en disco y tenés cambios sin guardar`, 'warning')
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
    showToast(`"${tab.name}" se actualizó desde el disco`, 'info')
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

    const opts = writeOptions(tab)
    let result: WriteFileResponse
    try {
      result = await window.api.invoke<WriteFileResponse>('editor:write-file', targetPath, tab.content, opts)
    } catch (e) {
      showToast(`No se pudo guardar "${tab.name}": ${ipcErrorMessage(e)}`, 'error', 6000)
      return false
    }
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
      // Remember what was written (untitled buffers get the defaults); mixed EOLs are unified now
      encoding: opts.encoding,
      eol: opts.eol,
      eolMixed: false,
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
          const confirmed = await askDelete({ name: node.name, isDir: node.isDir })
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

  /** Cierre en bloque siguiendo el orden visible de "Abiertos"; los fijados no se cierran. */
  const closeBulk = async (targetId: string, mode: BulkCloseMode): Promise<void> => {
    const ordered = openGroups.flatMap((g) => g.items)
    const ids = tabsToClose(ordered, targetId, mode, openView.isPinned)
    if (ids.length === 0) return
    const closing = new Set(ids)
    const prevActive = activeId
    for (const id of ids) await handleCloseTab(id)
    // closeTab elige el próximo activo con un activeId viejo: fijarlo explícitamente
    const focus = prevActive && !closing.has(prevActive)
      ? prevActive
      : (mode === 'saved' ? tabs.find((t) => !closing.has(t.id))?.id : targetId)
    if (focus) setActiveId(focus)
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
          { label: 'Mostrar en carpeta', icon: FolderOpen, action: () => window.api.invoke('editor:reveal', tab.path!) },
        ] : []),
        { label: openView.isPinned(tab) ? 'Desfijar' : 'Fijar', icon: openView.isPinned(tab) ? PinOff : Pin, action: () => openView.togglePin(tab) },
        { label: 'Abrir en panel dividido', icon: Columns2, action: () => { if (split.open) split.pick(tab.id); else split.toggle(tab.id) } },
        ...(tab.path ? [
          { divider: true, label: '', action: () => {} },
          {
            label: 'Eliminar', icon: Trash2, danger: true,
            action: async () => {
              const confirmed = await askDelete({ name: tab.name, isDir: false })
              if (!confirmed) return
              if (!await deleteWithFallback(tab.path!, tab.name, false)) return
              const root = findRootPath(tab.path!)
              markDeletedTabs(tab.path!, false)
              if (root) await refreshFolder(root)
            },
          },
        ] : []),
        { divider: true, label: '', action: () => {} },
        { label: 'Cerrar', icon: X, action: () => handleCloseTab(tab.id) },
        { label: 'Cerrar otros', action: () => void closeBulk(tab.id, 'others') },
        { label: 'Cerrar los de abajo', action: () => void closeBulk(tab.id, 'below') },
        { label: 'Cerrar guardados', action: () => void closeBulk(tab.id, 'saved') },
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
      showToast(`No se pudo crear ${type === 'file' ? 'el archivo' : 'la carpeta'}: ${msg}`, 'error')
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
    const file = openBuffer(newFileCount === 1 ? 'Sin título.txt' : `Sin título-${newFileCount}.txt`, '', 'text')
    setRenamingTabId(file.id)
  }

  // ── Tab actions ───────────────────────────────────────────────────────────
  const toggleWatch  = (): void => { if (activeTab) updateTab(activeTab.id, { watchActive: !activeTab.watchActive }) }
  const toggleFreeze = (): void => { if (activeTab) updateTab(activeTab.id, { frozen: !activeTab.frozen }) }
  const toggleWrap   = (): void => { if (activeTab) updateTab(activeTab.id, { wordWrap: !activeTab.wordWrap }) }

  // ── Encoding / EOL, format, local history, replace-in-files reload ────────
  /** What editor:write-file should produce: the file's own encoding/EOL, or the defaults for new files */
  const writeOptions = (tab: OpenFile): { encoding: FileEncoding; eol: EolKind } =>
    ({ encoding: tab.encoding ?? 'utf8', eol: tab.eol ?? prefs.defaultEol })

  const setActiveEncoding = (encoding: FileEncoding): void => {
    setEncodingMenu(null)
    if (!activeTab || encoding === writeOptions(activeTab).encoding) return
    updateTab(activeTab.id, { encoding, isDirty: true })
  }
  const setActiveEol = (eol: EolKind): void => {
    setEncodingMenu(null)
    if (!activeTab || (eol === writeOptions(activeTab).eol && !activeTab.eolMixed)) return
    updateTab(activeTab.id, { eol, isDirty: true })
  }

  /** Shift+Alt+F — formats the active document; one undoable change (Ctrl+Z reverts it) */
  const formatActive = (): void => {
    const tab = activeTab
    if (!tab || isImagePath(tab.path)) return
    if (tab.truncated) { showToast('Cargá el archivo completo antes de formatearlo', 'warning', 3500); return }
    const lang = refineLanguageFromContent(tab.language, tab.content)
    if (!isFormatSupported(lang)) { showToast('Formatear documento está disponible para JSON, XML/HTML (.config, .csproj…) y SQL', 'info', 3500); return }
    const r = formatDocument(tab.content, lang)
    if (!r.ok) { showToast(`No se pudo formatear: ${r.error}`, 'error', 5000); return }
    if (r.text === tab.content) { showToast('El documento ya está formateado', 'info', 2000); return }
    updateTab(tab.id, { content: r.text, isDirty: true })
  }
  formatActiveRef.current = formatActive

  /** Reload open tabs whose files were rewritten by "Reemplazar en archivos" */
  const handleFilesReplaced = async (paths: string[]): Promise<void> => {
    for (const p of paths) {
      const tab = tabs.find((t) => t.path === p)
      if (!tab) continue
      try {
        const r = await window.api.invoke<ReadFileResponse>('editor:read-file', { path: p })
        if (tab.isDirty) {
          // Same conflict flow as an external change: the user picks which version wins
          updateTab(tab.id, { hasUpdate: true, pendingExternalContent: r.content, pendingExternalMtime: r.mtime, pendingExternalSize: r.size })
        } else {
          updateTab(tab.id, { content: r.content, lastModified: r.mtime, size: r.size, encoding: r.encoding, eol: r.eol, eolMixed: r.eolMixed, hasUpdate: false })
        }
      } catch { /* file vanished — the watcher will report it */ }
    }
  }

  const smartDiffEnabled = !state.disabledPlugins.includes('smart-diff')

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
    <div ref={rootRef} className="flex h-full overflow-hidden relative">
      <TabSwitcher
        tabs={tabs}
        activeId={split.open && split.focused === 'split' ? (split.tab?.id ?? activeId) : activeId}
        onCommit={selectTab}
        renderIcon={(t) => { const Icon = languageIcon(t.language); return <Icon size={14} style={{ color: langColor(t.language) }} /> }}
      />

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={[
          'flex-shrink-0 flex flex-col hairline-r bg-surface overflow-hidden',
          sidebarCollapsed ? 'w-10 transition-[width] duration-200 ease-out' : '',
          zenMode ? 'hidden' : '',
        ].join(' ')}
        style={sidebarCollapsed ? undefined : { width: prefs.sidebarWidth }}
      >
      {sidebarCollapsed ? (
        <CollapsedSidebarRail
          tabs={tabs}
          activeId={activeId}
          onExpand={() => setSidebarCollapsed(false)}
          onSelectTab={selectTab}
          onTabContextMenu={handleTabContextMenu}
        />
      ) : (<>

        {/* EXPLORER */}
        {folders.length > 0 && (
          <div className="flex flex-col min-h-[60px] overflow-hidden" style={{ flex: '1 1 0' }}>
            <div className="flex items-center justify-between pl-4 pr-2 pt-3 pb-1 h-9 flex-shrink-0">
              <span className={SIDEBAR_SECTION}>Carpetas</span>
              <button onClick={openFolderDialog} title="Abrir carpeta" aria-label="Abrir carpeta" className="ui-btn ui-btn-ghost ui-btn-icon rounded-md">
                <FolderOpen size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pb-1 px-1">
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
            className="flex-shrink-0 h-[6px] cursor-row-resize hairline-t hover:bg-on-surface/[0.06] transition-colors"
            style={{ touchAction: 'none' }}
            title="Arrastrar para redimensionar"
          >
          </div>
        )}

        {/* OPEN FILES */}
        <div
          className={`flex flex-col flex-shrink-0 ${folders.length > 0 ? '' : 'flex-1'}`}
          style={folders.length > 0 ? { height: openFilesHeight } : undefined}
          onContextMenu={handleOpenFilesPanelContextMenu}
        >
          <div className="flex items-center justify-between pl-4 pr-2 pt-2.5 pb-1 flex-shrink-0 gap-1">
            <span className={`${SIDEBAR_SECTION} flex items-center gap-1.5 whitespace-nowrap`}>
              Abiertos
              {tabs.length > 0 && (
                <span className="tabular-nums font-normal text-on-surface-variant/70">{tabs.length}</span>
              )}
              {tabs.some((t) => t.isDirty) && (
                <span className="tabular-nums font-medium normal-case tracking-normal text-warning" title="Archivos sin guardar">
                  · {tabs.filter((t) => t.isDirty).length} sin guardar
                </span>
              )}
            </span>
            <div className="flex items-center gap-0.5">
              <Tooltip label="Nuevo archivo" shortcut="Ctrl+T">
                <button onClick={createNewFile} aria-label="Nuevo archivo" className="ui-btn ui-btn-ghost ui-btn-icon rounded-md">
                  <FilePlus size={15} />
                </button>
              </Tooltip>
              <Tooltip label="Abrir archivo" shortcut="Ctrl+O">
                <button onClick={openDialog} aria-label="Abrir archivo" className="ui-btn ui-btn-ghost ui-btn-icon rounded-md">
                  <Import size={15} />
                </button>
              </Tooltip>
              {folders.length === 0 && (
                <Tooltip label="Abrir carpeta">
                  <button onClick={openFolderDialog} aria-label="Abrir carpeta" className="ui-btn ui-btn-ghost ui-btn-icon rounded-md">
                    <FolderOpen size={15} />
                  </button>
                </Tooltip>
              )}
              {tabs.length > 1 && (
                <Tooltip label={allCollapsed ? 'Expandir carpetas' : 'Compactar: sólo carpetas'}>
                  <button onClick={toggleCompact} aria-label={allCollapsed ? 'Expandir carpetas' : 'Compactar carpetas'} aria-pressed={allCollapsed}
                    className={`ui-btn ui-btn-ghost ui-btn-icon rounded-md ${allCollapsed ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                    {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
                  </button>
                </Tooltip>
              )}
              {tabs.length > 1 && (
                <Tooltip label={openView.groupByFolder ? 'Lista plana' : 'Agrupar por carpeta'}>
                  <button onClick={() => openView.setGroupByFolder(!openView.groupByFolder)} aria-label="Agrupar por carpeta" aria-pressed={openView.groupByFolder}
                    className={`ui-btn ui-btn-ghost ui-btn-icon rounded-md ${openView.groupByFolder ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                    <FolderTree size={15} />
                  </button>
                </Tooltip>
              )}
              <Tooltip label="Colapsar barra lateral">
                <button onClick={() => setSidebarCollapsed(true)} aria-label="Colapsar barra lateral" className="ui-btn ui-btn-ghost ui-btn-icon rounded-md">
                  <PanelLeftClose size={15} />
                </button>
              </Tooltip>
            </div>
          </div>

          {(tabs.length > 6 || openView.filter) && (
            <div className="ui-input mx-2.5 mb-1 flex items-center gap-1.5 !py-1 !px-2 flex-shrink-0">
              <Filter size={12} className="text-on-surface-variant/50 flex-shrink-0" />
              <input value={openView.filter} onChange={(e) => openView.setFilter(e.target.value)} placeholder="Filtrar abiertos…" aria-label="Filtrar archivos abiertos"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); openView.setFilter('') } }}
                className="bg-transparent t-footnote text-on-surface outline-none placeholder:text-on-surface-variant/50 flex-1 min-w-0" />
              {openView.filter && (
                <button onClick={() => openView.setFilter('')} aria-label="Limpiar filtro" className="text-on-surface-variant/50 hover:text-on-surface">
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="mx-2.5 mb-1 px-2.5 py-1 rounded-lg flex items-center gap-2 flex-shrink-0 bg-primary/10">
              <span className="t-caption font-medium text-primary">
                {selectedIds.size}/2 seleccionados
              </span>
              {selectedIds.size === 2 && (
                <button onClick={sendSelectedToDiff} className="ui-btn ui-btn-ghost ui-btn-sm ml-auto gap-1">
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

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 px-2.5 flex flex-col gap-0.5">
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 pt-5 px-3 text-center select-none">
                <span className="w-9 h-9 rounded-xl bg-selected text-primary flex items-center justify-center">
                  <FileText size={18} />
                </span>
                <p className="t-footnote text-on-surface-variant/80">
                  No hay archivos abiertos.<br />Soltá un archivo acá o presioná
                  {' '}<kbd className="text-[11px] px-1.5 py-[1px] rounded-[5px] bg-on-surface/[0.06] font-sans font-medium">Ctrl+T</kbd>
                </p>
              </div>
            ) : openGroups.length === 0 ? (
              <p className="t-footnote text-on-surface-variant/80 px-2.5 py-2">Ningún archivo coincide con «{openView.filter}»</p>
            ) : (
              openGroups.map((group) => {
              const isCollapsed = isGroupCollapsed(group.key)
              const hasActive = group.items.some((t) => t.id === activeId)
              const dirtyCount = group.items.filter((t) => t.isDirty).length
              return (
              <div key={group.key} className="flex flex-col gap-0.5">
                {group.label && (
                  <button type="button" onClick={() => openView.toggleCollapsed(group.key)} title={group.title}
                    aria-expanded={!isCollapsed}
                    className={`group/fold flex items-center gap-1.5 w-full text-left rounded-md px-1.5 ${isCollapsed ? 'py-1' : 'pt-2 pb-0.5'} t-caption font-semibold select-none transition-colors hover:bg-on-surface/[0.04] ${
                      isCollapsed && hasActive ? 'text-primary' : 'text-on-surface-variant/80 hover:text-on-surface'}`}>
                    <ChevronRight size={10} className={`flex-shrink-0 transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`} />
                    {group.key === 'pinned' ? <Pin size={11} className="flex-shrink-0" /> : isCollapsed ? <Folder size={11} className="flex-shrink-0" /> : <FolderOpen size={11} className="flex-shrink-0" />}
                    <span className="truncate flex-1">{group.label}</span>
                    {dirtyCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" title={`${dirtyCount} sin guardar`} />}
                    {isCollapsed && <span className="tabular-nums font-normal text-on-surface-variant/60 flex-shrink-0">{group.items.length}</span>}
                  </button>
                )}
                {!isCollapsed && group.items.map((tab) => (
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
                    tab={tab} isActive={activeId === tab.id || (split.open && split.tab?.id === tab.id)}
                    isSelected={selectedIds.has(tab.id)}
                    pinned={openView.isPinned(tab)}
                    savedFlash={savedFlash && activeId === tab.id}
                    gitModified={tab.path !== null && gitModifiedPaths.has(tab.path)}
                    onClick={() => selectTab(tab.id)}
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
                ))}
              </div>
              )
              })
            )}
          </div>
        </div>

        {/* RECENT */}
        {recents.length > 0 && folders.length === 0 && (
          <div className="hairline-t flex-shrink-0">
            <div className="flex items-center justify-between pl-4 pr-2 pt-3 pb-1">
              <p className={SIDEBAR_SECTION}>Recientes</p>
              <Tooltip label="Limpiar recientes">
                <button
                  onClick={() => { void window.api.invoke('editor:recent-clear').then(() => setRecents([])) }}
                  aria-label="Limpiar recientes"
                  className="ui-btn ui-btn-ghost ui-btn-icon rounded-md"
                >
                  <Trash2 size={13} />
                </button>
              </Tooltip>
            </div>
            <div className="overflow-y-auto max-h-40 pb-2 px-2.5 flex flex-col gap-0.5">
              {recents.slice(0, 8).map((r) => (
                <button key={r.path} onClick={() => openFile(r.path)} title={r.path}
                  className="flex items-center gap-2.5 w-full px-2.5 h-[30px] rounded-lg text-left hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.05] transition-colors group">
                  {(() => { const lang = detectLanguage(r.name); const Icon = languageIcon(lang); return <Icon size={14} className="flex-shrink-0" style={{ color: langColor(lang) }} /> })()}
                  <span className="text-[13px] font-medium text-on-surface/75 group-hover:text-on-surface truncate flex-1">{r.name}</span>
                  <ArrowUpRight size={11} className="flex-shrink-0 text-on-surface-variant opacity-0 group-hover:opacity-70 transition-opacity" />
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
          <div className="absolute inset-y-0 left-[2px] w-[1px] opacity-0 group-hover:opacity-100 group-active:opacity-100 bg-primary/50 transition-opacity duration-150" />
        </div>
      )}

      {/* ── Main editor area ─────────────────────────────────────────────── */}
      <div className="fe-pane flex-1 flex flex-col overflow-hidden relative" style={editorPaneStyle} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

        {/* Tab bar + settings */}
        <div className={`flex items-stretch h-9 hairline-b fe-chrome flex-shrink-0 ${zenMode ? 'hidden' : ''}`}>
          {/* Archivo activo (los abiertos se listan sólo en la barra lateral) */}
          <div className="flex-1 min-w-0 flex items-center gap-2 pl-4 pr-2">
            {activeTab && (
              <>
                {(() => { const Icon = languageIcon(activeTab.language); return <Icon size={14} style={{ color: langColor(activeTab.language) }} /> })()}
                {activeTab.path
                  ? <Breadcrumb inline filePath={activeTab.path} onPathCopied={() => showToast('Ruta copiada', 'success', 2000)} />
                  : <span className="t-footnote font-semibold text-on-surface truncate">{activeTab.name}</span>}
                {activeTab.isDirty && <span title="Sin guardar" className="w-1.5 h-1.5 rounded-full bg-on-surface-variant flex-shrink-0" />}
              </>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-0.5 px-2 flex-shrink-0">
            {activeTab?.language === 'markdown' && (
              <Tooltip label={mdPreview ? 'Ocultar vista previa' : 'Vista previa de Markdown'}>
                <button onClick={() => setMdPreview((v) => !v)} aria-label="Vista previa de Markdown" aria-pressed={mdPreview}
                  className={`ui-btn ui-btn-ghost ui-btn-icon ${mdPreview ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                  <Eye size={15} />
                </button>
              </Tooltip>
            )}
            {tabs.length > 0 && (
              <Tooltip label={split.open ? 'Cerrar división' : 'Dividir'} shortcut="Ctrl+\">
                <button onClick={() => split.toggle()} aria-label="Dividir editor" aria-pressed={split.open}
                  className={`ui-btn ui-btn-ghost ui-btn-icon ${split.open ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                  <Columns2 size={15} />
                </button>
              </Tooltip>
            )}
            <Tooltip label="Apertura rápida" shortcut="Ctrl+P">
              <button onClick={() => setQuickOpen(true)} aria-label="Apertura rápida" className="ui-btn ui-btn-ghost ui-btn-icon">
                <FolderSearch size={15} />
              </button>
            </Tooltip>
            <Tooltip label="Buscar en archivos" shortcut="Ctrl+Shift+F">
              <button onClick={() => setShowFind((v) => !v)} aria-label="Buscar en archivos" aria-pressed={showFind}
                className={`ui-btn ui-btn-ghost ui-btn-icon ${showFind ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                <FileSearch size={15} />
              </button>
            </Tooltip>
            {activeTab && !isImagePath(activeTab.path) && (
              <Tooltip label="Formatear documento" shortcut="Shift+Alt+F">
                <button onClick={formatActive} aria-label="Formatear documento" className="ui-btn ui-btn-ghost ui-btn-icon">
                  <Wand2 size={15} />
                </button>
              </Tooltip>
            )}
            {activeTab?.path && (
              <Tooltip label="Historial local">
                <button onClick={() => setHistoryOpen(true)} aria-label="Historial local" aria-pressed={historyOpen}
                  className={`ui-btn ui-btn-ghost ui-btn-icon ${historyOpen ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                  <History size={15} />
                </button>
              </Tooltip>
            )}
            <HistorySheet
              open={historyOpen && !!activeTab?.path}
              tab={activeTab}
              onClose={() => setHistoryOpen(false)}
              onRestore={(content) => {
                if (!activeTab) return
                updateTab(activeTab.id, { content, isDirty: true })
                showToast('Versión restaurada en el editor (sin guardar)', 'success', 2500)
              }}
              onCompare={smartDiffEnabled && activeTab ? (label, content) => {
                setHistoryOpen(false)
                dispatch({
                  type: 'SEND_PAIR_TO_DIFF',
                  file1: { name: label, path: null, content },
                  file2: { name: activeTab.name, path: activeTab.path, content: activeTab.content },
                })
              } : undefined}
            />

            <div ref={themeMenuRef} className="relative flex">
              <Tooltip label="Tema del editor">
                <button onClick={() => { setThemeMenuOpen((v) => !v); setPreviewScheme(null) }} aria-label="Tema del editor"
                  aria-expanded={themeMenuOpen} aria-haspopup="dialog"
                  className={`ui-btn ui-btn-ghost ui-btn-icon ${themeMenuOpen ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                  <Palette size={15} />
                </button>
              </Tooltip>
              {themeMenuOpen && (
                <div role="dialog" aria-label="Tema del editor"
                  className="ui-menu absolute top-full right-0 mt-1.5 z-50 w-[440px] max-h-[70vh] overflow-y-auto !p-3">
                  <ThemeGrid
                    value={prefs.colorScheme}
                    editorTheme={prefs.editorTheme}
                    appDark={appDark}
                    columns={3}
                    onPreview={setPreviewScheme}
                    onChange={(id) => { pickScheme(id); setThemeMenuOpen(false) }}
                  />
                </div>
              )}
            </div>

            <Tooltip label="Ajustes del editor">
              <button onClick={() => setSettingsOpen(true)} aria-label="Ajustes del editor"
                className={`ui-btn ui-btn-ghost ui-btn-icon ${settingsOpen ? '!bg-on-surface/[0.08] !text-on-surface' : ''}`}>
                <SlidersHorizontal size={15} />
              </button>
            </Tooltip>

            <Sheet open={settingsOpen} onClose={() => { setSettingsOpen(false); setPreviewScheme(null) }} title="Ajustes del editor" width={360}>
                  <div className="flex flex-col gap-5">
                  <SettingsGroup title="Fuente">
                    <div className="flex flex-col p-1">
                      {FONT_FAMILIES.map((f) => (
                        <button key={f} onClick={() => updatePrefs({ fontFamily: f })}
                          className={`text-left t-body px-2.5 py-1 rounded-md transition-colors ${prefs.fontFamily === f ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-on-surface/[0.06]'}`}
                          style={{ fontFamily: `'${f}', monospace` }}>{f}</button>
                      ))}
                    </div>
                  </SettingsGroup>
                  <SettingsGroup>
                    <SettingsRow title="Tamaño">
                      <button onClick={() => updatePrefs({ fontSize: Math.max(FONT_SIZE_MIN, prefs.fontSize - 1) })} disabled={prefs.fontSize <= FONT_SIZE_MIN}
                        aria-label="Achicar fuente" className="ui-btn ui-btn-outline ui-btn-sm w-7 justify-center">−</button>
                      <span className="t-footnote text-on-surface tabular-nums w-12 text-center">{prefs.fontSize}px</span>
                      <button onClick={() => updatePrefs({ fontSize: Math.min(FONT_SIZE_MAX, prefs.fontSize + 1) })} disabled={prefs.fontSize >= FONT_SIZE_MAX}
                        aria-label="Agrandar fuente" className="ui-btn ui-btn-outline ui-btn-sm w-7 justify-center">+</button>
                    </SettingsRow>
                    <SettingsRow title="Modo">
                      <SegmentedControl
                        options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]}
                        value={prefs.editorTheme}
                        onChange={(t) => updatePrefs({ editorTheme: t })}
                      />
                    </SettingsRow>
                    <SettingsRow title="Autoguardado">
                      <Toggle checked={prefs.autoSave} onChange={(v) => updatePrefs({ autoSave: v })} label="Autoguardado" />
                    </SettingsRow>
                    <SettingsRow title="Fin de línea (archivos nuevos)">
                      <SegmentedControl
                        options={[{ value: 'crlf', label: 'CRLF' }, { value: 'lf', label: 'LF' }]}
                        value={prefs.defaultEol}
                        onChange={(v) => updatePrefs({ defaultEol: v })}
                      />
                    </SettingsRow>
                    <SettingsRow title="Minimapa">
                      <Toggle checked={prefs.minimap} onChange={(v) => updatePrefs({ minimap: v })} label="Minimapa" />
                    </SettingsRow>
                  </SettingsGroup>
                  {/* Color scheme */}
                  <div className="flex flex-col gap-1.5">
                    <p className="t-section px-3">Tema de color</p>
                    <ThemeGrid
                      value={prefs.colorScheme}
                      editorTheme={prefs.editorTheme}
                      appDark={appDark}
                      onPreview={setPreviewScheme}
                      onChange={pickScheme}
                    />
                  </div>
                  {/* Tail lines */}
                  <div className="flex flex-col gap-1">
                    <p className="t-section px-3">Líneas finales (archivos grandes)</p>
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
                      className="ui-input w-full"
                    />
                  </div>
                  </div>
            </Sheet>
          </div>
        </div>

        {/* Monitoring / log bar — only relevant for files that exist on disk */}
        {activeTab?.path && (
          <LogToolbar
            key={activeTab.id}
            tab={activeTab}
            logMode={activeLogMode}
            view={activeLogView}
            onViewChange={setActiveLogView}
            editorRef={editorRef}
            onToggleWatch={toggleWatch}
            onSetTail={(on) => updateTab(activeTab.id, { tailMode: on })}
            onToggleFreeze={toggleFreeze}
          />
        )}

        {/* Loading bar — feedback while a (possibly large/slow) file is being read */}
        {isOpening && (
          <div className="h-[2px] w-full overflow-hidden bg-primary/10 flex-shrink-0">
            <div className="h-full w-1/3 bg-primary fe-loading-bar" />
          </div>
        )}

        {/* Breadcrumb */}
        {/* (la ruta ahora vive en la barra superior del editor) */}

        {/* Binary warning — file has NUL bytes (other encodings like Windows-1252 are handled) */}
        {activeTab?.encodingWarning && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 hairline-b bg-warning/10 flex-shrink-0 t-footnote text-on-surface">
            <AlertTriangle size={14} className="flex-shrink-0 text-warning" />
            <span>Este archivo parece binario. Editarlo y guardarlo puede corromperlo.</span>
          </div>
        )}

        {/* Large-file truncation notice */}
        {activeTab?.truncated && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 hairline-b bg-warning/10 t-footnote text-on-surface flex-shrink-0">
            <AlertTriangle size={14} className="flex-shrink-0 text-warning" />
            Archivo grande: se muestran solo las últimas líneas.
            <button
              className="ui-btn ui-btn-outline ui-btn-sm ml-auto"
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
          <div className="flex items-center gap-2.5 px-3 py-1.5 hairline-b bg-error/10 flex-shrink-0 t-footnote text-on-surface">
            <AlertTriangle size={14} className="flex-shrink-0 text-error" />
            <span className="flex-1">Este archivo cambió en disco y tenés ediciones sin guardar.</span>
            <button
              className="ui-btn ui-btn-outline ui-btn-sm flex-shrink-0"
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
              className="ui-btn ui-btn-primary ui-btn-sm flex-shrink-0"
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
            <SplitLayout
              ratio={split.ratio}
              onRatioChange={split.setRatio}
              focused={split.focused}
              onFocusPane={split.setFocused}
              secondary={splitTab ? (
                <>
                  <SplitPaneHeader tabs={tabs} tab={splitTab} onPick={split.pick} onClose={split.close} />
                  <div className="flex-1 min-h-0 relative">
                    {isImagePath(splitTab.path) ? (
                      <ImagePreview key={`split-${splitTab.id}`} path={splitTab.path!} />
                    ) : (
                      <CodeEditor
                        key={`split-${splitTab.id}`}
                        content={splitTab.content}
                        language={refineLanguageFromContent(splitTab.language, splitTab.content)}
                        theme={editorThemeDef}
                        wordWrap={splitTab.wordWrap}
                        fontSize={prefs.fontSize}
                        fontFamily={prefs.fontFamily}
                        logMode={isLogFile(splitTab.name, splitTab.language, splitTab.watchActive)}
                        onChange={(val) => updateTab(splitTab.id, { content: val, isDirty: true })}
                        onSaveShortcut={() => { void saveTab(splitTab) }}
                        onNewFileShortcut={createNewFile}
                        editorRef={splitEditorRef}
                      />
                    )}
                  </div>
                </>
              ) : null}
            >
              {activeTab && isImagePath(activeTab.path) ? (
                <ImagePreview key={activeTab.id} path={activeTab.path!} />
              ) : activeTab ? (
                <div className="flex h-full">
                  <div className={mdPreview && activeTab.language === 'markdown' ? 'w-1/2 hairline-r min-w-0' : 'flex-1 min-w-0'}>
                    <CodeEditor
                      key={activeTab.id}
                      content={activeTab.content}
                      // The tab's icon (activeTab.language) is purely extension-based and stable.
                      // Highlighting can be smarter about ambiguous extensions (.cfg holding XML vs
                      // ini) without that ever touching the icon — computed separately, content-aware.
                      language={highlightLanguage}
                      theme={editorThemeDef}
                      wordWrap={activeTab.wordWrap}
                      fontSize={prefs.fontSize}
                      fontFamily={prefs.fontFamily}
                      gitDiff={gitDiff}
                      minimap={prefs.minimap}
                      onChange={(val) => { updateTab(activeTab.id, { content: val, isDirty: true }) }}
                      onCursorChange={(ln, col) => setCursor({ ln, col })}
                      onSelectionChange={(chars, lines) => setSelection({ chars, lines })}
                      onSaveShortcut={() => { void saveActive() }}
                      onNewFileShortcut={createNewFile}
                      onRenameShortcut={() => setRenamingTabId(activeTab.id)}
                      editorRef={editorRef}
                      logMode={activeLogMode}
                      logView={activeLogMode && isLogViewFiltered(activeLogView) ? activeLogView : null}
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
            </SplitLayout>

            {/* Drag overlay */}
            {isDragging && (
              <div className="absolute inset-2 z-20 pointer-events-none rounded-lg border-2 border-dashed border-primary/60 bg-surface/90 flex flex-col items-center justify-center gap-3">
                <FileInput size={36} className="text-primary" strokeWidth={1.5} />
                <p className="t-callout font-medium text-on-surface">Soltá un archivo o carpeta para abrir</p>
              </div>
            )}
          </div>

          {/* Zen mode — pill flotante para salir */}
          <AnimatePresence>
            {zenMode && (
              <motion.button
                onClick={() => setZenMode(false)}
                className="mac-popover hairline absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1 t-caption font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                title="Salir del modo Zen"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                Zen
                <kbd className="px-1 rounded hairline bg-surface font-mono">Ctrl+⇧+Z</kbd>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Flash de guardado — checkmark con spring */}
          <AnimatePresence>
            {savedFlash && (
              <motion.div
                className="mac-popover hairline absolute bottom-9 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1 t-caption font-medium text-on-surface pointer-events-none"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <CheckCircle2 size={13} className="text-success" />
                Guardado
              </motion.div>
            )}
          </AnimatePresence>

          {/* Find in files panel */}
          {showFind && (
            <FindInFiles folders={folders} openTabs={tabs} onOpenAt={openFileAtLine} onClose={() => setShowFind(false)} onReplaced={(p) => void handleFilesReplaced(p)} />
          )}

          {/* Status bar */}
          {activeTab && !zenMode && (
            <div className="flex items-center gap-3 px-3 h-6 hairline-t fe-chrome flex-shrink-0 select-none t-caption text-on-surface-variant tabular-nums">
              <span className="capitalize">{highlightLanguage}</span>
              <button onClick={() => editorRef.current?.openGotoLine()} title="Ir a línea (Ctrl+G)"
                className="hover:text-on-surface transition-colors">
                Lín {cursor.ln}, col {cursor.col}
              </button>
              {selection.chars > 0 && (
                <span className="text-on-surface">
                  {selection.chars} car. seleccionados{selection.lines > 1 ? ` · ${selection.lines} líneas` : ''}
                </span>
              )}
              <span>{lineCount} líneas</span>
              <span>{wordCount} palabras</span>
              <span>{(activeTab.size / 1024).toFixed(1)} KB</span>
              <button
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setEncodingMenu((m) => m ? null : { x: r.left, y: r.top }) }}
                title={activeTab.encodingWarning ? 'Parece un archivo binario — clic para cambiar codificación o fin de línea' : 'Codificación y fin de línea — clic para cambiar'}
                aria-haspopup="menu"
                aria-expanded={!!encodingMenu}
                className={`hover:text-on-surface transition-colors ${activeTab.encodingWarning ? 'text-warning' : ''}`}
              >
                {ENCODING_LABEL[writeOptions(activeTab).encoding]} · {writeOptions(activeTab).eol === 'crlf' ? 'CRLF' : 'LF'}
              </button>
              {activeTab.eolMixed && (
                <span className="text-warning" title="El archivo tenía saltos CRLF y LF mezclados: al guardar se unifican al indicado">EOL mixtos</span>
              )}
              {encodingMenu && (
                <>
                  <div className="fixed inset-0 z-[299]" onMouseDown={() => setEncodingMenu(null)} />
                  <div role="menu" aria-label="Codificación y fin de línea"
                    className="ui-menu fixed z-[300] min-w-[220px] flex flex-col"
                    style={{ left: encodingMenu.x, bottom: window.innerHeight - encodingMenu.y + 6 }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEncodingMenu(null) }}>
                    <p className="t-caption text-on-surface-variant px-2.5 pt-1 pb-0.5">Guardar con codificación…</p>
                    {(['utf8', 'utf8bom', 'windows1252', ...(activeTab.encoding === 'utf16le' || activeTab.encoding === 'utf16be' ? [activeTab.encoding] : [])] as FileEncoding[]).map((enc) => (
                      <button key={enc} role="menuitemradio" aria-checked={writeOptions(activeTab).encoding === enc}
                        onClick={() => setActiveEncoding(enc)} className="ui-menu-item w-full flex items-center gap-2 text-left">
                        <span className="w-3.5 flex-shrink-0">{writeOptions(activeTab).encoding === enc && <Check size={13} />}</span>
                        {ENCODING_LABEL[enc]}
                      </button>
                    ))}
                    <div className="hairline-t my-1" />
                    <p className="t-caption text-on-surface-variant px-2.5 pt-0.5 pb-0.5">Fin de línea</p>
                    {(['crlf', 'lf'] as EolKind[]).map((eol) => (
                      <button key={eol} role="menuitemradio" aria-checked={writeOptions(activeTab).eol === eol}
                        onClick={() => setActiveEol(eol)} className="ui-menu-item w-full flex items-center gap-2 text-left">
                        <span className="w-3.5 flex-shrink-0">{writeOptions(activeTab).eol === eol && <Check size={13} />}</span>
                        {eol === 'crlf' ? 'CRLF (Windows)' : 'LF (Unix/macOS)'}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {activeTab.isDirty && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant" />Sin guardar
                </span>
              )}

              {/* Actions */}
              <div className="ml-auto flex items-center gap-3 pointer-events-auto">
                {activeTab.path && (
                  <>
                    <button onClick={() => copyPath(activeTab.path!)} title="Copiar ruta"
                      className="flex items-center gap-1 hover:text-on-surface transition-colors">
                      <Copy size={11} />
                      Ruta
                    </button>
                    <button onClick={() => window.api.invoke('editor:reveal', activeTab.path!)} title="Mostrar en el explorador"
                      className="flex items-center gap-1 hover:text-on-surface transition-colors">
                      <FolderOpen size={11} />
                      Mostrar
                    </button>
                  </>
                )}
                <button onClick={toggleWrap} title="Alternar ajuste de línea" aria-pressed={activeTab.wordWrap}
                  className={`flex items-center gap-1 transition-colors ${activeTab.wordWrap ? 'text-on-surface' : 'hover:text-on-surface'}`}>
                  <WrapText size={11} />
                  Ajuste
                </button>
                {(activeTab.isDirty || activeTab.path === null) && (
                  <button onClick={saveActive} title={activeTab.path === null ? 'Guardar como (Ctrl+S)' : 'Guardar (Ctrl+S)'}
                    className="flex items-center gap-1 text-primary hover:opacity-80 transition-opacity font-medium">
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

      {/* ── Save-on-close confirmation ────────────────────────────────────── */}
      <Modal
        open={!!closeConfirm}
        onClose={() => closeConfirm?.resolve('cancel')}
        title="¿Guardar cambios?"
        width={400}
        closeOnBackdrop={false}
        footer={closeConfirm && (
          <>
            <button onClick={() => closeConfirm.resolve('discard')} className="ui-btn ui-btn-outline mr-auto">No guardar</button>
            <button onClick={() => closeConfirm.resolve('cancel')} className="ui-btn ui-btn-outline">Cancelar</button>
            <button onClick={() => closeConfirm.resolve('save')} className="ui-btn ui-btn-primary" autoFocus>Guardar</button>
          </>
        )}
      >
        {closeConfirm && (
          <p className="t-body text-on-surface-variant">
            ¿Querés guardar los cambios en <span className="font-medium text-on-surface">"{closeConfirm.name}"</span>? Si no los guardás, se van a perder.
          </p>
        )}
      </Modal>
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
      className="flex-1 bg-surface text-on-surface t-body px-1.5 py-0 rounded outline-none shadow-[0_0_0_2px_rgb(var(--c-primary)/0.5)] min-w-0" />
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
      <div className="flex items-center gap-1 mx-1.5 px-1.5 h-[30px] rounded-lg group cursor-pointer hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.05] transition-colors"
        onContextMenu={(e) => cb.onContextMenu(e, folder, folder.path)}>
        <button onClick={() => onToggle(folder.path)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
          <ChevronRight size={13} className="text-on-surface-variant/60 flex-shrink-0 transition-transform duration-150" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          {isOpen ? <FolderOpen size={14} className="text-primary flex-shrink-0" /> : <Folder size={14} className="text-primary flex-shrink-0" />}
          {cb.renaming === folder.path
            ? <InlineInput defaultValue={folder.name} onCommit={(n) => cb.onRenameCommit(folder.path, n)} onCancel={cb.onCancel} />
            : <span className="text-[13px] font-semibold text-on-surface truncate" title={folder.path}>{folder.name}</span>
          }
        </button>
        <button onClick={() => onClose(folder.path)} title="Cerrar carpeta" aria-label="Cerrar carpeta"
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant/60 hover:text-on-surface transition-opacity flex-shrink-0">
          <X size={12} />
        </button>
      </div>
      {isOpen && (
        <>
          {/* New file/folder inline input at top of root children */}
          {cb.creating?.parentPath === folder.path && (
            <div className="flex items-center gap-1 h-[26px]" style={{ paddingLeft: '26px', paddingRight: '8px' }}>
              {cb.creating.type === 'file' ? <FileText size={13} className="text-on-surface-variant flex-shrink-0" /> : <Folder size={13} className="text-primary flex-shrink-0" />}
              <InlineInput defaultValue="" onCommit={(n) => cb.onCreateCommit(folder.path, n, cb.creating!.type)} onCancel={cb.onCancel} />
            </div>
          )}
          {folder.children?.map((child) => <TreeNode key={child.path} node={child} depth={1} expanded={expanded} onToggle={onToggle} rootPath={folder.path} cb={cb} />)}
          {folder.children?.length === 0 && cb.creating?.parentPath !== folder.path && (
            <p className="t-caption text-on-surface-variant/60 px-7 py-1.5">Carpeta vacía</p>
          )}
          {folder.truncated && <p className="t-caption text-on-surface-variant/60 px-7 py-1">Mostrando los primeros 200 archivos</p>}
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
        className="relative flex items-center gap-1.5 h-[28px] mx-1.5 rounded-lg cursor-default hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.05] group transition-colors"
        style={{ paddingLeft: `${2 + indent}px`, paddingRight: '6px' }}>
        {/* Indent guide lines — one vertical hairline per ancestor level */}
        {Array.from({ length: depth }).map((_, d) => (
          <span key={d} aria-hidden style={{
            position: 'absolute', top: 0, bottom: 0, width: 1,
            left: `${2 + d * 10 + 5}px`,
            background: 'var(--hairline)',
            pointerEvents: 'none',
          }} />
        ))}
        {node.isDir
          ? <ChevronRight size={13} className="text-on-surface-variant/40 flex-shrink-0 transition-transform duration-150" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          : <span className="flex-shrink-0" style={{ width: '13px' }} />
        }
        {node.isDir
          ? (isOpen ? <FolderOpen size={14} className="text-primary flex-shrink-0" /> : <Folder size={14} className="text-primary flex-shrink-0" />)
          : (() => { const lang = detectLanguage(node.name); const Icon = languageIcon(lang); return <Icon size={13} className="flex-shrink-0" style={{ color: langColor(lang) }} /> })()
        }
        {cb.renaming === node.path
          ? <InlineInput defaultValue={node.name} onCommit={(n) => cb.onRenameCommit(node.path, n)} onCancel={cb.onCancel} />
          : <span className="text-[13px] text-on-surface/85 group-hover:text-on-surface truncate flex-1">{node.name}</span>
        }
        {node.isDir && !isOpen && (node.children?.length ?? 0) > 0 && (
          <Badge className="ml-auto group-hover:opacity-100 opacity-60">{node.children!.length}</Badge>
        )}
      </div>

      {node.isDir && isOpen && (
        <>
          {/* Inline create input inside this directory */}
          {cb.creating?.parentPath === node.path && (
            <div className="flex items-center gap-1 h-[26px]" style={{ paddingLeft: `${8 + (depth + 1) * 10 + 14}px`, paddingRight: '8px' }}>
              {cb.creating.type === 'file' ? <FileText size={13} className="text-on-surface-variant flex-shrink-0" /> : <Folder size={13} className="text-primary flex-shrink-0" />}
              <InlineInput defaultValue="" onCommit={(n) => cb.onCreateCommit(node.path, n, cb.creating!.type)} onCancel={cb.onCancel} />
            </div>
          )}
          {node.children?.map((child) => <TreeNode key={child.path} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} rootPath={rootPath} cb={cb} />)}
          {node.truncated && <p className="t-caption text-on-surface-variant/60 py-0.5" style={{ paddingLeft: `${8 + (depth + 1) * 10 + 14}px` }}>…más archivos no mostrados</p>}
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
        aria-label="Expandir barra lateral"
        className="flex-shrink-0 flex items-center justify-center h-10 hairline-b text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.04] transition-colors"
      >
        <PanelLeft size={15} />
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1.5 flex flex-col items-center gap-0.5">
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
              className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${isActive ? 'bg-selected' : 'hover:bg-on-surface/[0.04]'}`}
            >
              <Icon size={15} style={{ color: langColor(tab.language) }} />
              {tab.isDirty && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-on-surface-variant" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Encabezado de sección de la barra lateral (mismo estilo que la barra de la app). */
const SIDEBAR_SECTION = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant/70'

function FileListItem({
 tab, isActive, isSelected = false, pinned = false, savedFlash = false, gitModified = false, onClick, onCtrlClick, onClose, onSave, onContextMenu, renaming, onRenameCommit, onRenameCancel, onDragStart: onDragStartProp, onDragEnd: onDragEndProp }: {
  tab: OpenFile; isActive: boolean; isSelected?: boolean; pinned?: boolean; savedFlash?: boolean; gitModified?: boolean
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
      title={`${tab.name}${tab.path ? `\n${tab.path}` : ''}\nCtrl+clic para seleccionar · Arrastrá para reordenar · Compará desde el menú contextual o Smart Diff`}
      className={`flex items-center gap-2.5 w-full max-w-full h-[30px] px-2.5 rounded-lg cursor-default group overflow-hidden transition-colors duration-100 ${
        isSelected
          ? 'bg-primary/[0.14] ring-1 ring-inset ring-primary/30 text-on-surface'
          : isActive
            ? 'bg-selected text-on-surface'
            : 'text-on-surface/75 hover:bg-on-surface/[0.04] dark:hover:bg-white/[0.05] hover:text-on-surface'
      }`}>
      {(() => { const Icon = languageIcon(tab.language); return <Icon size={14} className="flex-shrink-0" style={{ color: langColor(tab.language) }} /> })()}
      {renaming ? (
        <InlineInput defaultValue={tab.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      ) : (
        <span className={`text-[13px] truncate flex-1 ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.name}</span>
      )}
      {pinned && <Pin size={11} aria-label="Fijado" className="text-on-surface-variant flex-shrink-0" />}
      {tab.watchActive && !tab.frozen && <span title="Monitoreando" className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />}
      {gitModified && !tab.isDirty && (
        <span title="Cambios git sin commitear" className="t-caption font-semibold text-warning flex-shrink-0">M</span>
      )}
      {savedFlash
        ? <CheckCircle2 size={12} className="text-success flex-shrink-0" style={{ animation: 'fe-saved-pop 0.2s ease both' }} />
        : tab.isDirty && <span title="Sin guardar" className="w-1.5 h-1.5 rounded-full bg-on-surface-variant flex-shrink-0" />}
      {!renaming && (tab.isDirty || tab.path === null) && isActive && (
        <button onClick={(e) => { e.stopPropagation(); onSave() }} title="Guardar" aria-label="Guardar"
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-opacity flex-shrink-0">
          <Save size={12} />
        </button>
      )}
      {!renaming && (
        <button onClick={(e) => { e.stopPropagation(); onClose() }} title="Cerrar" aria-label="Cerrar"
          className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-on-surface transition-opacity flex-shrink-0">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function EmptyState({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full gap-5 text-center select-none px-6 bg-surface"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
    >
      <FileText size={44} className="text-on-surface-variant/40" strokeWidth={1.2} />

      <div>
        <p className="t-headline text-on-surface">Ningún archivo abierto</p>
        <p className="t-footnote text-on-surface-variant mt-1">
          Soltá un archivo o carpeta acá o usá los atajos para navegar
        </p>
      </div>

      <button onClick={onOpen} className="ui-btn ui-btn-primary">
        <Import size={14} />Abrir archivo
      </button>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 t-footnote text-on-surface-variant">
        {([
          ['Ctrl+O', 'Abrir archivo'],
          ['Ctrl+P', 'Apertura rápida'],
          ['Ctrl+T', 'Nuevo archivo'],
          ['Ctrl+⇧+F', 'Buscar en archivos'],
        ] as const).map(([key, label]) => (
          <span key={key} className="flex items-center gap-2">
            <kbd className="hairline bg-on-surface/[0.04] px-1.5 py-px rounded t-caption font-mono text-on-surface-variant flex-shrink-0">{key}</kbd>
            <span>{label}</span>
          </span>
        ))}
      </div>
    </motion.div>
  )
}
