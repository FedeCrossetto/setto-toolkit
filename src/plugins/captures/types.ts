/** Compartido entre el renderer y electron/plugins/captures (ver captures-utils.ts). */
export interface CaptureEntry {
  id: string
  /** Archivo PNG dentro de la carpeta de capturas */
  file: string
  createdAt: number
  width: number
  height: number
  bytes: number
  title: string
  ticket: string
  tags: string[]
  note: string
  pinned: boolean
  /** Texto reconocido (OCR de Windows); null = todavía no se procesó */
  ocr: string | null
  /** Id de la captura original si esta es una versión anotada */
  annotatedFrom?: string
  /** App y ventana en primer plano al capturar (p. ej. "WigosGUI" / "Error") */
  app?: string
  window?: string
  /** sha1 de los píxeles: evita guardar la misma imagen dos veces */
  hash?: string
}

/** Versión liviana para la galería: sin el texto OCR ni la nota. */
export type CaptureLite = Omit<CaptureEntry, 'ocr' | 'note'> & {
  hasNote: boolean
  ocrState: 'pending' | 'done' | 'empty'
}

export type CaptureSort = 'new' | 'old' | 'ticket' | 'app' | 'size'

export interface CaptureQuery {
  text?: string
  ticket?: string | null
  app?: string | null
  pinned?: boolean
  sort?: CaptureSort
  offset?: number
  limit?: number
}

export interface CaptureFacets {
  count: number
  bytes: number
  tickets: string[]
  apps: { name: string; count: number }[]
}

export interface CaptureSettings {
  auto: boolean
  keepDays: number
  /** Tope de espacio en MB (0 = sin tope) */
  maxMb: number
  /** Aviso del sistema al guardar una captura */
  notify: boolean
  /** Apps cuyas capturas no se guardan (p. ej. juegos) */
  excludeApps: string[]
}

export interface CaptureQueryResult {
  items: CaptureLite[]
  total: number
  facets: CaptureFacets
  settings: CaptureSettings
  dir: string
}

/** URL para <img>: la sirve main con el protocolo setto-capture. */
export const captureUrl = (file: string): string => `setto-capture://img/${encodeURIComponent(file)}`
/** Miniatura JPEG (~480 px); si todavía no existe, main devuelve la imagen original. */
export const thumbUrl = (file: string): string => `setto-capture://thumb/${encodeURIComponent(file)}`
