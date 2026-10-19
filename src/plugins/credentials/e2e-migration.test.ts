import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { MIGRATION_004_SQL } from './e2e-migration'

describe('migration 004', () => {
  it('the copy shown in the app matches the SQL file', () => {
    const file = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/004_credenciales_sync.sql'), 'utf-8')
    expect(MIGRATION_004_SQL.replace(/\r\n/g, '\n').trim()).toBe(file.replace(/\r\n/g, '\n').trim())
    expect(file).toMatch(/add column if not exists password_e2e/)
    expect(file).toMatch(/create table if not exists public\.vault_meta/)
  })
})
