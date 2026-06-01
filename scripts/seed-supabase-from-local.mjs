#!/usr/bin/env node
/**
 * Sube datos locales a Supabase vía API (recomendado vs SQL manual).
 * Lee .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) y JSON de userData.
 *
 * Uso:
 *   node scripts/seed-supabase-from-local.mjs
 *   node scripts/seed-supabase-from-local.mjs --user-data "/path/to/mytools-app"
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(import.meta.dirname, '..')

function loadEnv() {
  const path = join(ROOT, '.env')
  if (!existsSync(path)) throw new Error('Falta .env en la raíz del repo')
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  const url =
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    ''
  if (!url) {
    throw new Error('Falta SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) en .env')
  }
  if (!key) {
    const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
    if (pub) {
      throw new Error(
        'Tenés la clave publishable/anon en .env, pero el seed necesita SUPABASE_SERVICE_ROLE_KEY (Settings → API → service_role en Supabase)',
      )
    }
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env')
  }
  const normalizedUrl = url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  if (normalizedUrl !== url) {
    console.warn('SUPABASE_URL: se quitó /rest/v1 — usá https://xxx.supabase.co (sin /rest/v1)')
  }
  return { url: normalizedUrl, key }
}

function defaultUserData() {
  const darwin = join(homedir(), 'Library', 'Application Support', 'mytools-app')
  const win = join(process.env.APPDATA || '', 'mytools-app')
  const linux = join(homedir(), '.config', 'mytools-app')
  if (process.platform === 'win32') return win
  if (process.platform === 'linux') return linux
  return darwin
}

function readJson(dir, name) {
  const p = join(dir, name)
  if (!existsSync(p)) return []
  return JSON.parse(readFileSync(p, 'utf8'))
}

async function upsert(sb, table, rows, label) {
  if (!rows.length) {
    console.log(`${label}: 0 (skip)`)
    return
  }
  const chunk = 100
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk)
    const { error } = await sb.from(table).upsert(batch)
    if (error) throw new Error(`${label}: ${error.message}`)
  }
  console.log(`${label}: ${rows.length} OK`)
}

async function main() {
  const i = process.argv.indexOf('--user-data')
  const userData = i >= 0 ? process.argv[i + 1] : defaultUserData()
  const { url, key } = loadEnv()

  console.log('userData:', userData)
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const servicios = readJson(userData, 'gastos-servicios.json')
  const pagos = readJson(userData, 'gastos-pagos.json')
  const creds = readJson(userData, 'gastos-credenciales.json')
  const queries = readJson(userData, 'queries.json')

  await upsert(
    sb,
    'servicios',
    servicios.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      emoji: s.emoji,
      numero_cuenta: s.numeroCuenta || null,
      categoria: s.categoria,
      activo: s.activo,
      orden: s.orden,
    })),
    'servicios',
  )

  await upsert(
    sb,
    'pagos',
    pagos.map((p) => ({
      id: p.id,
      servicio_id: p.servicioId,
      mes: p.mes,
      monto: p.monto,
      fecha: p.fecha ?? null,
      metodo_pago: p.metodoPago ?? null,
      pagado: p.pagado,
      notas: p.notas ?? null,
    })),
    'pagos',
  )

  // password_enc vacío en seed CLI (cifrado requiere Electron safeStorage); cargar claves guardando en la app
  await upsert(
    sb,
    'credenciales',
    creds.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      usuario: c.usuario,
      password_enc: '',
      url: c.url ?? null,
      notas: c.notas ?? null,
      categoria: c.categoria ?? null,
      orden: c.orden,
    })),
    'credenciales',
  )

  await upsert(
    sb,
    'queries',
    queries.map((q) => ({
      id: q.id,
      motor: q.motor,
      descripcion: q.descripcion,
      query: q.query,
      tags: q.tags ?? [],
      orden: q.orden,
    })),
    'queries',
  )

  console.log('Listo. Activá backend Supabase en Conexiones y reiniciá la app.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
