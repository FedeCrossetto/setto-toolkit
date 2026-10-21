/** Datos del panorama de Inicio (puros, para poder probarlos). */

/** Cuántos eventos cayeron en cada uno de los últimos `days` días (el último es hoy). */
export function dailyCounts(timestamps: number[], days: number, now = new Date()): number[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const DAY = 86_400_000
  const out = new Array<number>(days).fill(0)
  for (const t of timestamps) {
    const idx = days - 1 - Math.floor((start - new Date(t).setHours(0, 0, 0, 0)) / DAY)
    if (idx >= 0 && idx < days) out[idx]! += 1
  }
  return out
}

/** Etiquetas cortas de los últimos `days` días: "lun", "mar"… (hoy = "hoy"). */
export function dayLabels(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => {
    if (i === days - 1) return 'hoy'
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i))
    return d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
  })
}
