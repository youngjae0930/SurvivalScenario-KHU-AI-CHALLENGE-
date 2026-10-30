import { describe, expect, it } from 'vitest'
import { makeDialogueCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { makeCatalogFixture, makeOpeningCatalogFixture } from '../../test/catalog-fixtures'
import { advanceOpening, makeOrigin, resolveOpening, startOpening } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { matches } from './conditions'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogContext, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

function start(pack: CatalogPack, seed = 1, risk: 'normal' | 'adventure' | 'stability' = 'normal') {
  const origin = makeOrigin(seed, risk)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문 오류')
  return createCatalogRun(pack, { ...origin, answers: answers.value })
}
function advance(pack: CatalogPack, run: CatalogRun) { return acknowledgeCatalogResult(pack, run, run.result!.resultId) }

describe('장소·사건·문구 콘텐츠 실행', () => {
  it('파일 자동 수집으로 기존 여섯 사건과 모든 선택/문구를 검증한다', () => {
    const pack = readDefaultCatalog()
    expect(pack.locations.map(location => location.id)).toContain(pack.manifest.startLocationId)
    expect(pack.events.length).toBeGreaterThan(0)
    expect(Object.isFrozen(pack.events[0].groups)).toBe(true)
    expect(start(pack).route[0]).toBe(pack.manifest.startLocationId)
  })

  it.each(['normal', 'adventure', 'stability'] as const)('%s 성향의 기존 모든 선택 경로와 같은 비용·성패·난수를 유지한다', risk => {
    const pack = makeOpeningCatalogFixture()
    for (const seed of [1, 1495045954]) {
      // All pairs of alternatives, including resource variants and treatment opportunities.
      for (let bits = 0; bits < 64; bits++) {
        let old = startOpening(makeOrigin(seed, risk))
        let run = start(pack, seed, risk)
        while (run.phase === 'choice') {
          const options = currentGroup(pack, run).choices.filter(choice => previewCatalogAction(pack, run, choice.id).allowed)
          const choice = options[((bits >> run.visitIndex) & 1) % options.length]
          const treat = choice.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain' && run.core.protagonist.injury > 0 && run.core.inventory.medkit > 0
          const before = JSON.stringify(run)
          previewCatalogAction(pack, run, choice.id, treat)
          expect(JSON.stringify(run)).toBe(before)
          run = executeCatalogAction(pack, run, choice.id, treat)
          old = resolveOpening(old, choice.id, treat)
          expect(run.core).toEqual(old.core)
          expect(run.rngState).toBe(old.rngState)
          expect(run.result!.resolution).toEqual(old.result!.resolution)
          expect(run.judgmentCounts).toEqual(old.judgmentCounts)
          expect(run.phase).toBe(old.phase)
          if (run.phase === 'result') { run = advance(pack, run); old = advanceOpening(old) }
        }
      }
    }
  })

  it('다양한 seed에서도 빌라/연구동은 한 번, 구간 순서·연결·길이는 항상 유지한다', () => {
    const pack = makeCatalogFixture()
    const branches = new Set<string>()
    for (let seed = 1; seed <= 150; seed++) {
      const route = planRoute(pack, seed * 17389).route
      expect(route).toHaveLength(4)
      expect(route[0]).toBe('villa')
      expect(route[2]).toBe('research')
      expect(route[3]).toBe('outskirts')
      expect(route.filter(id => id === 'research')).toHaveLength(1)
      branches.add(route[1])
    }
    expect(branches).toEqual(new Set(['store', 'pharmacy']))
  })

  it('선언만 추가한 장소·사건·선택·문구가 엔진 수정 없이 후보와 화면 데이터에 들어간다', () => {
    const source = structuredClone(makeCatalogFixture())
    const added: CatalogPack = { ...source, locations: [...source.locations, { id: 'bakery', name: '빵집', stage: 'early', tags: ['road', 'new-site'], fromTags: ['home'], after: [], required: false, weight: 1000 }],
      events: [{ ...source.events[0], locationIds: ['store', 'pharmacy'], locationTags: ['home', 'research', 'exit'] }, { ...source.events[0], id: 'new-event', locationIds: ['bakery'], locationTags: [] }],
      scripts: [...source.scripts, ...source.scripts.map(script => ({ ...script, id: `new.${script.id}`, eventId: 'new-event' }))] }
    const pack = compileCatalog(added)
    let run = start(pack, 17389)
    expect(run.route[1]).toBe('bakery')
    run = advance(pack, executeCatalogAction(pack, run, 'continue'))
    expect(currentEvent(pack, run).id).toBe('new-event')
    expect(renderCatalogScript(pack, run, run.visits[1].sceneScriptId)[0]).toContain('빵집')
  })

  it('스크립트 조건·우선순위·once·기본 대체 문구를 적용하고 미리보기로 재추첨하지 않는다', () => {
    const source = makeCatalogFixture()
    const pack = compileCatalog({ ...source, scripts: [...source.scripts, { ...source.scripts.find(script => script.slot === 'scene')!, id: 'special', priority: 20, once: true,
      conditions: [{ kind: 'number', subject: 'protagonist', stat: 'stress', min: 30, max: 100 }], text: ['높은 긴장.'] }] })
    let run = start(pack)
    expect(run.visits[0].sceneScriptId).toBe('special')
    const snapshot = JSON.stringify(run)
    for (let i = 0; i < 5; i++) previewCatalogAction(pack, run, 'continue')
    expect(JSON.stringify(run)).toBe(snapshot)
    run = advance(pack, executeCatalogAction(pack, run, 'continue'))
    expect(run.visits[1].sceneScriptId).toBe('walk.scene')
  })

  it('동료 유무·성향·신뢰·장소·물자·방문·fact 조건을 명시적으로 평가한다', () => {
    const pack = makeCatalogFixture()
    const run = start(pack)
    const base = catalogContext(pack, run)
    expect(matches([{ kind: 'number', subject: 'companion', stat: 'risk', min: 0, max: 22 }], base)).toBe(false)
    const context = { ...base, companion: { name: '검증 동료', traits: { risk: 20, cognition: 80, affect: 50 }, trust: 35 }, facts: { clue: true } }
    expect(matches([
      { kind: 'companion', present: true }, { kind: 'number', subject: 'companion', stat: 'risk', min: 0, max: 22 },
      { kind: 'number', subject: 'companion', stat: 'trust', min: 0, max: 40 }, { kind: 'location-tag', tag: 'home' },
      { kind: 'resource', resource: 'supply', min: 1, max: 3 }, { kind: 'visited', locationId: 'villa', value: true }, { kind: 'fact', id: 'clue', value: true },
    ], context)).toBe(true)
  })

  it('동료가 실제로 있는 문맥에서만 대응 문구와 이름을 선택한다', () => {
    const source = makeCatalogFixture()
    const scene = source.scripts.find(script => script.slot === 'scene')!
    const pack = compileCatalog({ ...source, scripts: [...source.scripts, { ...scene, id: 'companion-scene', priority: 20,
      conditions: [{ kind: 'companion', present: true }, { kind: 'number', subject: 'companion', stat: 'cognition', min: 0, max: 22 }], text: ['{{companion.name}}: {{location.name}} 주변부터 살펴보자.'] }] })
    expect(start(pack).visits[0].sceneScriptId).toBe('walk.scene')
    const origin = makeOrigin()
    const answers = resolveAnswers(origin.answers)
    if (!answers.ok) throw new Error('설문 오류')
    const run = createCatalogRun(pack, { ...origin, answers: answers.value, companion: { name: '분석 동료', traits: { risk: 50, cognition: 20, affect: 50 }, trust: 50 } })
    expect(run.visits[0].sceneScriptId).toBe('companion-scene')
    expect(renderCatalogScript(pack, run, 'companion-scene')).toEqual(['분석 동료: 빌라 주변부터 살펴보자.'])
  })

  it('자원에 따라 잠긴 행동과 극단 대체 그룹을 재검증하고 숨겨진 선택 실행을 거부한다', () => {
    const pack = makeOpeningCatalogFixture()
    let run = start(pack, 1, 'adventure')
    for (const id of ['E01.shortcut', 'E02.help', 'E03.observe', 'E04.rest']) run = advance(pack, executeCatalogAction(pack, run, id))
    expect(currentGroup(pack, run).id).toBe('extreme')
    expect(previewCatalogAction(pack, run, 'E05.tools').allowed).toBe(false)
    expect(() => executeCatalogAction(pack, run, 'E05.tools')).toThrow()
    expect(() => executeCatalogAction(pack, run, 'E05.bypass')).toThrow()
  })
})

describe('콘텐츠 검증 실패는 진행을 만들지 않는다', () => {
  it.each([
    ['중복 장소', (data: any) => data.locations.push(data.locations[0])],
    ['없는 선행 장소', (data: any) => data.locations[1].after.push('missing')],
    ['불가능한 필수 장소', (data: any) => data.locations.find((item: any) => item.id === 'research').fromTags = ['home']],
    ['기본 사건 누락', (data: any) => data.events[0].locationTags = []],
    ['기본 문구 누락', (data: any) => data.scripts.shift()],
    ['조건 오타', (data: any) => data.scripts[0].conditions.push({ kind: 'number', subject: 'companion', stat: 'strss', min: 0, max: 100 })],
    ['없는 fact', (data: any) => data.events[0].groups[0].choices[0].successFacts.unknown = true],
    ['본문 변수 오타', (data: any) => data.scripts[0].text = ['{{missing}}']],
    ['동료 없는 이름', (data: any) => data.scripts[0].text = ['{{companion.name}}']],
    ['임의 코드', (data: any) => data.events[0].eval = 'return true'],
    ['값 누락', (data: any) => delete data.events[0].groups[0].choices[0].behavior.variants[0].action.costs],
  ])('%s를 거부한다', (_name, mutate) => {
    const source = structuredClone(makeCatalogFixture()); mutate(source)
    expect(() => compileCatalog(source)).toThrow()
  })
})
