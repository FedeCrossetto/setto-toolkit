import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Ban, Binary, CalendarDays, Check, ChevronDown, ChevronsUpDown, Code2, Copy, Eye, Hash, Type, Download, FileCode2, FileSpreadsheet, KeyRound, Loader2, Lock, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react'
import { useToast } from '../../core/components/Toast'
import { CopyGlyph, useFlash } from '../../core/components/Pop'
import { Modal } from '../../core/components/Modal'
import { ContextMenu, type MenuItem } from '../../core/components/ContextMenu'
import { toCsv, toTsv } from './sql-text'
import { buildXlsx, isNumericType, toInsertSql } from './export'
import { compareCells, prettyValue, toJiraTable, toMarkdownTable } from './sql-tools'
import { buildApplyScript, buildStatements, cellInput, countEdits, emptyEdits, isTextType, type CellValue, type EditTarget, type GridEdits } from './edit-script'
import type { QuerySet } from './types'


/**
 * Grilla de resultados, como en DataGrip:
 * - Selección: clic, Shift+clic, flechas o arrastrar para un rango, Ctrl+A todo, Ctrl+C copia (para Excel).
 * - Edición (si es una sola tabla): doble clic / Enter / F2 edita, + Fila, clic derecho para
 *   NULL o eliminar. Los cambios quedan pendientes hasta ✓ Commit (Ctrl+Enter) o ✕ Rollback.
 * - Copiar / INSERT / Excel / CSV.
 */
export interface GridEditing {
  /** null = no se puede editar (ver `blocker`) */
  target: EditTarget | null
  blocker: string | null
  /** Todavía se está viendo si se puede editar (clave primaria) */
  pending?: boolean
  /** Dónde se escribe, para mostrarlo ("Local · wgdb_000") */
  where?: string
  /** Ejecuta el script; true si salió bien. `keys` = filas tocadas (para el destello al refrescar) */
  onApply: (script: string, count: number, keys: string[]) => Promise<boolean>
  onOpenScript: (sql: string) => void
}

type CellRef = { kind: 'row' | 'new'; i: number; c: number }

/** Ícono según el tipo de la columna (encabezado). */
function TypeGlyph({ type }: { type: string | undefined }): JSX.Element | null {
  const t = (type ?? '').toLowerCase()
  const cls = 'inline shrink-0 text-on-surface-variant/55 mr-1 -mt-px'
  if (/int|decimal|numeric|money|float|real/.test(t)) return <Hash size={10} className={cls} />
  if (/date|time/.test(t)) return <CalendarDays size={10} className={cls} />
  if (t === 'bit') return <Check size={10} className={cls} />
  if (/binary|image|timestamp|rowversion/.test(t)) return <Binary size={10} className={cls} />
  if (/char|text|xml|uniqueidentifier|sysname/.test(t)) return <Type size={10} className={cls} />
  return null
}
const DENSITY_KEY = 'sql-runner:grid-density'
type Pos = { r: number; c: number }

