import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { DatabaseService } = await import('./db.service')
const { SettingsService }  = await import('./settings.service')
const { AIService }        = await import('./ai.service')

function makeServices() {
  const db  = new DatabaseService()
  const settings = new SettingsService(db)
  const ai  = new AIService(db, settings)
  return { db, settings, ai }
}

describe('AIService', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('throws NO_API_KEY when key is not set', async () => {
    const { ai } = makeServices()
    await expect(ai.complete([{ role: 'user', content: 'hello' }])).rejects.toThrow('NO_API_KEY')
  })

  it('returns cached response on second identical call', async () => {
    const { settings, ai } = makeServices()
    settings.set('ai.openai_key', 'sk-test')

    // Mock fetch to return a valid OpenAI response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Hello!' } }] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const messages = [{ role: 'user' as const, content: 'Test prompt' }]
    const first  = await ai.complete(messages)
    const second = await ai.complete(messages)

    expect(first.text).toBe('Hello!')
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1) // only one real request
  })

  it('throws RATE_LIMITED after exceeding 10 calls per minute', async () => {
    const { settings, ai } = makeServices()
    settings.set('ai.openai_key', 'sk-test')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    }))

    const messages = (i: number) => [{ role: 'user' as const, content: `unique-${i}-${Math.random()}` }]

    // First 10 calls should succeed
    for (let i = 0; i < 10; i++) {
      await ai.complete(messages(i), { skipCache: true })
    }

    // 11th call should be rate-limited
    await expect(ai.complete(messages(11), { skipCache: true })).rejects.toThrow(/RATE_LIMITED/)
  })

  it('skips cache when skipCache is true', async () => {
    const { settings, ai } = makeServices()
    settings.set('ai.openai_key', 'sk-test')

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callCount++
      return { ok: true, json: async () => ({ choices: [{ message: { content: `response-${callCount}` } }] }) }
    }))

    const messages = [{ role: 'user' as const, content: 'Same prompt' }]
    const r1 = await ai.complete(messages, { skipCache: true })
    const r2 = await ai.complete(messages, { skipCache: true })

    expect(r1.text).toBe('response-1')
    expect(r2.text).toBe('response-2')
    expect(callCount).toBe(2)
  })
})
