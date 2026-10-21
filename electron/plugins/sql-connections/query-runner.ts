import { spawn, type ChildProcess } from 'child_process'
import type { SqlBatch } from '../../../src/plugins/sql-runner/sql-text'
import type { QueryResult } from '../../../src/plugins/sql-runner/types'

/**
 * Ejecuta consultas con System.Data.SqlClient (.NET Framework, viene con Windows) vía
 * PowerShell: instancias con nombre, Windows auth, varios lotes (GO), varios
 * resultados por lote y mensajes PRINT.
 *
 * Rápido: el trabajo pesado (leer filas y armar el JSON) lo hace C# compilado una vez
 * por proceso (Add-Type), y los procesos de PowerShell quedan ENCENDIDOS (pool de "workers") y reciben
 * un pedido por línea (JSON por stdin, nunca en la línea de comandos). Así no se paga
 * el arranque de PowerShell (~1 s) en cada consulta y SqlClient reutiliza las
 * conexiones abiertas (connection pooling), que es lo que más tarda contra un servidor
 * remoto. Cancelar = matar ese worker (se crea otro cuando haga falta).
 *
 * Modo lectura: todo corre dentro de una transacción que se deshace al final.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Data, System.Web.Extensions, System.Xml -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Web.Script.Serialization;

public static class SettoSql {
  static void Str(StringBuilder sb, string s) {
    if (s == null) { sb.Append("null"); return; }
    sb.Append('"');
    foreach (char ch in s) {
      switch (ch) {
        case '"': sb.Append("\\\""); break;
        case '\\': sb.Append("\\\\"); break;
        case '\n': sb.Append("\\n"); break;
        case '\r': sb.Append("\\r"); break;
        case '\t': sb.Append("\\t"); break;
        default:
          if (ch < 0x20 || ch == '\u2028' || ch == '\u2029') sb.Append("\\u").Append(((int)ch).ToString("x4"));
          else sb.Append(ch);
          break;
      }
    }
    sb.Append('"');
  }

  static string Cell(SqlDataReader r, int i) {
    if (r.IsDBNull(i)) return null;
    object v = r.GetValue(i);
    if (v is DateTime) return ((DateTime)v).ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);
    if (v is DateTimeOffset) return ((DateTimeOffset)v).ToString("yyyy-MM-dd HH:mm:ss.fff zzz", CultureInfo.InvariantCulture);
    byte[] b = v as byte[];
    if (b != null) { int n = Math.Min(b.Length, 64); return "0x" + BitConverter.ToString(b, 0, n).Replace("-", "") + (b.Length > 64 ? "\u2026" : ""); }
    if (v is bool) return ((bool)v) ? "1" : "0";
    IFormattable f = v as IFormattable;
    if (f != null) return f.ToString(null, CultureInfo.InvariantCulture);
    return Convert.ToString(v, CultureInfo.InvariantCulture);
  }

  public static string Run(string json) {
    var js = new JavaScriptSerializer();
    js.MaxJsonLength = int.MaxValue;
    var req = (Dictionary<string, object>)js.DeserializeObject(json);
    string id = Convert.ToString(req["id"], CultureInfo.InvariantCulture);
    string cs = (string)req["cs"];
    bool readOnly = (bool)req["readOnly"];
    int maxRows = Convert.ToInt32(req["maxRows"]);
    int timeout = Convert.ToInt32(req["timeoutSec"]);
    object[] batches = (object[])req["batches"];
    var sw = Stopwatch.StartNew();
    var msgs = new List<string>();
    var sets = new StringBuilder();
    int setCount = 0, bi = 0;
    bool opened = false;
    using (var c = new SqlConnection(cs)) {
      c.InfoMessage += (s, e) => { foreach (SqlError er in e.Errors) msgs.Add(er.Message); };
      try {
        c.Open();
        opened = true;
        SqlTransaction tx = readOnly ? c.BeginTransaction() : null;
        foreach (object bo in batches) {
          var b = (Dictionary<string, object>)bo;
          string sql = (string)b["sql"];
          int rep = Convert.ToInt32(b["repeat"]);
          for (int k = 0; k < rep; k++) {
            using (var cmd = c.CreateCommand()) {
              cmd.CommandText = sql;
              cmd.CommandTimeout = timeout;
              if (tx != null) cmd.Transaction = tx;
              using (var r = cmd.ExecuteReader()) {
                do {
                  if (r.FieldCount > 0) {
                    // Cada resultado se arma aparte: si falla a mitad, no queda JSON roto.
                    var one = new StringBuilder();
                    one.Append("{\"columns\":[");
                    for (int i = 0; i < r.FieldCount; i++) { if (i > 0) one.Append(','); Str(one, r.GetName(i)); }
                    one.Append("],\"types\":[");
                    for (int i = 0; i < r.FieldCount; i++) { if (i > 0) one.Append(','); Str(one, r.GetDataTypeName(i)); }
                    one.Append("],\"rows\":[");
                    int total = 0, written = 0;
                    while (r.Read()) {
                      total++;
                      if (written < maxRows) {
                        if (written > 0) one.Append(',');
                        one.Append('[');
                        for (int i = 0; i < r.FieldCount; i++) { if (i > 0) one.Append(','); Str(one, Cell(r, i)); }
                        one.Append(']');
                        written++;
                      }
                    }
                    one.Append("],\"total\":").Append(total).Append(",\"batch\":").Append(bi).Append('}');
                    if (setCount++ > 0) sets.Append(',');
                    sets.Append(one.ToString());
                  }
                } while (r.NextResult());
                r.Close();
                if (r.RecordsAffected >= 0) msgs.Add("(" + r.RecordsAffected + " filas afectadas)");
              }
            }
          }
          bi++;
        }
        if (tx != null) { tx.Rollback(); msgs.Add("Modo lectura: los cambios se deshicieron (rollback)."); }
        return Result(id, true, null, null, null, null, bi, sets, msgs, sw);
      } catch (Exception ex0) {
        Exception ex = ex0.GetBaseException();
        int? line = null, num = null;
        SqlException se = (ex as SqlException) ?? (ex0 as SqlException);
        if (se != null) { line = se.LineNumber; num = se.Number; }
        return Result(id, false, ex.Message, line, num, opened ? "run" : "connect", bi, sets, msgs, sw);
      }
    }
  }

  static string Result(string id, bool ok, string error, int? line, int? number, string phase, int batch, StringBuilder sets, List<string> msgs, Stopwatch sw) {
    var sb = new StringBuilder();
    sb.Append("{\"id\":").Append(id).Append(",\"ok\":").Append(ok ? "true" : "false");
    if (error != null) { sb.Append(",\"error\":"); Str(sb, error); }
    if (line.HasValue) sb.Append(",\"line\":").Append(line.Value);
    if (number.HasValue) sb.Append(",\"number\":").Append(number.Value);
    if (phase != null) sb.Append(",\"phase\":\"").Append(phase).Append("\",\"batch\":").Append(batch);
    sb.Append(",\"sets\":[").Append(sets.ToString()).Append("],\"messages\":[");
    for (int i = 0; i < msgs.Count; i++) { if (i > 0) sb.Append(','); Str(sb, msgs[i]); }
    sb.Append("],\"ms\":").Append(sw.ElapsedMilliseconds).Append('}');
    return sb.ToString();
  }
}
'@
# Un pedido por línea; una respuesta por línea.
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  try { $o = [SettoSql]::Run($line) }
  catch { $o = '{"ok":false,"error":' + (ConvertTo-Json ([string]$_.Exception.Message)) + ',"sets":[],"messages":[],"ms":0}' }
  [Console]::Out.WriteLine($o)
  [Console]::Out.Flush()
}
`

const ENCODED = Buffer.from(SCRIPT, 'utf16le').toString('base64')
/** Workers libres que se mantienen encendidos esperando la próxima consulta. */
const MAX_IDLE = 2

