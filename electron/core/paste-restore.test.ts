import { describe, expect, it } from 'vitest'
import { restorableText, shouldRestore } from './paste-restore'

describe('restorableText', () => {
  it('keeps plain text', () => {
    expect(restorableText(['text/plain'], 'hola', false)).toBe('hola')
  })
  it('skips images, files, private content and empty text', () => {
    expect(restorableText(['text/plain', 'image/png'], 'x', false)).toBeNull()
    expect(restorableText(['text/uri-list'], 'x', false)).toBeNull()
    expect(restorableText(['text/plain'], 'secret', true)).toBeNull()
    expect(restorableText([], '', false)).toBeNull()
  })
})

describe('shouldRestore', () => {
  it('restores when the clipboard still holds what we pasted', () => {
    expect(shouldRestore('prev', 'snippet', 'snippet')).toBe(true)
  })
  it('does not restore if the user copied something else, nothing was saved, or it is the same text', () => {
    expect(shouldRestore('prev', 'snippet', 'other')).toBe(false)
    expect(shouldRestore(null, 'snippet', 'snippet')).toBe(false)
    expect(shouldRestore('same', 'same', 'same')).toBe(false)
  })
})
