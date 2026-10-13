/**
 * Extensiones de CodeMirror para el modo log:
 * - `logHighlight`: tinte por línea según nivel, badge de color sobre el token de nivel,
 *   timestamps y líneas de stack trace (sólo sobre el viewport visible).
 * - `logFilterField` + `setLogFilter`: oculta líneas que no pasan el filtro (nivel,
 *   texto, "Limpiar vista") con decoraciones de bloque que colapsan rangos enteros.
 * - `gotoLogLevel`: navegar al error anterior/siguiente (F8 / Shift+F8).
 */
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { computeHiddenLineRanges, findTimestamp, isLogViewFiltered, isStackTraceLine, parseLogLevel, type LogLevel, type LogViewState } from '../logParsing'

// ── Resaltado ─────────────────────────────────────────────────────────────────

const lineDeco: Record<LogLevel, Decoration> = {
  error: Decoration.line({ class: 'cm-log-line cm-log-error' }),
  warn:  Decoration.line({ class: 'cm-log-line cm-log-warn' }),
  info:  Decoration.line({ class: 'cm-log-line cm-log-info' }),
  debug: Decoration.line({ class: 'cm-log-line cm-log-debug' }),
}
const badgeDeco: Record<LogLevel, Decoration> = {
  error: Decoration.mark({ class: 'cm-log-badge cm-log-badge-error' }),
  warn:  Decoration.mark({ class: 'cm-log-badge cm-log-badge-warn' }),
  info:  Decoration.mark({ class: 'cm-log-badge cm-log-badge-info' }),
  debug: Decoration.mark({ class: 'cm-log-badge cm-log-badge-debug' }),
}
const stackLineDeco = Decoration.line({ class: 'cm-log-stack' })
const timestampDeco = Decoration.mark({ class: 'cm-log-ts' })

const logTheme = EditorView.theme({
  '.cm-log-error': { backgroundColor: 'rgb(var(--c-error) / 0.07)', boxShadow: 'inset 2px 0 rgb(var(--c-error) / 0.55)' },
  '.cm-log-warn':  { backgroundColor: 'rgb(var(--c-warning) / 0.07)', boxShadow: 'inset 2px 0 rgb(var(--c-warning) / 0.55)' },
  '.cm-log-info':  {},
  '.cm-log-debug': { color: 'rgb(var(--c-on-surface-variant))' },
  '.cm-log-stack': {
    color: 'rgb(var(--c-on-surface-variant))',
    backgroundColor: 'rgb(var(--c-error) / 0.035)',
    boxShadow: 'inset 2px 0 rgb(var(--c-error) / 0.25)',
  },
  '.cm-log-badge': { borderRadius: '4px', padding: '0 3px', fontWeight: '600' },
  '.cm-log-badge-error': { color: 'rgb(var(--c-error))', backgroundColor: 'rgb(var(--c-error) / 0.14)' },
  '.cm-log-badge-warn':  { color: 'rgb(var(--c-warning))', backgroundColor: 'rgb(var(--c-warning) / 0.16)' },
  '.cm-log-badge-info':  { color: 'rgb(var(--c-on-surface))', backgroundColor: 'rgb(var(--c-on-surface) / 0.07)' },
  '.cm-log-badge-debug': { color: 'rgb(var(--c-on-surface-variant))', backgroundColor: 'rgb(var(--c-on-surface) / 0.04)', fontWeight: '500' },
  '.cm-log-ts': { color: 'rgb(var(--c-on-surface-variant))' },
})

function buildHighlight(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos)
      const text = line.text
      const lvl = parseLogLevel(text)
      if (lvl) b.add(line.from, line.from, lineDeco[lvl.level])
      else if (isStackTraceLine(text)) b.add(line.from, line.from, stackLineDeco)
      const ts = findTimestamp(text)
      const marks: Array<{ from: number; to: number; deco: Decoration }> = []
      if (ts) marks.push({ from: ts.from, to: ts.to, deco: timestampDeco })
      if (lvl && !(ts && lvl.from < ts.to && lvl.to > ts.from)) marks.push({ from: lvl.from, to: lvl.to, deco: badgeDeco[lvl.level] })
      marks.sort((x, y) => x.from - y.from)
      for (const m of marks) b.add(line.from + m.from, line.from + m.to, m.deco)
      pos = line.to + 1
    }
  }
  return b.finish()
}

const highlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = buildHighlight(view) }
  update(u: ViewUpdate): void {
    if (u.docChanged || u.viewportChanged) this.decorations = buildHighlight(u.view)
  }
}, { decorations: (v) => v.decorations })

export const logHighlight: Extension = [logTheme, highlightPlugin]

// ── Filtro (colapsa líneas) ─────────────────────────────────────────────────────

export const setLogFilter = StateEffect.define<LogViewState | null>()

interface FilterValue { spec: LogViewState | null; deco: DecorationSet }

const hiddenDeco = Decoration.replace({ block: true })

function buildHidden(state: EditorView['state'], spec: LogViewState): DecorationSet {
  const doc = state.doc
  const ranges = computeHiddenLineRanges(doc.iterLines(), spec)
  if (ranges.length === 0) return Decoration.none
  const b = new RangeSetBuilder<Decoration>()
  for (const [start, end] of ranges) {
    const from = doc.line(start).from, to = doc.line(end).to
    // Un rango vacío (sólo líneas en blanco) no se puede colapsar con un reemplazo de bloque
    if (to > from) b.add(from, to, hiddenDeco)
  }
  return b.finish()
}

export const logFilterField = StateField.define<FilterValue>({
  create: () => ({ spec: null, deco: Decoration.none }),
  update(value, tr) {
    let spec = value.spec
    let changed = false
    for (const e of tr.effects) if (e.is(setLogFilter)) { spec = e.value; changed = true }
    if (!changed && !tr.docChanged) return value
    if (!spec || !isLogViewFiltered(spec)) return { spec, deco: Decoration.none }
    return { spec, deco: buildHidden(tr.state, spec) }
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.deco),
    EditorView.atomicRanges.of((view) => view.state.field(f).deco),
  ],
})

function isHidden(view: EditorView, pos: number): boolean {
  let hidden = false
  view.state.field(logFilterField, false)?.deco.between(pos, pos, (from, to) => {
    if (pos >= from && pos <= to) { hidden = true; return false }
    return undefined
  })
  return hidden
}

/**
 * Mueve el cursor a la línea anterior/siguiente con nivel `level` (por defecto
 * error), salteando líneas ocultas por el filtro y dando la vuelta al final.
 * Devuelve false si no hay ninguna.
 */
export function gotoLogLevel(view: EditorView, dir: 1 | -1, level: LogLevel = 'error'): boolean {
  const doc = view.state.doc
  const total = doc.lines
  const current = doc.lineAt(view.state.selection.main.head).number
  for (let step = 1; step <= total; step++) {
    const n = ((current - 1 + dir * step) % total + total) % total + 1
    const line = doc.line(n)
    if (parseLogLevel(line.text)?.level !== level) continue
    if (isHidden(view, line.from)) continue
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    })
    return true
  }
  return false
}
