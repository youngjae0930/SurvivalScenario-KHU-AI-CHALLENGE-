import type { CatalogContext, CatalogRun } from '../../domain/catalog'
import { matches } from './conditions'

/** Identity stays on the run while participation can stop temporarily. */
export function activeCatalogCompanion(run: CatalogRun) {
  return run.companionJourney?.separation || run.infectionDeaths?.some(death => death.subject === 'companion') ? null : run.companion
}

/** Arriving at an eligible future location is the only reunion transition. No RNG or rewards. */
export function reuniteCatalogCompanion(run: CatalogRun, context: CatalogContext): CatalogRun {
  const journey = run.companionJourney
  const separation = journey?.separation
  if (!journey || !separation || !run.companion || run.infectionDeaths?.some(death => death.subject === 'companion') || run.visitIndex <= separation.visitIndex
    || run.visitIndex - separation.visitIndex < separation.reunion.minVisits
    || !separation.reunion.locationTags.some(tag => context.location.tags.includes(tag))
    || !matches(separation.reunion.conditions, { ...context, companion: run.companion })) return run
  return { ...run, companionJourney: { separation: null, reunions: [...journey.reunions,
    { separation, visitIndex: run.visitIndex, locationId: context.location.id }] } }
}
