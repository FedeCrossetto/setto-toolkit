import type { PagoMensual } from './types'

/** Id estable para upsert por servicio + mes (evita duplicados al reimportar). */
export function pagoKey(servicioId: string, mes: string) {
  return `${servicioId}::${mes}`
}

function mk(
  servicioId: string,
  mes: string,
  monto: number,
  extra?: Partial<Pick<PagoMensual, 'fecha' | 'metodoPago' | 'notas'>>,
): PagoMensual {
  return {
    id: `${servicioId}-${mes}`,
    servicioId,
    mes,
    monto,
    pagado: true,
    ...extra,
  }
}

/**
 * Mes → [Metrogas Casa, Edesur, Aysa, Telecentro?] (miles AR: ya como número JS).
 * Si falta un servicio en un mes, usar `undefined` y no se crea fila.
 */
const CASA_ROWS: [string, [number | undefined, number | undefined, number | undefined, number | undefined]][] = [
  ['2022-09', [2499, 5104.38, 1051.55, 2347.85]],
  ['2022-10', [1726.51, 2306.37, 1058.22, 2347.85]],
  ['2022-11', [915.18, 2280.88, 1058.22, 3304.1]],
  ['2022-12', [945.32, 1432.66, 1708.89, 3304.1]],
  ['2023-01', [476.45, 1874.3, 1849.54, 8310]],
  ['2023-02', [261, 2077.33, 2143.6, 9930]],
  ['2023-03', [undefined, 2083.33, 2245.85, 5875.52]],
  ['2023-04', [560.36, 2716.28, 2245.85, 5875.52]], // Metrogas: 279,18 + 281,18
  ['2023-05', [301.5, 1329.78, 2245.85, 6815.83]],
  ['2023-06', [282.06, 4857.44, 2245.85, 7487.83]],
  ['2023-07', [1899.62, 4546.34, 2245.85, 7906.32]],
  ['2023-08', [1927.24, 66.09, 2245.85, 9049.42]],
  ['2023-09', [3020.16, 11250.11, 2365.89, 20800.5]],
  ['2023-10', [2861.09, 5342.4, 4173.92, undefined]],
  ['2023-11', [1460.86, 5371.01, 5122.57, undefined]],
  ['2023-12', [1243.55, 3534.94, 5312.3, undefined]],
  ['2024-01', [580.54, 2521.45, 6185.02, undefined]],
  ['2024-02', [349.71, 7698.29, 6450.64, undefined]],
  ['2024-03', [398.25, 7876.39, 6861.51, undefined]],
  ['2024-04', [401.51, 7980.32, 6862.66, undefined]],
  ['2024-05', [1677.61, 11365.62, 19932.49, undefined]],
  ['2024-06', [1609.65, 8206.49, 20073, undefined]],
  ['2024-07', [10905.12, 8388.13, 22595.01, undefined]],
  ['2024-08', [10726.28, 22541.6, 22722.66, undefined]],
  ['2024-09', [31729.12, 23852.85, 25832.64, undefined]],
  ['2024-10', [31694.24, 17722.03, 24608.66, undefined]],
  ['2024-11', [13045.72, 10380.17, 27056.09, undefined]],
  ['2024-12', [12564.28, 13630.64, 28561.72, undefined]],
  ['2025-01', [3879.48, 13937.18, 27423.57, undefined]],
  ['2025-02', [3881.37, 18634.89, 27613.18, undefined]],
  ['2025-03', [4013.86, 16283.96, 28321.17, undefined]],
  // Abril 2025 — bloque “Casa” vacío en tu nota; valores desde “Portal” (Casa)
  ['2025-04', [3934.56, 20730.46, 28174.28, undefined]],
  ['2025-05', [4102.54, 21825.33, 28286.29, undefined]],
  ['2025-06', [4062.49, 18549.68, 28731.02, undefined]],
  ['2025-07', [15412.65, 20894.63, 29008.72, undefined]],
  // Edesur ago/sep 2025: en el texto figuaban “196.797,75” y “202.612,37”; se interpretan como 19.679,75 y 20.261,37
  ['2025-08', [15403.71, 19679.75, 29289.09, undefined]],
  ['2025-09', [25938.25, 20261.37, 29843.98, undefined]],
  ['2025-10', [25923.09, 27599.99, 30188.94, undefined]],
  ['2025-11', [13362.21, 27524.67, 30166.57, undefined]],
  ['2025-12', [13485.88, 20625.9, 30992.92, undefined]],
  ['2026-01', [6590, 27003.99, 30752.49, undefined]],
  ['2026-02', [6433.22, 52155.27, 31539.78, undefined]],
  ['2026-03', [5531.39, 46705.76, 32801.38, undefined]],
]

