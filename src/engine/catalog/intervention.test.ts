import { describe, expect, it } from 'vitest'
import { createCatalogClient, createProductClient } from '../../app/catalog-client'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import type { GameClient } from '../../contracts'
import type { CatalogRun, CompanionContext } from '../../domain/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { SaveStore } from '../../storage/browser-store'
import { makeEscapeCatalogFixture, makeInterventionCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { catalogChoices, catalogIntervention, currentEvent, currentGroup, createCatalogRun, executeCatalogAction, acknowledgeCatalogResult, previewCatalogAction } from './runtime'

const pack = makeInterventionCatalogFixture()
const origin = makeOrigin(1, 'adventure')
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문 오류')
const input = { ...origin, answers: answers.value }
const companion = (trust = 40): CompanionContext => ({ name: '동료', trust, traits: { risk: 70, cognition: 70, affect: 70 } })
const route = ['E01.shortcut', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal']
function atEvent(id: string, friend = companion()): CatalogRun {
  let run = createCatalogRun(pack, { ...input, companion: friend })
  for (const action of route) {
    if (currentEvent(pack, run).id === id) return run
    run = executeCatalogAction(pack, run, action)
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  throw new Error(`도달하지 못함: ${id}`)
}
function extreme(id: string, trust = 40): CatalogRun {
  const run = atEvent(id)
  const policy = pack.events.find(event => event.id === id)!.intervention!
  return { ...run, companion: { ...companion(trust), traits: { ...companion().traits, [policy.axis]: policy.extremePole === 'left' ? 70 : 30 } },
    core: { ...run.core, protagonist: { ...run.core.protagonist, traits: { ...run.core.protagonist.traits, [policy.axis]: policy.extremePole === 'left' ? 22 : 78 } }, flags: { ...run.core.flags, access: id === 'E07' } } }
}

describe('신뢰에 따른 반대 목표 제지', () => {
  it('기존 12사건의 행동·문구는 유지하고 제지 메타데이터만 추가한다', () => {
    const old = makeEscapeCatalogFixture()
    expect(pack.locations).toEqual(old.locations)
    expect(pack.scripts).toEqual(old.scripts)
    for (const event of pack.events) {
      const { intervention: _, ...base } = event
      expect(base).toEqual(old.events.find(item => item.id === event.id))
    }
  })

  it.each(['E05', 'E06', 'E07', 'E08', 'E09', 'E10'])('%s의 29/30/31/39/40/100 경계: 세 방식+대안 하나, 신뢰와 물리 조건을 분리한다', id => {
    for (const trust of [29, 30, 31, 39, 40, 100]) {
      const run = extreme(id, trust)
      const before = structuredClone(run)
      const intervention = catalogIntervention(pack, run)!
      const group = currentGroup(pack, run)
      const choices = catalogChoices(pack, run)
      expect(choices).toHaveLength(4)
      expect(choices.filter(choice => choice.goalId === group.choices[0].goalId)).toHaveLength(3)
      expect(choices.filter(choice => choice.goalId !== group.choices[0].goalId)).toHaveLength(1)
      expect(choices.some(choice => choice.id === intervention.replaceChoiceId)).toBe(false)
      const preview = previewCatalogAction(pack, run, intervention.choice.id)
      expect(preview.allowed).toBe(trust >= 40)
      if (trust < 40) {
        expect(preview.reasons.join(' ')).toContain('신뢰 40')
        expect(() => executeCatalogAction(pack, run, intervention.choice.id)).toThrow('신뢰 40')
      } else {
        const result = executeCatalogAction(pack, run, intervention.choice.id)
        expect(result.history.at(-1)?.actionId).toBe(intervention.choice.id)
        expect(result.history.at(-1)?.judgment).toBe(intervention.choice.judgment)
        expect(result.companion?.trust).toBe(trust)
      }
      expect(() => executeCatalogAction(pack, run, intervention.replaceChoiceId)).toThrow('제공하는 선택')
      const view = catalogGameView(pack, run)
      if (view.kind !== 'choice') throw new Error('선택 아님')
      expect(view.actions.filter(action => action.recommended)).toHaveLength(1)
      expect(view.actions.find(action => action.recommended)?.requiresCompanion).toBe(true)
      expect(run).toEqual(before)
    }
  })

  it('동료 없음·같은 방향·중립 50에서는 임의 추천/대안 없이 원래 네 방식을 유지한다', () => {
    for (const id of ['E05', 'E06', 'E07', 'E08', 'E09', 'E10']) {
      const source = extreme(id)
      const axis = currentEvent(pack, source).intervention!.axis
      for (const friend of [null, { ...companion(), traits: { ...source.core.protagonist.traits } }, { ...companion(), traits: { ...companion().traits, [axis]: 50 } }]) {
        const run = { ...source, companion: friend }
        expect(catalogIntervention(pack, run)).toBeNull()
        expect(catalogChoices(pack, run)).toEqual(currentGroup(pack, run).choices)
      }
    }
  })

  it('E09/E10은 유효한 집계가 성향보다 먼저이며 동료 지정 극단을 덮어쓰지 않는다', () => {
    for (const id of ['E09', 'E10']) {
      const run = extreme(id)
      const source = id === 'E09' ? { rescue: 2, self: 0 } : { rescue: 0, self: 2 }
      const neutral = { ...run, companion: { ...companion(), traits: { risk: 50, cognition: 50, affect: 50 }, judgmentCounts: source } }
      expect(catalogIntervention(pack, neutral)?.source).toBe('judgment-counts')
      expect(catalogIntervention(pack, { ...neutral, companion: { ...neutral.companion, judgmentCounts: { rescue: 2, self: 1 } } })).toBeNull()
      expect(catalogIntervention(pack, { ...neutral, companion: { ...neutral.companion, traits: { ...neutral.companion.traits, affect: id === 'E09' ? 22 : 78 } } })).toBeNull()
    }
  })

  it('E10의 연락망 보유 여부에 맞는 확인 행동 하나만 제안한다', () => {
    for (const helpEstablished of [false, true]) {
      const source = extreme('E10')
      const run = { ...source, core: { ...source.core, flags: { ...source.core.flags, helpEstablished } } }
      expect(catalogIntervention(pack, run)?.choice.id).toBe(helpEstablished ? 'E10.network' : 'E10.signal')
    }
  })

  it('신뢰가 충분해도 콘텐츠의 자원 요구를 우회하지 않는다', () => {
    const changed = structuredClone(pack)
    const choice = changed.events.find(event => event.id === 'E05')!.groups.find(group => group.id === 'normal')!.choices.find(item => item.id === 'E05.bypass')!
    if (choice.behavior.kind !== 'action') throw new Error('행동 아님')
    Object.assign(choice.behavior.variants[0].action.requires, { supply: 1 })
    const validated = compileCatalog(changed)
    const source = extreme('E05', 100)
    const run = { ...source, core: { ...source.core, inventory: { ...source.core.inventory, supply: 0 } } }
    expect(previewCatalogAction(validated, run, 'E05.bypass').allowed).toBe(false)
    expect(() => executeCatalogAction(validated, run, 'E05.bypass')).toThrow()
  })

  it('새 동행 저장은 최초 동료 입력과 실제 제지 실행을 재현하며 이전 단독 저장도 보존한다', () => {
    for (const trust of [39, 40]) {
      const run = atEvent('E05', companion(trust))
      expect(run.core.protagonist.traits.risk).toBe(22)
      const raw = encodeCatalogSave(origin, pack, run)
      expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 7, kind: 'catalog-companion', runtimeVersion: 'catalog-intervention-1' })
      const loaded = decodeCatalogSave(raw, resolveAnswers)
      expect(loaded.run).toEqual(run)
      expect(previewCatalogAction(loaded.pack, loaded.run, 'E05.bypass').allowed).toBe(trust === 40)
      if (trust === 40) {
        const result = executeCatalogAction(pack, run, 'E05.bypass')
        expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
        const forged = JSON.parse(encodeCatalogSave(origin, pack, result))
        forged.companionOrigin.trust = 39
        expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
      }
    }
    const old = makeEscapeCatalogFixture()
    const run = createCatalogRun(old, input)
    const raw = encodeCatalogSave(origin, old, run)
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 6, runtimeVersion: 'catalog-runtime-2' })
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
  })

  it('잘못된 교체·동일 목표 대안·축 매핑과 동료 입력을 거부한다', () => {
    for (const changes of [{ replaceChoiceId: 'missing' }, { axis: 'affect' }, { alternatives: [{ groupId: 'normal', choiceId: 'E05.explore' }] }]) {
      const changed = structuredClone(pack)
      Object.assign(changed.events.find(event => event.id === 'E05')!.intervention!, changes)
      expect(() => compileCatalog(changed)).toThrow()
    }
    for (const corrupt of [{ ...companion(), trust: -1 }, { ...companion(), judgmentCounts: { rescue: 3, self: 1 } }, { ...companion(), ending: 'death' }]) {
      expect(() => createCatalogRun(pack, { ...input, companion: corrupt })).toThrow()
    }
  })

  it('저장 실패는 같은 제지 결과로 재시도하고 제품 클라이언트에서 이어한다', async () => {
    let raw: string | null = null
    let fail = false
    const writes: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(raw).toBe(expected); writes.push(next)
      if (fail) throw new Error('쓰기 실패')
      raw = next
    } }
    const client = createCatalogClient({ pack, store, companion: companion(), makeSeed: () => origin.seed, makeRunId: () => origin.runId })
    expect((await client.dispatch({ type: 'start-run', name: origin.name, answers: origin.answers })).ok).toBe(true)
    async function execute(client: GameClient, actionId: string) {
      const view = client.getSnapshot().view
      if (view.kind !== 'choice') throw new Error('선택 아님')
      const preview = await client.previewAction({ context: view.context, actionId, treatment: 'none' })
      if (!preview.ok) throw new Error(preview.error.message)
      return client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })
    }
    for (const action of route.slice(0, 4)) {
      expect((await execute(client, action)).ok).toBe(true)
      const result = client.getSnapshot().view
      if (result.kind !== 'result') throw new Error('결과 아님')
      expect((await client.dispatch({ type: 'acknowledge-result', context: result.context, resultId: result.resultId })).ok).toBe(true)
    }
    const previous = raw
    const before = client.getSnapshot().view
    fail = true
    expect((await execute(client, 'E05.bypass')).ok).toBe(false)
    expect(raw).toBe(previous)
    expect(client.getSnapshot().view).toEqual(before)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패 아님')
    const attempted = writes.at(-1)
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(raw).toBe(attempted)
    expect(writes.at(-1)).toBe(attempted)
    const resumed = createProductClient({ store })
    expect((await resumed.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(resumed.getSnapshot().view).toEqual(client.getSnapshot().view)
  })
})
