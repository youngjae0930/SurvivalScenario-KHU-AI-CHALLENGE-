import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { createCatalogClient, createProductClient } from '../../app/catalog-client'
import { catalogGameView } from '../../app/view-models/catalog'
import { readDefaultCatalog as readCurrentCatalog } from '../../content/catalog/registry'
import type { CatalogRun } from '../../domain/catalog'
import { makeFourChoiceCatalogFixture, makeResearchCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { SaveStore } from '../../storage/browser-store'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeResearchCatalogFixture()
function atResearch(inside = true, analysis = false, seed = 1, weapon = false) {
  const source = makeOrigin(seed)
  const origin = { ...source, answers: source.answers.map((answer, i) => analysis && (i === 2 || i === 3) ? { ...answer, answerId: 'a' } : answer) }
  const resolved = resolveAnswers(origin.answers)
  if (!resolved.ok) throw new Error('설문 오류')
  let run = createCatalogRun(pack, { ...origin, answers: resolved.value })
  const actions = [weapon ? 'E01.shortcut' : analysis ? 'E01.plan' : 'E01.safe', 'E02.supplies', 'E03.observe', analysis ? 'E04.organize' : 'E04.rest', inside ? 'E05.explore' : 'E05.bypass', 'E06.withdraw']
  for (const action of actions) {
    run = executeCatalogAction(pack, run, action)
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  return { origin, run }
}
function withCognition(run: CatalogRun, cognition: number): CatalogRun {
  return { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, traits: { ...run.core.protagonist.traits, cognition } } } }
}

