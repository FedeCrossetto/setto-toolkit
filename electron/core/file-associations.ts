import { execFile } from 'child_process'
import { app } from 'electron'
import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { logger } from './logger'

const APP_NAME = 'SettoToolkit'
const MARKER_FILE = 'file-associations.json'

/** Extensions we accept from argv when launching / second-instance (“Open with” / double-click). Must include any ext users open from Explorer. */
const EXTENSIONS = [
  '.txt', '.cfg', '.log', '.csv',
  '.md', '.markdown',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json',
  '.css', '.scss', '.html', '.htm',
  '.py', '.java', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp',
  '.cs', '.go', '.rs',
  '.yaml', '.yml', '.xml', '.sql', '.ini', '.env',
  '.vb', '.config', '.csproj', '.vbproj', '.sln', '.props', '.targets', '.resx',
  '.ps1', '.psm1', '.bat', '.cmd', '.sh', '.out', '.trace',
]

/** Valor de cadena en un archivo .reg: se escapan barras y comillas. */
const regString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * Contenido del .reg que registra la app en "Abrir con" (HKCU, sin admin, no cambia
 * la app predeterminada). Puro: testeado en file-associations.test.ts.
 */
export function buildRegFile(exeName: string, openCommand: string, extensions: string[] = EXTENSIONS): string {
  const root = 'HKEY_CURRENT_USER\\Software\\Classes'
  const lines = [
    'Windows Registry Editor Version 5.00',
    '',
    `[${root}\\Applications\\${exeName}]`,
    `@=${regString(APP_NAME)}`,
    '',
    `[${root}\\Applications\\${exeName}\\shell\\open\\command]`,
    `@=${regString(openCommand)}`,
    '',
    `[${root}\\Applications\\${exeName}\\SupportedTypes]`,
    ...extensions.map((ext) => `${regString(ext)}=""`),
    '',
    ...extensions.flatMap((ext) => [`[${root}\\${ext}\\OpenWithList\\${exeName}]`, '@=""', '']),
  ]
  return lines.join('\r\n')
}

/**
 * Registers the app in Windows registry so it appears in the "Open with" menu
 * for common text file types. Does NOT override the current default app.
 *
 * Antes se hacía con ~100 `reg add` sincrónicos en cada arranque: trababa el
 * proceso principal ~15 s antes de crear la ventana. Ahora es un solo `reg import`
 * en segundo plano, y sólo si cambió algo (primera vez, otra ruta del .exe,
 * otra lista de extensiones).
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

  const content = buildRegFile(exeName, openCommand)
  const signature = createHash('sha1').update(content).digest('hex')
  const marker = path.join(app.getPath('userData'), MARKER_FILE)
  try {
    if ((JSON.parse(fs.readFileSync(marker, 'utf-8')) as { signature?: string }).signature === signature) return
  } catch { /* primera vez */ }

  const regPath = path.join(os.tmpdir(), `setto-assoc-${process.pid}.reg`)
  try {
    // "Version 5.00" exige UTF-16 LE con BOM.
    fs.writeFileSync(regPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, 'utf16le')]))
  } catch (err) {
    logger.warn('file-associations', 'no se pudo escribir el .reg', err instanceof Error ? err.message : String(err))
    return
  }
  execFile('reg', ['import', regPath], { windowsHide: true }, (err) => {
    try { fs.unlinkSync(regPath) } catch { /* nada */ }
    if (err) {
      // Non-fatal — registry write failure should not crash the app
      logger.warn('file-associations', 'reg import falló', err.message)
      return
    }
    try { fs.writeFileSync(marker, JSON.stringify({ signature, at: new Date().toISOString() })) } catch { /* se reintenta la próxima */ }
    logger.info('file-associations', 'registradas en "Abrir con"')
  })
}

/**
 * Extracts a file path from argv (skips electron/node internals and flags).
 */
export function getFileArgFromArgv(argv: string[]): string | null {
  // In packaged builds argv[0] is the app exe, argv[1] is the file.
  // In dev/E2E argv[0] is electron and argv[1] is the compiled main script (.js) —
  // skip it or the app would "open" its own entry point as a document.
  const candidates = argv.slice(app.isPackaged ? 1 : 2).filter(
    (a) => !a.startsWith('-') && !a.startsWith('--') &&
           EXTENSIONS.some((ext) => a.toLowerCase().endsWith(ext))
  )
  return candidates[0] ?? null
}
