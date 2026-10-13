/** Password generator (pure; the random source is injectable for tests). */

export interface GeneratorOptions {
  length: number
  numbers: boolean
  symbols: boolean
  /** Syllable-based ("kovira-Tesu7a-…"), easier to read out loud or type on a phone. */
  pronounceable: boolean
}

export const GENERATOR_MIN = 12
export const GENERATOR_MAX = 40
export const DEFAULT_GENERATOR: GeneratorOptions = { length: 20, numbers: true, symbols: true, pronounceable: false }

/** Uniform integer in [0, max). */
export type RandomInt = (max: number) => number

// Ambiguous characters (l I 1 O 0) are left out on purpose.
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+?'
const CONSONANTS = 'bcdfghjkmnprstvz'
const VOWELS = 'aeiou'

/** Crypto-backed uniform integer (rejection sampling, no modulo bias). */
export const cryptoRandomInt: RandomInt = (max) => {
  if (max <= 0) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    const v = buf[0] ?? 0
    if (v < limit) return v % max
  }
}

function pick(set: string, rnd: RandomInt): string {
  return set.charAt(rnd(set.length))
}

function shuffle<T>(arr: T[], rnd: RandomInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

export function clampLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_GENERATOR.length
  return Math.min(GENERATOR_MAX, Math.max(GENERATOR_MIN, Math.round(n)))
}

function randomPassword(len: number, o: GeneratorOptions, rnd: RandomInt): string {
  const classes = [LOWER, UPPER]
  if (o.numbers) classes.push(DIGITS)
  if (o.symbols) classes.push(SYMBOLS)
  const all = classes.join('')
  // One of each class guaranteed, the rest from the full set, then shuffled.
  const chars = classes.map((c) => pick(c, rnd))
  while (chars.length < len) chars.push(pick(all, rnd))
  return shuffle(chars, rnd).join('')
}

function pronounceablePassword(len: number, o: GeneratorOptions, rnd: RandomInt): string {
  // Groups of 6 letters (c-v-c-v-c-v) joined by "-" when symbols are on (Apple-style).
  const groupLen = 6
  const sep = o.symbols ? '-' : ''
  const out: string[] = []
  const letterIdx: number[] = []
  let pos = 0
  while (out.length < len) {
    if (pos > 0 && pos % groupLen === 0 && sep) {
      out.push(sep)
      if (out.length >= len) break
    }
    letterIdx.push(out.length)
    out.push(pick(pos % 2 === 0 ? CONSONANTS : VOWELS, rnd))
    pos++
  }
  // Never end with a separator.
  if (out[out.length - 1] === sep && sep) {
    out[out.length - 1] = pick(VOWELS, rnd)
    letterIdx.push(out.length - 1)
  }
  const free = shuffle([...letterIdx], rnd)
  const up = free.pop()
  if (up !== undefined) out[up] = (out[up] ?? '').toUpperCase()
  if (o.numbers) {
    const d = free.pop()
    if (d !== undefined) out[d] = pick(DIGITS, rnd)
  }
  if (o.symbols && !sep) {
    const s = free.pop()
    if (s !== undefined) out[s] = pick(SYMBOLS, rnd)
  }
  return out.join('')
}

export function generatePassword(opts: Partial<GeneratorOptions> = {}, rnd: RandomInt = cryptoRandomInt): string {
  const o: GeneratorOptions = { ...DEFAULT_GENERATOR, ...opts }
  const len = clampLength(o.length)
  return o.pronounceable ? pronounceablePassword(len, o, rnd) : randomPassword(len, o, rnd)
}
