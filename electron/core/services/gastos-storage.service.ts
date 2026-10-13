import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseClient } from './supabase-client'
import type { DatabaseService } from './db.service'
import type { SettingsService } from './settings.service'
import type {
  Servicio, PagoMensual, Credencial, QueryItem, Gasto, GastosLoadResult, GastosCacheState, GastosCachePatch, PendingWrite,
} from '../../../src/plugins/gastos/types'
import { logger } from '../logger'

/** Copia local de contraseñas (safeStorage); Supabase recibe el mismo cifrado en password_enc */
const CREDENCIALES_PASSWORDS_VAULT = 'gastos-credenciales-passwords.vault'
/** Legacy: archivo local de credenciales de antes de pasar a Supabase-only. Solo se LEE
 *  (nunca se escribe más) para poder rescatar contraseñas inline de instalaciones viejas. */
const LEGACY_CREDENCIALES_FILE = 'gastos-credenciales.json'

/** Caché offline compartido por todas las ventanas/orígenes (dev y app instalada). */
const LOCAL_CACHE_FILE = 'gastos-cache.json'
const PENDING_WRITES_FILE = 'gastos-pending.json'
const MAX_PENDING_WRITES = 5000

const SETTINGS_KEY_URL = 'gastos.supabase_url'
const SETTINGS_KEY_SERVICE = 'gastos.supabase_service_key'

/** Prefijo de error cuando la tabla `gastos` (migración 002) no existe en Supabase. */
export const GASTOS_TABLE_MISSING = 'GASTOS_TABLE_MISSING'

/** PostgREST devuelve 404 / PGRST205 / 42P01 cuando la tabla no existe (o no está en el schema cache). */
export function isMissingTableError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST204') return true
  return /does not exist|could not find the table|schema cache/i.test(err.message ?? '')
}

/** Error de Supabase → Error; si la tabla no existe lleva el prefijo GASTOS_TABLE_MISSING (el renderer lo detecta). */
function supabaseError(error: { code?: string; message?: string }, table: string): Error {
  if (isMissingTableError(error)) return new Error(`${GASTOS_TABLE_MISSING}(${table}): ${error.message ?? ''}`)
  return new Error(error.message ?? 'Error de Supabase')
}

function gastoRow(g: Gasto) {
  return {
    id: g.id,
    fecha: g.fecha,
    monto: g.monto,
    descripcion: g.descripcion,
    categoria: g.categoria,
    metodo_pago: g.metodoPago,
    moneda: g.moneda,
    notas: g.notas ?? null,
    created_at: g.created_at,
    updated_at: new Date().toISOString(),
  }
}

function gastoFromRow(r: Record<string, unknown>): Gasto {
  return {
    id: String(r.id),
    fecha: String(r.fecha ?? '').slice(0, 10),
    monto: Number(r.monto ?? 0),
    descripcion: (r.descripcion as string) ?? '',
    categoria: (r.categoria as string) || 'Otro',
    metodoPago: (r.metodo_pago as string) ?? '',
    moneda: r.moneda === 'USD' ? 'USD' : 'ARS',
    notas: (r.notas as string | null) ?? undefined,
    created_at: (r.created_at as string) ?? '',
    updated_at: (r.updated_at as string) ?? '',
  }
}

export interface SupabaseConfig {
  url: string
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

/** Cifra con safeStorage (Electron); en Supabase se ve como base64, no texto plano. */
function encryptPasswordForStorage(plain: string): string {
  const pwd = (plain ?? '').trim()
  if (!pwd) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('GastosStorage', 'safeStorage no disponible; password_enc no se subirá a Supabase')
    return ''
  }
  return safeStorage.encryptString(pwd).toString('base64')
}

/** Intenta leer contraseñas guardadas en Supabase (safeStorage de otra máquina falla). */
function tryDecryptLegacyPassword(enc: string): string {
  if (!enc || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return ''
  }
}

function credencialSupabaseRow(c: Credencial) {
  return {
    id: c.id,
    nombre: c.nombre,
    usuario: c.usuario,
    password_enc: encryptPasswordForStorage(c.password),
    url: c.url ?? null,
    notas: c.notas ?? null,
    categoria: c.categoria ?? null,
    orden: c.orden,
  }
}

export class GastosStorageService {
  constructor(
    private db: DatabaseService,
    private settings: SettingsService,
  ) {}

  mergeSupabaseConfig(): SupabaseConfig {
    const fromCwd = readOptionalCwdJson<SupabaseConfig>('gastos-supabase.local.json')
    const rawUrl =
      this.settings.get(SETTINGS_KEY_URL)?.trim() ||
      fromCwd.url?.trim() ||
      (typeof process.env.SUPABASE_URL === 'string' ? process.env.SUPABASE_URL.trim() : '') ||
      ''
    const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
    return { url }
  }

