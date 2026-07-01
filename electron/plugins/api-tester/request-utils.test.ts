import { describe, it, expect } from 'vitest'
import { interpolate, sanitizeHeader, assertNotPrivateHost } from './request-utils'

describe('interpolate', () => {
  it('replaces a single variable', () => {
    expect(interpolate('Hello {{name}}', { name: 'World' })).toBe('Hello World')
  })

  it('replaces multiple variables', () => {
    expect(interpolate('{{scheme}}://{{host}}/{{path}}', { scheme: 'https', host: 'api.example.com', path: 'v1' }))
      .toBe('https://api.example.com/v1')
  })

  it('leaves unresolved variables as-is', () => {
    expect(interpolate('Bearer {{token}}', {})).toBe('Bearer {{token}}')
  })

  it('handles empty string', () => {
    expect(interpolate('', { foo: 'bar' })).toBe('')
  })

  it('handles string with no variables', () => {
    expect(interpolate('https://example.com', { foo: 'bar' })).toBe('https://example.com')
  })

  it('replaces the same variable used twice', () => {
    expect(interpolate('{{x}}-{{x}}', { x: 'a' })).toBe('a-a')
  })
})

describe('sanitizeHeader', () => {
  it('strips \\r\\n from header values', () => {
    expect(sanitizeHeader('Bearer tok\r\nX-Evil: injected')).toBe('Bearer tokX-Evil: injected')
  })

  it('strips standalone \\n', () => {
    expect(sanitizeHeader('value\nInjected')).toBe('valueInjected')
  })

  it('strips standalone \\r', () => {
    expect(sanitizeHeader('value\rInjected')).toBe('valueInjected')
  })

  it('leaves normal header values untouched', () => {
    expect(sanitizeHeader('application/json; charset=utf-8')).toBe('application/json; charset=utf-8')
  })

  it('handles empty string', () => {
    expect(sanitizeHeader('')).toBe('')
  })
})

describe('assertNotPrivateHost', () => {
  function url(host: string): URL {
    return new URL(`https://${host}/`)
  }

  it('throws for localhost', () => {
    expect(() => assertNotPrivateHost(url('localhost'))).toThrow('SSRF')
  })

  it('throws for 127.0.0.1', () => {
    expect(() => assertNotPrivateHost(url('127.0.0.1'))).toThrow('SSRF')
  })

  it('throws for 192.168.x.x', () => {
    expect(() => assertNotPrivateHost(url('192.168.1.100'))).toThrow('SSRF')
  })

  it('throws for 10.0.0.1', () => {
    expect(() => assertNotPrivateHost(url('10.0.0.1'))).toThrow('SSRF')
  })

  it('throws for 172.16.0.1 (RFC 1918)', () => {
    expect(() => assertNotPrivateHost(url('172.16.0.1'))).toThrow('SSRF')
  })

  it('throws for 172.31.255.255 (RFC 1918 upper bound)', () => {
    expect(() => assertNotPrivateHost(url('172.31.255.255'))).toThrow('SSRF')
  })

  it('does NOT throw for 172.32.0.0 (just outside RFC 1918)', () => {
    expect(() => assertNotPrivateHost(url('172.32.0.0'))).not.toThrow()
  })

  it('throws for 169.254.0.1 (AWS metadata / link-local)', () => {
    expect(() => assertNotPrivateHost(url('169.254.169.254'))).toThrow('SSRF')
  })

  it('does not throw for a public hostname', () => {
    expect(() => assertNotPrivateHost(url('api.example.com'))).not.toThrow()
  })

  it('does not throw for a public IP', () => {
    expect(() => assertNotPrivateHost(url('8.8.8.8'))).not.toThrow()
  })
})
