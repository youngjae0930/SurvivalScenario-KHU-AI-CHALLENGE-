import { expect, it } from 'vitest'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { makePlaytestCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { acknowledgeCatalogResult, catalogChoices, catalogDialogue, catalogRecommendedChoice, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'
import { planSlotSegment } from './slots'

const pack = readDefaultCatalog(), old = makePlaytestCatalogFixture()
const friend = { name: '서진', trust: 50, traits: { risk: 70, cognition: 40, affect: 70 } }
function initial(p = pack, seed = 1, companion: typeof friend | null = friend) {
  const origin = makeOrigin(seed), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  return { origin, run: createCatalogRun(p, { ...origin, answers: answers.value, companion }) }
}
function choose(p: CatalogPack, run: CatalogRun, middle: string, late: string) {
  const choices = catalogChoices(p, run).filter(c => previewCatalogAction(p, run, c.id).allowed)
  return choices.find(c => c.destinationSegmentId === (run.visitIndex === 6 ? middle : late))
    ?? (late === 'research' ? choices.find(c => c.id.endsWith('.transport-record')) : undefined)
    ?? (run.core.protagonist.stamina < 65 ? choices.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain') : undefined)
    ?? choices.find(c => c.behavior.kind === 'escape' && c.behavior.route === 'short')
    ?? choices.find(c => c.behavior.kind === 'escape')
    ?? choices.find(c => c.id === 'E02.supplies')
    ?? choices.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null))
    ?? choices[0]
}

it('수정본은 고정·후보 슬롯, 단서 배정, 장소 연결과 모든 선택 효과를 그대로 유지한다', () => {
  expect(pack.events).toEqual(old.events)
  expect(pack.locations).toEqual(old.locations)
  expect(pack.manifest.slotPlan).toEqual(old.manifest.slotPlan)
  expect(pack.manifest.opportunities).toEqual(old.manifest.opportunities)
  expect(pack.manifest.trustVersion).toBe(old.manifest.trustVersion)
  expect(pack.manifest.infectionVersion).toBe(old.manifest.infectionVersion)
})

it('각 슬롯의 모든 A/B 후보가 유효하며 같은 시드는 같은 경로·난수를 배정한다', () => {
  const visited = new Set<string>()
  for (const segment of pack.manifest.slotPlan!.segments) for (let seed = 1; seed <= 64; seed++) {
    const current = planSlotSegment(pack, segment.id, Math.imul(seed, 0x9e3779b9) >>> 0)
    expect(current).toEqual(planSlotSegment(old, segment.id, Math.imul(seed, 0x9e3779b9) >>> 0))
    expect(current.route).toHaveLength(segment.slots.length)
    current.route.forEach((id, i) => {
      expect(segment.slots[i].candidates).toContain(id)
      if (segment.slots[i].candidates.length === 1) expect(id).toBe(segment.slots[i].candidates[0])
      visited.add(id)
    })
  }
  expect([...visited].sort()).toEqual(pack.locations.filter(l => l.enabled !== false).map(l => l.id).sort())
})

it.each([['hospital', 'subway'], ['hospital', 'school'], ['hospital', 'research'], ['department', 'subway'], ['department', 'school']])(
  '%s→%s의 서로 다른 후보 배치·단독/동행에서 계산·추천·이별·저장 결과가 유지된다', (middle, late) => {
    for (const seed of [1, 193, 17389, 42397]) for (const companion of [null, friend]) {
      const a = initial(old, seed, companion), b = initial(pack, seed, companion)
      let previous = a.run, current = b.run
      for (let step = 0; step < 19 && current.phase === 'choice'; step++) {
        expect(current.route).toEqual(previous.route)
        expect(catalogRecommendedChoice(pack, current)?.id).toBe(catalogRecommendedChoice(old, previous)?.id)
        const choice = choose(pack, current, middle, late)
        const first = executeCatalogAction(old, previous, choice.id)
        const second = executeCatalogAction(pack, current, choice.id)
        expect(second.core).toEqual(first.core)
        expect(second.rngState).toBe(first.rngState)
        expect(second.opportunities).toEqual(first.opportunities)
        expect(second.companion).toEqual(first.companion)
        expect(second.companionJourney).toEqual(first.companionJourney)
        expect(second.result!.resolution).toEqual(first.result!.resolution)
        expect(second.result!.trustChange).toEqual(first.result!.trustChange)
        const view = catalogGameView(pack, second)
        expect(view.kind).toBe(second.phase)
        if (view.kind === 'result' || view.kind === 'ending') expect(view.text.join(' ')).not.toMatch(/\{\{|걸으면서 말할게|내가 제안해 놓고/)
        previous = first.phase === 'result' ? acknowledgeCatalogResult(old, first, first.result!.resultId) : first
        current = second.phase === 'result' ? acknowledgeCatalogResult(pack, second, second.result!.resultId) : second
      }
      expect(current.phase).toBe('ending')
      expect(current.visitIndex).toBe(18)
      const raw = encodeCatalogSave(b.origin, pack, current)
      const loaded = decodeCatalogSave(raw, resolveAnswers)
      expect(loaded.run).toEqual(current)
      expect(catalogGameView(loaded.pack, loaded.run)).toEqual(catalogGameView(pack, current))
    }
  }, 20000,
)

it('실제로 추천한 행동의 성공·신뢰 하락에는 기계적인 사과를 붙이지 않는다', () => {
  const { run } = initial()
  const id = catalogRecommendedChoice(pack, run)!.id
  expect(id).toBe('E01.safe')
  const result = executeCatalogAction(pack, run, id)
  expect(result.result!.followedCompanionRecommendation).toBe(true)
  expect(result.result!.trustChange!.after).toBeLessThan(result.result!.trustChange!.before)
  expect(catalogDialogue(pack, result, 'recommendation-failure', id)).toEqual([])
  const view = catalogGameView(pack, result)
  expect(view.kind === 'result' && view.text.join(' ')).not.toMatch(/미안|가볍게 봤네/)
})

it('실제 추천을 따라 실패해 다쳤을 때만 장소별 책임 대사를 표시한다', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const { run } = initial(pack, seed, { ...friend, traits: { ...friend.traits, risk: 10 } })
    const id = catalogRecommendedChoice(pack, run)!.id
    const result = executeCatalogAction(pack, run, id)
    if (result.result!.resolution.check.outcome !== 'failure') continue
    expect(catalogDialogue(pack, result, 'recommendation-failure', id).join(' ')).toContain('공구함')
    expect(catalogDialogue(pack, result, 'recommendation-failure', 'E01.safe')).toEqual([])
    expect(catalogDialogue(pack, { ...result, result: { ...result.result!, followedCompanionRecommendation: undefined } }, 'recommendation-failure', id)).toEqual([])
    return
  }
  throw new Error('실패 표본 없음')
})

it('고정 주요 장면은 방문하지 않은 A/B 장소를 전제로 서술하지 않는다', () => {
  const forbidden: Record<string, RegExp> = {
    shelter: /주유소에서|육교에서|세탁소에서|정류장에서/,
    'food-hall': /의류 매장에서|에스컬레이터에서|전자 매장에서|보안실에서/,
    'operating-room': /약제실에서|준비실에서|대기실에서|보안실에서/,
    'train-connection': /역무실에서|승강장에서|전동차에서|제어실에서/,
  }
  for (const [location, pattern] of Object.entries(forbidden)) {
    const event = pack.events.find(e => e.locationIds.includes(location))!
    for (const script of pack.scripts.filter(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)) {
      expect(script.text.join(' ')).not.toMatch(pattern)
    }
  }
  const remembered = pack.scripts.find(s => s.slot === 'scene' && s.text.some(t => t.includes('개찰구 옆에서 확인한')))!
  expect(remembered.conditions).toContainEqual({ kind: 'fact', id: 'subway-map', value: true })
})

it('감염 결말은 실제로 확보한 연구 기록·시료만 회상하고 이전 저장은 원문을 보존한다', () => {
  const initialRun = initial().run
  const event = pack.events.find(e => e.locationIds.includes('infected-lab'))!
  const sceneId = pack.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!.id
  for (const acquired of [false, true]) {
    let found = false
    for (let seed = 1; seed <= 80; seed++) {
      const run = { ...initialRun, rngState: Math.imul(seed, 0x9e3779b9) >>> 0, route: ['infected-lab'], visits: [{ eventId: event.id, locationId: 'infected-lab', sceneScriptId: sceneId }],
        facts: { ...initialRun.facts, 'research-record': acquired, 'research-sample': acquired } }
      const result = executeCatalogAction(pack, run, 'encounter.infected-lab.recover')
      if (result.phase !== 'ending') continue
      const text = catalogDialogue(pack, result, 'infection-ending', result.result!.actionId).join(' ')
      expect(text.length).toBeGreaterThan(10)
      expect(text.includes('시료')).toBe(acquired)
      expect(catalogDialogue(pack, { ...result, phase: 'result' }, 'infection-ending', result.result!.actionId)).toEqual([])
      found = true; break
    }
    expect(found).toBe(true)
  }
  const { origin, run } = initial(old)
  const result = executeCatalogAction(old, run, 'E01.safe')
  const raw = encodeCatalogSave(origin, old, result), restored = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
  const view = catalogGameView(restored.pack, restored.run)
  expect(view.kind === 'result' && view.text.join(' ')).toContain('내가 제안해 놓고')
})
