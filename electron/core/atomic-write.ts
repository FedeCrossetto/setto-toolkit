import fs from 'fs'

/**
 * Escritura atómica robusta para Windows: archivo temporal con nombre ÚNICO
 * (dos escrituras seguidas no comparten el `.tmp`) y rename con reintentos
 * cortos — en Windows `rename` falla con EPERM/EBUSY/EACCES si el antivirus,
 * el indexador u OneDrive tiene abierto el destino un instante.
 */
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES'])
const MAX_ATTEMPTS = 8
let seq = 0

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function renameWithRetry(from: string, to: string, attempts = MAX_ATTEMPTS): void {
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (!RETRYABLE.has(code) || i >= attempts) {
        // Último recurso: copiar encima (no atómico, pero no pierde la escritura).
        if (RETRYABLE.has(code)) {
          fs.copyFileSync(from, to)
          try { fs.unlinkSync(from) } catch { /* el .tmp queda; se pisa en la próxima */ }
          return
        }
        throw err
      }
      sleepSync(15 * i)
    }
  }
}

export function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${++seq}.tmp`
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8')
    renameWithRetry(tmpPath, filePath)
  } catch (err) {
    try { fs.unlinkSync(tmpPath) } catch { /* puede no existir */ }
    throw err
  }
}
