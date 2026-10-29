import { expect, it } from 'vitest'
import type { CatalogRun } from '../../domain/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { makeLocalStoriesCatalogFixture, makeRouteIdentityCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { allChoices } from './compile'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeRouteIdentityCatalogFixture()
const origin = makeOrigin(17389)
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const input = { ...origin, answers: answers.value }

// Isolated two-scene harness for effects/continuity. Full valid saves are covered below and in local-stories.test.ts.
function at(locationId: string, next: string, supply = 1, medkit = 1): CatalogRun {
  const initial = createCatalogRun(pack, input)
  const event = pack.events.find(e => e.locationIds.includes(locationId))!
  return { ...initial, route: [locationId, next], visits: [{ locationId, eventId: event.id,
    sceneScriptId: pack.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!.id }],
    core: { ...initial.core, inventory: { ...initial.core.inventory, supply, medkit },
      protagonist: { ...initial.core.protagonist, stamina: 80, traits: { risk: 50, cognition: 50, affect: 50 } } } }
}
function success(run: CatalogRun, actionId: string) {
  for (let seed = 1; seed <= 100; seed++) {
    const result = executeCatalogAction(pack, { ...run, rngState: Math.imul(seed, 0x9e3779b9) >>> 0 }, actionId)
    if (result.result!.resolution.check.outcome !== 'failure') return result
  }
  throw new Error('성공 분기 미도달')
}
function enterNext(result: CatalogRun) { return acknowledgeCatalogResult(pack, result, result.result!.resultId) }
function body(run: CatalogRun) { return renderCatalogScript(pack, run, run.visits[run.visitIndex].sceneScriptId).join(' ') }

it('병원 입구는 치료 도구, 백화점 홀은 식품의 위험 회수 기회를 제공한다', () => {
  const hospital = at('hospital-desk', 'operating-room')
  const kit = success(hospital, 'encounter.hospital-desk.cabinet')
  expect(kit.core.inventory).toMatchObject({ supply: 1, medkit: 2 })
  expect(kit.facts['hospital-kit']).toBe(true)
  expect(kit.judgmentCounts).toEqual(hospital.judgmentCounts)
  expect(catalogChoices(pack, at('hospital-desk', 'operating-room', 1, 2)).some(c => c.id.endsWith('.cabinet'))).toBe(false)
  const department = at('department-hall', 'food-hall')
  const food = success(department, 'encounter.department-hall.delivery')
  expect(food.core.inventory).toMatchObject({ supply: 2, medkit: 1 })
  expect(food.facts['department-food']).toBe(true)
  expect(catalogChoices(pack, at('department-hall', 'food-hall', 3, 1)).some(c => c.id.endsWith('.delivery'))).toBe(false)
  for (const [run, id, fact] of [[hospital, 'encounter.hospital-desk.cabinet', 'hospital-kit'], [department, 'encounter.department-hall.delivery', 'department-food']] as const) {
    const failure = Array.from({ length: 40 }, (_, n) => executeCatalogAction(pack, { ...run, rngState: Math.imul(n + 1, 0x9e3779b9) >>> 0 }, id)).find(r => r.result!.resolution.check.outcome === 'failure')!
    expect(failure.facts[fact]).toBe(false)
    expect(failure.core.inventory).toEqual(run.core.inventory)
  }
})

it('지하철의 지도 확인만 통로 정보를 주고 그냥 통과/정비하면 주지 않는다', () => {
  const run = at('turnstiles', 'train-connection')
  const result = executeCatalogAction(pack, run, 'encounter.turnstiles.work-map')
  expect(result.core.flags.routeKnown).toBe(true)
  expect(result.facts['subway-map']).toBe(true)
  expect(body(enterNext(result))).toContain('개찰구 옆에서 확인한')
  for (const id of ['encounter.turnstiles.gate', 'encounter.turnstiles.maintain']) {
    const other = executeCatalogAction(pack, run, id)
    expect(other.core.flags.routeKnown).toBe(false)
    expect(body(enterNext(other))).not.toContain('개찰구 옆에서 확인한')
  }
})

