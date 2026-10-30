import { expect, it } from 'vitest'
import type { CatalogRun } from '../../domain/catalog'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { makeOrigin } from '../../test/opening-paths'
import { makeInfectionCatalogFixture } from '../../test/catalog-fixtures'
import { encodeCatalogSave, decodeCatalogSave } from '../../storage/catalog-save'
import { createInheritedCatalogRun, isCatalogLegacy } from './inheritance'
import { activeCatalogCompanion } from './companion-journey'
import { acknowledgeCatalogResult, catalogChoices, catalogLegacy, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const companion = { name: '이전 생존자', traits: { risk: 50, cognition: 50, affect: 50 }, trust: 80 }
function start(seed: number, withCompanion = false, p = pack) {
  const origin = makeOrigin(Math.imul(seed, 0x9e3779b9) >>> 0), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  return { origin, run: createCatalogRun(p, { ...origin, answers: answers.value, ...(withCompanion ? { companion } : {}) }) }
}
function preferred(run: CatalogRun, options: { middle?: string; clue?: boolean; skip?: number; safe?: boolean } = {}) {
  const available = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
  return (available.find(c => c.destinationSegmentId === (run.visitIndex === 6 ? options.middle ?? 'hospital' : 'research'))
    ?? (options.clue === false ? undefined : available.find(c => c.id.endsWith('.transport-record')))
    ?? (options.skip === run.visitIndex ? available.find(c => c.id.endsWith('.leave')) : available.find(c => c.id.endsWith('.collect')))
    ?? (options.safe ? available.find(c => c.id.endsWith('.withdraw')) : available.find(c => c.id.endsWith('.recover')))
    ?? available.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
    ?? available.find(c => c.id === 'E02.supplies')
    ?? available.find(c => c.behavior.kind === 'escape' && c.behavior.route === 'short')
    ?? available.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null))
    ?? available[0])!
}
function step(run: CatalogRun, options: Parameters<typeof preferred>[1] = {}, replayOrigin?: ReturnType<typeof makeOrigin>) {
  const action = preferred(run, options)
  const next = executeCatalogAction(pack, run, action.id)
  if (replayOrigin) expect(decodeCatalogSave(encodeCatalogSave(replayOrigin, pack, next), resolveAnswers).run).toEqual(next)
  const following = next.phase === 'result' ? acknowledgeCatalogResult(pack, next, next.result!.resultId) : next
  if (replayOrigin) expect(decodeCatalogSave(encodeCatalogSave(replayOrigin, pack, following), resolveAnswers).run).toEqual(following)
  return following
}
function travel(seed: number, options: Parameters<typeof preferred>[1] = {}, withCompanion = false) {
  const initial = start(seed, withCompanion)
  let run = initial.run
  while (run.phase === 'choice' && run.history.length < 19) run = step(run, options)
  return { ...initial, final: run }
}
function successful(options: Parameters<typeof preferred>[1] = {}, withCompanion = false) {
  for (let seed = 1; seed <= 60; seed++) {
    const value = travel(seed, options, withCompanion)
    if (value.final.history.find(h => h.visitIndex === 17)?.resolution.check.outcome === 'success' && value.final.result?.escape?.reason === 'escaped') return { ...value, seed }
  }
  throw new Error('완주 미도달')
}

it('병원에서 실제 배정된 여분 장소 한 곳에만 조사 기회를 정하고 같은 시드로 재현한다', () => {
  const seen = new Set<string>()
  for (let seed = 1; seed <= 32; seed++) {
    const initial = start(seed)
    let run = initial.run
    while (run.phase === 'choice' && run.visitIndex < 7) run = step(run)
    expect(run.visitIndex).toBe(7)
    const place = run.opportunities!['research-transport']
    expect(Object.keys(run.opportunities!)).toEqual(['research-transport'])
    expect(run.route).toContain(place)
    const location = pack.locations.find(l => l.id === place)!
    expect(location.tags).toContain('research-clue-site')
    expect(location.tags).toContain('hospital')
    expect(location.required).toBe(false)
    seen.add(place)
    expect(decodeCatalogSave(encodeCatalogSave(initial.origin, pack, run), resolveAnswers).run.opportunities).toEqual(run.opportunities)
  }
  expect(seen.size).toBeGreaterThan(4)
})

