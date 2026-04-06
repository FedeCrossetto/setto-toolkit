import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import type { PluginHandlers, CoreServices } from '../../core/types'
import type { Servicio, PagoMensual, Credencial, QueryItem } from '../../../src/plugins/gastos/types'

// ── Notion config ──────────────────────────────────────────────────────────────

const NOTION_CONFIG_FILE = 'gastos-notion.json'

interface NotionConfig {
  token: string
  databaseId: string
  lastSyncAt?: string
  credencialesDatabaseId?: string
  credencialesLastSyncAt?: string
}

/** Valores por defecto vacíos. Orden de merge: esto → `gastos-notion.local.json` (raíz del repo, gitignored) → `gastos-notion.json` en userData. */
const DEFAULT_NOTION_CONFIG: NotionConfig = {
  token: '',
  databaseId: '',
  credencialesDatabaseId: '',
}

function readOptionalCwdJson<T extends object>(filename: string): Partial<T> {
  try {
    const p = join(process.cwd(), filename)
    if (!existsSync(p)) return {}
    const data = JSON.parse(readFileSync(p, 'utf8')) as unknown
    return data && typeof data === 'object' ? (data as Partial<T>) : {}
  } catch {
    return {}
  }
}

function mergeNotionConfig(db: CoreServices['db']): NotionConfig {
  return {
    ...DEFAULT_NOTION_CONFIG,
    ...readOptionalCwdJson<NotionConfig>('gastos-notion.local.json'),
    ...(db.readJSON<NotionConfig>(NOTION_CONFIG_FILE) ?? {}),
  }
}

// ── Notion API helpers ─────────────────────────────────────────────────────────

async function notionFetch(token: string, path: string, method = 'GET', body?: object): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10)
      throw new Error(`Notion rate limit alcanzado. Reintentar en ${retryAfter}s`)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Notion API error ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function queryAllNotionPages(token: string, databaseId: string): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined
  do {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const data = await notionFetch(token, `/databases/${databaseId}/query`, 'POST', body)
    results.push(...(data.results ?? []))
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return results
}

// Property builders
function txtProp(value: string) {
  return { rich_text: [{ type: 'text', text: { content: value ?? '' } }] }
}
function titleProp(value: string) {
  return { title: [{ type: 'text', text: { content: value } }] }
}
function selProp(value: string | undefined) {
  return value ? { select: { name: value } } : { select: null }
}

// Property readers
function getTxt(page: any, key: string): string {
  return page.properties?.[key]?.rich_text?.[0]?.text?.content ?? ''
}
function getSel(page: any, key: string): string {
  return page.properties?.[key]?.select?.name ?? ''
}
function getNum(page: any, key: string): number {
  return page.properties?.[key]?.number ?? 0
}
function getChk(page: any, key: string): boolean {
  return page.properties?.[key]?.checkbox ?? false
}

function pagoToNotionProps(pago: PagoMensual, svc?: Servicio) {
  return {
    Nombre:        titleProp(svc ? `${svc.nombre} – ${pago.mes}` : pago.mes),
    pagoId:        txtProp(pago.id),
    servicioId:    txtProp(pago.servicioId),
    Servicio:      txtProp(svc?.nombre ?? pago.servicioId),
    'Categoría':   selProp(svc?.categoria),
    Mes:           txtProp(pago.mes),
    Monto:         { number: pago.monto },
    'Fecha pago':  txtProp(pago.fecha ?? ''),
    'Método':      selProp(pago.metodoPago),
    Pagado:        { checkbox: pago.pagado },
    Notas:         txtProp(pago.notas ?? ''),
  }
}

// ── Credencial ↔ Notion ───────────────────────────────────────────────────────

// NOTE: passwords are intentionally excluded from Notion sync — they stay local only.
function credencialToNotionProps(c: Credencial) {
  return {
    Nombre:       titleProp(c.nombre),
    credencialId: txtProp(c.id),
    Usuario:      txtProp(c.usuario),
    URL:          txtProp(c.url ?? ''),
    Notas:        txtProp(c.notas ?? ''),
    'Categoría':  selProp(c.categoria),
    Orden:        { number: c.orden },
  }
}

