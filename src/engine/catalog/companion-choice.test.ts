import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { createCatalogClient, createProductClient } from '../../app/catalog-client'
import type { SaveStore } from '../../storage/browser-store'
import { prepareNextCatalogRun } from './inheritance'
import type { CatalogRun, CompanionContext } from '../../domain/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeCompanionChoiceCatalogFixture, makeInterventionCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { resolveCoreAction } from '../actions'
import { companionChoiceId } from './intervention'
import { compileCatalog } from './compile'
import { acknowledgeCatalogResult, catalogChoices, catalogIntervention, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, findCatalogChoice, previewCatalogAction } from './runtime'

const pack = makeCompanionChoiceCatalogFixture()
const origin = makeOrigin(1, 'adventure')
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문 오류')
const input = { ...origin, answers: resolved.value }
const friend = (trust = 0): CompanionContext => ({ name: '동료', trust, traits: { risk: 70, cognition: 70, affect: 70 } })
const route = ['E01.shortcut', 'E02.supplies', 'E03.observe', 'E04.maintain', 'companion:E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal']
function atEvent(id: string, trust = 0): CatalogRun {
  let run = createCatalogRun(pack, { ...input, companion: friend(trust) })
  for (const action of route) {
    if (currentEvent(pack, run).id === id) return run
    run = executeCatalogAction(pack, run, action)
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  throw new Error(id)
}
function extreme(id: string, trust: number, same = false): CatalogRun {
  const run = atEvent(id, trust)
  const policy = currentEvent(pack, run).intervention!
  const pole = policy.extremePole === 'left' ? 0 : 100
  const opposite = policy.extremePole === 'left' ? 70 : 30
  return { ...run, companion: { ...friend(trust), traits: { ...friend().traits, [policy.axis]: same ? pole : opposite } },
    core: { ...run.core, protagonist: { ...run.core.protagonist, traits: { ...run.core.protagonist.traits, [policy.axis]: pole } }, flags: { ...run.core.flags, access: id === 'E07' } } }
}

describe('극단 장면의 독립 동료 선택', () => {
  it.each(['E05', 'E06', 'E07', 'E08', 'E09', 'E10'])('%s: 신뢰 0~100 모두 본인 세 개와 동료 한 개, 일반 반대 명령은 거부한다', id => {
    for (const trust of [0, 29, 39, 40, 50, 100]) {
      const run = extreme(id, trust)
      const before = structuredClone(run)
      const slot = catalogIntervention(pack, run)!
      const own = currentGroup(pack, run)
      const choices = catalogChoices(pack, run)
      expect(choices).toHaveLength(4)
      expect(choices.filter(choice => choice.goalId === own.choices[0].goalId)).toHaveLength(3)
      expect(slot.choice.id).toMatch(/^companion:/)
      expect(previewCatalogAction(pack, run, slot.choice.id).allowed).toBe(true)
      expect(() => executeCatalogAction(pack, run, slot.choice.id.slice('companion:'.length))).toThrow('제공하는 선택')
      expect(() => executeCatalogAction(pack, run, slot.replaceChoiceId)).toThrow('제공하는 선택')
      const result = executeCatalogAction(pack, run, slot.choice.id)
      expect(result.history.at(-1)?.actionId).toBe(slot.choice.id)
      expect(result.result?.resolution.actionId).toBe(slot.choice.id)
      expect(result.companion?.trust).toBe(trust)
      expect(findCatalogChoice(pack, id, slot.choice.id).label).toContain('동료와 함께')
      const view = catalogGameView(pack, run)
      if (view.kind !== 'choice') throw new Error('선택 아님')
      expect(view.actions.filter(action => action.requiresCompanion)).toHaveLength(1)
      expect(run).toEqual(before)
    }
  })

  it.each(['E05', 'E06', 'E07', 'E08', 'E09', 'E10'])('%s: 같은 극단·중립에서도 동료 칸을 유지하고 동료 없이는 네 본인 선택만 제공한다', id => {
    const same = extreme(id, 100, true)
    const policy = currentEvent(pack, same).intervention!
    for (const value of [same.companion!.traits[policy.axis], 50]) {
      const run = { ...same, companion: { ...same.companion!, traits: { ...same.companion!.traits, [policy.axis]: value } } }
      const slot = catalogIntervention(pack, run)!
      expect(slot.choice.id).toBe(companionChoiceId(policy.replaceChoiceId))
      expect(slot.choice.goalId).toBe(currentGroup(pack, run).choices[0].goalId)
      expect(catalogChoices(pack, run)).toHaveLength(4)
      expect(() => executeCatalogAction(pack, { ...run, companion: null }, slot.choice.id)).toThrow()
    }
    const solo = { ...same, companion: null }
    expect(catalogIntervention(pack, solo)).toBeNull()
    expect(catalogChoices(pack, solo)).toEqual(currentGroup(pack, solo).choices)
    for (const ref of policy.alternatives) expect(() => previewCatalogAction(pack, solo, ref.choiceId)).toThrow()
  })

  it('유효 판단 집계의 우선순위와 동료 자체 극단은 유지한다', () => {
    const run = extreme('E09', 0)
    const neutral = { ...run, companion: { ...run.companion!, traits: { risk: 50, cognition: 50, affect: 50 }, judgmentCounts: { rescue: 2, self: 0 } } }
    expect(catalogIntervention(pack, neutral)).toMatchObject({ choice: { id: 'companion:E09.help' }, source: 'judgment-counts', allowed: true })
    expect(catalogIntervention(pack, { ...neutral, companion: { ...neutral.companion, traits: { ...neutral.companion.traits, affect: 0 } } })?.choice.id).toBe('companion:E09.verify')
  })

  it('동료 선택도 원래 행동의 비용·결과·난수를 적용하며 자원 부족은 잠근다', () => {
    const run = extreme('E05', 0)
    const preview = previewCatalogAction(pack, run, 'companion:E05.bypass')
    const direct = resolveCoreAction({ state: run.core, action: preview.action, eventId: 'E05', phase: 'choice', companionPresent: true, cooperating: false }, run.rngState)
    if (!direct.ok) throw new Error(direct.error.message)
    const result = executeCatalogAction(pack, run, 'companion:E05.bypass')
    expect(result.core).toEqual(direct.value.state)
    expect(result.result?.resolution).toEqual(direct.value)
    const changed = structuredClone(pack)
    const choice = changed.events.find(e => e.id === 'E05')!.groups.find(g => g.id === 'normal')!.choices.find(c => c.id === 'E05.bypass')!
    if (choice.behavior.kind !== 'action') throw new Error('행동 아님')
    Object.assign(choice.behavior.variants[0].action.requires, { supply: 1 })
    const validated = compileCatalog(changed)
    const depleted = { ...run, core: { ...run.core, inventory: { ...run.core.inventory, supply: 0 } } }
    expect(previewCatalogAction(validated, depleted, 'companion:E05.bypass').allowed).toBe(false)
  })

  it('신뢰 0의 실제 동료 선택 저장을 재현하고 실행 버전 위조를 거부한다', () => {
    const run = executeCatalogAction(pack, atEvent('E05'), 'companion:E05.bypass')
    const raw = encodeCatalogSave(origin, pack, run)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-choice-1')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
    const forged = JSON.parse(raw)
    forged.runtimeVersion = 'catalog-intervention-1'
    expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
  })

  it('이전 팩은 신뢰 39 잠금과 신뢰 40 허용을 원문 그대로 이어한다', () => {
    const old = makeInterventionCatalogFixture()
    for (const trust of [39, 40]) {
      let run = createCatalogRun(old, { ...input, companion: friend(trust) })
      for (const id of route.slice(0, 4)) {
        run = executeCatalogAction(old, run, id)
        run = acknowledgeCatalogResult(old, run, run.result!.resultId)
      }
      const loaded = decodeCatalogSave(encodeCatalogSave(origin, old, run), resolveAnswers)
      expect(previewCatalogAction(loaded.pack, loaded.run, 'E05.bypass').allowed).toBe(trust === 40)
      expect(() => previewCatalogAction(old, run, 'companion:E05.bypass')).toThrow()
    }
  })

  it('이전 schema8 계승 회차는 구 실행 버전과 팩으로 복원한다', () => {
    const old = makeInterventionCatalogFixture()
    let run = createCatalogRun(old, input)
    for (const id of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain']) {
      run = executeCatalogAction(old, run, id)
      run = acknowledgeCatalogResult(old, run, run.result!.resultId)
    }
    run = executeCatalogAction(old, run, 'E12.short')
    const nextOrigin = { ...origin, runId: 'old-succession' }
    const next = prepareNextCatalogRun(old, run, old, { ...input, runId: nextOrigin.runId }).run
    const raw = encodeCatalogSave(nextOrigin, old, next)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-succession-1')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(next)
  })

  it('새 동료 명령의 저장 실패는 같은 결과로 재시도하며 화면은 성공 뒤만 확정한다', async () => {
    let raw: string | null = encodeCatalogSave(origin, pack, atEvent('E05'))
    let fail = false
    const writes: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(raw).toBe(expected); writes.push(next)
      if (fail) throw new Error('저장 실패')
      raw = next
    } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택 아님')
    const preview = await client.previewAction({ context: before.context, actionId: 'companion:E05.bypass', treatment: 'none' })
    if (!preview.ok) throw new Error(preview.error.message)
    const previous = raw
    fail = true
    expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(raw).toBe(previous)
    expect(client.getSnapshot().view).toEqual(before)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패 아님')
    const attempted = writes.at(-1)
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(raw).toBe(attempted)
    const resumed = createCatalogClient({ store })
    expect((await resumed.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(resumed.getSnapshot().view).toEqual(client.getSnapshot().view)
  })
})
