export interface Servicio {
  id: string
  nombre: string
  emoji: string
  numeroCuenta?: string
  categoria: string
  activo: boolean
  orden: number
}

export interface PagoMensual {
  id: string
  servicioId: string
  mes: string       // "YYYY-MM"
  monto: number
  fecha?: string    // "DD/MM"
  metodoPago?: string
  pagado: boolean
  notas?: string
}

export interface QueryItem {
  id: string
  motor: string
  descripcion: string
  query: string
  tags?: string[]
  orden: number
}

export interface Credencial {
  id: string
  nombre: string
  usuario: string
  password: string
  url?: string
  notas?: string
  categoria?: string
  orden: number
}

export type Moneda = 'ARS' | 'USD'

/** Gasto variable (ad-hoc): "1500 super efectivo". Tabla `gastos` en Supabase. */
export interface Gasto {
  id: string
  fecha: string       // "YYYY-MM-DD"
  monto: number
  descripcion: string
  categoria: string
  metodoPago: string
  moneda: Moneda
  notas?: string
  created_at: string  // ISO
  updated_at: string  // ISO
}

/** Respuesta de `gastos:load`. `credenciales` se mantiene para el plugin Credenciales. */
export interface GastosLoadResult {
  servicios: Servicio[]
  pagos: PagoMensual[]
  credenciales: Credencial[]
  gastos: Gasto[]
  /** false cuando la tabla `gastos` no existe en Supabase (falta la migración 002). */
  gastosTableReady: boolean
  /** Tablas que no existen en Supabase (se cargaron como vacías) */
  missingTables?: string[]
}

// ── Salud de Supabase (contrato `gastos:supabase-health` / `gastos:supabase-test`) ──

export type SupabaseTableName = 'servicios' | 'pagos' | 'gastos' | 'credenciales' | 'queries'

export interface SupabaseHealth {
  /** Hay URL y key (guardadas o pasadas al test) */
  configured: boolean
  /** URL normalizada (sin `/rest/v1`); nunca incluye la key */
  url: string
  /** Supabase respondió HTTP (aunque sea con error) */
  reachable: boolean
  /** La key fue aceptada y es service_role/secret */
  authOk: boolean
  error?: string
  latencyMs?: number
  /** true = la tabla existe */
  tables: Record<SupabaseTableName, boolean>
  /** SQL para crear todas las tablas faltantes; '' si no falta ninguna (o no se pudo verificar) */
  missingSql: string
}

// ── Caché local compartido (main process, `<userData>/gastos-cache.json`) ──

/** Escritura pendiente de subir: `{ channel, args }` de IPC. */
export interface PendingWrite { channel: string; args: unknown[] }

export interface GastosCacheData {
  servicios: Servicio[]
  pagos: PagoMensual[]
  gastos: Gasto[]
}

export interface GastosPrefs {
  presupuesto?: number | null
  lastMetodo?: string | null
  /** Último mes en que se autogeneraron los pendientes (YYYY-MM) */
  autoPendientesMes?: string | null
  /** Día del mes en que vence cada servicio (id → 1..31). Sólo local: alimenta los avisos. */
  diasVencimiento?: Record<string, number>
}

export interface GastosCacheState {
  data: GastosCacheData | null
  /** ISO de la última escritura del caché */
  updatedAt: string | null
  /** Versión remota (max updated_at) de la última sincronización */
  lastSynced: string | null
  prefs: GastosPrefs
}

/** Parche para `gastos:cache-set` (sólo los campos presentes se escriben). */
export type GastosCachePatch = Partial<Omit<GastosCacheState, 'prefs'>> & { prefs?: GastosPrefs }