function notionPageToCredencial(page: any): Credencial {
  return {
    id:        getTxt(page, 'credencialId') || Math.random().toString(36).slice(2, 10),
    nombre:    page.properties?.Nombre?.title?.[0]?.text?.content ?? '',
    usuario:   getTxt(page, 'Usuario'),
    password:  '',   // never synced to/from Notion — local only
    url:       getTxt(page, 'URL') || undefined,
    notas:     getTxt(page, 'Notas') || undefined,
    categoria: getSel(page, 'Categoría') || undefined,
    orden:     getNum(page, 'Orden'),
  }
}

function notionPageToPago(page: any): PagoMensual {
  return {
    id:         getTxt(page, 'pagoId') || Math.random().toString(36).slice(2, 10),
    servicioId: getTxt(page, 'servicioId'),
    mes:        getTxt(page, 'Mes'),
    monto:      getNum(page, 'Monto'),
    fecha:      getTxt(page, 'Fecha pago') || undefined,
    metodoPago: getSel(page, 'Método') || undefined,
    pagado:     getChk(page, 'Pagado'),
    notas:      getTxt(page, 'Notas') || undefined,
  }
}

const SERVICIOS_FILE       = 'gastos-servicios.json'
const QUERIES_FILE         = 'queries.json'
const QUERIES_NOTION_FILE  = 'queries-notion.json'

// ── Queries Notion config ──────────────────────────────────────────────────────

interface QueriesNotionConfig {
  token: string
  databaseId: string
  lastSyncAt?: string
}
/** Valores por defecto vacíos. Merge: esto → `queries-notion.local.json` (raíz, gitignored) → `queries-notion.json` en userData. */
const DEFAULT_QUERIES_CONFIG: QueriesNotionConfig = {
  token: '',
  databaseId: '',
}

function mergeQueriesNotionConfig(db: CoreServices['db']): QueriesNotionConfig {
  return {
    ...DEFAULT_QUERIES_CONFIG,
    ...readOptionalCwdJson<QueriesNotionConfig>('queries-notion.local.json'),
    ...(db.readJSON<QueriesNotionConfig>(QUERIES_NOTION_FILE) ?? {}),
  }
}

// ── Query ↔ Notion ─────────────────────────────────────────────────────────────

function splitTxt(text: string): object[] {
  const chunks: object[] = []
  for (let i = 0; i < text.length; i += 2000)
    chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } })
  return chunks.length ? chunks : [{ type: 'text', text: { content: '' } }]
}
function txtLong(value: string) { return { rich_text: splitTxt(value) } }
function multiSelProp(values: string[]) { return { multi_select: values.map((v) => ({ name: v })) } }
function getMultiSel(page: any, key: string): string[] {
  return (page.properties?.[key]?.multi_select ?? []).map((s: any) => s.name as string)
}

function queryToNotionProps(q: QueryItem) {
  return {
    'Descripción': titleProp(q.descripcion),
    queryId:       txtProp(q.id),
    Motor:         selProp(q.motor),
    Query:         txtLong(q.query),
    Tags:          multiSelProp(q.tags ?? []),
    Orden:         { number: q.orden },
  }
}
function notionPageToQuery(page: any): QueryItem {
  return {
    id:          getTxt(page, 'queryId') || Math.random().toString(36).slice(2, 10),
    motor:       getSel(page, 'Motor') || 'Otro',
    descripcion: page.properties?.['Descripción']?.title?.[0]?.text?.content ?? '',
    query:       getTxt(page, 'Query'),
    tags:        getMultiSel(page, 'Tags'),
    orden:       getNum(page, 'Orden'),
  }
}
const PAGOS_FILE         = 'gastos-pagos.json'
const CREDENCIALES_FILE  = 'gastos-credenciales.json'

