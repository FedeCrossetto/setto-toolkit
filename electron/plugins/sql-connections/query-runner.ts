import { spawn, type ChildProcess } from 'child_process'
import type { SqlBatch } from '../../../src/plugins/sql-runner/sql-text'
import type { QueryResult } from '../../../src/plugins/sql-runner/types'

/**
 * Ejecuta una consulta con System.Data.SqlClient (.NET Framework, viene con Windows)
 * vía PowerShell: soporta instancias con nombre, Windows auth, varios lotes (GO),
 * varios resultados por lote y los mensajes PRINT. La cadena de conexión y el SQL
 * viajan por stdin (nunca en la línea de comandos).
 *
 * Modo lectura: todo corre dentro de una transacción que se deshace al final, así
 * un UPDATE/DELETE por error no cambia nada.
 */
const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$in = [Console]::In.ReadToEnd() | ConvertFrom-Json
$sw = [Diagnostics.Stopwatch]::StartNew()
$msgs = New-Object System.Collections.ArrayList
$sets = New-Object System.Collections.ArrayList
$bi = 0
$opened = $false
$c = New-Object System.Data.SqlClient.SqlConnection $in.cs
$c.add_InfoMessage({ param($s, $e) foreach ($er in $e.Errors) { [void]$msgs.Add([string]$er.Message) } })
function Cell($r, $i) {
  if ($r.IsDBNull($i)) { return $null }
  $v = $r.GetValue($i)
  if ($v -is [DateTime]) { return $v.ToString('yyyy-MM-dd HH:mm:ss.fff') }
  if ($v -is [byte[]]) { $n = [Math]::Min($v.Length, 64); return '0x' + [BitConverter]::ToString($v, 0, $n).Replace('-', '') + $(if ($v.Length -gt 64) { '…' } else { '' }) }
  if ($v -is [bool]) { return $(if ($v) { '1' } else { '0' }) }
  if ($v -is [decimal] -or $v -is [double] -or $v -is [single]) { return $v.ToString([Globalization.CultureInfo]::InvariantCulture) }
  return [string]$v
}
try {
  $c.Open()
  $opened = $true
  $tx = $null
  if ($in.readOnly) { $tx = $c.BeginTransaction() }
  foreach ($b in $in.batches) {
    for ($rep = 0; $rep -lt $b.repeat; $rep++) {
      $cmd = $c.CreateCommand()
      $cmd.CommandText = $b.sql
      $cmd.CommandTimeout = $in.timeoutSec
      if ($tx) { $cmd.Transaction = $tx }
      $r = $cmd.ExecuteReader()
      do {
        if ($r.FieldCount -gt 0) {
          $cols = New-Object System.Collections.ArrayList
          $types = New-Object System.Collections.ArrayList
          for ($i = 0; $i -lt $r.FieldCount; $i++) { [void]$cols.Add($r.GetName($i)); [void]$types.Add($r.GetDataTypeName($i)) }
          $rows = New-Object System.Collections.ArrayList
          $total = 0
          while ($r.Read()) {
            $total++
            if ($rows.Count -lt $in.maxRows) {
              $row = New-Object System.Collections.ArrayList
              for ($i = 0; $i -lt $r.FieldCount; $i++) { [void]$row.Add((Cell $r $i)) }
              [void]$rows.Add($row)
            }
          }
          [void]$sets.Add(@{ columns = $cols; types = $types; rows = $rows; total = $total; batch = $bi })
        }
      } while ($r.NextResult())
      $r.Close()
      $affected = $r.RecordsAffected
      if ($affected -ge 0) { [void]$msgs.Add("($affected filas afectadas)") }
    }
    $bi++
  }
  if ($tx) { $tx.Rollback(); [void]$msgs.Add('Modo lectura: los cambios se deshicieron (rollback).') }
  $out = @{ ok = $true; sets = $sets; messages = $msgs; ms = $sw.ElapsedMilliseconds }
} catch {
  $ex = $_.Exception.GetBaseException()
  $line = $null; $num = $null
  if ($ex -is [System.Data.SqlClient.SqlException]) { $line = $ex.LineNumber; $num = $ex.Number }
  $out = @{ ok = $false; error = [string]$ex.Message; line = $line; number = $num; batch = $bi; phase = $(if ($opened) { 'run' } else { 'connect' }); sets = $sets; messages = $msgs; ms = $sw.ElapsedMilliseconds }
} finally {
  try { $c.Close() } catch {}
}
$out | ConvertTo-Json -Compress -Depth 8
`

const ENCODED = Buffer.from(SCRIPT, 'utf16le').toString('base64')

export interface RunOptions { readOnly: boolean; maxRows: number; timeoutSec: number }

/** Corre la consulta; `onStart` recibe el proceso para poder cancelarlo. */
export function runQuery(cs: string, batches: SqlBatch[], opts: RunOptions, onStart?: (p: ChildProcess) => void): Promise<QueryResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    if (process.platform !== 'win32') { resolve({ ok: false, error: 'Las consultas sólo están disponibles en Windows', sets: [], messages: [], ms: 0 }); return }
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ENCODED], { windowsHide: true })
    onStart?.(p)
    let out = ''
    let err = ''
    let killed = false
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (d: string) => { out += d })
    p.stderr.on('data', (d: Buffer) => { err += d.toString() })
    p.on('error', (e) => resolve({ ok: false, error: `No se pudo ejecutar PowerShell: ${e.message}`, sets: [], messages: [], ms: Date.now() - started }))
    p.on('exit', (_code, signal) => { if (signal) killed = true })
    p.on('close', () => {
      if (killed) { resolve({ ok: false, error: 'Consulta cancelada', cancelled: true, sets: [], messages: [], ms: Date.now() - started }); return }
      const line = out.trim().split(/\r?\n/).pop() ?? ''
      try {
        const r = JSON.parse(line) as QueryResult
        // ConvertTo-Json deja un solo elemento como objeto en vez de lista en algunos casos.
        r.sets = (Array.isArray(r.sets) ? r.sets : r.sets ? [r.sets] : []).map((s) => ({
          ...s,
          columns: Array.isArray(s.columns) ? s.columns : [s.columns as unknown as string],
          types: Array.isArray(s.types) ? s.types : s.types ? [s.types as unknown as string] : [],
          rows: (Array.isArray(s.rows) ? s.rows : []).map((row) => (Array.isArray(row) ? row : [row as unknown as string | null])),
        }))
        r.messages = Array.isArray(r.messages) ? r.messages : r.messages ? [r.messages as unknown as string] : []
        resolve(r)
      } catch {
        resolve({ ok: false, error: (err.trim() || 'La consulta no respondió').slice(0, 500), sets: [], messages: [], ms: Date.now() - started })
      }
    })
    p.stdin.end(JSON.stringify({ cs, batches, readOnly: opts.readOnly, maxRows: opts.maxRows, timeoutSec: opts.timeoutSec }))
  })
}
