import { describe, expect, it } from 'vitest'
import {
  computeHiddenLineRanges, countLogLevels, effectiveLevels, findTimestamp, isLogFile,
  isStackTraceLine, lineAfterEnd, parseLogLevel, DEFAULT_LOG_VIEW,
} from './logParsing'

describe('parseLogLevel', () => {
  it('detecta niveles en mayúsculas', () => {
    expect(parseLogLevel('2026-01-02 10:00:00 ERROR Falló')?.level).toBe('error')
    expect(parseLogLevel('10:00:00 [WARN] algo')?.level).toBe('warn')
    expect(parseLogLevel('INFO arrancó')?.level).toBe('info')
    expect(parseLogLevel('DEBUG x=1')?.level).toBe('debug')
    expect(parseLogLevel('TRACE x=1')?.level).toBe('debug')
    expect(parseLogLevel('FATAL caída')?.level).toBe('error')
  })
  it('trata excepciones como error', () => {
    expect(parseLogLevel('System.NullReferenceException: Object reference')?.level).toBe('error')
  })
  it('acepta variantes delimitadas sin distinguir mayúsculas', () => {
    expect(parseLogLevel('[Error] algo')?.level).toBe('error')
    expect(parseLogLevel('<warning> algo')?.level).toBe('warn')
  })
  it('no confunde palabras sueltas en minúscula', () => {
    expect(parseLogLevel('no hubo error en el proceso')).toBeNull()
    expect(parseLogLevel('information about the catalog')).toBeNull()
  })
  it('gana el token más a la izquierda', () => {
    const m = parseLogLevel('INFO reintento tras ERROR')
    expect(m).toEqual({ level: 'info', from: 0, to: 4 })
  })
})

describe('timestamps y stack traces', () => {
  it('encuentra timestamps', () => {
    expect(findTimestamp('2026-10-11 13:45:01.123 INFO x')).toEqual({ from: 0, to: 23 })
    expect(findTimestamp('[11/10/2026 13:45:01] x')).toEqual({ from: 1, to: 20 })
    expect(findTimestamp('sin hora')).toBeNull()
  })
  it('reconoce stack traces en inglés y español', () => {
    expect(isStackTraceLine('   at Foo.Bar() in C:\\x.cs:line 3')).toBe(true)
    expect(isStackTraceLine('   en WSI.Common.Foo() en C:\\x.cs:línea 3')).toBe(true)
    expect(isStackTraceLine('at the end')).toBe(false)
  })
})

describe('effectiveLevels', () => {
  it('las líneas de stack heredan el nivel de la entrada', () => {
    expect(effectiveLevels(['ERROR boom', '   en A.B()', 'INFO ok', 'texto suelto'])).toEqual(['error', 'error', 'info', null])
  })
})

describe('computeHiddenLineRanges', () => {
  const lines = ['INFO a', 'ERROR b', '   at X()', 'WARN c', 'INFO d', 'ERROR e']
  it('sin filtro no oculta nada', () => {
    expect(computeHiddenLineRanges(lines, DEFAULT_LOG_VIEW)).toEqual([])
  })
  it('filtra sólo errores (con su stack)', () => {
    expect(computeHiddenLineRanges(lines, { ...DEFAULT_LOG_VIEW, level: 'errors' })).toEqual([[1, 1], [4, 5]])
  })
  it('warnings+ incluye errores', () => {
    expect(computeHiddenLineRanges(lines, { ...DEFAULT_LOG_VIEW, level: 'warnings' })).toEqual([[1, 1], [5, 5]])
  })
  it('filtra por texto sin distinguir mayúsculas', () => {
    expect(computeHiddenLineRanges(lines, { ...DEFAULT_LOG_VIEW, text: 'd' })).toEqual([[1, 4], [6, 6]])
  })
  it('respeta "Limpiar vista"', () => {
    expect(computeHiddenLineRanges(lines, { ...DEFAULT_LOG_VIEW, fromLine: 5 })).toEqual([[1, 4]])
  })
  it('rinde con 50k líneas', () => {
    const big = Array.from({ length: 50_000 }, (_, i) => `2026-01-01 10:00:00 ${i % 10 === 0 ? 'ERROR' : 'INFO'} línea ${i}`)
    const t = performance.now()
    const r = computeHiddenLineRanges(big, { ...DEFAULT_LOG_VIEW, level: 'errors' })
    expect(r.length).toBe(5000)
    expect(performance.now() - t).toBeLessThan(1000)
  })
})

describe('contadores y utilidades', () => {
  it('cuenta errores y warnings', () => {
    expect(countLogLevels('ERROR a\nWARN b\nINFO c\nFATAL d')).toEqual({ errors: 2, warnings: 1 })
    expect(countLogLevels('ERROR a\nWARN b\nINFO c\nFATAL d', 3)).toEqual({ errors: 1, warnings: 0 })
  })
  it('lineAfterEnd apunta a la próxima línea escrita', () => {
    expect(lineAfterEnd('a\nb\n')).toBe(3)
    expect(lineAfterEnd('a\nb')).toBe(3)
  })
  it('isLogFile', () => {
    expect(isLogFile('app.log', 'log', false)).toBe(true)
    expect(isLogFile('CASHIER_20260928_CROSSETTO.txt', 'text', false)).toBe(true)
    expect(isLogFile('Wigos.Components.KioskRedemption_20260804_CROSSETTO.txt', 'text', false)).toBe(true)
    expect(isLogFile('notas-2026.txt', 'text', false)).toBe(false)
    expect(isLogFile('CASHIER_20261011.txt', 'text', false)).toBe(true)
    expect(isLogFile('CASHIER_20261011.txt', 'text', true)).toBe(true)
    expect(isLogFile('service_log.txt', 'text', false)).toBe(true)
    expect(isLogFile('catalog.txt', 'text', false)).toBe(false)
    expect(isLogFile('log.ts', 'typescript', false)).toBe(false)
  })
})
