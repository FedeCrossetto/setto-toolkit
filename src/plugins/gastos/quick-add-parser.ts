/**
 * Parser puro del "agregado rápido": `"1500 super efectivo"` →
 * `{ monto: 1500, descripcion: 'super', categoria: 'Supermercado', metodoPago: 'Efectivo', … }`.
 *
 * - Montos: `1500`, `$1500`, `1.500`, `1.500,50`, `1500.5`, `1,5`, `15k`, `usd 20` / `20usd`.
 * - Fechas: `hoy`, `ayer`, `anteayer`, `dd/mm`, `dd/mm/aa(aa)`. Por defecto, hoy.
 * - Palabras en cualquier orden; `#categoria` fuerza la categoría.
 */
import type { Moneda } from './types'

export const METODOS_VARIABLES = ['Efectivo', 'MP', 'Débito', 'Crédito', 'Transferencia', 'Otro'] as const

export const CATEGORIAS_VARIABLES = [
  'Supermercado', 'Comida afuera', 'Transporte', 'Salud', 'Hogar', 'Ocio', 'Ropa', 'Regalos', 'Mascotas',
  'Educación', 'Otro',
] as const

export interface QuickAddResult {
  monto: number | null
  descripcion: string
  categoria: string
  /** null = no se mencionó; usar el último método recordado */
  metodoPago: string | null
  moneda: Moneda
  /** true si se escribió la moneda (usd, pesos, $…); si no, se puede usar la aprendida */
  monedaExplicita: boolean
  fecha: string // YYYY-MM-DD
  /** true si la categoría salió de una palabra clave o `#tag` (no del default) */
  categoriaDetectada: boolean
}

function strip(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const METHOD_KEYWORDS: Array<[RegExp, string]> = [
  [/^(efectivo|efvo|efec|cash|billete)$/, 'Efectivo'],
  [/^(mp|mercadopago|mercado-pago|qr)$/, 'MP'],
  [/^(debito|deb|td)$/, 'Débito'],
  [/^(credito|cred|tc|tarjeta|visa|master|mastercard|amex)$/, 'Crédito'],
  [/^(transferencia|transf|transfer|cbu|alias)$/, 'Transferencia'],
]

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/^(super|supermercado|coto|carrefour|jumbo|disco|dia|vea|chino|almacen|verduleria|verdu|carniceria|panaderia|fiambreria|mayorista|changomas)$/, 'Supermercado'],
  [/^(resto|restaurant|restaurante|almuerzo|cena|desayuno|cafe|bar|delivery|pedidosya|rappi|pizza|empanadas|birra|cerveza|helado|sushi|hamburguesa|comida)$/, 'Comida afuera'],
  [/^(nafta|combustible|ypf|shell|axion|uber|cabify|didi|taxi|remis|sube|colectivo|subte|tren|peaje|estacionamiento|cochera|auto|mecanico|gomeria)$/, 'Transporte'],
  [/^(farmacia|remedios|medicamentos|medico|dentista|odontologo|clinica|analisis|salud|psicologo|kinesio)$/, 'Salud'],
  [/^(ferreteria|limpieza|muebles|hogar|casa|bazar|pintura|plomero|electricista)$/, 'Hogar'],
  [/^(cine|teatro|recital|show|juego|juegos|steam|libro|libros|salida|vacaciones|hotel|viaje)$/, 'Ocio'],
  [/^(ropa|zapatillas|remera|pantalon|campera|zapatos|calzado)$/, 'Ropa'],
  [/^(regalo|regalos|cumple|cumpleanos)$/, 'Regalos'],
  [/^(veterinaria|vete|perro|gato|mascota|alimento)$/, 'Mascotas'],
  [/^(curso|colegio|facultad|universidad|cuota|educacion|utiles)$/, 'Educación'],
]

