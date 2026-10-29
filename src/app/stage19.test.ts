import { expect, it } from 'vitest'
import type { CatalogPack } from '../domain/catalog'
import type { SaveStore } from '../storage/browser-store'
import { readDefaultCatalog } from '../content/catalog/registry'
import { makeDialogueCatalogFixture } from '../test/catalog-fixtures'
import { makeOrigin } from '../test/opening-paths'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, executeCatalogAction, previewCatalogAction } from '../engine/catalog/runtime'
import { decodeCatalogSave, encodeCatalogSave } from '../storage/catalog-save'
import { resolveAnswers } from './questionnaire'
import { createProductClient } from './catalog-client'

const origin = makeOrigin(98765)
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const answerValues = answers.value
function checkpoint(pack: CatalogPack, index: number) {
  let run = createCatalogRun(pack, { ...origin, answers: answerValues })
  while (run.visitIndex < index && run.phase === 'choice') {
    const available = catalogChoices(pack, run).filter(choice => previewCatalogAction(pack, run, choice.id).allowed)
    const choice = available.find(choice => choice.destinationSegmentId === 'hospital')
      ?? available.find(choice => choice.id.endsWith('.observe'))
      ?? available.find(choice => choice.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain')
      ?? available[0]
    run = executeCatalogAction(pack, run, choice.id)
    if (run.phase === 'result') run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  return run
}
function environment(initial: string) {
  let raw = initial, fail = false
  const writes: string[] = []
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(raw).toBe(expected); writes.push(next)
    if (fail) throw new Error('quota')
    raw = next
  } }
  return { store, raw: () => raw, writes, fail: (value: boolean) => { fail = value } }
}

it.each([6, 13])('%i번 인덱스 경로 선택은 저장 실패 동안 확정하지 않고 같은 추첨 결과로 재시도한다', async index => {
  const pack = readDefaultCatalog(), initial = checkpoint(pack, index)
  expect(initial.visitIndex).toBe(index)
  const env = environment(encodeCatalogSave(origin, pack, initial))
  const client = createProductClient({ store: env.store })
  expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택 아님')
  const actionId = catalogChoices(pack, initial).find(choice => choice.destinationSegmentId === (index === 6 ? 'hospital' : 'school'))!.id
  const preview = await client.previewAction({ context: view.context, actionId, treatment: 'none' })
  if (!preview.ok) throw new Error(preview.error.message)
  const before = env.raw()
  env.fail(true)
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toBe(view)
  expect(env.raw()).toBe(before)
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
  const candidate = env.writes.at(-1)
  env.fail(false)
  expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
  expect(env.raw()).toBe(candidate)
  expect(decodeCatalogSave(env.raw(), resolveAnswers).run.route).toHaveLength(index === 6 ? 14 : 19)
  const reloaded = createProductClient({ store: env.store })
  expect((await reloaded.dispatch({ type: 'resume' })).ok).toBe(true)
  expect(reloaded.getSnapshot().view).toEqual(client.getSnapshot().view)
  const result = reloaded.getSnapshot().view
  if (result.kind !== 'result') throw new Error('결과 아님')
  expect((await reloaded.dispatch({ type: 'acknowledge-result', context: result.context, resultId: result.resultId })).ok).toBe(true)
  expect(reloaded.getSnapshot().view).toMatchObject({ kind: 'choice', notices: [expect.stringContaining(index === 6 ? '병원 데스크' : '학교 운동장')] })
})

it('이전12사건 결말은 유지하고 명시적 다음 회차 출발부터19스테이지와 계승 동료를 사용한다', async () => {
  const old = makeDialogueCatalogFixture()
  let run = createCatalogRun(old, { ...origin, answers: answers.value })
  for (const action of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain', 'E12.short']) {
    run = executeCatalogAction(old, run, action)
    if (run.phase === 'result') run = acknowledgeCatalogResult(old, run, run.result!.resultId)
  }
  const env = environment(encodeCatalogSave(origin, old, run))
  const client = createProductClient({ store: env.store, makeSeed: () => 124356, makeRunId: () => 'new-19-stage' })
  await client.dispatch({ type: 'resume' })
  expect(client.getSnapshot().presentation!.journey).toHaveLength(12)
  const view = client.getSnapshot().view
  if (view.kind !== 'ending') throw new Error('결말 아님')
  await client.dispatch({ type: 'prepare-next-run', sourceRunId: view.runId, sourceResultId: view.resultId })
  expect((await client.dispatch({ type: 'start-next-run', sourceRunId: view.runId, sourceResultId: view.resultId, name: '새 생존자', answers: origin.answers })).ok).toBe(true)
  const saved = decodeCatalogSave(env.raw(), resolveAnswers)
  expect(saved.pack.manifest.revision).toBe('catalog-stage19-1')
  expect(saved.run.companion?.name).toBe(origin.name)
  expect(client.getSnapshot().presentation!.journey).toHaveLength(19)
})
