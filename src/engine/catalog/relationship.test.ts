import { describe, expect, it } from 'vitest'
import type { CatalogChoice, CatalogPack, CatalogRun, CompanionContext } from '../../domain/catalog'
import type { SaveStore } from '../../storage/browser-store'
import { makeCoreState } from '../../test/core-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { makeCompanionCommandCatalogFixture } from '../../test/catalog-fixtures'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { resolveAnswers } from '../../app/questionnaire'
import { createProductClient } from '../../app/catalog-client'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { activeCatalogCompanion } from './companion-journey'
import { decisionMemoryFor, isDecisionMemory } from './decision-memory'
import { sameDecisionSituation } from './decision-echo'
import { acknowledgeCatalogResult, catalogAutonomyDeparture, catalogChoices, catalogCommandOffer, catalogDecisionSituation,
  catalogRecommendedChoice, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'
import { evaluateRelationship } from './relationship'

const pack = readDefaultCatalog()
const origin = makeOrigin()
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문')
const input = { ...origin, answers: resolved.value }
const companion: CompanionContext = { name: '동료', trust: 50, traits: { risk: 50, cognition: 50, affect: 50 } }
const choice: CatalogChoice = pack.events.find(event => event.id === 'E01')!.groups[0].choices[0]
const delta = (change: ReturnType<typeof evaluateRelationship>) => change.after - change.before
function start(content = pack, friend = companion) { return createCatalogRun(content, { ...input, companion: friend }) }
function advance(content: CatalogPack, run: CatalogRun, id: string) {
  const next = executeCatalogAction(content, run, id)
  return acknowledgeCatalogResult(content, next, next.result!.resultId)
}

describe('실제 결과를 종합한 신뢰', () => {
  it('이득·손해의 크기에 비례하고 한 선택당 ±5, 전체0~100을 지킨다', () => {
    const before = makeCoreState({ supply: 0, medkit: 0 })
    const small = evaluateRelationship(before, makeCoreState({ supply: 1, medkit: 0 }), companion, choice, 'success')
    const large = evaluateRelationship(before, makeCoreState({ supply: 3, medkit: 2, weapon: true }), companion, choice, 'success')
    expect(delta(small)).toBeGreaterThan(0)
    expect(delta(large)).toBeGreaterThan(delta(small))
    expect(delta(large)).toBe(5)
    const hurt = evaluateRelationship(before, makeCoreState({ stamina: 0, injury: 3, supply: 0, medkit: 0 }), companion, choice, 'failure')
    expect(delta(hurt)).toBe(-5)
    expect(evaluateRelationship(before, makeCoreState({ supply: 3, medkit: 2 }), { ...companion, trust: 99 }, choice, 'success').after).toBe(100)
    expect(evaluateRelationship(before, makeCoreState({ injury: 3 }), { ...companion, trust: 1 }, choice, 'failure').after).toBe(0)
  })
  it('회복과 소모를 합산하고 성향 변화·추천 불일치 자체에는 보상을 붙이지 않는다', () => {
    const before = makeCoreState({ supply: 1 })
    expect(delta(evaluateRelationship(before, makeCoreState({ stamina: 80, supply: 0 }), companion, choice, 'success'))).toBe(-1)
    const changedTraits = { ...before, protagonist: { ...before.protagonist, traits: { risk: 0, cognition: 100, affect: 0 } } }
    expect(delta(evaluateRelationship(before, changedTraits, companion, choice, 'success'))).toBe(0)
  })
  it('같은 구조 결과라도 동료 가치관에 따라 다르게 평가하고 실패에는 달성 효과를 붙이지 않는다', () => {
    const rescue = pack.events.find(event => event.id === 'E02')!.groups[0].choices.find(c => c.judgment === 'rescue')!
    const state = makeCoreState()
    const emotional = { ...companion, traits: { ...companion.traits, affect: 100 } }
    const rational = { ...companion, traits: { ...companion.traits, affect: 0 } }
    expect(delta(evaluateRelationship(state, state, emotional, rescue, 'success'))).toBe(2)
    expect(delta(evaluateRelationship(state, state, rational, rescue, 'success'))).toBe(-2)
    expect(delta(evaluateRelationship(state, state, emotional, rescue, 'failure'))).toBe(0)
    expect(delta(evaluateRelationship(state, state, companion, rescue, 'success'))).toBe(0)
  })
  it('실제 획득 상한을 적용하고 이미 가진 정보는 중복 이득으로 세지 않는다', () => {
    const run = start()
    const capped = { ...run, core: makeCoreState({ stamina: 100, supply: 3 }) }
    const p = previewCatalogAction(pack, capped, 'E01.safe')
    const result = executeCatalogAction(pack, capped, 'E01.safe')
    expect(result.result!.trustChange).toEqual(p.trustOutcomes!.success)
    const same = makeCoreState({ supply: 3, data: true })
    expect(delta(evaluateRelationship(same, same, companion, choice, 'success'))).toBe(0)
  })
  it('성공·실패 미리보기는 실제 실행과 같고 난수나 비용을 추가하지 않는다', () => {
    const old = makeCompanionCommandCatalogFixture()
    const observed = new Set<string>()
    for (const seed of [1, 0x9e3779b9, 0x3c6ef372, 0xdaa66d2b]) {
      let run = createCatalogRun(pack, { ...input, seed, companion })
      let prior = createCatalogRun(old, { ...input, seed, companion })
      for (const id of ['E01.safe', 'E02.supplies']) { run = advance(pack, run, id); prior = advance(old, prior, id) }
      const p = previewCatalogAction(pack, run, 'E03.cross')
      const result = executeCatalogAction(pack, run, 'E03.cross')
      const original = executeCatalogAction(old, prior, 'E03.cross')
      const branch = result.result!.resolution.check.outcome === 'failure' ? 'failure' : 'success'
      observed.add(branch)
      expect(result.result!.trustChange).toEqual(p.trustOutcomes![branch])
      expect(result.core).toEqual(original.core)
      expect(result.rngState).toEqual(original.rngState)
      const view = catalogPreviewView(pack, run, p, 'test')
      expect(view.outcomes[branch].join(' ')).toContain('동료 신뢰')
      expect(isDecisionMemory(decisionMemoryFor(result))).toBe(true)
      const shown = catalogGameView(pack, result)
      expect(shown.kind === 'result' && shown.changes.some(c => c.label === '동료 신뢰' && !c.text.includes('+-'))).toBe(true)
      expect(acknowledgeCatalogResult(pack, result, result.result!.resultId).companion).toEqual(result.companion)
    }
    expect(observed).toEqual(new Set(['success', 'failure']))
  })
  it('양보도 고정+10 대신 회복·소모·동료 지원을 합산한다', () => {
    let run = start()
    for (const id of ['E01.safe', 'E02.supplies', 'E03.observe']) run = advance(pack, run, id)
    const p = previewCatalogAction(pack, run, 'E04.share')
    const next = executeCatalogAction(pack, run, 'E04.share')
    expect(next.result!.trustChange).toEqual(p.trustOutcomes!.success)
    expect(delta(next.result!.trustChange!)).toBeGreaterThan(0)
    expect(delta(next.result!.trustChange!)).toBeLessThanOrEqual(5)
    expect(next.result!.trustChange!.reason).toContain('동료에게 물자')
    expect(next.result!.resolution).not.toHaveProperty('companionTrust')
  })
  it('혼자 또는 이탈 중에는 동료 신뢰를 평가하지 않는다', () => {
    const solo = createCatalogRun(pack, input)
    expect(executeCatalogAction(pack, solo, 'E01.safe').result!.trustChange).toBeUndefined()
    const run = start()
    const separated = { ...run, companionJourney: { separation: { eventId: 'past', locationId: 'past', visitIndex: 0,
      playerActionId: 'past', companionActionId: 'past', reunion: { locationTags: ['safe-hub'], minVisits: 1, conditions: [] } }, reunions: [] } }
    expect(executeCatalogAction(pack, separated, 'E01.safe').companion).toEqual(companion)
    expect(executeCatalogAction(pack, separated, 'E01.safe').result!.trustChange).toBeUndefined()
  })
  it('명령 수락60은 실행 전 신뢰로 결정하며 이후 손해로 소급 거절하지 않는다', () => {
    let run = start(pack, { ...companion, traits: { risk: 70, cognition: 70, affect: 50 } })
    for (const id of ['E01.safe', 'E02.supplies']) run = advance(pack, run, id)
    for (const trust of [59, 60]) {
      const candidate = { ...run, companion: { ...run.companion!, trust } }
      expect(catalogCommandOffer(pack, candidate, 'E03.observe')!.allowed).toBe(trust === 60)
      if (trust === 60) expect(executeCatalogAction(pack, candidate, 'E03.observe', false, 'companion').result!.execution).toBeDefined()
    }
  })
  it('새 신뢰·판단 근거를 저장 재생하고 위조를 거부하며 구 팩은 고정+10을 보존한다', () => {
    const result = executeCatalogAction(pack, start(), 'E01.safe')
    const raw = encodeCatalogSave(origin, pack, result)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-stages-1')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
    const fake = JSON.parse(raw); fake.checkpoint.history[0].trustChange.after += 1
    expect(() => decodeCatalogSave(JSON.stringify(fake), resolveAnswers)).toThrow()
    const old = makeCompanionCommandCatalogFixture()
    let prior = start(old)
    for (const id of ['E01.safe', 'E02.supplies', 'E03.observe']) prior = advance(old, prior, id)
    const shared = executeCatalogAction(old, prior, 'E04.share')
    expect(delta(shared.result!.trustChange!)).toBe(10)
    expect(decodeCatalogSave(encodeCatalogSave(origin, old, shared), resolveAnswers).run).toEqual(shared)
  })
  it('신뢰 효과가 달라지는 동료 상태는 동일 상황에서 구분하며 이름은 제외한다', () => {
    const run = start()
    const before = catalogDecisionSituation(pack, run)
    const rename = catalogDecisionSituation(pack, { ...run, companion: { ...companion, name: '다른 이름' } })
    expect(sameDecisionSituation(pack.manifest.decisionEcho!, before, rename)).toBe(true)
    const changed = catalogDecisionSituation(pack, { ...run, companion: { ...companion, trust: 100 } })
    expect(sameDecisionSituation(pack.manifest.decisionEcho!, before, changed)).toBe(false)
    // Presence alone is excluded when the companion changes no candidate's effects.
    const zero = { ...before, options: before.options.map(option => ({ ...option, trustOutcomes: { success: 0, failure: 0 } })) }
    const solo = { ...zero, companion: null, relationship: undefined,
      options: zero.options.map(option => ({ ...option, trustOutcomes: undefined })) }
    expect(sameDecisionSituation(pack.manifest.decisionEcho!, zero, solo)).toBe(true)
  })
  it('저장 실패는 기존 신뢰를 유지하고 동일 신뢰 결과로 재시도한다', async () => {
    const run = start()
    let raw = encodeCatalogSave(origin, pack, run), fail = true, attempted = ''
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(expected).toBe(raw); attempted = next
      if (fail) throw new Error('저장 실패')
      raw = next
    } }
    const client = createProductClient({ store }); await client.dispatch({ type: 'resume' })
    const view = client.getSnapshot().view
    if (view.kind !== 'choice') throw new Error('선택')
    const p = await client.previewAction({ context: view.context, actionId: 'E01.shortcut', treatment: 'none' })
    if (!p.ok) throw new Error('미리보기')
    expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: p.value.previewToken })).ok).toBe(false)
    expect(client.getSnapshot().view).toEqual(view)
    expect(decodeCatalogSave(raw, resolveAnswers).run.companion!.trust).toBe(50)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패')
    const candidate = attempted; fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
    expect(raw).toBe(candidate)
    expect(decodeCatalogSave(raw, resolveAnswers).run.companion!.trust).toBe(executeCatalogAction(pack, run, 'E01.shortcut').companion!.trust)
    expect(decodeCatalogSave(raw, resolveAnswers).run.companion!.trust).not.toBe(50)
  })
})

