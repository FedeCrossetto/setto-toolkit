import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, ListPlus, PiggyBank, Plus, RefreshCw, Repeat } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { useConfirm } from '../../core/components/Modal'
import { PageHeader } from '../../core/components/Form'
import { SegmentedControl } from '../../core/components/SegmentedControl'
import { usePluginIntent } from '../../core/AppContext'
import type { Gasto, PagoMensual, ReglaRecurrente, Servicio } from './types'
import { useGastosData } from './hooks/useGastosData'
import { GASTOS_TABLES, useSupabaseHealth } from './hooks/useSupabaseHealth'
import { buildPendientes, categoryBreakdown, currentMes, movimientosToCsv, type Movimiento } from './analytics'
import { fmt, hoyDDMM, mesLong, randomId } from './format'
import { writeLastMethod } from './local-store'
import { notifyGastosChanged } from './direct-write'
import { CATEGORIAS_VARIABLES, isoDate } from './quick-add-parser'
import { buildLearning } from './learning'
import { shouldAutoGenerate } from './recurring'
import { budgetCategories, normalizeBudgets } from './budgets'
import { describeRegla, instanceId, reglaFromGasto } from './recurrence'
import { mutateReglas, readReglas, REGLAS_CHANGED_EVENT, useRecurrentesAuto } from './recurrence-runner'
import { QuickAdd, type QuickAddHandle, type QuickRepeat } from './components/QuickAdd'
import { PresupuestosSheet } from './components/PresupuestosSheet'
import { ReglaSheet } from './components/ReglaSheet'
import { Recurrentes } from './views/Recurrentes'
import { PagoSheet } from './components/PagoSheet'
import { GastoSheet } from './components/GastoSheet'
import { ServicioSheet } from './components/ServicioSheet'
import { ImportDialog } from './components/ImportDialog'
import { ConnectionProblem, MissingTablesCard, SetupEmpty } from './components/HealthCards'
import { useUndo } from '../../core/hooks/useUndo'
import { MonthNav, MoreMenu, Notice, SyncPill, type PillState } from './components/HeaderControls'
import { Resumen } from './views/Resumen'
import { Movimientos } from './views/Movimientos'
import { Tabla } from './views/Tabla'
import { Servicios } from './views/Servicios'
import { useModulePrimaryAction } from '../../core/module-actions'

type View = 'resumen' | 'movimientos' | 'tabla' | 'servicios' | 'recurrentes'

const VIEWS: { value: View; label: string }[] = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'movimientos', label: 'Movimientos' },
  { value: 'tabla', label: 'Tabla' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'recurrentes', label: 'Recurrentes' },
]

type SheetState =
  | { type: 'gasto'; initial?: Partial<Gasto> }
  | { type: 'pago'; initial?: Partial<PagoMensual> }
  | { type: 'servicio'; initial?: Servicio }
  | { type: 'regla'; initial?: ReglaRecurrente }
  | null

function money(g: Pick<Gasto, 'moneda' | 'monto'>): string {
  return `${g.moneda === 'USD' ? 'US$' : '$'} ${fmt(g.monto)}`
}

