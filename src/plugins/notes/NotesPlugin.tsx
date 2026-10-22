import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, BellRing, CalendarDays, Check, ChevronDown, Copy, Eye, FolderCog, FolderOpen, MoreHorizontal, NotebookPen, PenLine, Pin,
  PinOff, Plus, Search, Trash2, X,
} from 'lucide-react'
import { useApp, usePluginIntent } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { EmptyState } from '../../core/components/EmptyState'
import { matchesQuery } from '../../core/search'
import { listItemMotion, shouldAnimateList } from '../../core/motion'
import { MarkdownPreview } from '../file-editor/components/MarkdownPreview'
import { migrateEditorBuffers } from './migration'
import type { NoteContent, NoteMeta } from './types'
import { NoteLinks, findByTitle, linkifyWikiLinks } from './NoteLinks'
import { ReminderDialog, formatReminder } from './ReminderDialog'
import { clearReminder, setReminder, useReminderMap } from './reminders'

const AUTOSAVE_MS = 600

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

// StrictMode runs effects twice in dev — keep the one-time migration a singleton.
let migrationPromise: Promise<number> | null = null

const api = {
  list: () => window.api.invoke<NoteMeta[]>('notes:list'),
  read: (id: string) => window.api.invoke<NoteContent>('notes:read', id),
  write: (id: string | null, content: string) => window.api.invoke<NoteMeta>('notes:write', id, content),
  remove: (id: string) => window.api.invoke('notes:delete', id),
  setPinned: (id: string, pinned: boolean) => window.api.invoke('notes:set-pinned', id, pinned),
  today: () => window.api.invoke<NoteMeta>('notes:today'),
  getDir: () => window.api.invoke<string>('notes:get-dir'),
  chooseDir: () => window.api.invoke<string | null>('notes:choose-dir'),
  reveal: (id?: string) => window.api.invoke('notes:reveal', id),
}

function sortNotes(list: NoteMeta[]): NoteMeta[] {
  return [...list].sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1))
}

