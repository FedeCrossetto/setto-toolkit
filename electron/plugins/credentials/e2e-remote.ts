/** Supabase side of the end-to-end password sync (`credenciales.password_e2e` + `vault_meta`). */
import { createSupabaseClient } from '../../core/services/supabase-client'
import { isMissingTableError, selectAll } from '../../core/services/gastos-storage.service'
import type { GastosStorageService } from '../../core/services/gastos-storage.service'
import { validKdf } from './e2e-crypto'
import { E2E_MIGRATION_MISSING, type E2ERemote, type RemoteBlobRow, type VaultMeta } from './e2e-sync'

const TIMEOUT_MS = 12_000
const META_ID = 'default'

type PgError = { code?: string; message?: string }

/** Missing table / column (`004_credenciales_sync.sql` not applied) → recognizable error. */
function e2eError(error: PgError): Error {
  const msg = error.message ?? 'Error de Supabase'
  if (isMissingTableError(error) || error.code === '42703' || /password_e2e|vault_meta|column .* does not exist/i.test(msg)) {
    return new Error(`${E2E_MIGRATION_MISSING}: ${msg}`)
  }
  return new Error(msg)
}

export function supabaseE2ERemote(gastosStorage: GastosStorageService): E2ERemote {
  const client = () => {
    const { url, key } = gastosStorage.resolveSupabaseCredentials()
    if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED: configurá URL y Service Role Key en Conexiones → Supabase')
    return createSupabaseClient(url, key, { timeoutMs: TIMEOUT_MS })
  }
  return {
    async getMeta(): Promise<VaultMeta | null> {
      const { data, error } = await client().from('vault_meta').select('salt, kdf, check_value').eq('id', META_ID).maybeSingle()
      if (error) throw e2eError(error)
      if (!data) return null
      const row = data as { salt?: unknown; kdf?: unknown; check_value?: unknown }
      if (typeof row.salt !== 'string' || typeof row.check_value !== 'string' || !validKdf(row.kdf)) {
        throw new Error('La configuración de sincronización en Supabase está dañada')
      }
      return { salt: row.salt, kdf: row.kdf, check: row.check_value }
    },
    async putMeta(meta: VaultMeta): Promise<void> {
      const { error } = await client().from('vault_meta').upsert({
        id: META_ID, salt: meta.salt, kdf: meta.kdf, check_value: meta.check, updated_at: new Date().toISOString(),
      })
      if (error) throw e2eError(error)
    },
    async deleteMeta(): Promise<void> {
      const { error } = await client().from('vault_meta').delete().eq('id', META_ID)
      if (error) throw e2eError(error)
    },
    async listBlobs(): Promise<RemoteBlobRow[]> {
      const sb = client()
      const res = await selectAll<{ id: unknown; password_e2e: unknown; updated_at: unknown }>(
        () => sb.from('credenciales').select('id, password_e2e, updated_at').order('id'),
      )
      if (res.error) throw e2eError(res.error)
      return res.data.map((r) => ({
        id: String(r.id),
        blob: typeof r.password_e2e === 'string' && r.password_e2e ? r.password_e2e : null,
        updatedAt: Date.parse(String(r.updated_at ?? '')) || 0,
      }))
    },
    async putBlob(id: string, blob: string | null): Promise<void> {
      // Doesn't touch updated_at: the "newer password" timestamp travels inside the blob.
      const { error } = await client().from('credenciales').update({ password_e2e: blob }).eq('id', id)
      if (error) throw e2eError(error)
    },
    async clearAllBlobs(): Promise<void> {
      const { error } = await client().from('credenciales').update({ password_e2e: null }).not('password_e2e', 'is', null)
      if (error) throw e2eError(error)
    },
  }
}
