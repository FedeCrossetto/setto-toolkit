/**
 * Plan de sincronización (puro, sin I/O — testeado en sync-plan.test.ts).
 *
 * Tres versiones por ítem: la local, la remota (Supabase) y la "base" = el hash
 * que tenían ambos lados en la última sincronización exitosa. Con la base se
 * sabe QUIÉN cambió algo:
 *
 *   local == base, remota distinta → cambió la remota → bajar
 *   remota == base, local distinta → cambió la local  → subir
 *   las dos distintas de la base    → conflicto
 *
 * Los borrados viajan como "lápidas" (fila con deleted = true) para que la otra
 * máquina sepa que se borró y no lo vuelva a subir. Ante la duda se conserva:
 * nunca se borra algo que tuvo cambios locales sin sincronizar.
 */

export interface LocalItem { hash: string; updatedAt: number }
export interface RemoteItem { hash: string; updatedAt: number; deleted: boolean }

export type SyncOp =
  | { type: 'push'; id: string }            // subir la versión local
  | { type: 'pull'; id: string }            // bajar la versión remota
  | { type: 'push-delete'; id: string }     // subir lápida (se borró acá)
  | { type: 'delete-local'; id: string }    // se borró en otra máquina
  | { type: 'conflict'; id: string }        // cambió en los dos lados
  | { type: 'forget'; id: string }          // ya no existe en ningún lado: olvidar la base
  | { type: 'in-sync'; id: string }         // igual en los dos lados: actualizar la base

export function planSync(
  local: ReadonlyMap<string, LocalItem>,
  remote: ReadonlyMap<string, RemoteItem>,
  base: Readonly<Record<string, string>>,
): SyncOp[] {
  const ids = new Set<string>([...local.keys(), ...remote.keys(), ...Object.keys(base)])
  const ops: SyncOp[] = []
  for (const id of ids) {
    const L = local.get(id)
    const R = remote.get(id)
    const B = base[id]
    const Rlive = R && !R.deleted ? R : undefined

    if (L && !R) {
      ops.push({ type: 'push', id })
    } else if (L && R && R.deleted) {
      // Borrado en otra máquina: sólo se borra acá si no lo tocamos desde la última vez.
      ops.push(B !== undefined && L.hash === B ? { type: 'delete-local', id } : { type: 'push', id })
    } else if (L && Rlive) {
      if (L.hash === Rlive.hash) ops.push({ type: 'in-sync', id })
      else if (B !== undefined && L.hash === B) ops.push({ type: 'pull', id })
      else if (B !== undefined && Rlive.hash === B) ops.push({ type: 'push', id })
      else ops.push({ type: 'conflict', id })
    } else if (!L && Rlive) {
      // No está acá: o es nuevo de otra máquina, o lo borramos acá.
      if (B === undefined) ops.push({ type: 'pull', id })
      else if (Rlive.hash === B) ops.push({ type: 'push-delete', id })
      else ops.push({ type: 'pull', id })   // lo borramos pero la otra máquina lo cambió: se recupera
    } else if (!L && (!R || R.deleted)) {
      if (B !== undefined) ops.push({ type: 'forget', id })
    }
  }
  return ops
}

/** Para conflictos de notas: nombre de la copia con la versión remota. */
export function conflictCopyId(id: string, existing: ReadonlySet<string>, date: Date): string {
  const base = id.replace(/\.md$/i, '')
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  // Sin paréntesis: el id de nota sólo admite letras, números, espacio, punto, guion y _.
  let candidate = `${base} - conflicto ${stamp}.md`
  for (let n = 2; existing.has(candidate); n++) candidate = `${base} - conflicto ${stamp} ${n}.md`
  return candidate
}

/** Contenido de la copia en conflicto: el título (primera línea) dice que es una copia. */
export function markConflictContent(content: string, date: Date): string {
  const stamp = date.toLocaleDateString('es-AR')
  const lines = content.split('\n')
  const i = lines.findIndex((l) => l.trim())
  if (i < 0) return `Conflicto ${stamp}\n`
  lines[i] = `${lines[i]!.replace(/\s+$/, '')} (conflicto ${stamp})`
  return lines.join('\n')
}
