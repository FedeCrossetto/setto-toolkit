import { describe, expect, it, vi } from 'vitest'

vi.mock('./logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { fetchRemoteImage, imageMime, parseRemoteImageUrl, REMOTE_IMAGE_MAX_BYTES } from './remote-image'

describe('parseRemoteImageUrl', () => {
  it('acepta http(s) y protocol-relative', () => {
    expect(parseRemoteImageUrl('https://x.com/a.png')?.host).toBe('x.com')
    expect(parseRemoteImageUrl('//x.com/a.png')?.protocol).toBe('https:')
  })
  it('rechaza otros esquemas y credenciales', () => {
    for (const u of ['file:///c:/x.png', 'javascript:alert(1)', 'data:image/png;base64,AA', 'https://u:p@x.com/a.png', 42, '']) {
      expect(parseRemoteImageUrl(u)).toBeNull()
    }
  })
})

describe('imageMime', () => {
  it('sólo tipos de imagen', () => {
    expect(imageMime('image/png; charset=binary')).toBe('image/png')
    expect(imageMime('text/html')).toBeNull()
    expect(imageMime(null)).toBeNull()
  })
})

describe('fetchRemoteImage', () => {
  const resp = (body: Uint8Array, type: string, status = 200): Response =>
    new Response(new Blob([body as BlobPart]), { status, headers: { 'content-type': type } })

  it('devuelve un data: URL', async () => {
    const r = await fetchRemoteImage('https://x.com/a.png', async () => resp(new Uint8Array([1, 2, 3]), 'image/png'))
    expect(r).toEqual({ ok: true, dataUrl: 'data:image/png;base64,AQID' })
  })
  it('rechaza lo que no es imagen, errores HTTP y archivos grandes', async () => {
    expect((await fetchRemoteImage('https://x.com/a', async () => resp(new Uint8Array(1), 'text/html'))).ok).toBe(false)
    expect((await fetchRemoteImage('https://x.com/a', async () => resp(new Uint8Array(1), 'image/png', 404))).ok).toBe(false)
    const big = new Uint8Array(REMOTE_IMAGE_MAX_BYTES + 1)
    expect(await fetchRemoteImage('https://x.com/a', async () => resp(big, 'image/png'))).toEqual({ ok: false, error: 'La imagen es demasiado grande' })
  })
  it('no llama al fetcher con una URL inválida', async () => {
    const f = vi.fn()
    expect((await fetchRemoteImage('file:///etc/passwd', f)).ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