export interface RunOptions { readOnly: boolean; maxRows: number; timeoutSec: number }

interface Pending { id: number; started: number; resolve: (r: QueryResult) => void; timer: ReturnType<typeof setTimeout> }
interface Worker { p: ChildProcess; busy: boolean; dead: boolean; buf: string; err: string; pending: Pending | null; killedOnPurpose: boolean }

const pool: Worker[] = []
let nextId = 1

function normalize(r: QueryResult): QueryResult {
  // ConvertTo-Json deja un solo elemento como objeto en vez de lista en algunos casos.
  r.sets = (Array.isArray(r.sets) ? r.sets : r.sets ? [r.sets] : []).map((s) => ({
    ...s,
    columns: Array.isArray(s.columns) ? s.columns : [s.columns as unknown as string],
    types: Array.isArray(s.types) ? s.types : s.types ? [s.types as unknown as string] : [],
    rows: (Array.isArray(s.rows) ? s.rows : []).map((row) => (Array.isArray(row) ? row : [row as unknown as string | null])),
  }))
  r.messages = Array.isArray(r.messages) ? r.messages : r.messages ? [r.messages as unknown as string] : []
  delete (r as QueryResult & { id?: unknown }).id
  return r
}

function settle(w: Worker, r: QueryResult): void {
  const p = w.pending
  if (!p) return
  clearTimeout(p.timer)
  w.pending = null
  w.busy = false
  p.resolve(r)
  trimIdle()
}