function formatRowDate(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  if (now.getTime() - ms < 6 * 86_400_000) return d.toLocaleDateString('es-AR', { weekday: 'long' })
  return d.toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

function formatLongDate(ms: number): string {
  return new Date(ms).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

interface MenuState { id: string; x: number; y: number }

export function NotesPlugin(): JSX.Element {
  const { state } = useApp()
  const { show: notify } = useToast()
  const confirm = useConfirm()

  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [query, setQuery] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [preview, setPreview] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dir, setDir] = useState('')
  const [collapsed, setCollapsed] = useState<{ pinned: boolean; others: boolean }>({ pinned: false, others: false })
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [reminderFor, setReminderFor] = useState<string | null>(null)
  const reminders = useReminderMap()

  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Live refs so async flushes never write stale content into the wrong note.
  const selectedRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef<Promise<void> | null>(null)

  const upsertMeta = useCallback((meta: NoteMeta) => {
    setNotes((prev) => sortNotes([meta, ...prev.filter((n) => n.id !== meta.id)]))
  }, [])

  const refresh = useCallback(async () => {
    try {
      setNotes(await api.list())
    } catch (err) {
      notify(`No pudimos leer las notas: ${errMsg(err)}`, 'error')
    } finally {
      setLoaded(true)
    }
  }, [notify])

  // ── Saving ────────────────────────────────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (savingRef.current) await savingRef.current
    const id = selectedRef.current
    if (!id || !dirtyRef.current) return
    const text = contentRef.current
    dirtyRef.current = false
    setSaveState('saving')
    const p = (async () => {
      try {
        const meta = await api.write(id, text)
        upsertMeta(meta)
        setSaveState(dirtyRef.current ? 'dirty' : 'saved')
      } catch (err) {
        dirtyRef.current = true
        setSaveState('error')
        notify(`No se pudo guardar la nota: ${errMsg(err)}`, 'error')
      }
    })()
    savingRef.current = p
    await p
    savingRef.current = null
  }, [notify, upsertMeta])

  const onChange = (text: string): void => {
    setContent(text)
    contentRef.current = text
    dirtyRef.current = true
    setSaveState('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flush() }, AUTOSAVE_MS)
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  const focusEditorEnd = (): void => {
    requestAnimationFrame(() => {
      const el = editorRef.current
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
    })
  }

  const openNote = useCallback(async (id: string, focusEditor = false): Promise<void> => {
    await flush()
    try {
      const res = await api.read(id)
      selectedRef.current = id
      contentRef.current = res.content
      dirtyRef.current = false
      setSelectedId(id)
      setContent(res.content)
      setSaveState('idle')
      upsertMeta(res.meta)
      if (focusEditor) { setPreview(false); focusEditorEnd() }
    } catch (err) {
      notify(`No se pudo abrir la nota: ${errMsg(err)}`, 'error')
      void refresh()
    }
  }, [flush, refresh, notify, upsertMeta])

  const createNote = useCallback(async (initial = ''): Promise<void> => {
    await flush()
    try {
      const meta = await api.write(null, initial)
      upsertMeta(meta)
      setQuery('')
      await openNote(meta.id, true)
    } catch (err) {
      notify(`No se pudo crear la nota: ${errMsg(err)}`, 'error')
    }
  }, [flush, openNote, notify, upsertMeta])

  /** [[Título]]: abre la nota con ese título o la crea si no existe. */
  const openByTitle = useCallback(async (title: string): Promise<void> => {
    const found = findByTitle(notes, title)
    if (found) { setQuery(''); setTagFilter(null); await openNote(found.id); return }
    await createNote(`# ${title}

`)
  }, [notes, openNote, createNote])

  const openToday = useCallback(async (): Promise<void> => {
    try {
      const meta = await api.today()
      upsertMeta(meta)
      setQuery('')
      await openNote(meta.id, true)
    } catch (err) {
      notify(`No se pudo abrir la nota del día: ${errMsg(err)}`, 'error')
    }
  }, [openNote, notify, upsertMeta])

  // ── Initial load + one-time migration ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        migrationPromise ??= migrateEditorBuffers((text) => api.write(null, text))
        const n = await migrationPromise
        if (n > 0 && !cancelled) notify(n === 1 ? 'Importamos 1 nota del editor' : `Importamos ${n} notas del editor`, 'success')
      } catch (err) {
        migrationPromise = null
        console.warn('[notes] falló la importación de buffers del editor', err)
      }
      if (cancelled) return
      await refresh()
      api.getDir().then(setDir).catch(() => { /* ignore */ })
    })()
    return () => { cancelled = true }
  }, [refresh, notify])

  // Select the first note once the list is loaded and nothing is selected
  useEffect(() => {
    if (!loaded || selectedRef.current || notes.length === 0) return
    const first = notes[0]
    if (first) void openNote(first.id)
  }, [loaded, notes, openNote])

  // ── Intents ───────────────────────────────────────────────────────────────
  // Otra máquina cambió notas: recargar la lista y, si la abierta no tiene cambios
  // sin guardar, también su contenido.
  useEffect(() => window.api.on('sync:changed', (p) => {
    if (!(p as { notes?: boolean } | undefined)?.notes) return
    void refresh()
    const id = selectedRef.current
    if (id && !dirtyRef.current) {
      api.read(id).then((res) => {
        if (selectedRef.current !== id || dirtyRef.current) return
        contentRef.current = res.content
        setContent(res.content)
      }, () => undefined)
    }
  }), [refresh])

  usePluginIntent('notes', (intent) => {
    if (intent.action === 'new') {
      const payload = intent.payload as { content?: string } | undefined
      void createNote(typeof payload?.content === 'string' ? payload.content : '')
    } else if (intent.action === 'open' && typeof intent.payload === 'string') {
      setQuery('')
      void openNote(intent.payload, true)
    } else if (intent.action === 'today') {
      void openToday()
    }
  })

  // Save when switching app tabs, on window blur and before unload / unmount
  useEffect(() => { void flush() }, [state.activeTabId, flush])
  useEffect(() => {
    const onBlur = (): void => { void flush() }
    window.addEventListener('blur', onBlur)
    window.addEventListener('beforeunload', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('beforeunload', onBlur)
      void flush()
    }
  }, [flush])

  // "Guardado" fades back to idle
  useEffect(() => {
    if (saveState !== 'saved') return
    const t = setTimeout(() => setSaveState('idle'), 1800)
    return () => clearTimeout(t)
  }, [saveState])

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const byTag = tagFilter ? notes.filter((n) => n.tags.includes(tagFilter)) : notes
    return query.trim() ? byTag.filter((n) => matchesQuery(query.trim(), n.title, n.preview, n.id, n.tags.join(' '))) : byTag
  }, [notes, query, tagFilter])
  // Etiquetas por uso (las más usadas primero).
  const allTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const n of notes) for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [notes])
  const pinned = filtered.filter((n) => n.pinned)
  const others = filtered.filter((n) => !n.pinned)
  const selected = notes.find((n) => n.id === selectedId) ?? null

  const clearSelection = (): void => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    selectedRef.current = null
    dirtyRef.current = false
    setSelectedId(null)
    setContent('')
  }

  // Selected note vanished from the list (deleted outside the app, folder changed)
  useEffect(() => {
    if (loaded && selectedId && !notes.some((n) => n.id === selectedId)) clearSelection()
  })

  // ── Actions ───────────────────────────────────────────────────────────────
  const togglePin = async (note: NoteMeta): Promise<void> => {
    try {
      await api.setPinned(note.id, !note.pinned)
      upsertMeta({ ...note, pinned: !note.pinned })
    } catch (err) {
      notify(`No se pudo ${note.pinned ? 'desfijar' : 'fijar'}: ${errMsg(err)}`, 'error')
    }
  }

  const deleteNote = async (note: NoteMeta): Promise<void> => {
    const ok = await confirm({
      title: `¿Eliminar «${note.title}»?`,
      message: 'El archivo se mueve a la papelera del sistema.',
      confirmLabel: 'Eliminar',
      destructive: true,
    })
    if (!ok) return
    try {
      const wasSelected = selectedRef.current === note.id
      if (wasSelected) clearSelection()
      await api.remove(note.id)
      clearReminder(note.id)
      const ordered = [...filtered.filter((n) => n.pinned), ...filtered.filter((n) => !n.pinned)]
      const idx = ordered.findIndex((n) => n.id === note.id)
      const rest = notes.filter((n) => n.id !== note.id)
      setNotes(rest)
      if (wasSelected) {
        const remaining = ordered.filter((n) => n.id !== note.id)
        const next = remaining[Math.min(Math.max(0, idx), remaining.length - 1)] ?? rest[0]
        if (next) void openNote(next.id)
      }
      notify('Nota eliminada', 'success')
    } catch (err) {
      notify(`No se pudo eliminar: ${errMsg(err)}`, 'error')
      void refresh()
    }
  }

  const copyContent = async (note: NoteMeta): Promise<void> => {
    try {
      const text = note.id === selectedRef.current ? contentRef.current : (await api.read(note.id)).content
      await navigator.clipboard.writeText(text)
      notify('Contenido copiado', 'success')
    } catch (err) {
      notify(`No se pudo copiar: ${errMsg(err)}`, 'error')
    }
  }

  const reveal = (note?: NoteMeta): void => {
    void flush()
      .then(() => api.reveal(note?.id))
      .catch((err: unknown) => notify(`No se pudo abrir la carpeta: ${errMsg(err)}`, 'error'))
  }

  const chooseDir = async (): Promise<void> => {
    await flush()
    try {
      const chosen = await api.chooseDir()
      if (!chosen) return
      setDir(chosen)
      clearSelection()
      await refresh()
      notify('Carpeta de notas actualizada', 'success')
    } catch (err) {
      notify(`No se pudo cambiar la carpeta: ${errMsg(err)}`, 'error')
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const moveSelection = useCallback((delta: number) => {
    const ordered = [...filtered.filter((n) => n.pinned), ...filtered.filter((n) => !n.pinned)]
    if (ordered.length === 0) return
    const idx = ordered.findIndex((n) => n.id === selectedRef.current)
    const next = ordered[idx < 0 ? 0 : Math.min(ordered.length - 1, Math.max(0, idx + delta))]
    if (next && next.id !== selectedRef.current) {
      void openNote(next.id)
      requestAnimationFrame(() => {
        listRef.current?.querySelector(`[data-note-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' })
      })
    }
  }, [filtered, openNote])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const root = rootRef.current
      if (!root || root.offsetParent === null) return // our tab is hidden
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'n') { e.preventDefault(); void createNote() }
      else if (k === 'f') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select() }
      else if (k === 's') { e.preventDefault(); void flush() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createNote, flush])

  const onListKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
    else if (e.key === 'Enter' && selectedRef.current) { e.preventDefault(); setPreview(false); focusEditorEnd() }
  }

  // Close the context menu on outside click / Esc
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const menuNote = menu ? notes.find((n) => n.id === menu.id) : undefined

  // ── Render ────────────────────────────────────────────────────────────────
  const rowMotion = listItemMotion(shouldAnimateList(filtered.length))
  const renderRow = (note: NoteMeta): JSX.Element => {
    const active = note.id === selectedId
    return (
      <motion.button
        {...rowMotion}
        key={note.id}
        type="button"
        role="option"
        aria-selected={active}
        data-note-id={note.id}
        onClick={() => { void openNote(note.id) }}
        onDoubleClick={() => { setPreview(false); focusEditorEnd() }}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ id: note.id, x: e.clientX, y: e.clientY }) }}
        onKeyDown={onListKey}
        className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45 ${
          active ? 'bg-selected' : 'hover:bg-on-surface/3 dark:hover:bg-white/4'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {note.pinned && (
            <Pin size={12} weight="fill" className={`shrink-0 ${active ? 'text-primary' : 'text-on-surface-variant/70'}`} aria-label="Fijada" />
          )}
          <span className={`text-[13px] truncate flex-1 ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface/90'}`}>{note.title}</span>
          {reminders.has(note.id) && (
            <Bell size={11} weight="fill" className="shrink-0 text-primary" aria-label={`Recordatorio ${formatReminder(reminders.get(note.id)!.at)}`} />
          )}
          <span className="t-caption text-on-surface-variant/70 shrink-0 first-letter:uppercase">{formatRowDate(note.updatedAt)}</span>
        </div>
        <p className="t-footnote text-on-surface-variant/80 truncate mt-0.5">{note.preview || 'Sin texto adicional'}</p>
      </motion.button>
    )
  }

  return (
    <div ref={rootRef} className="flex h-full w-full overflow-hidden bg-background">
      {/* ── List pane ── */}
      <aside className="pane-list shrink-0 flex flex-col hairline-r">
        <div className="px-3 pt-4 pb-2 space-y-3">
          <div className="flex items-center gap-2 pl-1.5">
            <h2 className="t-headline text-on-surface">Notas</h2>
            <span className="t-caption font-medium tabular-nums text-on-surface-variant/70">{notes.length}</span>
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg"
                onClick={() => { void openToday() }}
                title="Abrir la nota de hoy"
                aria-label="Abrir la nota de hoy"
              >
                <CalendarDays size={16} />
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-icon rounded-lg"
                onClick={() => { void createNote() }}
                title="Nueva nota (Ctrl+N)"
                aria-label="Nueva nota"
              >
                <Plus size={15} weight="bold" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pointer-events-none" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') }
                else onListKey(e)
              }}
              placeholder="Buscar notas (Ctrl+F)"
              aria-label="Buscar notas"
              className="ui-input w-full h-8 pl-8"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por etiqueta">
              {allTags.slice(0, 14).map((t) => {
                const on = tagFilter === t
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTagFilter(on ? null : t)}
                    className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-[6px] text-[11px] font-medium transition-colors ${
                      on ? 'bg-primary text-on-primary' : 'bg-on-surface/6 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface'
                    }`}
                  >
                    #{t}
                    {on && <X size={10} weight="bold" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <motion.div layoutScroll ref={listRef} className="flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="Notas">
          {loaded && filtered.length === 0 && (
            <EmptyState compact icon={query || tagFilter ? Search : NotebookPen}
              title={query || tagFilter ? 'Sin resultados' : 'Todavía no hay notas'}
              description={query ? `Ninguna nota coincide con «${query}».` : tagFilter ? `No hay notas con #${tagFilter}.` : 'Creá una con Ctrl+N.'} />
          )}
          {pinned.length > 0 && (
            <>
              <SectionHeader
                label="Fijadas"
                count={pinned.length}
                collapsed={collapsed.pinned}
                onToggle={() => setCollapsed((c) => ({ ...c, pinned: !c.pinned }))}
              />
              {!collapsed.pinned && (
                <div className="relative space-y-0.5">
                  <AnimatePresence initial={false} mode="popLayout">{pinned.map(renderRow)}</AnimatePresence>
                </div>
              )}
            </>
          )}
          {others.length > 0 && (
            <>
              {pinned.length > 0 && (
                <SectionHeader
                  label="Notas"
                  count={others.length}
                  collapsed={collapsed.others}
                  onToggle={() => setCollapsed((c) => ({ ...c, others: !c.others }))}
                />
              )}
              {!(pinned.length > 0 && collapsed.others) && (
                <div className={`relative space-y-0.5 ${pinned.length > 0 ? '' : 'pt-1'}`}>
                  <AnimatePresence initial={false} mode="popLayout">{others.map(renderRow)}</AnimatePresence>
                </div>
              )}
            </>
          )}
        </motion.div>

        <div className="hairline-t px-3 h-10 flex items-center gap-1 shrink-0">
          <span className="t-caption text-on-surface-variant/80 truncate flex-1" title={dir}>
            {notes.length === 1 ? '1 nota' : `${notes.length} notas`}
          </span>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => reveal()} title="Abrir la carpeta de notas" aria-label="Abrir la carpeta de notas">
            <FolderOpen size={14} />
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-icon"
            onClick={() => { void chooseDir() }}
            title={dir ? `Cambiar carpeta de notas (${dir})` : 'Cambiar carpeta de notas'}
            aria-label="Cambiar carpeta de notas"
          >
            <FolderCog size={14} />
          </button>
        </div>
      </aside>

      {/* ── Editor pane ── */}
      <section className="flex-1 min-w-0 flex flex-col overflow-y-auto">
        {selected ? (
          <div className="pane-detail flex-1 flex flex-col">
          <article className="flex-1 flex flex-col bg-surface hairline rounded-2xl shadow-sm">
            <header className="sticky top-0 z-10 flex items-center gap-2 pl-6 pr-3 h-12 shrink-0 hairline-b bg-surface rounded-t-2xl">
              {selected.pinned && (
                <span className="inline-flex items-center gap-1 h-[20px] px-2 rounded-[6px] bg-primary/10 text-primary text-[11px] font-medium shrink-0">
                  <Pin size={11} weight="fill" /> Fijada
                </span>
              )}
              {reminders.has(selected.id) && (
                <button
                  type="button"
                  onClick={() => setReminderFor(selected.id)}
                  title="Cambiar recordatorio"
                  className="inline-flex items-center gap-1 h-[20px] px-2 rounded-[6px] bg-primary/10 text-primary text-[11px] font-medium shrink-0 hover:bg-primary/16"
                >
                  <BellRing size={11} weight="fill" /> {formatReminder(reminders.get(selected.id)!.at)}
                </button>
              )}
              <span className="t-footnote text-on-surface-variant truncate flex-1">Editada el {formatLongDate(selected.updatedAt)}</span>
              <span className="t-footnote text-on-surface-variant whitespace-nowrap" aria-live="polite">
                {saveState === 'saving' && 'Guardando…'}
                {saveState === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-success" style={{ animation: 'fadeIn 0.15s ease both' }}>
                    <Check size={12} weight="bold" style={{ animation: 'fe-saved-pop 0.35s var(--ease-spring) both' }} /> Guardado
                  </span>
                )}
                {saveState === 'error' && <span className="text-error">Sin guardar</span>}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-icon"
                  onClick={() => { void togglePin(selected) }}
                  title={selected.pinned ? 'Desfijar' : 'Fijar'}
                  aria-label={selected.pinned ? 'Desfijar nota' : 'Fijar nota'}
                  aria-pressed={selected.pinned}
                >
                  {selected.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-icon"
                  onClick={() => { void flush(); setPreview((p) => !p) }}
                  title={preview ? 'Editar' : 'Vista previa de Markdown'}
                  aria-label={preview ? 'Editar' : 'Vista previa de Markdown'}
                  aria-pressed={preview}
                >
                  {preview ? <PenLine size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-icon"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    setMenu(menu ? null : { id: selected.id, x: r.right - 200, y: r.bottom + 4 })
                  }}
                  title="Más acciones"
                  aria-label="Más acciones"
                  aria-haspopup="menu"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
            </header>

            <div className="flex-1 flex flex-col">
              {preview ? (
                <div
                  className="px-12 py-10"
                  onClick={(e) => {
                    const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-note-link]')
                    if (!a) return
                    e.preventDefault()
                    void openByTitle(a.dataset.noteLink ?? '')
                  }}
                >
                  <MarkdownPreview content={linkifyWikiLinks(content)} />
                </div>
              ) : (
                <div className="px-12 py-10 flex-1 flex flex-col">
                  <textarea
                    ref={editorRef}
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={() => { void flush() }}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                        e.preventDefault()
                        const el = e.currentTarget
                        const s = el.selectionStart
                        const end = el.selectionEnd
                        onChange(`${el.value.slice(0, s)}  ${el.value.slice(end)}`)
                        requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
                      }
                    }}
                    spellCheck
                    placeholder="Empezá a escribir… La primera línea es el título."
                    aria-label="Contenido de la nota"
                    className="w-full flex-1 min-h-[55vh] resize-none bg-transparent border-0 outline-hidden text-[15px] leading-[1.7] text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
              )}
              <NoteLinks note={selected} notes={notes} onOpenTitle={(t) => { void openByTitle(t) }} />
            </div>
          </article>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            {loaded && (
              <EmptyState
                icon={NotebookPen}
                title={notes.length === 0 ? 'Todavía no tenés notas' : 'Elegí una nota'}
                description={notes.length === 0
                  ? 'Las notas se guardan como archivos Markdown en tu carpeta de notas.\nCtrl+N crea una nueva; Ctrl+Shift+Espacio captura algo desde cualquier lado.'
                  : 'Seleccioná una nota de la lista o creá una nueva con Ctrl+N.'}
                action={
                  <div className="flex items-center gap-2">
                    <button type="button" className="ui-btn ui-btn-primary" onClick={() => { void createNote() }}><Plus size={14} /> Nueva nota</button>
                    <button type="button" className="ui-btn ui-btn-outline" onClick={() => { void openToday() }}><CalendarDays size={14} /> Nota de hoy</button>
                  </div>
                }
              />
            )}
          </div>
        )}
      </section>

      <ReminderDialog
        open={!!reminderFor}
        noteTitle={notes.find((n) => n.id === reminderFor)?.title ?? ''}
        current={reminderFor ? reminders.get(reminderFor)?.at : undefined}
        onClose={() => setReminderFor(null)}
        onSet={(at) => {
          const n = notes.find((x) => x.id === reminderFor)
          if (n) {
            setReminder({ noteId: n.id, title: n.title, at })
            notify(`Te recuerdo «${n.title}» ${formatReminder(at)}`, 'success')
          }
          setReminderFor(null)
        }}
        onClear={() => { if (reminderFor) clearReminder(reminderFor); setReminderFor(null) }}
      />

      {/* ── Context menu ── */}
      {menu && menuNote && (
        <div
          role="menu"
          className="ui-menu fixed z-400 w-[200px] mac-pop-in"
          style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 210)), top: Math.min(menu.y, window.innerHeight - 180) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MenuItem icon={menuNote.pinned ? PinOff : Pin} label={menuNote.pinned ? 'Desfijar' : 'Fijar'} onClick={() => { setMenu(null); void togglePin(menuNote) }} />
          <MenuItem icon={Copy} label="Copiar contenido" onClick={() => { setMenu(null); void copyContent(menuNote) }} />
          <MenuItem icon={Bell} label={reminders.has(menuNote.id) ? 'Cambiar recordatorio…' : 'Recordarme…'} onClick={() => { setMenu(null); setReminderFor(menuNote.id) }} />
          <MenuItem icon={FolderOpen} label="Mostrar en la carpeta" onClick={() => { setMenu(null); reveal(menuNote) }} />
          <div className="my-1 hairline-t" />
          <MenuItem icon={Trash2} label="Eliminar…" danger onClick={() => { setMenu(null); void deleteNote(menuNote) }} />
        </div>
      )}
    </div>
  )
}

function SectionHeader({ label, count, collapsed, onToggle }: {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="group w-full flex items-center gap-1 px-2.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant/70 hover:text-on-surface-variant transition-colors"
    >
      <ChevronDown size={11} weight="bold" className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} />
      <span>{label}</span>
      <span className="ml-auto font-medium tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{count}</span>
    </button>
  )
}

function MenuItem({
 icon: Icon, label, onClick, danger }: {
  icon: typeof Pin
  label: string
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`ui-menu-item w-full text-left ${danger ? 'text-error' : ''}`}>
      <Icon size={14} />
      {label}
    </button>
  )
}
