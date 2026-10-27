import { describe, expect, it } from 'vitest'
import { homePose, isAnimatedPose } from './mascots'

const at = (iso: string): Date => new Date(iso)

describe('homePose', () => {
  it('con algo para mirar, curiosa (aunque sea de noche)', () => {
    expect(homePose(at('2026-10-21T23:00:00'), 2)).toBe('curiosa')
  })
  it('fin de semana o de noche, descanso', () => {
    expect(homePose(at('2026-10-24T10:00:00'), 0)).toBe('descanso') // sábado
    expect(homePose(at('2026-10-21T22:30:00'), 0)).toBe('descanso')
    expect(homePose(at('2026-10-21T05:00:00'), 0)).toBe('descanso')
  })
  it('a la mañana saluda; a la tarde, neutra', () => {
    expect(homePose(at('2026-10-21T09:00:00'), 0)).toBe('saludo')
    expect(homePose(at('2026-10-21T15:00:00'), 0)).toBe('neutra')
  })
})

describe('isAnimatedPose', () => {
  it('distingue animadas de quietas', () => {
    expect(isAnimatedPose('buscando')).toBe(true)
    expect(isAnimatedPose('descanso')).toBe(false)
  })
})