describe('E07 병원 선택의 영향과 연구동 자료 조사', () => {
  it('필수 연구동은 병원 이탈 뒤 같은 중반부에서 정확히 한 번 등장한다', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const { route } = planRoute(pack, seed * 17389)
      expect(route.filter(id => id === 'research')).toHaveLength(1)
      expect(route.indexOf('research')).toBeGreaterThan(route.indexOf('hospital-exit'))
      expect(pack.locations.find(location => location.id === 'research')).toMatchObject({ required: true, stage: 'middle' })
    }
  })

  it('같은 설문·seed에서 병원 탐사 성공/우회가 내부 자료실과 외곽 중계기로 이어진다', () => {
    const inside = atResearch().run
    const outside = atResearch(false).run
    expect(inside.core.flags.access).toBe(true)
    expect(currentGroup(pack, inside).id).toBe('inside')
    expect(currentGroup(pack, outside).id).toBe('exterior')
    expect(currentGroup(pack, inside).choices).toHaveLength(4)
    expect(currentGroup(pack, outside).choices).toHaveLength(4)
    const view = catalogGameView(pack, inside)
    expect(view).toMatchObject({ kind: 'choice', context: { eventId: 'E07' } })
    if (view.kind === 'choice') expect(view.notices.join(' ')).toContain('병원에서 확보한 접근로')
    expect(() => executeCatalogAction(pack, outside, 'E07.investigate')).toThrow()
    expect(() => executeCatalogAction(pack, inside, 'E07.dismantle')).toThrow()
  })

  it('내부 접근에 실패한 병원 탐사도 외곽으로 연결된다', () => {
    const { run } = atResearch(true, false, 1495045954)
    expect(run.core.flags.access).toBe(false)
    expect(currentGroup(pack, run).id).toBe('exterior')
  })

  it.each([0, 22, 23, 77, 78, 100])('분석 성향 %i의 극단은 내부에서만 적용하고 외곽은 네 대안을 유지한다', cognition => {
    const inside = withCognition(atResearch().run, cognition)
    const outside = withCognition(atResearch(false).run, cognition)
    expect(currentGroup(pack, inside).id).toBe(cognition <= 22 ? 'extreme' : 'inside')
    expect(currentGroup(pack, outside).id).toBe('exterior')
    for (const base of [inside, outside]) {
      const empty = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, stamina: 0 }, inventory: { supply: 0, medkit: 0, weapon: false } } }
      const group = currentGroup(pack, empty)
      expect(group.choices).toHaveLength(4)
      expect(group.choices.some(choice => previewCatalogAction(pack, empty, choice.id).allowed)).toBe(true)
      if (group.id === 'extreme') expect(new Set(group.choices.map(choice => choice.goalId))).toEqual(new Set(['investigate']))
    }
  })

  it('승인한 비신체·무기 미보정과 내부 +5, 스트레스 보정을 실제 조사 미리보기에 적용한다', () => {
    const { run } = atResearch(true, true)
    for (const choice of currentGroup(pack, run).choices) {
      const normal = previewCatalogAction(pack, run, choice.id)
      const changed = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 0, injury: 2 }, inventory: { ...run.core.inventory, weapon: true } } }
      const impaired = previewCatalogAction(pack, changed, choice.id)
      expect(impaired.check).toEqual(normal.check)
      expect(normal.check.kind).toBe('probability')
      if (normal.check.kind === 'probability') expect(normal.check.probability).toMatchObject({ flag: 5, equipment: 0, condition: 0 })
      const stressed = previewCatalogAction(pack, { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stress: 81 } } }, choice.id)
      if (stressed.check.kind === 'probability') expect(stressed.check.probability.condition).toBe(-10)
    }
  })

  it('무기 분해는 무기를 한 번 소모하고 난수 없이 자료와 분석 변화를 남긴다', () => {
    const { origin, run } = atResearch(false, false, 1, true)
    expect(run.core.inventory.weapon).toBe(true)
    const result = executeCatalogAction(pack, run, 'E07.dismantle')
    expect(result.core.inventory.weapon).toBe(false)
    expect(result.core.flags.data).toBe(true)
    expect(result.core.protagonist.traits.cognition).toBe(run.core.protagonist.traits.cognition - 8)
    expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - 10)
    expect(result.rngState).toBe(run.rngState)
    const loaded = decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers)
    expect(loaded.run).toEqual(result)
    expect(() => executeCatalogAction(pack, result, 'E07.dismantle')).toThrow()
  })

  it('자료 포기는 기존 data를 지우지 않으며 무기가 없으면 분해만 잠긴다', () => {
    const { run } = atResearch(false)
    expect(previewCatalogAction(pack, run, 'E07.dismantle').allowed).toBe(false)
    const carrying = { ...run, core: { ...run.core, flags: { ...run.core.flags, data: true } } }
    const result = executeCatalogAction(pack, carrying, 'E07.abandon')
    expect(result.core.flags.data).toBe(true)
    expect(result.core.protagonist.traits.cognition).toBe(run.core.protagonist.traits.cognition + 8)
    expect(result.rngState).toBe(run.rngState)
    const internal = atResearch().run
    expect(executeCatalogAction(pack, { ...internal, core: { ...internal.core, flags: { ...internal.core.flags, data: true } } }, 'E07.clues').core.flags.data).toBe(true)
  })

  it('모든 일반·극단·외곽 행동의 성패/잠금/문구와 자료 보존을 검사한다', () => {
    const seen = new Set<string>()
    for (const base of [atResearch().run, atResearch(true, true).run, atResearch(false).run]) {
      const run = { ...base, core: { ...base.core, inventory: { supply: 3, medkit: 2, weapon: true } } }
      for (const choice of currentGroup(pack, run).choices) {
        const preview = previewCatalogAction(pack, run, choice.id)
        expect(preview.allowed).toBe(true)
        for (const rngState of [1, 1495045954]) {
          const withData = { ...run, rngState, core: { ...run.core, flags: { ...run.core.flags, data: true } } }
          const result = executeCatalogAction(pack, withData, choice.id)
          expect(result.core.flags.data).toBe(true)
          expect(renderCatalogScript(pack, result, result.result!.resultScriptId).length).toBeGreaterThan(0)
          expect(result.history.at(-1)?.actionId).toBe(choice.id)
        }
        seen.add(choice.id)
      }
    }
    expect(seen).toEqual(new Set(pack.events.find(event => event.id === 'E07')!.groups.flatMap(group => group.choices.map(choice => choice.id))))
  })

  it('극단 조사 성공은 자료·물자를 남기며 도구는 정비와 중복 치료되지 않는다', () => {
    const { run } = atResearch(true, true)
    const injured = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, injury: 1 } } }
    const result = executeCatalogAction(pack, injured, 'E07.prepared')
    expect(result.result!.resolution.check.outcome).toBe('success')
    expect(result.core.flags.data).toBe(true)
    expect(result.core.inventory.supply).toBe(Math.min(3, run.core.inventory.supply + 1))
    expect(result.core.inventory.medkit).toBe(run.core.inventory.medkit - 1)
    expect(result.core.protagonist.injury).toBe(1)
    expect(() => previewCatalogAction(pack, run, 'E07.prepared', true)).toThrow()
  })

  it('실제 선택 경로의 E07 치명 실패는 최종 결과와 실제 E07 대표 행동을 함께 저장한다', () => {
    let found = false
    for (let i = 1; i <= 2000 && !found; i++) {
      const origin = makeOrigin((i * 2654435761) >>> 0)
      const resolved = resolveAnswers(origin.answers)
      if (!resolved.ok) throw new Error('설문 오류')
      let run = createCatalogRun(pack, { ...origin, answers: resolved.value })
      for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest', 'E05.explore', 'E06.withdraw']) {
        run = executeCatalogAction(pack, run, action)
        if (run.phase === 'ending') break
        run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      }
      if (run.phase !== 'choice' || currentEvent(pack, run).id !== 'E07' || !run.core.flags.access || run.core.protagonist.injury !== 2) continue
      const result = executeCatalogAction(pack, run, 'E07.investigate')
      if (result.phase !== 'ending') continue
      found = true
      const raw = encodeCatalogSave(origin, pack, result)
      expect(JSON.parse(raw).legacy.representativeActions).toMatchObject({ E07: 'E07.investigate', E10: null })
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
      const forged = JSON.parse(raw)
      forged.legacy.representativeActions.E07 = 'E07.clues'
      expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
    }
    expect(found).toBe(true)
  })

  it('실제 일곱 사건을 조사 결과/구간 경계까지 저장·복원하고 다음 E08을 표시한다', () => {
    for (const [inside, analysis, action] of [[true, false, 'E07.investigate'], [true, true, 'E07.prepared'], [false, false, 'E07.power']] as const) {
      const { origin, run } = atResearch(inside, analysis)
      const result = executeCatalogAction(pack, run, action)
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
      const complete = acknowledgeCatalogResult(pack, result, result.result!.resultId)
      expect(complete.phase).toBe('segment-complete')
      expect(catalogGameView(pack, complete)).toMatchObject({ kind: 'segment-complete', nextEventId: 'E08' })
      expect(catalogLegacy(pack, complete)).toBeNull()
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, complete), resolveAnswers).run).toEqual(complete)
    }
  })

  it('기존 네 선택 schema6 회차는 연구동을 끼워 넣지 않고 같은 팩·화면으로 이어한다', async () => {
    const old = makeFourChoiceCatalogFixture()
    const origin = makeOrigin()
    const resolved = resolveAnswers(origin.answers)
    if (!resolved.ok) throw new Error('설문 오류')
    const run = createCatalogRun(old, { ...origin, answers: resolved.value })
    const raw = encodeCatalogSave(origin, old, run)
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async () => { throw new Error('재개는 쓰면 안 됨') } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(client.getSnapshot().presentation?.edition).toBe(old.manifest.title)
    expect(client.getSnapshot().presentation?.journey).toHaveLength(6)
    const fresh = createCatalogClient()
    expect(fresh.getSnapshot().presentation?.edition).toBe(readCurrentCatalog().manifest.title)
    expect(fresh.getSnapshot().view.kind).toBe('start')
    expect(currentEvent(old, run).id).toBe('E01')
  })
})