const DEFAULT_SERVICIOS: Servicio[] = [
  { id: 'metrogas-casa',  nombre: 'Metrogas',   emoji: 'flame',      numeroCuenta: '20421703300',    categoria: 'Casa',      activo: true, orden: 1  },
  { id: 'edesur',         nombre: 'Edesur',     emoji: 'zap',        numeroCuenta: '0001625984',     categoria: 'Casa',      activo: true, orden: 2  },
  { id: 'aysa',           nombre: 'Aysa',       emoji: 'droplets',   numeroCuenta: '0000229456',     categoria: 'Casa',      activo: true, orden: 3  },
  { id: 'telecentro',     nombre: 'Telecentro', emoji: 'wifi',       numeroCuenta: '2262362',        categoria: 'Casa',      activo: true, orden: 4  },
  { id: 'metrogas-depto', nombre: 'Metrogas',   emoji: 'flame',      numeroCuenta: '40000143442',    categoria: 'Depto',     activo: true, orden: 5  },
  { id: 'edesur-depto',   nombre: 'Edesur',     emoji: 'zap',        numeroCuenta: '0006013319',     categoria: 'Depto',     activo: true, orden: 6  },
  { id: 'expensa',        nombre: 'Expensas',   emoji: 'receipt',    numeroCuenta: '1144037043',     categoria: 'Depto',     activo: true, orden: 7  },
  { id: 'tsg',            nombre: 'TSG',        emoji: 'landmark',   numeroCuenta: 'Lomas de Zamora',categoria: 'Depto',     activo: true, orden: 8  },
  { id: 'amazon',         nombre: 'Amazon',     emoji: 'tv',         numeroCuenta: '',               categoria: 'Streaming', activo: true, orden: 9  },
  { id: 'flow',           nombre: 'Flow',       emoji: 'radio',      numeroCuenta: '',               categoria: 'Streaming', activo: true, orden: 10 },
  { id: 'personal',       nombre: 'Personal',   emoji: 'smartphone', numeroCuenta: '11590591e54',    categoria: 'Depto',     activo: true, orden: 11 },
]

const DEFAULT_CREDENCIALES: Credencial[] = []

