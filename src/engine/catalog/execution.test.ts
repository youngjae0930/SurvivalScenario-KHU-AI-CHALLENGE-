import { expect, it } from 'vitest'
import { makeCompanionCommandCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import type { CatalogChoice, CatalogPack } from '../../domain/catalog'
import { compileCatalog } from './compile'
import { makeCompanionJourneyCatalogFixture } from '../../test/catalog-fixtures'
import { resolveAnswers } from '../../app/questionnaire'
import { createProductClient } from '../../app/catalog-client'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { SaveStore } from '../../storage/browser-store'
import { makeOrigin } from '../../test/opening-paths'
import { acknowledgeCatalogResult, catalogChoices, catalogCommandOffer, catalogRememberedChoice, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'
import { prepareNextCatalogRun } from './inheritance'
import { decisionMemoryFor, isDecisionMemory } from './decision-memory'

const pack = makeCompanionJourneyCatalogFixture()
const command = { role: '정찰', conditions: [], sharedRisk: '동료가 앞을 살피고, 주인공도 후퇴를 지원하며 같은 위험을 감수한다.' }
function withCommand(actionId: string, execution: unknown = command): unknown {
  return { ...pack, manifest: { ...pack.manifest, executionVersion: 'command-1' },
    events: pack.events.map(event => ({ ...event, groups: event.groups.map(group => ({ ...group,
      choices: group.choices.map(choice => choice.id === actionId ? { ...choice, execution } : choice) })) })) }
}
function authoredChoice(content: CatalogPack): CatalogChoice {
  return content.events.flatMap(event => event.groups.flatMap(group => group.choices)).find(choice => choice.execution)!
}
it('명령 역할·조건·공동 위험을 콘텐츠로 선언하며 기존 규칙은 바꾸지 않는다', () => {
  const content = compileCatalog(withCommand('E03.observe'))
  const choice = authoredChoice(content)
  expect(choice.execution).toEqual(command)
  expect(choice.behavior).toEqual(pack.events.find(event => event.id === 'E03')!.groups[0].choices.find(choice => choice.id === 'E03.observe')!.behavior)
  expect(authoredChoice(pack)).toBeUndefined()
})
it('명시적 공동 위험 설명이 없으면 명령 콘텐츠를 거부한다', () => {
  expect(() => compileCatalog(withCommand('E03.observe', { role: '정찰', conditions: [] }))).toThrow()
  expect(() => compileCatalog(withCommand('E03.observe', { ...command, sharedRisk: ' ' }))).toThrow()
})
it('버전 누락·없는 조건 참조·정비와 탈출의 일괄 파견을 거부한다', () => {
  const content = withCommand('E03.observe') as CatalogPack
  expect(() => compileCatalog({ ...content, manifest: { ...content.manifest, executionVersion: undefined } })).toThrow()
  expect(() => compileCatalog(withCommand('E03.observe', { ...command, conditions: [{ kind: 'visited', locationId: 'missing', value: true }] }))).toThrow()
  expect(() => compileCatalog(withCommand('E04.maintain'))).toThrow()
  expect(() => compileCatalog(withCommand('E12.short'))).toThrow()
})

const live = readDefaultCatalog()
const origin = makeOrigin()
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const input = { ...origin, answers: answers.value }
function atScout(trust = 60, cognition = 70, seed = 1, content = live) {
  let run = createCatalogRun(content, { ...input, seed, companion: { name: '정찰 동료', trust, traits: { risk: 70, cognition, affect: 50 } } })
  for (const action of ['E01.safe', 'E02.supplies']) {
    const result = executeCatalogAction(content, run, action)
    run = acknowledgeCatalogResult(content, result, result.result!.resultId)
  }
  return run
}
it('추천과 다른 명령은 신뢰59에서 거부하고60에서 수락하며 본인4개를 유지한다', () => {
  for (const trust of [0, 59, 60]) {
    const run = atScout(trust)
    expect(catalogChoices(live, run)).toHaveLength(4)
    const preview = previewCatalogAction(live, run, 'E03.observe', false, 'companion')
    expect(preview.allowed).toBe(trust === 60)
    expect(catalogCommandOffer(live, run, 'E03.observe')?.allowed).toBe(trust === 60)
    if (trust < 60) expect(() => executeCatalogAction(live, run, 'E03.observe', false, 'companion')).toThrow()
  }
})
it('동료가 추천한 같은 행동은 신뢰0에서도 맡길 수 있다', () => {
  expect(previewCatalogAction(live, atScout(0, 70), 'E03.cross', false, 'companion').allowed).toBe(true)
})
it('직접/동료 실행의 비용·확률·성패·피해·난수·집계·신뢰가 같다', () => {
  const outcomes = new Set<string>()
  for (let seed = 1; seed <= 12; seed++) {
    const run = atScout(60, 70, Math.imul(seed, 0x9e3779b9) >>> 0)
    const own = executeCatalogAction(live, run, 'E03.cross')
    const delegated = executeCatalogAction(live, run, 'E03.cross', false, 'companion')
    outcomes.add(delegated.result!.resolution.check.outcome)
    expect(delegated.core).toEqual(own.core)
    expect(delegated.rngState).toBe(own.rngState)
    expect(delegated.result!.resolution).toEqual(own.result!.resolution)
    expect(delegated.judgmentCounts).toEqual(own.judgmentCounts)
    expect(delegated.companion).toEqual(own.companion)
    expect(delegated.result!.execution).toMatchObject({ actor: 'companion', role: '정찰' })
    expect(delegated.result!.decisionContext?.executionActor).toBe('companion')
    expect(isDecisionMemory(decisionMemoryFor(delegated))).toBe(true)
  }
  expect(outcomes).toEqual(new Set(['success', 'failure']))
})
it('확인창과 결과에 실행 주체·공동 위험을 보여주며 선택지는 늘리지 않는다', () => {
  const run = atScout()
  const preview = catalogPreviewView(live, run, previewCatalogAction(live, run, 'E03.observe', false, 'companion'), 'token')
  expect(preview.execution).toMatchObject({ actor: 'companion', role: '정찰' })
  expect(preview.execution?.options).toHaveLength(2)
  expect(preview.warnings.join(' ')).toContain('주인공의 위험은 사라지지')
  const view = catalogGameView(live, executeCatalogAction(live, run, 'E03.observe', false, 'companion'))
  expect(view.kind === 'result' && view.text.join(' ')).toContain('동료가 정찰에 앞장섰다')
})
it('동료 부재·조건 불충족·미지정 행동·구 팩에서는 파견을 허용하지 않는다', () => {
  const run = atScout()
  const absent = { ...run, companion: null }
  expect(previewCatalogAction(live, absent, 'E03.observe', false, 'companion').allowed).toBe(false)
  expect(() => previewCatalogAction(live, run, 'E03.hurry', false, 'companion')).toThrow()
  const conditional = compileCatalog(withCommand('E03.observe', { ...command, conditions: [{ kind: 'number', subject: 'companion', stat: 'cognition', min: 0, max: 22 }] }))
  expect(previewCatalogAction(conditional, atScout(60, 70, 1, conditional), 'E03.observe', false, 'companion').allowed).toBe(false)
  expect(() => previewCatalogAction(pack, atScout(60, 70, 1, pack), 'E03.observe', false, 'companion')).toThrow()
})
it('주체를 저장·복원하고 주체/피해/공동 위험 위조를 거부한다', () => {
  const result = executeCatalogAction(live, atScout(), 'E03.observe', false, 'companion')
  const raw = encodeCatalogSave(origin, live, result)
  expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-command-1')
  expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
  const forged = JSON.parse(raw)
  delete forged.checkpoint.history[2].execution
  expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
})
it('동료에게 맡긴 실제 기록도 다음 회차에 계승하고 같은 상황의 추천에 남긴다', () => {
  let run = executeCatalogAction(live, atScout(50), 'E03.cross', false, 'companion')
  run = acknowledgeCatalogResult(live, run, run.result!.resultId)
  for (const action of ['E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain', 'E12.short']) {
    const result = executeCatalogAction(live, run, action)
    run = result.phase === 'result' ? acknowledgeCatalogResult(live, result, result.result!.resultId) : result
  }
  const nextOrigin = { ...origin, runId: 'command-successor', name: '다음 인물' }
  let next = prepareNextCatalogRun(live, run, live, { ...nextOrigin, answers: input.answers }).run
  for (const action of ['E01.safe', 'E02.supplies']) {
    const result = executeCatalogAction(live, next, action)
    next = acknowledgeCatalogResult(live, result, result.result!.resultId)
  }
  expect(catalogRememberedChoice(live, next)).toMatchObject({ actor: 'companion', choice: { id: 'E03.cross' } })
  const view = catalogGameView(live, next)
  expect(view.kind === 'choice' && view.companion.kind === 'present' && view.companion.opinion.kind === 'ready' && view.companion.opinion.reason).toContain('동료에게 맡겼던')
  const raw = encodeCatalogSave(nextOrigin, live, next)
  expect(JSON.parse(raw).runtimeVersion).toBe('catalog-succession-8')
  expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(next)
})
it('주체 선택을 바꾸면 이전 미리보기 토큰을 실행할 수 없고 저장 실패도 같은 주체로 재시도한다', async () => {
  let raw: string | null = encodeCatalogSave(origin, live, atScout())
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
  const request = { context: before.context, actionId: 'E03.observe', treatment: 'none' as const }
  const own = await client.previewAction(request)
  const delegated = await client.previewAction({ ...request, executionActor: 'companion' })
  if (!own.ok || !delegated.ok) throw new Error('미리보기')
  expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: own.value.previewToken })).ok).toBe(false)
  const fresh = await client.previewAction({ ...request, executionActor: 'companion' })
  if (!fresh.ok) throw new Error('미리보기')
  fail = true
  expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: fresh.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toEqual(before)
  const pending = client.getSnapshot().commit
  if (pending.kind !== 'save-failed') throw new Error('저장 실패')
  const candidate = writes.at(-1); fail = false
  expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
  expect(raw).toBe(candidate)
  expect(decodeCatalogSave(raw!, resolveAnswers).run.result?.execution?.actor).toBe('companion')
})
