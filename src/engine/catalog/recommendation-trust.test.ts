import { expect, it } from 'vitest'
import { makeRecommendationTrustCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { createProductClient } from '../../app/catalog-client'
import type { CatalogRun, CompanionContext } from '../../domain/catalog'
import type { SaveStore } from '../../storage/browser-store'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeStoryCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { sameDecisionSituation } from './decision-echo'
import { protectRecommendedTrust } from './relationship'
import { catalogChoices, catalogDecisionSituation, catalogIntervention, catalogLegacy, catalogRecommendedChoice,
  createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog(), old = makeStoryCatalogFixture()
const friend: CompanionContext = { name: '동료', trust: 50, traits: { risk: 70, cognition: 40, affect: 70 } }
function initial(p = pack, seed = 1, companion: CompanionContext | null = friend) {
  const origin = makeOrigin(seed), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  return { origin, run: createCatalogRun(p, { ...origin, answers: answers.value, companion }) }
}
function at(location: string, p = pack, companion = friend): CatalogRun {
  const { run } = initial(p, 1, companion)
  const event = p.events.find(e => e.locationIds.includes(location))!
  const scene = p.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!
  return { ...run, route: [location], visits: [{ eventId: event.id, locationId: location, sceneScriptId: scene.id }] }
}

it('추천을 따른 손실만 막으며 기존 이득·0~100 경계·비추천 평가는 그대로다', () => {
  for (const before of [0, 1, 50, 99, 100]) for (const delta of [-5, 0, 5]) {
    const change = { before, after: Math.max(0, Math.min(100, before + delta)), reason: '기존 평가' }
    expect(protectRecommendedTrust(change, true).after).toBe(Math.max(before, change.after))
    expect(protectRecommendedTrust(change, false)).toBe(change)
  }
})

it('안전 추천의 정상 소모로 신뢰를 깎지 않고 미리보기·실행·기록을 일치시킨다', () => {
  const { origin, run } = initial(), previous = initial(old).run
  const id = catalogRecommendedChoice(pack, run)!.id
  expect(id).toBe('E01.safe')
  const preview = previewCatalogAction(pack, run, id), result = executeCatalogAction(pack, run, id)
  const prior = executeCatalogAction(old, previous, id)
  expect(prior.companion!.trust).toBe(49)
  expect(result.companion!.trust).toBe(50)
  expect(result.result!.trustChange).toEqual(preview.trustOutcomes!.success)
  expect(result.result!.trustChange!.reason).toContain('자신이 추천한')
  expect(result.history[0].followedCompanionRecommendation).toBe(true)
  expect(result.history[0].trustChange).toEqual(result.result!.trustChange)
  const evidence = result.history[0].decisionContext!.options.find(option => option.actionId === id)!
  expect(evidence.trustOutcomes!.success).toBe(0)
  expect(evidence.baseTrustOutcomes!.success).toBeLessThan(0)
  expect(result.core).toEqual(prior.core)
  expect(result.result!.resolution).toEqual(prior.result!.resolution)
  expect(result.rngState).toBe(prior.rngState)
  expect(catalogPreviewView(pack, run, preview, 'test').outcomes.success.join(' ')).toContain('동료 신뢰 50 → 50')
  const raw = encodeCatalogSave(origin, pack, result), loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-trust-2')
  expect(loaded.run).toEqual(result)
  expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
  expect(catalogGameView(loaded.pack, loaded.run)).toEqual(catalogGameView(pack, result))
})

it('위험한 추천이 실제 실패해 다치더라도 신뢰를 유지하고 기존 피해·난수는 유지한다', () => {
  const adventurous = { ...friend, traits: { ...friend.traits, risk: 10 } }
  for (let seed = 1; seed <= 80; seed++) {
    const { run } = initial(pack, seed, adventurous), prior = initial(old, seed, adventurous).run
    const id = catalogRecommendedChoice(pack, run)!.id
    expect(id).toBe('E01.shortcut')
    const preview = previewCatalogAction(pack, run, id), result = executeCatalogAction(pack, run, id)
    if (result.result!.resolution.check.outcome !== 'failure') continue
    const previous = executeCatalogAction(old, prior, id)
    expect(previous.companion!.trust).toBeLessThan(friend.trust)
    expect(result.core.protagonist.injury).toBeGreaterThan(run.core.protagonist.injury)
    expect(result.companion!.trust).toBe(friend.trust)
    expect(result.result!.trustChange).toEqual(preview.trustOutcomes!.failure)
    expect(result.core).toEqual(previous.core)
    expect(result.rngState).toBe(previous.rngState)
    return
  }
  throw new Error('실패 표본 없음')
})

it('추천과 다른 행동의 신뢰 감소는 그대로 적용한다', () => {
  const adventurous = { ...friend, traits: { ...friend.traits, risk: 10 } }
  const { run } = initial(pack, 1, adventurous), previous = initial(old, 1, adventurous).run
  expect(catalogRecommendedChoice(pack, run)!.id).toBe('E01.shortcut')
  const result = executeCatalogAction(pack, run, 'E01.safe')
  expect(result.result!.trustChange).toEqual(executeCatalogAction(old, previous, 'E01.safe').result!.trustChange)
  expect(result.companion!.trust).toBeLessThan(friend.trust)
  expect(result.result).not.toHaveProperty('followedCompanionRecommendation')
})

it('추천을 보류하거나 동료가 없으면 추천 보호를 부여하지 않는다', () => {
  const content = compileCatalog({ ...pack, events: pack.events.map(e => {
    if (e.id !== 'E01') return e
    return { ...e, groups: e.groups.map(group => ({ ...group, choices: group.choices.map(choice => {
      const safe = group.choices.find(c => c.id === 'E01.safe')!
      if (safe.behavior.kind !== 'action') throw new Error('행동')
      return { ...choice, pace: 'balanced', behavior: { kind: 'action', variants: safe.behavior.variants.map(v => ({ ...v, action: { ...v.action, id: choice.id } })) } }
    }) })) }
  }) })
  const { run } = initial(content)
  expect(catalogRecommendedChoice(content, run)).toBeNull()
  expect(executeCatalogAction(content, run, 'E01.safe').companion!.trust).toBeLessThan(friend.trust)
  const solo = initial(pack, 1, null)
  const result = executeCatalogAction(pack, solo.run, 'E01.safe')
  expect(result.result).not.toHaveProperty('trustChange')
  expect(result.result).not.toHaveProperty('followedCompanionRecommendation')
  expect(decodeCatalogSave(encodeCatalogSave(solo.origin, pack, result), resolveAnswers).run).toEqual(result)
})

it('정비 추천으로 실제 신뢰가 오르면 상승분을 보존한다', () => {
  const rational = { ...friend, traits: { ...friend.traits, affect: 30 } }
  const base = at('staff-lounge', pack, rational)
  const run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, stamina: 30, stress: 60 }, inventory: { ...base.core.inventory, supply: 1 } } }
  const id = catalogRecommendedChoice(pack, run)!.id
  expect(id).toBe('encounter.staff-lounge.maintain')
  const result = executeCatalogAction(pack, run, id), previous = executeCatalogAction(old, run, id)
  expect(result.companion!.trust).toBeGreaterThan(friend.trust)
  expect(result.result!.trustChange).toEqual(previous.result!.trustChange)
})

