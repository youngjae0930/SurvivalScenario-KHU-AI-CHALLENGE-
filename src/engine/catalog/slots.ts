import type { CatalogContext, CatalogPack, CatalogSegment } from '../../domain/catalog'
import { weightedPick } from './random'
import { matches } from './conditions'

export function slotSegment(pack: CatalogPack, id: string): CatalogSegment {
  const segment = pack.manifest.slotPlan?.segments.find(item => item.id === id)
  if (!segment) throw new Error(`없는 경로 구간: ${id}`)
  return segment
}
export function planSlotSegment(pack: CatalogPack, id: string, seed: number): { route: string[]; rngState: number } {
  const segment = slotSegment(pack, id)
  if (segment.lockedReason) throw new Error(segment.lockedReason)
  let rngState = seed
  const route = segment.slots.map(slot => {
    const candidates = slot.candidates.map(id => pack.locations.find(item => item.id === id)!).filter(item => item?.enabled !== false)
    const picked = weightedPick(candidates, rngState)
    rngState = picked.rngState
    return picked.item.id
  })
  return { route, rngState }
}
export function catalogVisitLimit(pack: CatalogPack): number {
  return pack.manifest.slotPlan ? Math.max(...pack.manifest.slotPlan.segments.flatMap(segment => segment.slots.map(slot => slot.number)))
    : pack.manifest.stages.reduce((sum, stage) => sum + stage.maxVisits, 0)
}
export function destinationLock(pack: CatalogPack, locationId: string, destinationId: string, context?: CatalogContext): string | null {
  const source = pack.manifest.slotPlan?.segments.find(segment => segment.slots.at(-1)?.candidates.includes(locationId))
  const destination = pack.manifest.slotPlan?.segments.find(segment => segment.id === destinationId)
  if (!source?.nextSegmentIds.includes(destinationId) || !destination) return '현재 장소에서 연결되지 않는 경로입니다.'
  if (destination.lockedReason) return destination.lockedReason
  if (destination.entry && (!context || !matches(destination.entry.conditions, context))) return destination.entry.reason
  return null
}

/** Validate every branch and every candidate, without pretending mutually exclusive rooms are all required. */
export function validateSlotPlan(pack: CatalogPack): string[] {
  const issues: string[] = []
  const plan = pack.manifest.slotPlan
  if (!plan) return ['slots-1에는 slotPlan이 필요합니다.']
  const check = (value: boolean, text: string) => { if (!value) issues.push(`slotPlan: ${text}`) }
  const segments = new Map(plan.segments.map(segment => [segment.id, segment]))
  check(segments.size === plan.segments.length, '중복 구간 ID')
  const start = segments.get(plan.startSegmentId)
  check(!!start && start.stage === 'early' && start.slots[0]?.number === 1 && start.slots[0]?.candidates.length === 1
    && start.slots[0]?.candidates[0] === pack.manifest.startLocationId, '시작 구간/장소 불일치')
  const used = new Set<string>()
  const reachable = new Set<string>()
  function visit(id: string) { if (reachable.has(id)) return; reachable.add(id); segments.get(id)?.nextSegmentIds.forEach(visit) }
  visit(plan.startSegmentId)
  for (const segment of plan.segments) {
    check(reachable.has(segment.id), `도달 불가능한 구간 ${segment.id}`)
    const stage = pack.manifest.stages.find(item => item.id === segment.stage)!
    check(segment.slots.length >= stage.minVisits && segment.slots.length <= stage.maxVisits, `${segment.id} 구간 길이`)
    check(new Set(segment.nextSegmentIds).size === segment.nextSegmentIds.length, `${segment.id} 중복 연결`)
    check(segment.nextSegmentIds.length === 0 || segment.nextSegmentIds.some(id => segments.has(id) && !segments.get(id)!.lockedReason), `${segment.id} 실행 가능한 후속 구간이 없음`)
    check(segment.nextSegmentIds.length === 0 || segment.nextSegmentIds.some(id => {
      const next = segments.get(id)
      return !!next && !next.lockedReason && !next.entry?.conditions.length
    }), `${segment.id} 조건 없이 이동 가능한 후속 구간이 필요함`)
    for (const [index, slot] of segment.slots.entries()) {
      check(index === 0 || slot.number === segment.slots[index - 1].number + 1, `${segment.id} 슬롯 순서`)
      check(new Set(slot.candidates).size === slot.candidates.length, `${segment.id} 중복 후보`)
      for (const id of slot.candidates) {
        const location = pack.locations.find(item => item.id === id)
        check(!!location && location.stage === segment.stage, `${id} 장소/구역 불일치`)
        check(!used.has(id), `${id} 여러 슬롯 중복 배정`); used.add(id)
        check(!location || location.required === (slot.candidates.length === 1), `${id} 고정/후보 표시 불일치`)
        check(!!segment.lockedReason || location?.enabled !== false, `${id} 활성 구간에 비활성 후보`)
        if (!location) continue
        const previous = index > 0 ? segment.slots[index - 1].candidates : plan.segments.filter(item => item.nextSegmentIds.includes(segment.id)).flatMap(item => item.slots.at(-1)!.candidates)
        check(previous.every(previousId => location.fromTags.some(tag => pack.locations.find(item => item.id === previousId)?.tags.includes(tag))), `${id} 이전 슬롯과 연결되지 않음`)
        check(location.after.every(required => segment.slots.slice(0, index).some(item => item.candidates.length === 1 && item.candidates[0] === required)), `${id} 필수 선행 장소가 보장되지 않음`)
        const events = pack.events.filter(event => event.locationIds.includes(id) || event.locationTags.some(tag => location.tags.includes(tag)))
        const terminal = events.some(event => event.groups.some(group => group.choices.some(choice => choice.behavior.kind === 'escape')))
        check(!terminal || (index === segment.slots.length - 1 && segment.nextSegmentIds.length === 0), `${id} 탈출 뒤에 장소가 있음`)
        if (index === segment.slots.length - 1 && segment.nextSegmentIds.length === 0 && !segment.lockedReason) check(terminal && segment.stage === 'late', `${id} 활성 종착 슬롯에는 탈출 사건이 필요함`)
        for (const event of events) for (const group of event.groups) {
          for (const choice of group.choices) if (choice.destinationSegmentId) check(index === segment.slots.length - 1 && segment.nextSegmentIds.includes(choice.destinationSegmentId)
            && choice.behavior.kind === 'action' && choice.behavior.variants.every(item => item.action.check === null), `${choice.id} 확정 이동/연결 불일치`)
          if (index === segment.slots.length - 1 && segment.nextSegmentIds.length) {
            check(group.choices.every(choice => !!choice.destinationSegmentId), `${id} 분기에는 목적지 선택만 허용`)
            for (const next of segment.nextSegmentIds) check(group.choices.some(choice => choice.destinationSegmentId === next), `${id} 경로 ${next} 선택 누락`)
          }
        }
      }
    }
    for (const nextId of segment.nextSegmentIds) {
      const next = segments.get(nextId)
      check(!!next && next.slots[0]?.number === segment.slots.at(-1)!.number + 1
        && ['early', 'middle', 'late'].indexOf(next.stage) === ['early', 'middle', 'late'].indexOf(segment.stage) + 1, `${segment.id} → ${nextId} 순서/구역 불일치`)
    }
  }
  check(pack.locations.every(location => used.has(location.id)), '슬롯에 배정되지 않은 장소')
  return issues
}
