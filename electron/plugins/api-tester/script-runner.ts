import { Worker } from 'worker_threads'

/**
 * Scripts de API Lab (pre-request / tests), aislados en dos capas:
 *
 * 1. Un `worker_threads.Worker` propio por ejecución, con límites de memoria
 *    (`resourceLimits`), `process.env` vacío y un corte duro: si no contesta a
 *    los 2 s se termina el hilo (cubre lo que el timeout de `vm` no corta, como
 *    un getter que cuelga al leer el error). Main nunca queda bloqueado.
 * 2. Dentro del worker, un contexto `vm` sin eval/new Function ni WebAssembly
 *    (`codeGeneration: { strings: false, wasm: false }`). Al contexto no entra
 *    ningún objeto del host: los datos viajan como texto JSON y `pm` / `console`
 *    se construyen adentro con los built-ins del propio contexto.
 *
 * Entre main y el worker sólo pasan datos planos (texto/JSON por `postMessage`).
 * API del script: `pm.environment.get/set/unset`, `pm.response.{status,body,headers,json()}`,
 * `console.log`.
 */
export interface ScriptResponse { status: number; body: string; headers: Record<string, string> }
export interface ScriptResult { envVars: Record<string, string>; logs: string[]; error?: string }

const PRELUDE = `(() => {
  'use strict'
  const input = JSON.parse(globalThis.__input)
  delete globalThis.__input
  const vars = input.vars
  const logs = []
  const res = input.response
  const has = (k) => Object.prototype.hasOwnProperty.call(vars, k)
  Object.defineProperty(globalThis, '__result', { value: () => JSON.stringify({ vars, logs }) })
  globalThis.pm = Object.freeze({
    environment: Object.freeze({
      get: (k) => (has(String(k)) ? vars[String(k)] : null),
      set: (k, v) => { vars[String(k)] = String(v) },
      unset: (k) => { delete vars[String(k)] },
    }),
    response: res ? Object.freeze({
      status: res.status,
      body: res.body,
      headers: Object.freeze(res.headers),
      json: () => { try { return JSON.parse(res.body) } catch { return null } },
    }) : null,
  })
  globalThis.console = Object.freeze({ log: (...a) => { logs.push(a.map((x) => String(x)).join(' ')) } })
})()`

/** Código del worker (CommonJS, `eval: true`). Recibe y devuelve sólo strings. */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads')
const vm = require('vm')
try { delete globalThis.require } catch {}
const { script, input, prelude, timeoutMs } = workerData
const sandbox = Object.create(null)
sandbox.__input = input
const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' })
vm.runInContext(prelude, ctx, { timeout: 500 })
let error = null
try {
  vm.runInContext(script, ctx, { timeout: timeoutMs, filename: 'script' })
} catch (err) {
  try { error = err && typeof err.message === 'string' ? err.message : String(err) } catch { error = 'Error en el script' }
}
let raw = null
try { raw = vm.runInContext('__result()', ctx, { timeout: 500 }) } catch {}
parentPort.postMessage({ raw: typeof raw === 'string' ? raw : null, error: error === null ? null : String(error).slice(0, 2000) })
`

/** Margen para que el worker arranque antes de empezar a contar el corte duro. */
const STARTUP_LIMIT_MS = 5000

function toStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = Object.create(null) as Record<string, string>
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return { ...out }
}

function parseWorkerReply(msg: unknown, fallbackVars: Record<string, string>): ScriptResult {
  const m = (msg && typeof msg === 'object' ? msg : {}) as { raw?: unknown; error?: unknown }
  let vars = fallbackVars
  let logs: string[] = []
  if (typeof m.raw === 'string') {
    try {
      const parsed = JSON.parse(m.raw) as { vars?: unknown; logs?: unknown }
      vars = toStringRecord(parsed.vars)
      logs = Array.isArray(parsed.logs) ? parsed.logs.filter((l): l is string => typeof l === 'string').slice(0, 1000) : []
    } catch { /* respuesta rota: quedan las variables de entrada */ }
  }
  return typeof m.error === 'string' ? { envVars: vars, logs, error: m.error } : { envVars: vars, logs }
}

export function runUserScript(script: string, envVars: Record<string, string>, response?: ScriptResponse, timeoutMs = 2000): Promise<ScriptResult> {
  const vars = toStringRecord(envVars)
  if (!script || typeof script !== 'string') return Promise.resolve({ envVars: vars, logs: [] })

  const resp = response && typeof response === 'object'
    ? { status: Number(response.status) || 0, body: String(response.body ?? ''), headers: toStringRecord(response.headers) }
    : null

  return new Promise<ScriptResult>((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { script, input: JSON.stringify({ vars, response: resp }), prelude: PRELUDE, timeoutMs },
        env: {},
        argv: [],
        execArgv: [],
        stdout: true,
        stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, codeRangeSizeMb: 16, stackSizeMb: 4 },
      })
    } catch (err) {
      resolve({ envVars: vars, logs: [], error: `No se pudo iniciar el script: ${err instanceof Error ? err.message : String(err)}` })
      return
    }
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (r: ScriptResult): void => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      void worker.terminate().catch(() => undefined)
      resolve(r)
    }
    const hardKill = (): void => finish({ envVars: vars, logs: [], error: `Script execution timed out after ${timeoutMs}ms` })
    timer = setTimeout(hardKill, STARTUP_LIMIT_MS + timeoutMs)
    worker.once('online', () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(hardKill, timeoutMs + 100)
    })
    worker.once('message', (msg: unknown) => finish(parseWorkerReply(msg, vars)))
    worker.once('error', (err: Error & { code?: string }) => finish({
      envVars: vars,
      logs: [],
      error: err?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'El script superó el límite de memoria' : (err?.message ?? 'Error en el script'),
    }))
    worker.once('exit', (code) => finish({ envVars: vars, logs: [], error: `El script terminó inesperadamente (código ${code})` }))
  })
}
