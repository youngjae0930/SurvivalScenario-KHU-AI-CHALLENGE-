import { expect, it } from 'vitest'
import type { ContractResult, GameClient } from '../contracts'
import type { SaveStore } from '../storage/browser-store'
import { encodeOpeningSave, SaveError } from '../storage/opening-save'
import { makeOrigin, startOpening } from '../test/opening-paths'
import { createCatalogClient, createProductClient } from './catalog-client'

const restart = { type: 'restart', confirmation: 'discard-saved-progress' } as const
function value<T>(result: ContractResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value }
async function start(client: GameClient) { const origin = makeOrigin(); value(await client.dispatch({ type: 'start-run', name: origin.name, answers: origin.answers })) }
function setup(initial: string | null = null) {
  let raw = initial, failing = false, allowed = true, id = 0
  const write = async (expected: string | null, next: string | null) => {
    if (raw !== expected) throw new SaveError('save-conflict', '저장 충돌')
    if (failing) throw new Error('storage unavailable')
    raw = next
  }
  const store: SaveStore = { read: () => raw, acquire: async () => allowed,
    compareAndSet: write, compareAndRemove: expected => write(expected, null) }
  const options = { store, makeSeed: () => 1, makeRunId: () => `fresh-${++id}` }
  return { store, options, raw: () => raw, fail: (next: boolean) => { failing = next }, lock: () => { allowed = false }, overwrite: () => { raw = 'external' } }
}
it('초기화 실패는 이전 화면/저장을 유지하고 재시도 성공 뒤만 설문과 빈 슬롯을 표시한다', async () => {
  const env = setup(), client = createProductClient(env.options)
  await start(client)
  const before = client.getSnapshot().view, original = env.raw()
  env.fail(true)
  expect(await client.dispatch(restart)).toMatchObject({ ok: false, error: { code: 'save-failed' } })
  expect(env.raw()).toBe(original)
  expect(client.getSnapshot().view).toBe(before)
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('실패 아님')
  expect((await client.dispatch(restart)).ok).toBe(false)
  env.fail(false)
  value(await client.dispatch({ type: 'retry-save', operationId: commit.operationId }))
  expect(env.raw()).toBeNull()
  expect(client.getSnapshot().view).toMatchObject({ kind: 'start', canResume: false, previousAnswers: [] })
  expect(createProductClient(env.options).getSnapshot().view).toMatchObject({ kind: 'start', canResume: false })
  await start(client)
  expect(client.getSnapshot().view).toMatchObject({ kind: 'choice', context: { eventId: 'E01' }, companion: { kind: 'absent' } })
  expect(JSON.parse(env.raw()!)).toMatchObject({ schemaVersion: 6, origin: { runId: 'fresh-2' }, legacy: null })
})
it('이어하기 전에도 초기화할 수 있고 잠금/외부 변경 충돌에서는 원본을 지우지 않는다', async () => {
  for (const conflict of ['lock', 'external'] as const) {
    const env = setup(); await start(createProductClient(env.options))
    const client = createProductClient(env.options), original = env.raw()
    if (conflict === 'lock') env.lock(); else env.overwrite()
    expect(await client.dispatch(restart)).toMatchObject({ ok: false, error: { code: 'save-conflict' } })
    expect(env.raw()).toBe(conflict === 'lock' ? original : 'external')
    expect(client.getSnapshot().commit.kind).toBe('blocked')
  }
  const env = setup(); await start(createProductClient(env.options))
  const resumedStart = createProductClient(env.options)
  value(await resumedStart.dispatch(restart))
  expect(env.raw()).toBeNull()
})
it('이전 schema4/5는 명시적 초기화 성공 후 최신 단독 회차로 출발한다', async () => {
  for (const revision of ['opening-core-stress-1', 'hospital-core-stress-2'] as const) {
    const origin = makeOrigin(), original = encodeOpeningSave(origin, startOpening(origin, revision))
    const env = setup(original), client = createProductClient(env.options)
    expect(env.raw()).toBe(original)
    env.fail(true)
    expect((await client.dispatch(restart)).ok).toBe(false)
    expect(env.raw()).toBe(original)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('실패 아님')
    env.fail(false)
    value(await client.dispatch({ type: 'retry-save', operationId: commit.operationId }))
    await start(client)
    expect(JSON.parse(env.raw()!)).toMatchObject({ schemaVersion: 6, kind: 'catalog-solo' })
    expect(client.getSnapshot().presentation).toBeDefined()
  }
})
it('경고 확인 없는 명령은 거부하고 초기화 후 예전 미리보기 토큰은 사용할 수 없다', async () => {
  const client = createCatalogClient({ makeSeed: () => 1 })
  await start(client)
  const before = client.getSnapshot(), view = before.view
  if (view.kind !== 'choice') throw new Error('선택 아님')
  const issued = value(await client.previewAction({ context: view.context, actionId: view.actions[0].actionId, treatment: 'none' }))
  expect((await client.dispatch({ type: 'restart' } as typeof restart)).ok).toBe(false)
  expect(client.getSnapshot()).toBe(before)
  value(await client.dispatch(restart))
  await start(client)
  expect((await client.dispatch({ type: 'execute-action', context: issued.context, previewToken: issued.previewToken })).ok).toBe(false)
})
it('동행 저장을 초기화하면 계승 없는 단독 첫 회차를 생성한다', async () => {
  const env = setup()
  await start(createCatalogClient({ ...env.options, companion: { name: '이전 인물', traits: { risk: 90, cognition: 20, affect: 80 }, trust: 80 } }))
  expect(JSON.parse(env.raw()!)).toMatchObject({ schemaVersion: 7 })
  const client = createProductClient(env.options)
  value(await client.dispatch(restart))
  await start(client)
  expect(JSON.parse(env.raw()!)).toMatchObject({ schemaVersion: 6, legacy: null, checkpoint: { companion: null } })
})
it('삭제 완료 전에는 기존 화면을 유지하고 중복 초기화를 차단한다', async () => {
  const env = setup(); await start(createProductClient(env.options))
  let release!: () => void
  const store: SaveStore = { ...env.store, compareAndRemove: async expected => {
    await new Promise<void>(resolve => { release = resolve })
    await env.store.compareAndRemove!(expected)
  } }
  const client = createProductClient({ ...env.options, store }), before = client.getSnapshot().view
  const pending = client.dispatch(restart)
  await Promise.resolve(); await Promise.resolve()
  expect(client.getSnapshot().view).toBe(before)
  expect(env.raw()).not.toBeNull()
  expect((await client.dispatch(restart)).ok).toBe(false)
  release(); value(await pending)
  expect(env.raw()).toBeNull()
  expect(client.getSnapshot().view).toMatchObject({ kind: 'start', canResume: false })
})
