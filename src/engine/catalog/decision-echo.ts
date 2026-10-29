import type { CatalogDecisionMemory, CatalogDecisionSituation, CatalogLegacy, CatalogManifest } from '../../domain/catalog'
import { recoveryTrustAfter } from '../recovery'

export type RememberedDecision = CatalogDecisionMemory['entries'][number]
type EchoPolicy = NonNullable<CatalogManifest['decisionEcho']>

/** Object insertion order and authored option array order are not game conditions. */
function equalData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((value, index) => equalData(value, b[index]))
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && equalData(left[key], right[key]))
}
function comparable(situation: CatalogDecisionSituation) {
  const { traits, stamina, stress, injury } = situation.core.protagonist
  return {
    autonomy: situation.autonomy ?? null,
    commandTrustSufficient: situation.commandTrustSufficient ?? null,
    packId: situation.content.packId, rulesVersion: situation.content.rulesVersion,
    eventId: situation.eventId, locationId: situation.locationId, stage: situation.stage,
    groupId: situation.groupId, sceneScriptId: situation.sceneScriptId,
    protagonist: { traits, stamina, stress, injury }, inventory: situation.core.inventory, flags: situation.core.flags,
    facts: situation.facts, visited: situation.visitedLocationIds,
    options: [...situation.options].sort((a, b) => a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0).map(option => ({
      actionId: option.actionId, goalId: option.goalId, judgment: option.judgment, behavior: option.behavior,
      route: option.route ?? null, pace: option.pace ?? null, action: option.action,
      execution: option.execution ?? null,
      relationship: option.relationship ?? null,
      trustOutcomes: { success: option.trustOutcomes?.success ?? 0, failure: option.trustOutcomes?.failure ?? 0 },
      allowed: option.preview.allowed, check: option.preview.check,
      // Sharing also has a relationship effect outside CoreAction. Compare its actual capped delta.
      trustDelta: !situation.relationship && option.behavior === 'recovery' && option.action.requires.companion === true && situation.companion
        ? recoveryTrustAfter(situation.companion.trust, 'share') - situation.companion.trust : null,
    })),
  }
}
export function sameDecisionSituation(policy: EchoPolicy, previous: CatalogDecisionSituation, current: CatalogDecisionSituation): boolean {
  return policy.compatibleRevisions.includes(previous.content.revision) && policy.compatibleRevisions.includes(current.content.revision)
    && equalData(comparable(previous), comparable(current))
}

/** Never substitutes an alias/source action, opens a hidden choice, or draws a success roll. */
export function findRememberedDecision(policy: EchoPolicy, legacy: CatalogLegacy | undefined, current: CatalogDecisionSituation,
  canRepeat: (entry: RememberedDecision) => boolean): RememberedDecision | null {
  const matches = legacy?.decisionMemory?.entries.filter(entry => sameDecisionSituation(policy, entry.context, current) && canRepeat(entry)) ?? []
  const first = matches[0]
  return first && matches.every(entry => entry.actionId === first.actionId && entry.treat === first.treat
    && entry.context.executionActor === first.context.executionActor) ? first : null
}

/** A representative affects only this event's goal; generic IDs do not leak across unrelated events. */
export function representativeGoal(policy: EchoPolicy, legacy: CatalogLegacy | undefined, current: CatalogDecisionSituation): string | undefined {
  if (!legacy?.decisionMemory || !policy.compatibleRevisions.includes(legacy.contentRevision) || !policy.compatibleRevisions.includes(current.content.revision)) return undefined
  const actionId = Object.entries(legacy.representativeActions).find(([eventId]) => eventId === current.eventId)?.[1]
  const entry = legacy.decisionMemory.entries.find(item => item.eventId === current.eventId && item.actionId === actionId)
  if (!entry || entry.context.content.packId !== current.content.packId || entry.context.content.rulesVersion !== current.content.rulesVersion) return undefined
  return entry.context.options.find(option => option.actionId === entry.actionId)?.goalId
}

export const equalRememberedAction = equalData
