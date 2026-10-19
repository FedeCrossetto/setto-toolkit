import { describe, expect, it } from 'vitest'
import { addVisited, NO_SEED, panelSeed, type ToolSeed } from './seed'

describe('panelSeed', () => {
  it('only the target tool gets the seed', () => {
    const seed: ToolSeed = { tool: 'jwt', input: 'eyJ…', stamp: 7 }
    expect(panelSeed(seed, 'jwt')).toEqual({ key: 'jwt:7', initial: 'eyJ…' })
    expect(panelSeed(seed, 'json')).toEqual({ key: 'json:0', initial: '' })
  })
  it('the key is stable while the seed does not change (no remount, input kept)', () => {
    const seed: ToolSeed = { tool: 'jwt', input: 'x', stamp: 7 }
    expect(panelSeed(seed, 'jwt').key).toBe(panelSeed({ ...seed }, 'jwt').key)
    expect(panelSeed(NO_SEED, 'json')).toEqual({ key: 'json:0', initial: '' })
  })
})

describe('addVisited', () => {
  it('adds once', () => {
    expect(addVisited(['json'], 'jwt')).toEqual(['json', 'jwt'])
    const v = ['json']
    expect(addVisited(v, 'json')).toBe(v)
  })
})