  getSupabasePublicConfig(): { url: string; keyConfigured: boolean } {
    return { url: this.mergeSupabaseConfig().url, keyConfigured: Boolean(this.getServiceKey()) }
  }

  saveSupabaseConfig(payload: { url: string; serviceKey: string }): void {
    const url = payload.url.trim()
    if (url) this.settings.set(SETTINGS_KEY_URL, url)
    if (payload.serviceKey.trim()) {
      this.settings.set(SETTINGS_KEY_SERVICE, payload.serviceKey.trim())
    }
  }

  private getServiceKey(): string {
    const fromSettings = this.settings.get(SETTINGS_KEY_SERVICE)?.trim()
    if (fromSettings) return fromSettings
    const cwd = readOptionalCwdJson<{ serviceKey?: string }>('gastos-supabase.local.json')
    if (cwd.serviceKey?.trim()) return cwd.serviceKey.trim()
    return typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string'
      ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim()
      : ''
  }

  private createClient(): SupabaseClient {
    const { url } = this.mergeSupabaseConfig()
    const key = this.getServiceKey()
    if (!url || !key) {
      throw new Error('SUPABASE_NOT_CONFIGURED: configurá URL y Service Role Key en Conexiones → Supabase')
    }
    return createSupabaseClient(url, key)
  }

  /** URL + key efectivas, sólo para uso interno del main (chequeo de salud). Nunca devolver al renderer. */
  resolveSupabaseCredentials(): { url: string; key: string } {
    return { url: this.mergeSupabaseConfig().url, key: this.getServiceKey() }
  }

  // ── Caché local compartido (archivo en userData, no localStorage) ───────────

  getLocalCache(): GastosCacheState {
    const raw = this.db.readJSON<Partial<GastosCacheState>>(LOCAL_CACHE_FILE)
    const d = raw?.data
    const data = d && Array.isArray(d.servicios) && Array.isArray(d.pagos)
      ? { servicios: d.servicios, pagos: d.pagos, gastos: Array.isArray(d.gastos) ? d.gastos : [] }
      : null
    return {
      data,
      updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
      lastSynced: typeof raw?.lastSynced === 'string' ? raw.lastSynced : null,
      prefs: raw?.prefs && typeof raw.prefs === 'object' ? raw.prefs : {},
    }
  }

  setLocalCache(patch: GastosCachePatch): GastosCacheState {
    if (!patch || typeof patch !== 'object') throw new Error('Payload inválido')
    const cur = this.getLocalCache()
    const next: GastosCacheState = {
      data: patch.data !== undefined
        ? (patch.data ? { servicios: patch.data.servicios ?? [], pagos: patch.data.pagos ?? [], gastos: patch.data.gastos ?? [] } : null)
        : cur.data,
      updatedAt: patch.data !== undefined ? (patch.updatedAt ?? new Date().toISOString()) : cur.updatedAt,
      lastSynced: patch.lastSynced !== undefined ? patch.lastSynced : cur.lastSynced,
      prefs: patch.prefs ? { ...cur.prefs, ...patch.prefs } : cur.prefs,
    }
    this.db.writeJSON(LOCAL_CACHE_FILE, next)
    return next
  }

  getPendingWrites(): PendingWrite[] {
    const raw = this.db.readJSON<{ writes?: unknown }>(PENDING_WRITES_FILE)
    const writes: unknown[] = Array.isArray(raw?.writes) ? raw.writes : []
    return writes.filter((w): w is PendingWrite =>
      Boolean(w) && typeof (w as PendingWrite).channel === 'string' && Array.isArray((w as PendingWrite).args))
  }

  setPendingWrites(writes: PendingWrite[]): void {
    if (!Array.isArray(writes)) throw new Error('Payload inválido')
    const valid = writes.filter((w) => w && typeof w.channel === 'string' && w.channel.startsWith('gastos:') && Array.isArray(w.args))
    if (valid.length > MAX_PENDING_WRITES) throw new Error('Demasiadas escrituras pendientes')
    this.db.writeJSON(PENDING_WRITES_FILE, { updatedAt: new Date().toISOString(), writes: valid })
  }

  // ── Bóveda local de contraseñas (no Supabase) ───────────────────────────────

  private readPasswordVault(): Record<string, string> {
    return this.db.readEncryptedJSON<Record<string, string>>(CREDENCIALES_PASSWORDS_VAULT) ?? {}
  }

  private writePasswordVault(vault: Record<string, string>): void {
    this.db.writeEncryptedJSON(CREDENCIALES_PASSWORDS_VAULT, vault)
  }

  private setVaultPassword(id: string, password: string): void {
    const vault = this.readPasswordVault()
    if (password) vault[id] = password
    else delete vault[id]
    this.writePasswordVault(vault)
  }

