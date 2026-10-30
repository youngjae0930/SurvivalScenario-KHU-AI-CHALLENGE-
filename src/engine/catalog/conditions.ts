import type { CatalogContext, Condition } from '../../domain/catalog'

export function matches(conditions: readonly Condition[], context: CatalogContext): boolean {
  return conditions.every(condition => {
    switch (condition.kind) {
      case 'opportunity': return context.opportunities?.includes(condition.id) ?? false
      case 'companion': return (context.companion !== null) === condition.present
      case 'weapon': return context.core.inventory.weapon === condition.value
      case 'flag': return context.core.flags[condition.flag] === condition.value
      case 'fact': return context.facts[condition.id] === condition.value
      case 'visited': return context.visited.includes(condition.locationId) === condition.value
      case 'stage': return context.location.stage === condition.stage
      case 'location-tag': return context.location.tags.includes(condition.tag)
      case 'resource': return context.core.inventory[condition.resource] >= condition.min && context.core.inventory[condition.resource] <= condition.max
      case 'number': {
        const actor = condition.subject === 'companion' ? context.companion : context.core.protagonist
        if (!actor) return false
        const stat = condition.stat
        const number = stat === 'risk' || stat === 'cognition' || stat === 'affect' ? actor.traits[stat]
          : stat in actor ? (actor as unknown as Record<string, number>)[stat] : undefined
        return number !== undefined && number >= condition.min && number <= condition.max
      }
    }
  })
}
