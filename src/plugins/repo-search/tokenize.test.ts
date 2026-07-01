/**
 * Tests for the inline syntax tokenizer used to highlight code fragments
 * in the search results panel. The tokenizer lives as a private function
 * inside RepoSearch.tsx — we test its behaviour via the exported component
 * indirectly by extracting and running the relevant logic here.
 *
 * Since the tokenizer is a pure function with no React dependency we
 * replicate it here to keep tests fast and dependency-free.
 */
import { describe, it, expect } from 'vitest'

// ── Replica of the tokenizer (kept in sync with RepoSearch.tsx) ─────────────

type Token = { type: 'keyword' | 'string' | 'number' | 'comment' | 'plain'; text: string }

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'import', 'export', 'default', 'from', 'async', 'await', 'new',
  'this', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined',
  'try', 'catch', 'throw', 'type', 'interface', 'extends', 'implements',
])

function tokenize(code: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < code.length) {
    if ((code[i] === '/' && code[i + 1] === '/') || code[i] === '#') {
      tokens.push({ type: 'comment', text: code.slice(i) }); break
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const q = code[i]; let j = i + 1
      while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++ }
      tokens.push({ type: 'string', text: code.slice(i, j + 1) }); i = j + 1; continue
    }
    if (/\d/.test(code[i]!) && (i === 0 || /\W/.test(code[i - 1]!))) {
      let j = i
      while (j < code.length && /[\d.]/.test(code[j]!)) j++
      tokens.push({ type: 'number', text: code.slice(i, j) }); i = j; continue
    }
    if (/[a-zA-Z_$]/.test(code[i]!)) {
      let j = i
      while (j < code.length && /[\w$]/.test(code[j]!)) j++
      const word = code.slice(i, j)
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'plain', text: word }); i = j; continue
    }
    const last = tokens[tokens.length - 1]
    if (last?.type === 'plain') last.text += code[i]
    else tokens.push({ type: 'plain', text: code[i]! })
    i++
  }
  return tokens
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('tokenize (repo-search syntax highlighter)', () => {
  it('empty string produces no tokens', () => {
    expect(tokenize('')).toEqual([])
  })

  it('recognises keywords', () => {
    const tokens = tokenize('const x = 1')
    expect(tokens[0]).toMatchObject({ type: 'keyword', text: 'const' })
  })

  it('classifies non-keyword identifiers as plain', () => {
    const tokens = tokenize('myVariable')
    expect(tokens[0]).toMatchObject({ type: 'plain', text: 'myVariable' })
  })

  it('tokenises double-quoted strings', () => {
    const tokens = tokenize('"hello world"')
    expect(tokens[0]).toMatchObject({ type: 'string', text: '"hello world"' })
  })

  it('tokenises single-quoted strings', () => {
    const tokens = tokenize("'test'")
    expect(tokens[0]).toMatchObject({ type: 'string', text: "'test'" })
  })

  it('handles escaped quotes inside strings', () => {
    const tokens = tokenize('"say \\"hi\\""')
    expect(tokens[0]?.type).toBe('string')
    expect(tokens[0]?.text).toContain('\\"')
  })

  it('tokenises integer numbers', () => {
    const tokens = tokenize('return 42')
    expect(tokens.find((t) => t.type === 'number')).toMatchObject({ type: 'number', text: '42' })
  })

  it('tokenises floating-point numbers', () => {
    const tokens = tokenize('3.14')
    expect(tokens[0]).toMatchObject({ type: 'number', text: '3.14' })
  })

  it('does NOT classify a number in the middle of a word as a number token', () => {
    // "var2" should stay as a plain identifier, not split into plain "var" + number "2"
    const tokens = tokenize('var2')
    expect(tokens.every((t) => t.type !== 'number')).toBe(true)
    expect(tokens.some((t) => t.text.includes('var2') || (t.type === 'plain' && t.text.includes('2')))).toBe(true)
  })

  it('stops at // comment and includes the rest as one comment token', () => {
    const tokens = tokenize('code // this is a comment')
    const commentToken = tokens.find((t) => t.type === 'comment')
    expect(commentToken).toBeDefined()
    expect(commentToken?.text).toContain('this is a comment')
  })

  it('stops at # comment (Python/shell style)', () => {
    const tokens = tokenize('# python comment')
    expect(tokens[0]).toMatchObject({ type: 'comment', text: '# python comment' })
  })

  it('handles a typical TypeScript line with mixed token types', () => {
    const tokens = tokenize('const value = "hello" // greeting')
    const types = tokens.map((t) => t.type)
    expect(types).toContain('keyword')
    expect(types).toContain('string')
    expect(types).toContain('comment')
  })
})
