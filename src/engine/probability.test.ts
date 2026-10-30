import { describe, expect, it } from 'vitest'
import type { CheckInput, CoreState, RiskCheck } from '../domain/types'
import { drawRandom } from './random'
import { isSuccessfulRoll, previewCheck, resolveCheck, roundHalfAwayFromZero } from './probability'

const example: CheckInput = {
  eventId: 'E05', cooperating: true,
  state: {
    protagonist: { name: '기획 예제', traits: { risk: 30, cognition: 40, affect: 50 }, stress: 65, stamina: 50, injury: 1 },
    inventory: { supply: 1, medkit: 1, weapon: true },
    flags: { access: false, data: false, helpEstablished: false, routeKnown: false, rescueDecision: null },
  },
  check: {
    base: 70, physical: true, weaponBonus: true,
    traitWeights: [{ axis: 'risk', pole: 'left', weight: 0.5 }, { axis: 'cognition', pole: 'left', weight: 0.5 }],
  },
}

function probability(input: CheckInput) {
  const result = previewCheck(input)
  if (!result.ok) throw new Error(result.error.message)
  if (result.value.kind !== 'probability') throw new Error('확률 판정이 필요합니다.')
  return result.value.probability
}

function withActor(changes: Partial<CoreState['protagonist']>): CheckInput {
  return { ...example, state: { ...example.state, protagonist: { ...example.state.protagonist, ...changes } } }
}

const exampleCheck = example.check as RiskCheck

describe('기획 v1.2 선택 전 성공률', () => {
  it('§13.1 예제 P85 및 비협력 P75를 재현한다', () => {
    expect(probability(example)).toEqual({ base: 70, trait: 5, condition: -10, equipment: 10, support: 10, flag: 0, percent: 85 })
    expect(probability({ ...example, cooperating: false }).percent).toBe(75)
    expect(isSuccessfulRoll(85, 0.849)).toEqual({ ok: true, value: true })
    expect(isSuccessfulRoll(85, 0.850)).toEqual({ ok: true, value: false })
  })

  it('음수 .5도 절댓값이 커지는 쪽으로 반올림하고 -0을 남기지 않는다', () => {
    expect(roundHalfAwayFromZero(4.5)).toBe(5)
    expect(roundHalfAwayFromZero(-4.5)).toBe(-5)
    expect(roundHalfAwayFromZero(-0.3)).toBe(0)
    const input = withActor({ traits: { risk: 65, cognition: 50, affect: 50 } })
    expect(probability({ ...input, check: { ...exampleCheck, traitWeights: [{ axis: 'risk', pole: 'left', weight: 1 }] } }).trait).toBe(-5)
  })

  it.each([[81, -15], [80, -10], [61, -10], [60, -5]] as const)('stress %i 경계에서 condition %i', (stress, expected) => {
    expect(probability(withActor({ stress })).condition).toBe(expected)
  })

  it('전 범위에서 기존 정신력의 역수치와 같은 판정 불이익을 유지한다', () => {
    for (let oldMental = 0; oldMental <= 100; oldMental++) {
      const expected = oldMental < 20 ? -10 : oldMental < 40 ? -5 : 0
      const actor = withActor({ stress: 100 - oldMental })
      expect(probability({ ...actor, check: { ...exampleCheck, physical: false } }).condition).toBe(expected)
    }
  })

  it.each([[19, -20], [20, -15], [39, -15], [40, -10]] as const)('stamina %i 경계에서 condition %i', (stamina, expected) => {
    expect(probability(withActor({ stamina })).condition).toBe(expected)
  })

  it('비신체 행동은 stamina/부상 페널티를 적용하지 않고 장비도 명시한 경우만 반영한다', () => {
    const input = withActor({ stamina: 0, injury: 2 })
    expect(probability({ ...input, check: { ...exampleCheck, physical: false, weaponBonus: false } })).toMatchObject({ condition: -5, equipment: 0 })
    expect(probability({ ...example, state: { ...example.state, inventory: { ...example.state.inventory, weapon: false } } }).equipment).toBe(0)
  })

  it('access 보정은 E07 내부에만 적용한다', () => {
    const input = { ...example, state: { ...example.state, flags: { ...example.state.flags, access: true } } }
    expect(probability(input).flag).toBe(0)
    expect(probability({ ...input, eventId: 'E07' }).flag).toBe(5)
    expect(probability({ ...example, eventId: 'E07' }).flag).toBe(0)
  })

  it('최종 확률을 5~95로 제한한다', () => {
    expect(probability({ ...example, check: { ...exampleCheck, base: 100 } }).percent).toBe(95)
    const low = withActor({ stress: 100, stamina: 0, injury: 2, traits: { risk: 100, cognition: 100, affect: 100 } })
    expect(probability({ ...low, cooperating: false, check: { ...exampleCheck, base: 0, weaponBonus: false } }).percent).toBe(5)
  })

  it.each([
    { ...exampleCheck, physical: undefined }, { ...exampleCheck, weaponBonus: undefined },
    { ...exampleCheck, base: NaN }, { ...exampleCheck, traitWeights: [] },
    { ...exampleCheck, traitWeights: [{ axis: 'risk', pole: 'left', weight: 0.9 }] },
    { ...exampleCheck, traitWeights: [{ axis: 'risk', pole: 'left', weight: NaN }] },
    { ...exampleCheck, traitWeights: [{ axis: 'risk', pole: 'left', weight: 0.5 }, { axis: 'risk', pole: 'right', weight: 0.5 }] },
    { ...exampleCheck, traitWeights: [{ axis: 'unknown', pole: 'left', weight: 1 }] },
    { ...exampleCheck, traitWeights: [{ axis: 'risk', pole: 'unknown', weight: 1 }] },
  ])('판정 누락값/가중치를 자동 보완하지 않는다: %#', check => {
    expect(previewCheck({ ...example, check: check as RiskCheck })).toMatchObject({ ok: false, error: { code: 'invalid-check' } })
  })

  it('E12 위험 판정을 거부하고 명시적 확정 판정만 허용한다', () => {
    expect(previewCheck({ ...example, eventId: 'E12' }).ok).toBe(false)
    expect(previewCheck({ ...example, eventId: 'E12', check: null })).toEqual({ ok: true, value: { kind: 'certain' } })
  })

  it('반복 미리보기·실행은 원본 수치와 입력을 바꾸지 않는다', () => {
    const input = structuredClone(example)
    Object.freeze(input.state.protagonist.traits)
    Object.freeze(input.state.protagonist)
    Object.freeze(input.state.inventory)
    Object.freeze(input.state.flags)
    Object.freeze(input.state)
    const before = structuredClone(input)
    expect(previewCheck(input)).toEqual(previewCheck(input))
    expect(resolveCheck(input, 1)).toEqual(resolveCheck(input, 1))
    expect(input).toEqual(before)
  })
})

