import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { createProductClient } from '../../app/catalog-client'
import { catalogGameView } from '../../app/view-models/catalog'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { makeCrossingCatalogFixture, makeResearchCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import type { SaveStore } from '../../storage/browser-store'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeCrossingCatalogFixture()
function atCrossing(intuition = false, seed = 1, content: CatalogPack = pack) {
  const source = makeOrigin(seed)
  const origin = { ...source, answers: source.answers.map((answer, i) => intuition && (i === 2 || i === 3) ? { ...answer, answerId: 'b' } : answer) }
  const resolved = resolveAnswers(origin.answers)
  if (!resolved.ok) throw new Error('설문 오류')
  let run = createCatalogRun(content, { ...origin, answers: resolved.value })
  for (const action of ['E01.safe', 'E02.supplies', intuition ? 'E03.cross' : 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon']) {
    run = executeCatalogAction(content, run, action)
    run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  return { origin, run }
}
function withActor(run: CatalogRun, cognition: number, stamina = 70, injury = 0, stress = 30): CatalogRun {
  return { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina, injury, stress, traits: { ...run.core.protagonist.traits, cognition } } } }
}

describe('E08 붕괴 통로와 체력 보존', () => {
  it('새 팩에서도 앞선 일곱 사건의 행동과 문구 정의는 그대로 유지한다', () => {
    const previous = makeResearchCatalogFixture()
    for (const event of previous.events) expect(pack.events.find(item => item.id === event.id)).toEqual(event)
    for (const script of previous.scripts) expect(pack.scripts.find(item => item.id === script.id)).toEqual(script)
    for (const location of previous.locations) expect(pack.locations.find(item => item.id === location.id)).toEqual(location)
  })
  it('150개 seed에서 연구동 뒤에 필수 통로를 정확히 한 번 방문한다', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const { route } = planRoute(pack, seed * 17389)
      expect(route.filter(id => id === 'collapsed-passage')).toHaveLength(1)
      expect(route.indexOf('collapsed-passage')).toBeGreaterThan(route.indexOf('research'))
    }
    const { run } = atCrossing()
    expect(run.history).toHaveLength(7)
    expect(currentEvent(pack, run).id).toBe('E08')
    expect(catalogGameView(pack, run)).toMatchObject({ kind: 'choice', context: { eventId: 'E08' } })
  })

  it.each([0, 22, 23, 77, 78, 100])('cognition %i에서 직관 극단만 발동하며 네 선택과 무자원 대안을 유지한다', cognition => {
    const run = withActor(atCrossing().run, cognition, 0)
    const empty = { ...run, core: { ...run.core, inventory: { supply: 0, medkit: 0, weapon: false } } }
    const group = currentGroup(pack, empty)
    expect(group.id).toBe(cognition >= 78 ? 'extreme' : 'general')
    expect(group.choices).toHaveLength(4)
    expect(group.choices.some(choice => previewCatalogAction(pack, empty, choice.id).allowed)).toBe(true)
    if (cognition >= 78) {
      expect(new Set(group.choices.map(choice => choice.goalId))).toEqual(new Set(['cross']))
      expect(previewCatalogAction(pack, empty, 'E08.gap').allowed).toBe(false)
      expect(previewCatalogAction(pack, empty, 'E08.support').allowed).toBe(false)
      expect(previewCatalogAction(pack, empty, 'E08.squeeze').allowed).toBe(false)
      expect(() => executeCatalogAction(pack, empty, 'E08.inspect')).toThrow()
    }
  })

  it('실제 설문과 선택 경로로 직관 극단에 도달한다', () => {
    const { run } = atCrossing(true)
    expect(run.core.protagonist.traits.cognition).toBe(86)
    expect(currentGroup(pack, run).id).toBe('extreme')
    expect(renderCatalogScript(pack, run, run.visits.at(-1)!.sceneScriptId).join(' ')).toContain('지금 건너야')
  })

  it('일반 분석/직관과 극단 원문 수치 및 신체 보정·무기 미보정을 유지한다', () => {
    for (const [actionId, cognition, base, pole, stamina, supply, reward] of [
      ['E08.inspect', 50, 70, 'left', 10, 0, 0],
      ['E08.instinct', 50, 70, 'right', 10, 0, 5],
      ['E08.leap', 78, 60, 'right', 15, 0, 15],
      ['E08.gap', 78, 75, 'right', 10, 1, 15],
    ] as const) {
      const run = withActor(atCrossing().run, cognition)
      const preview = previewCatalogAction(pack, run, actionId)
      expect(preview.action).toMatchObject({ costs: { stamina, supply }, check: { base, physical: true, weaponBonus: false, traitWeights: [{ axis: 'cognition', pole, weight: 1 }] } })
      expect(preview.action.traitDelta.cognition).toBe(pole === 'left' ? -8 : 8)
      expect(preview.action.successEffects.filter(effect => effect.kind === 'add' && effect.stat === 'stamina')).toEqual(reward ? [{ kind: 'add', stat: 'stamina', amount: reward }] : [])
      const impaired = withActor(run, cognition, 19, 2, 81)
      const armed = { ...impaired, core: { ...impaired.core, inventory: { ...impaired.core.inventory, weapon: true } } }
      const check = previewCatalogAction(pack, armed, actionId).check
      expect(check.kind).toBe('probability')
      if (check.kind === 'probability') expect(check.probability).toMatchObject({ condition: -30, equipment: 0, flag: 0 })
      expect(previewCatalogAction(pack, impaired, actionId).check).toEqual(check)
    }
  })

  it('성공 보상은 비용과 순합산하며 체력0에서도 즉시형 성공은0, 준비형 성공은5다', () => {
    for (const [cognition, actionId, stamina, expected] of [[50, 'E08.instinct', 70, 65], [78, 'E08.leap', 0, 0], [78, 'E08.gap', 0, 5], [78, 'E08.gap', 100, 100]] as const) {
      const run = { ...withActor(atCrossing().run, cognition, stamina), rngState: 1 }
      const result = executeCatalogAction(pack, run, actionId)
      expect(result.result!.resolution.check.outcome).toBe('success')
      expect(result.core.protagonist.stamina).toBe(expected)
      if (actionId === 'E08.leap') expect(result.core.protagonist.stress).toBe(35)
      if (actionId === 'E08.gap') expect(result.core.inventory.supply).toBe(1)
    }
  })

  it('각 여덟 행동의 성공/실패 문구와 비용·부상·자료/경로 불변을 확인한다', () => {
    const seen = new Set<string>()
    for (const cognition of [50, 78]) {
      const run = withActor(atCrossing().run, cognition)
      for (const choice of currentGroup(pack, run).choices) {
        const preview = previewCatalogAction(pack, run, choice.id)
        expect(preview.allowed).toBe(true)
        for (const rngState of [1, 15000]) {
          const input = { ...run, rngState }
          const result = executeCatalogAction(pack, input, choice.id)
          const outcome = result.result!.resolution.check.outcome
          expect(outcome).toBe(preview.action.check === null ? 'certain' : rngState === 1 ? 'success' : 'failure')
          expect(result.core.inventory.supply).toBe(run.core.inventory.supply - preview.action.costs.supply)
          expect(result.core.flags).toEqual(run.core.flags)
          expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ').length).toBeGreaterThan(0)
          if (outcome === 'failure') {
            expect(result.core.protagonist.injury).toBe(1)
            expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - preview.action.costs.stamina)
          }
          expect(() => executeCatalogAction(pack, result, choice.id)).toThrow()
        }
        seen.add(choice.id)
      }
    }
    expect(seen.size).toBe(8)
  })

  it('긴 통로는 확정 행동이며 탈출 우회 경로를 만들거나 난수를 소비하지 않는다', () => {
    const { run } = atCrossing()
    const result = executeCatalogAction(pack, run, 'E08.detour')
    expect(result.rngState).toBe(run.rngState)
    expect(result.core.flags.routeKnown).toBe(false)
    expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - 20)
    expect(result.core.protagonist.traits.cognition).toBe(run.core.protagonist.traits.cognition - 8)
  })

  it('여덟 사건의 E07 다음 이동·E08 선택/결과/경계를 저장·복원하고 E09를 대기한다', () => {
    for (const intuition of [false, true]) {
      const { origin, run } = atCrossing(intuition)
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
      const result = executeCatalogAction(pack, run, intuition ? 'E08.gap' : 'E08.detour')
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
      const complete = acknowledgeCatalogResult(pack, result, result.result!.resultId)
      expect(catalogGameView(pack, complete)).toMatchObject({ kind: 'segment-complete', nextEventId: 'E09' })
      expect(catalogLegacy(pack, complete)).toBeNull()
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, complete), resolveAnswers).run).toEqual(complete)
    }
  })

  it('E08 실제 치명 경로의 Legacy는 E07 실제 기록을 보존하고 E08을 대표 슬롯으로 만들지 않는다', () => {
    let found = false
    for (let i = 1; i <= 2000 && !found; i++) {
      const origin = makeOrigin((i * 2654435761) >>> 0)
      const resolved = resolveAnswers(origin.answers)
      if (!resolved.ok) throw new Error('설문 오류')
      let run = createCatalogRun(pack, { ...origin, answers: resolved.value })
      for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon']) {
        run = executeCatalogAction(pack, run, action)
        if (run.phase === 'ending') break
        run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      }
      if (run.phase !== 'choice' || run.core.protagonist.injury !== 2) continue
      const result = executeCatalogAction(pack, run, 'E08.inspect')
      if (result.phase !== 'ending') continue
      found = true
      expect(catalogLegacy(pack, result)?.representativeActions).toEqual({ E02: 'E02.supplies', E07: 'E07.abandon', E10: null })
      const raw = encodeCatalogSave(origin, pack, result)
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
      const forged = JSON.parse(raw)
      forged.checkpoint.core.protagonist.injury = 2
      expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
    }
    expect(found).toBe(true)
  })

  it('저장 실패 시 E08 결과를 노출하지 않고 같은 후보를 재시도한다', async () => {
    const { origin, run } = atCrossing(true)
    let raw = encodeCatalogSave(origin, pack, run)
    let fail = false
    const candidates: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(expected).toBe(raw)
      candidates.push(next)
      if (fail) throw new Error('quota')
      raw = next
    } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택 아님')
    const preview = await client.previewAction({ context: before.context, actionId: 'E08.gap', treatment: 'none' })
    if (!preview.ok) throw new Error('미리보기 실패')
    fail = true
    const saved = raw
    expect((await client.dispatch({ type: 'execute-action', context: preview.value.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(raw).toBe(saved)
    expect(client.getSnapshot().view).toBe(before)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toBe(candidates[1])
    const resumed = createProductClient({ store })
    expect((await resumed.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(resumed.getSnapshot().view).toEqual(client.getSnapshot().view)
  })

  it('이전 연구동 팩은 E08을 삽입하지 않고 일곱 사건과 E08 대기를 그대로 복원한다', async () => {
    const old = makeResearchCatalogFixture()
    const { origin, run } = atCrossing(false, 1, old)
    expect(run.phase).toBe('segment-complete')
    let raw = encodeCatalogSave(origin, old, run)
    const saved = raw
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (_, next) => { raw = next } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(raw).toBe(saved)
    expect(client.getSnapshot().presentation?.journey).toHaveLength(7)
    expect(client.getSnapshot().view).toMatchObject({ kind: 'segment-complete', nextEventId: 'E08' })
  })
})
