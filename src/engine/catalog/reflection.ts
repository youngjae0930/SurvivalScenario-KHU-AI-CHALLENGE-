import type { CatalogRun } from '../../domain/catalog'
import type { Traits } from '../../domain/types'
import { originalTraitBounds } from '../traits'

const axes = ['risk', 'cognition', 'affect'] as const

/** Reconstruct only recorded trait values. No missing old state or choice is invented. */
export function catalogInitialTraits(run: CatalogRun): Traits {
  const initial = { ...run.core.protagonist.traits }
  for (const entry of [...run.history].reverse()) {
    for (const change of [...entry.resolution.changes].reverse()) {
      if (change.kind === 'number' && (change.field === 'risk' || change.field === 'cognition' || change.field === 'affect')) initial[change.field] = change.before
    }
  }
  return initial
}

/** One first occurrence across all axes and poles, derived from the committed history. */
export function catalogFirstExtreme(run: CatalogRun, bounds = originalTraitBounds) {
  const isExtreme = (value: number) => value <= bounds.extremeLeft || value >= bounds.extremeRight
  const traits = { ...catalogInitialTraits(run) }
  const initial = axes.filter(axis => isExtreme(traits[axis]))
  if (initial.length) return { resultId: null, axes: initial }
  for (const entry of run.history) {
    for (const change of entry.resolution.changes) {
      if (change.kind === 'number' && (change.field === 'risk' || change.field === 'cognition' || change.field === 'affect')) traits[change.field] = change.after
    }
    const reached = axes.filter(axis => isExtreme(traits[axis]))
    if (reached.length) return { resultId: entry.resultId, axes: reached }
  }
  return null
}

export function catalogReflection(run: CatalogRun) {
  const final = run.core.protagonist.traits
  return {
    initial: catalogInitialTraits(run), final,
    directions: Object.fromEntries(axes.map(axis => [axis, final[axis] < 50 ? 'left' : final[axis] > 50 ? 'right' : 'neutral'])) as Record<keyof Traits, 'left' | 'right' | 'neutral'>,
    // Short/early endings can have fewer than two; never manufacture an unreached choice.
    representatives: ['E02', 'E07', 'E10'].flatMap(eventId => {
      const entry = run.history.find(item => item.eventId === eventId)
      return entry ? [{ eventId, actionId: entry.actionId }] : []
    }),
  }
}
