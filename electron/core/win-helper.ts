import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

/**
 * Proceso PowerShell de larga vida para cosas de Windows que Electron no trae:
 * - `fg`: app y título de la ventana en primer plano (para saber de dónde salió una captura)
 * - `ocr`: texto de una imagen con Windows.Media.Ocr
 *
 * Arrancar PowerShell + compilar los tipos cuesta ~2-4 s; por eso se arranca una
 * vez (a pedido) y se le mandan pedidos por stdin (una línea JSON por pedido,
 * una línea JSON por respuesta). Si muere se vuelve a arrancar en el próximo pedido.
 * En otros sistemas todas las llamadas devuelven null.
 */

export const WIN_HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class SettoFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
}
"@
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()

function Do-Fg {
  $h = [SettoFg]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][SettoFg]::GetWindowText($h, $sb, 512)
  $procId = [uint32]0
  [void][SettoFg]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId).ProcessName } catch {}
  # Pantalla completa = la ventana cubre todo su monitor (juegos, videos, presentaciones).
  $full = $false
  if ($h -ne [IntPtr]::Zero -and $h -ne [SettoFg]::GetShellWindow() -and $h -ne [SettoFg]::GetDesktopWindow()) {
    $r = New-Object SettoFg+RECT
    if ([SettoFg]::GetWindowRect($h, [ref]$r)) {
      $b = [System.Windows.Forms.Screen]::FromHandle($h).Bounds
      $full = ($r.Left -le $b.Left -and $r.Top -le $b.Top -and $r.Right -ge $b.Right -and $r.Bottom -ge $b.Bottom)
    }
  }
  return @{ app = $name; title = $sb.ToString(); full = $full }
}
function Do-Ocr($p) {
  if ($null -eq $engine) { return '' }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return (($result.Lines | ForEach-Object { $_.Text }) -join "` + '`' + String.raw`n")
  } finally { $stream.Dispose() }
}

[Console]::Out.WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $req = $null
  try {
    $req = $line | ConvertFrom-Json
    $res = switch ($req.cmd) { 'fg' { Do-Fg } 'ocr' { Do-Ocr $req.path } default { throw "cmd?" } }
    [Console]::Out.WriteLine((@{ id = $req.id; ok = $true; result = $res } | ConvertTo-Json -Compress -Depth 4))
  } catch {
    $rid = if ($req) { $req.id } else { 0 }
    [Console]::Out.WriteLine((@{ id = $rid; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  }
}
`

interface Pending { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

let proc: ChildProcessWithoutNullStreams | null = null
let ready: Promise<void> | null = null
let nextId = 1
const pending = new Map<number, Pending>()
let buffer = ''

function start(): Promise<void> {
  if (ready) return ready
  ready = new Promise<void>((resolve, reject) => {
    const scriptPath = path.join(app.getPath('userData'), 'setto-win-helper.ps1')
    fs.writeFileSync(scriptPath, '﻿' + WIN_HELPER_SCRIPT, 'utf-8')   // BOM: PowerShell 5.1 lee el script como UTF-8
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true })
    proc = p
    let started = false
    const failStart = setTimeout(() => { if (!started) { reject(new Error('win-helper no arrancó')); p.kill() } }, 20_000)
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        let msg: { ready?: boolean; id?: number; ok?: boolean; result?: unknown; error?: string }
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.ready) { started = true; clearTimeout(failStart); resolve(); continue }
        const p2 = msg.id !== undefined ? pending.get(msg.id) : undefined
        if (!p2) continue
        pending.delete(msg.id!)
        clearTimeout(p2.timer)
        if (msg.ok) p2.resolve(msg.result)
        else p2.reject(new Error(msg.error ?? 'error'))
      }
    })
    p.stderr.on('data', (d: Buffer) => logger.warn('win-helper', d.toString().slice(0, 500)))
    p.on('exit', (code) => {
      logger.info('win-helper', `terminó (${code})`)
      proc = null
      ready = null
      buffer = ''
      for (const [, w] of pending) { clearTimeout(w.timer); w.reject(new Error('win-helper terminó')) }
      pending.clear()
      if (!started) { clearTimeout(failStart); reject(new Error('win-helper no arrancó')) }
    })
  })
  return ready
}

async function call<T>(cmd: 'fg' | 'ocr', args: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<T | null> {
  if (process.platform !== 'win32') return null
  await start()
  if (!proc) return null
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`win-helper: ${cmd} tardó demasiado`)) }, timeoutMs)
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    proc!.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n')
  })
}

/** Ventana en primer plano: `{ app: 'WigosGUI', title: 'Error', full: false }` (full = pantalla completa). */
export function foregroundWindow(): Promise<{ app: string; title: string; full?: boolean } | null> {
  return call<{ app: string; title: string; full?: boolean }>('fg', {}, 5000)
}

export async function ocrImage(filePath: string): Promise<string | null> {
  const r = await call<string>('ocr', { path: filePath }, 60_000)
  return typeof r === 'string' ? r : r === null ? null : ''
}

/** Arranca el proceso de antemano (para que la primera captura ya tenga origen). */
export function warmWinHelper(): void {
  if (process.platform === 'win32') start().catch((err) => logger.warn('win-helper', String(err)))
}

export function stopWinHelper(): void {
  proc?.kill()
  proc = null
  ready = null
}
