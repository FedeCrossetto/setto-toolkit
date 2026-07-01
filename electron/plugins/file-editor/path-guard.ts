import fs from 'fs'
import path from 'path'

/**
 * Authorized root directories — populated whenever the user opens a folder via
 * dialog or passes a file via CLI. Write/delete/rename operations are restricted
 * to paths inside one of these roots.
 */
const authorizedRoots = new Set<string>()

export function addAuthorizedRoot(rootPath: string): void {
  authorizedRoots.add(path.resolve(rootPath))
}

/** Test-only: clears authorized roots between test cases. */
export function _resetAuthorizedRoots(): void {
  authorizedRoots.clear()
}

/**
 * Validates and resolves a filesystem path.
 * Rejects null bytes and relative paths.
 */
export function validatePath(filePath: unknown): string {
  if (!filePath || typeof filePath !== 'string') throw new Error('Invalid path')
  if (filePath.includes('\0')) throw new Error('Path contains null bytes')
  const resolved = path.resolve(filePath)
  if (!path.isAbsolute(resolved)) throw new Error('Path must be absolute')
  return resolved
}

/**
 * Verify that `targetPath` is located inside at least one authorized root.
 * Resolves symlinks via realpathSync so a symlink pointing outside the workspace
 * cannot bypass the guard. Throws if the path is not covered.
 */
export function assertInAuthorizedRoot(targetPath: string): void {
  if (authorizedRoots.size === 0) {
    throw new Error('No workspace is open. Open a folder first before performing write operations.')
  }
  // Resolve symlinks so a symlink inside the workspace pointing outside cannot bypass the guard.
  const logical = path.resolve(targetPath)
  let real = logical
  try {
    real = fs.realpathSync(logical)
  } catch {
    // File doesn't exist yet (e.g. new file being created) — resolve the parent
    // directory instead so symlinks in the parent are still caught.
    try {
      real = path.join(fs.realpathSync(path.dirname(logical)), path.basename(logical))
    } catch { /* parent also doesn't exist — use logical path */ }
  }

  for (const root of authorizedRoots) {
    const rel = path.relative(root, real)
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return
  }
  throw new Error(`Operation denied: path is outside any open workspace — "${real}"`)
}
