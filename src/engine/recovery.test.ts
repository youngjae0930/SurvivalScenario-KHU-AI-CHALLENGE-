import { describe, expect, it } from 'vitest'
import { makeCoreState } from '../test/core-fixtures'
import { resolveRecovery } from './recovery'
import type { RecoveryInput } from './recovery'

function input(overrides: Partial<RecoveryInput> = {}): RecoveryInput {
  return { state: makeCoreState(), phase: 'choice', eventId: 'E04', choice: 'maintain', treat: false, companionTrust: null, ...overrides }
}

describe('휴식·정비·치료', () => {
  it.each(['E04', 'E11'] as const)('%s 정비는 물자1을 쓰고 스태미나25 회복/스트레스15 감소를 적용한다', eventId => {
    expect(resolveRecovery(input({ eventId }), 1)).toMatchObject({ ok: true, value: {
      phase: 'result', state: { protagonist: { stamina: 95, stress: 15 }, inventory: { supply: 0 } },
      check: { outcome: 'certain', rngState: 1, roll: null },
    } })
  })

  it('물자 없이도 정비해 스태미나10 회복/스트레스5 감소를 적용한다', () => {
    expect(resolveRecovery(input({ state: makeCoreState({ supply: 0, stamina: 0, stress: 100 }) }), 1)).toMatchObject({ ok: true, value: {
      state: { protagonist: { stamina: 10, stress: 95 }, inventory: { supply: 0 } },
    } })
  })

  it('치료를 확인한 정비만 치료도구1을 쓰고 부상1을 회복한다', () => {
    const request = input({ state: makeCoreState({ supply: 0, injury: 2 }), treat: true })
    expect(resolveRecovery(request, 1)).toMatchObject({ ok: true, value: {
      state: { protagonist: { stamina: 80, stress: 25, injury: 1 }, inventory: { supply: 0, medkit: 0 } },
    } })
    expect(resolveRecovery({ ...request, treat: false }, 1)).toMatchObject({ ok: true, value: { state: { protagonist: { injury: 2 }, inventory: { medkit: 1 } } } })
  })

  it('동료에게 양보하면 물자를 소비하고 신뢰가 회복된다', () => {
    expect(resolveRecovery(input({ choice: 'share', companionTrust: 50 }), 1)).toMatchObject({ ok: true, value: {
      companionTrust: 60, trustDelta: 10,
      state: { protagonist: { stamina: 80, stress: 25 }, inventory: { supply: 0, medkit: 1 } },
    } })
    expect(resolveRecovery(input({ choice: 'share', companionTrust: 95 }), 1)).toMatchObject({ ok: true, value: { companionTrust: 100, trustDelta: 5 } })
  })

  it('단독 추가 휴식은 물자를 쓰지 않고 스태미나15 회복/스트레스10 감소를 적용한다', () => {
    expect(resolveRecovery(input({ choice: 'rest' }), 1)).toMatchObject({ ok: true, value: {
      state: { protagonist: { stamina: 85, stress: 20 }, inventory: { supply: 1, medkit: 1 } },
      companionTrust: null, trustDelta: 0,
    } })
  })

  it.each([
    { eventId: 'E03' }, { phase: 'result' }, { phase: 'ending' },
    { choice: 'share' }, { choice: 'rest', companionTrust: 50 },
    { choice: 'share', companionTrust: 50, state: makeCoreState({ supply: 0 }) },
    { treat: true }, { treat: true, state: makeCoreState({ injury: 1, medkit: 0 }) },
    { choice: 'share', companionTrust: 50, treat: true, state: makeCoreState({ injury: 1 }) },
    { state: makeCoreState({ injury: 3 }) },
  ] as const)('다른 사건·조건 미달·선택 조합은 회복하지 않는다: %#', overrides => {
    const request = input(overrides)
    const before = structuredClone(request)
    expect(resolveRecovery(request, 1)).toMatchObject({ ok: false, error: { code: 'action-unavailable' } })
    expect(request).toEqual(before)
  })

  it('결과 단계로 바뀐 상태로 같은 회복을 다시 요청하면 거부한다', () => {
    const first = resolveRecovery(input(), 1)
    if (!first.ok) throw new Error(first.error.message)
    const again = resolveRecovery(input({ state: first.value.state, phase: first.value.phase }), first.value.check.rngState)
    expect(again).toMatchObject({ ok: false, error: { code: 'action-unavailable' } })
  })
})
