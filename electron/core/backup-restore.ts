import fs from 'fs'
import path from 'path'
import { collectFiles, fromPortable, safeRelPath, type BackupPayload, type Codec } from './backup'

/**
 * Restaurar un respaldo sin dejar los datos a medias:
 *
 * 1. Staging: todas las entradas se escriben (re-cifradas para esta PC) en
 *    `.restore-staging-<ts>/` dentro de userData. Si algo falla acá, no se tocó nada.
 * 2. Validación: sólo entran rutas seguras que pertenecen al conjunto de datos
 *    conocido (`collectFiles`) y los `.json` en texto tienen que parsear.
 * 3. Intercambio: lo actual del conjunto de datos se MUEVE a `restore-backup-<ts>/`
 *    (incluidos los archivos que el respaldo no trae: así se borran de los datos
 *    vivos pero quedan en la copia) y lo preparado se mueve a su lugar. Son renames
 *    dentro del mismo disco.
 * 4. Si cualquier paso del intercambio falla, se deshace en orden inverso y se
 *    devuelve el error: los datos quedan como estaban.
 *
 * Las capturas sólo cuentan como parte del conjunto si el respaldo trae alguna
 * (exportar sin capturas no debe borrar las capturas de esta PC). Lo que no es del
 * conjunto (sesiones, cachés, `backup-auto.json`, otras carpetas) no se toca.
 */
export interface RestoreResult {
  files: number
  removed: number
  skipped: string[]
  safety: string
}

export interface RestoreOptions {
  /** Para tests: `Date.now()` fijo. */
  now?: number
  /** Para tests: simular una falla al mover el archivo n-ésimo del intercambio. */
  failAt?: number
}

/** Rename con reintento corto (Windows: antivirus / indexador con el archivo abierto). */
function renameWithRetry(from: string, to: string): void {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (i >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1))   // espera corta
    }
  }
}

function validateStaged(stage: string, rel: string): void {
  if (!/\.json$/i.test(rel)) return
  const text = fs.readFileSync(path.join(stage, rel), 'utf-8')
  if (text.trimStart().startsWith('ENCV1:')) return
  try { JSON.parse(text) } catch { throw new Error(`El respaldo trae un archivo dañado: ${rel}`) }
}

export function restoreBackupInto(dir: string, payload: BackupPayload, codec: Codec, opts: RestoreOptions = {}): RestoreResult {
  const ts = opts.now ?? Date.now()
  const stage = path.join(dir, `.restore-staging-${ts}`)
  const safety = path.join(dir, `restore-backup-${ts}`)
  const skipped: string[] = []

  // ── 1. Staging ──────────────────────────────────────────────────────────────
  const hasCaptures = payload.entries.some((e) => typeof e?.path === 'string' && e.path.startsWith('captures/'))
  const staged = new Set<string>()
  fs.rmSync(stage, { recursive: true, force: true })
  try {
    for (const entry of payload.entries) {
      const rel = typeof entry?.path === 'string' ? safeRelPath(entry.path) : null
      if (!rel) { skipped.push(String(entry?.path)); continue }
      const target = path.join(stage, rel)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, fromPortable(entry, codec))
      staged.add(rel)
    }
    // ── 2. Validación ─────────────────────────────────────────────────────────
    // Lo que collectFiles no reconocería como dato de Setto no se restaura.
    const known = new Set(collectFiles(stage, { includeCaptures: hasCaptures }))
    for (const rel of [...staged]) {
      if (!known.has(rel)) { staged.delete(rel); skipped.push(rel) }
      else validateStaged(stage, rel)
    }
    if (staged.size === 0) throw new Error('El respaldo no trae datos para restaurar')
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true })
    throw err
  }

  // ── 3. Intercambio ──────────────────────────────────────────────────────────
  const current = collectFiles(dir, { includeCaptures: hasCaptures })
  /** Pasos hechos, para deshacer: [desde, hacia]. */
  const done: Array<[string, string]> = []
  let step = 0
  const move = (from: string, to: string): void => {
    if (opts.failAt !== undefined && step++ === opts.failAt) throw new Error('falla simulada')
    fs.mkdirSync(path.dirname(to), { recursive: true })
    renameWithRetry(from, to)
    done.push([from, to])
  }
  try {
    for (const rel of current) move(path.join(dir, rel), path.join(safety, rel))
    for (const rel of staged) move(path.join(stage, rel), path.join(dir, rel))
  } catch (err) {
    // ── 4. Deshacer ───────────────────────────────────────────────────────────
    const problems: string[] = []
    for (const [from, to] of done.reverse()) {
      try { fs.mkdirSync(path.dirname(from), { recursive: true }); renameWithRetry(to, from) } catch (e) {
        problems.push(`${to} → ${from}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    fs.rmSync(stage, { recursive: true, force: true })
    if (!problems.length) fs.rmSync(safety, { recursive: true, force: true })
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(problems.length
      ? `No se pudo restaurar (${msg}) y quedaron archivos sin volver a su lugar; la copia está en ${safety}`
      : `No se pudo restaurar: ${msg}. Los datos quedaron como estaban.`)
  }

  fs.rmSync(stage, { recursive: true, force: true })
  const removed = current.filter((rel) => !staged.has(rel)).length
  return { files: staged.size, removed, skipped, safety }
}
