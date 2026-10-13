/**
 * Estado de Gastos: Supabase como fuente de verdad + caché local compartido (main process) +
 * cola de escrituras pendientes. Las escrituras se aplican en forma optimista y se sincronizan
 * con debounce; también al volver el foco a la ventana.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../../core/components/Toast'
import type { GastosData } from '../analytics'
import { friendlyGastosError } from '../format'
import {
  loadLocalState, writeCache, writePendingWrites, writeLastSynced, writePrefs,
} from '../local-store'
import { applyWrite, applyWrites, enqueue, missingTableFromError } from '../sync-queue'
import type { Gasto, GastosLoadResult, GastosPrefs, PagoMensual, PendingWrite, Servicio } from '../types'

export type SyncState = 'ok' | 'pending' | 'syncing' | 'error'

interface SyncOptions {
  silent?: boolean
  /** Tras guardar: la versión remota nueva es la nuestra, se adopta sin recargar todo. */
  adoptRemote?: boolean
}

const EMPTY: GastosData = { servicios: [], pagos: [], gastos: [] }
const AUTO_SYNC_DEBOUNCE_MS = 1500
const FOCUS_SYNC_MIN_INTERVAL_MS = 60_000

export interface GastosStore {
  data: GastosData
  /** Todavía no hay nada para mostrar (ni caché ni remoto) */
  loading: boolean
  /** Error bloqueante (sin datos para mostrar) */
  error: string | null
  /** Mostrando caché porque Supabase no respondió */
  offline: boolean
  /** Los datos vienen de una carga remota exitosa en esta sesión */
  fresh: boolean
  syncState: SyncState
  /** Último error de conexión/sync (para el tooltip del pill) */
  syncError: string | null
  pendingCount: number
  /** Tablas que faltan en Supabase (detectadas al cargar o al guardar) */
  missingTables: string[]
  prefs: GastosPrefs
  setPrefs: (p: GastosPrefs) => void
  reload: () => Promise<void>
  sync: (opts?: SyncOptions) => Promise<void>
  write: (w: PendingWrite) => Promise<boolean>
  saveServicio: (s: Servicio) => Promise<boolean>
  deleteServicio: (id: string) => Promise<boolean>
  savePago: (p: PagoMensual) => Promise<boolean>
  deletePago: (id: string) => Promise<boolean>
  savePagosBulk: (ps: PagoMensual[]) => Promise<boolean>
  saveGasto: (g: Gasto) => Promise<boolean>
  saveGastosBulk: (gs: Gasto[]) => Promise<number>
  deleteGasto: (id: string) => Promise<boolean>
}

