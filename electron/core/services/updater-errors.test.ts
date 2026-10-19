import { describe, expect, it } from 'vitest'
import { friendlyUpdaterError, isQuietUpdaterError } from './updater-errors'

describe('isQuietUpdaterError', () => {
  it('treats missing releases, 404/403 and network errors as quiet', () => {
    expect(isQuietUpdaterError('No published versions on GitHub')).toBe(true)
    expect(isQuietUpdaterError('Cannot find latest.yml in the latest release artifacts')).toBe(true)
    expect(isQuietUpdaterError('HttpError: 404 Not Found')).toBe(true)
    expect(isQuietUpdaterError('net::ERR_INTERNET_DISCONNECTED')).toBe(true)
    expect(isQuietUpdaterError('getaddrinfo ENOTFOUND api.github.com')).toBe(true)
    expect(isQuietUpdaterError(undefined)).toBe(true)
  })
  it('keeps real failures loud', () => {
    expect(isQuietUpdaterError('sha512 checksum mismatch')).toBe(false)
    expect(isQuietUpdaterError('EPERM: operation not permitted, rename')).toBe(false)
  })
})

describe('friendlyUpdaterError', () => {
  it('maps common causes to short Spanish copy', () => {
    expect(friendlyUpdaterError('No published versions on GitHub')).toMatch(/no hay versiones/)
    expect(friendlyUpdaterError('net::ERR_NAME_NOT_RESOLVED')).toMatch(/Sin conexión/)
    expect(friendlyUpdaterError('boom\nstack…')).toBe('boom')
    expect(friendlyUpdaterError('')).toMatch(/desconocido/)
  })
})