const USD_RE = /^(usd|u\$s|us\$|u\$d|dolares|dolar|dls)$/
const ARS_RE = /^(ars|pesos|\$)$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Convierte un número escrito a mano en es-AR o en formato "programador".
 * Devuelve null si no es un monto.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/^\$/, '').replace(/\$$/, '')
  let mult = 1
  if (/^\d+([.,]\d+)?k$/.test(s)) { mult = 1000; s = s.slice(0, -1) }
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  let normalized: string
  if (dots && commas) {
    // El último separador es el decimal: 1.500,50 | 1,500.50
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    const thousandSep = decimalSep === ',' ? '.' : ','
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.')
  } else if (dots || commas) {
    const sep = dots ? '.' : ','
    const count = dots || commas
    const after = s.slice(s.lastIndexOf(sep) + 1)
    if (count > 1 || after.length === 3) normalized = s.split(sep).join('') // miles: 1.500 | 1.500.000
    else normalized = s.replace(sep, '.') // decimal: 1500.5 | 1,5
  } else {
    normalized = s
  }
  const n = Number(normalized) * mult
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function parseDateToken(tok: string, today: Date): string | null {
  const t = strip(tok)
  if (t === 'hoy') return isoDate(today)
  if (t === 'ayer') return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  if (t === 'anteayer') return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2))
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  let year = m[3] ? Number(m[3]) : today.getFullYear()
  if (m[3] && m[3].length === 2) year += 2000
  const d = new Date(year, month - 1, day)
  if (d.getMonth() !== month - 1) return null // 31/02
  // Sin año y en el futuro → se refiere al año pasado (ej. "28/12" escrito en enero)
  if (!m[3] && d > today) d.setFullYear(year - 1)
  return isoDate(d)
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s
}

export function parseQuickAdd(text: string, today: Date = new Date()): QuickAddResult {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  let monto: number | null = null
  let moneda: Moneda = 'ARS'
  let monedaExplicita = false
  let fecha: string | null = null
  let metodoPago: string | null = null
  let categoria: string | null = null
  let forcedCategoria: string | null = null
  const desc: string[] = []

  for (const tok of tokens) {
    const t = strip(tok)
    if (!fecha) {
      const d = parseDateToken(tok, today)
      if (d) { fecha = d; continue }
    }
    if (USD_RE.test(t)) { moneda = 'USD'; monedaExplicita = true; continue }
    if (ARS_RE.test(t)) { monedaExplicita = true; continue }
    if (monto === null) {
      // "20usd" / "usd20" / "$1.500"
      const usdGlued = /^(?:usd|u\$s|us\$)?(.+?)(?:usd|u\$s|us\$)?$/.exec(t)
      const core = usdGlued?.[1] ?? t
      const n = parseAmount(core)
      if (n !== null) {
        monto = n
        if (core !== t && /usd|u\$s|us\$/.test(t)) { moneda = 'USD'; monedaExplicita = true }
        else if (t.startsWith('$')) monedaExplicita = true
        continue
      }
    }
    if (t.startsWith('#') && t.length > 1) {
      const name = tok.slice(1)
      const known = CATEGORIAS_VARIABLES.find((c) => strip(c) === strip(name))
      forcedCategoria = known ?? capitalize(name)
      continue
    }
    if (!metodoPago) {
      const hit = METHOD_KEYWORDS.find(([re]) => re.test(t))
      if (hit) { metodoPago = hit[1]; continue }
    }
    if (!categoria) {
      const hit = CATEGORY_KEYWORDS.find(([re]) => re.test(t))
      if (hit) categoria = hit[1]
    }
    desc.push(tok)
  }

  const finalCategoria = forcedCategoria ?? categoria
  return {
    monto,
    descripcion: desc.join(' ') || finalCategoria || '',
    categoria: finalCategoria ?? 'Otro',
    metodoPago,
    moneda,
    monedaExplicita,
    fecha: fecha ?? isoDate(today),
    categoriaDetectada: finalCategoria !== null,
  }
}