export function useGastosData(): GastosStore {
  const toast = useToast()
  const [data, setDataState] = useState<GastosData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('syncing')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [missingTables, setMissingTables] = useState<string[]>([])
  const [prefs, setPrefsState] = useState<GastosPrefs>({})
  const queueRef = useRef<PendingWrite[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const dataRef = useRef(data)
  const hasLocalDataRef = useRef(false)
  const lastSyncedRef = useRef<string | null>(null)
  const syncingRef = useRef(false)
  const offlineRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFocusSyncRef = useRef(0)

  const setData = useCallback((next: GastosData, persist = true) => {
    dataRef.current = next
    setDataState(next)
    if (persist) { writeCache(next); hasLocalDataRef.current = true }
  }, [])

  const setQueue = useCallback((q: PendingWrite[]) => {
    queueRef.current = q
    void writePendingWrites(q)
    setPendingCount(q.length)
  }, [])

  const setOfflineBoth = useCallback((v: boolean) => { offlineRef.current = v; setOffline(v) }, [])

  const setLastSynced = useCallback((v: string | null) => {
    lastSyncedRef.current = v
    writeLastSynced(v)
  }, [])

  const noteMissing = useCallback((table: string) => {
    setMissingTables((prev) => (prev.includes(table) ? prev : [...prev, table]))
  }, [])

  const setPrefs = useCallback((p: GastosPrefs) => {
    setPrefsState((prev) => ({ ...prev, ...p }))
    writePrefs(p)
  }, [])

  /** Empuja la cola. Las escrituras a tablas que faltan quedan en cola sin bloquear el resto. */
  const pushQueue = useCallback(async (): Promise<void> => {
    const queue = [...queueRef.current]
    const kept: PendingWrite[] = []
    for (let i = 0; i < queue.length; i++) {
      const w = queue[i]!
      try {
        await window.api.invoke(w.channel, ...w.args)
      } catch (e) {
        const missing = missingTableFromError(e)
        if (missing) { noteMissing(missing); kept.push(w); continue }
        setQueue([...kept, ...queue.slice(i)])
        throw e
      }
    }
    setQueue(kept)
  }, [setQueue, noteMissing])

  const fetchRemote = useCallback(async (): Promise<void> => {
    const [res, version] = await Promise.all([
      window.api.invoke<GastosLoadResult>('gastos:load'),
      window.api.invoke<string | null>('gastos:remote-version-get').catch(() => null),
    ])
    const base: GastosData = {
      servicios: [...(res.servicios ?? [])].sort((a, b) => a.orden - b.orden),
      pagos: res.pagos ?? [],
      gastos: res.gastos ?? [],
    }
    const missing = res.missingTables ?? (res.gastosTableReady === false ? ['gastos'] : [])
    setMissingTables(missing)
    // Si falta una tabla, lo que hay en el caché para esa tabla es lo único que existe: no se pisa.
    const cur = dataRef.current
    if (missing.includes('gastos')) base.gastos = cur.gastos
    if (missing.includes('pagos')) base.pagos = cur.pagos
    if (missing.includes('servicios')) base.servicios = cur.servicios
    setData(applyWrites(base, queueRef.current))
    setLastSynced(version ?? new Date(0).toISOString())
    setOfflineBoth(false)
    setFresh(true)
    setError(null)
    setSyncError(null)
  }, [setData, setLastSynced, setOfflineBoth])

  const markSynced = useCallback(() => {
    setSyncState(queueRef.current.length ? 'pending' : 'ok')
  }, [])

  const reload = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncState('syncing')
    try {
      if (queueRef.current.length) await pushQueue().catch(() => { /* se reintenta después */ })
      await fetchRemote()
      markSynced()
    } catch (e) {
      const msg = friendlyGastosError(String(e))
      setSyncError(msg)
      setSyncState('error')
      setFresh(false)
      if (hasLocalDataRef.current) setOfflineBoth(true)
      else setError(msg)
    } finally {
      syncingRef.current = false
      setLoading(false)
    }
  }, [fetchRemote, pushQueue, markSynced, setOfflineBoth])

  /** Push de pendientes + pull sólo si la versión remota cambió. */
  const sync = useCallback(async (opts?: SyncOptions) => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncState('syncing')
    try {
      const hadPending = queueRef.current.length > 0
      if (hadPending) await pushQueue()
      const remote = await window.api.invoke<string | null>('gastos:remote-version-get')
      const local = lastSyncedRef.current
      if (offlineRef.current || !local || (remote && remote !== local && !opts?.adoptRemote)) {
        await fetchRemote()
        if (!opts?.silent) toast.show('Datos actualizados desde Supabase', 'success', 2500)
      } else {
        if (remote) setLastSynced(remote)
        setOfflineBoth(false)
        setSyncError(null)
        if (!opts?.silent) toast.show(hadPending ? 'Cambios pendientes sincronizados' : 'Ya estás al día', 'info', 2500)
      }
      markSynced()
    } catch (e) {
      const msg = friendlyGastosError(String(e))
      setSyncError(msg)
      setSyncState('error')
      if (!opts?.silent) toast.show(`No se pudo sincronizar: ${msg}`, 'error', 6000)
    } finally {
      syncingRef.current = false
    }
  }, [fetchRemote, pushQueue, markSynced, setLastSynced, setOfflineBoth, toast])

  const scheduleSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void sync({ silent: true, adoptRemote: true }) }, AUTO_SYNC_DEBOUNCE_MS)
  }, [sync])

  // Arranque: caché compartido del main (con migración desde localStorage) y luego Supabase.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { cache, pending } = await loadLocalState()
      if (cancelled) return
      queueRef.current = pending
      setPendingCount(pending.length)
      lastSyncedRef.current = cache.lastSynced
      setPrefsState(cache.prefs)
      if (cache.data) {
        hasLocalDataRef.current = true
        setData(applyWrites(cache.data, pending), false)
        setLoading(false)
      }
      await reload()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusSyncRef.current < FOCUS_SYNC_MIN_INTERVAL_MS) return
      lastFocusSyncRef.current = now
      void sync({ silent: true })
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [sync])

  /** Aplica la escritura localmente y la manda a Supabase; si falla queda en cola. */
  const write = useCallback(async (w: PendingWrite, opts?: { quiet?: boolean }): Promise<boolean> => {
    setData(applyWrite(dataRef.current, w))
    try {
      await window.api.invoke(w.channel, ...w.args)
      scheduleSync()
      return true
    } catch (e) {
      setQueue(enqueue(queueRef.current, w))
      setSyncState('pending')
      const missing = missingTableFromError(e)
      if (missing) { noteMissing(missing); return false }
      setSyncError(friendlyGastosError(String(e)))
      if (!opts?.quiet) toast.show('Guardado en este equipo. Se sube a Supabase cuando vuelva la conexión.', 'info', 4500)
      return false
    }
  }, [setData, setQueue, scheduleSync, noteMissing, toast])

  /** Varios gastos (importación): optimista para todos, luego se suben de a uno. Devuelve cuántos subieron. */
  const saveGastosBulk = useCallback(async (gs: Gasto[]): Promise<number> => {
    let ok = 0
    let failed = false
    for (const g of gs) {
      if (await write({ channel: 'gastos:save-gasto', args: [g] }, { quiet: true })) ok++
      else failed = true
    }
    if (failed && !missingTables.includes('gastos')) {
      toast.show('Algunos movimientos quedaron guardados en este equipo; se suben cuando vuelva la conexión.', 'info', 4500)
    }
    return ok
  }, [write, missingTables, toast])

  return {
    data, loading, error, offline, fresh, syncState, syncError, pendingCount, missingTables, prefs, setPrefs,
    reload, sync, write,
    saveServicio: (s) => write({ channel: 'gastos:save-servicio', args: [s] }),
    deleteServicio: (id) => write({ channel: 'gastos:delete-servicio', args: [id] }),
    savePago: (p) => write({ channel: 'gastos:save-pago', args: [p] }),
    deletePago: (id) => write({ channel: 'gastos:delete-pago', args: [id] }),
    savePagosBulk: (ps) => (ps.length ? write({ channel: 'gastos:save-pagos-bulk', args: [ps] }) : Promise.resolve(true)),
    saveGasto: (g) => write({ channel: 'gastos:save-gasto', args: [g] }),
    saveGastosBulk,
    deleteGasto: (id) => write({ channel: 'gastos:delete-gasto', args: [id] }),
  }
}
