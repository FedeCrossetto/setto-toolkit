/** Texts and validation for the end-to-end password sync UI (pure). */
import { estimateStrength } from './strength'
import type { E2EStatus } from './types'

/** Same minimum as main (electron/plugins/credentials/e2e-crypto.ts). */
export const MASTER_MIN_LENGTH = 10
/** "Fuerte" or better: it protects every password stored in Supabase. */
export const MASTER_MIN_SCORE = 3

/** Why a new master password can't be used yet (null = ok). */
export function masterPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < MASTER_MIN_LENGTH) return `Tiene que tener al menos ${MASTER_MIN_LENGTH} caracteres`
  if (estimateStrength(password).score < MASTER_MIN_SCORE) return 'Es demasiado fácil de adivinar: sumá palabras o caracteres'
  if (password !== confirm) return 'Las contraseñas no coinciden'
  return null
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** One-line summary for the footer / sheet. */
export function e2eSummary(s: E2EStatus): { text: string; tone: 'success' | 'muted' | 'warning' | 'error' } {
  const { synced, local, remote, conflict } = s.counts
  switch (s.state) {
    case 'local-mode': return { text: 'No disponible en modo local', tone: 'muted' }
    case 'migration-missing': return { text: 'Falta aplicar la migración 004', tone: 'warning' }
    case 'offline': return { text: 'Sin conexión con Supabase', tone: 'muted' }
    case 'error': return { text: s.error ? `Error: ${s.error}` : 'Error al consultar Supabase', tone: 'error' }
    case 'off': return { text: 'Desactivada', tone: 'muted' }
    case 'locked':
      return remote
        ? { text: `Bloqueada — ${plural(remote, 'contraseña espera', 'contraseñas esperan')} en la nube`, tone: 'warning' }
        : { text: 'Bloqueada en esta computadora', tone: 'muted' }
    case 'unlocked':
      if (conflict) return { text: plural(conflict, 'conflicto para revisar', 'conflictos para revisar'), tone: 'warning' }
      return local
        ? { text: `${plural(synced, 'sincronizada', 'sincronizadas')}, ${local} sólo en esta PC`, tone: 'warning' }
        : { text: synced ? `${plural(synced, 'contraseña sincronizada', 'contraseñas sincronizadas')}` : 'Activada', tone: 'success' }
  }
}

/** Label + tooltip for an item's sync state. */
export const E2E_ITEM_LABEL: Record<'synced' | 'local' | 'remote' | 'conflict', { label: string; hint: string }> = {
  conflict: { label: 'Conflicto', hint: 'La contraseña de esta PC y la sincronizada son distintas y no se sabe cuál es más nueva. Elegí cuál usar' },
  synced: { label: 'Sincronizada', hint: 'Cifrada de extremo a extremo y disponible en tus otras computadoras' },
  local: { label: 'Sólo en esta PC', hint: 'Todavía no se subió cifrada. Se sube cuando la sincronización esté desbloqueada' },
  remote: { label: 'En la nube', hint: 'Guardada desde otra computadora. Desbloqueá la sincronización para traerla' },
}
