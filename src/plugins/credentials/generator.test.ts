import { describe, it, expect } from 'vitest'
import { clampLength, generatePassword, GENERATOR_MAX, GENERATOR_MIN, type RandomInt } from './generator'
import { estimateStrength } from './strength'

/** Deterministic PRNG (mulberry32) for reproducible tests. */
function seeded(seed: number): RandomInt {
  let a = seed
  return (max) => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max)
  }
}

describe('generatePassword', () => {
  it('respects length and clamps it to 12–40', () => {
    expect(generatePassword({ length: 20 })).toHaveLength(20)
    expect(generatePassword({ length: 3 })).toHaveLength(GENERATOR_MIN)
    expect(generatePassword({ length: 400 })).toHaveLength(GENERATOR_MAX)
    expect(clampLength(Number.NaN)).toBe(20)
  })
  it('includes every selected class', () => {
    for (let s = 1; s < 50; s++) {
      const p = generatePassword({ length: 12, numbers: true, symbols: true, pronounceable: false }, seeded(s))
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/\d/)
      expect(p).toMatch(/[^a-zA-Z0-9]/)
    }
  })
  it('omits numbers and symbols when off', () => {
    for (let s = 1; s < 30; s++) {
      expect(generatePassword({ length: 30, numbers: false, symbols: false, pronounceable: false }, seeded(s))).toMatch(/^[a-zA-Z]+$/)
    }
  })
  it('is deterministic for a given random source', () => {
    expect(generatePassword({}, seeded(7))).toBe(generatePassword({}, seeded(7)))
  })
  it('pronounceable: syllables, groups with "-", one capital and one digit', () => {
    for (let s = 1; s < 30; s++) {
      const len = 12 + (s % 29)
      const p = generatePassword({ length: len, numbers: true, symbols: true, pronounceable: true }, seeded(s))
      expect(p).toHaveLength(len)
      expect(p.endsWith('-')).toBe(false)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/\d/)
      expect(p).toMatch(/-/)
      expect(p).not.toMatch(/[bcdfghjkmnprstvz]{3}/i)
    }
    const plain = generatePassword({ length: 16, numbers: false, symbols: false, pronounceable: true }, seeded(3))
    expect(plain).toMatch(/^[a-zA-Z]+$/)
  })
  it('generated passwords are rated strong', () => {
    expect(estimateStrength(generatePassword({ length: 20 })).score).toBeGreaterThanOrEqual(3)
  })
  it('uses crypto by default', () => {
    expect(generatePassword()).not.toBe(generatePassword())
  })
})
