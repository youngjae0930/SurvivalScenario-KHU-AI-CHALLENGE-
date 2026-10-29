import { describe, expect, it } from 'vitest'
import type { GameClient } from '../contracts'
import { readDefaultCatalog } from '../content/catalog/registry'
import { prepareNextCatalogRun, isCatalogLegacy } from '../engine/catalog/inheritance'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, executeCatalogAction } from '../engine/catalog/runtime'
import { decodeCatalogSave, encodeCatalogSave } from '../storage/catalog-save'
import type { SaveStore } from '../storage/browser-store'
import { makeOrigin } from '../test/opening-paths'
import { makeEscapeCatalogFixture } from '../test/catalog-fixtures'
import { resolveAnswers } from './questionnaire'
import { createProductClient } from './catalog-client'

const pack = readDefaultCatalog()
const sourceOrigin = { ...makeOrigin(), runId: 'source-a-marker', name: '이전 인물' }
const resolved = resolveAnswers(sourceOrigin.answers)
if (!resolved.ok) throw new Error('설문 오류')
const answerValues = resolved.value
const safe = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain']
function ended(selectedPack = pack) {
  let run = createCatalogRun(selectedPack, { ...sourceOrigin, answers: answerValues })
  for (const id of safe) { run = executeCatalogAction(selectedPack, run, id); run = acknowledgeCatalogResult(selectedPack, run, run.result!.resultId) }
  return executeCatalogAction(selectedPack, run, 'E12.short')
}
function setup() {
  let raw: string | null = encodeCatalogSave(sourceOrigin, pack, ended())
  let fail = false
  let count = 0
  const writes: string[] = []
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(raw).toBe(expected); writes.push(next)
    if (fail) throw new Error('저장 실패')
    raw = next
  } }
  const client = createProductClient({ store, makeSeed: () => { count++; return 987654 }, makeRunId: () => 'successor-b-marker' })
  return { client, store, writes, raw: () => raw!, fail: (value: boolean) => { fail = value }, count: () => count }
}
async function prepare(client: GameClient) {
  const view = client.getSnapshot().view
  if (view.kind !== 'ending') throw new Error('결말 아님')
  expect((await client.dispatch({ type: 'prepare-next-run', sourceRunId: view.runId, sourceResultId: view.resultId })).ok).toBe(true)
}
function startCommand(client: GameClient) {
  const view = client.getSnapshot().view
  if (view.kind !== 'start' || !view.succession) throw new Error('계승 설문 아님')
  return { type: 'start-next-run' as const, sourceRunId: view.succession.sourceRunId, sourceResultId: view.succession.sourceResultId, name: '새 주인공', answers: makeOrigin(1, 'adventure').answers }
}
async function choose(client: GameClient, actionId: string) {
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택 아님')
  const preview = await client.previewAction({ context: view.context, actionId, treatment: 'none' })
  if (!preview.ok) throw new Error(preview.error.message)
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(true)
  const result = client.getSnapshot().view
  if (result.kind === 'result') expect((await client.dispatch({ type: 'acknowledge-result', context: result.context, resultId: result.resultId })).ok).toBe(true)
}

