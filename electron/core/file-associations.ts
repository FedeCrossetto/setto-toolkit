import { execFileSync } from 'child_process'
import { app } from 'electron'
import path from 'path'

const APP_NAME = 'SettoToolkit'
const EXTENSIONS = ['.txt', '.cfg', '.log', '.cs']

/**
 * Registers the app in Windows registry so it appears in the "Open with" menu
 * for common text file types. Does NOT override the current default app.
 * Uses HKCU (no admin rights required).
 *
 * Works in both dev and packaged builds:
 * - Packaged: command = "app.exe" "%1"
 * - Dev:      command = "electron.exe" "main-script.js" "%1"
 */
export function registerFileAssociations(exePath: string, mainScriptPath?: string): void {
  if (process.platform !== 'win32') return

  const exeName = path.basename(exePath)

  // Build the open command: in dev mode include the main script path as argv[1]
  const openCommand = !app.isPackaged && mainScriptPath
    ? `"${exePath}" "${mainScriptPath}" "%1"`
    : `"${exePath}" "%1"`

  try {
    // Register the app definition
    reg(`HKCU\\Software\\Classes\\Applications\\${exeName}`, null, APP_NAME)
    reg(`HKCU\\Software\\Classes\\Applications\\${exeName}\\shell\\open\\command`, null, openCommand)

    // Register supported types (makes it show in "Open with" for these extensions)
    for (const ext of EXTENSIONS) {
      reg(`HKCU\\Software\\Classes\\Applications\\${exeName}\\SupportedTypes`, ext, '')
      reg(`HKCU\\Software\\Classes\\${ext}\\OpenWithList\\${exeName}`, null, '')
    }
  } catch {
    // Non-fatal — registry write failure should not crash the app
  }
}

/**
 * Writes a registry value using execFileSync with array arguments
 * to avoid shell injection via string interpolation.
 * @param keyPath  Registry key path
 * @param valueName  Named value (null = default/ve)
 * @param data  Value data
 */
function reg(keyPath: string, valueName: string | null, data: string): void {
  const args = ['add', keyPath, '/t', 'REG_SZ', '/f']
  if (valueName === null) {
    args.push('/ve')
  } else {
    args.push('/v', valueName)
  }
  args.push('/d', data)
  execFileSync('reg', args, { stdio: 'ignore' })
}

/**
 * Extracts a file path from argv (skips electron/node internals and flags).
 */
export function getFileArgFromArgv(argv: string[]): string | null {
  // In packaged builds argv[0] is the app exe, argv[1] is the file.
  // In dev mode argv[0] is electron, argv[1] is the compiled main script (.js).
  // We only want args that match one of our registered extensions.
  const candidates = argv.slice(1).filter(
    (a) => !a.startsWith('-') && !a.startsWith('--') &&
           EXTENSIONS.some((ext) => a.toLowerCase().endsWith(ext))
  )
  return candidates[0] ?? null
}
