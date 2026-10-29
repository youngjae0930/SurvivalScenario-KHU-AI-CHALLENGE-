import { describe, expect, it } from 'vitest'
import type { CatalogChoice } from '../../domain/catalog'
import type { CoreAction } from '../../domain/actions'
import { makeAction, makeCoreState } from '../../test/core-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { resolveAnswers } from '../../app/questionnaire'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { previewCoreAction, resolveCoreAction } from '../actions'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { assessCatalogChoices, catalogChoices, createCatalogRun, previewCatalogAction } from './runtime'
import { assessChoice } from './assessment'

function choice(action: CoreAction): CatalogChoice {
  return { id: action.id, goalId: 'test', label: '검증', intention: '검증', target: '검증', judgment: null,
    behavior: { kind: 'action', variants: [{ conditions: [], action }] }, successFacts: {}, failureFacts: {} }
}
function assess(state = makeCoreState(), action = makeAction()) {
  const input = { state, action, eventId: action.eventId, phase: 'choice' as const, companionPresent: false, cooperating: false }
  const preview = previewCoreAction(input)
  if (!preview.ok) throw new Error(preview.error.message)
  return { input, assessment: assessChoice(state, { ...preview.value, action, choice: choice(action) }) }
}

describe('일반 추천의 읽기 전용 행동 평가 기반', () => {
  it('잠긴 행동은 평가 후보에서 제외한다', () => {
    expect(assess(makeCoreState({ supply: 0 }), makeAction({ costs: { stamina: 10, supply: 1, medkit: 0 } })).assessment).toBeNull()
  })

  it('실제 판정 확률로 피해/체력/자원을 계산하며 다른 자원을 합산하지 않는다', () => {
    const state = makeCoreState({ injury: 2, supply: 2, medkit: 1, weapon: true })
    const action = makeAction({ costs: { stamina: 10, supply: 1, medkit: 0 },
      successEffects: [{ kind: 'add', stat: 'supply', amount: 2 }],
      failureEffects: [{ kind: 'add', stat: 'injury', amount: 1 }, { kind: 'set-weapon', value: false }] })
    const { assessment: result } = assess(state, action)
    expect(result).not.toBeNull()
    const p = result!.successPercent / 100
    expect(result!.survival.fatalPercent).toBe(100 - result!.successPercent)
    expect(result!.survival.expectedInjury).toBeCloseTo(2 * p + 3 * (1 - p))
    expect(result!.survival.expectedStamina).toBe(60)
    expect(result!.resources.expectedSupply).toBeCloseTo(3 * p + 1 * (1 - p))
    expect(result!.resources.expectedMedkit).toBe(1)
    expect(result!.resources.weaponPercent).toBe(result!.successPercent)
  })

  it('회복 상한·remove-all·치료는 실제 효과 적용과 동일하다', () => {
    const result = assess(makeCoreState({ stamina: 98, supply: 3, medkit: 2, injury: 1 }), makeAction({
      check: null, costs: { stamina: 0, supply: 0, medkit: 1 },
      successEffects: [{ kind: 'add', stat: 'stamina', amount: 10 }, { kind: 'add', stat: 'injury', amount: -1 }, { kind: 'remove-all', resource: 'supply' }], failureEffects: [],
    })).assessment!
    expect(result.outcomes).toHaveLength(1)
    expect(result.survival).toEqual({ fatalPercent: 0, expectedInjury: 0, expectedStamina: 100 })
    expect(result.resources).toEqual({ expectedSupply: 0, expectedMedkit: 1, weaponPercent: 0 })
  })

  it('성공/실패 예상 상태가 실제 실행의 두 결과와 일치한다', () => {
    const { input, assessment } = assess()
    const observed = new Set<string>()
    for (let seed = 1; seed < 100 && observed.size < 2; seed++) {
      const result = resolveCoreAction(input, seed * 1234567)
      if (!result.ok) throw new Error(result.error.message)
      observed.add(result.value.check.outcome)
      expect(assessment!.outcomes.some(outcome => JSON.stringify(outcome.state) === JSON.stringify(result.value.state))).toBe(true)
    }
    expect(observed).toEqual(new Set(['success', 'failure']))
  })

  it('스트레스/장비/체력 조건은 실행 미리보기와 같은 성공률을 사용한다', () => {
    const action = makeAction({ check: { ...makeAction().check!, weaponBonus: true } })
    const weak = assess(makeCoreState({ stress: 90, stamina: 20, weapon: false }), action)
    const prepared = assess(makeCoreState({ stress: 30, stamina: 90, weapon: true }), action)
    expect(prepared.assessment!.successPercent).toBeGreaterThan(weak.assessment!.successPercent)
  })

  it('네 선택과 상태·난수·저장 원문을 바꾸지 않고 복원 뒤 같은 평가를 만든다', () => {
    const pack = readDefaultCatalog()
    const origin = makeOrigin()
    const answers = resolveAnswers(origin.answers)
    if (!answers.ok) throw new Error('설문')
    const run = createCatalogRun(pack, { ...origin, answers: answers.value,
      companion: { name: '동료', trust: 0, traits: { risk: 50, cognition: 50, affect: 50 } } })
    const before = encodeCatalogSave(origin, pack, run)
    const assessed = assessCatalogChoices(pack, run)
    expect(catalogChoices(pack, run)).toHaveLength(4)
    expect(assessed.map(a => a.choice.id)).toEqual(catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed).map(c => c.id))
    expect(encodeCatalogSave(origin, pack, run)).toBe(before)
    expect(assessCatalogChoices(pack, run)).toEqual(assessed)
    const restored = decodeCatalogSave(before, resolveAnswers)
    expect(assessCatalogChoices(restored.pack, restored.run)).toEqual(assessed)
  })
})
