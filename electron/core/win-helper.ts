import { app } from 'electron'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { logger } from './logger'

/**
 * Cosas de Windows que Electron no trae, en procesos hijos que hablan JSON por líneas:
 * - `fg`: app, título y si está en pantalla completa la ventana en primer plano
 *   (origen de capturas/copias y la barra flotante). Lo atiende un .exe chiquito
 *   compilado al vuelo (FG_HELPER_SOURCE); PowerShell queda de respaldo.
 * - `ocr`: texto de una imagen con Windows.Media.Ocr, en PowerShell (WinRT).
 *
 * Arrancar PowerShell cuesta ~2-4 s y ~80 MB de RAM: se arranca a pedido y se
 * cierra solo tras 90 s sin uso. En otros sistemas todo devuelve null.
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

/**
 * Ayudante liviano sólo para `fg` (la barra lo consulta cada 2 s): un .exe de
 * consola chiquito compilado con el csc.exe de .NET Framework que trae Windows.
 * PowerShell ocupa ~80 MB de RAM; esto ~10 MB. Si no se puede compilar (sin
 * .NET 4, antivirus), `fg` vuelve a usar PowerShell.
 */
export const FG_HELPER_SOURCE = String.raw`
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Text;
using System.Text.RegularExpressions; using System.Windows.Forms;
static class SettoFgHelper {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (char c in s) {
      if (c == '"' || c == '\\') { b.Append('\\'); b.Append(c); }
      else if (c < ' ') b.AppendFormat("\\u{0:x4}", (int)c);
      else b.Append(c);
    }
    return b.ToString();
  }
  static string Fg() {
    IntPtr h = GetForegroundWindow();
    var sb = new StringBuilder(512);
    GetWindowText(h, sb, 512);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string name = "";
    try { name = Process.GetProcessById((int)pid).ProcessName; } catch { }
    bool full = false;
    RECT r;
    if (h != IntPtr.Zero && h != GetShellWindow() && h != GetDesktopWindow() && GetWindowRect(h, out r)) {
      var b = Screen.FromHandle(h).Bounds;
      full = r.Left <= b.Left && r.Top <= b.Top && r.Right >= b.Right && r.Bottom >= b.Bottom;
    }
    return "{\"app\":\"" + Esc(name) + "\",\"title\":\"" + Esc(sb.ToString()) + "\",\"full\":" + (full ? "true" : "false") + "}";
  }
  static void Main() {
    Console.OutputEncoding = new UTF8Encoding(false);
    Console.InputEncoding = new UTF8Encoding(false);
    Console.Out.WriteLine("{\"ready\":true}"); Console.Out.Flush();
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      var m = Regex.Match(line, "\"id\"\\s*:\\s*(\\d+)");
      string id = m.Success ? m.Groups[1].Value : "0";
      try {
        if (!line.Contains("\"fg\"")) throw new Exception("cmd?");
        Console.Out.WriteLine("{\"id\":" + id + ",\"ok\":true,\"result\":" + Fg() + "}");
      } catch (Exception e) {
        Console.Out.WriteLine("{\"id\":" + id + ",\"ok\":false,\"error\":\"" + Esc(e.Message) + "\"}");
      }
      Console.Out.Flush();
    }
  }
}
`

interface Pending { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

/**
 * Proceso hijo que habla JSON por líneas: `{"ready":true}` al arrancar y una
 * respuesta `{id, ok, result|error}` por pedido. Se arranca a pedido, se vuelve
 * a arrancar si muere y (si tiene `idleMs`) se cierra solo tras un rato sin uso.
 */
class LineWorker {
  private proc: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private buffer = ''
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly name: string,
    private readonly launch: () => Promise<ChildProcessWithoutNullStreams>,
    private readonly idleMs = 0,
  ) {}

