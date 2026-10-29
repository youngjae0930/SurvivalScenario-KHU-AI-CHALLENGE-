import { expect, it } from 'vitest'
import { makeDialogueCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import { catalogGameView } from '../../app/view-models/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { makeOrigin } from '../../test/opening-paths'
import { makeNarrativeCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { findDialogue } from './dialogue'
import { acknowledgeCatalogResult, catalogContext, catalogDialogue, catalogRecommendedChoice, createCatalogRun, executeCatalogAction, renderCatalogScript } from './runtime'

const pack = readDefaultCatalog()
const origin = makeOrigin(1)
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const input = { ...origin, answers: answers.value }
const friend = { name: '서윤', traits: { risk: 70, cognition: 50, affect: 90 }, trust: 50 }
const path = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain', 'E12.short']

it('같은 행동의 결과 반응은 동료 성향 10/50/90에서 다르고 비용·난수는 같다', () => {
  const runs = [10, 50, 90].map(risk => executeCatalogAction(pack,
    createCatalogRun(pack, { ...input, companion: { ...friend, traits: { ...friend.traits, risk } } }), 'E01.safe'))
  const texts = runs.map(run => renderCatalogScript(pack, run, run.result!.resultScriptId).join(' '))
  expect(new Set(texts).size).toBe(3)
  for (const run of runs) {
    expect(run.core).toEqual(runs[0].core)
    expect(run.rngState).toBe(runs[0].rngState)
    expect(run.result!.resolution).toEqual(runs[0].result!.resolution)
  }
})

it('빠른 지름길 성공을 느린 이동으로 설명하거나 부상 없는 동료 의견에 상처를 단정하지 않는다', () => {
  for (const risk of [10, 50, 90]) {
    const start = createCatalogRun(pack, { ...input, companion: { ...friend, traits: { ...friend.traits, risk } } })
    const result = executeCatalogAction(pack, { ...start, rngState: 1 }, 'E01.shortcut')
    expect(result.result!.resolution.check.outcome).toBe('success')
    expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ')).not.toMatch(/천천히 와서|길이 좀 길었네/)
  }
  let run = createCatalogRun(pack, { ...input, companion: friend })
  for (const action of path.slice(0, 11)) {
    run = executeCatalogAction(pack, run, action)
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  run = { ...run, core: { ...run.core, flags: { ...run.core.flags, routeKnown: true } } }
  expect(run.core.protagonist.injury).toBe(0)
  expect(catalogRecommendedChoice(pack, run)?.id).toBe('E12.detour')
  expect(catalogDialogue(pack, run, 'opinion', 'E12.detour').join(' ')).not.toContain('지금 상처')
})

it('표시 조회는 실제 추천만 말하고 상태·난수·사용 문구 이력을 변경하지 않는다', () => {
  const run = createCatalogRun(pack, { ...input, companion: friend })
  const before = JSON.stringify(run)
  const choice = catalogRecommendedChoice(pack, run)!
  expect(catalogDialogue(pack, run, 'opinion', choice.id).join(' ').length).toBeGreaterThan(10)
  const other = path[0] === choice.id ? 'E01.shortcut' : path[0]
  expect(catalogDialogue(pack, run, 'opinion', other)).toEqual([])
  for (let i = 0; i < 3; i++) catalogGameView(pack, run)
  expect(JSON.stringify(run)).toBe(before)
  const solo = createCatalogRun(pack, input)
  expect(catalogDialogue(pack, solo, 'opinion', choice.id)).toEqual([])
  expect(catalogDialogue(pack, solo, 'reunion')).toEqual([])
})

it('새 연결과 직전 콘텐츠는 두 회차 문맥의 같은 선택에서 게임 결과가 동일하다', () => {
  const old = makeNarrativeCatalogFixture()
  for (const companion of [null, friend]) {
    let previous = createCatalogRun(old, { ...input, companion })
    let current = createCatalogRun(pack, { ...input, companion })
    for (const action of path) {
      expect(catalogRecommendedChoice(pack, current)?.id).toBe(catalogRecommendedChoice(old, previous)?.id)
      previous = executeCatalogAction(old, previous, action)
      current = executeCatalogAction(pack, current, action)
      expect(current.core).toEqual(previous.core)
      expect(current.rngState).toBe(previous.rngState)
      expect(current.companion).toEqual(previous.companion)
      expect(current.companionJourney).toEqual(previous.companionJourney)
      expect(current.result!.resolution).toEqual(previous.result!.resolution)
      if (current.phase === 'result') {
        current = acknowledgeCatalogResult(pack, current, current.result!.resultId)
        previous = acknowledgeCatalogResult(old, previous, previous.result!.resultId)
      }
    }
  }
})

it('실제 이별 전후와 재회 시점에만 해당 문구를 표시하고 저장 복원한다', () => {
  let run = createCatalogRun(pack, { ...input, companion: friend })
  expect(catalogDialogue(pack, run, 'departure', 'E01.safe')).toEqual([])
  let departure = false, absence = false, reunion = false
  for (const action of path) {
    const warning = catalogDialogue(pack, run, 'departure-warning', action)
    run = executeCatalogAction(pack, run, action)
    if (run.result!.companionDeparture) {
      departure = true
      expect(warning.length).toBeGreaterThan(0)
      expect(catalogDialogue(pack, run, 'departure', action).join(' ')).toContain('서윤')
      const view = catalogGameView(pack, run)
      expect(view.kind === 'result' && view.text.join(' ')).not.toContain('우리가 한 선택')
    } else expect(catalogDialogue(pack, run, 'departure', action)).toEqual([])
    if (run.phase !== 'result') continue
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
    if (run.companionJourney?.separation) {
      absence = true
      expect(catalogDialogue(pack, run, 'absent').length).toBeGreaterThan(0)
      expect(catalogDialogue(pack, run, 'opinion', action)).toEqual([])
    }
    if (run.companionJourney?.reunions.at(-1)?.visitIndex === run.visitIndex) {
      reunion = true
      expect(catalogDialogue(pack, run, 'reunion').join(' ')).toContain('서윤')
    }
    const loaded = decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers)
    expect(catalogGameView(loaded.pack, loaded.run)).toEqual(catalogGameView(pack, run))
  }
  expect([departure, absence, reunion]).toEqual([true, true, true])
})

it('직전 저장은 당시 팩과 표시를 유지하며 새 저장은 새 문구를 유지한다', () => {
  for (const content of [makeNarrativeCatalogFixture(), pack]) {
    const run = executeCatalogAction(content, createCatalogRun(content, { ...input, companion: friend }), 'E01.safe')
    const raw = encodeCatalogSave(origin, content, run)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
    expect(catalogGameView(loaded.pack, loaded.run)).toEqual(catalogGameView(content, run))
  }
})

it('대화 채널의 잘못된 참조·동행 조건·무작위 설정·버전 누락을 거부한다', () => {
  const script = pack.scripts.find(s => s.slot === 'opinion')!
  for (const change of [{ choiceId: 'missing' }, { conditions: [] }, { weight: 2 }, { once: true }]) {
    expect(() => compileCatalog({ ...pack, scripts: pack.scripts.map(s => s.id === script.id ? { ...s, ...change } : s) })).toThrow()
  }
  expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, dialogueVersion: undefined } })).toThrow()
})

it('표시 문구의 동순위 선택은 파일 순서에 관계없이 ID순으로 고정된다', () => {
  const run = createCatalogRun(pack, { ...input, companion: friend })
  const base = pack.scripts.find(s => s.slot === 'opinion' && s.eventId === 'E01')!
  const scripts = ['z', 'a'].map(id => ({ ...base, id, priority: 999, conditions: [{ kind: 'companion' as const, present: true }] }))
  expect(findDialogue({ ...pack, scripts }, catalogContext(pack, run), 'E01', 'opinion', base.choiceId)?.id).toBe('a')
  expect(findDialogue({ ...pack, scripts: scripts.toReversed() }, catalogContext(pack, run), 'E01', 'opinion', base.choiceId)?.id).toBe('a')
})