it('조사를 놓치면 병원14번에서 잠기며 백화점에는 조사와 연구동 이동이 없다', () => {
  for (const middle of ['hospital', 'department']) {
    let { run } = start(1)
    let offered = 0
    while (run.phase === 'choice' && run.visitIndex < 13) {
      offered += Number(catalogChoices(pack, run).some(c => c.id.endsWith('.transport-record')))
      run = step(run, { middle, clue: false })
    }
    expect(run.visitIndex).toBe(13)
    expect(offered).toBe(middle === 'hospital' ? 1 : 0)
    expect(run.facts['research-clue']).toBe(false)
    const research = catalogChoices(pack, run).find(c => c.destinationSegmentId === 'research')
    if (middle === 'hospital') {
      expect(research).toBeTruthy()
      expect(previewCatalogAction(pack, run, research!.id)).toMatchObject({ allowed: false, reasons: [expect.stringContaining('수송 기록')] })
      expect(() => executeCatalogAction(pack, run, research!.id)).toThrow('수송 기록')
    } else {
      expect(research).toBeUndefined()
      expect(run.opportunities).toEqual({})
    }
  }
})

it.each([false, true])('병원 단서→연구동→기록/시료→위험 회수→헬기 결말과 계승/저장을 연결한다(동료=%s)', withCompanion => {
  const { seed, origin, final } = successful({}, withCompanion)
  expect(final.history).toHaveLength(19)
  expect(final.facts).toMatchObject({ 'research-clue': true, 'research-record': true, 'research-sample': true, 'cure-recovered': true })
  expect(final.result!.escape!.ending).toBe('cure-discovery')
  expect(catalogGameView(pack, final)).toMatchObject({ kind: 'ending', ending: 'cure-discovery', title: '치료제 발견 · 이어지는 생존' })
  expect(isCatalogLegacy(catalogLegacy(pack, final))).toBe(true)
  let { run } = start(seed, withCompanion)
  while (run.phase === 'choice') run = step(run, {}, origin)
  expect(run).toEqual(final)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  const next = createInheritedCatalogRun(pack, catalogLegacy(pack, final)!, { ...origin, runId: 'research-successor', answers: answers.value })
  expect(next.facts['research-clue']).toBe(false)
  expect(next.facts['cure-recovered']).toBe(false)
  expect(next.opportunities).toEqual({})
  expect(next.infectionDeaths).toEqual([])
  expect(decodeCatalogSave(encodeCatalogSave({ ...origin, runId: 'research-successor' }, pack, next), resolveAnswers).run).toEqual(next)
})

it.each([15, 16])('기록/시료 확보를 놓치면(%i번 인덱스) 최종 회수에 성공해도 히든 결말이 아니다', skip => {
  const { final } = successful({ skip })
  expect(final.facts[skip === 15 ? 'research-record' : 'research-sample']).toBe(false)
  expect(final.facts['cure-recovered']).toBe(true)
  expect(final.result?.escape?.ending).not.toBe('cure-discovery')
})

it('위험 회수를 포기하면 감염 추첨 없이 일반 헬기 탈출하고 치료제 발견은 인정하지 않는다', () => {
  const { final } = travel(1, { safe: true })
  expect(final.facts['cure-recovered']).toBe(false)
  expect(final.infectionDeaths).toEqual([])
  expect(final.result?.escape?.ending).toBe('escape')
})

