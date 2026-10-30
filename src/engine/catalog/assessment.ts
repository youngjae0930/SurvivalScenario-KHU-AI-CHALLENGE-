import type { CatalogChoice } from '../../domain/catalog'
import type { AppliedEffects, CoreAction, CoreActionPreview } from '../../domain/actions'
import type { CoreState } from '../../domain/types'
import { commonEffects } from '../actions'
import { applyStateEffects } from '../effects'

/** Facts available before choosing. No ranking, hidden roll, or future scene lookup. */
export interface ChoiceAssessment {
  readonly choice: CatalogChoice
  readonly traitDelta: CoreAction['traitDelta']
  readonly successPercent: number
  readonly outcomes: readonly { readonly outcome: 'success' | 'failure'; readonly percent: number; readonly state: CoreState; readonly fatal: boolean }[]
  readonly survival: {
    readonly fatalPercent: number
    readonly expectedInjury: number
    readonly expectedStamina: number
  }
  readonly resources: {
    readonly expectedSupply: number
    readonly expectedMedkit: number
    readonly weaponPercent: number
  }
}

/** Locked choices are not candidates. Resource caps and effect semantics match execution. */
export function assessChoice(state: CoreState, preview: CoreActionPreview & { readonly action: CoreAction; readonly choice: CatalogChoice; readonly infectionDeathsOnFailure?: readonly { readonly subject: string }[];
  readonly companionOutcomes?: Readonly<Partial<Record<'success' | 'failure', AppliedEffects>>> }): ChoiceAssessment | null {
  if (!preview.allowed) return null
  const successPercent = preview.check.kind === 'certain' ? 100 : preview.check.probability.percent
  const branches = [
    { outcome: 'success' as const, percent: successPercent, effects: preview.action.successEffects },
    { outcome: 'failure' as const, percent: 100 - successPercent, effects: preview.action.failureEffects },
  ].filter(branch => branch.percent > 0)
  const outcomes = branches.map(branch => {
    const companion = preview.companionOutcomes?.[branch.outcome]
    const projected = companion ? { ok: true as const, value: companion } : applyStateEffects(state, [...commonEffects(preview.action), ...branch.effects])
    if (!projected.ok) throw new Error(projected.error.message)
    return { outcome: branch.outcome, percent: branch.percent, state: projected.value.state, fatal: projected.value.fatal
      || (branch.outcome === 'failure' && !!preview.infectionDeathsOnFailure?.some(death => death.subject === 'protagonist')) }
  })
  const expected = (value: (state: CoreState) => number) => outcomes.reduce((sum, outcome) => sum + outcome.percent * value(outcome.state), 0) / 100
  return {
    choice: preview.choice, traitDelta: preview.action.traitDelta, successPercent, outcomes,
    survival: {
      fatalPercent: outcomes.reduce((sum, outcome) => sum + (outcome.fatal ? outcome.percent : 0), 0),
      expectedInjury: expected(state => state.protagonist.injury),
      expectedStamina: expected(state => state.protagonist.stamina),
    },
    resources: {
      expectedSupply: expected(state => state.inventory.supply),
      expectedMedkit: expected(state => state.inventory.medkit),
      weaponPercent: expected(state => state.inventory.weapon ? 100 : 0),
    },
  }
}
