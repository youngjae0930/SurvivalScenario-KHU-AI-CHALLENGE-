import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { createProductClient } from '../../app/catalog-client'
import { makeDecisionEchoCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import type { CatalogPack, CatalogRun, CatalogDecisionSituation } from '../../domain/catalog'
import type { RunOrigin } from '../../storage/opening-save'
import type { SaveStore } from '../../storage/browser-store'
import { encodeCatalogSave, decodeCatalogSave } from '../../storage/catalog-save'
import { makeOrigin } from '../../test/opening-paths'
import { makeDecisionMemoryCatalogFixture } from '../../test/catalog-fixtures'
import { findRememberedDecision, representativeGoal, sameDecisionSituation } from './decision-echo'
import { prepareNextCatalogRun } from './inheritance'
import { compileCatalog } from './compile'
import { acknowledgeCatalogResult, catalogChoices, catalogDecisionSituation, catalogGeneralRecommendation, catalogRecoveryOpinion, catalogRememberedChoice, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const policy = pack.manifest.decisionEcho!
const origin = { ...makeOrigin(), runId: 'echo-source', name: '이전 인물' }
const nextOrigin = { ...origin, runId: 'echo-next', name: '다음 인물' }
const friend = { name: '함께 걷는 이', trust: 50, traits: { risk: 70, cognition: 70, affect: 70 } }
const sourceRoute = ['E01.shortcut', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain', 'E12.short']
function input(source: RunOrigin) {
  const resolved = resolveAnswers(source.answers)
  if (!resolved.ok) throw new Error('설문')
  return { ...source, answers: resolved.value }
}
function advance(content: CatalogPack, run: CatalogRun, action: string) {
  const next = executeCatalogAction(content, run, action)
  return next.phase === 'result' ? acknowledgeCatalogResult(content, next, next.result!.resultId) : next
}
function finish(content = pack, companion = false, route = sourceRoute, source = origin) {
  let run = createCatalogRun(content, { ...input(source), companion: companion ? friend : null })
  for (const action of route) run = advance(content, run, action)
  return run
}
function successor(completed = finish(), sourcePack = pack) {
  return prepareNextCatalogRun(sourcePack, completed, pack, input(nextOrigin)).run
}
const initialSituation = () => catalogDecisionSituation(pack, createCatalogRun(pack, input(origin)))

describe('동일 상황의 이전 판단 재현', () => {
  it('이전 기록 팩과 새 팩의 게임 콘텐츠는 같고 호환 목록은 검증한다', () => {
    const old = makeDecisionMemoryCatalogFixture()
    expect(pack.events).toEqual(old.events)
    expect(pack.locations).toEqual(old.locations)
    expect(pack.scripts).toEqual(old.scripts)
    expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, decisionEcho: { version: 'unknown', compatibleRevisions: [pack.manifest.revision] } } })).toThrow()
    expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, decisionEcho: { ...policy, compatibleRevisions: [] } } })).toThrow()
    expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, decisionEcho: { ...policy, compatibleRevisions: ['other'] } } })).toThrow()
  })

  it('이름·동료 존재 자체·동료 성향·후보 배열/객체 키 순서는 상황을 바꾸지 않는다', () => {
    const before = initialSituation()
    const after = { ...before, core: { ...before.core, protagonist: { ...before.core.protagonist, name: '다른 이름' } }, companion: friend, options: [...before.options].reverse() }
    expect(sameDecisionSituation(policy, before, after)).toBe(true)
    expect(sameDecisionSituation(policy, before, { ...after, companion: { ...friend, trust: 0, traits: { risk: 0, cognition: 100, affect: 50 } } })).toBe(true)
  })

  it.each(['stamina', 'stress', 'injury'] as const)('%s이 다르면 동일 상황이 아니다', field => {
    const before = initialSituation()
    const after = { ...before, core: { ...before.core, protagonist: { ...before.core.protagonist, [field]: before.core.protagonist[field] + 1 } } }
    expect(sameDecisionSituation(policy, before, after)).toBe(false)
  })

  it.each(['risk', 'cognition', 'affect'] as const)('%s 성향이 다르면 동일 상황이 아니다', axis => {
    const before = initialSituation()
    const after = { ...before, core: { ...before.core, protagonist: { ...before.core.protagonist, traits: { ...before.core.protagonist.traits, [axis]: 51 } } } }
    expect(sameDecisionSituation(policy, before, after)).toBe(false)
  })

  it('자원·플래그·스토리 사실·방문·장면·버전·선택 구성·행동 효과/잠금/확률 차이를 구별한다', () => {
    const before = initialSituation()
    const variants: CatalogDecisionSituation[] = [
      { ...before, core: { ...before.core, inventory: { ...before.core.inventory, supply: 0 } } },
      { ...before, core: { ...before.core, inventory: { ...before.core.inventory, medkit: 0 } } },
      { ...before, core: { ...before.core, inventory: { ...before.core.inventory, weapon: true } } },
      { ...before, core: { ...before.core, flags: { ...before.core.flags, routeKnown: true } } },
      { ...before, facts: { clue: true } }, { ...before, visitedLocationIds: ['other'] },
      { ...before, sceneScriptId: 'different.scene' }, { ...before, groupId: 'other' },
      { ...before, eventId: 'other' }, { ...before, locationId: 'other' },
      { ...before, content: { ...before.content, revision: 'unknown' } },
      { ...before, options: before.options.slice(1) },
      { ...before, options: before.options.map((o, i) => i ? o : { ...o, action: { ...o.action, costs: { ...o.action.costs, stamina: 1 } } }) },
      { ...before, options: before.options.map((o, i) => i ? o : { ...o, preview: { ...o.preview, allowed: false } }) },
      { ...before, options: before.options.map((o, i) => i !== 1 || o.preview.check.kind !== 'probability' ? o : { ...o, preview: { ...o.preview, check: { ...o.preview.check, probability: { ...o.preview.check.probability, percent: 1 } } } }) },
    ]
    for (const after of variants) expect(sameDecisionSituation(policy, before, after)).toBe(false)
  })

  it('동료 상태가 양보의 실제 신뢰 변화량을 바꾸면 같은 상황으로 취급하지 않는다', () => {
    let run = createCatalogRun(pack, { ...input(origin), companion: friend })
    for (const action of sourceRoute.slice(0, 3)) run = advance(pack, run, action)
    const before = catalogDecisionSituation(pack, run)
    expect(sameDecisionSituation(policy, before, { ...before, companion: { ...friend, trust: 70 } })).toBe(true)
    expect(sameDecisionSituation(policy, before, { ...before, companion: { ...friend, trust: 95 } })).toBe(false)
  })

  it('동일한 출발 상황에서는 최종 안정 성향의 일반 추천보다 이전 지름길 선택을 우선한다', () => {
    const first = finish()
    const run = successor(first)
    const raw = encodeCatalogSave(nextOrigin, pack, run)
    expect(run.companion!.traits.risk).toBeGreaterThan(50)
    expect(catalogGeneralRecommendation(pack, run)).toMatchObject({ kind: 'ready', choice: { id: 'E01.safe' } })
    expect(catalogRememberedChoice(pack, run)).toMatchObject({ choice: { id: 'E01.shortcut' }, treat: false })
    const view = catalogGameView(pack, run)
    if (view.kind !== 'choice') throw new Error('선택')
    expect(view.actions).toHaveLength(4)
    expect(view.actions.filter(a => a.recommended).map(a => a.actionId)).toEqual(['E01.shortcut'])
    expect(view.companion).toMatchObject({ opinion: { reason: expect.stringContaining('같은 조건') } })
    expect(run.history).toEqual([])
    expect(encodeCatalogSave(nextOrigin, pack, run)).toBe(raw)
    const restored = decodeCatalogSave(raw, resolveAnswers)
    expect(catalogGameView(restored.pack, restored.run)).toEqual(view)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-succession-6')
  })

  it('조건이 달라지거나 실행이 불가능하면 기존 추천으로 돌아가며 원래 행동을 강제로 열지 않는다', () => {
    const run = successor()
    const changed = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 69 } } }
    expect(catalogRememberedChoice(pack, changed)).toBeNull()
    const view = catalogGameView(pack, changed)
    if (view.kind !== 'choice') throw new Error('선택')
    expect(view.actions.find(a => a.recommended)?.actionId).toBe('E01.safe')
    expect(findRememberedDecision(policy, run.previousLegacy, catalogDecisionSituation(pack, run), () => false)).toBeNull()
    expect(catalogChoices(pack, changed)).toHaveLength(4)
  })

  it('이전 기록 팩의 맥락을 명시적으로 호환하되 구 팩의 추천 정책은 소급 변경하지 않는다', () => {
    const old = makeDecisionMemoryCatalogFixture()
    const first = finish(old)
    expect(catalogRememberedChoice(pack, successor(first, old))?.choice.id).toBe('E01.shortcut')
    const oldNext = prepareNextCatalogRun(old, first, old, input(nextOrigin)).run
    expect(catalogRememberedChoice(old, oldNext)).toBeNull()
    const raw = encodeCatalogSave(nextOrigin, old, oldNext)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-succession-5')
    expect(encodeCatalogSave(nextOrigin, old, decodeCatalogSave(raw, resolveAnswers).run)).toBe(raw)
    const missing = { ...oldNext.previousLegacy! }; delete (missing as { decisionMemory?: unknown }).decisionMemory
    expect(findRememberedDecision(policy, missing, catalogDecisionSituation(pack, successor()), () => true)).toBeNull()
  })

  it('동일 상황은 정비의 기존 의견보다 우선하되 조회만으로 실행하지 않는다', () => {
    const route = [...sourceRoute]; route[0] = 'E01.safe'; route[3] = 'E04.share'
    const first = finish(pack, true, route)
    let run = successor(first)
    for (const action of route.slice(0, 3)) run = advance(pack, run, action)
    expect(catalogRecoveryOpinion(pack, run)?.choice.id).toBe('E04.maintain')
    expect(catalogRememberedChoice(pack, run)?.choice.id).toBe('E04.share')
    expect(run.history).toHaveLength(3)
    const view = catalogGameView(pack, run)
    if (view.kind !== 'choice') throw new Error('선택')
    expect(view.actions.find(a => a.recommended)?.actionId).toBe('E04.share')
  })

  it('실제로 치료했던 같은 상황에서는 치료도 권하되 사용 여부는 플레이어에게 남긴다', () => {
    let first: CatalogRun | undefined
    let source = origin
    for (let seed = 1; seed <= 20 && !first; seed++) {
      source = { ...origin, seed: (seed * 987654321) >>> 0 }
      let run = createCatalogRun(pack, { ...input(source), companion: friend })
      for (const action of sourceRoute.slice(0, 3)) run = advance(pack, run, action)
      if (run.core.protagonist.injury === 0) continue
      run = executeCatalogAction(pack, run, 'E04.maintain', true)
      run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
      for (const action of sourceRoute.slice(4)) run = advance(pack, run, action)
      first = run
    }
    if (!first) throw new Error('치료 후보')
    let next = prepareNextCatalogRun(pack, first, pack, input({ ...nextOrigin, seed: source.seed })).run
    for (const action of sourceRoute.slice(0, 3)) next = advance(pack, next, action)
    expect(catalogRememberedChoice(pack, next)).toMatchObject({ choice: { id: 'E04.maintain' }, treat: true })
    const view = catalogGameView(pack, next)
    if (view.kind !== 'choice' || view.companion.kind !== 'present' || view.companion.opinion.kind !== 'ready') throw new Error('의견')
    expect(view.companion.opinion.reason).toContain('치료 도구 사용도 함께 권합니다')
    expect(next.history).toHaveLength(3)
    expect(previewCatalogAction(pack, next, 'E04.maintain').treat).toBe(false)
    expect(decodeCatalogSave(encodeCatalogSave(source, pack, first), resolveAnswers).run).toEqual(first)
  })

  it('대표 기록은 실제 대표 행동의 같은 사건 목표만 제공하며 다른 사건/없는 기록은 만들지 않는다', () => {
    const run = successor()
    const legacy = run.previousLegacy!
    const context = legacy.decisionMemory!.entries.find(e => e.eventId === 'E02')!.context
    expect(representativeGoal(policy, legacy, context)).toBe('E02.supplies')
    expect(representativeGoal(policy, legacy, { ...context, eventId: 'E09' })).toBeUndefined()
    expect(representativeGoal(policy, undefined, context)).toBeUndefined()
  })

  it('동률을 만드는 확장 콘텐츠에서도 대표 목표의 약한 영향이 실제 의견과 네 선택에 연결된다', () => {
    // Structural content fixture: create a real comparison tie without changing product balancing.
    const tiePack = compileCatalog({ ...pack, manifest: { ...pack.manifest, revision: 'echo-tie-fixture', decisionEcho: {
      ...policy, compatibleRevisions: [...policy.compatibleRevisions, 'echo-tie-fixture'],
    } }, events: pack.events.map(event => event.id !== 'E02' ? event : { ...event, groups: event.groups.map(group => ({ ...group,
      choices: group.choices.map(choice => choice.id !== 'E02.help' ? choice : { ...choice, behavior: { kind: 'action', variants: [{ conditions: [], action: {
        id: choice.id, eventId: 'E02', requires: {}, costs: { stamina: 0, supply: 0, medkit: 0 }, check: null,
        traitDelta: { risk: 0, cognition: 0, affect: 8 }, successEffects: [{ kind: 'set-flag', flag: 'helpEstablished', value: true }], failureEffects: [],
      } }] } }),
    })) }) })
    const source = advance(pack, successor(), 'E01.safe')
    const run = { ...source, core: { ...source.core, inventory: { ...source.core.inventory, supply: 3, medkit: 2 } },
      companion: { ...source.companion!, traits: { ...source.companion!.traits, affect: 50 } } }
    expect(catalogRememberedChoice(tiePack, run)).toBeNull()
    const { decisionEcho: ignored, ...withoutEcho } = tiePack.manifest
    expect(ignored).toBeDefined()
    expect(catalogGeneralRecommendation({ ...tiePack, manifest: withoutEcho }, run).kind).toBe('withheld')
    expect(catalogGeneralRecommendation(tiePack, run)).toMatchObject({ kind: 'ready', choice: { id: 'E02.supplies' }, basis: 'representative' })
    const view = catalogGameView(tiePack, run)
    if (view.kind !== 'choice') throw new Error('선택')
    expect(view.actions).toHaveLength(4)
    expect(view.actions.find(a => a.recommended)?.actionId).toBe('E02.supplies')
    expect(view.companion).toMatchObject({ opinion: { reason: expect.stringContaining('대표 선택과 같은 목표') } })
  })

  it('극단의 네 선택 구성은 유지하면서 같은 조건에서 고른 본인 행동을 추천할 수 있다', () => {
    const adventureOrigin = { ...origin, answers: makeOrigin(1, 'adventure').answers }
    const sameDirectionFriend = { ...friend, traits: { ...friend.traits, risk: 22 } }
    let first = createCatalogRun(pack, { ...input(adventureOrigin), companion: sameDirectionFriend })
    const beforeExtreme = sourceRoute.slice(0, 4)
    for (const action of beforeExtreme) first = advance(pack, first, action)
    first = advance(pack, first, 'E05.rush')
    first = advance(pack, first, 'E06.withdraw')
    first = advance(pack, first, first.core.flags.access ? 'E07.clues' : 'E07.abandon')
    for (const action of sourceRoute.slice(7)) first = advance(pack, first, action)
    let next = prepareNextCatalogRun(pack, first, pack, input({ ...nextOrigin, answers: adventureOrigin.answers })).run
    for (const action of beforeExtreme) next = advance(pack, next, action)
    expect(catalogRememberedChoice(pack, next)?.choice.id).toBe('E05.rush')
    const view = catalogGameView(pack, next)
    if (view.kind !== 'choice') throw new Error('선택')
    expect(view.actions).toHaveLength(4)
    expect(view.actions.filter(a => a.requiresCompanion)).toHaveLength(1)
    expect(view.actions.find(a => a.recommended)?.actionId).toBe('E05.rush')
    expect(view.actions.some(a => a.actionId === 'E05.bypass')).toBe(false)
  })

  it('추천한 선택의 저장 실패도 동일한 후보와 이전 의견을 보존해 재시도한다', async () => {
    let raw: string | null = encodeCatalogSave(nextOrigin, pack, successor())
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
    const preview = await client.previewAction({ context: before.context, actionId: 'E01.shortcut', treatment: 'none' })
    if (!preview.ok) throw new Error(preview.error.message)
    const previous = raw; fail = true
    expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(raw).toBe(previous); expect(client.getSnapshot().view).toEqual(before)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패')
    const attempt = writes.at(-1); fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(raw).toBe(attempt)
    expect(decodeCatalogSave(raw!, resolveAnswers).run.history[0].actionId).toBe('E01.shortcut')
  })
})