describe('실제 결말에서 다음 회차로 이어하기', () => {
  it('설문 열기·취소는 저장·난수·기존 결말을 변경하지 않으며 재접속도 결말로 돌아온다', async () => {
    const s = setup(), before = s.raw()
    expect((await s.client.dispatch({ type: 'resume' })).ok).toBe(true)
    const ending = s.client.getSnapshot().view
    expect(ending).toMatchObject({ kind: 'ending', newRun: { kind: 'available' } })
    await prepare(s.client)
    expect(s.raw()).toBe(before)
    expect(s.count()).toBe(0)
    expect(s.writes).toHaveLength(0)
    expect((await s.client.dispatch({ type: 'cancel-next-run' })).ok).toBe(true)
    expect(s.client.getSnapshot().view).toEqual(ending)
    await prepare(s.client)
    const reloaded = createProductClient({ store: s.store })
    expect((await reloaded.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(reloaded.getSnapshot().view).toEqual(ending)
  })

  it('출발 확정은 새 설문·seed·초기 생존 상태와 이전 성향/집계의 동료를 원자적으로 저장한다', async () => {
    const s = setup()
    await s.client.dispatch({ type: 'resume' }); await prepare(s.client)
    expect((await s.client.dispatch(startCommand(s.client))).ok).toBe(true)
    const loaded = decodeCatalogSave(s.raw(), resolveAnswers)
    expect(JSON.parse(s.raw())).toMatchObject({ schemaVersion: 8, runtimeVersion: 'catalog-succession-11' })
    expect(loaded.origin).toMatchObject({ runId: 'successor-b-marker', seed: 987654, name: '새 주인공' })
    expect(loaded.run.core.protagonist).toMatchObject({ stress: 30, stamina: 70, injury: 0, traits: { risk: 30, cognition: 50, affect: 50 } })
    expect(loaded.run.core.inventory).toEqual({ supply: 1, medkit: 1, weapon: false })
    expect(loaded.run.core.flags).toEqual({ access: false, data: false, helpEstablished: false, routeKnown: false, rescueDecision: null })
    expect(loaded.run.companion).toEqual({ name: sourceOrigin.name, traits: ended().core.protagonist.traits, trust: 50, judgmentCounts: ended().judgmentCounts })
    expect(loaded.run.previousLegacy).toEqual(catalogLegacy(pack, ended()))
    expect(loaded.run.history).toEqual([])
    expect(loaded.run.judgmentCounts).toEqual({ rescue: 0, self: 0 })
    expect(s.count()).toBe(1)
    const restored = createProductClient({ store: s.store })
    await restored.dispatch({ type: 'resume' })
    expect(restored.getSnapshot().view).toEqual(s.client.getSnapshot().view)
  })

  it('저장 실패는 이전 결말을 유지하고 동일 회차/seed 후보로만 재시도한다', async () => {
    const s = setup(), previous = s.raw()
    await s.client.dispatch({ type: 'resume' }); await prepare(s.client)
    const command = startCommand(s.client)
    s.fail(true)
    expect((await s.client.dispatch(command)).ok).toBe(false)
    expect(s.raw()).toBe(previous)
    expect(s.client.getSnapshot().view.kind).toBe('start')
    const failed = s.client.getSnapshot().commit
    if (failed.kind !== 'save-failed') throw new Error('저장 실패 아님')
    expect((await s.client.dispatch({ type: 'cancel-next-run' })).ok).toBe(false)
    const candidate = s.writes.at(-1)
    s.fail(false)
    expect((await s.client.dispatch({ type: 'retry-save', operationId: failed.operationId })).ok).toBe(true)
    expect(s.raw()).toBe(candidate)
    expect(s.count()).toBe(1)
  })

  it('이전 성향이 실제 E05 대안을 열고 저장 복원 후에도 같은 선택 구성을 유지한다', async () => {
    const s = setup()
    await s.client.dispatch({ type: 'resume' }); await prepare(s.client); await s.client.dispatch(startCommand(s.client))
    for (const id of ['E01.shortcut', 'E02.supplies', 'E03.observe', 'E04.maintain']) await choose(s.client, id)
    const view = s.client.getSnapshot().view
    if (view.kind !== 'choice') throw new Error('선택 아님')
    expect(view.context.eventId).toBe('E05')
    expect(view.status.traits.find(trait => trait.axis === 'risk')?.value).toBe(22)
    expect(view.companion).toMatchObject({ kind: 'present', trust: 56, opinion: { kind: 'ready', actionId: 'companion:E05.bypass' } })
    expect(view.actions).toHaveLength(3)
    expect(view.actions.find(action => action.actionId === 'companion:E05.bypass')?.availability.kind).toBe('available')
    const restored = createProductClient({ store: s.store }); await restored.dispatch({ type: 'resume' })
    expect(restored.getSnapshot().view).toEqual(view)
    await choose(restored, 'companion:E05.bypass')
    expect(restored.getSnapshot().view).toMatchObject({ kind: 'choice', context: { eventId: 'E06' } })
  })

  it('동행 회차도 끝까지 완주하고 세 번째 회차는 직전 인물 하나만 계승한다', async () => {
    const s = setup()
    await s.client.dispatch({ type: 'resume' }); await prepare(s.client); await s.client.dispatch(startCommand(s.client))
    for (const id of ['E01.shortcut', 'E02.supplies', 'E03.observe', 'E04.maintain', 'companion:E05.bypass', ...safe.slice(5), 'E12.short']) await choose(s.client, id)
    expect(s.client.getSnapshot().view.kind).toBe('ending')
    const b = decodeCatalogSave(s.raw(), resolveAnswers)
    const third = prepareNextCatalogRun(b.pack, b.run, pack, { ...inputForThird(), runId: 'successor-c-marker' }).run
    expect(third.previousLegacy?.sourceRunId).toBe('successor-b-marker')
    expect(third.companion?.name).toBe('새 주인공')
    const thirdOrigin = { ...sourceOrigin, name: '세 번째', runId: third.runId, seed: third.initialSeed }
    const raw = encodeCatalogSave(thirdOrigin, pack, third)
    expect(raw).not.toContain('source-a-marker')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(third)
    expect(currentEvent(pack, third).id).toBe('E01')
  })

  it('진행 중 덮어쓰기·이전 결말 핸들·중복 출발·부정 계승 입력을 거부한다', async () => {
    const s = setup()
    expect((await s.client.dispatch({ type: 'prepare-next-run', sourceRunId: 'old', sourceResultId: 'old' })).ok).toBe(false)
    await s.client.dispatch({ type: 'resume' })
    expect((await s.client.dispatch({ type: 'prepare-next-run', sourceRunId: 'old', sourceResultId: 'old' })).ok).toBe(false)
    await prepare(s.client)
    const valid = startCommand(s.client)
    expect((await s.client.dispatch({ ...valid, sourceResultId: 'old' })).ok).toBe(false)
    expect((await s.client.dispatch({ ...valid, name: '' })).ok).toBe(false)
    const responses = await Promise.all([s.client.dispatch(valid), s.client.dispatch(valid)])
    expect(responses.filter(result => result.ok)).toHaveLength(1)
    expect((await s.client.dispatch(valid)).ok).toBe(false)
    expect((await s.client.dispatch({ type: 'prepare-next-run', sourceRunId: valid.sourceRunId, sourceResultId: valid.sourceResultId })).ok).toBe(false)
    const data = JSON.parse(s.raw())
    data.companionOrigin.trust = 40
    expect(() => decodeCatalogSave(JSON.stringify(data), resolveAnswers)).toThrow()
    expect(isCatalogLegacy({ ...catalogLegacy(pack, ended()), previousLegacy: {} })).toBe(false)
  })

  it('이전 고정 팩의 결말은 명시적으로 출발할 때만 현재 팩으로 전환한다', () => {
    const old = makeEscapeCatalogFixture()
    const completed = ended(old)
    const before = encodeCatalogSave(sourceOrigin, old, completed)
    const loaded = decodeCatalogSave(before, resolveAnswers)
    const next = prepareNextCatalogRun(loaded.pack, loaded.run, pack, { ...inputForThird(), runId: 'new-pack-run' }).run
    expect(next.previousLegacy?.contentRevision).toBe(old.manifest.revision)
    expect(decodeCatalogSave(before, resolveAnswers).pack.manifest.revision).toBe(old.manifest.revision)
    expect(encodeCatalogSave({ ...sourceOrigin, name: '세 번째', runId: next.runId }, pack, next)).toContain(pack.manifest.revision)
  })
})

function inputForThird() { return { name: '세 번째', seed: 1, answers: answerValues } }