describe('판정 난수 소비와 경계', () => {
  it('위험 판정은 미리보기 확률을 그대로 사용하고 PRNG를 정확히 한 칸 진행한다', () => {
    const preview = probability(example)
    const draw = drawRandom(1)
    const result = resolveCheck(example, 1)
    if (!draw.ok || !result.ok || result.value.outcome === 'certain') throw new Error('위험 판정 실패')
    expect(result.value.probability).toEqual(preview)
    expect(result.value.roll).toBe(draw.value.roll)
    expect(result.value.rngState).toBe(270369)
    expect(result.value.outcome).toBe('success')
  })

  it('확정 행동을 사이에 넣어도 같은 위험 선택열의 결과가 같다', () => {
    let directState = 1
    let mixedState = 1
    for (let count = 0; count < 5; count++) {
      const certain = resolveCheck({ ...example, check: null }, mixedState)
      if (!certain.ok) throw new Error(certain.error.message)
      expect(certain.value).toEqual({ outcome: 'certain', probability: null, roll: null, rngState: mixedState })
      const direct = resolveCheck(example, directState)
      const mixed = resolveCheck(example, certain.value.rngState)
      expect(mixed).toEqual(direct)
      if (!direct.ok || !mixed.ok) throw new Error('결정성 검증 실패')
      directState = direct.value.rngState
      mixedState = mixed.value.rngState
    }
  })

  it.each([-1, 1, NaN, Infinity])('r=%s 범위 밖 난수를 거부한다', roll => {
    expect(isSuccessfulRoll(85, roll).ok).toBe(false)
  })

  it('잘못된 진행 중 PRNG를 확정 행동에서도 초기 seed로 바꾸지 않는다', () => {
    expect(resolveCheck({ ...example, check: null }, 0)).toMatchObject({ ok: false, error: { code: 'invalid-seed' } })
  })
})
