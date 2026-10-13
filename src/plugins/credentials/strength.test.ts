import { describe, it, expect } from 'vitest'
import { estimateStrength, isWeak } from './strength'

describe('estimateStrength', () => {
  it('empty is 0', () => {
    expect(estimateStrength('').score).toBe(0)
  })
  it('flags common passwords, even with leet and suffixes', () => {
    for (const p of ['password', '123456', 'qwerty', 'P@ssw0rd', 'Password1!', 'admin2024', 'contraseña']) {
      expect(estimateStrength(p).score, p).toBeLessThanOrEqual(1)
      expect(isWeak(p), p).toBe(true)
    }
  })
  it('penalises sequences, keyboard rows, repeats and years', () => {
    expect(estimateStrength('abcdefgh1234').score).toBeLessThanOrEqual(1)
    expect(estimateStrength('asdfghjkl;').warnings.join()).toMatch(/teclado/)
    expect(estimateStrength('aaaaaaaaaaaa').score).toBe(0)
    expect(estimateStrength('Fede1985').warnings.join()).toMatch(/año/)
  })
  it('short passwords are capped', () => {
    expect(estimateStrength('xK9#q').score).toBe(0)
  })
  it('rates long random passwords as strong', () => {
    expect(estimateStrength('vT7#qL2!xR9@mZ4$').score).toBe(4)
    expect(estimateStrength('Gk7pR2xq9Lm3').score).toBeGreaterThanOrEqual(3)
    expect(estimateStrength('correct horse battery staple').score).toBe(4)
  })
  it('increases with length', () => {
    expect(estimateStrength('Gk7pR2xq9Lm3Vb8n').bits).toBeGreaterThan(estimateStrength('Gk7pR2xq').bits)
  })
})
