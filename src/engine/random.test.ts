import { describe, expect, it } from 'vitest'
import { drawRandom, initializeRandom, ZERO_SEED_REPLACEMENT } from './random'

describe('명시적인 xorshift32 난수 상태', () => {
  it('seed1의 기준 벡터와 unsigned 상태를 재현한다', () => {
    let state = 1
    for (const expected of [270369, 67634689, 2647435461, 307599695, 2398689233]) {
      const result = drawRandom(state)
      if (!result.ok) throw new Error(result.error.message)
      expect(result.value.rngState).toBe(expected)
      expect(result.value.roll).toBe(expected / 4294967296)
      expect(result.value.roll).toBeGreaterThanOrEqual(0)
      expect(result.value.roll).toBeLessThan(1)
      expect(drawRandom(state)).toEqual(result)
      state = result.value.rngState
    }
  })

  it('초기 seed0만 고정 비영 값으로 치환하고 진행 중 0은 거부한다', () => {
    expect(initializeRandom(0)).toEqual({ ok: true, value: ZERO_SEED_REPLACEMENT })
    expect(initializeRandom(1)).toEqual({ ok: true, value: 1 })
    expect(drawRandom(0)).toMatchObject({ ok: false, error: { code: 'invalid-seed' } })
    expect(drawRandom(ZERO_SEED_REPLACEMENT).ok).toBe(true)
  })

  it.each([-1, 4294967296, 1.5, NaN, Infinity])('유효하지 않은 seed %s를 거부한다', value => {
    expect(initializeRandom(value).ok).toBe(false)
    expect(drawRandom(value).ok).toBe(false)
  })
})
