import { describe, expect, it } from 'vitest'
import { createProductClient } from '../../app/catalog-client'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import type { SaveStore } from '../../storage/browser-store'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeContactCatalogFixture, makeQuarantineCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeContactCatalogFixture()
function atContact(help = false, emotional = false, content: CatalogPack = pack, seed = 1) {
  const source = makeOrigin(seed)
  const origin = { ...source, answers: source.answers.map((answer, i) => emotional && i >= 4 ? { ...answer, answerId: 'b' } : answer) }
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문 오류')
  let run = createCatalogRun(content, { ...origin, answers: answers.value })
  for (const id of ['E01.safe', help ? 'E02.help' : 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', emotional ? 'E09.help' : 'E09.comply']) {
    run = executeCatalogAction(content, run, id)
    run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  return { origin, run }
}
function actor(run: CatalogRun, affect: number, stamina = 70, injury = 0, stress = 30): CatalogRun {
  return { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina, injury, stress, traits: { ...run.core.protagonist.traits, affect } } } }
}

describe('E10 연락망과 구조', () => {
  it('기존 아홉 사건을 보존하고 150개 seed에서 격리 구역 다음의 후반부 통신소를 한 번 방문한다', () => {
    const old = makeQuarantineCatalogFixture()
    for (const key of ['events', 'locations', 'scripts'] as const) {
      for (const entry of old[key]) expect(pack[key].find(item => item.id === entry.id)).toEqual(entry)
    }
    for (let seed = 1; seed <= 150; seed++) {
      const { route } = planRoute(pack, seed * 17389)
      expect(route).toHaveLength(10)
      expect(route.filter(id => id === 'relay-station')).toHaveLength(1)
      expect(route.indexOf('relay-station')).toBe(route.indexOf('quarantine-zone') + 1)
    }
    const { run } = atContact()
    expect(run.history).toHaveLength(9)
    expect(currentEvent(pack, run).id).toBe('E10')
    expect(catalogGameView(pack, run)).toMatchObject({ kind: 'choice', context: { eventId: 'E10' } })
  })

  it.each([false, true])('실제 E02 도움=%s를 E09 뒤에도 보존하며 확인 행동과 열린 통로 정보를 구분한다', help => {
    const { origin, run } = atContact(help)
    expect(run.core.flags.helpEstablished).toBe(help)
    expect(currentGroup(pack, run).id).toBe(help ? 'network' : 'general')
    const id = help ? 'E10.network' : 'E10.signal'
    const preview = previewCatalogAction(pack, run, id)
    expect(preview.check.kind).toBe('certain')
    expect(() => previewCatalogAction(pack, run, help ? 'E10.signal' : 'E10.network')).toThrow()
    const result = executeCatalogAction(pack, run, id)
    expect(result.rngState).toBe(run.rngState)
    expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - 5)
    expect(result.core.protagonist.traits.affect).toBe(run.core.protagonist.traits.affect - 8)
    expect(result.core.protagonist.stress).toBe(run.core.protagonist.stress)
    expect(result.core.flags).toEqual({ ...run.core.flags, routeKnown: help })
    expect(result.judgmentCounts).toEqual({ ...run.judgmentCounts, self: run.judgmentCounts.self + 1 })
    expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ')).toContain(help ? '편의점에서 도왔던' : '알아내지 못했다')
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
  })

  it.each([0, 22, 23, 77, 78, 100])('affect=%i에서 연락망보다 감정 극단이 우선하고 네 선택과 무자원 대안을 유지한다', affect => {
    for (const help of [false, true]) {
      const base = actor(atContact(help).run, affect, 0)
      const empty = { ...base, core: { ...base.core, inventory: { supply: 0, medkit: 0, weapon: false } } }
      const group = currentGroup(pack, empty)
      expect(group.id).toBe(affect >= 78 ? 'extreme' : help ? 'network' : 'general')
      expect(group.choices).toHaveLength(4)
      expect(group.choices.some(choice => previewCatalogAction(pack, empty, choice.id).allowed)).toBe(true)
      if (affect >= 78) expect(group.choices.every(choice => choice.goalId === 'rescue' && choice.judgment === 'rescue')).toBe(true)
      const view = catalogGameView(pack, empty)
      if (view.kind !== 'choice') throw new Error('선택 아님')
      expect(view.actions.filter(choice => choice.availability.kind === 'locked').length).toBeGreaterThan(0)
      for (const choice of view.actions) if (choice.availability.kind === 'locked') expect(choice.availability.reasons.length).toBeGreaterThan(0)
      for (const unavailable of affect >= 78 ? ['E10.network', 'E10.signal', 'E10.beacon'] : ['E10.rush', 'E10.haul']) {
        expect(() => previewCatalogAction(pack, empty, unavailable)).toThrow()
      }
    }
  })

  it('설문 감정70→E02 도움78→E09 돕기86의 실제 경로에서 감정 극단과 조건 문구를 선택한다', () => {
    const { origin, run } = atContact(true, true)
    expect(run.core.protagonist.traits.affect).toBe(86)
    expect(currentGroup(pack, run).id).toBe('extreme')
    expect(renderCatalogScript(pack, run, run.visits.at(-1)!.sceneScriptId).join(' ')).toContain('먼저 그 사람을 꺼내야')
    expect(() => executeCatalogAction(pack, run, 'E10.network')).toThrow()
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
  })

  it('일반·극단 구조 모두 선택 전 체력·부상·스트레스·감정으로 판정하고 무기/접근 보정을 넣지 않는다', () => {
    for (const [affect, id, base, trait] of [[50, 'E10.rescue', 70, 0], [78, 'E10.rush', 60, 8]] as const) {
      const normal = actor(atContact().run, affect)
      expect(previewCatalogAction(pack, normal, id).check).toMatchObject({ probability: { base, trait, condition: 0, equipment: 0, flag: 0, percent: base + trait } })
      const impaired = actor(normal, affect, 19, 2, 81)
      const armed = { ...impaired, core: { ...impaired.core, inventory: { ...impaired.core.inventory, weapon: true }, flags: { ...impaired.core.flags, access: true } } }
      const preview = previewCatalogAction(pack, armed, id)
      expect(preview.check).toMatchObject({ probability: { condition: -30, equipment: 0, flag: 0, percent: base + trait - 30 } })
      expect(preview.action.check).toMatchObject({ physical: true, weaponBonus: false })
    }
  })

  it('아홉 행동의 성패·비용·보상·의도 집계를 적용하며 도움 이력과 기존 통로 정보를 보존한다', () => {
    const seen = new Set<string>()
    for (const help of [false, true]) for (const affect of [50, 78]) {
      const source = actor(atContact(help).run, affect, 70, 1)
      const run = { ...source, core: { ...source.core, inventory: { ...source.core.inventory, supply: 2 } } }
      for (const choice of currentGroup(pack, run).choices) for (const rngState of [1, 16000]) {
        const input = { ...run, rngState }
        const preview = previewCatalogAction(pack, input, choice.id)
        const result = executeCatalogAction(pack, input, choice.id)
        const failed = result.result!.resolution.check.outcome === 'failure'
        expect(result.result!.resolution.check.outcome).toBe(preview.action.check === null ? 'certain' : rngState === 1 ? 'success' : 'failure')
        expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - preview.action.costs.stamina)
        const rescued = choice.judgment === 'rescue' && !failed
        expect(result.core.inventory.supply).toBe(run.core.inventory.supply - preview.action.costs.supply + (rescued ? 1 : 0))
        expect(result.core.inventory.medkit).toBe(run.core.inventory.medkit - preview.action.costs.medkit)
        expect(result.core.protagonist.injury).toBe(failed ? 2 : 1)
        expect(result.core.protagonist.traits.affect).toBe(affect + (choice.judgment === 'rescue' ? 8 : -8))
        expect(result.judgmentCounts.rescue).toBe(run.judgmentCounts.rescue + (choice.judgment === 'rescue' ? 1 : 0))
        expect(result.judgmentCounts.self).toBe(run.judgmentCounts.self + (choice.judgment === 'self' ? 1 : 0))
        expect(result.core.flags).toEqual({ ...run.core.flags, routeKnown: choice.id === 'E10.network' })
        expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ').length).toBeGreaterThan(0)
        expect(result.companion).toBeNull()
        expect(() => executeCatalogAction(pack, result, choice.id)).toThrow()
        expect(() => previewCatalogAction(pack, input, choice.id, true)).toThrow()
        seen.add(choice.id)
      }
    }
    expect(seen.size).toBe(9)
    const known = { ...atContact().run, core: { ...atContact().run.core, flags: { ...atContact().run.core.flags, routeKnown: true } } }
    expect(executeCatalogAction(pack, known, 'E10.signal').core.flags.routeKnown).toBe(true)
  })

  it('극단 성공 mental 보상을 반전해 즉시형−5/준비형−10을 합산하고 자원·성향 상한을 지킨다', () => {
    const run = { ...actor(atContact().run, 100), rngState: 1 }
    for (const [id, stress] of [['E10.rush', 25], ['E10.prepare', 20], ['E10.wrap', 20], ['E10.haul', 25]] as const) {
      const result = executeCatalogAction(pack, run, id)
      expect(result.core.protagonist.stress).toBe(stress)
      expect(result.core.protagonist.traits.affect).toBe(100)
      const calm = executeCatalogAction(pack, actor(run, 100, 70, 0, 3), id)
      expect(calm.core.protagonist.stress).toBe(0)
    }
    const supplyFull = { ...run, core: { ...run.core, inventory: { ...run.core.inventory, supply: 3 } } }
    expect(executeCatalogAction(pack, supplyFull, 'E10.rush').core.inventory.supply).toBe(3)
    const view = catalogPreviewView(pack, run, previewCatalogAction(pack, run, 'E10.rush'), 'preview')
    expect(view.outcomes.success.join(' ')).toContain('스트레스 -5')
    expect(view.outcomes.success.join(' ')).toContain('물자 +1')
  })

  it('E10의 선택·결과·E11 대기 상태를 재현하며 대기에서 결말/계승을 만들지 않는다', () => {
    for (const [help, emotional, id] of [[false, false, 'E10.signal'], [true, false, 'E10.network'], [true, true, 'E10.wrap']] as const) {
      const { origin, run } = atContact(help, emotional)
      const result = executeCatalogAction(pack, run, id)
      const complete = acknowledgeCatalogResult(pack, result, result.result!.resultId)
      for (const checkpoint of [run, result, complete]) expect(decodeCatalogSave(encodeCatalogSave(origin, pack, checkpoint), resolveAnswers).run).toEqual(checkpoint)
      expect(complete.history).toHaveLength(10)
      expect(catalogGameView(pack, complete)).toMatchObject({ kind: 'segment-complete', nextEventId: 'E11' })
      expect(catalogLegacy(pack, complete)).toBeNull()
    }
  })

  it('실제 E10 치명 경로에 E02/E09/E10 집계와 E10 대표 선택을 저장하며 조작 기록을 거부한다', () => {
    let found = false
    for (let i = 1; i <= 2000 && !found; i++) {
      const origin = makeOrigin((i * 2654435761) >>> 0)
      const answers = resolveAnswers(origin.answers)
      if (!answers.ok) throw new Error('설문 오류')
      let run = createCatalogRun(pack, { ...origin, answers: answers.value })
      for (const id of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply']) {
        run = executeCatalogAction(pack, run, id)
        if (run.phase === 'ending') break
        run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      }
      if (run.phase !== 'choice' || run.core.protagonist.injury !== 2) continue
      const result = executeCatalogAction(pack, run, 'E10.rescue')
      if (result.phase !== 'ending') continue
      found = true
      expect(catalogLegacy(pack, result)).toMatchObject({ rescueDecision: 'self', judgmentCounts: { rescue: 1, self: 2 }, representativeActions: { E02: 'E02.supplies', E07: 'E07.abandon', E10: 'E10.rescue' } })
      const raw = encodeCatalogSave(origin, pack, result)
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
      const forged = JSON.parse(raw)
      forged.legacy.representativeActions.E10 = 'E10.network'
      expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
    }
    expect(found).toBe(true)
  })

  it('연락망 저장 실패 시 기존 화면/저장을 유지하고 동일 결과만 재시도한다', async () => {
    const { origin, run } = atContact(true)
    let raw = encodeCatalogSave(origin, pack, run)
    let fail = true
    const attempts: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(expected).toBe(raw)
      attempts.push(next)
      if (fail) throw new Error('quota')
      raw = next
    } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택 아님')
    const preview = await client.previewAction({ context: before.context, actionId: 'E10.network', treatment: 'none' })
    if (!preview.ok) throw new Error('미리보기 실패')
    const saved = raw
    expect((await client.dispatch({ type: 'execute-action', context: preview.value.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(before)
    expect(raw).toBe(saved)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
    expect(attempts[0]).toBe(attempts[1])
    const loaded = createProductClient({ store })
    expect((await loaded.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(loaded.getSnapshot().view).toEqual(client.getSnapshot().view)
    expect(decodeCatalogSave(raw, resolveAnswers).run.core.flags.routeKnown).toBe(true)
  })

  it('이전 아홉 사건 저장은 읽기만으로 갱신하지 않으며 E10을 삽입하지 않는다', async () => {
    const old = makeQuarantineCatalogFixture()
    const { origin, run } = atContact(true, false, old)
    const raw = encodeCatalogSave(origin, old, run)
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async () => { throw new Error('기존 저장 변경 금지') } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(client.getSnapshot().presentation?.journey).toHaveLength(9)
    expect(client.getSnapshot().view).toMatchObject({ kind: 'segment-complete', nextEventId: 'E10' })
    expect(decodeCatalogSave(raw, resolveAnswers).pack.manifest.revision).toBe('catalog-quarantine-1')
  })
})
