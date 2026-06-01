import { existsSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseClient } from './supabase-client'
import type { DatabaseService } from './db.service'
import type { SettingsService } from './settings.service'
import type { Servicio, PagoMensual, Credencial, QueryItem } from '../../../src/plugins/gastos/types'
import { logger } from '../logger'

const SERVICIOS_FILE = 'gastos-servicios.json'
const PAGOS_FILE = 'gastos-pagos.json'
const CREDENCIALES_FILE = 'gastos-credenciales.json'
/** Copia local de contraseñas (safeStorage); Supabase recibe el mismo cifrado en password_enc */
const CREDENCIALES_PASSWORDS_VAULT = 'gastos-credenciales-passwords.vault'
const QUERIES_FILE = 'queries.json'
const SUPABASE_CONFIG_FILE = 'gastos-supabase.json'

const SETTINGS_KEY_URL = 'gastos.supabase_url'
const SETTINGS_KEY_SERVICE = 'gastos.supabase_service_key'

export type GastosBackend = 'local' | 'supabase'

export interface SupabaseConfig {
  url: string
  backend: GastosBackend
  migratedAt?: string
  /** Si true (default con backend supabase), al abrir la app sube JSON local → Supabase */
  syncOnStartup?: boolean
  lastSyncAt?: string
}

export interface MigrationResult {
  ok: boolean
  servicios: number
  pagos: number
  credenciales: number
  queries: number
  backend: GastosBackend
}