export function GastosPlugin(): JSX.Element {
  const toast = useToast()
  const confirm = useConfirm()
  const store = useGastosData()
  const { data } = store
  const { undoable } = useUndo()
  /** Toast global con "Deshacer" para cambios ya aplicados (pendientes generados, pagos, importaciones). */
  const showUndo = useCallback((message: string, undo: () => void | Promise<void>) => {
    toast.show(message, 'success', undefined, { label: 'Deshacer', onClick: () => { void undo() } })
  }, [toast])
  const { health, status, checking, check } = useSupabaseHealth(() => { void store.reload() })
  const [view, setView] = useState<View>('resumen')
  const [mes, setMes] = useState(currentMes())
  const [sheet, setSheet] = useState<SheetState>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [presuOpen, setPresuOpen] = useState(false)
  const [reglas, setReglas] = useState<ReglaRecurrente[]>([])
  const quickRef = useRef<QuickAddHandle>(null)
  const pendingQuickText = useRef<string | null>(null)
  const year = Number(mes.slice(0, 4))
  const presupuesto = typeof store.prefs.presupuesto === 'number' && store.prefs.presupuesto > 0 ? store.prefs.presupuesto : null
  const budgets = useMemo(() => normalizeBudgets(store.prefs.presupuestosCategoria), [store.prefs.presupuestosCategoria])

  // Reglas recurrentes: viven en el caché compartido; se releen cuando cambian (motor, otra vista).
  useEffect(() => {
    let alive = true
    const load = (): void => { void readReglas().then((r) => { if (alive) setReglas(r) }) }
    load()
    window.addEventListener(REGLAS_CHANGED_EVENT, load)
    return () => { alive = false; window.removeEventListener(REGLAS_CHANGED_EVENT, load) }
  }, [])
  useRecurrentesAuto(!store.loading)

  const closeSheet = useCallback(() => setSheet(null), [])
  const categoriasServicios = useMemo(() => [...new Set(data.servicios.map((s) => s.categoria))], [data.servicios])
  const categoriasGastos = useMemo(() => [...new Set(data.gastos.map((g) => g.categoria))], [data.gastos])
  const learning = useMemo(() => buildLearning(data.gastos), [data.gastos])

  const gastosTablesMissing = health ? GASTOS_TABLES.filter((t) => !health.tables[t] && health.missingSql.includes(`public.${t} (`)) : []

  // Cuando la base se completa (o se corrige la key) se recarga: sube lo que estaba en cola.
  const prevStatus = useRef(status)
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = status
    if (status === 'ok' && prev !== 'ok' && prev !== 'checking') void store.reload()
  }, [status, store])

  async function verificar(): Promise<void> {
    const h = await check()
    if (!h) return
    if (h.configured && h.reachable && h.authOk && !h.missingSql) toast.show('Supabase está completo y conectado', 'success', 2500)
  }

  // ── Intent "quick-add" (Ctrl+K / captura global → "Gasto") ─────────────────
  usePluginIntent('gastos', (intent) => {
    if (intent.action !== 'quick-add') return
    const text = (intent.payload as { text?: string } | undefined)?.text ?? ''
    pendingQuickText.current = text
    setView((v) => (v === 'resumen' || v === 'movimientos' ? v : 'resumen'))
    setMes(currentMes())
    setTimeout(() => {
      if (pendingQuickText.current === null || !quickRef.current) return
      quickRef.current.focus(pendingQuickText.current)
      pendingQuickText.current = null
    }, 0)
  })

  useEffect(() => {
    if (pendingQuickText.current !== null && quickRef.current) {
      quickRef.current.focus(pendingQuickText.current)
      pendingQuickText.current = null
    }
  })

  // ── Pendientes automáticos del mes (una vez por mes, con Deshacer) ─────────
  const autoRanFor = useRef<string | null>(null)
  useEffect(() => {
    if (store.loading || autoRanFor.current === mes) return
    const input = {
      mes, prefs: store.prefs, fresh: store.fresh,
      pagosReady: !store.missingTables.includes('pagos') && !store.missingTables.includes('servicios'),
    }
    if (!shouldAutoGenerate(input)) return
    autoRanFor.current = mes
    store.setPrefs({ autoPendientesMes: mes })
    const nuevos = buildPendientes(data, mes)
    if (!nuevos.length) return
    void store.savePagosBulk(nuevos)
    showUndo(`Generamos ${nuevos.length} pendiente${nuevos.length === 1 ? '' : 's'} de ${mesLong(mes)}`, async () => {
      for (const p of nuevos) await store.deletePago(p.id)
    })
  }, [store, mes, data, showUndo])

  // ── Acciones ────────────────────────────────────────────────────────────────

  async function saveGasto(g: Gasto, fromQuick = false, repeat: QuickRepeat | null = null): Promise<void> {
    setSheet(null)
    if (repeat) { await saveRecurring(g, repeat); return }
    await store.saveGasto(g)
    if (fromQuick) showUndo(`Gasto agregado: ${g.descripcion} · ${money(g)}`, () => { void store.deleteGasto(g.id) })
  }

  /** Guarda el gasto y crea la regla: el gasto cuenta como su primera instancia. */
  async function saveRecurring(g: Gasto, repeat: QuickRepeat): Promise<void> {
    const ruleId = randomId()
    const isNew = !data.gastos.some((x) => x.id === g.id)
    const first = isNew ? { ...g, id: instanceId(ruleId, g.fecha) } : g
    const rule = reglaFromGasto(first, repeat.frecuencia, ruleId)
    if (repeat.dia && repeat.frecuencia !== 'semanal') rule.dia = repeat.dia
    await mutateReglas((rs) => [...rs, rule])
    await store.saveGasto(first)
    showUndo(`${first.descripcion} · ${money(first)} — se repite: ${describeRegla(rule).toLowerCase()}`, async () => {
      await mutateReglas((rs) => rs.filter((r) => r.id !== ruleId))
      if (isNew) await store.deleteGasto(first.id)
    })
  }

  async function saveRegla(r: ReglaRecurrente): Promise<void> {
    setSheet(null)
    await mutateReglas((rs) => (rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r]))
  }

  async function toggleRegla(r: ReglaRecurrente): Promise<void> {
    // Al reanudar no se carga lo del período en pausa.
    const next = r.pausada ? { ...r, pausada: false, hasta: isoDate(new Date()) } : { ...r, pausada: true }
    await saveRegla(next)
    toast.show(next.pausada ? `${r.descripcion} en pausa` : `${r.descripcion} reanudado`, 'success', 2500)
  }

  async function deleteRegla(r: ReglaRecurrente): Promise<void> {
    setSheet(null)
    await undoable({
      message: `Recurrente eliminado: ${r.descripcion} (los gastos ya cargados quedan)`,
      apply: async () => { await mutateReglas((rs) => rs.filter((x) => x.id !== r.id)) },
      undo: async () => { await mutateReglas((rs) => (rs.some((x) => x.id === r.id) ? rs : [...rs, r])) },
      undoneMessage: 'Recurrente restaurado',
    })
  }

  async function saveMany(gs: Gasto[], label: string): Promise<void> {
    if (!gs.length) return
    await store.saveGastosBulk(gs)
    showUndo(label, async () => { for (const g of gs) await store.deleteGasto(g.id) })
  }

  async function deleteGasto(g: Gasto): Promise<void> {
    setSheet(null)
    await undoable({
      message: `Gasto eliminado: ${g.descripcion} · ${money(g)}`,
      apply: async () => { await store.deleteGasto(g.id) },
      undo: async () => { await store.saveGasto(g) },
      undoneMessage: 'Gasto restaurado',
    })
  }

  async function savePago(p: PagoMensual): Promise<void> {
    setSheet(null)
    await store.savePago(p)
  }

  async function deletePago(p: PagoMensual): Promise<void> {
    const svc = data.servicios.find((s) => s.id === p.servicioId)
    setSheet(null)
    await undoable({
      message: `Pago eliminado: ${svc?.nombre ?? ''} · $ ${fmt(p.monto)}`,
      apply: async () => { await store.deletePago(p.id) },
      undo: async () => { await store.savePago(p) },
      undoneMessage: 'Pago restaurado',
    })
  }

  function lastMethodOf(servicioId: string): string | undefined {
    return [...data.pagos]
      .filter((x) => x.servicioId === servicioId && x.pagado && x.metodoPago)
      .sort((a, b) => b.mes.localeCompare(a.mes))[0]?.metodoPago
  }

  async function pagar(items: Array<{ pago: PagoMensual; monto: number }>): Promise<void> {
    if (!items.length) return
    const originals = items.map((x) => x.pago)
    const pagados = items.map(({ pago, monto }) => ({
      ...pago, monto, pagado: true, fecha: pago.fecha ?? hoyDDMM(), metodoPago: pago.metodoPago ?? lastMethodOf(pago.servicioId),
    }))
    await store.savePagosBulk(pagados)
    const nombre = items.length === 1 ? data.servicios.find((s) => s.id === items[0]!.pago.servicioId)?.nombre ?? 'Pago' : null
    showUndo(nombre ? `${nombre} pagado · $ ${fmt(items[0]!.monto)}` : `${items.length} pagos marcados como pagados`,
      () => { void store.savePagosBulk(originals) })
  }

  async function generarPendientes(): Promise<void> {
    const nuevos = buildPendientes(data, mes)
    if (!nuevos.length) { toast.show('Todos los servicios activos ya tienen su pago este mes', 'info', 2500); return }
    await store.savePagosBulk(nuevos)
    showUndo(`Generamos ${nuevos.length} pendiente${nuevos.length === 1 ? '' : 's'}`, async () => {
      for (const p of nuevos) await store.deletePago(p.id)
    })
  }

  async function saveServicio(s: Servicio, dia: number | null): Promise<void> {
    setSheet(null)
    const dias = { ...(store.prefs.diasVencimiento ?? {}) }
    if (dia) dias[s.id] = dia
    else delete dias[s.id]
    store.setPrefs({ diasVencimiento: dias })
    await store.saveServicio(s)
  }

  async function deleteServicio(s: Servicio): Promise<void> {
    const count = data.pagos.filter((p) => p.servicioId === s.id).length
    const ok = await confirm({
      title: `¿Eliminar ${s.nombre}?`,
      message: count ? `También se eliminan sus ${count} pagos cargados. Si sólo dejaste de pagarlo, mejor desactivalo.` : undefined,
      confirmLabel: 'Eliminar', destructive: true,
    })
    if (!ok) return
    setSheet(null)
    await store.deleteServicio(s.id)
  }

  async function exportCsv(movs: Movimiento[], label: string): Promise<void> {
    try {
      const res = await window.api.invoke<{ ok: boolean; filePath?: string }>('gastos:export-csv', {
        filename: `gastos-${label.toLowerCase().replace(/\s+/g, '-')}.csv`,
        content: movimientosToCsv(movs),
      })
      if (res.ok) toast.show('CSV exportado', 'success', 2500)
    } catch (e) {
      toast.show(`No se pudo exportar: ${String(e).replace(/^Error:\s*/, '')}`, 'error', 5000)
    }
  }

  const openMovimiento = useCallback((m: Movimiento): void => {
    if (m.kind === 'variable') setSheet({ type: 'gasto', initial: m.ref as Gasto })
    else setSheet({ type: 'pago', initial: m.ref as PagoMensual })
  }, [])

  const deleteRef = useRef<(m: Movimiento) => void>(() => undefined)
  deleteRef.current = (m) => { void (m.kind === 'variable' ? deleteGasto(m.ref as Gasto) : deletePago(m.ref as PagoMensual)) }
  const deleteMovimiento = useCallback((m: Movimiento) => deleteRef.current(m), [])
  const focusQuick = useCallback(() => quickRef.current?.focus(), [])

  function openPresupuesto(): void {
    setPresuOpen(true)
  }

  function savePresupuestos(total: number | null, porCategoria: Record<string, number>): void {
    store.setPrefs({ presupuesto: total, presupuestosCategoria: porCategoria })
    setPresuOpen(false)
    // Inicio relee los totales (y las categorías en riesgo) en cuanto el caché se escribe.
    setTimeout(notifyGastosChanged, 300)
  }

  const presuCategorias = useMemo(() => budgetCategories(CATEGORIAS_VARIABLES, data, budgets), [data, budgets])
  const gastadoPorCategoria = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categoryBreakdown(data, mes)) m.set(c.label.toLowerCase(), (m.get(c.label.toLowerCase()) ?? 0) + c.value)
    return m
  }, [data, mes])

  // ── Render ──────────────────────────────────────────────────────────────────

  const showQuick = view === 'resumen' || view === 'movimientos'
  const hasData = data.servicios.length > 0 || data.gastos.length > 0 || data.pagos.length > 0
  const pillState: PillState = store.syncState === 'syncing' ? 'syncing'
    : status === 'unconfigured' ? 'unconfigured'
      : status === 'auth' ? 'auth'
        : gastosTablesMissing.length ? 'incomplete'
          : store.syncState

  const setupNeeded = status === 'unconfigured' && !hasData && !store.loading
  const blocking = store.error && !hasData && !setupNeeded


  // Barra superior: "Nuevo gasto" enfoca el agregado rápido.
  useModulePrimaryAction('gastos', { label: 'Nuevo gasto' }, () => {
    setView((v) => (v === 'resumen' || v === 'movimientos' ? v : 'resumen'))
    setTimeout(() => quickRef.current?.focus(''), 0)
  })

  return (
    <div className="h-full overflow-y-auto bg-background text-on-surface">
      <div className="px-8 py-7 max-w-6xl mx-auto flex flex-col gap-5">
        <PageHeader
          title="Gastos"
          subtitle="Fijos, variables y presupuesto del mes"
          actions={
            <>
              <SyncPill state={pillState} pendingCount={store.pendingCount} error={store.syncError ?? health?.error ?? null}
                onClick={() => { void check(); void (store.offline || pillState !== 'ok' ? store.reload() : store.sync()) }} />
              <MonthNav mes={mes} onChange={setMes} />
              <MoreMenu items={[
                { label: 'Importar movimientos…', icon: <FileUp size={14} />, onSelect: () => setImportOpen(true) },
                { label: 'Generar pendientes del mes', icon: <ListPlus size={14} />, onSelect: () => { void generarPendientes() } },
                { label: 'Presupuestos…', icon: <PiggyBank size={14} />, onSelect: openPresupuesto },
                { label: 'Nuevo gasto recurrente…', icon: <Repeat size={14} />, onSelect: () => setSheet({ type: 'regla' }) },
                { label: 'Recargar desde Supabase', icon: <RefreshCw size={14} />, onSelect: () => { void check(); void store.reload() } },
              ]} />
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => setSheet({ type: 'gasto' })}>
                <Plus size={14} /> Nuevo gasto
              </button>
            </>
          }
        />

        <div className="flex items-center gap-3 hairline-b pb-3 -mt-1">
          <SegmentedControl<View> options={VIEWS} value={view} onChange={setView} />
        </div>

        {health && (status === 'auth' || status === 'unreachable') && hasData && (
          <ConnectionProblem health={health} checking={checking} onRetry={() => { void check(); void store.reload() }} />
        )}
        {health && status === 'unconfigured' && hasData && (
          <Notice action={<button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { void verificar() }}>Verificar</button>}>
            Gastos no está conectado a Supabase: estás viendo lo guardado en este equipo. Configuralo en Conexiones.
          </Notice>
        )}
        {health && gastosTablesMissing.length > 0 && (
          <MissingTablesCard health={health} checking={checking} pendingCount={store.pendingCount} onCheck={() => { void verificar() }} />
        )}
        {!health && store.missingTables.length > 0 && (
          <Notice>Faltan tablas en Supabase ({store.missingTables.join(', ')}). Lo nuevo se guarda en este equipo.</Notice>
        )}
        {store.offline && status === 'ok' && (
          <Notice action={<button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { void store.reload() }}>Reintentar</button>}>
            Sin conexión con Supabase: estás viendo los datos guardados en este equipo. {store.syncError}
          </Notice>
        )}

        {setupNeeded ? (
          <SetupEmpty checking={checking} onCheck={() => { void verificar() }} />
        ) : store.loading && !hasData ? (
          <p className="t-footnote text-on-surface-variant py-16 text-center">Cargando gastos…</p>
        ) : blocking ? (
          <div className="ui-card px-6 py-10 flex flex-col items-center gap-3 text-center">
            <p className="t-headline text-on-surface">No se pudieron cargar los gastos</p>
            <p className="t-footnote text-on-surface-variant max-w-md">{store.error}</p>
            <button type="button" className="ui-btn ui-btn-outline" onClick={() => { void check(); void store.reload() }}>Reintentar</button>
          </div>
        ) : (
          <>
            {showQuick && (
              <QuickAdd ref={quickRef} learning={learning}
                onSave={(g, repeat) => { void saveGasto(g, true, repeat ?? null) }}
                onSaveMany={(gs) => { void saveMany(gs, `${gs.length} gastos agregados`) }}
                onMore={(draft) => setSheet({ type: 'gasto', initial: draft })} />
            )}
            {view === 'resumen' && (
              <Resumen
                data={data} mes={mes} presupuesto={presupuesto} budgets={budgets}
                onSelectMes={setMes}
                onEditPresupuesto={openPresupuesto}
                onPagar={(items) => { void pagar(items) }}
                onEditPago={(p) => setSheet({ type: 'pago', initial: p })}
                onGenerarPendientes={() => { void generarPendientes() }}
                onOpenMovimiento={openMovimiento}
                onShowMovimientos={() => setView('movimientos')}
              />
            )}
            {view === 'movimientos' && (
              <Movimientos data={data} mes={mes} onOpen={openMovimiento} onDelete={deleteMovimiento} onNew={focusQuick}
                onUpdateGasto={(g) => { writeLastMethod(g.metodoPago); void store.saveGasto(g) }}
                onUpdatePago={(p) => { void store.savePago(p) }}
                onExport={(movs, label) => { void exportCsv(movs, label) }} />
            )}
            {view === 'tabla' && (
              <Tabla servicios={data.servicios} pagos={data.pagos} year={year}
                onEditPago={(p) => setSheet({ type: 'pago', initial: p })}
                onAddPago={(servicioId, m) => setSheet({ type: 'pago', initial: { servicioId, mes: m } })} />
            )}
            {view === 'servicios' && (
              <Servicios servicios={data.servicios} pagos={data.pagos}
                onAdd={() => setSheet({ type: 'servicio' })}
                onEdit={(s) => setSheet({ type: 'servicio', initial: s })}
                onDelete={(s) => { void deleteServicio(s) }}
                onToggle={(s) => { void store.saveServicio({ ...s, activo: !s.activo }) }} />
            )}
            {view === 'recurrentes' && (
              <Recurrentes reglas={reglas}
                onAdd={() => setSheet({ type: 'regla' })}
                onEdit={(r) => setSheet({ type: 'regla', initial: r })}
                onToggle={(r) => { void toggleRegla(r) }}
                onDelete={(r) => { void deleteRegla(r) }} />
            )}
          </>
        )}
      </div>

      <GastoSheet open={sheet?.type === 'gasto'} initial={sheet?.type === 'gasto' ? sheet.initial : undefined}
        categoriasUsadas={categoriasGastos}
        onSave={(g, repite) => { void saveGasto(g, false, repite ? { frecuencia: repite, dia: null } : null) }}
        onDelete={(g) => { void deleteGasto(g) }} onClose={closeSheet} />
      <ReglaSheet open={sheet?.type === 'regla'} initial={sheet?.type === 'regla' ? sheet.initial : undefined}
        categoriasUsadas={categoriasGastos}
        onSave={(r) => { void saveRegla(r) }} onDelete={(r) => { void deleteRegla(r) }} onClose={closeSheet} />
      <PagoSheet open={sheet?.type === 'pago'} initial={sheet?.type === 'pago' ? sheet.initial : undefined}
        servicios={data.servicios} pagos={data.pagos}
        onSave={(p) => { void savePago(p) }} onDelete={(p) => { void deletePago(p) }} onClose={closeSheet} />
      <ServicioSheet open={sheet?.type === 'servicio'} initial={sheet?.type === 'servicio' ? sheet.initial : undefined}
        categorias={categoriasServicios}
        diaVencimiento={sheet?.type === 'servicio' && sheet.initial ? store.prefs.diasVencimiento?.[sheet.initial.id] : undefined}
        onSave={(s, dia) => { void saveServicio(s, dia) }} onDelete={(s) => { void deleteServicio(s) }} onClose={closeSheet} />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} existing={data.gastos} learning={learning}
        onImport={(gs) => { setImportOpen(false); void saveMany(gs, `Importamos ${gs.length} movimiento${gs.length === 1 ? '' : 's'}`) }} />

      <PresupuestosSheet open={presuOpen} total={presupuesto} budgets={budgets} categorias={presuCategorias}
        gastadoPorCategoria={gastadoPorCategoria} onSave={savePresupuestos} onClose={() => setPresuOpen(false)} />
    </div>
  )
}
