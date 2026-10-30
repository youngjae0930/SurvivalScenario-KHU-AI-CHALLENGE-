import { describe, expect, it } from 'vitest'
import { makeCompanionCommandCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeOrigin } from '../../test/opening-paths'
import { makeDecisionEchoCatalogFixture } from '../../test/catalog-fixtures'
import { createProductClient } from '../../app/catalog-client'
import type { SaveStore } from '../../storage/browser-store'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { compileCatalog } from './compile'
import { activeCatalogCompanion } from './companion-journey'
import { acknowledgeCatalogResult, catalogAutonomyDeparture, catalogChoices, catalogDecisionSituation, catalogGeneralRecommendation, catalogRememberedChoice, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

// A legal earlier expense makes E02's rescue recommendation decisive instead of a resource tradeoff.
function spendKit(content: CatalogPack): CatalogPack {
  return compileCatalog({ ...content, events: content.events.map(event => event.id === 'E01' ? { ...event,
    groups: event.groups.map(group => ({ ...group, choices: group.choices.map(choice => choice.id === 'E01.safe' && choice.behavior.kind === 'action'
      ? { ...choice, behavior: { ...choice.behavior, variants: choice.behavior.variants.map(variant => ({ ...variant, action: { ...variant.action, costs: { ...variant.action.costs, medkit: 1 } } })) } } : choice) })) } : event) })
}
const pack = spendKit(readDefaultCatalog())
const origin = makeOrigin()
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const input = { ...origin, answers: answers.value }
const companion = { name: '이어 걷는 이', traits: { risk: 50, cognition: 50, affect: 90 }, trust: 50 }
function start(content = pack, trust = 50): CatalogRun { return createCatalogRun(content, { ...input, companion: { ...companion, trust } }) }
function advance(content: CatalogPack, run: CatalogRun, action: string) {
  const next = executeCatalogAction(content, run, action)
  return next.phase === 'result' ? acknowledgeCatalogResult(content, next, next.result!.resultId) : next
}
function store(content = pack, trust = 50) { return advance(content, start(content, trust), 'E01.safe') }
function separated(content = pack) { return executeCatalogAction(content, store(content), 'E02.supplies') }

describe('데이터 기반 동료 이탈과 재회', () => {
  it.each([0, 50, 79])('신뢰%s에서 구조 의견과 자기 보존이 갈리면 경고 뒤 이탈한다', trust => {
    const run = store(pack, trust)
    expect(catalogGeneralRecommendation(pack, run)).toMatchObject({ kind: 'ready', choice: { judgment: 'rescue' } })
    const preview = previewCatalogAction(pack, run, 'E02.supplies')
    expect(catalogPreviewView(pack, run, preview, 'token').warnings.join(' ')).toContain('헤어집니다')
    const next = executeCatalogAction(pack, run, 'E02.supplies')
    expect(next.result?.companionDeparture).toMatchObject({ playerActionId: 'E02.supplies', companionActionId: 'E02.help' })
    expect(activeCatalogCompanion(next)).toBeNull()
    expect(next.companion).toEqual(run.companion)
    expect(run.companionJourney?.separation).toBeNull()
  })
  it.each([80, 100])('신뢰%s에서는 다른 선택에도 동행한다', trust => {
    const run = store(pack, trust)
    expect(catalogAutonomyDeparture(pack, run, 'E02.supplies')).toBeNull()
    expect(activeCatalogCompanion(executeCatalogAction(pack, run, 'E02.supplies'))).not.toBeNull()
  })
  it('구조를 함께 택하거나 의견이 구조가 아니면 이탈하지 않는다', () => {
    expect(catalogAutonomyDeparture(pack, store(), 'E02.help')).toBeNull()
    const run = store()
    const self = { ...run, companion: { ...companion, traits: { ...companion.traits, affect: 10 } } }
    expect(catalogAutonomyDeparture(pack, self, 'E02.supplies')).toBeNull()
  })
  it('자원 교환관계로 판단을 보류한 원본 E02에서는 이탈도 임의로 만들지 않는다', () => {
    const live = readDefaultCatalog()
    const run = store(live)
    expect(catalogGeneralRecommendation(live, run).kind).toBe('withheld')
    expect(catalogAutonomyDeparture(live, run, 'E02.supplies')).toBeNull()
  })
  it('추가 자원·성향·신뢰·판정 추첨을 만들지 않는다', () => {
    const run = store()
    const withJourney = executeCatalogAction(pack, run, 'E02.supplies')
    const old = spendKit(makeDecisionEchoCatalogFixture())
    const withoutJourney = executeCatalogAction(old, store(old), 'E02.supplies')
    expect(withJourney.core).toEqual(withoutJourney.core)
    expect(withJourney.rngState).toBe(withoutJourney.rngState)
    expect(withJourney.judgmentCounts).toEqual(withoutJourney.judgmentCounts)
    expect(withJourney.companion?.trust).toBe(run.companion?.trust)
  })
  it('부재 중 추천을 끄고 본인4개를 유지한 뒤 다음 안전 거점에서 재회한다', () => {
    const result = separated()
    let run = acknowledgeCatalogResult(pack, result, result.result!.resultId)
    expect(catalogGameView(pack, run)).toMatchObject({ kind: 'choice', companion: { kind: 'absent' } })
    expect(catalogChoices(pack, run)).toHaveLength(4)
    expect(catalogGeneralRecommendation(pack, run).kind).toBe('inactive')
    expect(catalogRememberedChoice(pack, run)).toBeNull()
    run = advance(pack, run, 'E03.observe')
    expect(activeCatalogCompanion(run)).toEqual(companion)
    expect(run.companionJourney?.reunions).toHaveLength(1)
    expect(catalogChoices(pack, run).some(choice => choice.id === 'E04.share')).toBe(true)
    const view = catalogGameView(pack, run)
    expect(view.kind === 'choice' && view.notices.join(' ')).toContain('다시 만났다')
  })
  it('이탈·부재·재회를 저장 재생하고 신원/참여 상태 위조를 거부한다', () => {
    const departure = separated()
    const absent = acknowledgeCatalogResult(pack, departure, departure.result!.resultId)
    const reunion = advance(pack, absent, 'E03.observe')
    for (const run of [departure, absent, reunion]) {
      const raw = encodeCatalogSave(origin, pack, run)
      expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-command-1')
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
      const forged = JSON.parse(raw)
      forged.checkpoint.companionJourney.separation = null
      if (run.companionJourney?.separation) expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
    }
  })
  it.each(['departure', 'reunion'] as const)('%s 저장 실패는 이전 화면을 유지하고 같은 후보로 재시도한다', async step => {
    const departure = separated()
    const absent = acknowledgeCatalogResult(pack, departure, departure.result!.resultId)
    const beforeRun = step === 'departure' ? store() : executeCatalogAction(pack, absent, 'E03.observe')
    let raw: string | null = encodeCatalogSave(origin, pack, beforeRun)
    let fail = true
    const writes: string[] = []
    const storage: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(raw).toBe(expected); writes.push(next)
      if (fail) throw new Error('저장 실패')
      raw = next
    } }
    const client = createProductClient({ store: storage }); await client.dispatch({ type: 'resume' })
    const before = client.getSnapshot().view
    const previousRaw = raw
    if (step === 'departure') {
      if (before.kind !== 'choice') throw new Error('선택')
      const preview = await client.previewAction({ context: before.context, actionId: 'E02.supplies', treatment: 'none' })
      if (!preview.ok) throw new Error(preview.error.message)
      expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    } else {
      if (before.kind !== 'result') throw new Error('결과')
      expect((await client.dispatch({ type: 'acknowledge-result', context: before.context, resultId: before.resultId })).ok).toBe(false)
    }
    expect(client.getSnapshot().view).toEqual(before)
    expect(raw).toBe(previousRaw)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패')
    const candidate = writes.at(-1); fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(raw).toBe(candidate)
    const next = decodeCatalogSave(raw!, resolveAnswers).run
    expect(activeCatalogCompanion(next) === null).toBe(step === 'departure')
    expect(next.companion).toEqual(beforeRun.companion)
  })
  it('이벤트·장소 이름과 재회 태그를 바꾸면 엔진 수정 없이 새 위치에서 재회한다', () => {
    const data = JSON.parse(JSON.stringify(pack).replaceAll('convenience-store', 'mobile-market')) as CatalogPack
    const event = data.events.find(event => event.id === 'E02')!
    const dynamic = compileCatalog({ ...data,
      events: data.events.map(item => item === event ? { ...item, id: 'mobile-rescue', autonomy: { ...item.autonomy!, reunion: { ...item.autonomy!.reunion, locationTags: ['mobile-hub'] } } } : item),
      scripts: data.scripts.map(script => script.eventId === 'E02' ? { ...script, eventId: 'mobile-rescue' } : script),
      locations: data.locations.map(location => location.id === 'alley' ? { ...location, tags: [...location.tags, 'mobile-hub'] } : location),
    })
    const result = separated(dynamic)
    expect(result.companionJourney?.separation).toMatchObject({ eventId: 'mobile-rescue', locationId: 'mobile-market' })
    const next = acknowledgeCatalogResult(dynamic, result, result.result!.resultId)
    expect(next.companionJourney?.reunions.at(-1)?.locationId).toBe('alley')
    expect(activeCatalogCompanion(next)).not.toBeNull()
  })
  it('재회 조건이 충족되지 않으면 거점에 도착해도 부재를 유지한다', () => {
    const dynamic = compileCatalog({ ...pack, events: pack.events.map(event => event.id === 'E02' ? { ...event,
      autonomy: { ...event.autonomy!, reunion: { ...event.autonomy!.reunion, minVisits: 3, conditions: [{ kind: 'flag', flag: 'data', value: true }] } } } : event) })
    const departure = separated(dynamic)
    const absent = acknowledgeCatalogResult(dynamic, departure, departure.result!.resultId)
    const hub = advance(dynamic, absent, 'E03.observe')
    expect(activeCatalogCompanion(hub)).toBeNull()
    expect(catalogChoices(dynamic, hub).some(choice => choice.id === 'E04.share')).toBe(false)
    expect(catalogChoices(dynamic, hub)).toHaveLength(4)
  })
  it('후반부의 실제 콘텐츠에서도 이탈하고 거점 도착 때 다시 합류한다', () => {
    const live = readDefaultCatalog()
    let run = start(live)
    for (const action of ['E01.safe', 'E02.first-aid', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour']) run = advance(live, run, action)
    expect(catalogAutonomyDeparture(live, run, 'E09.comply')).not.toBeNull()
    run = advance(live, run, 'E09.comply')
    expect(activeCatalogCompanion(run)).toBeNull()
    expect(catalogChoices(live, run)).toHaveLength(4)
    run = advance(live, run, 'E10.network')
    expect(activeCatalogCompanion(run)).not.toBeNull()
    expect(run.companionJourney?.reunions.at(-1)?.locationId).toBe(run.route[run.visitIndex])
    expect(decodeCatalogSave(encodeCatalogSave(origin, live, run), resolveAnswers).run).toEqual(run)
  })
  it('재회가 아직 없으면 극단 장면도 동료 명령 없이 본인4개로 진행한다', () => {
    const data = compileCatalog({ ...pack, events: pack.events.map(event => event.autonomy ? { ...event,
      autonomy: { ...event.autonomy, reunion: { ...event.autonomy.reunion, minVisits: 128 } } } : event) })
    const stableOrigin = makeOrigin(1, 'stability')
    const resolved = resolveAnswers(stableOrigin.answers)
    if (!resolved.ok) throw new Error('설문')
    let run = createCatalogRun(data, { ...stableOrigin, answers: resolved.value, companion })
    for (const action of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass']) run = advance(data, run, action)
    expect(run.core.protagonist.traits.risk).toBeGreaterThanOrEqual(78)
    expect(activeCatalogCompanion(run)).toBeNull()
    const choices = catalogChoices(data, run)
    expect(choices).toHaveLength(4)
    expect(choices.every(choice => !choice.id.startsWith('companion:'))).toBe(true)
    expect(catalogGameView(data, run)).toMatchObject({ kind: 'choice', companion: { kind: 'absent' } })
  })
  it('행동 중 치명 결과로 끝나면 후속 이탈·재회를 만들지 않는다', () => {
    const data = compileCatalog({ ...pack, events: pack.events.map(event => event.id === 'E02' ? { ...event,
      groups: event.groups.map(group => ({ ...group, choices: group.choices.map(choice => choice.id === 'E02.supplies' && choice.behavior.kind === 'action'
        ? { ...choice, behavior: { ...choice.behavior, variants: choice.behavior.variants.map(variant => ({ ...variant,
          action: { ...variant.action, successEffects: [...variant.action.successEffects, { kind: 'add', stat: 'injury', amount: 3 }] } })) } } : choice) })) } : event) })
    const run = separated(data)
    expect(run.phase).toBe('ending')
    expect(run.result?.companionDeparture).toBeUndefined()
    expect(run.companionJourney).toEqual({ separation: null, reunions: [] })
    expect(decodeCatalogSave(encodeCatalogSave(origin, data, run), resolveAnswers).run).toEqual(run)
  })
  it('자율 조건의 차이를 동일 상황 비교 증거에 포함한다', () => {
    expect(catalogDecisionSituation(pack, store(pack, 79)).autonomy).toBeDefined()
    expect(catalogDecisionSituation(pack, store(pack, 80)).autonomy).toBeUndefined()
  })
  it('미정의 태그·같은 판단·누락 버전을 거부한다', () => {
    const event = pack.events.find(event => event.autonomy)!
    expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, autonomyVersion: undefined } })).toThrow()
    expect(() => compileCatalog({ ...pack, events: pack.events.map(item => item === event ? { ...item, autonomy: { ...item.autonomy!, companionJudgment: 'self' } } : item) })).toThrow()
    expect(() => compileCatalog({ ...pack, events: pack.events.map(item => item === event ? { ...item, autonomy: { ...item.autonomy!, reunion: { ...item.autonomy!.reunion, locationTags: ['missing'] } } } : item) })).toThrow()
  })
})