const DEFAULT_SERVICIOS: Servicio[] = [
  { id: 'metrogas-casa', nombre: 'Metrogas', emoji: 'flame', numeroCuenta: '20421703300', categoria: 'Casa', activo: true, orden: 1 },
  { id: 'edesur', nombre: 'Edesur', emoji: 'zap', numeroCuenta: '0001625984', categoria: 'Casa', activo: true, orden: 2 },
  { id: 'aysa', nombre: 'Aysa', emoji: 'droplets', numeroCuenta: '0000229456', categoria: 'Casa', activo: true, orden: 3 },
  { id: 'telecentro', nombre: 'Telecentro', emoji: 'wifi', numeroCuenta: '2262362', categoria: 'Casa', activo: true, orden: 4 },
  { id: 'metrogas-depto', nombre: 'Metrogas', emoji: 'flame', numeroCuenta: '40000143442', categoria: 'Depto', activo: true, orden: 5 },
  { id: 'edesur-depto', nombre: 'Edesur', emoji: 'zap', numeroCuenta: '0006013319', categoria: 'Depto', activo: true, orden: 6 },
  { id: 'expensa', nombre: 'Expensas', emoji: 'receipt', numeroCuenta: '1144037043', categoria: 'Depto', activo: true, orden: 7 },
  { id: 'tsg', nombre: 'TSG', emoji: 'landmark', numeroCuenta: 'Lomas de Zamora', categoria: 'Depto', activo: true, orden: 8 },
  { id: 'amazon', nombre: 'Amazon', emoji: 'tv', numeroCuenta: '', categoria: 'Streaming', activo: true, orden: 9 },
  { id: 'flow', nombre: 'Flow', emoji: 'radio', numeroCuenta: '', categoria: 'Streaming', activo: true, orden: 10 },
  { id: 'personal', nombre: 'Personal', emoji: 'smartphone', numeroCuenta: '11590591e54', categoria: 'Depto', activo: true, orden: 11 },
]

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

  getBackend(): GastosBackend {
    return this.mergeSupabaseConfig().backend ?? 'local'
  }

  mergeSupabaseConfig(): SupabaseConfig {
    const fromFile = this.db.readJSON<SupabaseConfig>(SUPABASE_CONFIG_FILE) ?? {}
    const fromCwd = readOptionalCwdJson<SupabaseConfig>('gastos-supabase.local.json')
    const rawUrl =
      this.settings.get(SETTINGS_KEY_URL)?.trim() ||
      fromCwd.url?.trim() ||
      fromFile.url?.trim() ||
      (typeof process.env.SUPABASE_URL === 'string' ? process.env.SUPABASE_URL.trim() : '') ||
      ''
    const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
    const backend = fromFile.backend ?? fromCwd.backend ?? 'local'
    return {
      url,
      backend: backend === 'supabase' ? 'supabase' : 'local',
      migratedAt: fromFile.migratedAt ?? fromCwd.migratedAt,
      syncOnStartup: fromFile.syncOnStartup ?? fromCwd.syncOnStartup,
      lastSyncAt: fromFile.lastSyncAt,
    }
  }

  getSupabasePublicConfig(): {
    url: string
    backend: GastosBackend
    keyConfigured: boolean
    migratedAt?: string
    syncOnStartup?: boolean
    lastSyncAt?: string
  } {
    const cfg = this.mergeSupabaseConfig()
    const key = this.getServiceKey()
    return {
      url: cfg.url,
      backend: cfg.backend,
      keyConfigured: Boolean(key),
      migratedAt: cfg.migratedAt,
      syncOnStartup: cfg.syncOnStartup !== false,
      lastSyncAt: cfg.lastSyncAt,
    }
  }

  saveSupabaseConfig(payload: {
    url: string
    serviceKey: string
    backend?: GastosBackend
    syncOnStartup?: boolean
  }): void {
    const existing = this.mergeSupabaseConfig()
    const url = payload.url.trim()
    if (url) this.settings.set(SETTINGS_KEY_URL, url)
    if (payload.serviceKey.trim()) {
      this.settings.set(SETTINGS_KEY_SERVICE, payload.serviceKey.trim())
    }
    this.db.writeJSON(SUPABASE_CONFIG_FILE, {
      ...existing,
      url,
      backend: payload.backend ?? existing.backend,
      syncOnStartup: payload.syncOnStartup ?? existing.syncOnStartup ?? true,
    })
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

  private useSupabase(): boolean {
    return this.getBackend() === 'supabase' && Boolean(this.mergeSupabaseConfig().url && this.getServiceKey())
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

  /** Importa contraseñas desde JSON local, Supabase legacy o campo inline al vault. */
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

  private persistCredencialMetadata(cred: Credencial): void {
    const meta: Credencial = { ...cred, password: '' }
    const all = this.db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? []
    const idx = all.findIndex((c) => c.id === meta.id)
    if (idx >= 0) all[idx] = meta
    else all.push(meta)
    this.db.writeJSON(CREDENCIALES_FILE, all)
  }

  // ── Load / CRUD ─────────────────────────────────────────────────────────────

  async load(): Promise<{ servicios: Servicio[]; pagos: PagoMensual[]; credenciales: Credencial[] }> {
    if (this.useSupabase()) return this.loadFromSupabase()
    return this.loadLocal()
  }

  async loadQueries(): Promise<QueryItem[]> {
    if (this.useSupabase()) return this.loadQueriesFromSupabase()
    return this.db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
  }

  async saveServicio(servicio: Servicio): Promise<void> {
    if (this.useSupabase()) {
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
      if (error) throw new Error(error.message)
      return
    }
    const all = this.db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS
    const idx = all.findIndex((s) => s.id === servicio.id)
    if (idx >= 0) all[idx] = servicio
    else all.push(servicio)
    this.db.writeJSON(SERVICIOS_FILE, all)
  }

  async deleteServicio(id: string): Promise<void> {
    if (this.useSupabase()) {
      const sb = this.createClient()
      await sb.from('pagos').delete().eq('servicio_id', id)
      const { error } = await sb.from('servicios').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return
    }
    const all = this.db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS
    this.db.writeJSON(SERVICIOS_FILE, all.filter((s) => s.id !== id))
    const pagos = this.db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
    this.db.writeJSON(PAGOS_FILE, pagos.filter((p) => p.servicioId !== id))
  }

  async savePago(pago: PagoMensual): Promise<void> {
    if (this.useSupabase()) {
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
      if (error) throw new Error(error.message)
      return
    }
    const all = this.db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
    const idx = all.findIndex((p) => p.id === pago.id)
    if (idx >= 0) all[idx] = pago
    else all.push(pago)
    this.db.writeJSON(PAGOS_FILE, all)
  }

  async deletePago(id: string): Promise<void> {
    if (this.useSupabase()) {
      const { error } = await this.createClient().from('pagos').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return
    }
    const all = this.db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
    this.db.writeJSON(PAGOS_FILE, all.filter((p) => p.id !== id))
  }

  async savePagosBulk(pagos: PagoMensual[]): Promise<void> {
    if (this.useSupabase()) {
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
      if (error) throw new Error(error.message)
      return
    }
    this.db.writeJSON(PAGOS_FILE, pagos)
  }

  async saveCredencial(cred: Credencial): Promise<void> {
    this.setVaultPassword(cred.id, cred.password)
    const row = {
      ...credencialSupabaseRow(cred),
      updated_at: new Date().toISOString(),
    }
    if (this.useSupabase()) {
      const { error } = await this.createClient().from('credenciales').upsert(row)
      if (error) throw new Error(error.message)
    }
    this.persistCredencialMetadata(cred)
  }

  async deleteCredencial(id: string): Promise<void> {
    this.deleteVaultPassword(id)
    if (this.useSupabase()) {
      const { error } = await this.createClient().from('credenciales').delete().eq('id', id)
      if (error) throw new Error(error.message)
    }
    const all = this.db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? []
    this.db.writeJSON(CREDENCIALES_FILE, all.filter((c) => c.id !== id))
  }

  async saveQuery(item: QueryItem): Promise<void> {
    if (this.useSupabase()) {
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
      return
    }
    const all = this.db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
    const idx = all.findIndex((q) => q.id === item.id)
    if (idx >= 0) all[idx] = item
    else all.push(item)
    this.db.writeJSON(QUERIES_FILE, all)
  }

  async deleteQuery(id: string): Promise<void> {
    if (this.useSupabase()) {
      const { error } = await this.createClient().from('queries').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return
    }
    const all = this.db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
    this.db.writeJSON(QUERIES_FILE, all.filter((q) => q.id !== id))
  }

  /** Replace pagos/credenciales in local JSON (used by Notion sync when backend is local). */
  writeLocalPagos(pagos: PagoMensual[]): void {
    this.db.writeJSON(PAGOS_FILE, pagos)
  }

  writeLocalCredenciales(creds: Credencial[]): void {
    this.db.writeJSON(CREDENCIALES_FILE, creds)
  }

  writeLocalQueries(queries: QueryItem[]): void {
    this.db.writeJSON(QUERIES_FILE, queries)
  }

  readLocalPagos(): PagoMensual[] {
    return this.db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
  }

  readLocalCredenciales(): Credencial[] {
    return this.db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? []
  }

  readLocalServicios(): Servicio[] {
    return this.db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS
  }

  readLocalQueries(): QueryItem[] {
    return this.db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []
  }

  seedLocalDefaultsIfNeeded(): void {
    if (!this.db.readJSON<Servicio[]>(SERVICIOS_FILE)) {
      this.db.writeJSON(SERVICIOS_FILE, DEFAULT_SERVICIOS)
    }
    if (!this.db.readJSON<Credencial[]>(CREDENCIALES_FILE)) {
      this.db.writeJSON(CREDENCIALES_FILE, [])
    }
  }

  // ── Migration / sync local → Supabase ───────────────────────────────────────

  /** Sube JSON local a Supabase (upsert). Usado por migración y sync al iniciar. */
  async pushLocalFilesToSupabase(): Promise<MigrationResult> {
    const client = this.createClient()
    this.seedLocalDefaultsIfNeeded()

    const servicios = this.db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS
    const pagos = this.db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? []
    const credenciales = this.db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? []
    const queries = this.db.readJSON<QueryItem[]>(QUERIES_FILE) ?? []

    if (servicios.length) {
      const { error } = await client.from('servicios').upsert(
        servicios.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          emoji: s.emoji,
          numero_cuenta: s.numeroCuenta ?? null,
          categoria: s.categoria,
          activo: s.activo,
          orden: s.orden,
          updated_at: new Date().toISOString(),
        })),
      )
      if (error) throw new Error(`servicios: ${error.message}`)
    }

    if (pagos.length) {
      const { error } = await client.from('pagos').upsert(
        pagos.map((p) => ({
          id: p.id,
          servicio_id: p.servicioId,
          mes: p.mes,
          monto: p.monto,
          fecha: p.fecha ?? null,
          metodo_pago: p.metodoPago ?? null,
          pagado: p.pagado,
          notas: p.notas ?? null,
          updated_at: new Date().toISOString(),
        })),
      )
      if (error) throw new Error(`pagos: ${error.message}`)
    }

    if (credenciales.length) {
      this.migratePasswordsIntoVault(credenciales)
      const credsWithPasswords = this.attachVaultPasswords(
        credenciales.map((c) => ({ ...c, password: '' })),
      )
      const { error } = await client.from('credenciales').upsert(
        credsWithPasswords.map((c) => ({
          ...credencialSupabaseRow(c),
          updated_at: new Date().toISOString(),
        })),
      )
      if (error) throw new Error(`credenciales: ${error.message}`)
    }

    if (queries.length) {
      const { error } = await client.from('queries').upsert(
        queries.map((q) => ({
          id: q.id,
          motor: q.motor,
          descripcion: q.descripcion,
          query: q.query,
          tags: q.tags ?? [],
          orden: q.orden,
          updated_at: new Date().toISOString(),
        })),
      )
      if (error) throw new Error(`queries: ${error.message}`)
    }

    return {
      ok: true,
      servicios: servicios.length,
      pagos: pagos.length,
      credenciales: credenciales.length,
      queries: queries.length,
      backend: 'supabase',
    }
  }

  /** Al abrir la app: local → Supabase si backend=supabase y syncOnStartup no está desactivado. */
  async syncOnStartupIfEnabled(): Promise<MigrationResult | null> {
    const cfg = this.mergeSupabaseConfig()
    if (!this.useSupabase()) return null
    if (cfg.syncOnStartup === false) return null

    logger.info('GastosStorage', 'Sync al inicio: subiendo JSON local → Supabase')
    const result = await this.pushLocalFilesToSupabase()
    this.db.writeJSON(SUPABASE_CONFIG_FILE, {
      ...cfg,
      lastSyncAt: new Date().toISOString(),
    })
    return result
  }

  async migrateToSupabase(): Promise<MigrationResult> {
    this.backupLocalFiles()
    const result = await this.pushLocalFilesToSupabase()
    const cfg = this.mergeSupabaseConfig()
    const migratedAt = new Date().toISOString()
    this.db.writeJSON(SUPABASE_CONFIG_FILE, {
      ...cfg,
      backend: 'supabase',
      migratedAt,
      syncOnStartup: cfg.syncOnStartup ?? true,
      lastSyncAt: migratedAt,
    })
    return { ...result, backend: 'supabase' }
  }

  private backupLocalFiles(): void {
    const ts = Date.now()
    for (const f of [SERVICIOS_FILE, PAGOS_FILE, CREDENCIALES_FILE, QUERIES_FILE]) {
      const src = join(this.db.getDataDir(), f)
      if (existsSync(src)) {
        try {
          copyFileSync(src, `${src}.pre-supabase-${ts}.bak`)
        } catch (e) {
          logger.error('GastosStorage', `Backup falló para ${f}`, e)
        }
      }
    }
  }

  private loadLocal(): { servicios: Servicio[]; pagos: PagoMensual[]; credenciales: Credencial[] } {
    this.seedLocalDefaultsIfNeeded()
    const rawCreds = this.db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? []
    this.migratePasswordsIntoVault(rawCreds)
    return {
      servicios: this.db.readJSON<Servicio[]>(SERVICIOS_FILE) ?? DEFAULT_SERVICIOS,
      pagos: this.db.readJSON<PagoMensual[]>(PAGOS_FILE) ?? [],
      credenciales: this.attachVaultPasswords(
        rawCreds.map((c) => ({ ...c, password: '' })),
      ),
    }
  }

  private async loadFromSupabase(): Promise<{
    servicios: Servicio[]
    pagos: PagoMensual[]
    credenciales: Credencial[]
  }> {
    const sb = this.createClient()
    const [svcRes, pagosRes, credRes] = await Promise.all([
      sb.from('servicios').select('*').order('orden'),
      sb.from('pagos').select('*'),
      sb.from('credenciales').select('*').order('orden'),
    ])
    if (svcRes.error) throw new Error(svcRes.error.message)
    if (pagosRes.error) throw new Error(pagosRes.error.message)
    if (credRes.error) throw new Error(credRes.error.message)

    return {
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
        this.migratePasswordsIntoVault(
          this.db.readJSON<Credencial[]>(CREDENCIALES_FILE) ?? [],
        )
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

export { DEFAULT_SERVICIOS }
