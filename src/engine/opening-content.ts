import rawRules from '../content/rules/opening.json'
import legacyRules from '../content/rules/opening-v1.json'
import type { CoreAction } from '../domain/actions'
import type { OpeningContentRevision, OpeningEventId } from '../domain/opening'
import type { EngineResult } from '../domain/types'
import { isRecord } from '../domain/validation'
import { isCoreAction } from './actions'

type Variant = { readonly when: 'always' | 'supply-present' | 'supply-empty'; readonly action: CoreAction }
export type OpeningChoice =
  | { readonly id: string; readonly kind: 'fixed'; readonly judgment: 'rescue' | 'self' | null; readonly variants: readonly Variant[] }
  | { readonly id: string; readonly kind: 'recovery'; readonly judgment: null; readonly choice: 'maintain' | 'rest' }
export interface OpeningEvent {
  readonly id: OpeningEventId
  readonly nextEventId: 'E02' | 'E03' | 'E04' | 'E05' | 'E06' | 'E07'
  readonly choices: readonly OpeningChoice[]
}
export interface OpeningRules {
  readonly rulesVersion: '1.2-stress-1'
  readonly contentRevision: OpeningContentRevision
  readonly events: readonly OpeningEvent[]
}
export const CURRENT_OPENING_CONTENT = 'hospital-core-stress-2' as const
export const LEGACY_OPENING_CONTENT = 'opening-core-stress-1' as const
export const OPENING_EVENT_IDS = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06'] as const
export function openingEventIds(revision: OpeningContentRevision): readonly OpeningEventId[] {
  return revision === LEGACY_OPENING_CONTENT ? OPENING_EVENT_IDS.slice(0, 4) : OPENING_EVENT_IDS
}
export function openingGoalId(actionId: string): string {
  const goals: Record<string, string> = {
    'E05.explore': 'clear', 'E05.bypass': 'bypass', 'E05.rush': 'clear', 'E05.tools': 'clear',
    'E06.withdraw': 'withdraw', 'E06.salvage': 'salvage', 'E06.abandon': 'withdraw', 'E06.defend': 'withdraw',
  }
  return goals[actionId] ?? actionId
}

/** Closed JSON vocabulary: no executable predicates, missing defaults or story text. */
export function parseOpeningRules(value: unknown): EngineResult<OpeningRules> {
  const invalid = (): EngineResult<never> => ({ ok: false, error: { code: 'invalid-action', message: '초반 사건 콘텐츠 형식·순서·행동 참조가 올바르지 않습니다.' } })
  if (!isRecord(value) || value.rulesVersion !== '1.2-stress-1'
    || (value.contentRevision !== LEGACY_OPENING_CONTENT && value.contentRevision !== CURRENT_OPENING_CONTENT)) return invalid()
  const ids = openingEventIds(value.contentRevision)
  if (!Array.isArray(value.events) || value.events.length !== ids.length) return invalid()
  const nextIds = ['E02', 'E03', 'E04', 'E05', 'E06', 'E07']
  const choiceIds = [['E01.safe', 'E01.shortcut'], ['E02.help', 'E02.supplies'], ['E03.observe', 'E03.cross'], ['E04.maintain', 'E04.rest'], ['E05.explore', 'E05.bypass', 'E05.rush', 'E05.tools'], ['E06.withdraw', 'E06.salvage', 'E06.abandon', 'E06.defend']]
  for (const [index, event] of value.events.entries()) {
    if (!isRecord(event) || event.id !== ids[index] || event.nextEventId !== nextIds[index]
      || !Array.isArray(event.choices) || event.choices.length !== choiceIds[index].length) return invalid()
    for (const [choiceIndex, choice] of event.choices.entries()) {
      if (!isRecord(choice) || choice.id !== choiceIds[index][choiceIndex]) return invalid()
      const judgment = choice.id === 'E02.help' ? 'rescue' : choice.id === 'E02.supplies' ? 'self' : null
      if (choice.judgment !== judgment) return invalid()
      if (event.id === 'E04') {
        if (choice.kind !== 'recovery' || choice.choice !== (choiceIndex === 0 ? 'maintain' : 'rest')) return invalid()
      } else {
        const conditions = choice.id === 'E02.help' ? ['supply-present', 'supply-empty'] : ['always']
        if (choice.kind !== 'fixed' || !Array.isArray(choice.variants) || choice.variants.length !== conditions.length) return invalid()
        for (const [variantIndex, variant] of choice.variants.entries()) {
          if (!isRecord(variant) || variant.when !== conditions[variantIndex] || !isCoreAction(variant.action)
            || variant.action.id !== choice.id || variant.action.eventId !== event.id) return invalid()
        }
      }
    }
  }
  // The complete nested shape and references were checked above; copy so callers cannot alter the imported JSON.
  return { ok: true, value: structuredClone(value) as unknown as OpeningRules }
}

export function getOpeningRules(revision: OpeningContentRevision = CURRENT_OPENING_CONTENT): EngineResult<OpeningRules> {
  return parseOpeningRules(revision === LEGACY_OPENING_CONTENT ? legacyRules : rawRules)
}