it('추천한 정찰을 동료에게 맡겨도 같은 보호를 미리보기와 실행에 적용한다', () => {
  const run = at('residential-alley'), id = catalogRecommendedChoice(pack, run)!.id
  expect(id).toBe('encounter.residential-alley.listen')
  const preview = previewCatalogAction(pack, run, id, false, 'companion')
  expect(preview.allowed).toBe(true)
  const result = executeCatalogAction(pack, run, id, false, 'companion')
  expect(result.result!.execution!.actor).toBe('companion')
  expect(result.companion!.trust).toBe(friend.trust)
  expect(result.result!.trustChange).toEqual(preview.trustOutcomes!.success)
})

it('극단의 동료 대안도 실제 추천 ID에만 보호를 적용한다', () => {
  const base = at('train-connection')
  const run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, traits: { ...base.core.protagonist.traits, affect: 22 } } } }
  const intervention = catalogIntervention(pack, run)!
  expect(intervention.choice.id).toMatch(/^companion:/)
  expect(catalogChoices(pack, run).some(c => c.id === intervention.choice.id)).toBe(true)
  const preview = previewCatalogAction(pack, run, intervention.choice.id)
  const result = executeCatalogAction(pack, run, intervention.choice.id)
  expect(result.result!.followedCompanionRecommendation).toBe(true)
  expect(result.companion!.trust).toBeGreaterThanOrEqual(friend.trust)
  expect(result.result!.trustChange).toEqual(preview.trustOutcomes![result.result!.resolution.check.outcome === 'failure' ? 'failure' : 'success'])
})

it('동일 상황의 과거 판단 추천에도 보호를 적용하며 추천 계산이 순환하지 않는다', () => {
  const adventurous = { ...friend, traits: { ...friend.traits, risk: 10 } }
  const { run } = initial(pack, 1, adventurous)
  const recorded = executeCatalogAction(pack, run, 'E01.safe')
  // A compact memory fixture isolates replayed recommendation from the general preference.
  const previousLegacy = catalogLegacy(pack, { ...recorded, phase: 'ending' })!
  const remembered = { ...run, previousLegacy }
  expect(catalogRecommendedChoice(pack, run)!.id).toBe('E01.shortcut')
  expect(catalogRecommendedChoice(pack, remembered)!.id).toBe('E01.safe')
  expect(sameDecisionSituation(pack.manifest.decisionEcho!, catalogDecisionSituation(pack, remembered), catalogDecisionSituation(pack, run))).toBe(true)
  const preview = previewCatalogAction(pack, remembered, 'E01.safe')
  const result = executeCatalogAction(pack, remembered, 'E01.safe')
  expect(result.companion!.trust).toBe(friend.trust)
  expect(result.result!.trustChange).toEqual(preview.trustOutcomes!.success)
})

it('이전 저장은 추천 성공 후 신뢰 감소와 원문을 그대로 복원한다', () => {
  const { origin, run } = initial(old), result = executeCatalogAction(old, run, 'E01.safe')
  expect(result.companion!.trust).toBe(49)
  const raw = encodeCatalogSave(origin, old, result), loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(loaded.pack.manifest.trustVersion).toBe('outcome-1')
  expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
})

it('저장 실패 시 보호된 신뢰 후보를 유지하고 같은 결과로 재시도한다', async () => {
  const { origin, run } = initial()
  let raw = encodeCatalogSave(origin, pack, run), fail = true, candidate = ''
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(expected).toBe(raw); candidate = next
    if (fail) throw new Error('저장 실패')
    raw = next
  } }
  const client = createProductClient({ store }); await client.dispatch({ type: 'resume' })
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택')
  const preview = await client.previewAction({ context: view.context, actionId: 'E01.safe', treatment: 'none' })
  if (!preview.ok) throw new Error('미리보기')
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toEqual(view)
  expect(decodeCatalogSave(raw, resolveAnswers).run.history).toHaveLength(0)
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('저장 실패 상태')
  const pending = candidate; fail = false
  expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
  expect(raw).toBe(pending)
  expect(decodeCatalogSave(raw, resolveAnswers).run.companion!.trust).toBe(50)
})