it('변형 좀비 회수는 기존 분석 회수보다 기본 성공률15%p 낮고, 실패하면 감염 즉시 사망한다', () => {
  const { seed } = successful()
  let { run } = start(seed, true)
  while (run.phase === 'choice' && run.visitIndex < 17) run = step(run)
  const actionId = 'encounter.infected-lab.recover', preview = previewCatalogAction(pack, run, actionId)
  expect(preview.action.check?.base).toBe(55)
  const before = JSON.stringify(run)
  expect(catalogPreviewView(pack, run, preview, 'test').warnings.join(' ')).toContain('감염 즉시 사망')
  expect(JSON.stringify(run)).toBe(before)
  const failed = Array.from({ length: 40 }, (_, i) => executeCatalogAction(pack, { ...run, rngState: Math.imul(i + 1, 0x9e3779b9) >>> 0 }, actionId))
    .find(r => r.result!.resolution.check.outcome === 'failure')!
  expect(failed.phase).toBe('ending')
  expect(catalogLegacy(pack, failed)?.ending).toBe('infection-death')
  const companionFailure = Array.from({ length: 40 }, (_, i) => executeCatalogAction(pack, { ...run, rngState: Math.imul(i + 1, 0x9e3779b9) >>> 0 }, actionId, false, 'companion'))
    .find(r => r.result!.resolution.check.outcome === 'failure')!
  expect(companionFailure.phase).toBe('result')
  expect(activeCatalogCompanion(companionFailure)).toBeNull()
  expect(companionFailure.facts['cure-recovered']).toBe(false)
})

it('옛 감염 팩 저장은 연구동을 열거나 단서 위치를 추가하지 않고 그대로 복원한다', () => {
  const old = makeInfectionCatalogFixture(), { origin, run } = start(1, true, old)
  const raw = encodeCatalogSave(origin, old, run)
  const restored = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
  expect(restored.run).not.toHaveProperty('opportunities')
  expect(restored.pack.manifest.slotPlan!.segments.find(s => s.id === 'research')!.lockedReason).toBeTruthy()
  expect(pack.locations.filter(l => l.enabled !== false)).toHaveLength(54)
})

it('연구물을 모두 갖췄더라도 탑승하지 못하고 구조 대기하면 히든 결말이 아니다', () => {
  const { seed } = successful()
  let { run } = start(seed)
  while (run.phase === 'choice' && run.visitIndex < 18) run = step(run)
  const exhausted = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 0, injury: 2 },
    flags: { ...run.core.flags, routeKnown: false } } }
  const id = 'encounter.research-helipad.request'
  expect(previewCatalogAction(pack, exhausted, id)).toMatchObject({ allowed: true, escapeEnding: 'escape-failed' })
  const ending = executeCatalogAction(pack, exhausted, id)
  expect(ending.result?.escape?.ending).toBe('escape-failed')
  expect(catalogGameView(pack, ending)).toMatchObject({ kind: 'ending', title: '구조를 기다리며' })
})

it('현재54장소는 자원0·부상·동료 유무에도 실행 가능한 선택과 표시 가능한 결과를 제공한다', () => {
  for (const location of pack.locations) for (const withCompanion of [false, true]) {
    const { run: initial } = start(1, withCompanion)
    const event = pack.events.find(e => e.locationIds.includes(location.id))!
    const scene = pack.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!
    const run: CatalogRun = { ...initial, route: [location.id], visits: [{ locationId: location.id, eventId: event.id, sceneScriptId: scene.id }],
      opportunities: location.tags.includes('research-clue-site') ? { 'research-transport': location.id } : {},
      core: { ...initial.core, inventory: { supply: 0, medkit: 0, weapon: false },
        protagonist: { ...initial.core.protagonist, stamina: 80, injury: 1, traits: { risk: 50, cognition: 50, affect: 50 } } } }
    const choices = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
    expect(choices.length, location.id).toBeGreaterThan(0)
    for (const choice of choices) {
      const next = executeCatalogAction(pack, run, choice.id)
      expect(() => catalogGameView(pack, next), `${location.id}/${choice.id}`).not.toThrow()
    }
  }
})
