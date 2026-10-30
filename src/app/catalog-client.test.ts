import { describe, expect, it } from 'vitest'
import type { ContractResult, GameClient } from '../contracts'
import type { SaveStore } from '../storage/browser-store'
import { encodeOpeningSave, SaveError } from '../storage/opening-save'
import { makeOrigin, startOpening } from '../test/opening-paths'
import { makeCatalogFixture } from '../test/catalog-fixtures'
import { createCatalogClient, createProductClient } from './catalog-client'

function value<T>(result: ContractResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value }
function setup() {
  let raw: string | null = null
  let fail = false
  let writes = 0
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    writes++
    if (raw !== expected) throw new SaveError('save-conflict', '충돌')
    if (fail) throw new Error('quota')
    raw = next
  } }
  return { store, raw: () => raw, fail: (next: boolean) => { fail = next }, overwrite: (next: string) => { raw = next }, writes: () => writes }
}
async function start(client: GameClient) { const origin = makeOrigin(); value(await client.dispatch({ type: 'start-run', name: origin.name, answers: origin.answers })) }
async function preview(client: GameClient, actionId?: string) {
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택 아님')
  return value(await client.previewAction({ context: view.context, actionId: actionId ?? view.actions.find(action => action.availability.kind === 'available')!.actionId, treatment: 'none' }))
}
describe('제품의 콘텐츠 기반 진행과 기존 저장 호환', () => {
  it('새 회차는 schema6를 사용하고 기존 schema4/5 저장은 다시 쓰지 않는다', async () => {
    const env = setup()
    let client = createProductClient({ store: env.store, makeSeed: () => 1, makeRunId: () => 'new' })
    await start(client)
    expect(JSON.parse(env.raw()!)).toMatchObject({ schemaVersion: 6, kind: 'catalog-solo' })
    for (const revision of ['opening-core-stress-1', 'hospital-core-stress-2'] as const) {
      const origin = makeOrigin()
      const old = encodeOpeningSave(origin, startOpening(origin, revision))
      env.overwrite(old)
      client = createProductClient({ store: env.store })
      value(await client.dispatch({ type: 'resume' }))
      expect(env.raw()).toBe(old)
      expect(client.getSnapshot().presentation).toBeUndefined()
    }
  })
  it('장소·사건·선택·문구 임의 ID를 UI 계약으로 전달한다', async () => {
    const client = createCatalogClient({ pack: makeCatalogFixture(), makeSeed: () => 17389, makeRunId: () => 'demo' })
    await start(client)
    const initial = client.getSnapshot().view
    expect(initial).toMatchObject({ kind: 'choice', context: { eventId: 'walk' }, notices: ['전반부 · 빌라'] })
    if (initial.kind !== 'choice') throw new Error('선택 아님')
    expect(initial.actions).toHaveLength(4)
    expect(initial.actions[0].actionId).toBe('continue')
    const issued = await preview(client, 'continue')
    value(await client.dispatch({ type: 'execute-action', context: issued.context, previewToken: issued.previewToken }))
    expect(client.getSnapshot().view).toMatchObject({ kind: 'result', nextEventId: null, completesSegment: false })
  })
  it('저장 실패 동안 장소·문구를 확정하지 않고 같은 후보로 재시도한다', async () => {
    const env = setup()
    let client = createCatalogClient({ pack: makeCatalogFixture(), store: env.store, makeSeed: () => 17389, makeRunId: () => 'demo' })
    await start(client)
    const issued = await preview(client, 'continue')
    value(await client.dispatch({ type: 'execute-action', context: issued.context, previewToken: issued.previewToken }))
    const before = client.getSnapshot().view
    if (before.kind !== 'result') throw new Error('결과 아님')
    const saved = env.raw()
    env.fail(true)
    expect((await client.dispatch({ type: 'acknowledge-result', context: before.context, resultId: before.resultId })).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(before)
    expect(env.raw()).toBe(saved)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    expect((await client.dispatch({ type: 'acknowledge-result', context: before.context, resultId: before.resultId })).ok).toBe(false)
    env.fail(false)
    value(await client.dispatch({ type: 'retry-save', operationId: commit.operationId }))
    const next = client.getSnapshot().view
    client = createProductClient({ store: env.store })
    const writes = env.writes()
    value(await client.dispatch({ type: 'resume' }))
    expect(client.getSnapshot().view).toEqual(next)
    expect(env.writes()).toBe(writes)
  })
  it('같은 토큰 중복 실행과 외부 저장 충돌을 차단한다', async () => {
    const env = setup()
    const client = createProductClient({ store: env.store, makeSeed: () => 1, makeRunId: () => 'new' })
    await start(client)
    const issued = await preview(client)
    const command = { type: 'execute-action', context: issued.context, previewToken: issued.previewToken } as const
    const outcomes = await Promise.all([client.dispatch(command), client.dispatch(command)])
    expect(outcomes.filter(result => result.ok)).toHaveLength(1)
    const view = client.getSnapshot().view
    if (view.kind !== 'result') throw new Error('결과 아님')
    env.overwrite('다른 저장')
    expect((await client.dispatch({ type: 'acknowledge-result', context: view.context, resultId: view.resultId })).ok).toBe(false)
    expect(env.raw()).toBe('다른 저장')
    expect(client.getSnapshot().commit.kind).toBe('blocked')
  })
})
