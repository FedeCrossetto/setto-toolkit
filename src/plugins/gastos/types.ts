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

/** Totales de un mes (Inicio, dock, `gastos:summary`). */
export interface GastosMonthSummary {
  mes: string /* YYYY-MM */
  total: number
  fijos: number
  variables: number
  pendientes: number
  pendientesCount: number
  presupuesto: number | null
  previousTotal: number
  /** Hasta 2 categorías al 80 % o más de su presupuesto (Inicio). */
  presupuestosEnRiesgo?: CategoryBudgetRow[]
}

/** Progreso del presupuesto de una categoría en un mes (`budgets.ts`). */
export interface CategoryBudgetRow {
  categoria: string
  gastado: number
  presupuesto: number
  /** gastado / presupuesto (1 = 100 %) */
  pct: number
  restante: number
  /** ok < 80 % · warning ≥ 80 % · error > 100 % */
  estado: 'ok' | 'warning' | 'error'
}

export type Frecuencia = 'mensual' | 'semanal' | 'anual'

/**
 * Regla de gasto recurrente ("Netflix todos los meses el día 5"). Las instancias se generan solas
 * con id estable `rec-<ruleId>-<yyyy-mm-dd>` (`recurrence.ts`). Vive en las prefs del caché local.
 */
export interface ReglaRecurrente {
  id: string
  descripcion: string
  monto: number
  moneda: Moneda
  categoria: string
  metodoPago: string
  frecuencia: Frecuencia
  /** mensual / anual: día del mes (1..31, se ajusta al último día); semanal: día de la semana (0 = domingo) */
  dia: number
  /** anual: mes (1..12) */
  mesAnual?: number
  /** Primera fecha posible (YYYY-MM-DD) */
  desde: string
  /** Generado hasta esta fecha inclusive (YYYY-MM-DD); lo anterior no se vuelve a crear aunque se borre */
  hasta?: string | null
  pausada?: boolean
  created_at: string
}

/**
 * Respuesta de `gastos:summary`. `summary` puede venir del caché local aunque el estado no sea
 * 'ok' (offline / error); es `null` si no hay nada guardado en este equipo.
 */
export interface GastosSummaryResult {
  status: 'ok' | 'offline' | 'error' | 'not-configured'
  summary: GastosMonthSummary | null
  error?: string
  /** Cambios guardados en este equipo que todavía no subieron */
  pendingCount: number
  /** ISO de la última escritura del caché local */
  cachedAt: string | null
}

/** Respuesta de `gastos:load`. `credenciales` lleva sólo metadata (las contraseñas no salen del main). */
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
  /** Presupuesto mensual por categoría (nombre → monto). */
  presupuestosCategoria?: Record<string, number>
  /** Gastos recurrentes que se cargan solos. */
  recurrentes?: ReglaRecurrente[]
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
