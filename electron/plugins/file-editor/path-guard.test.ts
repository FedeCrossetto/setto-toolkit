import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { validatePath, assertInAuthorizedRoot, addAuthorizedRoot, _resetAuthorizedRoots } from './path-guard'

describe('validatePath', () => {
  it('rejects empty / non-string input', () => {
    expect(() => validatePath('')).toThrow('Invalid path')
    expect(() => validatePath(undefined)).toThrow('Invalid path')
    expect(() => validatePath(123)).toThrow('Invalid path')
  })

  it('rejects null bytes', () => {
    expect(() => validatePath('/tmp/foo\0.txt')).toThrow('null bytes')
  })

  it('resolves and accepts a normal absolute path', () => {
    expect(validatePath('/tmp/foo.txt')).toBe(path.resolve('/tmp/foo.txt'))
  })

  it('resolves a relative path to an absolute one rather than rejecting it', () => {
    // path.resolve() always yields an absolute path, so validatePath never
    // actually hits its own "must be absolute" branch — documents that behavior.
    const resolved = validatePath('relative/file.txt')
    expect(path.isAbsolute(resolved)).toBe(true)
  })
})

describe('assertInAuthorizedRoot', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'path-guard-test-')))
    _resetAuthorizedRoots()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    _resetAuthorizedRoots()
  })

  it('throws when no workspace is open', () => {
    expect(() => assertInAuthorizedRoot(path.join(tmpDir, 'file.txt'))).toThrow('No workspace is open')
  })

  it('allows a path inside an authorized root', () => {
    addAuthorizedRoot(tmpDir)
    expect(() => assertInAuthorizedRoot(path.join(tmpDir, 'file.txt'))).not.toThrow()
  })

  it('rejects a path outside any authorized root (traversal)', () => {
    addAuthorizedRoot(tmpDir)
    const outside = fs.realpathSync(os.tmpdir())
    expect(() => assertInAuthorizedRoot(path.join(outside, 'other-place', 'file.txt'))).toThrow('Operation denied')
  })

  it('rejects ../ traversal that escapes the authorized root', () => {
    addAuthorizedRoot(tmpDir)
    const escaped = path.join(tmpDir, '..', 'escaped.txt')
    expect(() => assertInAuthorizedRoot(escaped)).toThrow('Operation denied')
  })

  it('rejects a symlink that points outside the authorized root', () => {
    const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'path-guard-outside-')))
    const outsideFile = path.join(outsideDir, 'secret.txt')
    fs.writeFileSync(outsideFile, 'secret')

    const linkPath = path.join(tmpDir, 'link-to-secret.txt')
    fs.symlinkSync(outsideFile, linkPath)

    addAuthorizedRoot(tmpDir)
    expect(() => assertInAuthorizedRoot(linkPath)).toThrow('Operation denied')

    fs.rmSync(outsideDir, { recursive: true, force: true })
  })
})
