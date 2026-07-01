import { describe, it, expect } from 'vitest'
import { parseCurl, extractTemplateVars } from './utils'

describe('parseCurl', () => {
  it('returns null for non-curl input', () => {
    expect(parseCurl('')).toBeNull()
    expect(parseCurl('wget https://example.com')).toBeNull()
  })

  it('parses a basic GET with URL', () => {
    const r = parseCurl('curl https://api.example.com/users')
    expect(r?.method).toBe('GET')
    expect(r?.url).toBe('https://api.example.com/users')
  })

  it('parses -X POST', () => {
    const r = parseCurl('curl -X POST https://api.example.com/users')
    expect(r?.method).toBe('POST')
  })

  it('parses -H header', () => {
    const r = parseCurl('curl -H "Content-Type: application/json" https://example.com')
    expect(r?.headers?.some((h) => h.key === 'Content-Type' && h.value === 'application/json')).toBe(true)
  })

  it('infers POST when -d is given', () => {
    const r = parseCurl("curl https://api.example.com -d '{\"name\":\"test\"}'")
    expect(r?.method).toBe('POST')
    expect(r?.body?.content).toBe('{"name":"test"}')
  })

  it('parses -u for basic auth', () => {
    const r = parseCurl('curl -u alice:secret https://example.com')
    expect(r?.auth?.type).toBe('basic')
    const auth = r?.auth as { type: string; username?: string; password?: string } | undefined
    expect(auth?.username).toBe('alice')
    expect(auth?.password).toBe('secret')
  })

  it('extracts bearer from Authorization header', () => {
    const r = parseCurl('curl -H "Authorization: Bearer mytoken123" https://example.com')
    expect(r?.auth?.type).toBe('bearer')
    const auth = r?.auth as { type: string; token?: string } | undefined
    expect(auth?.token).toBe('mytoken123')
    // Authorization header should be removed from explicit headers list
    expect(r?.headers?.some((h) => h.key.toLowerCase() === 'authorization')).toBe(false)
  })

  it('handles single-quoted values', () => {
    const r = parseCurl("curl -d '{\"key\":\"value\"}' https://api.example.com")
    expect(r?.body?.content).toBe('{"key":"value"}')
  })

  it('handles line continuation (backslash newline)', () => {
    const r = parseCurl('curl \\\n  -X DELETE \\\n  https://api.example.com/resource/1')
    expect(r?.method).toBe('DELETE')
  })

  it('handles --data-raw flag', () => {
    const r = parseCurl('curl --data-raw "raw body" https://example.com')
    expect(r?.body?.content).toBe('raw body')
    expect(r?.method).toBe('POST')
  })
})

describe('extractTemplateVars', () => {
  it('returns empty array when no placeholders', () => {
    expect(extractTemplateVars('no vars here')).toEqual([])
  })

  it('extracts single placeholder', () => {
    expect(extractTemplateVars('https://api.example.com/{{endpoint}}')).toEqual(['endpoint'])
  })

  it('deduplicates placeholders across multiple strings', () => {
    const vars = extractTemplateVars('{{base}}/users', '{{base}}/posts?key={{apiKey}}')
    expect(vars).toHaveLength(2)
    expect(vars).toContain('base')
    expect(vars).toContain('apiKey')
  })

  it('trims whitespace in placeholder names', () => {
    expect(extractTemplateVars('{{ name }}')).toEqual(['name'])
  })

  it('handles multiple placeholders in one string', () => {
    const vars = extractTemplateVars('https://{{host}}/{{path}}?q={{query}}')
    expect(vars).toHaveLength(3)
  })
})
