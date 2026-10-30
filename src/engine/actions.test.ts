import { describe, expect, it } from 'vitest'
import type { CoreActionInput } from '../domain/actions'
import { makeAction, makeCoreState } from '../test/core-fixtures'
import { previewCoreAction, resolveCoreAction } from './actions'

function input(overrides: Partial<CoreActionInput> = {}): CoreActionInput {
  return { state: makeCoreState(), action: makeAction(), phase: 'choice', eventId: 'E05', companionPresent: false, cooperating: false, ...overrides }
}

describe('선택 비용과 성패 결과', () => {
  it('성공/실패 손실과 의도한 성향 변화를 함께 적용한다', () => {
    const success = resolveCoreAction(input(), 1)
    const failure = resolveCoreAction(input(), 1495045943)
    expect(success).toMatchObject({ ok: true, value: {
      phase: 'result', check: { outcome: 'success' },
      state: { protagonist: { stamina: 60, stress: 30, injury: 0, traits: { risk: 42 } }, flags: { access: true } },
    } })
    expect(failure).toMatchObject({ ok: true, value: {
      phase: 'result', check: { outcome: 'failure' },
      state: { protagonist: { stamina: 60, stress: 40, injury: 1, traits: { risk: 42 } }, flags: { access: false } },
    } })
  })

  it('비용을 빼기 전 상태로 미리보기와 실행 확률을 계산한다', () => {
    const actionInput = input({ state: makeCoreState({ stamina: 20 }) })
    expect(previewCoreAction(actionInput)).toMatchObject({ ok: true, value: { check: { kind: 'probability', probability: { percent: 65 } } } })
    expect(resolveCoreAction(actionInput, 1)).toMatchObject({ ok: true, value: { check: { probability: { percent: 65 } }, state: { protagonist: { stamina: 10 } } } })
  })

  it('스태미나 0의 부담형은 허용하지만 최소치가 있는 준비형은 잠근다', () => {
    const burden = input({ state: makeCoreState({ stamina: 0, stress: 100, supply: 0, medkit: 0, injury: 2 }) })
    expect(previewCoreAction(burden)).toMatchObject({ ok: true, value: { allowed: true } })
    expect(resolveCoreAction(burden, 1)).toMatchObject({ ok: true, value: { state: { protagonist: { stamina: 0 } } } })
    expect(previewCoreAction({ ...burden, action: makeAction({ requires: { stamina: 10 } }) })).toMatchObject({ ok: true, value: { allowed: false } })
  })

  it('성공 보상으로 선택 비용을 선지급할 수 없다', () => {
    const state = makeCoreState({ supply: 0 })
    const actionInput = input({ state, action: makeAction({
      costs: { stamina: 10, supply: 1, medkit: 0 }, successEffects: [{ kind: 'add', stat: 'supply', amount: 1 }],
    }) })
    expect(previewCoreAction(actionInput)).toMatchObject({ ok: true, value: { allowed: false } })
    expect(resolveCoreAction(actionInput, 1)).toMatchObject({ ok: false, error: { code: 'action-unavailable' } })
    expect(state.inventory.supply).toBe(0)
  })

  it('최종 치명 부상은 종료 단계로 전환한다', () => {
    const result = resolveCoreAction(input({ state: makeCoreState({ injury: 2 }) }), 1495045943)
    expect(result).toMatchObject({ ok: true, value: { phase: 'ending', fatal: true, state: { protagonist: { injury: 3 } } } })
  })

  it('안정 극단의 확정 철수는 전량 포기와 회복을 적용하고 난수를 쓰지 않는다', () => {
    const state = makeCoreState({ supply: 2, injury: 1 })
    const action = makeAction({
      id: 'E06.withdraw-test', eventId: 'E06', costs: { stamina: 5, supply: 0, medkit: 0 },
      check: null, traitDelta: { risk: 8, cognition: 0, affect: 0 }, failureEffects: [],
      successEffects: [{ kind: 'remove-all', resource: 'supply' }, { kind: 'add', stat: 'stress', amount: -10 }, { kind: 'add', stat: 'injury', amount: -1 }],
    })
    expect(resolveCoreAction(input({ eventId: 'E06', state, action }), 1)).toMatchObject({ ok: true, value: {
      check: { outcome: 'certain', rngState: 1, roll: null },
      state: { protagonist: { stamina: 65, stress: 20, injury: 0, traits: { risk: 58 } }, inventory: { supply: 0 } },
    } })
  })

  it.each([
    { phase: 'result' }, { phase: 'ending' }, { eventId: 'E04' },
    { state: makeCoreState({ injury: 3 }) },
    { action: makeAction({ requires: { weapon: true } }) },
    { action: makeAction({ requires: { companion: true } }) },
    { action: makeAction({ requires: { flags: { access: true } } }) },
  ] as const)('현재 단계/사건/요구조건이 맞지 않으면 실행하지 않는다: %#', overrides => {
    expect(resolveCoreAction(input(overrides), 1)).toMatchObject({ ok: false, error: { code: 'action-unavailable' } })
  })

  it('미리보기에서부터 잘못된 효과와 성패별 성향 변경을 거부한다', () => {
    const conflicting = input({ action: makeAction({ successEffects: [{ kind: 'remove-all', resource: 'supply' }, { kind: 'add', stat: 'supply', amount: 1 }] }) })
    expect(previewCoreAction(conflicting).ok).toBe(false)
    expect(previewCoreAction(input({ action: makeAction({ failureEffects: [{ kind: 'add', stat: 'risk', amount: 8 }] }) })).ok).toBe(false)
    expect(previewCoreAction(input({ action: makeAction({ successEffects: Array(1) }) })).ok).toBe(false)
  })

  it('E09 등 다른 사건에서 E02의 구조 판단을 덮어쓰지 않는다', () => {
    expect(previewCoreAction(input({ eventId: 'E09', action: makeAction({ eventId: 'E09', successEffects: [{ kind: 'set-rescue-decision', value: 'self' }] }) })).ok).toBe(false)
  })

  it('실패 부상과 같은 행동의 회복을 합산해 치명 종료를 판단한다', () => {
    const action = makeAction({ failureEffects: [{ kind: 'add', stat: 'injury', amount: 1 }, { kind: 'add', stat: 'injury', amount: -1 }] })
    expect(resolveCoreAction(input({ state: makeCoreState({ injury: 2 }), action }), 1495045943)).toMatchObject({ ok: true, value: {
      phase: 'result', fatal: false, check: { outcome: 'failure' }, state: { protagonist: { injury: 2 } },
    } })
  })

  it('같은 입력의 결과는 같고 원본 상태/행동을 변경하지 않는다', () => {
    const actionInput = input()
    const before = structuredClone(actionInput)
    expect(resolveCoreAction(actionInput, 1)).toEqual(resolveCoreAction(actionInput, 1))
    expect(actionInput).toEqual(before)
  })
})
