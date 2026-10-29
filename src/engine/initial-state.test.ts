import { describe, expect, it } from 'vitest'
import type { CoreState, ResolvedQuestionnaireAnswer, TraitAxis } from '../domain/types'
import { validateCoreState } from '../domain/validation'
import { calculateInitialTraits, createInitialCoreState } from './initial-state'

const axes = ['risk', 'risk', 'cognition', 'cognition', 'affect', 'affect'] as const
function answers(mask = 0): ResolvedQuestionnaireAnswer[] {
  return axes.map((axis, index) => ({ questionId: `q${index}`, axis, delta: (mask & (1 << index)) ? 10 : -10 }))
}

describe('기획 v1.2 초기 상태', () => {
  it('설문 64개 조합은 각 축 30/50/70만 만들며 입력을 바꾸지 않는다', () => {
    const observed = new Set<number>()
    for (let mask = 0; mask < 64; mask++) {
      const input = answers(mask)
      const before = structuredClone(input)
      const result = calculateInitialTraits(input)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error.message)
      for (const value of Object.values(result.value)) {
        expect([30, 50, 70]).toContain(value)
        observed.add(value)
      }
      expect(input).toEqual(before)
    }
    expect([...observed].sort()).toEqual([30, 50, 70])
    expect(calculateInitialTraits(answers(0))).toEqual({ ok: true, value: { risk: 30, cognition: 30, affect: 30 } })
    expect(calculateInitialTraits(answers(63))).toEqual({ ok: true, value: { risk: 70, cognition: 70, affect: 70 } })
    expect(calculateInitialTraits(answers(21))).toEqual({ ok: true, value: { risk: 50, cognition: 50, affect: 50 } })
  })

  it.each([
    [], answers().slice(1), [...answers(), answers()[0]],
    answers().map(answer => ({ ...answer, questionId: 'duplicate' })),
    answers().map(answer => ({ ...answer, axis: 'risk' as TraitAxis })),
    [...answers().slice(0, 5), { questionId: 'q5', axis: 'affect', delta: 0 }],
    [...answers().slice(0, 5), null],
  ].map(input => ({ input })))('불완전하거나 중복된 설문을 거부한다: %#', ({ input }) => {
    expect(calculateInitialTraits(input as ResolvedQuestionnaireAnswer[]).ok).toBe(false)
  })

  it('표시명은 수치에 영향이 없고 초기 물자/플래그는 기획값이다', () => {
    const result = createInitialCoreState('이름 A', answers(21))
    const other = createInitialCoreState('이름 B', answers(21))
    expect(result.ok && other.ok).toBe(true)
    if (!result.ok || !other.ok) throw new Error('초기 상태 생성 실패')
    expect(result.value.protagonist).toEqual({ name: '이름 A', traits: { risk: 50, cognition: 50, affect: 50 }, stress: 30, stamina: 70, injury: 0 })
    expect(other.value.protagonist.traits).toEqual(result.value.protagonist.traits)
    expect(result.value.inventory).toEqual({ supply: 1, medkit: 1, weapon: false })
    expect(result.value.flags).toEqual({ access: false, data: false, helpEstablished: false, routeKnown: false, rescueDecision: null })
  })

  it('잘못된 상태는 보정하지 않고 거부하며 정상 상태는 복사한다', () => {
    const result = createInitialCoreState('검증', answers(21))
    if (!result.ok) throw new Error(result.error.message)
    const valid = validateCoreState(result.value)
    expect(valid).toEqual(result)
    if (!valid.ok) throw new Error(valid.error.message)
    expect(valid.value.protagonist.traits).not.toBe(result.value.protagonist.traits)
    const corrupt: unknown[] = [null, [], {}, { ...result.value, flags: {} }]
    for (const [field, value] of [['stress', NaN], ['stamina', -1], ['injury', 4], ['stress', 1.5]] as const) {
      corrupt.push({ ...result.value, protagonist: { ...result.value.protagonist, [field]: value } })
    }
    corrupt.push({ ...result.value, inventory: { ...result.value.inventory, supply: -1 } })
    corrupt.push({ ...result.value, flags: { ...result.value.flags, access: undefined } })
    corrupt.push({ ...result.value, flags: { ...result.value.flags, rescueDecision: undefined } })
    for (const input of corrupt) expect(validateCoreState(input)).toMatchObject({ ok: false, error: { code: 'invalid-state' } })
    const state: CoreState = result.value
    expect(state.inventory.supply).toBe(1)
  })
})
