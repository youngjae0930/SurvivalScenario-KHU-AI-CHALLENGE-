import type { CoreAction, CoreActionInput, CoreActionPreview, CoreActionResolution, StateEffect } from '../domain/actions'
import type { EngineResult } from '../domain/types'
import { isIntegerInRange, isRecord, validateCoreState } from '../domain/validation'
import { applyStateEffects, isStateEffect } from './effects'
import { isRiskCheck, previewCheck, resolveCheck } from './probability'

export function isCoreAction(value: unknown): value is CoreAction {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0
    || typeof value.eventId !== 'string' || !/^E(0[1-9]|1[0-2])$/.test(value.eventId)
    || !isRecord(value.requires) || !isRecord(value.costs) || !isRecord(value.traitDelta)
    || !Array.isArray(value.successEffects) || !Array.isArray(value.failureEffects)) return false
  if (!Array.from(value.successEffects).every(isStateEffect) || !Array.from(value.failureEffects).every(isStateEffect)
    || !['risk', 'cognition', 'affect'].every(key => Number.isSafeInteger((value.traitDelta as Record<string, unknown>)[key]))) return false
  if ([...value.successEffects, ...value.failureEffects].some(effect => effect.kind === 'add' && ['risk', 'cognition', 'affect'].includes(effect.stat))) return false
  if (value.eventId !== 'E02' && [...value.successEffects, ...value.failureEffects].some(effect => effect.kind === 'set-rescue-decision')) return false
  if (value.check === null ? value.failureEffects.length !== 0 : !isRiskCheck(value.check)) return false
  const costs = value.costs
  if (Object.keys(costs).some(key => !['stamina', 'supply', 'medkit'].includes(key))
    || !['stamina', 'supply', 'medkit'].every(key => isIntegerInRange(costs[key], 0, Number.MAX_SAFE_INTEGER))) return false
  const req = value.requires
  for (const key of Object.keys(req)) {
    if (key === 'stamina' || key === 'supply' || key === 'medkit' || key === 'injuryMax') {
      const max = key === 'stamina' ? 100 : key === 'medkit' ? 2 : 3
      if (!isIntegerInRange(req[key], 0, max)) return false
    } else if (key === 'weapon' || key === 'companion') {
      if (typeof req[key] !== 'boolean') return false
    } else if (key === 'flags') {
      if (!isRecord(req.flags) || Object.entries(req.flags).some(([flag, flagValue]) => !['access', 'data', 'helpEstablished', 'routeKnown'].includes(flag) || typeof flagValue !== 'boolean')) return false
    } else return false
  }
  return true
}

/** Physical requirements only; protagonist extremes/trust access are a later layer. */
export function previewCoreAction(input: CoreActionInput): EngineResult<CoreActionPreview> {
  if (!isRecord(input) || !isCoreAction(input.action)
    || !['choice', 'result', 'ending'].includes(input.phase)
    || typeof input.eventId !== 'string' || !/^E(0[1-9]|1[0-2])$/.test(input.eventId)
    || typeof input.companionPresent !== 'boolean' || typeof input.cooperating !== 'boolean'
    || (input.cooperating && !input.companionPresent)) {
    return { ok: false, error: { code: 'invalid-action', message: '행동/동료 입력 또는 효과 데이터가 올바르지 않습니다.' } }
  }
  const stateResult = validateCoreState(input.state)
  if (!stateResult.ok) return stateResult
  const { protagonist: actor, inventory, flags } = stateResult.value
  const { requires: req, costs } = input.action
  const check = previewCheck({ state: stateResult.value, eventId: input.action.eventId, check: input.action.check, cooperating: input.cooperating })
  if (!check.ok) return check
  const reasons: string[] = []
  if (input.phase !== 'choice') reasons.push('선택 단계에서만 행동할 수 있습니다.')
  if (input.eventId !== input.action.eventId) reasons.push('현재 사건의 행동이 아닙니다.')
  if (actor.injury >= 3) reasons.push('치명 부상으로 회차가 끝났습니다.')
  if (req.stamina !== undefined && actor.stamina < req.stamina) reasons.push(`스태미나 ${req.stamina} 이상이 필요합니다.`)
  if (inventory.supply < Math.max(req.supply ?? 0, costs.supply)) reasons.push('필요한 공용 물자가 부족합니다.')
  if (inventory.medkit < Math.max(req.medkit ?? 0, costs.medkit)) reasons.push('필요한 치료 도구가 부족합니다.')
  if (req.injuryMax !== undefined && actor.injury > req.injuryMax) reasons.push(`부상 ${req.injuryMax} 이하여야 합니다.`)
  if (req.weapon !== undefined && inventory.weapon !== req.weapon) reasons.push('무기 보유 조건을 충족하지 않습니다.')
  if (req.companion !== undefined && input.companionPresent !== req.companion) reasons.push('동료 동행 조건을 충족하지 않습니다.')
  if (req.flags) for (const [flag, value] of Object.entries(req.flags)) {
    if (flags[flag as keyof typeof req.flags] !== value) reasons.push(`${flag} 조건을 충족하지 않습니다.`)
  }
  if (reasons.length === 0) {
    const success = applyStateEffects(input.state, [...commonEffects(input.action), ...input.action.successEffects])
    if (!success.ok) return success
    if (input.action.check !== null) {
      const failure = applyStateEffects(input.state, [...commonEffects(input.action), ...input.action.failureEffects])
      if (!failure.ok) return failure
    }
  }
  return { ok: true, value: { allowed: reasons.length === 0, reasons, check: check.value } }
}

/** Shared by execution and read-only outcome assessment; no random draw. */
export function commonEffects(action: CoreAction): StateEffect[] {
  return [
    { kind: 'add', stat: 'stamina', amount: -action.costs.stamina },
    { kind: 'add', stat: 'supply', amount: -action.costs.supply },
    { kind: 'add', stat: 'medkit', amount: -action.costs.medkit },
    { kind: 'add', stat: 'risk', amount: action.traitDelta.risk },
    { kind: 'add', stat: 'cognition', amount: action.traitDelta.cognition },
    { kind: 'add', stat: 'affect', amount: action.traitDelta.affect },
  ]
}

export function resolveCoreAction(input: CoreActionInput, rngState: number): EngineResult<CoreActionResolution> {
  const preview = previewCoreAction(input)
  if (!preview.ok) return preview
  if (!preview.value.allowed) return { ok: false, error: { code: 'action-unavailable', message: preview.value.reasons.join(' ') } }
  const action = input.action
  const shared = commonEffects(action)
  // Validate both reachable branches before drawing, including conflicting effects.
  const success = applyStateEffects(input.state, [...shared, ...action.successEffects])
  if (!success.ok) return success
  const failure = action.check === null ? success : applyStateEffects(input.state, [...shared, ...action.failureEffects])
  if (!failure.ok) return failure
  const check = resolveCheck({ state: input.state, eventId: action.eventId, check: action.check, cooperating: input.cooperating }, rngState)
  if (!check.ok) return check
  return {
    ok: true,
    value: {
      ...(check.value.outcome === 'failure' ? failure.value : success.value),
      phase: (check.value.outcome === 'failure' ? failure.value : success.value).fatal ? 'ending' : 'result',
      actionId: action.id, eventId: action.eventId, check: check.value,
    },
  }
}
