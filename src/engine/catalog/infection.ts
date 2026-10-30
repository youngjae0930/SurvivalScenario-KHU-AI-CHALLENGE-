import type { CatalogChoice, CatalogPack, CatalogRun, InfectionDeath } from '../../domain/catalog'

export function infectionState(run: CatalogRun) {
  return { protagonist: !!run.infectionDeaths?.some(death => death.subject === 'protagonist'),
    companion: !!run.infectionDeaths?.some(death => death.subject === 'companion') }
}

/** An independent companion option is executed by that companion, even without a command modal. */
export function infectionActor(actionId: string, actor: 'protagonist' | 'companion') {
  return actionId.startsWith('companion:') ? 'companion' : actor
}

/** No roll, clock, progression, or ordinary injury inference. Ordered contacts are one failed action. */
export function resolveInfectionContacts(pack: CatalogPack, run: CatalogRun, choice: CatalogChoice,
  actor: 'protagonist' | 'companion', failed: boolean): InfectionDeath[] {
  if (pack.manifest.infectionVersion !== 'immediate-1' || !failed) return []
  const infected = infectionState(run)
  const companionHere = !!run.companion && !run.companionJourney?.separation && (run.companionVitals?.injury ?? 0) < 3 && !infected.companion
  const deaths: InfectionDeath[] = []
  for (const exposure of choice.infection ?? []) {
    const source = exposure.source === 'actor' ? actor : exposure.source
    const target = exposure.target === 'actor' ? actor : exposure.target === 'other'
      ? actor === 'protagonist' ? 'companion' : 'protagonist' : exposure.target
    if (source === target || (target === 'companion' && !companionHere) || (source === 'companion' && !companionHere)
      || (source !== 'infected-person' && !infected[source]) || infected[target]) continue
    infected[target] = true
    deaths.push({ subject: target, source, contact: exposure.contact, visitIndex: run.visitIndex,
      eventId: run.visits[run.visitIndex].eventId, actionId: choice.id })
  }
  return deaths
}
