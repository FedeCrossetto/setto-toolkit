/** Consultas SQL: tipos compartidos entre el renderer y main. */

export interface QuerySet {
  columns: string[]
  /** Tipo SQL de cada columna (int, nvarchar, datetime…) */
  types: string[]
  rows: (string | null)[][]
  /** Filas que devolvió el servidor (puede ser más que `rows`, que se corta en maxRows) */
  total: number
  /** Lote (GO) que lo produjo */
  batch: number
}

export interface QueryResult {
  ok: boolean
  sets: QuerySet[]
  messages: string[]
  ms: number
  error?: string
  /** Línea del error dentro del lote (SqlException.LineNumber) */
  line?: number | null
  number?: number | null
  batch?: number
  cancelled?: boolean
  /** Dónde falló: al conectar (servidor, usuario, contraseña) o ya ejecutando */
  phase?: 'connect' | 'run'
}

export interface QueryTab {
  id: string
  title: string
  sql: string
  profileId: string | null
  /** Base a usar en vez de la del perfil (vacío = la del perfil) */
  database: string
  readOnly: boolean
  updatedAt: number
  /** El usuario le puso nombre (no se recalcula del contenido) */
  named?: boolean
  /** Últimos valores de los parámetros @x de esta pestaña */
  params?: Record<string, string>
  /** Mostrar lecturas y tiempos (SET STATISTICS IO, TIME) */
  stats?: boolean
}

export interface QueryTabsState {
  tabs: QueryTab[]
  activeId: string | null
  /** Pestañas cerradas: se pueden reabrir (Ctrl+Shift+T). Las últimas 30. */
  closed: QueryTab[]
}

/** Consulta guardada como favorita (plantilla que se repite). */
export interface QueryFavorite {
  id: string
  title: string
  sql: string
  /** Conexión con la que se guardó (al abrirla se usa si sigue existiendo) */
  profileId: string | null
  database: string
  createdAt: number
}

export interface QueryHistoryEntry {
  id: string
  at: number
  profileId: string | null
  profileName: string
  database: string
  sql: string
  ok: boolean
  ms: number
  rows: number
  readOnly: boolean
  error?: string
}