  private deleteVaultPassword(id: string): void {
    const vault = this.readPasswordVault()
    if (vault[id]) {
      delete vault[id]
      this.writePasswordVault(vault)
    }
  }

  /** Importa contraseñas desde JSON local legacy, Supabase legacy o campo inline al vault. */
  private migratePasswordsIntoVault(
    creds: Array<{ id: string; password?: string }>,
    legacyEncById?: Map<string, string>,
  ): void {
    const vault = this.readPasswordVault()
    let changed = false
    for (const c of creds) {
      if (vault[c.id]) continue
      let pwd = c.password?.trim() ? c.password : ''
      if (!pwd && legacyEncById?.has(c.id)) {
        pwd = tryDecryptLegacyPassword(legacyEncById.get(c.id)!)
      }
      if (pwd) {
        vault[c.id] = pwd
        changed = true
      }
    }
    if (changed) {
      this.writePasswordVault(vault)
      logger.info('GastosStorage', 'Contraseñas migradas al vault local cifrado')
    }
  }

  private attachVaultPasswords(creds: Credencial[]): Credencial[] {
    const vault = this.readPasswordVault()
    return creds.map((c) => ({
      ...c,
      password: vault[c.id] ?? '',
    }))
  }

  // ── Load / CRUD — Supabase es la única fuente de verdad ─────────────────────

  async load(): Promise<GastosLoadResult> {
    const [base, variables] = await Promise.all([this.loadFromSupabase(), this.loadGastosVariables()])
    const missingTables = [...base.missingTables, ...(variables.gastosTableReady ? [] : ['gastos'])]
    return { ...base, ...variables, missingTables }
  }

  /** Gastos variables; si la tabla no existe (falta migración 002) degrada a lista vacía. */
  private async loadGastosVariables(): Promise<{ gastos: Gasto[]; gastosTableReady: boolean }> {
    const { data, error } = await this.createClient().from('gastos').select('*').order('fecha', { ascending: false })
    if (error) {
      if (isMissingTableError(error)) {
        logger.warn('GastosStorage', 'Tabla gastos no encontrada en Supabase — falta aplicar la migración 002')
        return { gastos: [], gastosTableReady: false }
      }
      throw new Error(error.message)
    }
    return { gastos: (data ?? []).map((r) => gastoFromRow(r as Record<string, unknown>)), gastosTableReady: true }
  }

  async saveGasto(gasto: Gasto): Promise<void> {
    const { error } = await this.createClient().from('gastos').upsert(gastoRow(gasto))
    if (error) throw supabaseError(error, 'gastos')
  }

  async deleteGasto(id: string): Promise<void> {
    const { error } = await this.createClient().from('gastos').delete().eq('id', id)
    if (error) throw supabaseError(error, 'gastos')
  }

  async loadQueries(): Promise<QueryItem[]> {
    return this.loadQueriesFromSupabase()
  }

  /** Versión global de los datos remotos — el mayor `updated_at` entre las tablas
   *  (la de gastos variables se ignora si todavía no existe). */
  async getRemoteVersion(): Promise<string | null> {
    const sb = this.createClient()
    const tables = ['servicios', 'pagos', 'credenciales', 'queries', 'gastos'] as const
    const results = await Promise.all(
      tables.map((t) => sb.from(t).select('updated_at').order('updated_at', { ascending: false }).limit(1)),
    )
    let latest: string | null = null
    for (const r of results) {
      if (r.error) {
        if (isMissingTableError(r.error)) continue
        throw new Error(r.error.message)
      }
      const ts = r.data?.[0]?.updated_at as string | undefined
      if (ts && (!latest || ts > latest)) latest = ts
    }
    return latest
  }

  async saveServicio(servicio: Servicio): Promise<void> {
    const sb = this.createClient()
    const { error } = await sb.from('servicios').upsert({
      id: servicio.id,
      nombre: servicio.nombre,
      emoji: servicio.emoji,
      numero_cuenta: servicio.numeroCuenta ?? null,
      categoria: servicio.categoria,
      activo: servicio.activo,
      orden: servicio.orden,
      updated_at: new Date().toISOString(),
    })
    if (error) throw supabaseError(error, 'servicios')
  }

  async deleteServicio(id: string): Promise<void> {
    const sb = this.createClient()
    await sb.from('pagos').delete().eq('servicio_id', id)
    const { error } = await sb.from('servicios').delete().eq('id', id)
    if (error) throw supabaseError(error, 'servicios')
  }

  async savePago(pago: PagoMensual): Promise<void> {
    const sb = this.createClient()
    const { error } = await sb.from('pagos').upsert({
      id: pago.id,
      servicio_id: pago.servicioId,
      mes: pago.mes,
      monto: pago.monto,
      fecha: pago.fecha ?? null,
      metodo_pago: pago.metodoPago ?? null,
      pagado: pago.pagado,
      notas: pago.notas ?? null,
      updated_at: new Date().toISOString(),
    })
    if (error) throw supabaseError(error, 'pagos')
  }