export function ResultGrid({ set, name, table, editing, flash }: {
  set: QuerySet
  name: string
  /** Tabla de origen para "Copiar como INSERT" */
  table?: string
  editing?: GridEditing
  /** Filas recién guardadas con Commit: destellan en verde */
  flash?: { keys: string[]; until: number }
}): JSX.Element {
  const toast = useToast()
  const [anchor, setAnchor] = useState<Pos | null>(null)
  const [focus, setFocus] = useState<Pos | null>(null)
  const [edit, setEdit] = useState<CellRef | null>(null)
  const [filter, setFilter] = useState('')
  /** Orden por columna (clic en el encabezado): asc → desc → sin orden */
  const [sort, setSort] = useState<{ c: number; dir: 1 | -1 } | null>(null)
  /** Visor de un valor largo (JSON, XML, texto) */
  const [viewer, setViewer] = useState<{ column: string; value: string } | null>(null)
  const [copyMenu, setCopyMenu] = useState<{ x: number; y: number } | null>(null)
  /** Ancho elegido por columna (arrastrando el borde del encabezado) */
  const [widths, setWidths] = useState<Record<number, number>>({})
  /** Filas compactas o cómodas (se recuerda) */
  const [comfy, setComfy] = useState(() => { try { return localStorage.getItem(DENSITY_KEY) === 'comfy' } catch { return false } })
  const toggleDensity = (): void => setComfy((v) => { try { localStorage.setItem(DENSITY_KEY, v ? 'compact' : 'comfy') } catch { /* nada */ } return !v })
  const startResize = (e: React.PointerEvent, c: number): void => {
    e.preventDefault(); e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement
    const start = e.clientX
    const base = th?.getBoundingClientRect().width ?? 120
    const move = (ev: PointerEvent): void => setWidths((w) => ({ ...w, [c]: Math.max(48, Math.min(900, Math.round(base + ev.clientX - start))) }))
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const colStyle = (c: number): React.CSSProperties | undefined => (widths[c] ? { width: widths[c], minWidth: widths[c], maxWidth: widths[c] } : undefined)
  const [edits, setEdits] = useState<GridEdits>(emptyEdits)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const dragging = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const target = editing?.target ?? null
  const canEdit = !!target
  const [allCopied, flashAll] = useFlash()
  const [insCopied, flashIns] = useFlash()
  /** Celdas que acaban de volver a su valor (Rollback / deshacer): fundido rojo → normal */
  const [reverting, setReverting] = useState<Set<string>>(new Set())
  /** Clave de una fila (clave primaria, o toda la fila si no hay) para el destello del Commit */
  const keyCols = target ? (target.keyMode === 'all' ? set.columns.map((_, i) => i) : target.pk.map((k) => set.columns.findIndex((c) => c.toLowerCase() === k.toLowerCase()))) : []
  const rowKey = (vals: (string | null)[]): string => keyCols.map((i) => vals[i] ?? '\u0000').join('\u0001')
  const flashSet = useMemo(() => (flash && flash.until > Date.now() ? new Set(flash.keys) : null), [flash])

  // Resultado nuevo: se descartan los cambios pendientes y la selección.
  useEffect(() => { setEdits(emptyEdits()); setEdit(null); setAnchor(null); setFocus(null); setSort(null); setWidths({}) }, [set])
  useEffect(() => {
    const up = (): void => { dragging.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const all = set.rows.map((row, i) => ({ row, i }))
    const shown = f ? all.filter(({ row }) => row.some((v) => v !== null && v.toLowerCase().includes(f))) : all
    if (!sort) return shown
    return [...shown].sort((a, b) => compareCells(a.row[sort.c] ?? null, b.row[sort.c] ?? null, set.types[sort.c], sort.dir))
  }, [set.rows, set.types, filter, sort])
  const cycleSort = (c: number): void => setSort((s) => (!s || s.c !== c ? { c, dir: 1 } : s.dir === 1 ? { c, dir: -1 } : null))

  /** Filas en pantalla (originales filtradas + nuevas), para la selección por posición. */
  const display = useMemo(
    () => [...rows.map(({ i }) => ({ kind: 'row' as const, i })), ...edits.inserted.map((_, i) => ({ kind: 'new' as const, i }))],
    [rows, edits.inserted],
  )
  const refAt = (p: Pos): CellRef | null => { const d = display[p.r]; return d ? { ...d, c: p.c } : null }
  const rect = anchor && focus
    ? { r0: Math.min(anchor.r, focus.r), r1: Math.max(anchor.r, focus.r), c0: Math.min(anchor.c, focus.c), c1: Math.max(anchor.c, focus.c) }
    : null
  const inRect = (p: Pos): boolean => !!rect && p.r >= rect.r0 && p.r <= rect.r1 && p.c >= rect.c0 && p.c <= rect.c1
  const multi = !!rect && (rect.r0 !== rect.r1 || rect.c0 !== rect.c1)
  const selectAll = (): void => { if (display.length) { setAnchor({ r: 0, c: 0 }); setFocus({ r: display.length - 1, c: set.columns.length - 1 }) } }

  const pending = countEdits(edits)
  const valueOf = (ref: CellRef): CellValue => {
    if (ref.kind === 'new') return edits.inserted[ref.i]?.get(ref.c) ?? null
    const m = edits.updates.get(ref.i)
    return m?.has(ref.c) ? m.get(ref.c)! : set.rows[ref.i]?.[ref.c] ?? null
  }
  const isChanged = (ref: CellRef): boolean => (ref.kind === 'row' ? !!edits.updates.get(ref.i)?.has(ref.c) : !!edits.inserted[ref.i]?.has(ref.c))

  // ── Cambios ──
  const mutate = (fn: (e: GridEdits) => void): void => setEdits((prev) => {
    const next: GridEdits = { updates: new Map([...prev.updates].map(([k, v]) => [k, new Map(v)])), deleted: new Set(prev.deleted), inserted: prev.inserted.map((r) => new Map(r)) }
    fn(next)
    return next
  })
  const setCell = (ref: CellRef, v: CellValue): void => mutate((e) => {
    if (ref.kind === 'new') { e.inserted[ref.i]?.set(ref.c, v); return }
    const orig = set.rows[ref.i]?.[ref.c] ?? null
    const m = e.updates.get(ref.i) ?? new Map<number, CellValue>()
    if (v === orig) m.delete(ref.c); else m.set(ref.c, v)
    if (m.size) e.updates.set(ref.i, m); else e.updates.delete(ref.i)
  })
  const undoCell = (ref: CellRef): void => mutate((e) => {
    if (ref.kind === 'new') { e.inserted[ref.i]?.delete(ref.c); return }
    e.updates.get(ref.i)?.delete(ref.c)
    if (!e.updates.get(ref.i)?.size) e.updates.delete(ref.i)
  })
  const toggleDelete = (ref: CellRef): void => mutate((e) => {
    if (ref.kind === 'new') { e.inserted.splice(ref.i, 1); return }
    if (e.deleted.has(ref.i)) e.deleted.delete(ref.i); else e.deleted.add(ref.i)
  })
  const rollback = (): void => {
    const keys = new Set<string>()
    for (const [r, cols] of edits.updates) for (const c of cols.keys()) keys.add(`row-${r}-${c}`)
    for (const r of edits.deleted) for (let c = 0; c < set.columns.length; c++) keys.add(`row-${r}-${c}`)
    setReverting(keys)
    setTimeout(() => setReverting(new Set()), 420)
    setEdits(emptyEdits()); setEdit(null)
    toast.show('Cambios descartados (rollback)', 'info')
  }
  const addRow = (): void => {
    const i = edits.inserted.length
    mutate((e) => { e.inserted.push(new Map()) })
    const r = rows.length + i
    setAnchor({ r, c: 0 }); setFocus({ r, c: 0 }); setEdit({ kind: 'new', i, c: 0 })
  }
  /** Doble clic / Enter: edita si se puede; si no, dice por qué (nunca copia sin querer). */
  const tryEdit = (ref: CellRef): void => {
    if (!canEdit) {
      if (editing?.pending) { toast.show('Un momento: verificando si este resultado se puede editar…', 'info'); return }
      // No editable: el doble clic abre el valor completo (útil para JSON/XML o textos largos).
      const v = valueOf(ref)
      if (v !== null) setViewer({ column: set.columns[ref.c] ?? '', value: v })
      return
    }
    if (ref.kind === 'row' && edits.deleted.has(ref.i)) return
    setEdit(ref)
  }
  const commitCell = (ref: CellRef, raw: string, move?: 1 | -1): void => {
    const prev = valueOf(ref)
    const v = cellInput(raw, prev, set.types[ref.c])
    if (v !== prev) setCell(ref, v)
    setEdit(null)
    rootRef.current?.focus()
    if (move && focus) {
      const c = ref.c + move
      if (c >= 0 && c < set.columns.length) { const p = { r: focus.r, c }; setAnchor(p); setFocus(p); setEdit({ ...ref, c }) }
    }
  }

  // ── Copiar / exportar ──
  const copy = async (text: string, what: string): Promise<void> => {
    try { await navigator.clipboard.writeText(text); toast.show(`${what} ${/celdas$/.test(what) ? 'copiadas' : /^(Tabla|Selección)/.test(what) ? 'copiada' : 'copiado'}`, 'success') } catch { toast.show('No se pudo copiar', 'error') }
  }
  /** Filas para "Copiar como…": la selección (si hay más de una celda) o todo el resultado, en el orden de la grilla. */
  const copyRows = (): (string | null)[][] => {
    if (rect && multi) {
      const out: (string | null)[][] = []
      for (let r = rect.r0; r <= rect.r1; r++) { const d = display[r]; if (d?.kind === 'row') out.push((set.rows[d.i] ?? []).slice(rect.c0, rect.c1 + 1)) }
      return out
    }
    return rows.map(({ row }) => row)
  }
  const copyCols = (): string[] => (rect && multi ? set.columns.slice(rect.c0, rect.c1 + 1) : set.columns)
  const copySelection = (): void => {
    if (!rect) return
    if (!multi) { const ref = refAt({ r: rect.r0, c: rect.c0 }); if (ref) void copy(valueOf(ref) ?? 'NULL', 'Valor'); return }
    const lines: string[] = []
    for (let r = rect.r0; r <= rect.r1; r++) {
      const cells: string[] = []
      for (let c = rect.c0; c <= rect.c1; c++) { const ref = refAt({ r, c }); const v = ref ? valueOf(ref) : null; cells.push((v ?? '').replace(/[\t\r\n]+/g, ' ')) }
      lines.push(cells.join('\t'))
    }
    void copy(lines.join('\n'), `${(rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1)} celdas`)
  }
  const download = (blob: Blob, ext: string): void => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name.replace(/[^\w.-]+/g, '_') || 'resultado'}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const exportCsv = (): void => download(new Blob(['﻿' + toCsv(set.columns, set.rows)], { type: 'text/csv;charset=utf-8' }), 'csv')
  const exportXlsx = (): void => {
    download(new Blob([buildXlsx(set.columns, set.rows, set.types, name)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx')
    toast.show('Excel generado', 'success')
  }

  const statements = target && pending ? buildStatements(target, set.rows, edits) : []
  const commit = async (): Promise<void> => {
    if (!target || !editing || !pending || applying) return
    setEdit(null)
    setApplying(true)
    try {
      // Filas que van a destellar cuando se refresque el resultado.
      const keys: string[] = []
      for (const r of edits.updates.keys()) {
        if (edits.deleted.has(r)) continue
        const row = [...(set.rows[r] ?? [])]
        for (const [c, v] of edits.updates.get(r)!) row[c] = v
        keys.push(rowKey(row))
      }
      for (const ins of edits.inserted) if (ins.size) keys.push(rowKey(set.columns.map((_, c) => ins.get(c) ?? null)))
      const ok = await editing.onApply(buildApplyScript(target, set.rows, edits), pending, keys)
      if (ok) { setScriptOpen(false); setEdits(emptyEdits()) }
    } finally { setApplying(false) }
  }

  const cellMenu = (e: React.MouseEvent, p: Pos, ref: CellRef): void => {
    e.preventDefault()
    const inSel = multi && inRect(p)
    if (!inRect(p)) { setAnchor(p); setFocus(p) }
    const v = valueOf(ref)
    const deleted = ref.kind === 'row' && edits.deleted.has(ref.i)
    const items: MenuItem[] = [
      { label: inSel ? 'Copiar selección' : 'Copiar valor', icon: Copy, shortcut: 'Ctrl+C', action: () => (inSel ? copySelection() : void copy(v ?? 'NULL', 'Valor')) },
      { label: 'Ver valor completo', icon: Eye, shortcut: 'Shift+Enter', action: () => { if (v !== null) setViewer({ column: set.columns[ref.c] ?? '', value: v }) }, disabled: v === null },
    ]
    if (canEdit) {
      items.push(
        { label: 'Editar', icon: Pencil, shortcut: 'Enter', action: () => tryEdit(ref), disabled: deleted, divider: true },
        { label: 'Poner NULL', icon: Ban, shortcut: 'Ctrl+0', action: () => setCell(ref, null), disabled: deleted },
        { label: 'Deshacer cambio', icon: Undo2, action: () => undoCell(ref), disabled: !isChanged(ref) },
        { label: ref.kind === 'new' ? 'Quitar fila nueva' : deleted ? 'Restaurar fila' : 'Eliminar fila', icon: deleted ? RotateCcw : Trash2, danger: !deleted, action: () => toggleDelete(ref), divider: true },
      )
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const renderCell = (p: Pos, ref: CellRef, rowDeleted: boolean): JSX.Element => {
    const v = valueOf(ref)
    const selected = inRect(p)
    const isFocus = !!focus && focus.r === p.r && focus.c === p.c
    const changed = isChanged(ref)
    const numeric = isNumericType(set.types[ref.c])
    if (edit && edit.kind === ref.kind && edit.i === ref.i && edit.c === ref.c) {
      return (
        <td key={ref.c} className="p-0 border-b border-r border-(--hairline) bg-surface">
          <input autoFocus defaultValue={v ?? ''} spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commitCell(ref, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); commitCell(ref, e.currentTarget.value) }
              else if (e.key === 'Escape') { e.preventDefault(); setEdit(null); rootRef.current?.focus() }
              else if (e.key === 'Tab') { e.preventDefault(); commitCell(ref, e.currentTarget.value, e.shiftKey ? -1 : 1) }
            }}
            placeholder={v === null ? 'NULL' : undefined}
            title={isTextType(set.types[ref.c]) ? 'Vacío = texto vacío · escribí NULL (o Ctrl+0) para NULL' : 'Vacío o NULL = NULL'}
            className={`w-full min-w-[120px] h-[22px] px-2 bg-transparent outline outline-2 -outline-offset-2 outline-primary text-on-surface font-mono text-[12px] ${numeric ? 'text-right' : ''}`} />
        </td>
      )
    }
    return (
      <td key={ref.c} style={colStyle(ref.c)}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          if (e.shiftKey && anchor) setFocus(p)
          else { setAnchor(p); setFocus(p); dragging.current = true }
        }}
        onMouseEnter={() => { if (dragging.current) setFocus(p) }}
        onDoubleClick={() => tryEdit(ref)}
        onContextMenu={(e) => cellMenu(e, p, ref)}
        title={v !== null && v.length > 60 ? v.slice(0, 2000) : undefined}
        className={`px-2.5 ${comfy ? 'py-[5px]' : ''} ${widths[ref.c] ? '' : 'max-w-[420px]'} truncate whitespace-nowrap border-b border-r border-(--hairline) cursor-cell select-none ${numeric ? 'text-right tabular-nums' : ''} ${
          isFocus ? 'outline outline-1 -outline-offset-1 outline-primary/70' : ''} ${
          changed ? 'bg-warning/15' : selected ? 'bg-primary/15' : 'group-hover:bg-on-surface/4'} ${reverting.has(`${ref.kind}-${ref.i}-${ref.c}`) ? 'cell-revert' : ''} ${
          rowDeleted ? 'line-through text-error/70' : v === null ? 'text-on-surface-variant/45 italic' : 'text-on-surface'}`}>
        {v === null ? 'NULL' : v}
      </td>
    )
  }

  return (
    <div ref={rootRef} className="flex flex-col h-full min-h-0 outline-hidden" tabIndex={0} data-grid-pending={pending ? '1' : undefined}
      onKeyDown={(e) => {
        if (edit || (e.target as HTMLElement).tagName === 'INPUT') return
        const ctrl = e.ctrlKey || e.metaKey
        const k = e.key.toLowerCase()
        if (ctrl && k === 'a') { e.preventDefault(); selectAll(); return }
        if (ctrl && k === 'c') { e.preventDefault(); copySelection(); return }
        if (ctrl && e.key === 'Enter') { e.preventDefault(); void commit(); return }
        if (!focus) return
        const ref = refAt(focus)
        if (!ref) return
        if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); const v = valueOf(ref); if (v !== null) setViewer({ column: set.columns[ref.c] ?? '', value: v }); return }
        if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); tryEdit(ref); return }
        if (canEdit && ctrl && e.key === '0') { e.preventDefault(); setCell(ref, null); return }
        const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
        const mv = moves[e.key]
        if (mv) {
          e.preventDefault()
          const p = { r: Math.max(0, Math.min(display.length - 1, focus.r + mv[0])), c: Math.max(0, Math.min(set.columns.length - 1, focus.c + mv[1])) }
          setFocus(p); if (!e.shiftKey) setAnchor(p)
        }
      }}>
      <div className="flex items-center gap-2 px-3 h-[36px] hairline-b shrink-0 min-w-0">
        <span className="t-footnote text-on-surface-variant tabular-nums shrink-0">
          {set.total > set.rows.length ? `${set.rows.length.toLocaleString('es-AR')} de ${set.total.toLocaleString('es-AR')} filas` : `${set.total.toLocaleString('es-AR')} ${set.total === 1 ? 'fila' : 'filas'}`}
          {filter && ` · ${rows.length} coinciden`}
          {multi && rect && ` · ${(rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1)} celdas seleccionadas`}
        </span>
        {editing && (canEdit ? (
          <>
            <span className="flex items-center gap-1 t-caption text-success shrink-0" title={`Doble clic en una celda para editar · clic derecho para NULL o eliminar · tabla ${target!.table}`}>
              <Pencil size={11} /> Editable
            </span>
            {target!.keyMode === 'all' && (
              <span className="t-caption text-warning cursor-help shrink-0" title="La tabla no tiene clave primaria: cada fila se identifica por todas sus columnas. Si un cambio no encuentra exactamente una fila, no se aplica nada.">
                · sin clave primaria
              </span>
            )}
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" onClick={addRow} title={`Agregar una fila a ${target!.table}`}><Plus size={12} /> Fila</button>
          </>
        ) : editing.pending ? (
          <span className="flex items-center gap-1 t-caption text-on-surface-variant/80 shrink-0"><Loader2 size={11} className="animate-spin" /> Verificando si se puede editar…</span>
        ) : editing.blocker && (
          <span className="flex items-center gap-1 min-w-0 t-caption text-on-surface-variant/80 cursor-help" title={editing.blocker}>
            <Lock size={11} className="shrink-0" /> <span className="truncate max-w-[420px]">No editable: {editing.blocker.replace(/\.$/, '')}</span>
          </span>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={toggleDensity} title={comfy ? 'Filas compactas' : 'Filas más cómodas'} aria-pressed={comfy}
          className={`ui-btn ui-btn-ghost ui-btn-icon w-[26px]! h-[26px]! ${comfy ? 'text-primary' : ''}`}><ChevronsUpDown size={13} /></button>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar filas…"
          className="ui-input h-[26px] w-[150px] text-[12px] px-2.5" />
        <div className="flex items-center rounded-[8px] hover:bg-on-surface/4">
          <button className="ui-btn ui-btn-ghost ui-btn-sm rounded-r-none!" onClick={() => { void copy(toTsv(set.columns, copyRows()), multi ? 'Selección' : 'Resultado'); flashAll() }} title="Copiar con encabezados (para pegar en Excel)">
            <CopyGlyph copied={allCopied || insCopied} size={12} /> Copiar
          </button>
          <button className="ui-btn ui-btn-ghost ui-btn-sm px-1.5! rounded-l-none!" aria-label="Copiar como…" title="Copiar como tabla de Jira, Markdown o INSERT"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setCopyMenu({ x: r.left, y: r.bottom + 4 }) }}>
            <ChevronDown size={12} />
          </button>
        </div>
        <button className="ui-btn ui-btn-outline ui-btn-sm" onClick={exportXlsx} title="Exportar a Excel (.xlsx) con encabezado fijo y filtros">
          <FileSpreadsheet size={13} className="text-[#21a366]" /> Excel
        </button>
        <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={exportCsv} title="Exportar CSV">
          <Download size={12} /> CSV
        </button>
      </div>

      {pending > 0 && (
        <div className="flex items-center gap-2 px-3 h-[40px] shrink-0 bg-warning/10 border-b border-warning/25">
          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse shrink-0" />
          <span className="t-footnote font-medium text-on-surface shrink-0">{pending} {pending === 1 ? 'cambio sin confirmar' : 'cambios sin confirmar'}</span>
          <span className="t-caption text-on-surface-variant truncate">{target?.table}{editing?.where ? ` · ${editing.where}` : ''}</span>
          <span className="flex-1" />
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm shrink-0" onClick={() => setScriptOpen(true)} title="Ver el SQL que se va a ejecutar"><FileCode2 size={12} /> Script</button>
          <button type="button" onClick={rollback} disabled={applying} title="Rollback: descartar los cambios"
            className="flex items-center gap-1.5 h-[28px] px-2.5 rounded-[8px] border border-error/35 bg-error/10 text-error text-[12px] font-semibold hover:bg-error/16 disabled:opacity-40 shrink-0">
            <X size={13} /> Rollback
          </button>
          <button type="button" onClick={() => void commit()} disabled={applying} title="Commit: aplicar los cambios en una transacción (Ctrl+Enter)"
            className="ui-btn-run flex items-center gap-1.5 h-[28px] px-3 rounded-[8px] text-[12px] font-semibold disabled:opacity-50 shrink-0">
            {applying ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {applying ? 'Aplicando…' : 'Commit'}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="border-separate border-spacing-0 font-mono text-[12px] leading-[18px]">
          <thead>
            <tr>
              <th onClick={() => { selectAll(); rootRef.current?.focus() }} title="Seleccionar todo (Ctrl+A)"
                className="sticky top-0 left-0 z-20 bg-surface-container-low px-2 h-[28px] text-right text-on-surface-variant/60 font-normal border-b border-r border-(--hairline) min-w-[44px] cursor-pointer hover:text-on-surface">#</th>
              {set.columns.map((c, i) => {
                const isPk = target?.keyMode !== 'all' && !!target?.pk.some((k) => k.toLowerCase() === c.toLowerCase())
                return (
                  <th key={i} title={`${c}${set.types[i] ? ` · ${set.types[i]}` : ''}${isPk ? ' · clave primaria' : ''}\nClic: ordenar · Ctrl+clic: seleccionar la columna`}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey || e.shiftKey) { if (display.length) { setAnchor({ r: 0, c: i }); setFocus({ r: display.length - 1, c: i }); rootRef.current?.focus() } return }
                      cycleSort(i)
                    }}
                    style={colStyle(i)}
                    className="group/th sticky top-0 z-10 bg-surface-container-low px-2.5 h-[28px] text-left font-sans text-[12px] font-semibold text-on-surface whitespace-nowrap truncate border-b border-r border-(--hairline) cursor-pointer hover:bg-on-surface/6">
                    {isPk ? <KeyRound size={11} className="inline text-warning mr-1 -mt-px" /> : <TypeGlyph type={set.types[i]} />}
                    {c || <span className="text-on-surface-variant/60 font-normal">(sin nombre)</span>}
                    {sort?.c === i && (sort.dir === 1 ? <ArrowUp size={11} className="inline ml-1 -mt-px text-primary" /> : <ArrowDown size={11} className="inline ml-1 -mt-px text-primary" />)}
                    <span role="separator" aria-orientation="vertical" title="Arrastrá para cambiar el ancho · doble clic: ancho automático"
                      onPointerDown={(e) => startResize(e, i)} onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); setWidths((w) => { const n = { ...w }; delete n[i]; return n }) }}
                      className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize hover:bg-primary/40 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {display.map((d, r) => {
              const del = d.kind === 'row' && edits.deleted.has(d.i)
              const isNew = d.kind === 'new'
              return (
                <tr key={`${d.kind}-${d.i}`} className={`group ${del ? 'bg-error/8' : isNew ? 'bg-success/[0.07]' : r % 2 ? 'bg-on-surface/[0.022]' : ''} ${flashSet && d.kind === 'row' && keyCols.length && flashSet.has(rowKey(set.rows[d.i] ?? [])) ? 'row-flash' : ''}`}>
                  <td onMouseDown={() => { setAnchor({ r, c: 0 }); setFocus({ r, c: set.columns.length - 1 }) }} title="Seleccionar la fila"
                    className={`sticky left-0 z-10 px-2 text-right border-b border-r border-(--hairline) tabular-nums select-none cursor-pointer ${
                      del ? 'bg-error/10 text-error' : isNew ? 'bg-success/15 text-success text-center font-semibold' : 'bg-surface text-on-surface-variant/50 group-hover:bg-on-surface/4'}`}>
                    {isNew ? '+' : del ? '−' : edits.updates.has(d.i) ? <span className="text-warning">●</span> : d.i + 1}
                  </td>
                  {set.columns.map((_, c) => renderCell({ r, c }, { kind: d.kind, i: d.i, c }, del))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {canEdit && display.length === 0 && (
          <button type="button" onClick={addRow} className="m-3 flex items-center gap-1.5 t-footnote text-on-surface-variant hover:text-on-surface">
            <Plus size={13} /> Sin filas: agregá una con + Fila
          </button>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {copyMenu && (
        <ContextMenu x={copyMenu.x} y={copyMenu.y} onClose={() => setCopyMenu(null)} items={[
          { label: 'Para Excel (con encabezados)', icon: Copy, action: () => { void copy(toTsv(copyCols(), copyRows()), 'Resultado'); flashAll() } },
          { label: 'Como tabla de Jira', icon: Copy, action: () => { void copy(toJiraTable(copyCols(), copyRows()), 'Tabla de Jira'); flashAll() } },
          { label: 'Como tabla Markdown', icon: Copy, action: () => { void copy(toMarkdownTable(copyCols(), copyRows(), multi && rect ? set.types.slice(rect.c0, rect.c1 + 1) : set.types), 'Tabla Markdown'); flashAll() } },
          { label: `Como INSERT INTO ${table || 'tabla'}`, icon: Code2, divider: true, action: () => { void copy(toInsertSql(table || 'tabla', set.columns, set.rows, set.types), 'INSERT'); flashIns() } },
        ]} />
      )}
      <Modal open={!!viewer} onClose={() => setViewer(null)} width={760}
        title={viewer?.column || 'Valor'}
        subtitle={viewer ? `${viewer.value.length.toLocaleString('es-AR')} caracteres${prettyValue(viewer.value).kind !== 'text' ? ` · ${prettyValue(viewer.value).kind.toUpperCase()} formateado` : ''}` : undefined}
        footer={viewer && (
          <>
            <button type="button" className="ui-btn ui-btn-ghost mr-auto" onClick={() => void copy(viewer.value, 'Valor')}><Copy size={13} /> Copiar original</button>
            {prettyValue(viewer.value).kind !== 'text' && <button type="button" className="ui-btn ui-btn-outline" onClick={() => void copy(prettyValue(viewer.value).text, 'Valor formateado')}><Copy size={13} /> Copiar formateado</button>}
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => setViewer(null)}>Cerrar</button>
          </>
        )}>
        {viewer && <pre className="max-h-[60vh] overflow-auto rounded-[10px] bg-on-surface/5 p-3 font-mono text-[12px] leading-[19px] text-on-surface whitespace-pre-wrap break-all select-text">{prettyValue(viewer.value).text}</pre>}
      </Modal>

      <Modal open={scriptOpen} onClose={() => setScriptOpen(false)} width={720}
        title={`${pending} ${pending === 1 ? 'cambio' : 'cambios'} en ${target?.table ?? ''}`}
        subtitle="Commit corre todo en una transacción: si un UPDATE o DELETE no encuentra exactamente su fila, no se aplica nada."
        footer={(
          <>
            <button type="button" className="ui-btn ui-btn-ghost mr-auto" onClick={() => void copy(statements.join('\n'), 'Script')}><Copy size={13} /> Copiar</button>
            <button type="button" className="ui-btn ui-btn-outline" onClick={() => { editing?.onOpenScript(target ? buildApplyScript(target, set.rows, edits) : ''); setScriptOpen(false) }}>
              <FileCode2 size={13} /> Abrir en una pestaña
            </button>
            <button type="button" className="ui-btn ui-btn-run" onClick={() => void commit()} disabled={applying}><Check size={13} /> {applying ? 'Aplicando…' : 'Commit'}</button>
          </>
        )}>
        <pre className="max-h-[50vh] overflow-auto rounded-[10px] bg-on-surface/5 p-3 font-mono text-[12px] leading-[19px] text-on-surface whitespace-pre-wrap break-all">{statements.join('\n')}</pre>
      </Modal>
    </div>
  )
}
