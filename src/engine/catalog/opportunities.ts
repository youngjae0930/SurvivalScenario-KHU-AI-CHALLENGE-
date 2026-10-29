import type { CatalogPack } from '../../domain/catalog'
import { weightedPick } from './random'

/** Assign each opportunity once, among places actually selected in this committed segment. */
export function placeOpportunities(pack: CatalogPack, route: readonly string[], seed: number, previous: Readonly<Record<string, string>> = {}) {
  const opportunities = { ...previous }
  let rngState = seed
  for (const policy of pack.manifest.opportunities ?? []) {
    if (opportunities[policy.id]) continue
    const locations = route.map(id => pack.locations.find(l => l.id === id)!)
      .filter(l => policy.locationTags.some(tag => l.tags.includes(tag)))
    if (!locations.length) continue
    const picked = weightedPick(locations, rngState)
    rngState = picked.rngState
    opportunities[policy.id] = picked.item.id
  }
  return { opportunities, rngState }
}