function otherConflict() {
  return compileCatalog({ ...pack, events: pack.events.map(event => event.id !== 'E01' ? event : { ...event,
    autonomy: { conditions: [], conflicts: [{ playerGoalId: 'E01.safe', companionGoalId: 'E01.shortcut', reason: '이동 방침을 끝내 좁히지 못해 다른 길로 간다.' }],
      reunion: { locationTags: ['safe-hub'], minVisits: 1, conditions: [] } } }) })
}
describe('이별로 이어지는 명시적 목표 갈등', () => {
  it('구조 외 이동 갈등도79에서는 이별하고80에서는 동행하며 선택은4개다', () => {
    const content = otherConflict()
    for (const trust of [79, 80]) {
      const run = start(content, { ...companion, trust, traits: { risk: 10, cognition: 50, affect: 50 } })
      expect(catalogRecommendedChoice(content, run)!.goalId).toBe('E01.shortcut')
      expect(catalogAutonomyDeparture(content, run, 'E01.safe') !== null).toBe(trust === 79)
      expect(activeCatalogCompanion(executeCatalogAction(content, run, 'E01.safe')) !== null).toBe(trust === 80)
      expect(catalogChoices(content, run)).toHaveLength(4)
    }
  })
  it('단순 의견 차이·선언되지 않은 목표 조합은 이별을 만들지 않는다', () => {
    const run = start(pack, { ...companion, trust: 0, traits: { risk: 10, cognition: 50, affect: 50 } })
    expect(catalogAutonomyDeparture(pack, run, 'E01.safe')).toBeNull()
    const content = otherConflict()
    expect(catalogAutonomyDeparture(content, start(content, { ...run.companion!, trust: 0 }), 'E01.compose')).toBeNull()
  })
  it('없는 목표·같은 목표·누락된 버전·신뢰 평가 버전을 검증한다', () => {
    const content = otherConflict()
    expect(() => compileCatalog({ ...content, manifest: { ...content.manifest, autonomyVersion: 'journey-1' } })).toThrow()
    expect(() => compileCatalog({ ...content, manifest: { ...content.manifest, trustVersion: undefined } })).toThrow()
    const missing = { ...content, events: content.events.map(event => event.id !== 'E01' ? event : { ...event,
      autonomy: { ...event.autonomy!, conflicts: [{ playerGoalId: 'missing', companionGoalId: 'missing', reason: '잘못된 참조' }] } }) }
    expect(() => compileCatalog(missing)).toThrow()
  })
})
