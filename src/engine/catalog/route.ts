import type { CatalogPack } from '../../domain/catalog'
import { weightedPick } from './random'
import { planSlotSegment } from './slots'

/** A bounded search rejects impossible routes instead of silently skipping anchors. */
export function planRoute(pack: CatalogPack, initialRngState: number, requiredLocationIds: readonly string[] = []): { route: string[]; rngState: number } {
  if (pack.manifest.routeVersion === 'slots-1') {
    if (requiredLocationIds.length) throw new Error('슬롯 경로의 후속 장소는 플레이 중 목적지 선택으로 확정합니다. 강제 방문 목록을 함께 사용할 수 없습니다.')
    return planSlotSegment(pack, pack.manifest.slotPlan!.startSegmentId, initialRngState)
  }
  let rngState = initialRngState
  let attempts = 0
  const flexible = pack.manifest.routeVersion === 'stages-1'
  const stages = pack.manifest.stages
  const locations = pack.locations.filter(location => !flexible || location.enabled !== false).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const byId = new Map(locations.map(location => [location.id, location]))
  if (flexible && requiredLocationIds.some(id => !byId.has(id))) throw new Error('강제 방문 대상이 없거나 비활성 장소입니다.')
  const terminalIds = new Set(flexible ? locations.filter(location => pack.events.some(event =>
    (event.locationIds.includes(location.id) || event.locationTags.some(tag => location.tags.includes(tag)))
    && event.groups.some(group => group.choices.some(choice => choice.behavior.kind === 'escape')))).map(location => location.id) : [])
  const allRequired = locations.filter(location => location.required || requiredLocationIds.includes(location.id))
  const start = byId.get(pack.manifest.startLocationId)
  if (!start || start.stage !== stages[0].id) throw new Error('시작 장소는 첫 구간에 있어야 합니다.')
  function search(route: string[], stageIndex: number): string[] | null {
    if (++attempts > 50_000) throw new Error('이동 경로 검증 한도를 초과했습니다. 연결 조건이나 후보 수를 줄여 주세요.')
    if (stageIndex === stages.length) return route
    const stage = stages[stageIndex]
    const count = route.filter(id => byId.get(id)?.stage === stage.id).length
    const required = locations.filter(location => location.stage === stage.id && (location.required || requiredLocationIds.includes(location.id)) && !route.includes(location.id))
    const previous = byId.get(route.at(-1)!)!
    const candidates: { id: string; weight: number }[] = count < stage.maxVisits && !terminalIds.has(previous.id) ? locations.filter(location =>
      location.stage === stage.id && !route.includes(location.id) && location.after.every(id => route.includes(id))
      && location.fromTags.some(tag => previous.tags.includes(tag))
      && (!terminalIds.has(location.id) || allRequired.every(required => required.id === location.id || route.includes(required.id))),
    ) : []
    if (count >= stage.minVisits && required.length === 0) candidates.push({ id: '__advance', weight: 1 })
    while (candidates.length) {
      const picked = weightedPick(candidates, rngState); rngState = picked.rngState
      candidates.splice(candidates.indexOf(picked.item), 1)
      const next = picked.item.id === '__advance' ? search(route, stageIndex + 1) : search([...route, picked.item.id], stageIndex)
      if (next) return next
    }
    return null
  }
  const route = search([start.id], 0)
  if (!route) throw new Error('필수 장소·구간 길이·연결 조건을 만족하는 이동 경로가 없습니다.')
  return { route, rngState }
}