it.each([0, 1])('학교에서 출발 지원은 물자%i일 때 실제 비용을 쓰며 이전 편의점 판단을 덮지 않는다', supply => {
  const initial = at('school-playground', 'evacuation-convoy', supply)
  const run = { ...initial, core: { ...initial.core, flags: { ...initial.core.flags, rescueDecision: 'self' as const } } }
  const result = executeCatalogAction(pack, run, 'encounter.school-playground.help-load')
  expect(result.core.inventory.supply).toBe(0)
  expect(result.core.protagonist.stamina).toBe(supply ? 80 : 70)
  expect(result.core.flags.rescueDecision).toBe('self')
  expect(result.judgmentCounts).toEqual(run.judgmentCounts)
  expect(result.facts).toMatchObject({ 'convoy-met': true, 'convoy-supported': true })
  expect(body(enterNext(result))).toContain('운동장에서 물을 건넸던')
})

it('입구에서 획득한 것을 이미 소모했으면 후속 장면이 현재 보유를 꾸며내지 않는다', () => {
  for (const [loc, next, id, resource] of [['hospital-desk', 'operating-room', 'cabinet', 'medkit'], ['department-hall', 'food-hall', 'delivery', 'supply']] as const) {
    const result = success(at(loc, next), `encounter.${loc}.${id}`)
    expect(body(enterNext(result))).toMatch(/회수한 처치 도구|홀에서 챙긴 식품/)
    const consumed = { ...result, core: { ...result.core, inventory: { ...result.core.inventory, [resource]: 0 } } }
    expect(body(enterNext(consumed))).toMatch(/치료 도구가 남지|나눌 물자는 남지/)
  }
})

it('분기 확인창이 실제 경로의 탐색/이동 주제를 알려 주고 히든은 계속 잠근다', () => {
  const branch = pack.events.find(e => e.locationIds.includes('shelter'))!
  expect(allChoices(branch).find(c => c.destinationSegmentId === 'hospital')!.intention).toContain('처치 도구')
  expect(allChoices(branch).find(c => c.destinationSegmentId === 'department')!.intention).toContain('식품 회수')
  expect(pack.manifest.slotPlan!.segments.find(s => s.id === 'research')!.lockedReason).toBeTruthy()
})

it('구조하지 않은 정보 조사/단순 합류의 신뢰 이유에 구조 거절을 쓰지 않는다', () => {
  for (const e of pack.events) for (const c of allChoices(e)) {
    if (c.behavior.kind !== 'action') continue
    const info = c.behavior.variants.some(v => v.action.successEffects.some(effect => effect.kind === 'set-flag' && effect.flag === 'routeKnown'))
    if (info && e.id !== 'E10') expect(c.relationship?.success.map(i => i.reason).join(' ')).not.toContain('다른 이의 구조보다')
  }
})

it('이전 장소별 팩은 그대로 복원하고 새 경로 행동을 저장했다가 같은 결과로 재생한다', () => {
  const old = makeLocalStoriesCatalogFixture()
  const raw = encodeCatalogSave(origin, old, createCatalogRun(old, input))
  const restored = decodeCatalogSave(raw, resolveAnswers)
  expect(restored.pack.manifest.revision).toBe('catalog-local-stories-1')
  expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
  expect(allChoices(restored.pack.events.find(e => e.locationIds.includes('hospital-desk'))!).some(c => c.id.endsWith('.cabinet'))).toBe(false)
  let run = createCatalogRun(pack, input)
  while (run.phase === 'choice' && run.visitIndex <= 7) {
    const options = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
    const choice = options.find(c => c.destinationSegmentId === 'hospital')
      ?? options.find(c => c.id.endsWith('.cabinet'))
      ?? options.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
      ?? options.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => !v.action.check)) ?? options[0]
    run = executeCatalogAction(pack, run, choice.id)
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
    if (run.phase === 'result') run = enterNext(run)
  }
  expect(run.history.at(-1)!.actionId).toBe('encounter.hospital-desk.cabinet')
})
