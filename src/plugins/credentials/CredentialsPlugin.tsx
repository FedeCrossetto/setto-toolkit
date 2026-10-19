import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownToLine, ArrowUpDown, Check, ChevronDown, CloudCheck, CloudOff, CloudUpload, Copy, Download, ExternalLink, FileUp, KeyRound,
  Lock, LockOpen, Monitor, MoreHorizontal, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Star, TriangleAlert, User, X,
} from 'lucide-react'
import { EmptyState } from '../../core/components/EmptyState'
import { listItemMotion, shouldAnimateList } from '../../core/motion'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { usePluginIntent } from '../../core/AppContext'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { useUndo } from '../../core/hooks/useUndo'
import { useSoftDelete } from '../../core/soft-delete'
import { needsSync as computeNeedsSync, syncView } from './local-mode'
import type { Credential, CredentialDraft, CredentialsListResult, E2EStatus, LockStatus, PasswordAudit, SecretResult } from './types'
import { E2E_ITEM_LABEL, e2eSummary } from './e2e-view'
import {
  absoluteUrl, copyToClipboard, credentialsApi, displayHost, filterCredentials, groupCredentials,
  invalidateCredentials, loadCredentialList, loadLocalCredentialList, relativeTime, type CredentialGroup,
} from './data'
import { SORT_LABELS, sortCredentialsBy, topByUsage, usageHint, type CredentialSort } from './usage'
import { Avatar } from './components/Avatar'
import { CredentialEditor, CredentialView, type WithSecret } from './components/CredentialDetail'
import { PinPrompt } from './components/PinPrompt'
import { SecuritySheet } from './components/SecuritySheet'
import { ImportSheet } from './components/ImportSheet'
import { SyncSheet } from './components/SyncSheet'

type Filter = 'all' | 'fav' | 'risk'

const RETRY_MS = 60_000
const QUICK_MAX = 6
const SORT_KEY = 'credentials.sort'
const SORTS = Object.keys(SORT_LABELS) as CredentialSort[]

function readSort(): CredentialSort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return SORTS.includes(v as CredentialSort) ? v as CredentialSort : 'usage'
  } catch {
    return 'usage'
  }
}

