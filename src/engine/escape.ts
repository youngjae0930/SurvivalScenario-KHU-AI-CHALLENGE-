import type { CoreAction, CoreActionResolution } from '../domain/actions'
import type { CoreState, EngineResult, EventId } from '../domain/types'
import { isRecord, validateCoreState } from '../domain/validation'
import { resolveCoreAction } from './actions'

export type EscapeRoute = 'short' | 'detour' | 'request'
export interface EscapeOption {
  readonly route: EscapeRoute
  readonly allowed: boolean
  readonly reasons: readonly string[]
}

export interface EscapeResolution extends CoreActionResolution {
  readonly phase: 'ending'
  readonly ending: 'data-and-escape' | 'escape' | 'escape-failed'
  readonly reason: 'escaped' | 'rescue-wait'
}

export interface EscapeInput {
  readonly state: CoreState
  readonly eventId: EventId
  readonly route: EscapeRoute
  readonly phase: 'choice' | 'result' | 'ending'
}

/** Listed in UI order, not a companion recommendation policy (D01). */
export function getEscapeOptions(state: CoreState): EngineResult<readonly EscapeOption[]> {
  const validated = validateCoreState(state)
  if (!validated.ok) return validated
  const { protagonist: actor, flags } = validated.value
  const shortReasons: string[] = []
  const detourReasons: string[] = []
  if (actor.stamina < 15) shortReasons.push('단거리에는 스태미나 15 이상이 필요합니다.')
  if (actor.injury > 1) shortReasons.push('단거리는 부상 1 이하여야 합니다.')
  if (actor.stamina < 30) detourReasons.push('우회에는 스태미나 30 이상이 필요합니다.')
  if (actor.injury > 2) detourReasons.push('우회는 부상 2 이하여야 합니다.')
  if (!flags.routeKnown) detourReasons.push('우회 경로를 확보하지 못했습니다.')
  const fatal = actor.injury >= 3
  return {
    ok: true,
    value: [
      { route: 'short', allowed: shortReasons.length === 0, reasons: shortReasons },
      { route: 'detour', allowed: detourReasons.length === 0, reasons: detourReasons },
      { route: 'request', allowed: !fatal && shortReasons.length > 0 && detourReasons.length > 0, reasons: fatal ? ['치명 부상으로 회차가 끝났습니다.'] : shortReasons.length === 0 || detourReasons.length === 0 ? ['탈출 가능한 경로가 있습니다.'] : [] },
    ],
  }
}

/** Shared action definition for presentation and execution; eligibility remains getEscapeOptions. */
export function buildEscapeAction(route: EscapeRoute): CoreAction {
  return {
    id: `E12.${route}`, eventId: 'E12',
    requires: route === 'short' ? { stamina: 15, injuryMax: 1 } : route === 'detour' ? { stamina: 30, injuryMax: 2, flags: { routeKnown: true } } : {},
    costs: { stamina: route === 'short' ? 15 : route === 'detour' ? 30 : 0, supply: 0, medkit: 0 },
    check: null, traitDelta: { risk: 0, cognition: 0, affect: 0 }, successEffects: [], failureEffects: [],
  }
}

export function resolveEscape(input: EscapeInput, rngState: number): EngineResult<EscapeResolution> {
  if (!isRecord(input) || input.eventId !== 'E12') {
    return { ok: false, error: { code: 'invalid-action', message: '탈출 경로 판정은 E12에서만 가능합니다.' } }
  }
  const { state, route, phase } = input
  const options = getEscapeOptions(state)
  if (!options.ok) return options
  const validated = validateCoreState(state)
  if (!validated.ok) return validated
  if (phase !== 'choice') return { ok: false, error: { code: 'action-unavailable', message: 'E12 선택 단계에서만 탈출을 결정할 수 있습니다.' } }
  const current = validated.value
  if (current.protagonist.injury >= 3) {
    return { ok: false, error: { code: 'action-unavailable', message: '치명 부상 회차는 E12 선택 화면으로 복원할 수 없습니다.' } }
  }
  const option = options.value.find(item => item.route === route)
  if (!option) return { ok: false, error: { code: 'invalid-action', message: '알 수 없는 탈출 경로입니다.' } }
  if (!option.allowed) return { ok: false, error: { code: 'action-unavailable', message: option.reasons.join(' ') } }
  const action = buildEscapeAction(route)
  const result = resolveCoreAction({ state: current, action, phase, eventId: 'E12', companionPresent: false, cooperating: false }, rngState)
  if (!result.ok) return result
  return {
    ok: true,
    value: {
      ...result.value, phase: 'ending',
      ending: route === 'request' ? 'escape-failed' : current.flags.data ? 'data-and-escape' : 'escape',
      reason: route === 'request' ? 'rescue-wait' : 'escaped',
    },
  }
}