const CASA_IDS = ['metrogas-casa', 'edesur', 'aysa', 'telecentro'] as const

function expandCasa(): PagoMensual[] {
  const out: PagoMensual[] = []
  for (const [mes, vals] of CASA_ROWS) {
    vals.forEach((monto, i) => {
      if (monto === undefined) return
      out.push(mk(CASA_IDS[i], mes, monto))
    })
  }
  return out
}

/**
 * Depto / streaming — orden por mes según tu sección DEPTO:
 * Metrogas depto, Expensa, TSG, Amazon, Flow, Personal
 * (si falta línea, undefined)
 */
type Depto6 = [number | undefined, number | undefined, number | undefined, number | undefined, number | undefined, number | undefined]

const DEPTO_ROWS: [string, Depto6][] = [
  ['2022-09', [476, 5799, undefined, 555, 3435.99, 1049.99]],
  ['2022-10', [644, 5799, undefined, 555, 3435.99, 599]],
  ['2022-11', [undefined, 5799, 1514.6, 555, 5326.99, 1809]],
  ['2022-12', [500.94, 5799, 1521.7, 555, 5326.99, 1043]],
  ['2023-01', [470.26, 5799, 2729.27, 555, 5326.99, 1350]],
  ['2023-02', [532.46, 5799, 28228.51, 555, 7348.99, 1350]],
  ['2023-03', [493.09, 5799, undefined, 555, 7649.02, 2530]],
  ['2023-04', [612.39, 8058, undefined, 555, 9184.02, 1984.02]],
  ['2023-05', [562.97, 10321, undefined, 748, 7160, 2300]],
  ['2023-06', [825.8, 12945, undefined, 748.2, 7900, 2429]],
  ['2023-07', [825.1, 16001, undefined, 748.2, 9080, 2750]],
  ['2023-08', [1152.72, 16001, undefined, 1009.2, 3565.01, 1775]],
  ['2023-09', [1153.73, 19143, undefined, 1009.2, 3934, 2185.01]],
  ['2023-10', [1156.78, 24195, undefined, 1009.2, 4258.01, 2545.01]],
  ['2023-11', [1157.14, 24195, undefined, 1009.2, 4865.5, 3105.01]],
  ['2023-12', [1225.16, 31479, undefined, 1390.29, 5713.75, 3845]],
  ['2024-01', [1160.76, 31479, 69583.62, 1390.29, 5030.01, 5023.68]],
  ['2024-02', [1370.88, undefined, undefined, 1934.79, 8420.5, 6285.49]],
  ['2024-03', [1303.69, 95674, undefined, 1934.79, 12005, 7852]],
  ['2024-04', [1231.99, 60949, undefined, 1934.79, 15205, 10505]],
  ['2024-05', [1296.58, 80904, undefined, 2539.79, 17610, 11290.5]],
  ['2024-06', [5793.05, 105737, undefined, undefined, undefined, undefined]],
  ['2024-07', [4181.29, undefined, undefined, undefined, undefined, undefined]],
  ['2024-08', [5912.33, undefined, undefined, undefined, undefined, undefined]],
  ['2024-09', [8592.39, 88923, undefined, undefined, undefined, undefined]],
  ['2024-10', [8878.21, undefined, undefined, 4838.79, undefined, undefined]],
  ['2024-11', [8583.72, undefined, undefined, 4838.79, undefined, undefined]],
  ['2024-12', [6035.15, undefined, undefined, undefined, undefined, undefined]],
  ['2025-01', [6119.78, 108235, 19791.6, undefined, undefined, undefined]],
  ['2025-02', [6255.91, 107888, undefined, 4838.79, 54039.99, undefined]],
  ['2025-03', [6061.26, 107854, 19791.6, undefined, undefined, undefined]],
  ['2025-04', [5907.53, 107385, 19791.6, undefined, undefined, undefined]],
  // Metrogas depto [40000143442] “llamita”: captura mayo 2025–mar 2026 (junio sin ticket: mismo monto que junio en portal)
  ['2025-05', [6541.87, 119690, 19791.6, undefined, undefined, undefined]],
  ['2025-06', [6541.87, 118997, 19791.6, undefined, undefined, undefined]],
  ['2025-07', [6579.86, 102043, undefined, undefined, undefined, undefined]],
  ['2025-08', [7269.18, 89051, undefined, undefined, undefined, undefined]],
  ['2025-09', [6981.11, 81632, 89462, undefined, undefined, undefined]],
  ['2025-10', [11337.18, 96640, undefined, undefined, undefined, undefined]],
  ['2025-11', [7110.64, 81640, undefined, undefined, undefined, undefined]],
  ['2025-12', [6939.96, 102050, undefined, undefined, undefined, undefined]],
  ['2026-01', [11005.04, 101315, undefined, undefined, undefined, undefined]],
  ['2026-02', [12198.2, 105647, undefined, undefined, undefined, undefined]],
  ['2026-03', [12181.19, 94418, undefined, undefined, undefined, undefined]],
]

