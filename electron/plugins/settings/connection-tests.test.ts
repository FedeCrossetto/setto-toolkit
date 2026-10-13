import { describe, it, expect, vi } from 'vitest'
import { testConnection } from './connection-tests'

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('testConnection', () => {
  it('reports unconfigured without calling the network', async () => {
    const f = vi.fn()
    const r = await testConnection('openai', undefined, () => null, f as unknown as typeof fetch)
    expect(r).toMatchObject({ ok: false, configured: false })
    expect(f).not.toHaveBeenCalled()
  })

  it('prefers form values over stored ones and ignores the sentinel', async () => {
    const f = vi.fn(async () => json(200, { data: [{}, {}] }))
    await testConnection('openai', { key: 'sk-form' }, () => 'sk-stored', f as unknown as typeof fetch)
    expect(f.mock.calls[0]).toBeDefined()
    expect(JSON.stringify(f.mock.calls[0])).toContain('sk-form')
    f.mockClear()
    await testConnection('openai', { key: '__CONFIGURED__' }, () => 'sk-stored', f as unknown as typeof fetch)
    expect(JSON.stringify(f.mock.calls[0])).toContain('sk-stored')
  })

  it('never echoes the secret in the detail', async () => {
    const secret = 'sk-supersecret-123'
    const f = vi.fn(async () => json(400, { error: { message: `Bad key ${secret}` } }))
    const r = await testConnection('openai', { key: secret }, () => null, f as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(r.detail).not.toContain(secret)
  })

  it('maps 401 and builds a whoami detail for Jira', async () => {
    const get = (k: string): string | null => ({
      'ticket-resolver.jira_url': 'https://acme.atlassian.net/',
      'ticket-resolver.jira_user': 'me@acme.com',
      'ticket-resolver.jira_token': 'tok',
    } as Record<string, string>)[k] ?? null
    const ok = await testConnection('jira', undefined, get, (async () => json(200, { displayName: 'Fede' })) as unknown as typeof fetch)
    expect(ok.ok).toBe(true)
    expect(ok.detail).toMatch(/^Conectado como Fede · \d+ ms$/)
    const bad = await testConnection('jira', undefined, get, (async () => json(401, {})) as unknown as typeof fetch)
    expect(bad).toMatchObject({ ok: false, configured: true, detail: 'Credenciales inválidas (401)' })
  })

  it('flags a missing Ollama model', async () => {
    const f = (async () => json(200, { models: [{ name: 'qwen3:14b' }] })) as unknown as typeof fetch
    const r = await testConnection('ollama', { url: 'http://localhost:11434', model: 'llama3' }, () => null, f)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('llama3')
    const r2 = await testConnection('ollama', { url: 'http://localhost:11434', model: 'qwen3' }, () => null, f)
    expect(r2.ok).toBe(true)
  })

  it('turns network errors into a readable message', async () => {
    const f = (async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) }) as unknown as typeof fetch
    const r = await testConnection('ollama', { url: 'http://localhost:11434' }, () => null, f)
    expect(r.detail).toContain('rechazada')
  })
})
