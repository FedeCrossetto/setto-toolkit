import { Plus, Receipt, Wallet } from 'lucide-react'
import type { SearchItem, SearchProvider } from '../../core/search'
import { matchesQuery } from '../../core/search'
import { buildMovimientos } from './analytics'
import { readCacheState, type CachedGastos } from './local-store'
import { fechaCorta, fmt } from './format'
import { parseQuickAdd } from './quick-add-parser'
import type { GastosLoadResult } from './types'

let memo: { at: number; data: CachedGastos; fromCache?: boolean } | null = null

/** Datos baratos: caché compartido del main (memo 10 s); si no hay, un `gastos:load` cada 60 s como mucho. */
async function getData(): Promise<CachedGastos | null> {
  if (memo && Date.now() - memo.at < (memo.fromCache ? 10_000 : 60_000)) return memo.data
  const cached = (await readCacheState()).data
  if (cached) { memo = { at: Date.now(), data: cached, fromCache: true }; return cached }
  try {
    const r = await window.api.invoke<GastosLoadResult>('gastos:load')
    memo = { at: Date.now(), data: { servicios: r.servicios ?? [], pagos: r.pagos ?? [], gastos: r.gastos ?? [] } }
    return memo.data
  } catch {
    return null
  }
}

function quickAddItem(text: string, score: number): SearchItem {
  const p = text ? parseQuickAdd(text) : null
  return {
    id: `gastos:quick-add:${text}`,
    title: text ? `Agregar gasto: «${text}»` : 'Nuevo gasto…',
    subtitle: p && p.monto !== null
      ? `${p.moneda === 'USD' ? 'US$' : '$'} ${fmt(p.monto)} · ${p.categoria}${p.metodoPago ? ` · ${p.metodoPago}` : ''}`
      : 'Abre el agregado rápido de Gastos',
    icon: Plus,
    score,
    run: ({ dispatch }) => dispatch({ type: 'OPEN_WITH_INTENT', pluginId: 'gastos', action: 'quick-add', payload: { text } }),
  }
}

export const gastosSearchProvider: SearchProvider = {
  id: 'gastos',
  group: 'Gastos',
  pluginId: 'gastos',
  async search(query) {
    if (!query) return [quickAddItem('', 0)]
    const items: SearchItem[] = []
    // "1500 super" con monto → acción principal; si es sólo texto, queda al final del grupo.
    const parsed = parseQuickAdd(query)
    items.push(quickAddItem(query, parsed.monto !== null ? 100 : -10))

    const data = await getData()
    if (!data) return items
    const open: SearchItem['run'] = ({ dispatch }) => dispatch({ type: 'OPEN_TAB', pluginId: 'gastos' })

    for (const s of data.servicios) {
      if (!matchesQuery(query, s.nombre, s.categoria, s.numeroCuenta)) continue
      items.push({
        id: `gastos:svc:${s.id}`, title: s.nombre, subtitle: `Servicio · ${s.categoria}${s.activo ? '' : ' · inactivo'}`,
        icon: Wallet, score: 5, run: open,
      })
      if (items.length > 6) break
    }

    const recent = buildMovimientos({ ...data }, {}).slice(0, 300)
    let n = 0
    for (const m of recent) {
      if (n >= 5) break
      if (!matchesQuery(query, m.descripcion, m.categoria, m.metodoPago)) continue
      n++
      items.push({
        id: `gastos:mov:${m.id}`, title: m.descripcion,
        subtitle: `${m.categoria} · ${m.moneda === 'USD' ? 'US$' : '$'} ${fmt(m.monto)}`,
        hint: fechaCorta(m.fecha), icon: Receipt, score: 1, run: open,
      })
    }
    return items
  },
}
