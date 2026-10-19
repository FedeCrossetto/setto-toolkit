import type { NoteMeta } from '../plugins/notes/types'

/**
 * Bloc de la barra flotante: una sola nota de borrador guardada como una nota
 * más (`Bloc.md` en la carpeta de Notas), así se sincroniza y se puede abrir
 * en el módulo Notas aunque esté oculto.
 */
export const BLOC_ID = 'Bloc.md'
/** Autoguardado: espera tras la última tecla. */
export const BLOC_SAVE_MS = 500

export interface BlocStats { chars: number; lines: number; words: number }

export function blocStats(text: string): BlocStats {
  if (!text) return { chars: 0, lines: 0, words: 0 }
  return {
    chars: [...text].length,
    lines: text.split(/\r\n|\r|\n/).length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  }
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`

export function formatStats(s: BlocStats): string {
  if (!s.chars) return 'Vacío'
  return `${plural(s.chars, 'carácter', 'caracteres')} · ${plural(s.lines, 'línea', 'líneas')}`
}

/** Las últimas notas tocadas, sin el Bloc. */
export function recentNotes(notes: NoteMeta[], n = 3): NoteMeta[] {
  return notes.filter((x) => x.id !== BLOC_ID).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, n)
}
