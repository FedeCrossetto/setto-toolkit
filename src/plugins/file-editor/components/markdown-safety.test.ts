import { describe, expect, it, vi } from 'vitest'

vi.mock('dompurify', () => ({ default: () => ({}) }))

import { hasRemoteCssUrl, isRemoteUrl, remoteHost } from './markdown-safety'

describe('markdown-safety', () => {
  it('isRemoteUrl', () => {
    expect(isRemoteUrl('https://x.com/a.png')).toBe(true)
    expect(isRemoteUrl('HTTP://x.com/a.png')).toBe(true)
    expect(isRemoteUrl(' //x.com/a.png')).toBe(true)
    expect(isRemoteUrl('data:image/png;base64,AA')).toBe(false)
    expect(isRemoteUrl('setto-capture://img/a.png')).toBe(false)
    expect(isRemoteUrl('./local.png')).toBe(false)
    expect(isRemoteUrl(null)).toBe(false)
  })
  it('hasRemoteCssUrl', () => {
    expect(hasRemoteCssUrl('background: url(https://t.co/p.gif)')).toBe(true)
    expect(hasRemoteCssUrl("background-image:url( '//t.co/p.gif' )")).toBe(true)
    expect(hasRemoteCssUrl('color: red; background: url(data:image/png;base64,AA)')).toBe(false)
    expect(hasRemoteCssUrl('')).toBe(false)
  })
  it('remoteHost', () => {
    expect(remoteHost('https://img.example.com/a.png')).toBe('img.example.com')
    expect(remoteHost('//cdn.x.io/a.png')).toBe('cdn.x.io')
    expect(remoteHost('nope')).toBe('')
  })
})