/** Live usage since the last load: updates hints right away without reordering under the cursor. */
type LiveUsage = Record<string, { useCount: number; lastUsedAt: number }>

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CredentialsPlugin(): JSX.Element {
  const { show: toast } = useToast()
  const confirm = useConfirm()
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [data, setData]             = useState<CredentialsListResult | null>(null)
  const [loading, setLoading]       = useState(true)
  const [fatal, setFatal]           = useState<string | null>(null)
  const [audit, setAudit]           = useState<PasswordAudit | null>(null)
  const [lock, setLock]             = useState<LockStatus | null>(null)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing]       = useState<null | 'new' | string>(null)
  const [pendingOpen, setPendingOpen] = useState<string | null>(null)
  const [folded, setFolded]         = useState<Record<string, boolean>>({})
  const [pinOpen, setPinOpen]       = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [syncOpen, setSyncOpen]     = useState(false)
  const [e2e, setE2e]               = useState<E2EStatus | null>(null)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [sortOpen, setSortOpen]     = useState(false)
  const [sort, setSortState]        = useState<CredentialSort>(readSort)
  const [live, setLive]             = useState<LiveUsage>({})
  const pinResolver = useRef<((ok: boolean) => void) | null>(null)

  const { undoable } = useUndo()
  const softDelete = useSoftDelete((_id, err) => {
    toast(`No se pudo eliminar: ${errorText(err)}`, 'error', 6000)
    void load(true)
  })
  const hiddenIds = softDelete.hidden
  const items = useMemo(() => (data?.items ?? []).filter((c) => !hiddenIds.has(c.id)), [data, hiddenIds])
  const favorites = useMemo(() => new Set(data?.favorites ?? []), [data])
  const usageOf = useCallback((c: Credential): { useCount: number; lastUsedAt?: number } => live[c.id] ?? c, [live])

  const setSort = (v: CredentialSort): void => {
    setSortState(v)
    setSortOpen(false)
    try { localStorage.setItem(SORT_KEY, v) } catch { /* storage no disponible */ }
  }

  const refreshAudit = useCallback(() => {
    credentialsApi.audit().then(setAudit).catch(() => undefined)
  }, [])

  const refreshE2E = useCallback(() => {
    credentialsApi.e2eStatus().then(setE2e).catch(() => undefined)
  }, [])

  const load = useCallback(async (force = false): Promise<void> => {
    setLoading(true)
    try {
      const r = await loadCredentialList(force)
      setData(r)
      setLive({})
      setFatal(null)
      refreshAudit()
      if (r.status !== 'local') refreshE2E()
      else setE2e(null)
    } catch (err) {
      setFatal(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [refreshAudit, refreshE2E])

  useEffect(() => {
    // Local-first: paint the local copy right away, then sync.
    loadLocalCredentialList()
      .then((r) => { setData((cur) => cur ?? r); refreshAudit() })
      .catch(() => undefined)
    void load(true)
    credentialsApi.lockStatus().then(setLock).catch(() => undefined)
  }, [load, refreshAudit])

  // Retry while offline / with pending writes: every minute and when the window regains focus.
  // Never in local mode (no Supabase / app.local_only): nothing to retry.
  const needsSync = computeNeedsSync(data)
  useEffect(() => {
    if (!needsSync) return
    const t = setInterval(() => { void load(true) }, RETRY_MS)
    const onFocus = (): void => { void load(true) }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [needsSync, load])

  const [pendingCopy, setPendingCopy] = useState<string | null>(null)
  usePluginIntent('credentials', (intent) => {
    if (typeof intent.payload !== 'string') return
    if (intent.action === 'open') setPendingOpen(intent.payload)
    // Ctrl+K / dock with the PIN lock on: open it, ask for the PIN and copy.
    if (intent.action === 'copy-password') { setPendingOpen(intent.payload); setPendingCopy(intent.payload) }
  })

  useEffect(() => {
    if (!pendingOpen || !data) return
    if (items.some((c) => c.id === pendingOpen)) {
      setSearch('')
      setFilter('all')
      setEditing(null)
      setSelectedId(pendingOpen)
      requestAnimationFrame(() => {
        listRef.current?.querySelector(`[data-id="${CSS.escape(pendingOpen)}"]`)?.scrollIntoView({ block: 'nearest' })
      })
    }
    setPendingOpen(null)
  }, [pendingOpen, data, items])

  // ── Derived lists ─────────────────────────────────────────────────────────
  const reusedOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const g of audit?.reused ?? []) for (const id of g) m.set(id, g.filter((x) => x !== id))
    return m
  }, [audit])
  const weakSet = useMemo(() => new Set(audit?.weak ?? []), [audit])
  const riskCount = useMemo(() => items.filter((c) => weakSet.has(c.id) || reusedOf.has(c.id)).length, [items, weakSet, reusedOf])

  const groups = useMemo((): CredentialGroup[] => {
    const found = filterCredentials(items, search)
    if (filter === 'risk') {
      const byName = (a: Credential, b: Credential): number => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
      const reused = found.filter((c) => reusedOf.has(c.id)).sort(byName)
      const weak = found.filter((c) => weakSet.has(c.id) && !reusedOf.has(c.id)).sort(byName)
      return [
        ...(reused.length ? [{ key: 'Contraseña repetida', items: reused }] : []),
        ...(weak.length ? [{ key: 'Contraseña débil', items: weak }] : []),
      ]
    }
    const sorted = sortCredentialsBy(found, sort)
    if (filter === 'fav') {
      const favs = sorted.filter((c) => favorites.has(c.id))
      return favs.length ? [{ key: 'Favoritas', items: favs }] : []
    }
    // Favorites pinned on top (not while searching: there the best match wins).
    const pinned = search.trim() ? [] : sorted.filter((c) => favorites.has(c.id))
    const rest = pinned.length ? sorted.filter((c) => !favorites.has(c.id)) : sorted
    const head = pinned.length ? [{ key: 'Favoritas', items: pinned }] : []
    if (sort === 'category') return [...head, ...groupCredentials(rest)]
    if (!rest.length) return head
    const label = search.trim() ? 'Resultados' : SORT_LABELS[sort]
    return [...head, { key: label, items: rest }]
  }, [items, search, filter, sort, favorites, reusedOf, weakSet])

  /** "Acceso rápido": the most used (favorites first), in the order of the last load. */
  const quick = useMemo(
    () => topByUsage(items.filter((c) => c.useCount > 0 || favorites.has(c.id)), favorites, QUICK_MAX),
    [items, favorites],
  )

  const visible = useMemo(() => groups.flatMap((g) => (folded[g.key] ? [] : g.items)), [groups, folded])
  const rowMotion = listItemMotion(shouldAnimateList(visible.length))
  const selected = items.find((c) => c.id === selectedId) ?? null
  const nameOf = useCallback((id: string) => items.find((c) => c.id === id)?.nombre, [items])
  const categories = useMemo(() => [...new Set(items.map((c) => c.categoria?.trim()).filter((x): x is string => !!x))].sort(), [items])

  // ── Secrets / lock ────────────────────────────────────────────────────────
  const requireUnlock = useCallback((): Promise<boolean> => new Promise((resolve) => {
    pinResolver.current?.(false)
    pinResolver.current = resolve
    setPinOpen(true)
  }), [])

  const onPinDone = (ok: boolean): void => {
    setPinOpen(false)
    pinResolver.current?.(ok)
    pinResolver.current = null
    credentialsApi.lockStatus().then(setLock).catch(() => undefined)
  }

  const withSecret: WithSecret = useCallback(async <T,>(fn: () => Promise<SecretResult<T>>) => {
    try {
      let r = await fn()
      if (!r.ok) {
        if (!(await requireUnlock())) return null
        r = await fn()
      }
      return r.ok ? r : null
    } catch (err) {
      toast(errorText(err), 'error', 4000)
      return null
    }
  }, [requireUnlock, toast])

  // ── Actions ───────────────────────────────────────────────────────────────
  const setUsed = useCallback((c: Credential, ts: number): void => {
    setLive((m) => ({ ...m, [c.id]: { useCount: (m[c.id]?.useCount ?? c.useCount) + 1, lastUsedAt: ts } }))
    setData((d) => (d ? { ...d, usedAt: { ...d.usedAt, [c.id]: ts } } : d))
    invalidateCredentials()
  }, [])

  const copyPassword = useCallback(async (c: Credential): Promise<boolean> => {
    if (!c.hasPassword) { toast('Esta credencial no tiene contraseña guardada', 'warning'); return false }
    try {
      let r = await credentialsApi.copyPassword(c.id)
      if (!r.ok && r.locked) {
        if (!(await requireUnlock())) return false
        r = await credentialsApi.copyPassword(c.id)
      }
      if (!r.ok) { toast(r.error, 'error', 4000); return false }
      setUsed(c, r.usedAt)
      toast('Contraseña copiada. Se borra del portapapeles en 30 s', 'success', 3000)
      return true
    } catch (err) {
      toast(errorText(err), 'error', 4000)
      return false
    }
  }, [requireUnlock, setUsed, toast])

  const copyUser = useCallback(async (c: Credential): Promise<void> => {
    if (!c.usuario) { toast('Esta credencial no tiene usuario', 'warning'); return }
    try {
      const r = await credentialsApi.copyUsername(c.id)
      if (!r.ok) { toast(r.error, 'error'); return }
      setUsed(c, r.usedAt)
      toast('Usuario copiado', 'success', 1800)
    } catch {
      // Main not reachable: plain copy (doesn't count as a use).
      try {
        await copyToClipboard(c.usuario)
        toast('Usuario copiado', 'success', 1800)
      } catch {
        toast('No se pudo copiar al portapapeles', 'error')
      }
    }
  }, [setUsed, toast])

  useEffect(() => {
    if (!pendingCopy || !data) return
    const c = items.find((x) => x.id === pendingCopy)
    setPendingCopy(null)
    if (c) void copyPassword(c)
  }, [pendingCopy, data, items, copyPassword])

  const openAndCopy = useCallback(async (c: Credential): Promise<void> => {
    if (!c.url) return
    if (await copyPassword(c)) window.open(absoluteUrl(c.url), '_blank', 'noopener')
  }, [copyPassword])

  const toggleFavorite = async (c: Credential): Promise<void> => {
    try {
      const favs = await credentialsApi.toggleFavorite(c.id)
      setData((d) => (d ? { ...d, favorites: favs } : d))
    } catch (err) {
      toast(errorText(err), 'error')
    }
  }

  const save = async (draft: CredentialDraft): Promise<boolean> => {
    const isNew = editing === 'new'
    try {
      const r = await credentialsApi.save(draft)
      invalidateCredentials()
      setSelectedId(draft.id)
      setEditing(null)
      if (r.queued && data?.status !== 'local') toast('Guardada en esta computadora. Se sube a Supabase cuando haya conexión', 'warning', 4500)
      else toast(isNew ? 'Credencial creada' : 'Cambios guardados', 'success', 2200)
      void load(true)
      return true
    } catch (err) {
      toast(`No se pudo guardar: ${errorText(err)}`, 'error', 6000)
      return false
    }
  }

  /** Single delete: immediate + "Deshacer". The real delete runs when the undo window is over. */
  const remove = useCallback(async (c: Credential): Promise<void> => {
    const idx = visible.findIndex((x) => x.id === c.id)
    const next = visible[idx + 1] ?? visible[idx - 1]
    const wasSelected = selectedId === c.id
    await undoable({
      message: `«${c.nombre}» eliminada`,
      undoneMessage: 'Credencial restaurada',
      apply: () => {
        softDelete.hide(c.id, async () => {
          const r = await credentialsApi.remove(c.id)
          invalidateCredentials()
          await load(true)
          if (r.queued) toast('Eliminada en esta computadora. Se borra de Supabase cuando haya conexión', 'warning', 4500)
        })
        if (wasSelected) setSelectedId(next && next.id !== c.id ? next.id : null)
      },
      undo: () => {
        if (!softDelete.restore(c.id)) throw new Error('ya se había eliminado')
        if (wasSelected) setSelectedId(c.id)
      },
    })
  }, [visible, selectedId, undoable, softDelete, load, toast])

  /** Sync conflict: nothing was overwritten; the user picks. "Usar la sincronizada" can be undone. */
  const resolveConflict = useCallback(async (c: Credential, choice: 'local' | 'remote'): Promise<void> => {
    const call = async (ch: 'local' | 'remote' | 'undo'): Promise<void> => {
      const r = await credentialsApi.e2eResolve(c.id, ch)
      setE2e(r.status)
      invalidateCredentials()
      void load(true)
      if (!r.ok) {
        if (r.status.state === 'locked') setSyncOpen(true)
        throw new Error(r.error ?? 'No se pudo resolver')
      }
    }
    try {
      if (choice === 'local') {
        await call('local')
        toast('Se usa la de esta PC (subida como la más reciente)', 'success', 3000)
      } else {
        await undoable({
          message: 'Se usa la contraseña sincronizada',
          undoneMessage: 'Se restauró la de esta PC',
          apply: () => call('remote'),
          undo: () => call('undo'),
        })
      }
    } catch (err) {
      toast(errorText(err), 'error', 5000)
    }
  }, [load, toast, undoable])

  const exportCsv = async (): Promise<void> => {
    setMenuOpen(false)
    const ok = await confirm({
      title: '¿Exportar todas las contraseñas sin cifrar?',
      message: (
        <>
          El archivo CSV va a tener <strong>todas tus contraseñas en texto plano</strong>: cualquiera que lo abra puede leerlas.
          Guardalo en un lugar seguro y borralo apenas lo uses.
        </>
      ),
      confirmLabel: 'Exportar igual',
      destructive: true,
    })
    if (!ok) return
    const r = await withSecret(() => credentialsApi.exportCsv())
    if (r && !r.canceled) toast(`Exportadas ${r.count ?? 0} credenciales`, 'success', 3000)
  }

  const moveSelection = useCallback((delta: number): void => {
    if (!visible.length) return
    const idx = visible.findIndex((c) => c.id === selectedId)
    const next = visible[idx < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, idx + delta))]
    if (!next) return
    setSelectedId(next.id)
    setEditing(null)
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)
      el?.scrollIntoView({ block: 'nearest' })
      if (listRef.current?.contains(document.activeElement)) el?.focus()
    })
  }, [visible, selectedId])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const root = rootRef.current
      if (!root || root.offsetParent === null) return // our tab is hidden
      if (pinOpen || securityOpen || importOpen || syncOpen || e.defaultPrevented) return
      const target = e.target as Node | null
      const inside = !target || target === document.body || root.contains(target)
      if (!inside) return // modals / other portals
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (mod && !e.shiftKey && !e.altKey && k === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (editing) return
      const inSearch = e.target === searchRef.current
      if (isTyping(e.target) && !inSearch) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        moveSelection(e.key === 'ArrowDown' ? 1 : -1)
        return
      }
      // Enter = copiar contraseña, Shift+Enter = copiar usuario (same keys as Ctrl+K and the dock).
      if (e.key === 'Enter' && !mod) {
        // From the search box, Enter acts on the first result if the selection was filtered out.
        const targetItem = inSearch && !visible.some((c) => c.id === selectedId) ? visible[0] : selected
        if (!targetItem) return
        // Let focused buttons/links outside the list do their own thing.
        const el = e.target as HTMLElement | null
        if (!inSearch && el && (el.tagName === 'BUTTON' || el.tagName === 'A') && !listRef.current?.contains(el)) return
        e.preventDefault()
        setSelectedId(targetItem.id)
        if (e.shiftKey) void copyUser(targetItem)
        else void copyPassword(targetItem)
        return
      }
      if (inSearch) return
      if (mod && k === 'c' && selected && !window.getSelection()?.toString()) {
        e.preventDefault()
        void copyPassword(selected)
      } else if (mod && k === 'b' && selected) {
        e.preventDefault()
        void copyUser(selected)
      } else if (!mod && !e.altKey && k === 'n') {
        e.preventDefault()
        setEditing('new')
      } else if (e.key === 'Delete' && selected) {
        e.preventDefault()
        void remove(selected)
      } else if (e.key === 'Escape' && selected && !sortOpen && !menuOpen) {
        e.preventDefault()
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, selected, selectedId, visible, pinOpen, securityOpen, importOpen, syncOpen, sortOpen, menuOpen, moveSelection, copyPassword, copyUser, remove])

  // Close the menus on outside click.
  useEffect(() => {
    if (!menuOpen && !sortOpen) return
    const close = (): void => { setMenuOpen(false); setSortOpen(false) }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('blur', close) }
  }, [menuOpen, sortOpen])

  const filterOptions = [
    { value: 'all' as const, label: 'Todas' },
    { value: 'fav' as const, label: 'Favoritas', ...(favorites.size ? { count: favorites.size } : {}) },
    { value: 'risk' as const, label: 'En riesgo', ...(riskCount ? { count: riskCount } : {}) },
  ]

  const emptyText = items.length === 0
    ? 'Todavía no guardaste credenciales.'
    : search ? 'Sin resultados.'
    : filter === 'fav' ? 'Marcá credenciales con la estrella para verlas acá.'
    : filter === 'risk' ? 'Ninguna contraseña débil ni repetida.'
    : 'Sin resultados.'

  return (
    <div ref={rootRef} className="flex h-full overflow-hidden bg-background">
      {/* ── List ────────────────────────────────────────────────────────── */}
      <aside className="w-80 shrink-0 flex flex-col bg-surface hairline-r overflow-hidden">
        <div className="px-3 pt-4 pb-2 shrink-0 space-y-2.5">
          <div className="flex items-center gap-1.5 pl-1.5">
            <h2 className="t-headline text-on-surface">Claves</h2>
            <span className="t-caption font-medium tabular-nums text-on-surface-variant/70">{items.length}</span>
            {lock?.pinEnabled && (
              <button
                onClick={() => {
                  if (lock.unlocked) credentialsApi.lock().then(setLock).catch(() => undefined)
                  else void requireUnlock()
                }}
                className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg text-on-surface-variant"
                title={lock.unlocked ? 'Desbloqueadas — clic para bloquear' : 'Bloqueadas — clic para desbloquear'}
                aria-label={lock.unlocked ? 'Bloquear' : 'Desbloquear'}
              >
                {lock.unlocked ? <LockOpen size={14} /> : <Lock size={14} />}
              </button>
            )}
            <div className="ml-auto relative shrink-0">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setSortOpen((v) => !v)}
                disabled={filter === 'risk'}
                className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg text-on-surface-variant disabled:opacity-40"
                title={`Ordenar: ${SORT_LABELS[sort]}`}
                aria-label={`Ordenar (${SORT_LABELS[sort]})`}
                aria-haspopup="menu"
                aria-expanded={sortOpen}
              >
                <ArrowUpDown size={15} />
              </button>
              {sortOpen && (
                <div className="ui-menu absolute right-0 top-full mt-1 z-50 w-44 p-1" onMouseDown={(e) => e.stopPropagation()} role="menu">
                  <p className="px-2 pt-1 pb-1.5 t-caption text-on-surface-variant">Ordenar por</p>
                  {SORTS.map((s) => (
                    <button key={s} role="menuitemradio" aria-checked={s === sort} className="ui-menu-item w-full px-2.5 py-1.5" onClick={() => setSort(s)}>
                      <span className="flex-1 text-left">{SORT_LABELS[s]}</span>
                      {s === sort && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setMenuOpen((v) => !v)}
                className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg"
                title="Más opciones"
                aria-label="Más opciones"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="ui-menu absolute right-0 top-full mt-1 z-50 w-56 p-1" onMouseDown={(e) => e.stopPropagation()} role="menu">
                  <button role="menuitem" className="ui-menu-item w-full px-2.5 py-1.5" onClick={() => { setMenuOpen(false); setImportOpen(true) }}>
                    <FileUp size={14} /> Importar CSV…
                  </button>
                  <button role="menuitem" className="ui-menu-item w-full px-2.5 py-1.5" onClick={() => void exportCsv()} disabled={!items.length}>
                    <Download size={14} /> Exportar CSV…
                  </button>
                  <button role="menuitem" className="ui-menu-item w-full px-2.5 py-1.5" onClick={() => { setMenuOpen(false); setSecurityOpen(true) }}>
                    <ShieldCheck size={14} /> Seguridad…
                  </button>
                  <button
                    role="menuitem"
                    className="ui-menu-item w-full px-2.5 py-1.5"
                    onClick={() => { setMenuOpen(false); setSyncOpen(true); if (data?.status !== 'local') refreshE2E() }}
                  >
                    <CloudCheck size={14} /> Sincronizar contraseñas…
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setEditing('new')}
              className="ui-btn ui-btn-primary ui-btn-icon rounded-lg"
              title="Nueva credencial (N)"
              aria-label="Nueva credencial"
            >
              <Plus size={15} weight="bold" />
            </button>
          </div>
          <div className="ui-input flex items-center gap-2 h-8 pl-2.5">
            <Search size={14} className="text-on-surface-variant/70 shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.preventDefault(); setSearch('') } }}
              placeholder="Buscar nombre, usuario, sitio…"
              aria-label="Buscar credenciales"
              className="flex-1 min-w-0 bg-transparent t-body text-on-surface outline-hidden"
            />
            {search ? (
              <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="text-on-surface-variant hover:text-on-surface pr-2">
                <X size={13} />
              </button>
            ) : (
              <span className="kbd-chip mr-1.5">Ctrl F</span>
            )}
          </div>
          <SegmentedControl
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-1.5 [&>button]:whitespace-nowrap"
          />
        </div>

        {e2e?.state === 'locked' && e2e.counts.remote > 0 && (
          <button
            onClick={() => setSyncOpen(true)}
            className="mx-3 mb-1 flex items-center gap-2 rounded-xl hairline px-3 py-2 text-left hover:bg-on-surface/3 transition-colors"
          >
            <ArrowDownToLine size={14} className="text-primary shrink-0" />
            <span className="flex-1 min-w-0 t-footnote text-on-surface">
              {e2e.counts.remote === 1 ? '1 contraseña de otra computadora' : `${e2e.counts.remote} contraseñas de otra computadora`}
            </span>
            <span className="t-caption font-medium text-primary shrink-0">Desbloquear</span>
          </button>
        )}

        <motion.div layoutScroll ref={listRef} className="flex-1 overflow-y-auto px-2 pb-3" role="listbox" aria-label="Claves">
          {fatal && !data ? (
            <div className="px-3 py-8 text-center flex flex-col items-center gap-2">
              <p className="t-body font-medium text-on-surface">No se pudieron cargar las credenciales</p>
              <p className="t-caption text-on-surface-variant wrap-break-word">{fatal}</p>
              <button onClick={() => void load(true)} className="ui-btn ui-btn-outline ui-btn-sm mt-1">
                <RefreshCw size={12} /> Reintentar
              </button>
            </div>
          ) : loading && !data ? (
            <p className="t-footnote text-on-surface-variant px-3 py-6 text-center">Cargando…</p>
          ) : groups.length === 0 ? (
            <p className="t-footnote text-on-surface-variant px-3 py-6 text-center">{emptyText}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => setFolded((f) => ({ ...f, [g.key]: !f[g.key] }))}
                  aria-expanded={!folded[g.key]}
                  className="w-full flex items-center gap-1 px-2.5 pt-4 pb-1.5 t-section uppercase tracking-[0.08em] hover:text-on-surface-variant transition-colors"
                >
                  <ChevronDown size={11} weight="bold" className={`transition-transform duration-150 ${folded[g.key] ? '-rotate-90' : ''}`} />
                  <span className="truncate">{g.key}</span>
                  <span className="ml-auto font-medium tabular-nums">{g.items.length}</span>
                </button>
                {!folded[g.key] && (
                  <div className="relative flex flex-col gap-0.5">
                    <AnimatePresence initial={false} mode="popLayout">
                    {g.items.map((c) => (
                      <motion.div key={c.id} {...rowMotion}>
                      <CredentialRow
                        c={c}
                        active={c.id === selectedId}
                        favorite={favorites.has(c.id)}
                        risk={reusedOf.has(c.id) ? 'Contraseña repetida' : weakSet.has(c.id) ? 'Contraseña débil' : undefined}
                        usage={usageOf(c)}
                        onSelect={() => { if (c.id !== selectedId || editing) { setSelectedId(c.id); setEditing(null) } }}
                        onToggleFavorite={() => void toggleFavorite(c)}
                        onCopyUser={() => void copyUser(c)}
                        onCopyPassword={() => void copyPassword(c)}
                      />
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ))
          )}
        </motion.div>

        <SyncFooter data={data} loading={loading} onRetry={() => void load(true)} e2e={e2e} onOpenSync={() => setSyncOpen(true)} />
      </aside>

      {/* ── Detail ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {editing ? (
          <div className="max-w-[720px] mx-auto px-6 py-6">
            <CredentialEditor
              key={editing}
              initial={editing === 'new' ? null : items.find((c) => c.id === editing) ?? null}
              categories={categories}
              nextOrden={items.reduce((m, c) => Math.max(m, c.orden), 0) + 1}
              nameOf={nameOf}
              onCancel={() => setEditing(null)}
              onSave={save}
            />
          </div>
        ) : selected ? (
          <div className="max-w-[720px] mx-auto px-6 py-6">
            <CredentialView
              key={selected.id}
              c={selected}
              favorite={favorites.has(selected.id)}
              usage={usageOf(selected)}
              score={audit?.scores[selected.id]}
              reusedWith={(reusedOf.get(selected.id) ?? []).map((id) => nameOf(id) ?? '').filter(Boolean)}
              weak={weakSet.has(selected.id)}
              withSecret={withSecret}
              onEdit={() => setEditing(selected.id)}
              onDelete={() => void remove(selected)}
              onToggleFavorite={() => void toggleFavorite(selected)}
              onCopyPassword={() => void copyPassword(selected)}
              onCopyUser={() => void copyUser(selected)}
              onOpenAndCopy={() => void openAndCopy(selected)}
              onOpenSync={() => setSyncOpen(true)}
              onResolveConflict={(choice) => void resolveConflict(selected, choice)}
            />
          </div>
        ) : items.length ? (
          <QuickAccess
            quick={quick}
            usageOf={usageOf}
            lock={lock}
            onUnlock={() => void requireUnlock()}
            onCopyPassword={copyPassword}
            onCopyUser={(c) => void copyUser(c)}
            onOpen={(c) => { setSelectedId(c.id); setEditing(null) }}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={KeyRound}
              title={loading && !data ? 'Cargando credenciales…' : 'Sin credenciales guardadas'}
              description={loading && !data ? undefined : data?.status === 'local'
                ? 'Guardá tus usuarios y contraseñas, cifrados sólo en esta computadora (no se suben a ningún lado). También podés importarlos desde un CSV.'
                : 'Guardá tus usuarios y contraseñas, cifrados en esta computadora. También podés importarlos desde un CSV.'}
              action={loading && !data ? undefined : (
                <div className="flex gap-2">
                  <button onClick={() => setEditing('new')} className="ui-btn ui-btn-primary"><Plus size={14} /> Nueva credencial</button>
                  <button onClick={() => setImportOpen(true)} className="ui-btn ui-btn-outline"><FileUp size={14} /> Importar CSV</button>
                </div>
              )}
            />
          </div>
        )}
      </main>

      <PinPrompt open={pinOpen} onDone={onPinDone} />
      <SecuritySheet open={securityOpen} status={lock} onClose={() => setSecurityOpen(false)} onChange={setLock} />
      <SyncSheet
        open={syncOpen}
        status={data?.status === 'local' ? LOCAL_E2E : e2e}
        onClose={() => setSyncOpen(false)}
        onChange={(s, changed) => {
          setE2e(s)
          invalidateCredentials()
          if (changed || s.state === 'unlocked') void load(true)
        }}
      />
      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { invalidateCredentials(); void load(true) }}
      />
    </div>
  )
}

// ── List row ─────────────────────────────────────────────────────────────────

type Usage = { useCount: number; lastUsedAt?: number }

function QuickButton({ label, onClick, children, href }: { label: string; onClick?: () => void; children: React.ReactNode; href?: string }): JSX.Element {
  const cls = 'w-6 h-6 inline-flex items-center justify-center rounded-md text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.07] transition-colors'
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" tabIndex={-1} onClick={(e) => e.stopPropagation()} className={cls} title={label} aria-label={label}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onClick?.() }} className={cls} title={label} aria-label={label}>
      {children}
    </button>
  )
}

function CredentialRow({
  c, active, favorite, risk, usage, onSelect, onToggleFavorite, onCopyUser, onCopyPassword,
}: {
  c: Credential
  active: boolean
  favorite: boolean
  risk?: string
  usage: Usage
  onSelect: () => void
  onToggleFavorite: () => void
  onCopyUser: () => void
  onCopyPassword: () => void
}): JSX.Element {
  const when = relativeTime(usage.lastUsedAt)
  const hint = usageHint(usage.useCount, when)
  return (
    <div
      data-id={c.id}
      role="option"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      onDoubleClick={onCopyPassword}
      className={`group relative w-full flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-left cursor-default transition-colors duration-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45 ${
        active ? 'nav-active' : 'border border-transparent hover:bg-on-surface/4'
      }`}
    >
      <Avatar name={c.nombre} url={c.url} size={30} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1 min-w-0">
          <span className={`t-body truncate ${active ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}>{c.nombre}</span>
          {favorite && <Star size={10} weight="fill" className="text-primary shrink-0" aria-label="Favorita" />}
          {c.pending && <span title="Pendiente de sincronizar" className="text-warning shrink-0"><CloudUpload size={12} /></span>}
          {c.e2e === 'remote' && <span title={E2E_ITEM_LABEL.remote.hint} className="text-primary shrink-0"><ArrowDownToLine size={12} /></span>}
          {c.e2e === 'conflict' && <span title={E2E_ITEM_LABEL.conflict.hint} className="text-warning shrink-0"><TriangleAlert size={12} /></span>}
          {c.e2e === 'local' && <span title={E2E_ITEM_LABEL.local.hint} className="text-on-surface-variant/70 shrink-0"><Monitor size={12} /></span>}
          {risk && <span title={risk} className="text-warning shrink-0"><ShieldAlert size={12} /></span>}
        </span>
        <span className="block t-footnote text-on-surface-variant truncate">{c.usuario || displayHost(c.url) || '—'}</span>
      </span>
      {(usage.useCount > 0 || when) && (
        <span
          className="shrink-0 flex flex-col items-end t-caption text-on-surface-variant/70 tabular-nums transition-opacity group-hover:opacity-0"
          title={hint}
        >
          <span>{when}</span>
          {usage.useCount > 0 && <span>{usage.useCount === 1 ? '1 vez' : `${usage.useCount} veces`}</span>}
        </span>
      )}
      <span
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-px p-0.5 rounded-lg bg-surface hairline shadow-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-100"
      >
        {c.usuario && <QuickButton label="Copiar usuario (Shift+Enter)" onClick={onCopyUser}><User size={13} /></QuickButton>}
        {c.hasPassword && <QuickButton label="Copiar contraseña (Enter)" onClick={onCopyPassword}><KeyRound size={13} /></QuickButton>}
        {c.url && <QuickButton label="Abrir sitio" href={absoluteUrl(c.url)}><ExternalLink size={13} /></QuickButton>}
        <QuickButton label={favorite ? 'Quitar de favoritas' : 'Marcar como favorita'} onClick={onToggleFavorite}>
          <Star size={13} weight={favorite ? 'fill' : 'regular'} className={favorite ? 'text-primary' : ''} />
        </QuickButton>
      </span>
    </div>
  )
}

// ── Home: quick access ───────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return <kbd className="kbd-chip">{children}</kbd>
}

function QuickAccess({
  quick, usageOf, lock, onUnlock, onCopyPassword, onCopyUser, onOpen,
}: {
  quick: Credential[]
  usageOf: (c: Credential) => Usage
  lock: LockStatus | null
  onUnlock: () => void
  onCopyPassword: (c: Credential) => Promise<boolean>
  onCopyUser: (c: Credential) => void
  onOpen: (c: Credential) => void
}): JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)
  const flash = (id: string): void => {
    setCopied(id)
    setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 1400)
  }
  const locked = !!lock?.pinEnabled && !lock.unlocked
  return (
    <div className="max-w-[760px] mx-auto px-8 py-8" style={{ animation: 'fadeIn 0.2s ease both' }}>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="t-title2 text-on-surface">Acceso rápido</h1>
          <p className="t-footnote text-on-surface-variant mt-1">Las que más usás. Un clic copia la contraseña.</p>
        </div>
        {locked && (
          <button onClick={onUnlock} className="ui-btn ui-btn-outline ui-btn-sm shrink-0">
            <Lock size={12} /> Desbloquear
          </button>
        )}
      </div>

      {quick.length ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {quick.map((c) => {
            const u = usageOf(c)
            const hint = usageHint(u.useCount, relativeTime(u.lastUsedAt))
            const done = copied === c.id
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => { if (c.hasPassword) void onCopyPassword(c).then((ok) => { if (ok) flash(c.id) }); else onOpen(c) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click() } }}
                className="ui-card ui-card-interactive group p-3.5 flex flex-col gap-3 min-w-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45"
                title={c.hasPassword ? `Copiar la contraseña de ${c.nombre}` : `Ver ${c.nombre}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={c.nombre} url={c.url} size={34} />
                  <div className="flex-1 min-w-0">
                    <p className="t-body font-semibold text-on-surface truncate">{c.nombre}</p>
                    <p className="t-footnote text-on-surface-variant truncate">{c.usuario || displayHost(c.url) || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="flex-1 min-w-0 t-caption text-on-surface-variant/80 truncate">
                    {done ? <span className="text-success inline-flex items-center gap-1"><Check size={11} /> Copiada</span> : hint || 'Favorita'}
                  </span>
                  {c.usuario && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCopyUser(c) }}
                      className="ui-btn ui-btn-ghost ui-btn-icon rounded-md w-6 h-6 hidden group-hover:inline-flex group-focus-within:inline-flex"
                      title="Copiar usuario"
                      aria-label={`Copiar usuario de ${c.nombre}`}
                    >
                      <User size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(c) }}
                    className="ui-btn ui-btn-ghost ui-btn-icon rounded-md w-6 h-6 hidden group-hover:inline-flex group-focus-within:inline-flex"
                    title="Ver detalles"
                    aria-label={`Ver detalles de ${c.nombre}`}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  {c.hasPassword && <Copy size={13} className="text-on-surface-variant/60 group-hover:text-primary transition-colors shrink-0" aria-hidden />}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="ui-card p-5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-selected text-primary flex items-center justify-center shrink-0"><KeyRound size={17} /></span>
          <p className="t-body text-on-surface-variant">Las credenciales que más copies (y tus favoritas) van a aparecer acá.</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 t-footnote text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> moverse</span>
        <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd> copia la contraseña</span>
        <span className="inline-flex items-center gap-1.5"><Kbd>Shift Enter</Kbd> copia el usuario</span>
        <span className="inline-flex items-center gap-1.5"><Kbd>Ctrl F</Kbd> buscar</span>
        <span className="inline-flex items-center gap-1.5"><Kbd>N</Kbd> nueva</span>
      </div>
    </div>
  )
}

// ── Sync status ──────────────────────────────────────────────────────────────

const LOCAL_E2E: E2EStatus = { state: 'local-mode', remembered: false, counts: { synced: 0, local: 0, remote: 0, conflict: 0 }, lastSyncAt: null }
const E2E_TONE = { success: 'text-success', muted: 'text-on-surface-variant', warning: 'text-warning', error: 'text-error' } as const

function SyncFooter({
  data, loading, onRetry, e2e, onOpenSync,
}: {
  data: CredentialsListResult | null
  loading: boolean
  onRetry: () => void
  e2e: E2EStatus | null
  onOpenSync: () => void
}): JSX.Element | null {
  if (!data) return null
  const view = syncView(data, (ts) => relativeTime(ts))
  const local = view.kind === 'local'
  const icon = { synced: CloudCheck, offline: CloudOff, error: TriangleAlert, local: Monitor }[view.kind]
  const tone = { success: 'text-success', muted: 'text-on-surface-variant', error: 'text-error' }[view.tone]
  const Icon = loading && !local ? RefreshCw : icon
  return (
    <div
      className="px-3.5 py-2.5 hairline-t flex items-center gap-2 shrink-0"
      title={local ? 'Las contraseñas se guardan cifradas sólo en esta computadora. Para tenerlas en otra, configurá Supabase en Conexiones.' : data.error}
    >
      <Icon size={14} className={`${loading && !local ? 'text-on-surface-variant animate-spin' : tone} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="t-caption font-medium text-on-surface truncate">{loading && !local ? 'Sincronizando…' : view.text}</p>
        <p className="t-caption text-on-surface-variant/80 truncate">{view.sub}</p>
      </div>
      {e2e && e2e.state !== 'local-mode' && e2e.state !== 'off' && (
        <button
          onClick={onOpenSync}
          className={`ui-btn ui-btn-ghost ui-btn-icon rounded-lg ${E2E_TONE[e2eSummary(e2e).tone]}`}
          title={`Contraseñas entre computadoras: ${e2eSummary(e2e).text}`}
          aria-label="Sincronización de contraseñas"
        >
          {e2e.state === 'unlocked' ? <LockOpen size={13} /> : <Lock size={13} />}
        </button>
      )}
      {view.retry && (
        <button onClick={onRetry} disabled={loading} className="ui-btn ui-btn-ghost ui-btn-icon rounded-lg" title="Reintentar ahora" aria-label="Reintentar sincronización">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  )
}
