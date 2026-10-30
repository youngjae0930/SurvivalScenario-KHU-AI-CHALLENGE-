import type { AppliedEffects, CoreAction, StateEffect } from '../../domain/actions'
import type { CatalogRun, CompanionVitals } from '../../domain/catalog'
import type { CoreState } from '../../domain/types'
import { commonEffects } from '../actions'
import { applyStateEffects } from '../effects'

export interface CompanionProjection extends AppliedEffects {
  readonly companionVitals: CompanionVitals
  readonly companionChanges: AppliedEffects['changes']
}
const physical = (effect: StateEffect) => effect.kind === 'add' && ['stamina', 'stress', 'injury'].includes(effect.stat)
const value = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
export function companionActorState(run: CatalogRun): CoreState {
  if (!run.companion || !run.companionVitals) throw new Error('동료의 개별 상태가 없습니다.')
  return { ...run.core, protagonist: { name: run.companion.name, traits: run.companion.traits, ...run.companionVitals } }
}
/** Physical effects belong to the actor; supplies, story flags and the player's decision traits stay on the run. */
export function projectCompanionAction(run: CatalogRun, action: CoreAction, outcome: 'success' | 'failure'): CompanionProjection {
  const effects = [...commonEffects(action), ...(outcome === 'success' ? action.successEffects : action.failureEffects)]
  const player = value(applyStateEffects(run.core, effects.filter(effect => !physical(effect))))
  const actor = value(applyStateEffects(companionActorState(run), effects.filter(physical)))
  const { stamina, stress, injury } = actor.state.protagonist
  return { ...player, companionVitals: { stamina, stress, injury }, companionChanges: actor.changes }
}
