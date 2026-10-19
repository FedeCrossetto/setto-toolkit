import { describe, expect, it } from 'vitest'
import { isChunkLoadError, reportRendererError } from './error-report'

describe('isChunkLoadError', () => {
  it('detects failed dynamic imports across engines', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: file:///x.js'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true)
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true)
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })
  it('reportRendererError never throws without a preload bridge', () => {
    expect(() => reportRendererError('x', new Error('boom'))).not.toThrow()
  })
})
