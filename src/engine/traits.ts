import type { EngineResult, EventId, TraitAxis, TraitBand, TraitPole, Traits } from '../domain/types'
import { isIntegerInRange, isTraits } from '../domain/validation'

export interface TraitBounds { readonly extremeLeft: number; readonly warningLeft: number; readonly warningRight: number; readonly extremeRight: number }
export const originalTraitBounds: TraitBounds = { extremeLeft: 22, warningLeft: 30, warningRight: 70, extremeRight: 78 }
export const relaxedTraitBounds: TraitBounds = { extremeLeft: 15, warningLeft: 25, warningRight: 75, extremeRight: 85 }

export function classifyTrait(value: number, bounds = originalTraitBounds): EngineResult<TraitBand> {
  if (!isIntegerInRange(value, 0, 100)) {
    return { ok: false, error: { code: 'invalid-state', message: '성향은 0~100 정수여야 합니다.' } }
  }
  const band = value <= bounds.extremeLeft ? 'extreme-left'
    : value <= bounds.warningLeft ? 'warning-left'
      : value < bounds.warningRight ? 'normal' : value < bounds.extremeRight ? 'warning-right' : 'extreme-right'
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
