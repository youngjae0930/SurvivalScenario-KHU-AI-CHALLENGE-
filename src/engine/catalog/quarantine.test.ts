import { describe, expect, it } from 'vitest'
import { createProductClient } from '../../app/catalog-client'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import type { SaveStore } from '../../storage/browser-store'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeCrossingCatalogFixture, makeQuarantineCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeQuarantineCatalogFixture()
function atQuarantine(rational = false, seed = 1, content: CatalogPack = pack) {
  const source = makeOrigin(seed)
  const origin = { ...source, answers: source.answers.map((answer, i) => rational && i >= 4 ? { ...answer, answerId: 'a' } : answer) }
  const resolved = resolveAnswers(origin.answers)
  if (!resolved.ok) throw new Error('설문 오류')
  let run = createCatalogRun(content, { ...origin, answers: resolved.value })
  for (const action of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour']) {
    run = executeCatalogAction(content, run, action)
    run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  return { origin, run }
}
function withActor(run: CatalogRun, affect: number, stamina = 70, injury = 0, stress = 30): CatalogRun {
  return { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina, injury, stress, traits: { ...run.core.protagonist.traits, affect } } } }
}

describe('E09 격리 규칙과 구조 판단', () => {
  it('150개 seed에서 붕괴 통로 뒤 후반부 격리 구역에 도달하고 앞선 여덟 사건의 정의를 보존한다', () => {
    const previous = makeCrossingCatalogFixture()
    for (const key of ['events', 'locations', 'scripts'] as const) {
      for (const entry of previous[key]) expect(pack[key].find(item => item.id === entry.id)).toEqual(entry)
    }
    for (let seed = 1; seed <= 150; seed++) {
      const { route } = planRoute(pack, seed * 17389)
      expect(route.filter(id => id === 'quarantine-zone')).toHaveLength(1)
      expect(route.indexOf('quarantine-zone')).toBeGreaterThan(route.indexOf('collapsed-passage'))
    }
    const { run } = atQuarantine()
    expect(run.history).toHaveLength(8)
    expect(currentEvent(pack, run).id).toBe('E09')
    expect(catalogGameView(pack, run)).toMatchObject({ kind: 'choice', context: { eventId: 'E09' } })
  })

  it.each([0, 22, 23, 77, 78, 100])('affect %i에서 이성 극단만 발동하고 네 선택과 무자원 대안을 유지한다', affect => {
    const run = withActor(atQuarantine().run, affect, 0)
    const empty = { ...run, core: { ...run.core, inventory: { supply: 0, medkit: 0, weapon: false } } }
    const group = currentGroup(pack, empty)
    expect(group.id).toBe(affect <= 22 ? 'extreme' : 'general')
    expect(group.choices).toHaveLength(4)
    expect(group.choices.some(choice => previewCatalogAction(pack, empty, choice.id).allowed)).toBe(true)
    const view = catalogGameView(pack, empty)
    if (view.kind !== 'choice') throw new Error('선택 아님')
    expect(view.actions.filter(action => action.availability.kind === 'locked').every(action => action.availability.kind === 'locked' && action.availability.reasons.length > 0)).toBe(true)
    if (affect <= 22) {
      expect(new Set(group.choices.map(choice => choice.goalId))).toEqual(new Set(['quarantine']))
      expect(() => executeCatalogAction(pack, empty, 'E09.help')).toThrow()
      for (const id of ['E09.discard', 'E09.wrap', 'E09.verify']) expect(previewCatalogAction(pack, empty, id).allowed).toBe(false)
    } else expect(previewCatalogAction(pack, empty, 'E09.aid').allowed).toBe(false)
  })

  it('실제 이성 설문30과 편의점 물자 선택−8이22가 되어 격리 극단을 제공한다', () => {
    const { run } = atQuarantine(true)
    expect(run.core.protagonist.traits.affect).toBe(22)
    expect(currentGroup(pack, run).id).toBe('extreme')
    expect(renderCatalogScript(pack, run, run.visits.at(-1)!.sceneScriptId).join(' ')).toContain('규칙을 지켜')
  })

  it('일반 돕기는 신체 보정을, 격리 극단은 스트레스 보정만 적용하며 무기는 확률을 바꾸지 않는다', () => {
    const normal = atQuarantine().run
    const help = previewCatalogAction(pack, withActor(normal, 50, 19, 2, 81), 'E09.help')
    expect(help.action).toMatchObject({ costs: { stamina: 10, supply: 0, medkit: 0 }, check: { base: 70, physical: true, weaponBonus: false } })
    if (help.check.kind !== 'probability') throw new Error('확률 아님')
    expect(help.check.probability).toMatchObject({ condition: -30, equipment: 0, flag: 0 })
    for (const choice of currentGroup(pack, withActor(normal, 22)).choices) {
      const base = withActor(normal, 22)
      const impaired = { ...withActor(normal, 22, 0, 2), core: { ...withActor(normal, 22, 0, 2).core, inventory: { ...normal.core.inventory, weapon: true } } }
      const preview = previewCatalogAction(pack, base, choice.id)
      expect(preview.action.check).toMatchObject({ physical: false, weaponBonus: false, traitWeights: [{ axis: 'affect', pole: 'left', weight: 1 }] })
      expect(previewCatalogAction(pack, impaired, choice.id).check).toEqual(preview.check)
      const stressed = previewCatalogAction(pack, withActor(normal, 22, 70, 0, 81), choice.id)
      if (stressed.check.kind !== 'probability') throw new Error('확률 아님')
      expect(stressed.check.probability).toMatchObject({ condition: -10, equipment: 0 })
    }
  })

  it('동일 행동의 확률·잠금·효과가 실제 성향·스트레스·자원과 JSON 값에 따라 달라진다', () => {
    const { run } = atQuarantine()
    const calm = previewCatalogAction(pack, withActor(run, 50), 'E09.help')
    const emotional = previewCatalogAction(pack, withActor(run, 70), 'E09.help')
    const stressed = previewCatalogAction(pack, withActor(run, 70, 70, 0, 81), 'E09.help')
    expect(calm.check).toMatchObject({ probability: { percent: 70 } })
    expect(emotional.check).toMatchObject({ probability: { percent: 76 } })
    expect(stressed.check).toMatchObject({ probability: { percent: 66 } })
    const modified = compileCatalog({ ...pack, manifest: { ...pack.manifest, revision: 'parameter-test-only' }, events: pack.events.map(event => event.id !== 'E09' ? event : {
      ...event, groups: event.groups.map(group => ({ ...group, choices: group.choices.map(choice => choice.id !== 'E09.comply' || choice.behavior.kind !== 'action' ? choice : {
        ...choice, behavior: { ...choice.behavior, variants: choice.behavior.variants.map(variant => ({ ...variant, action: { ...variant.action, costs: { ...variant.action.costs, stamina: 17 }, traitDelta: { ...variant.action.traitDelta, affect: -3 }, successEffects: [{ kind: 'add', stat: 'stress', amount: -7 }] } })) },
      }) })) }) })
    const custom = atQuarantine(false, 1, modified).run
    const result = executeCatalogAction(modified, custom, 'E09.comply')
    expect(result.core.protagonist.stamina).toBe(custom.core.protagonist.stamina - 17)
    expect(result.core.protagonist.traits.affect).toBe(custom.core.protagonist.traits.affect - 3)
    expect(result.core.protagonist.stress).toBe(custom.core.protagonist.stress - 7)
  })

  it('규칙 통과는 무추첨이며 E02 판단과 도움 연결을 덮어쓰지 않고 self 집계만 늘린다', () => {
    const { run } = atQuarantine()
    const result = executeCatalogAction(pack, run, 'E09.comply')
    expect(result.rngState).toBe(run.rngState)
    expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - 5)
    expect(result.core.protagonist.traits.affect).toBe(run.core.protagonist.traits.affect - 8)
    expect(result.core.flags).toEqual(run.core.flags)
    expect(result.judgmentCounts).toEqual({ ...run.judgmentCounts, self: run.judgmentCounts.self + 1 })
  })

  it('모든 여덟 행동의 성패·문구·소비·판단 집계를 적용하며 플레이어를 중복 치료하지 않는다', () => {
    const seen = new Set<string>()
    for (const affect of [50, 22]) {
      const base = withActor(atQuarantine().run, affect, 70, 1)
      for (const choice of currentGroup(pack, base).choices) {
        for (const rngState of [1, 16000]) {
          const input = { ...base, rngState }
          const preview = previewCatalogAction(pack, input, choice.id)
          const result = executeCatalogAction(pack, input, choice.id)
          const failure = result.result!.resolution.check.outcome === 'failure'
          expect(result.result!.resolution.check.outcome).toBe(preview.action.check === null ? 'certain' : rngState === 1 ? 'success' : 'failure')
          expect(result.core.inventory.supply).toBe(base.core.inventory.supply - preview.action.costs.supply)
          expect(result.core.inventory.medkit).toBe(base.core.inventory.medkit - preview.action.costs.medkit)
          expect(result.core.protagonist.injury).toBe(failure ? 2 : 1)
          expect(result.core.protagonist.stamina).toBe(base.core.protagonist.stamina - preview.action.costs.stamina)
          expect(result.core.flags).toEqual(base.core.flags)
          expect(result.judgmentCounts.rescue).toBe(base.judgmentCounts.rescue + (choice.judgment === 'rescue' ? 1 : 0))
          expect(result.judgmentCounts.self).toBe(base.judgmentCounts.self + (choice.judgment === 'self' ? 1 : 0))
          expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ').length).toBeGreaterThan(0)
          expect(() => executeCatalogAction(pack, result, choice.id)).toThrow()
          expect(() => previewCatalogAction(pack, input, choice.id, true)).toThrow()
        }
        seen.add(choice.id)
      }
    }
    expect(seen.size).toBe(8)
  })

  it('원문 mental 성공 보상을 스트레스로 반전하고 하한을 지키며 폐기 물자는 회수하지 않는다', () => {
    const normal = withActor(atQuarantine().run, 50, 70, 0, 30)
    const helped = executeCatalogAction(pack, { ...normal, rngState: 1 }, 'E09.help')
    expect(helped.core.protagonist.stress).toBe(20)
    expect(helped.core.flags.rescueDecision).toBe('self')
    expect(helped.judgmentCounts).toEqual({ rescue: 1, self: 1 })
    for (const [id, expected] of [['E09.protect', 20], ['E09.discard', 15]] as const) {
      const run = { ...withActor(normal, 22), rngState: 1 }
      const result = executeCatalogAction(pack, run, id)
      expect(result.core.protagonist.stress).toBe(expected)
      const calm = executeCatalogAction(pack, { ...withActor(run, 22, 70, 0, 3), rngState: 1 }, id)
      expect(calm.core.protagonist.stress).toBe(0)
      if (id === 'E09.discard') {
        expect(result.core.inventory.supply).toBe(run.core.inventory.supply - 1)
        expect(result.core.inventory.weapon).toBe(run.core.inventory.weapon)
      }
    }
    const preview = previewCatalogAction(pack, normal, 'E09.help')
    expect(catalogPreviewView(pack, normal, preview, 'test').outcomes.success.join(' ')).toContain('스트레스 -10')
  })

  it('E08 결과에서 E09로 이동하고 E09 선택/결과/E10 대기를 저장·복원한다', () => {
    for (const rational of [false, true]) {
      const { origin, run } = atQuarantine(rational)
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
      const result = executeCatalogAction(pack, run, rational ? 'E09.discard' : 'E09.comply')
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
      const complete = acknowledgeCatalogResult(pack, result, result.result!.resultId)
      expect(catalogGameView(pack, complete)).toMatchObject({ kind: 'segment-complete', nextEventId: 'E10' })
      expect(catalogLegacy(pack, complete)).toBeNull()
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, complete), resolveAnswers).run).toEqual(complete)
    }
  })

  it('실제 E09 치명 경로의 Legacy에 이번 판단 집계와 원래 E02 판단을 함께 저장한다', () => {
    let found = false
    for (let i = 1; i <= 2000 && !found; i++) {
      const origin = makeOrigin((i * 2654435761) >>> 0)
      const answers = resolveAnswers(origin.answers)
      if (!answers.ok) throw new Error('설문 오류')
      let run = createCatalogRun(pack, { ...origin, answers: answers.value })
      for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour']) {
        run = executeCatalogAction(pack, run, action)
        if (run.phase === 'ending') break
        run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      }
      if (run.phase !== 'choice' || run.core.protagonist.injury !== 2) continue
      const result = executeCatalogAction(pack, run, 'E09.help')
      if (result.phase !== 'ending') continue
      found = true
      expect(catalogLegacy(pack, result)).toMatchObject({ rescueDecision: 'self', judgmentCounts: { rescue: 1, self: 1 }, representativeActions: { E02: 'E02.supplies', E07: 'E07.abandon', E10: null } })
      const raw = encodeCatalogSave(origin, pack, result)
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
      const forged = JSON.parse(raw)
      forged.legacy.judgmentCounts.rescue = 0
      expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
    }
    expect(found).toBe(true)
  })

  it('저장 실패는 격리 결과를 확정하지 않고 동일 후보를 재시도하며 이전8사건 저장도 보존한다', async () => {
    const { origin, run } = atQuarantine(true)
    let raw = encodeCatalogSave(origin, pack, run)
    let fail = true
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
    const preview = await client.previewAction({ context: before.context, actionId: 'E09.discard', treatment: 'none' })
    if (!preview.ok) throw new Error('미리보기 실패')
    const saved = raw
    expect((await client.dispatch({ type: 'execute-action', context: preview.value.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(before)
    expect(raw).toBe(saved)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('실패 아님')
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
    expect(candidates[0]).toBe(candidates[1])
    const loaded = createProductClient({ store })
    expect((await loaded.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(loaded.getSnapshot().view).toEqual(client.getSnapshot().view)
    const old = makeCrossingCatalogFixture()
    const historical = atQuarantine(false, 1, old)
    raw = encodeCatalogSave(historical.origin, old, historical.run)
    const previousRaw = raw
    const previousClient = createProductClient({ store })
    expect((await previousClient.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(raw).toBe(previousRaw)
    expect(previousClient.getSnapshot().presentation?.journey).toHaveLength(8)
    expect(previousClient.getSnapshot().view).toMatchObject({ kind: 'segment-complete', nextEventId: 'E09' })
  })
})
