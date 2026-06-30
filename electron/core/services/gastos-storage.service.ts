import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseClient } from './supabase-client'
import type { DatabaseService } from './db.service'
import type { SettingsService } from './settings.service'
import type { Servicio, PagoMensual, Credencial, QueryItem } from '../../../src/plugins/gastos/types'
import { logger } from '../logger'

/** Copia local de contraseñas (safeStorage); Supabase recibe el mismo cifrado en password_enc */
const CREDENCIALES_PASSWORDS_VAULT = 'gastos-credenciales-passwords.vault'
/** Legacy: archivo local de credenciales de antes de pasar a Supabase-only. Solo se LEE
 *  (nunca se escribe más) para poder rescatar contraseñas inline de instalaciones viejas. */
const LEGACY_CREDENCIALES_FILE = 'gastos-credenciales.json'

const SETTINGS_KEY_URL = 'gastos.supabase_url'
const SETTINGS_KEY_SERVICE = 'gastos.supabase_service_key'

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

  async load(): Promise<{ servicios: Servicio[]; pagos: PagoMensual[]; credenciales: Credencial[] }> {
    return this.loadFromSupabase()
  }

  async loadQueries(): Promise<QueryItem[]> {
    return this.loadQueriesFromSupabase()
  }

  /** Versión global de los datos remotos — el mayor `updated_at` entre las 4 tablas. */
  async getRemoteVersion(): Promise<string | null> {
    const sb = this.createClient()
    const tables = ['servicios', 'pagos', 'credenciales', 'queries'] as const
    const results = await Promise.all(
      tables.map((t) => sb.from(t).select('updated_at').order('updated_at', { ascending: false }).limit(1)),
    )
    let latest: string | null = null
    for (const r of results) {
      if (r.error) throw new Error(r.error.message)
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
    if (error) throw new Error(error.message)
  }

  async deleteServicio(id: string): Promise<void> {
    const sb = this.createClient()
    await sb.from('pagos').delete().eq('servicio_id', id)
    const { error } = await sb.from('servicios').delete().eq('id', id)
    if (error) throw new Error(error.message)
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
    if (error) throw new Error(error.message)
  }

  async deletePago(id: string): Promise<void> {
    const { error } = await this.createClient().from('pagos').delete().eq('id', id)
    if (error) throw new Error(error.message)
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
    if (error) throw new Error(error.message)
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
