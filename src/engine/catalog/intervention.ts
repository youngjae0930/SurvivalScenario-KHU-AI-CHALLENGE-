import type { CatalogChoice, CatalogContext, CatalogEvent, CompanionContext } from '../../domain/catalog'
import { isIntegerInRange, isRecord, isTraits } from '../../domain/validation'
import { matches } from './conditions'

/** 기획 v1.2 §8.2: 동료가 주인공을 제지할 수 있는 신뢰 경계. */
export const INTERVENTION_TRUST = 40

// ':' is forbidden in authored IDs, so companion commands cannot collide with normal actions.
export const companionChoiceId = (id: string) => `companion:${id}`
export const sourceChoiceId = (id: string) => id.startsWith('companion:') ? id.slice('companion:'.length) : id
export const interventionPolicies = (event: CatalogEvent) => [...(event.intervention ? [event.intervention] : []), ...(event.interventions ?? [])]
export const interventionPolicy = (event: CatalogEvent, groupId: string) => interventionPolicies(event).find(policy => policy.groupId === groupId)
export function asCompanionChoice(choice: CatalogChoice): CatalogChoice {
  return { ...choice, id: companionChoiceId(choice.id), label: `동료와 함께 · ${choice.label}` }
}

export function isCompanionContext(value: unknown): value is CompanionContext {
  if (!isRecord(value) || Object.keys(value).some(key => !['name', 'traits', 'trust', 'judgmentCounts'].includes(key))
    || typeof value.name !== 'string' || !value.name.trim() || value.name.trim() !== value.name || value.name.length > 40
    || !isTraits(value.traits) || !isIntegerInRange(value.trust, 0, 100)) return false
  const counts = value.judgmentCounts
  return counts === undefined || (isRecord(counts) && Object.keys(counts).length === 2 && isIntegerInRange(counts.rescue, 0, 3) && isIntegerInRange(counts.self, 0, 3) && counts.rescue + counts.self <= 3)
}

/** Only opposing-goal intervention. Neutral ranking and ordinary recommendations remain undecided. */
function selectTrustIntervention(event: CatalogEvent, group: CatalogEvent['groups'][number], context: CatalogContext) {
  const policy = interventionPolicy(event, group.id)
  const companion = context.companion
  if (!policy || !companion || policy.groupId !== group.id) return null
  const value = companion.traits[policy.axis]
  // A companion's own designated extreme takes precedence over past judgment counts.
  if (policy.extremePole === 'left' ? value <= (context.extremeBounds?.left ?? 22) : value >= (context.extremeBounds?.right ?? 78)) return null
  const counts = companion.judgmentCounts
  const dominant = counts && counts.rescue + counts.self >= 2 && Math.abs(counts.rescue - counts.self) >= 2
    ? counts.rescue > counts.self ? 'rescue' : 'self' : null
  const useCounts = policy.judgment !== null && dominant !== null
  const opposes = useCounts ? dominant === policy.judgment : policy.extremePole === 'left' ? value > 50 : value < 50
  if (!opposes) return null
  const candidates = policy.alternatives.flatMap(ref => {
    const source = event.groups.find(item => item.id === ref.groupId)!
    const choice = source.choices.find(item => item.id === ref.choiceId)!
    return matches(source.conditions, context) ? [{ source, choice }] : []
  }).sort((a, b) => b.source.priority - a.source.priority || (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0))
  const chosen = candidates[0]
  if (!chosen) return null
  return {
    choice: chosen.choice, replaceChoiceId: policy.replaceChoiceId,
    allowed: companion.trust >= INTERVENTION_TRUST,
    reason: useCounts ? `이전 회차의 유효한 판단 집계(${counts!.rescue}:${counts!.self})를 반영했습니다.` : '동료의 성향이 현재 극단 목표와 다른 방향입니다.',
    source: useCounts ? 'judgment-counts' as const : 'trait' as const,
    text: policy.text,
    lockReason: `동료 신뢰 ${INTERVENTION_TRUST} 이상이 필요합니다. 현재 ${companion.trust}: 당신을 제지할 만큼 신뢰가 쌓이지 않았습니다.`,
  }
}

/** New packs reserve one companion slot; trust never unlocks a player's own opposing goal. */
export function selectIntervention(event: CatalogEvent, group: CatalogEvent['groups'][number], context: CatalogContext) {
  const policy = interventionPolicy(event, group.id)
  if (policy?.mode !== 'companion-choice') return selectTrustIntervention(event, group, context)
  if (!context.companion || policy.groupId !== group.id) return null
  // Reuse the approved trait/count preference, independently of the historical trust gate.
  const opposing = selectTrustIntervention(event, group, { ...context, companion: { ...context.companion, trust: 100 } })
  if (opposing) return { ...opposing, choice: asCompanionChoice(opposing.choice), allowed: true, lockReason: '' }
  // The explicitly designated action is the companion slot, regardless of group size.
  // This does not invent a neutral preference or a new action ranking.
  const choice = group.choices.find(item => item.id === policy.replaceChoiceId)!
  return { choice: asCompanionChoice(choice), replaceChoiceId: policy.replaceChoiceId, allowed: true, lockReason: '',
    reason: '이 선택은 동료와 함께 실행할 수 있습니다.',
    source: 'trait' as const, text: '내가 곁에서 도울게. 함께 움직이자.' }
}
