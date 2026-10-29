import type { CatalogChoice, CatalogHistory, CompanionContext } from '../../domain/catalog'
import type { CoreState } from '../../domain/types'
import { relationshipBalance as balance } from '../../content/rules/relationship'
import { relationshipCopy as copy } from '../../content/texts/relationship'

export type TrustChange = NonNullable<CatalogHistory['trustChange']>

/** Actual capped state differences plus explicitly authored narrative consequences.
 * No recommendation comparison, new roll, action-ID branch or trait-change reward.
 */
export function evaluateRelationship(before: CoreState, after: CoreState, companion: CompanionContext,
  choice: CatalogChoice, outcome: 'success' | 'failure', escaped = false): TrustChange {
  const safety = 0.75 + companion.traits.risk / 200
  const conservation = 0.75 + (100 - companion.traits.cognition) / 200
  const parts: { score: number; reason: string }[] = []
  const add = (score: number, reason: string) => { if (score !== 0) parts.push({ score, reason }) }
  const a = before.protagonist, b = after.protagonist
  add((b.stamina - a.stamina) / balance.staminaUnit * safety, copy.stamina)
  add((a.stress - b.stress) / balance.stressUnit * safety, copy.stress)
  add((a.injury - b.injury) * balance.injuryUnit * safety, copy.injury)
  add((after.inventory.supply - before.inventory.supply) * balance.supplyUnit * conservation, copy.supply)
  add((after.inventory.medkit - before.inventory.medkit) * balance.medkitUnit * conservation, copy.medkit)
  add((Number(after.inventory.weapon) - Number(before.inventory.weapon)) * balance.weaponUnit * conservation, copy.weapon)
  for (const flag of ['access', 'data', 'helpEstablished', 'routeKnown'] as const) {
    add((Number(after.flags[flag]) - Number(before.flags[flag])) * balance.flagUnit[flag] * conservation, copy[flag])
  }
  for (const impact of choice.relationship?.[outcome] ?? []) {
    const preference = impact.kind === 'value' ? (companion.traits[impact.axis] - 50) / 50 * (impact.pole === 'right' ? 1 : -1) : 1
    add(impact.magnitude * preference, impact.reason)
  }
  if (escaped) add(balance.escaped, copy.escape)
  if (b.injury >= 3) add(balance.fatal, copy.fatal)
  const score = parts.reduce((sum, part) => sum + part.score, 0)
  // Symmetric rounding; Math.round alone would treat -0.5 differently from +0.5.
  const delta = Math.max(-balance.maxChange, Math.min(balance.maxChange, Math.sign(score) * Math.round(Math.abs(score))))
  const afterTrust = Math.max(0, Math.min(100, companion.trust + delta))
  const reason = score >= 0.5 ? copy.positive : score <= -0.5 ? copy.negative : copy.balanced
  return { before: companion.trust, after: afterTrust,
    reason: `${reason}${parts.length ? ` ${copy.details}: ${[...new Set(parts.map(part => `${part.reason}(${part.score > 0 ? copy.benefit : copy.loss})`))].join(' · ')}.` : ''}` }
}