export const handlers: PluginHandlers = {
  pluginId: 'gastos',

  register(ipcMain: IpcMain, { db }: CoreServices): void {

    ipcMain.handle('gastos:load', () => {
      const servicios    = db.readJSON<Servicio[]>(SERVICIOS_FILE)    ?? DEFAULT_SERVICIOS
      const pagos        = db.readJSON<PagoMensual[]>(PAGOS_FILE)     ?? []
      const credenciales = db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? DEFAULT_CREDENCIALES
      // Seed defaults on first run
      if (!db.readJSON<Servicio[]>(SERVICIOS_FILE))     db.writeJSON(SERVICIOS_FILE,    DEFAULT_SERVICIOS)
      if (!db.readJSON<Credencial[]>(CREDENCIALES_FILE)) db.writeJSON(CREDENCIALES_FILE, DEFAULT_CREDENCIALES)
      return { servicios, pagos, credenciales }
    })

    ipcMain.handle('gastos:save-servicio', (_e, servicio: Servicio) => {
      const all = db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS
      const idx = all.findIndex((s) => s.id === servicio.id)
      if (idx >= 0) {
        all[idx] = servicio
      } else {
        all.push(servicio)
      }
      db.writeJSON(SERVICIOS_FILE, all)
      return { ok: true }
    })

    ipcMain.handle('gastos:delete-servicio', (_e, id: string) => {
      const all = db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS
      db.writeJSON(SERVICIOS_FILE, all.filter((s) => s.id !== id))
      const pagos = db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
      db.writeJSON(PAGOS_FILE, pagos.filter((p) => p.servicioId !== id))
      return { ok: true }
    })

    ipcMain.handle('gastos:save-pago', (_e, pago: PagoMensual) => {
      const all = db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
      const idx = all.findIndex((p) => p.id === pago.id)
      if (idx >= 0) {
        all[idx] = pago
      } else {
        all.push(pago)
      }
      db.writeJSON(PAGOS_FILE, all)
      return { ok: true }
    })

    ipcMain.handle('gastos:delete-pago', (_e, id: string) => {
      const all = db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
      db.writeJSON(PAGOS_FILE, all.filter((p) => p.id !== id))
      return { ok: true }
    })

    ipcMain.handle('gastos:save-pagos-bulk', (_e, pagos: PagoMensual[]) => {
      db.writeJSON(PAGOS_FILE, pagos)
      return { ok: true }
    })

    ipcMain.handle('gastos:credencial-save', (_e, cred: Credencial) => {
      if (!cred || typeof cred !== 'object') throw new Error('Payload inválido')
      if (!cred.nombre?.trim()) throw new Error('El nombre es requerido')
      if (cred.nombre.length > 200) throw new Error('Nombre demasiado largo')
      if (typeof cred.usuario !== 'string' || cred.usuario.length > 500) throw new Error('Usuario inválido')
      if (typeof cred.password !== 'string' || cred.password.length > 500) throw new Error('Contraseña inválida')
      const all = db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? DEFAULT_CREDENCIALES
      const idx = all.findIndex((c) => c.id === cred.id)
      if (idx >= 0) all[idx] = cred
      else all.push(cred)
      db.writeJSON(CREDENCIALES_FILE, all)
      return { ok: true }
    })

    ipcMain.handle('gastos:credencial-delete', (_e, id: string) => {
      const all = db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? DEFAULT_CREDENCIALES
      db.writeJSON(CREDENCIALES_FILE, all.filter((c) => c.id !== id))
      return { ok: true }
    })

    ipcMain.handle('gastos:notion-sync', async () => {
      const config = mergeNotionConfig(db)
      const { token, databaseId } = config
      const lastSyncAt = config.lastSyncAt ?? '1970-01-01T00:00:00.000Z'

      const localPagos    = db.readJSON<PagoMensual[]>(PAGOS_FILE)    ?? []
      const localServicios = db.readJSON<Servicio[]>(SERVICIOS_FILE)   ?? DEFAULT_SERVICIOS
      const svcMap = new Map(localServicios.map((s) => [s.id, s]))
      const localById = new Map(localPagos.map((p) => [p.id, p]))

      // 1. Query all Notion pages
      const notionPages   = await queryAllNotionPages(token, databaseId)
      const notionByPagoId = new Map<string, any>()
      for (const page of notionPages) {
        const pid = getTxt(page, 'pagoId')
        if (pid) notionByPagoId.set(pid, page)
      }

      let created = 0, updated = 0, pulled = 0

      // 2. Push app → Notion
      for (const pago of localPagos) {
        const props = pagoToNotionProps(pago, svcMap.get(pago.servicioId))
        const existing = notionByPagoId.get(pago.id)
        if (!existing) {
          await notionFetch(token, '/pages', 'POST', {
            parent: { database_id: databaseId },
            properties: props,
          })
          created++
        } else if ((existing.last_edited_time ?? '') <= lastSyncAt) {
          // Notion unchanged since last sync → overwrite with local
          await notionFetch(token, `/pages/${existing.id}`, 'PATCH', { properties: props })
          updated++
        }
        // else: Notion was edited after lastSyncAt → Notion wins (handled below)
      }

      // 3. Pull Notion → app
      const merged = [...localPagos]
      for (const page of notionPages) {
        if (page.archived) continue
        const pagoId = getTxt(page, 'pagoId')
        const notionEdited = page.last_edited_time ?? ''

        if (!pagoId) {
          // Row created directly in Notion (no pagoId yet) → generate ID, import, stamp back
          const newPago = notionPageToPago(page)
          merged.push(newPago)
          await notionFetch(token, `/pages/${page.id}`, 'PATCH', {
            properties: { pagoId: txtProp(newPago.id) },
          })
          pulled++
        } else if (!localById.has(pagoId)) {
          merged.push(notionPageToPago(page))
          pulled++
        } else if (notionEdited > lastSyncAt) {
          // Notion was edited after last sync → update local
          const idx = merged.findIndex((p) => p.id === pagoId)
          if (idx >= 0) { merged[idx] = notionPageToPago(page); pulled++ }
        }
      }

      db.writeJSON(PAGOS_FILE, merged)
      db.writeJSON(NOTION_CONFIG_FILE, { ...config, lastSyncAt: new Date().toISOString() })

      return { ok: true, created, updated, pulled }
    })

    ipcMain.handle('gastos:notion-sync-credenciales', async () => {
      const config = mergeNotionConfig(db)
      const { token } = config
      const databaseId = config.credencialesDatabaseId!
      const lastSyncAt = config.credencialesLastSyncAt ?? '1970-01-01T00:00:00.000Z'

      const localCreds = db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? DEFAULT_CREDENCIALES
      const localById  = new Map(localCreds.map((c) => [c.id, c]))

      const notionPages   = await queryAllNotionPages(token, databaseId)
      const notionById    = new Map<string, any>()
      for (const page of notionPages) {
        const cid = getTxt(page, 'credencialId')
        if (cid) notionById.set(cid, page)
      }

      let created = 0, updated = 0, pulled = 0

      // Push app → Notion
      for (const cred of localCreds) {
        const props    = credencialToNotionProps(cred)
        const existing = notionById.get(cred.id)
        if (!existing) {
          await notionFetch(token, '/pages', 'POST', { parent: { database_id: databaseId }, properties: props })
          created++
        } else if ((existing.last_edited_time ?? '') <= lastSyncAt) {
          await notionFetch(token, `/pages/${existing.id}`, 'PATCH', { properties: props })
          updated++
        }
      }

      // Pull Notion → app
      const merged = [...localCreds]
      for (const page of notionPages) {
        if (page.archived) continue
        const credId      = getTxt(page, 'credencialId')
        const notionEdited = page.last_edited_time ?? ''

        if (!credId) {
          const newCred = notionPageToCredencial(page)
          merged.push(newCred)
          await notionFetch(token, `/pages/${page.id}`, 'PATCH', {
            properties: { credencialId: txtProp(newCred.id) },
          })
          pulled++
        } else if (!localById.has(credId)) {
          merged.push(notionPageToCredencial(page))
          pulled++
        } else if (notionEdited > lastSyncAt) {
          const idx = merged.findIndex((c) => c.id === credId)
          if (idx >= 0) { merged[idx] = notionPageToCredencial(page); pulled++ }
        }
      }

      db.writeJSON(CREDENCIALES_FILE, merged)
      db.writeJSON(NOTION_CONFIG_FILE, { ...config, credencialesLastSyncAt: new Date().toISOString() })

      return { ok: true, created, updated, pulled }
    })

    // ── Queries handlers ────────────────────────────────────────────────────────

    ipcMain.handle('queries:load', () => db.readJSON<QueryItem[]>(QUERIES_FILE) ?? [])

    ipcMain.handle('queries:save', (_e, item: QueryItem) => {
      if (!item || typeof item !== 'object') throw new Error('Payload inválido')
      if (!item.descripcion?.trim()) throw new Error('La descripción es requerida')
      if (item.descripcion.length > 500) throw new Error('Descripción demasiado larga (máx 500 caracteres)')
      if (typeof item.query !== 'string' || item.query.length > 50_000) throw new Error('Query demasiado largo (máx 50.000 caracteres)')
      if (item.tags && (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== 'string' || t.length > 100))) {
        throw new Error('Tags inválidos')
      }
      const all = db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
      const idx = all.findIndex((q) => q.id === item.id)
      if (idx >= 0) all[idx] = item; else all.push(item)
      db.writeJSON(QUERIES_FILE, all)
      return { ok: true }
    })

    ipcMain.handle('queries:delete', (_e, id: string) => {
      const all = db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
      db.writeJSON(QUERIES_FILE, all.filter((q) => q.id !== id))
      return { ok: true }
    })

    ipcMain.handle('queries:notion-sync', async () => {
      const config     = mergeQueriesNotionConfig(db)
      const { token, databaseId } = config
      const lastSyncAt = config.lastSyncAt ?? '1970-01-01T00:00:00.000Z'

      const localItems = db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
      const localById  = new Map(localItems.map((q) => [q.id, q]))

      const notionPages = await queryAllNotionPages(token, databaseId)
      const notionById  = new Map<string, any>()
      for (const page of notionPages) {
        const qid = getTxt(page, 'queryId'); if (qid) notionById.set(qid, page)
      }

      let created = 0, updated = 0, pulled = 0

      for (const item of localItems) {
        const props = queryToNotionProps(item); const existing = notionById.get(item.id)
        if (!existing) { await notionFetch(token, '/pages', 'POST', { parent: { database_id: databaseId }, properties: props }); created++ }
        else if ((existing.last_edited_time ?? '') <= lastSyncAt) { await notionFetch(token, `/pages/${existing.id}`, 'PATCH', { properties: props }); updated++ }
      }

      const merged = [...localItems]
      for (const page of notionPages) {
        if (page.archived) continue
        const queryId = getTxt(page, 'queryId'); const notionEdited = page.last_edited_time ?? ''
        if (!queryId) {
          const n = notionPageToQuery(page); merged.push(n)
          await notionFetch(token, `/pages/${page.id}`, 'PATCH', { properties: { queryId: txtProp(n.id) } }); pulled++
        } else if (!localById.has(queryId)) { merged.push(notionPageToQuery(page)); pulled++ }
        else if (notionEdited > lastSyncAt) {
          const idx = merged.findIndex((q) => q.id === queryId)
          if (idx >= 0) { merged[idx] = notionPageToQuery(page); pulled++ }
        }
      }

      db.writeJSON(QUERIES_FILE, merged)
      db.writeJSON(QUERIES_NOTION_FILE, { ...config, lastSyncAt: new Date().toISOString() })
      return { ok: true, created, updated, pulled }
    })
  },
}
