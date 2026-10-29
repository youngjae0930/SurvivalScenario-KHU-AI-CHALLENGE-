import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { createProductClient } from '../../app/catalog-client'
import { makeDialogueCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import type { CatalogPack, CatalogRun, CompanionContext } from '../../domain/catalog'
import { makeOrigin } from '../../test/opening-paths'
import { makeRecommendationCatalogFixture, makeVariableChoicesCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { RunOrigin } from '../../storage/opening-save'
import type { SaveStore } from '../../storage/browser-store'
import { isCatalogLegacy, prepareNextCatalogRun } from './inheritance'
import { isDecisionMemory } from './decision-memory'
import { acknowledgeCatalogResult, catalogChoices, catalogDecisionSituation, catalogLegacy, createCatalogRun, currentEvent, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const origin = { ...makeOrigin(), runId: 'memory-first', name: '첫 인물' }
const friend: CompanionContext = { name: '동료', trust: 50, traits: { risk: 70, cognition: 70, affect: 70 } }
const safe = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain', 'E12.short']
function input(source = origin) {
  const answers = resolveAnswers(source.answers)
  if (!answers.ok) throw new Error('설문')
  return { ...source, answers: answers.value }
}
function at(id: string, companion: CompanionContext | null = null, content = pack, source = origin) {
  let run = createCatalogRun(content, { ...input(source), companion })
  for (const action of safe) {
    if (currentEvent(content, run).id === id) return run
    run = executeCatalogAction(content, run, action)
    if (run.phase === 'result') run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  throw new Error(id)
}
function finish(initial: CatalogRun, content: CatalogPack = pack) {
  let run = initial
  for (const action of safe.slice(run.visitIndex)) {
    run = executeCatalogAction(content, run, action)
    if (run.phase === 'result') run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  return run
}

describe('이전 선택 당시 상황의 보존', () => {
  it('현재 상황을 읽어도 상태·난수·이력·저장을 바꾸지 않는다', () => {
    const run = at('E01', friend)
    const raw = encodeCatalogSave(origin, pack, run)
    const situation = catalogDecisionSituation(pack, run)
    expect(Object.hasOwn(situation, 'selectedAction')).toBe(false)
    expect(situation.core).toEqual(run.core)
    expect(situation.core).not.toBe(run.core)
    expect(situation.options).toHaveLength(2)
    expect(encodeCatalogSave(origin, pack, run)).toBe(raw)
    expect(catalogDecisionSituation(pack, run)).toEqual(situation)
  })
  it('조회는 기록하지 않고 실행 성공 시 선택 직전 상태와 현재 후보를 분리 복사한다', () => {
    const run = at('E01', friend)
    const before = structuredClone(run)
    previewCatalogAction(pack, run, 'E01.shortcut')
    expect(run.history).toEqual([])
    const next = executeCatalogAction(pack, run, 'E01.shortcut')
    const context = next.result!.decisionContext!
    expect(context.core).toEqual(run.core)
    expect(context.companion).toEqual(friend)
    expect(context.core).not.toBe(run.core)
    expect(context.core.inventory).not.toBe(run.core.inventory)
    expect(context.companion).not.toBe(run.companion)
    expect(context.content).toEqual({ packId: 'opening', revision: pack.manifest.revision, rulesVersion: pack.manifest.rulesVersion })
    expect(context).toMatchObject({ eventId: 'E01', locationId: 'villa', stage: 'early', groupId: 'normal', sceneScriptId: run.visits[0].sceneScriptId, visitedLocationIds: ['villa'] })
    expect(context.options.map(o => o.actionId)).toEqual(catalogChoices(pack, run).map(c => c.id))
    expect(context.selectedAction).toEqual(previewCatalogAction(pack, run, 'E01.shortcut').action)
    expect(context.core.protagonist.stamina).toBe(70)
    expect(next.core.protagonist.stamina).toBe(66)
    expect(run).toEqual(before)
  })

  it('물자 유무에 따라 실제 선택된 variant와 잠긴 후보를 기록한다', () => {
    const source = at('E02', friend)
    const empty = { ...source, core: { ...source.core, inventory: { ...source.core.inventory, supply: 0, medkit: 0 } } }
    const withSupply = executeCatalogAction(pack, source, 'E02.help').result!.decisionContext!
    const without = executeCatalogAction(pack, empty, 'E02.help').result!.decisionContext!
    expect(withSupply.selectedAction.costs.supply).toBe(1)
    expect(without.selectedAction.costs.supply).toBe(0)
    expect(without.selectedAction.costs.stamina).toBeGreaterThan(0)
    expect(without.options.find(o => o.actionId === 'E02.first-aid')?.preview).toMatchObject({ allowed: false })
    expect(without.options).toHaveLength(3)
  })

  it('치료를 함께 한 행동과 치료 전 기본 후보를 구분한다', () => {
    const source = at('E04')
    const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, injury: 1 } } }
    const result = executeCatalogAction(pack, run, 'E04.maintain', true)
    const context = result.result!.decisionContext!
    expect(context.core.protagonist.injury).toBe(1)
    expect(context.options.find(o => o.actionId === 'E04.maintain')!.action.costs.medkit).toBe(0)
    expect(context.selectedAction.costs.medkit).toBe(1)
    expect(result.core.protagonist.injury).toBe(0)
    const entries = result.history.map(e => ({ eventId: e.eventId, actionId: e.actionId, treat: e.treat, context: e.decisionContext! }))
    expect(isDecisionMemory({ version: 'context-1', entries })).toBe(true)
  })

  it('양보 후 신뢰로 이전 상황을 덮어쓰지 않으며 저장 복원도 동일하다', () => {
    const source = at('E04', friend)
    const next = executeCatalogAction(pack, source, 'E04.share')
    expect(next.result!.decisionContext!.companion!.trust).toBe(source.companion!.trust)
    expect(next.companion!.trust).toBe(next.result!.trustChange!.after)
    expect(next.companion!.trust).not.toBe(source.companion!.trust)
    const raw = encodeCatalogSave(origin, pack, next)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-dialogue-1')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(next)
  })

  it('탈출 경로와 당시 잠금·정보·체력을 기록하고 결말의 전체 기록을 검증한다', () => {
    const source = at('E12')
    const next = executeCatalogAction(pack, source, 'E12.short')
    const context = next.result!.decisionContext!
    expect(context.core).toEqual(source.core)
    expect(context.options.map(o => o.route)).toEqual(['short', 'detour', 'request'])
    expect(context.options.find(o => o.route === 'request')?.preview.allowed).toBe(false)
    const legacy = catalogLegacy(pack, next)!
    expect(legacy.decisionMemory!.entries).toHaveLength(12)
    expect(isDecisionMemory(legacy.decisionMemory)).toBe(true)
    expect(isCatalogLegacy(legacy)).toBe(true)
    const raw = encodeCatalogSave(origin, pack, next)
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 6, runtimeVersion: 'catalog-runtime-5' })
    expect(encodeCatalogSave(origin, pack, decodeCatalogSave(raw, resolveAnswers).run)).toBe(raw)
  })

  it('다음 회차는 직전 기록만 받고 생존값을 초기화하며 세 번째에 재귀 보관하지 않는다', () => {
    const first = finish(at('E01'))
    const secondOrigin = { ...origin, runId: 'memory-second', name: '두 번째 인물' }
    const second = prepareNextCatalogRun(pack, first, pack, input(secondOrigin)).run
    expect(second.history).toEqual([])
    expect(second.previousLegacy!.decisionMemory!.entries).toHaveLength(12)
    expect(second.previousLegacy!.decisionMemory!.entries[0].context).not.toBe(first.history[0].decisionContext)
    expect(second.core.protagonist).toMatchObject({ name: secondOrigin.name, stamina: 70, stress: 30, injury: 0 })
    expect(second.core.inventory).toEqual({ supply: 1, medkit: 1, weapon: false })
    expect(second.companion!.traits).toEqual(first.core.protagonist.traits)
    const raw = encodeCatalogSave(secondOrigin, pack, second)
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 8, runtimeVersion: 'catalog-succession-11' })
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(second)
    const completed = finish(second)
    const third = prepareNextCatalogRun(pack, completed, pack, input({ ...origin, runId: 'memory-third', name: '세 번째 인물' })).run
    expect(third.previousLegacy!.sourceRunId).toBe(second.runId)
    expect(JSON.stringify(third.previousLegacy)).not.toContain('memory-first')
    expect(Object.hasOwn(third.previousLegacy!, 'previousLegacy')).toBe(false)
  })

  it('구 팩을 원문 복원하고 새 회차에도 없는 과거 상황을 채워 넣지 않는다', () => {
    const old = makeRecommendationCatalogFixture()
    const completed = finish(at('E01', null, old), old)
    const raw = encodeCatalogSave(origin, old, completed)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(loaded.run.history.every(e => e.decisionContext === undefined)).toBe(true)
    expect(catalogLegacy(old, loaded.run)!.decisionMemory).toBeUndefined()
    expect(encodeCatalogSave(origin, loaded.pack, loaded.run)).toBe(raw)
    const nextOrigin = { ...origin, runId: 'after-old', name: '새 인물' }
    const next = prepareNextCatalogRun(old, loaded.run, pack, input(nextOrigin)).run
    expect(next.previousLegacy!.decisionMemory).toBeUndefined()
    const selected = executeCatalogAction(pack, next, 'E01.safe')
    expect(selected.result!.decisionContext).toBeDefined()
    expect(decodeCatalogSave(encodeCatalogSave(nextOrigin, pack, selected), resolveAnswers).run).toEqual(selected)
  })

  it('현재 상황 기록의 수치·선택·확률·누락 위조는 저장 재생이 거부한다', () => {
    const next = executeCatalogAction(pack, at('E01'), 'E01.safe')
    const raw = encodeCatalogSave(origin, pack, next)
    for (const mutate of [
      (c: Record<string, any>) => { c.core.protagonist.stamina-- },
      (c: Record<string, any>) => { c.options[0].actionId = 'forged' },
      (c: Record<string, any>) => { c.options[1].preview.check.probability.percent-- },
      (c: Record<string, any>) => { c.selectedAction.costs.stamina++ },
    ]) {
      const data = JSON.parse(raw)
      mutate(data.checkpoint.history[0].decisionContext)
      expect(() => decodeCatalogSave(JSON.stringify(data), resolveAnswers)).toThrow()
    }
    const removed = JSON.parse(raw); delete removed.checkpoint.history[0].decisionContext
    expect(() => decodeCatalogSave(JSON.stringify(removed), resolveAnswers)).toThrow()
  })

  it('계승 기록의 누락·중복·과거 중첩·대표 선택 불일치·잘못된 버전을 거부한다', () => {
    const legacy = catalogLegacy(pack, finish(at('E01')))!
    for (const mutate of [
      (l: Record<string, any>) => { delete l.decisionMemory.entries[0].context.core },
      (l: Record<string, any>) => { l.decisionMemory.entries[0].context.options.pop() },
      (l: Record<string, any>) => { l.decisionMemory.entries[0].context.options[1] = l.decisionMemory.entries[0].context.options[0] },
      (l: Record<string, any>) => { l.decisionMemory.entries[0].context.previousLegacy = {} },
      (l: Record<string, any>) => { l.decisionMemory.version = 'future' },
      (l: Record<string, any>) => { l.representativeActions.E02 = 'E02.help' },
      (l: Record<string, any>) => { l.judgmentCounts.rescue++ },
      (l: Record<string, any>) => { l.traits.risk-- },
    ]) {
      const bad = structuredClone(legacy); mutate(bad)
      expect(isCatalogLegacy(bad)).toBe(false)
    }
    expect(isCatalogLegacy(legacy)).toBe(true)
  })

  it('이전 콘텐츠의 상황 기록은 당시 행동 결과·난수 순서를 유지한다', () => {
    const pack = makeVariableChoicesCatalogFixture()
    const old = makeRecommendationCatalogFixture()
    let previous = at('E01', null, old), current = at('E01', null, pack)
    for (const action of safe) {
      previous = executeCatalogAction(old, previous, action)
      current = executeCatalogAction(pack, current, action)
      expect(current.core).toEqual(previous.core)
      expect(current.rngState).toBe(previous.rngState)
      expect(current.result!.resolution).toEqual(previous.result!.resolution)
      if (current.phase === 'result') {
        current = acknowledgeCatalogResult(pack, current, current.result!.resultId)
        previous = acknowledgeCatalogResult(old, previous, previous.result!.resultId)
      }
    }
  })

  it('대표 사건에서 동료 별칭으로 실행한 선택도 결말·계승·복원에 보존한다', () => {
    let completed: CatalogRun | null = null
    let sourceOrigin: RunOrigin = origin
    for (let seed = 1; seed <= 20 && !completed; seed++) {
      const source = { ...origin, seed, answers: origin.answers.map((answer, i) => i === 3 ? { ...answer, answerId: 'a' } : answer) }
      let run = createCatalogRun(pack, { ...input(source), companion: friend })
      for (const action of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.explore', 'E06.withdraw']) {
        run = executeCatalogAction(pack, run, action)
        run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      }
      if (!run.core.flags.access) continue
      run = executeCatalogAction(pack, run, 'companion:E07.clues')
      run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      completed = finish(run); sourceOrigin = source
    }
    if (!completed) throw new Error('연구동 진입 후보')
    const legacy = catalogLegacy(pack, completed)!
    expect(legacy.representativeActions.E07).toBe('companion:E07.clues')
    const entry = legacy.decisionMemory!.entries.find(e => e.eventId === 'E07')!
    expect(entry.actionId).toBe('companion:E07.clues')
    expect(entry.context.options.filter(o => o.actionId.startsWith('companion:'))).toHaveLength(1)
    expect(isCatalogLegacy(legacy)).toBe(true)
    expect(decodeCatalogSave(encodeCatalogSave(sourceOrigin, pack, completed), resolveAnswers).run).toEqual(completed)
    const next = prepareNextCatalogRun(pack, completed, pack, input({ ...origin, runId: 'after-alias' })).run
    expect(next.previousLegacy!.representativeActions.E07).toBe('companion:E07.clues')
  })

  it('조기 종료는 실제 도달한 선택만 남기고 미도달 대표 상황을 만들지 않는다', () => {
    const source = at('E01')
    const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, injury: 2 } } }
    let fatal: CatalogRun | null = null
    for (let seed = 1; seed < 100 && !fatal; seed++) {
      const result = executeCatalogAction(pack, { ...run, rngState: seed * 1234567 }, 'E01.shortcut')
      if (result.phase === 'ending') fatal = result
    }
    if (!fatal) throw new Error('치명 결과')
    const legacy = catalogLegacy(pack, fatal)!
    expect(legacy.decisionMemory!.entries).toHaveLength(1)
    expect(legacy.representativeActions).toEqual({ E02: null, E07: null, E10: null })
    expect(isCatalogLegacy(legacy)).toBe(true)
  })

  it('상황 기록 저장 실패는 이전 이력을 유지하고 재시도에도 기록을 한 번만 추가한다', async () => {
    let raw: string | null = encodeCatalogSave(origin, pack, at('E01'))
    let fail = false
    const writes: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(raw).toBe(expected); writes.push(next)
      if (fail) throw new Error('저장 실패')
      raw = next
    } }
    const client = createProductClient({ store }); await client.dispatch({ type: 'resume' })
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택')
    const preview = await client.previewAction({ context: before.context, actionId: 'E01.safe', treatment: 'none' })
    if (!preview.ok) throw new Error(preview.error.message)
    const previous = raw; fail = true
    expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(raw).toBe(previous)
    expect(client.getSnapshot().view).toEqual(before)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패')
    const attempt = writes.at(-1); fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(raw).toBe(attempt)
    const restored = decodeCatalogSave(raw!, resolveAnswers)
    expect(restored.run.history).toHaveLength(1)
    expect(restored.run.history[0].decisionContext).toBeDefined()
  })
})
