/**
 * Local password-strength heuristic (zxcvbn-like, no dependencies).
 *
 * Starts from the charset-based entropy and discounts the parts an attacker
 * guesses first: common passwords/words (also in leet speak), keyboard rows,
 * alphabetic/numeric sequences, repeated characters and years. Pure: used both
 * in the renderer (edit form) and in main (password audit over the vault).
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4

export interface StrengthResult {
  score: StrengthScore
  /** Estimated entropy after penalties. */
  bits: number
  label: string
  warnings: string[]
}

export const STRENGTH_LABELS: Record<StrengthScore, string> = {
  0: 'Muy débil',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Fuerte',
  4: 'Muy fuerte',
}

/** Score at or below which a password is flagged as weak. */
export const WEAK_MAX_SCORE: StrengthScore = 1

const COMMON = [
  'password', 'passw0rd', 'contraseña', 'contrasena', 'clave', 'secreto', 'admin', 'administrador', 'root', 'toor',
  'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'letmein', 'welcome', 'bienvenido', 'monkey',
  'dragon', 'iloveyou', 'teamo', 'master', 'superman', 'batman', 'sunshine', 'princess', 'football', 'futbol',
  'baseball', 'shadow', 'michael', 'charlie', 'changeme', 'default', 'guest', 'invitado', 'test', 'prueba', 'login',
  'usuario', 'user', 'hola', 'hello', 'secret', 'access', 'abc123', 'trustno1', 'starwars', 'pokemon', 'boca',
  'river', 'argentina', 'mariposa', 'america', 'summer', 'winter', 'verano', 'invierno', 'flower', 'computer',
]

const COMMON_NUMERIC = ['123456', '12345678', '123456789', '1234567890', '111111', '000000', '123123', '654321', '1234', '12345', '0000']

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'azertyuiop', 'qwertzuiop']

const LEET: Record<string, string> = { '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b' }

function poolSize(pwd: string): number {
  let pool = 0
  if (/[a-z]/.test(pwd)) pool += 26
  if (/[A-Z]/.test(pwd)) pool += 26
  if (/[0-9]/.test(pwd)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pwd)) {
    // eslint-disable-next-line no-control-regex
    pool += /[^\x00-\x7f]/.test(pwd) ? 60 : 33
  }
  return Math.max(pool, 1)
}

function deLeet(s: string): string {
  return [...s].map((ch) => LEET[ch] ?? ch).join('')
}

/** Marks every index covered by `needle` in `hay` (all occurrences). Returns true if found. */
function markAll(hay: string, needle: string, covered: boolean[]): boolean {
  let found = false
  let from = 0
  for (;;) {
    const i = hay.indexOf(needle, from)
    if (i < 0) break
    for (let k = i; k < i + needle.length; k++) covered[k] = true
    found = true
    from = i + 1
  }
  return found
}

function seqRuns(lower: string, covered: boolean[]): boolean {
  let found = false
  const code = (k: number): number => lower.charCodeAt(k)
  let i = 0
  while (i < lower.length - 1) {
    const d = code(i + 1) - code(i)
    if (Math.abs(d) !== 1) { i++; continue }
    let j = i + 1
    while (j + 1 < lower.length && code(j + 1) - code(j) === d) j++
    if (j - i + 1 >= 3) {
      // keep the first char as "real", the rest is predictable
      for (let k = i + 1; k <= j; k++) covered[k] = true
      found = true
    }
    i = j
  }
  return found
}

function repeatRuns(pwd: string, covered: boolean[]): boolean {
  let found = false
  let start = 0
  for (let i = 1; i <= pwd.length; i++) {
    if (i < pwd.length && pwd[i] === pwd[start]) continue
    if (i - start >= 3) {
      for (let k = start + 1; k < i; k++) covered[k] = true
      found = true
    }
    start = i
  }
  // Repeated blocks ("abcabc", "1212")
  const m = /^(.{2,}?)\1+$/.exec(pwd)
  if (m?.[1]) {
    for (let k = m[1].length; k < pwd.length; k++) covered[k] = true
    found = true
  }
  return found
}

export function estimateStrength(password: string): StrengthResult {
  if (!password) return { score: 0, bits: 0, label: STRENGTH_LABELS[0], warnings: [] }

  const warnings: string[] = []
  const lower = password.toLowerCase()
  const leet = deLeet(lower)
  const covered = new Array<boolean>(password.length).fill(false)
  const pool = poolSize(password)
  const perChar = Math.log2(pool)

  const whole = leet.replace(/[^a-z0-9ñ]+$/, '').replace(/\d+$/, '')
  const isCommonWhole = COMMON.includes(lower) || COMMON.includes(leet) || COMMON_NUMERIC.includes(lower) || COMMON.includes(whole)

  let word = false
  for (const w of COMMON) {
    if (w.length >= 4 && (markAll(lower, w, covered) || markAll(leet, w, covered))) word = true
  }
  for (const n of COMMON_NUMERIC) if (n.length >= 4 && markAll(lower, n, covered)) word = true
  if (word) warnings.push('Contiene una palabra o contraseña muy común')

  let keyboard = false
  for (const row of KEYBOARD_ROWS) {
    for (let len = row.length; len >= 4; len--) {
      for (let i = 0; i + len <= row.length; i++) {
        const frag = row.slice(i, i + len)
        if (markAll(lower, frag, covered)) keyboard = true
        if (markAll(lower, [...frag].reverse().join(''), covered)) keyboard = true
      }
    }
  }
  if (keyboard) warnings.push('Sigue una fila del teclado')

  if (seqRuns(lower, covered)) warnings.push('Tiene secuencias como «abc» o «123»')
  if (repeatRuns(password, covered)) warnings.push('Repite caracteres o bloques')

  const yearRe = /(19|20)\d\d/g
  let year = false
  for (let m = yearRe.exec(password); m; m = yearRe.exec(password)) {
    for (let k = m.index + 1; k < m.index + 4; k++) covered[k] = true
    year = true
  }
  if (year) warnings.push('Incluye un año: es fácil de adivinar')

  const effective = covered.filter((c) => !c).length
  // Each predictable chunk still costs the attacker a little.
  const predictable = password.length - effective
  let bits = effective * perChar + Math.min(predictable, 6) * 1.5

  if (isCommonWhole) {
    bits = Math.min(bits, 8)
    if (!warnings.length) warnings.push('Es una contraseña muy común')
  }
  if (password.length < 8) {
    bits = Math.min(bits, 27)
    warnings.push('Usá al menos 12 caracteres')
  } else if (password.length < 12 && bits >= 36) {
    warnings.push('Con 12 caracteres o más es más difícil de adivinar')
  }

  const score: StrengthScore = bits < 28 ? 0 : bits < 36 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4
  return { score, bits: Math.round(bits), label: STRENGTH_LABELS[score], warnings }
}

export function isWeak(password: string): boolean {
  return !!password && estimateStrength(password).score <= WEAK_MAX_SCORE
}
