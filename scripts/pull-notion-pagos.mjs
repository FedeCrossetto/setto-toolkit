#!/usr/bin/env node
/**
 * Importa pagos desde Notion → JSON local (+ opcional Supabase).
 * Más rápido que "Sync Notion" en la app (no sube 300+ filas a Notion).
 *
 * Uso (desde la raíz del repo, en Terminal):
 *   node scripts/pull-notion-pagos.mjs
 *   node scripts/pull-notion-pagos.mjs --supabase
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(import.meta.dirname, '..')

function userDataDir() {
  if (process.platform === 'win32') return join(process.env.APPDATA || '', 'mytools-app')
  if (process.platform === 'linux') return join(homedir(), '.config', 'mytools-app')
  return join(homedir(), 'Library', 'Application Support', 'mytools-app')
}

function getTxt(page, key) {
  return page.properties?.[key]?.rich_text?.[0]?.text?.content ?? ''
}
function getSel(page, key) {
  return page.properties?.[key]?.select?.name ?? ''
}
function getNum(page, key) {
  return page.properties?.[key]?.number ?? 0
}
function getChk(page, key) {
  return page.properties?.[key]?.checkbox ?? false
}

function notionPageToPago(page) {
  return {
    id: getTxt(page, 'pagoId') || Math.random().toString(36).slice(2, 10),
    servicioId: getTxt(page, 'servicioId'),
    mes: getTxt(page, 'Mes'),
    monto: getNum(page, 'Monto'),
    fecha: getTxt(page, 'Fecha pago') || undefined,
    metodoPago: getSel(page, 'Método') || undefined,
    pagado: getChk(page, 'Pagado'),
    notas: getTxt(page, 'Notas') || undefined,
  }
}

async function notionFetch(token, path, method = 'GET', body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function queryAll(token, databaseId) {
  const results = []
  let cursor
  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const data = await notionFetch(token, `/databases/${databaseId}/query`, 'POST', body)
    results.push(...(data.results ?? []))
    cursor = data.has_more ? data.next_cursor : undefined
    process.stdout.write(`\rNotion: ${results.length} páginas…`)
  } while (cursor)
  console.log()
  return results
}

function loadEnv() {
  const env = {}
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  const url = (env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  return { url, key: env.SUPABASE_SERVICE_ROLE_KEY || '' }
}

async function main() {
  const ud = userDataDir()
  const notionPath = join(ud, 'gastos-notion.json')
  if (!existsSync(notionPath)) throw new Error(`No existe ${notionPath}`)
  const { token, databaseId } = JSON.parse(readFileSync(notionPath, 'utf8'))
  if (!token || !databaseId) throw new Error('Falta token o databaseId en gastos-notion.json')

  const pages = await queryAll(token, databaseId)
  const pagos = []
  let skipped = 0
  for (const page of pages) {
    if (page.archived) continue
    const p = notionPageToPago(page)
    if (!p.servicioId || !p.mes) { skipped++; continue }
    pagos.push(p)
  }

  const out = join(ud, 'gastos-pagos.json')
  writeFileSync(out, JSON.stringify(pagos, null, 2), 'utf8')
  console.log(`Guardado ${pagos.length} pagos en ${out} (omitidos ${skipped})`)

  if (process.argv.includes('--supabase')) {
    const { url, key } = loadEnv()
    if (!url || !key) throw new Error('Para --supabase necesitás SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env')
    const sb = createClient(url, key, { auth: { persistSession: false } })
    for (let i = 0; i < pagos.length; i += 100) {
      const batch = pagos.slice(i, i + 100).map((p) => ({
        id: p.id,
        servicio_id: p.servicioId,
        mes: p.mes,
        monto: p.monto,
        fecha: p.fecha ?? null,
        metodo_pago: p.metodoPago ?? null,
        pagado: p.pagado,
        notas: p.notas ?? null,
      }))
      const { error } = await sb.from('pagos').upsert(batch)
      if (error) throw new Error(error.message)
    }
    console.log(`Supabase: ${pagos.length} pagos actualizados`)
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