  async deletePago(id: string): Promise<void> {
    const { error } = await this.createClient().from('pagos').delete().eq('id', id)
    if (error) throw supabaseError(error, 'pagos')
  }

  async savePagosBulk(pagos: PagoMensual[]): Promise<void> {
    if (!pagos.length) return
    const sb = this.createClient()
    const rows = pagos.map((p) => ({
      id: p.id,
      servicio_id: p.servicioId,
      mes: p.mes,
      monto: p.monto,
      fecha: p.fecha ?? null,
      metodo_pago: p.metodoPago ?? null,
      pagado: p.pagado,
      notas: p.notas ?? null,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await sb.from('pagos').upsert(rows)
    if (error) throw supabaseError(error, 'pagos')
  }

  async saveCredencial(cred: Credencial): Promise<void> {
    this.setVaultPassword(cred.id, cred.password)
    const row = {
      ...credencialSupabaseRow(cred),
      updated_at: new Date().toISOString(),
    }
    const { error } = await this.createClient().from('credenciales').upsert(row)
    if (error) throw new Error(error.message)
  }

  async deleteCredencial(id: string): Promise<void> {
    this.deleteVaultPassword(id)
    const { error } = await this.createClient().from('credenciales').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async saveQuery(item: QueryItem): Promise<void> {
    const { error } = await this.createClient().from('queries').upsert({
      id: item.id,
      motor: item.motor,
      descripcion: item.descripcion,
      query: item.query,
      tags: item.tags ?? [],
      orden: item.orden,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  }

  async deleteQuery(id: string): Promise<void> {
    const { error } = await this.createClient().from('queries').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  private async loadFromSupabase(): Promise<{
    servicios: Servicio[]
    pagos: PagoMensual[]
    credenciales: Credencial[]
    missingTables: string[]
  }> {
    const sb = this.createClient()
    const [svcRes, pagosRes, credRes] = await Promise.all([
      sb.from('servicios').select('*').order('orden'),
      sb.from('pagos').select('*'),
      sb.from('credenciales').select('*').order('orden'),
    ])
    // Una tabla faltante (migración sin aplicar) degrada a lista vacía; otros errores cortan la carga.
    const missingTables: string[] = []
    for (const [table, res] of [['servicios', svcRes], ['pagos', pagosRes], ['credenciales', credRes]] as const) {
      if (!res.error) continue
      if (isMissingTableError(res.error)) { missingTables.push(table); continue }
      throw new Error(res.error.message)
    }
    if (missingTables.length) logger.warn('GastosStorage', `Tablas faltantes en Supabase: ${missingTables.join(', ')}`)

    return {
      missingTables,
      servicios: (svcRes.data ?? []).map((r) => ({
        id: r.id,
        nombre: r.nombre,
        emoji: r.emoji ?? '',
        numeroCuenta: r.numero_cuenta ?? undefined,
        categoria: r.categoria ?? '',
        activo: r.activo ?? true,
        orden: r.orden ?? 0,
      })),
      pagos: (pagosRes.data ?? []).map((r) => ({
        id: r.id,
        servicioId: r.servicio_id,
        mes: r.mes,
        monto: Number(r.monto),
        fecha: r.fecha ?? undefined,
        metodoPago: r.metodo_pago ?? undefined,
        pagado: r.pagado ?? false,
        notas: r.notas ?? undefined,
      })),
      credenciales: (() => {
        const rows = credRes.data ?? []
        const legacyEnc = new Map<string, string>()
        for (const r of rows) {
          if (r.password_enc) legacyEnc.set(r.id, r.password_enc)
        }
        const meta = rows.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          usuario: r.usuario ?? '',
          password: '',
          url: r.url ?? undefined,
          notas: r.notas ?? undefined,
          categoria: r.categoria ?? undefined,
          orden: r.orden ?? 0,
        }))
        this.migratePasswordsIntoVault(meta, legacyEnc)
        // One-time rescue: instalaciones viejas pueden tener contraseñas inline en el
        // archivo local legacy (de antes de pasar a Supabase-only). Solo lectura.
        this.migratePasswordsIntoVault(this.db.readJSON<Credencial[]>(LEGACY_CREDENCIALES_FILE) ?? [])
        return this.attachVaultPasswords(meta)
      })(),
    }
  }

  private async loadQueriesFromSupabase(): Promise<QueryItem[]> {
    const { data, error } = await this.createClient().from('queries').select('*').order('orden')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => ({
      id: r.id,
      motor: r.motor ?? 'Otro',
      descripcion: r.descripcion,
      query: r.query ?? '',
      tags: r.tags ?? [],
      orden: r.orden ?? 0,
    }))
  }
}
