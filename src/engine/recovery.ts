import type { CoreAction, CoreActionResolution, StateEffect } from '../domain/actions'
import type { CoreState, EngineResult, EventId } from '../domain/types'
import { isIntegerInRange, isRecord, validateCoreState } from '../domain/validation'
import { resolveCoreAction } from './actions'

export interface RecoveryInput {
  readonly state: CoreState
  readonly phase: 'choice' | 'result' | 'ending'
  readonly eventId: EventId
  readonly choice: 'maintain' | 'share' | 'rest'
  readonly treat: boolean
  readonly companionTrust: number | null
}

export interface RecoveryResolution extends CoreActionResolution {
  readonly companionTrust: number | null
  readonly trustDelta: number
}

/** Called after recovery input validation, shared by preview and execution. */
export const recoveryTrustAfter = (trust: number, choice: RecoveryInput['choice']) => Math.min(100, trust + (choice === 'share' ? 10 : 0))

/** Fixed E04/E11 rules. No promise, recommendation or dispatch policy is used. */
export function buildRecoveryAction(input: RecoveryInput): EngineResult<CoreAction> {
  const unavailable = (message: string): EngineResult<never> => ({ ok: false, error: { code: 'action-unavailable', message } })
  if (!isRecord(input) || typeof input.treat !== 'boolean'
    || !['maintain', 'share', 'rest'].includes(input.choice)
    || (input.companionTrust !== null && !isIntegerInRange(input.companionTrust, 0, 100))) {
    return { ok: false, error: { code: 'invalid-action', message: '회복 입력이 올바르지 않습니다.' } }
  }
  const validated = validateCoreState(input.state)
  if (!validated.ok) return validated
  if (input.eventId !== 'E04' && input.eventId !== 'E11') return unavailable('회복은 E04와 E11에서만 가능합니다.')
  const state = validated.value
  const companionPresent = input.companionTrust !== null
  if (input.choice === 'share' && !companionPresent) return unavailable('물자 양보에는 동료가 필요합니다.')
  if (input.choice === 'rest' && companionPresent) return unavailable('추가 휴식은 단독 진행의 대체 선택입니다.')
  if (input.treat && (input.choice !== 'maintain' || state.inventory.medkit < 1 || state.protagonist.injury < 1)) {
    return unavailable('치료는 정비 중 부상이 있고 치료 도구가 있을 때만 가능합니다.')
  }
  const stocked = state.inventory.supply >= 1
  const effects: StateEffect[] = [
    { kind: 'add', stat: 'stamina', amount: input.choice === 'rest' ? 15 : input.choice === 'share' ? 10 : stocked ? 25 : 10 },
    { kind: 'add', stat: 'stress', amount: input.choice === 'rest' ? -10 : input.choice === 'share' ? -5 : stocked ? -15 : -5 },
  ]
  if (input.treat) effects.push({ kind: 'add', stat: 'injury', amount: -1 })
  const action: CoreAction = {
    id: `${input.eventId}.${input.choice}`, eventId: input.eventId,
    requires: input.choice === 'share' ? { supply: 1, companion: true } : input.choice === 'rest' ? { companion: false } : {},
    costs: { stamina: 0, supply: input.choice === 'share' || (input.choice === 'maintain' && stocked) ? 1 : 0, medkit: input.treat ? 1 : 0 },
    check: null, traitDelta: { risk: 0, cognition: 0, affect: 0 }, successEffects: effects, failureEffects: [],
  }
  return { ok: true, value: action }
}

export function resolveRecovery(input: RecoveryInput, rngState: number): EngineResult<RecoveryResolution> {
  const action = buildRecoveryAction(input)
  if (!action.ok) return action
  const result = resolveCoreAction({ state: input.state, action: action.value, phase: input.phase, eventId: input.eventId, companionPresent: input.companionTrust !== null, cooperating: false }, rngState)
  if (!result.ok) return result
  const companionTrust = input.companionTrust === null ? null : recoveryTrustAfter(input.companionTrust, input.choice)
  return {
    ok: true,
    value: { ...result.value, companionTrust, trustDelta: companionTrust === null ? 0 : companionTrust - (input.companionTrust as number) },
  }
}
