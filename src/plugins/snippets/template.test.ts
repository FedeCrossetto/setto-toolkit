import { describe, it, expect } from 'vitest'
import { parseVariables, renderTemplate, initialValues, hasVariables, stripDataUrls } from './template'

describe('parseVariables', () => {
  it('finds unique variables in order with defaults', () => {
    const vars = parseVariables('SELECT * FROM {{tabla}} WHERE id = {{id:1}} AND x = {{ tabla }} -- {{id:9}}')
    expect(vars).toEqual([{ name: 'tabla' }, { name: 'id', defaultValue: '1' }])
  })
  it('takes the first default even if it appears later', () => {
    expect(parseVariables('{{a}} {{a:x}}')).toEqual([{ name: 'a', defaultValue: 'x' }])
  })
  it('accepts spaces in names and empty defaults', () => {
    expect(parseVariables('{{nombre del host:}}')).toEqual([{ name: 'nombre del host', defaultValue: '' }])
  })
  it('ignores text without placeholders', () => {
    expect(hasVariables('echo {hola} {{ }}')).toBe(false)
  })
})

describe('renderTemplate', () => {
  it('replaces values and falls back to defaults', () => {
    const tpl = 'ssh {{user:root}}@{{host}} -p {{port:22}}'
    expect(renderTemplate(tpl, { host: 'srv1' })).toBe('ssh root@srv1 -p 22')
    expect(renderTemplate(tpl, { host: 'srv1', user: 'fede', port: '' })).toBe('ssh fede@srv1 -p 22')
  })
  it('uses the first default for repeated variables without one', () => {
    expect(renderTemplate('{{db:main}} / {{db}}', {})).toBe('main / main')
  })
  it('renders missing variables as empty', () => {
    expect(renderTemplate('a{{x}}b', {})).toBe('ab')
  })
})

describe('initialValues', () => {
  it('prefers remembered values over defaults', () => {
    const vars = parseVariables('{{a:1}} {{b:2}} {{c}}')
    expect(initialValues(vars, { b: 'z' })).toEqual({ a: '1', b: 'z', c: '' })
  })
})

describe('stripDataUrls', () => {
  it('removes embedded base64 images', () => {
    const s = 'antes ![](data:image/png;base64,iVBORw0KGgo=) despues data:image/jpeg;base64,AAAA fin'
    const out = stripDataUrls(s)
    expect(out).not.toContain('base64')
    expect(out).toContain('antes')
    expect(out).toContain('fin')
  })
})