  start(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      this.launch().then((p) => {
        this.proc = p
        let started = false
        const failStart = setTimeout(() => { if (!started) { reject(new Error(`${this.name} no arrancó`)); p.kill() } }, 20_000)
        p.stdout.setEncoding('utf8')
        p.stdout.on('data', (chunk: string) => {
          this.buffer += chunk
          let nl: number
          while ((nl = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, nl).trim()
            this.buffer = this.buffer.slice(nl + 1)
            if (!line) continue
            let msg: { ready?: boolean; id?: number; ok?: boolean; result?: unknown; error?: string }
            try { msg = JSON.parse(line) } catch { continue }
            if (msg.ready) { started = true; clearTimeout(failStart); resolve(); continue }
            const w = msg.id !== undefined ? this.pending.get(msg.id) : undefined
            if (!w) continue
            this.pending.delete(msg.id!)
            clearTimeout(w.timer)
            if (msg.ok) w.resolve(msg.result)
            else w.reject(new Error(msg.error ?? 'error'))
          }
        })
        p.stderr.on('data', (d: Buffer) => logger.warn(this.name, d.toString().slice(0, 500)))
        p.on('error', (err) => logger.warn(this.name, err.message))
        p.on('exit', (code) => {
          logger.info(this.name, `terminó (${code})`)
          if (this.proc === p) { this.proc = null; this.ready = null; this.buffer = '' }
          for (const [, w] of this.pending) { clearTimeout(w.timer); w.reject(new Error(`${this.name} terminó`)) }
          this.pending.clear()
          if (!started) { clearTimeout(failStart); reject(new Error(`${this.name} no arrancó`)) }
        })
      }).catch((err: unknown) => { this.ready = null; reject(err instanceof Error ? err : new Error(String(err))) })
    })
    return this.ready
  }

  async call<T>(cmd: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
    await this.start()
    const p = this.proc
    if (!p) throw new Error(`${this.name} no está corriendo`)
    this.touch()
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.name}: ${cmd} tardó demasiado`)) }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      p.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n')
    })
  }

  /** Reinicia la cuenta regresiva de inactividad (no corta un pedido en curso). */
  private touch(): void {
    if (!this.idleMs) return
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.pending.size) { this.touch(); return }
      logger.info(this.name, 'sin uso: se cierra para liberar memoria')
      this.stop()
    }, this.idleMs)
  }

  stop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    this.proc?.kill()
    this.proc = null
    this.ready = null
  }
}

const spawnPowerShell = async (): Promise<ChildProcessWithoutNullStreams> => {
  const scriptPath = path.join(app.getPath('userData'), 'setto-win-helper.ps1')
  fs.writeFileSync(scriptPath, '\uFEFF' + WIN_HELPER_SCRIPT, 'utf-8')   // BOM: PowerShell 5.1 lee el script como UTF-8
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true })
}

/** Compila (una vez por versión del código) el ayudante de `fg`. */
async function compileFgHelper(): Promise<string> {
  const hash = createHash('sha1').update(FG_HELPER_SOURCE).digest('hex').slice(0, 10)
  const dir = app.getPath('userData')
  const exe = path.join(dir, `setto-fg-${hash}.exe`)
  if (fs.existsSync(exe)) return exe
  const csc = path.join(process.env['WINDIR'] ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  if (!fs.existsSync(csc)) throw new Error('csc.exe no disponible')
  const src = path.join(dir, `setto-fg-${hash}.cs`)
  fs.writeFileSync(src, FG_HELPER_SOURCE, 'utf-8')
  await new Promise<void>((resolve, reject) => {
    execFile(csc, ['/nologo', '/optimize+', '/target:exe', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', `/out:${exe}`, src],
      { windowsHide: true, timeout: 60_000 },
      (err, stdout) => (err ? reject(new Error(`csc: ${String(stdout).slice(0, 300) || err.message}`)) : resolve()))
  })
  try { fs.unlinkSync(src) } catch { /* nada */ }
  // Borrar versiones viejas del ayudante.
  for (const f of fs.readdirSync(dir)) {
    if (/^setto-fg-[0-9a-f]+\.(exe|cs)$/.test(f) && !f.startsWith(`setto-fg-${hash}`)) { try { fs.unlinkSync(path.join(dir, f)) } catch { /* en uso */ } }
  }
  return exe
}

/** PowerShell: OCR (y `fg` si no hay ayudante compilado). Se cierra solo tras 90 s sin uso. */
const psWorker = new LineWorker('win-helper', spawnPowerShell, 90_000)
let fgFallback = false
const fgWorker = new LineWorker('fg-helper', async () => {
  const exe = await compileFgHelper()
  return spawn(exe, [], { windowsHide: true })
})

/** Ventana en primer plano: `{ app: 'WigosGUI', title: 'Error', full: false }` (full = pantalla completa). */
export async function foregroundWindow(): Promise<{ app: string; title: string; full?: boolean } | null> {
  if (process.platform !== 'win32') return null
  type Fg = { app: string; title: string; full?: boolean }
  if (!fgFallback) {
    try { return await fgWorker.call<Fg>('fg', {}, 5000) } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Si no arranca (no compiló, lo bloquearon): PowerShell de ahí en más.
      if (/csc|no arrancó|ENOENT|EACCES|EPERM/i.test(msg)) {
        fgFallback = true
        logger.warn('fg-helper', `no disponible, se usa PowerShell: ${msg}`)
      } else throw err
    }
  }
  return psWorker.call<Fg>('fg', {}, 5000)
}

export async function ocrImage(filePath: string): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const r = await psWorker.call<string | null>('ocr', { path: filePath }, 60_000)
  return typeof r === 'string' ? r : r === null ? null : ''
}

/** Arranca el ayudante de `fg` de antemano (para que la primera captura ya tenga origen). */
export function warmWinHelper(): void {
  if (process.platform === 'win32') fgWorker.start().catch((err) => logger.warn('fg-helper', String(err)))
}

export function stopWinHelper(): void {
  fgWorker.stop()
  psWorker.stop()
}