function spawnWorker(): Worker {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ENCODED], { windowsHide: true })
  const w: Worker = { p, busy: false, dead: false, buf: '', err: '', pending: null, killedOnPurpose: false }
  p.stdout?.setEncoding('utf8')
  p.stdout?.on('data', (d: string) => {
    w.buf += d
    let i: number
    while ((i = w.buf.indexOf('\n')) >= 0) {
      const line = w.buf.slice(0, i).trim()
      w.buf = w.buf.slice(i + 1)
      if (!line || !w.pending) continue
      try {
        settle(w, normalize(JSON.parse(line) as QueryResult))
      } catch {
        settle(w, { ok: false, error: 'Respuesta inválida del ejecutor de consultas', sets: [], messages: [], ms: Date.now() - w.pending.started })
      }
    }
  })
  p.stderr?.on('data', (d: Buffer) => { w.err = (w.err + d.toString()).slice(-2000) })
  const onGone = (signal?: NodeJS.Signals | null): void => {
    if (w.dead) return
    if (signal) w.killedOnPurpose = true
    w.dead = true
    const i = pool.indexOf(w)
    if (i >= 0) pool.splice(i, 1)
    if (w.pending) {
      const ms = Date.now() - w.pending.started
      settle(w, w.killedOnPurpose
        ? { ok: false, error: 'Consulta cancelada', cancelled: true, sets: [], messages: [], ms }
        : { ok: false, error: (w.err.trim() || 'El ejecutor de consultas se cerró').slice(0, 500), sets: [], messages: [], ms })
    }
  }
  p.on('exit', (_code, signal) => onGone(signal))
  p.on('error', (e) => { w.err = `No se pudo ejecutar PowerShell: ${e.message}`; onGone() })
  pool.push(w)
  return w
}

function trimIdle(): void {
  const idle = pool.filter((w) => !w.busy && !w.dead)
  for (const w of idle.slice(MAX_IDLE)) killWorker(w)
}

function killWorker(w: Worker): void {
  w.killedOnPurpose = true
  try { w.p.kill() } catch { /* ya terminó */ }
}

/** Deja un worker listo (se llama al abrir Consultas o Conexiones) para que la primera consulta no espere. */
export function warmUp(): void {
  if (process.platform !== 'win32') return
  if (!pool.some((w) => !w.busy && !w.dead)) spawnWorker()
}

/** Cierra todos los workers (al salir de la app). */
export function shutdownWorkers(): void {
  for (const w of [...pool]) killWorker(w)
}

/** Corre la consulta; `onStart` recibe el proceso para poder cancelarlo (matándolo). */
export function runQuery(cs: string, batches: SqlBatch[], opts: RunOptions, onStart?: (p: ChildProcess) => void): Promise<QueryResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    if (process.platform !== 'win32') { resolve({ ok: false, error: 'Las consultas sólo están disponibles en Windows', sets: [], messages: [], ms: 0 }); return }
    const w = pool.find((x) => !x.busy && !x.dead) ?? spawnWorker()
    w.busy = true
    const id = nextId++
    // Red de seguridad: si el worker se cuelga, se lo mata (y se crea otro para lo próximo).
    const timer = setTimeout(() => { w.err = 'La consulta no respondió a tiempo'; w.killedOnPurpose = false; try { w.p.kill() } catch { /* nada */ } }, (opts.timeoutSec + 30) * 1000)
    w.pending = {
      id, started, timer,
      resolve: (r) => {
        if (!r.ok && !r.ms) r.ms = Date.now() - started
        resolve(r)
        // Siempre queda uno listo para la próxima.
        setTimeout(warmUp, 0)
      },
    }
    onStart?.(w.p)
    w.p.stdin?.write(JSON.stringify({ id, cs, batches, readOnly: opts.readOnly, maxRows: opts.maxRows, timeoutSec: opts.timeoutSec }) + '\n')
  })
}
