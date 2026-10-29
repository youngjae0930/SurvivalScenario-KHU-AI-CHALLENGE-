import type { EngineResult, EventId, TraitAxis, TraitBand, TraitPole, Traits } from '../domain/types'
import { isIntegerInRange, isTraits } from '../domain/validation'

export function classifyTrait(value: number): EngineResult<TraitBand> {
  if (!isIntegerInRange(value, 0, 100)) {
    return { ok: false, error: { code: 'invalid-state', message: '성향은 0~100 정수여야 합니다.' } }
  }
  const band = value <= 22 ? 'extreme-left'
    : value <= 30 ? 'warning-left'
      : value < 70 ? 'normal' : value < 78 ? 'warning-right' : 'extreme-right'
  return { ok: true, value: band }
}

const extremeEvents: Partial<Record<EventId, { readonly axis: TraitAxis; readonly pole: TraitPole }>> = {
  E05: { axis: 'risk', pole: 'left' }, E06: { axis: 'risk', pole: 'right' },
  E07: { axis: 'cognition', pole: 'left' }, E08: { axis: 'cognition', pole: 'right' },
  E09: { axis: 'affect', pole: 'left' }, E10: { axis: 'affect', pole: 'right' },
}

/** Context is explicit: the E07 exterior never triggers the analysis extreme. */
export function getTriggeredExtreme(
  eventId: EventId, traits: Traits, access: boolean,
): EngineResult<{ readonly axis: TraitAxis; readonly pole: TraitPole } | null> {
  if (typeof eventId !== 'string' || !/^E(0[1-9]|1[0-2])$/.test(eventId) || !isTraits(traits) || typeof access !== 'boolean') {
    return { ok: false, error: { code: 'invalid-state', message: '사건·성향·접근 맥락이 올바르지 않습니다.' } }
  }
  if (eventId === 'E07' && !access) return { ok: true, value: null }
  const trigger = extremeEvents[eventId]
  if (!trigger) return { ok: true, value: null }
  const value = traits[trigger.axis]
  return { ok: true, value: (trigger.pole === 'left' ? value <= 22 : value >= 78) ? { ...trigger } : null }
}
