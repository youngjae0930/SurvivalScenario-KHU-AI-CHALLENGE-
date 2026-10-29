import { expect, it } from 'vitest'
import type { CatalogRun, CompanionContext } from '../../domain/catalog'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { catalogGameView } from '../../app/view-models/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { makeOrigin } from '../../test/opening-paths'
import { makeVariableChoicesCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { prepareNextCatalogRun } from './inheritance'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, currentGroup, executeCatalogAction, renderCatalogScript } from './runtime'

const pack = readDefaultCatalog()
const origin = makeOrigin(1)
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문 오류')
const input = { ...origin, answers: answers.value }
const friend: CompanionContext = { name: '서윤', traits: { risk: 70, cognition: 50, affect: 90 }, trust: 50 }
const path = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain', 'E12.short']
function arrive(index: number, companion: CompanionContext | null = null) {
  let run = createCatalogRun(pack, { ...input, companion })
  for (const id of path.slice(0, index)) {
    run = executeCatalogAction(pack, run, id)
    if (run.phase === 'result') run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  return run
}

it('선택을 줄인 모든 사건의 각 맥락에서 단독·동행 결과 문구가 실제 행동에 연결된다', () => {
  const outcomes = new Set<string>()
  for (const [index, event] of pack.events.entries()) for (const group of event.groups) {
    for (const companion of [null, friend]) {
      if (!companion && group.conditions.some(c => c.kind === 'companion' && c.present)) continue
      if (companion && group.conditions.length === 0 && event.groups.some(g => g.conditions.some(c => c.kind === 'companion' && c.present))) continue
      let base = arrive(index, companion)
      base = { ...base, core: { ...base.core,
        protagonist: { ...base.core.protagonist, stamina: 90, injury: 0, stress: 30, traits: { risk: 50, cognition: 50, affect: 50 } },
        inventory: { supply: 3, medkit: 2, weapon: true }, flags: { ...base.core.flags, access: false, helpEstablished: false } } }
      for (const condition of group.conditions) {
        if (condition.kind === 'number' && condition.subject === 'protagonist' && ['risk', 'cognition', 'affect'].includes(condition.stat)) {
          const axis = condition.stat as 'risk' | 'cognition' | 'affect'
          base = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, traits: { ...base.core.protagonist.traits, [axis]: condition.min } } } }
        }
        if (condition.kind === 'flag') base = { ...base, core: { ...base.core, flags: { ...base.core.flags, [condition.flag]: condition.value } } }
      }
      expect(currentGroup(pack, base).id).toBe(group.id)
      for (const choice of catalogChoices(pack, base)) for (const rngState of [1, 1495045954]) {
        let run = base
        if (choice.behavior.kind === 'escape' && choice.behavior.route === 'request') run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, stamina: 0, injury: 2 } } }
        if (choice.behavior.kind === 'escape' && choice.behavior.route === 'detour') run = { ...base, core: { ...base.core, flags: { ...base.core.flags, routeKnown: true } } }
        const before = JSON.stringify(run)
        const result = executeCatalogAction(pack, { ...run, rngState }, choice.id)
        expect(JSON.stringify(run)).toBe(before)
        const text = renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ')
        expect(text.length).toBeGreaterThan(20)
        expect(text).not.toMatch(/\{\{|기본 비용|새 성공 추첨|정확히 4개/)
        if (!companion) expect(text).not.toContain(friend.name)
        outcomes.add(result.result!.resolution.check.outcome)
      }
    }
  }
  expect(outcomes).toEqual(new Set(['certain', 'success', 'failure']))
})

it.each([null, friend])('E01 두 선택의 소모 차이와 동료 조건별 실패 서술을 유지한다 (%j)', companion => {
  const run = arrive(0, companion)
  expect(catalogChoices(pack, run).map(c => c.id)).toEqual(['E01.safe', 'E01.shortcut'])
  const safe = executeCatalogAction(pack, run, 'E01.safe')
  expect(safe.core.protagonist.stamina).toBe(62)
  expect(safe.core.protagonist.stress).toBe(35)
  const result = executeCatalogAction(pack, { ...run, rngState: 1495045954 }, 'E01.shortcut')
  expect(result.core.protagonist.stamina).toBe(66)
  const script = renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ')
  expect(script.includes(friend.name)).toBe(companion !== null)
})

it('치명 부상으로 끝난 회차에 차량 탑승이나 탈출 성공을 서술하지 않는다', () => {
  const base = arrive(0, friend)
  let fatal: CatalogRun | null = null
  for (const rngState of [1, 1495045954]) {
    const run = { ...base, rngState, core: { ...base.core, protagonist: { ...base.core.protagonist, injury: 2 } } }
    const result = executeCatalogAction(pack, run, 'E01.shortcut')
    if (result.phase === 'ending') fatal = result
  }
  expect(fatal).not.toBeNull()
  const view = catalogGameView(pack, fatal!)
  expect(view.kind).toBe('ending')
  expect(view.kind === 'ending' && view.text.join(' ')).toContain('도움을 불러')
  expect(view.kind === 'ending' && view.text.join(' ')).not.toContain('여기까지 같이 왔네')
})

it('내용 버전을 바꾸어도 기존 저장의 문구·효과·원문은 그대로 복원한다', () => {
  const old = makeVariableChoicesCatalogFixture()
  let run = createCatalogRun(old, input)
  run = executeCatalogAction(old, run, 'E01.safe')
  const raw = encodeCatalogSave(origin, old, run)
  const loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
  expect(loaded.run.core.protagonist.stamina).toBe(70)
  expect(loaded.pack.manifest.revision).toBe('catalog-variable-choices-1')
})

it('새 단독 회차 완주·계승 후 두 번째 회차도 저장 복원하며 끝까지 진행한다', () => {
  const first = executeCatalogAction(pack, arrive(11), 'E12.short')
  expect(first.phase).toBe('ending')
  let run: CatalogRun = prepareNextCatalogRun(pack, first, pack, { ...input, runId: 'narrative-second', name: '두 번째' }).run
  const secondOrigin = { ...origin, runId: run.runId, name: '두 번째' }
  for (const action of path) {
    run = executeCatalogAction(pack, run, action)
    const raw = encodeCatalogSave(secondOrigin, pack, run)
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
    if (run.phase === 'result') run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  const view = catalogGameView(pack, run)
  expect(view.kind).toBe('ending')
  expect(view.kind === 'ending' && view.text.join(' ')).not.toMatch(/실제 결과를 종합|판단 근거|집계\(/)
})
