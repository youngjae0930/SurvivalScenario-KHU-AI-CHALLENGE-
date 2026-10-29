import { describe, expect, it } from 'vitest'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { makeCatalogFixture, makeCompanionOutcomeCatalogFixture, makeNarrativeCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPresentation } from '../../app/view-models/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { prepareNextCatalogRun } from './inheritance'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, executeCatalogAction } from './runtime'
import { planRoute } from './route'

function flexible(): CatalogPack {
  const source = makeCatalogFixture()
  const live = makeNarrativeCatalogFixture()
  return compileCatalog({ ...source,
    manifest: { ...source.manifest, routeVersion: 'stages-1', revision: 'flexible-test-1', recommendationVersion: 'survival-1',
      stages: [{ id: 'early', minVisits: 1, maxVisits: 3 }, { id: 'middle', minVisits: 1, maxVisits: 1 }, { id: 'late', minVisits: 1, maxVisits: 2 }] },
    locations: source.locations.map(location => location.stage === 'early' && !location.required
      ? { ...location, fromTags: ['home', 'road'] } : location.id === 'research' ? { ...location, fromTags: ['home', 'road'] }
        : location.id === 'outskirts' ? { ...location, tags: ['exit', 'research'] } : location),
    events: [{ ...source.events[0], recommendation: { axis: 'risk' },
      locationIds: source.locations.filter(l => l.stage === 'early').map(l => l.id), locationTags: [] },
      { ...source.events[0], id: 'investigate', recommendation: { axis: 'risk' }, locationIds: ['research'], locationTags: [] },
      { ...live.events.find(event => event.id === 'E12')!, locationIds: ['outskirts'], locationTags: [] }],
    scripts: [...source.scripts, ...source.scripts.map(s => ({ ...s, id: `research.${s.id}`, eventId: 'investigate' })),
      ...live.scripts.filter(s => s.eventId === 'E12')],
  })
}
const origin = makeOrigin()
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문')
const input = { ...origin, answers: resolved.value }
function finish(pack: CatalogPack, start: CatalogRun) {
  let run = start
  while (run.phase === 'choice') {
    expect(catalogChoices(pack, run)).toHaveLength(run.visitIndex === run.route.length - 1 ? 3 : 4)
    const id = run.visitIndex === run.route.length - 1 ? 'E12.short' : 'continue'
    run = executeCatalogAction(pack, run, id)
    if (run.phase === 'result') run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  expect(run.phase).toBe('ending')
  return run
}

describe('D09 가변 방문 분량과 저장 호환', () => {
  it('방문량을 데이터로 바꾸며 빌라·연구동·탈출과 전중후반 순서를 지킨다', () => {
    const pack = flexible()
    const lengths = new Set<number>()
    for (const seed of [1, 17, 12345, 999999, 0x9e3779b9, 0x3c6ef372, 0xdaa66d2b, 0x78dde6e4]) {
      const { route } = planRoute(pack, seed)
      lengths.add(route.length)
      expect(route[0]).toBe('villa')
      expect(route.at(-1)).toBe('outskirts')
      expect(route.filter(id => id === 'research')).toHaveLength(1)
      expect(new Set(route).size).toBe(route.length)
      expect(route.length).toBeGreaterThanOrEqual(3)
      expect(route.length).toBeLessThanOrEqual(5)
      expect(planRoute(pack, seed).route).toEqual(route)
    }
    expect(lengths.size).toBeGreaterThan(1)
  })
  it('선택적 장소의 비활성화·파일 제외·다른 장소 추가가 코드 수정 없이 반영된다', () => {
    const source = flexible()
    const disabled = compileCatalog({ ...source, locations: source.locations.map(l => l.id === 'pharmacy' ? { ...l, enabled: false } : l) })
    expect(planRoute(disabled, 1, ['store']).route).not.toContain('pharmacy')
    expect(() => planRoute(disabled, 1, ['pharmacy'])).toThrow()
    const removed = compileCatalog({ ...source,
      locations: source.locations.filter(l => l.id !== 'pharmacy'),
      events: source.events.map(e => ({ ...e, locationIds: e.locationIds.filter(id => id !== 'pharmacy') })) })
    expect(planRoute(removed, 1).route).not.toContain('pharmacy')
    const added = compileCatalog({ ...removed,
      locations: [...removed.locations, { ...removed.locations.find(l => l.id === 'store')!, id: 'bakery', name: '빵집', tags: ['road'] }],
      events: removed.events.map(e => e.id === 'walk' ? { ...e, locationIds: [...e.locationIds, 'bakery'] } : e) })
    expect(planRoute(added, 1, ['bakery']).route).toContain('bakery')
  })
  it('필수 장소 제외·존재하지 않는 강제 방문·불가능한 최소/최대 분량을 거부한다', () => {
    const source = flexible()
    expect(() => compileCatalog({ ...source, locations: source.locations.map(l => l.id === 'research' ? { ...l, enabled: false } : l) })).toThrow()
    expect(() => planRoute(source, 1, ['missing'])).toThrow()
    expect(() => compileCatalog({ ...source, manifest: { ...source.manifest,
      stages: source.manifest.stages.map(s => s.id === 'early' ? { ...s, minVisits: 4, maxVisits: 4 } : s) } })).toThrow()
    expect(() => compileCatalog({ ...source, locations: source.locations.map(l => l.stage === 'early' ? { ...l, required: true } : l),
      manifest: { ...source.manifest, stages: source.manifest.stages.map(s => s.id === 'early' ? { ...s, maxVisits: 1 } : s) } })).toThrow()
  })
  it('추가 후반 장소가 있어도 탈출은 마지막이며 강제 방문 후보도 버리지 않는다', () => {
    const source = flexible()
    const pack = compileCatalog({ ...source,
      locations: [...source.locations, { id: 'late-rest', name: '후반 임시 거점', stage: 'late', tags: ['research'],
        fromTags: ['research'], after: ['research'], required: false, weight: 1 }],
      events: source.events.map(e => e.id === 'investigate' ? { ...e, locationIds: [...e.locationIds, 'late-rest'] } : e) })
    for (const seed of [1, 17, 12345]) {
      const route = planRoute(pack, seed, ['late-rest']).route
      expect(route.indexOf('late-rest')).toBeLessThan(route.indexOf('outskirts'))
      expect(route.at(-1)).toBe('outskirts')
    }
  })
  it('분량이 다른 두 회차의 화면·결말·계승·저장 복원을 연결한다', () => {
    const pack = flexible()
    const completed = []
    for (const count of [1, 3]) {
      const varied = compileCatalog({ ...pack, manifest: { ...pack.manifest,
        stages: pack.manifest.stages.map(s => s.id === 'early' ? { ...s, minVisits: count, maxVisits: count } : s) },
        locations: pack.locations.map(l => count === 1 && l.stage === 'early' && !l.required ? { ...l, enabled: false } : l) })
      const start = createCatalogRun(varied, input)
      expect(catalogPresentation(varied, start)?.journey).toHaveLength(count + 2)
      const ending = finish(varied, start)
      expect(catalogGameView(varied, ending).kind).toBe('ending')
      const raw = encodeCatalogSave(origin, varied, ending)
      expect(JSON.parse(raw).runtimeVersion).toBe('catalog-runtime-4')
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(ending)
      completed.push({ pack: varied, ending })
    }
    const secondOrigin = { ...origin, runId: 'different-length-successor', name: '새 생존자' }
    const second = prepareNextCatalogRun(completed[0].pack, completed[0].ending, completed[1].pack, { ...secondOrigin, answers: input.answers }).run
    expect(second.route).toHaveLength(5)
    expect(second.previousLegacy!.representativeActions).toEqual({ E02: null, E07: null, E10: null })
    const ended = finish(completed[1].pack, second)
    expect(JSON.parse(encodeCatalogSave(secondOrigin, completed[1].pack, ended)).runtimeVersion).toBe('catalog-succession-10')
    expect(decodeCatalogSave(encodeCatalogSave(secondOrigin, completed[1].pack, ended), resolveAnswers).run).toEqual(ended)
  })
  it('확장된 현재 여정과 이전 고정 팩의 경로·난수를 각각 원문대로 복원한다', () => {
    const current = readDefaultCatalog(), old = makeCompanionOutcomeCatalogFixture()
    for (const pack of [old, current]) {
      const run = createCatalogRun(pack, { ...input, companion: { name: '동료', trust: 50, traits: { risk: 50, cognition: 50, affect: 50 } } })
      const raw = encodeCatalogSave(origin, pack, run)
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
      expect(JSON.parse(raw).runtimeVersion).toBe(pack === old ? 'catalog-companion-outcome-1' : 'catalog-companion-dialogue-1')
    }
    expect(planRoute(current, 12345)).toEqual(planRoute(old, 12345))
  })
})
