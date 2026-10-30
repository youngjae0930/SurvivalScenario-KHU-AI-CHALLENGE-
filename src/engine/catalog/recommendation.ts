import type { CatalogChoice, CatalogEvent } from '../../domain/catalog'
import type { Traits } from '../../domain/types'
import type { ChoiceAssessment } from './assessment'

export type GeneralRecommendation =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'withheld'; readonly reason: 'no-available-choice' | 'resource-tradeoff' | 'equal-or-unknown-pace' }
  | { readonly kind: 'ready'; readonly choice: CatalogChoice; readonly axis: keyof Traits; readonly value: number;
      readonly preferredGoal: boolean; readonly assessment: ChoiceAssessment; readonly basis?: 'representative' }

const paceOrder = { slow: 0, balanced: 1, fast: 2 }
const resourceVector = (item: ChoiceAssessment) => [item.resources.expectedSupply, item.resources.expectedMedkit, item.resources.weaponPercent]
const same = (a: readonly number[], b: readonly number[]) => a.every((value, index) => value === b[index])
const dominates = (a: readonly number[], b: readonly number[]) => a.every((value, index) => value >= b[index]) && a.some((value, index) => value > b[index])

/** User-approved D01 ordering. No RNG, trust gate, judgment-count boost, or invented time cost. */
export function selectGeneralRecommendation(policy: NonNullable<CatalogEvent['recommendation']>, traits: Traits, candidates: readonly ChoiceAssessment[], representativeGoalId?: string): GeneralRecommendation {
  if (!candidates.length) return { kind: 'withheld', reason: 'no-available-choice' }
  const value = traits[policy.axis]
  const preferred = value === 50 ? [] : candidates.filter(item => {
    if (item.choice.behavior.kind === 'escape') return item.choice.behavior.route === (value < 50 ? 'short' : 'detour')
    return value < 50 ? item.traitDelta[policy.axis] < 0 : item.traitDelta[policy.axis] > 0
  })
  const goals = new Set(preferred.map(item => item.choice.goalId))
  // Escape's short/detour choices share one goal ID, so preserve the route distinction.
  let pool = preferred.length ? candidates.filter(item => item.choice.behavior.kind === 'escape' ? preferred.includes(item) : goals.has(item.choice.goalId)) : [...candidates]
  const prefer = (metric: (item: ChoiceAssessment) => number, maximize: boolean) => {
    const best = (maximize ? Math.max : Math.min)(...pool.map(metric))
    pool = pool.filter(item => metric(item) === best)
  }
  prefer(item => item.survival.fatalPercent, false)
  prefer(item => item.survival.expectedInjury, false)
  prefer(item => item.survival.expectedStamina, true)
  pool = pool.filter(item => !pool.some(other => dominates(resourceVector(other), resourceVector(item))))
  if (pool.length > 1 && !pool.every(item => same(resourceVector(item), resourceVector(pool[0])))) {
    return { kind: 'withheld', reason: 'resource-tradeoff' }
  }
  if (pool.length > 1) {
    if (pool.every(item => item.choice.pace !== undefined)) prefer(item => paceOrder[item.choice.pace!], true)
    else if (pool.some(item => item.choice.pace !== undefined)) return { kind: 'withheld', reason: 'equal-or-unknown-pace' }
  }
  if (pool.length > 1 && representativeGoalId) {
    const remembered = pool.filter(item => item.choice.goalId === representativeGoalId)
    if (remembered.length === 1) return { kind: 'ready', choice: remembered[0].choice, axis: policy.axis, value,
      preferredGoal: preferred.length > 0, assessment: remembered[0], basis: 'representative' }
  }
  if (pool.length !== 1) return { kind: 'withheld', reason: 'equal-or-unknown-pace' }
  return { kind: 'ready', choice: pool[0].choice, axis: policy.axis, value, preferredGoal: preferred.length > 0, assessment: pool[0] }
}