const DEPTO_IDS = ['metrogas-depto', 'expensa', 'tsg', 'amazon', 'flow', 'personal'] as const

function expandDepto(): PagoMensual[] {
  const out: PagoMensual[] = []
  for (const [mes, vals] of DEPTO_ROWS) {
    vals.forEach((monto, i) => {
      if (monto === undefined) return
      out.push(mk(DEPTO_IDS[i], mes, monto))
    })
  }
  return out
}

/**
 * Edesur depto [0006013319] “luz” — columna aparte en tu captura (mayo 2025–abril 2026).
 */
const EDESUR_DEPTO_ROWS: [string, number][] = [
  ['2025-05', 20042.56],
  ['2025-06', 11409.17],
  ['2025-07', 60705.9],
  ['2025-08', 57371.32],
  ['2025-09', 37459.39],
  ['2025-10', 38146.46],
  ['2025-11', 38146.46],
  ['2025-12', 44654.36],
  ['2026-01', 79455.19],
  ['2026-02', 78021.97],
  ['2026-03', 68567.99],
  ['2026-04', 45462],
]

function expandEdesurDepto(): PagoMensual[] {
  return EDESUR_DEPTO_ROWS.map(([mes, monto]) => mk('edesur-depto', mes, monto))
}

/** Pagos extraídos de tu listado (Casa + Depto + Edesur depto). Revisá montos raros (p. ej. Edesur ago/sep 2025) en la app. */
export function buildHistoricoPagos(): PagoMensual[] {
  return [...expandCasa(), ...expandDepto(), ...expandEdesurDepto()]
}

/** Fusiona: por cada servicio+mes del import, reemplaza o agrega; conserva el resto. */
export function mergePagosImport(existing: PagoMensual[], incoming: PagoMensual[]): PagoMensual[] {
  const map = new Map<string, PagoMensual>()
  for (const p of existing) map.set(pagoKey(p.servicioId, p.mes), p)
  for (const inc of incoming) {
    const key = pagoKey(inc.servicioId, inc.mes)
    const prev = map.get(key)
    map.set(key, prev ? { ...inc, id: prev.id } : inc)
  }
  return Array.from(map.values())
}

/**
 * Solo agrega filas del histórico que todavía no existen (servicio+mes).
 * Al abrir Gastos rellena celdas vacías sin pisar lo que ya cargaste a mano.
 * Para forzar actualización de montos viejos, usá “Importar histórico”.
 */
export function mergeHistoricoFaltante(existing: PagoMensual[], incoming: PagoMensual[]): PagoMensual[] {
  const map = new Map<string, PagoMensual>()
  for (const p of existing) map.set(pagoKey(p.servicioId, p.mes), p)
  for (const inc of incoming) {
    const key = pagoKey(inc.servicioId, inc.mes)
    if (!map.has(key)) map.set(key, inc)
  }
  return Array.from(map.values())
}
