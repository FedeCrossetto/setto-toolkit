import type { CaptureEntry } from './types'

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Nombre al exportar: "WIGOS-123967 - WigosGUI Error - 2026-10-12 14-03.png" (sin
 * caracteres inválidos en Windows). Lo usan main (exportar) y el comentario de Jira
 * (que referencia las imágenes por este mismo nombre).
 */
export function exportFileName(e: Pick<CaptureEntry, 'ticket' | 'title' | 'createdAt'>): string {
  const d = new Date(e.createdAt)
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  const parts = [e.ticket, e.title, stamp].map((p) => p.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  return `${parts.join(' - ').slice(0, 150)}.png`
}

/** Nombres únicos en el orden dado (los repetidos llevan " (2)", " (3)"…), igual que al exportar. */
export function uniqueExportNames(list: Pick<CaptureEntry, 'ticket' | 'title' | 'createdAt'>[]): string[] {
  const used = new Set<string>()
  return list.map((e) => {
    const name = exportFileName(e)
    let candidate = name
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = name.replace(/\.png$/, ` (${n}).png`)
    used.add(candidate.toLowerCase())
    return candidate
  })
}
