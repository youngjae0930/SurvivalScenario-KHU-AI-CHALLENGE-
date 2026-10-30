import { describe, expect, it, vi } from 'vitest'
import type { ContractResult, GameClient } from '../contracts'
import { SaveError } from '../storage/opening-save'
import type { SaveStore } from '../storage/browser-store'
import { createGameClient } from './create-game-client'
import { chooseOpening, makeOrigin, startOpening } from '../test/opening-paths'
import { encodeOpeningSave } from '../storage/opening-save'

const answers = Array.from({ length: 6 }, (_, i) => ({ questionId: `Q0${i + 1}`, answerId: i % 2 === 0 ? 'a' : 'b' }))
const start = { type: 'start-run', name: '저장 검증', answers } as const
function value<T>(result: ContractResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value }
function setup(seed = 1495045943) {
  let raw: string | null = null
  let failing = false
  let owner: number | null = null
  let id = 0
  const stores: SaveStore[] = []
  function create() {
    const ownId = ++id
    const store: SaveStore = {
      read: () => raw,
      acquire: vi.fn(async () => { if (owner !== null && owner !== ownId) return false; owner = ownId; return true }),
      compareAndSet: vi.fn(async (expected, next) => {
        if (raw !== expected) throw new SaveError('save-conflict', '외부 저장 변경')
        if (failing) throw new Error('quota')
        raw = next
      }),
    }
    stores.push(store)
    return createGameClient({ store, makeRunId: () => 'durable-run', makeSeed: () => seed })
  }
  return { create, stores, read: () => raw, overwrite: (next: string) => { raw = next }, fail: (next: boolean) => { failing = next }, close: () => { owner = null } }
}
async function preview(client: GameClient, actionId = 'E01.shortcut') {
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택 아님')
  return value(await client.previewAction({ context: view.context, actionId, treatment: 'none' }))
}
async function execute(client: GameClient, actionId?: string) {
  const issued = await preview(client, actionId)
  return client.dispatch({ type: 'execute-action', context: issued.context, previewToken: issued.previewToken })
}

describe('영속 GameClient', () => {
  it('이전 E04 연결은 저장 실패 중 원본을 유지하고 같은 후보 저장 성공 뒤 E05로 진입한다', async () => {
    const origin = makeOrigin()
    let old = startOpening(origin, 'opening-core-stress-1')
    for (const action of ['E01.safe', 'E02.help', 'E03.observe', 'E04.rest']) old = chooseOpening(old, action)
    const original = encodeOpeningSave(origin, old)
    const env = setup(); env.overwrite(original)
    let client = env.create(); value(await client.dispatch({ type: 'resume' }))
    const view = client.getSnapshot().view
    if (view.kind !== 'segment-complete' || !view.continuation) throw new Error('연결 경계 아님')
    env.fail(true)
    const command = { type: 'continue-segment', context: view.continuation.context } as const
    expect((await client.dispatch(command)).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(view)
    expect(env.read()).toBe(original)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('실패 아님')
    env.fail(false)
    value(await client.dispatch({ type: 'retry-save', operationId: commit.operationId }))
    expect(client.getSnapshot().view).toMatchObject({ kind: 'choice', context: { eventId: 'E05', stateRevision: 8 }, status: view.status })
    expect((await client.dispatch(command)).ok).toBe(false)
    env.close(); client = env.create(); value(await client.dispatch({ type: 'resume' }))
    expect(client.getSnapshot().view).toMatchObject({ kind: 'choice', context: { eventId: 'E05' }, status: view.status })
    expect(JSON.parse(env.read()!)).toMatchObject({ schemaVersion: 5, legacy: null })
  })

  it('치명 결과는 계승과 함께 저장 성공한 뒤만 표시하고 재개 후에도 보존한다', async () => {
    const env = setup(1495045954); let client = env.create()
    value(await client.dispatch(start))
    for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest']) {
      value(await execute(client, action))
      const view = client.getSnapshot().view
      if (view.kind !== 'result') throw new Error('결과 아님')
      value(await client.dispatch({ type: 'acknowledge-result', context: view.context, resultId: view.resultId }))
    }
    const before = client.getSnapshot().view
    expect(before).toMatchObject({ kind: 'choice', context: { eventId: 'E05' }, status: { injury: 2 } })
    const raw = env.read()
    env.fail(true)
    expect(await execute(client, 'E05.explore')).toMatchObject({ ok: false, error: { code: 'save-failed' } })
    expect(client.getSnapshot().view).toBe(before)
    expect(env.read()).toBe(raw)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('실패 아님')
    env.fail(false)
    value(await client.dispatch({ type: 'retry-save', operationId: commit.operationId }))
    const ending = client.getSnapshot().view
    expect(ending).toMatchObject({ kind: 'ending', status: { injury: 3 }, ending: 'escape-failed' })
    expect(JSON.parse(env.read()!)).toMatchObject({ checkpoint: { phase: 'ending' }, legacy: { name: start.name, representativeActions: { E02: 'E02.supplies', E07: null, E10: null } } })
    env.close(); client = env.create(); value(await client.dispatch({ type: 'resume' }))
    expect(client.getSnapshot().view).toEqual(ending)
    expect((await client.dispatch(start)).ok).toBe(false)
  })
  it('비동기 저장 완료 전에는 다음 화면을 확정하거나 명령 성공을 반환하지 않는다', async () => {
    let release!: () => void
    let written: string | null = null
    const store: SaveStore = {
      read: () => null, acquire: async () => true,
      compareAndSet: async (_, next) => { await new Promise<void>(resolve => { release = resolve }); written = next },
    }
    const client = createGameClient({ store, makeRunId: () => 'wait', makeSeed: () => 1 })
    let finished = false
    const dispatched = client.dispatch(start).then(result => { finished = true; return result })
    await vi.waitFor(() => expect(client.getSnapshot().commit.kind).toBe('saving'))
    expect(client.getSnapshot().view.kind).toBe('start')
    expect(finished).toBe(false)
    expect(written).toBe(null)
    expect((await client.dispatch(start)).ok).toBe(false)
    release()
    value(await dispatched)
    expect(written).not.toBe(null)
    expect(client.getSnapshot().view.kind).toBe('choice')
  })

  it('결과 확인 저장 실패도 다음 사건으로 중복 이동하지 않는다', async () => {
    const env = setup(); const client = env.create()
    value(await client.dispatch(start)); value(await execute(client))
    const view = client.getSnapshot().view
    if (view.kind !== 'result') throw new Error('결과 아님')
    env.fail(true)
    const command = { type: 'acknowledge-result', context: view.context, resultId: view.resultId } as const
    expect((await client.dispatch(command)).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(view)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('실패 아님')
    env.fail(false)
    value(await client.dispatch({ type: 'retry-save', operationId: pending.operationId }))
    expect(client.getSnapshot().view).toMatchObject({ kind: 'choice', context: { eventId: 'E02', stateRevision: 2 } })
    expect((await client.dispatch(command)).ok).toBe(false)
  })
  it('선택과 결과를 재시작 복원하고 새 회차 덮어쓰기를 차단한다', async () => {
    const env = setup(); let client = env.create()
    value(await client.dispatch(start))
    expect(client.getSnapshot().persistence.kind).toBe('durable')
    const before = client.getSnapshot().view
    env.close(); client = env.create()
    expect(client.getSnapshot().view).toMatchObject({ kind: 'start', canResume: true, newRun: { kind: 'locked' } })
    expect((await client.dispatch(start)).ok).toBe(false)
    value(await client.dispatch({ type: 'resume' }))
    expect(client.getSnapshot().view).toEqual(before)
    value(await execute(client))
    const result = client.getSnapshot().view
    expect(result).toMatchObject({ kind: 'result', outcome: 'failure', status: { stress: 40, injury: 1, stamina: 60 } })
    env.close(); client = env.create()
    value(await client.dispatch({ type: 'resume' }))
    expect(client.getSnapshot().view).toEqual(result)
    if (result.kind !== 'result') throw new Error('결과 아님')
    value(await client.dispatch({ type: 'acknowledge-result', context: result.context, resultId: result.resultId }))
    expect(client.getSnapshot().view).toMatchObject({ kind: 'choice', context: { eventId: 'E02' } })
  })

  it('저장 실패 시 기존 화면·영속 데이터 유지, 같은 결과 재시도와 이중 입력 차단', async () => {
    const env = setup(); const client = env.create()
    value(await client.dispatch(start))
    const before = client.getSnapshot().view; const raw = env.read()
    env.fail(true)
    expect(await execute(client)).toMatchObject({ ok: false, error: { code: 'save-failed' } })
    expect(client.getSnapshot().view).toBe(before)
    expect(env.read()).toBe(raw)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    expect((await client.dispatch(start)).ok).toBe(false)
    expect((await client.dispatch({ type: 'retry-save', operationId: 'foreign' })).ok).toBe(false)
    const writes = env.stores[0].compareAndSet as ReturnType<typeof vi.fn>
    const candidate = writes.mock.calls[1][1]
    env.fail(false)
    const command = { type: 'retry-save', operationId: commit.operationId } as const
    const results = await Promise.all([client.dispatch(command), client.dispatch(command)])
    expect(results.filter(result => result.ok)).toHaveLength(1)
    expect(env.read()).toBe(candidate)
    expect(writes.mock.calls[2][1]).toBe(candidate)
    expect(client.getSnapshot()).toMatchObject({ commit: { kind: 'ready' }, view: { kind: 'result', outcome: 'failure', status: { stress: 40, injury: 1, stamina: 60 } } })
    expect((await client.dispatch(command)).ok).toBe(false)
  })

  it('첫 저장 실패도 같은 이름·회차·난수로 재시도한다', async () => {
    const env = setup(); const client = env.create(); env.fail(true)
    expect((await client.dispatch(start)).ok).toBe(false)
    expect(env.read()).toBe(null)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    env.fail(false)
    value(await client.dispatch({ type: 'retry-save', operationId: commit.operationId }))
    expect(client.getSnapshot().view).toMatchObject({ kind: 'choice', context: { runId: 'durable-run', stateRevision: 0 }, status: { name: start.name, stress: 30 } })
  })

  it('다른 활성 탭·외부 변경은 덮어쓰지 않고 진행을 잠근다', async () => {
    const env = setup(); const first = env.create(); value(await first.dispatch(start))
    const second = env.create(); const raw = env.read()
    expect(await second.dispatch({ type: 'resume' })).toMatchObject({ ok: false, error: { code: 'save-conflict' } })
    expect(second.getSnapshot().commit.kind).toBe('blocked')
    expect(env.read()).toBe(raw)
    env.overwrite('external data')
    expect(await execute(first)).toMatchObject({ ok: false, error: { code: 'save-conflict' } })
    expect(first.getSnapshot().commit.kind).toBe('blocked')
    expect(env.read()).toBe('external data')
  })

  it.each(['broken', JSON.stringify({ schemaVersion: 3, rulesVersion: '1.2' })])('손상·구버전은 보존하며 새 회차와 재개를 차단한다', async raw => {
    const env = setup(); env.overwrite(raw); const client = env.create()
    expect(client.getSnapshot().commit.kind).toBe('blocked')
    expect((await client.dispatch(start)).ok).toBe(false)
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(false)
    expect(env.read()).toBe(raw)
  })

  it('저장 접근이 불가능할 때 자동으로 세션 모드로 전환하지 않는다', () => {
    const client = createGameClient({ store: { read() { throw new Error('denied') }, acquire: async () => true, compareAndSet: async () => {} } })
    expect(client.getSnapshot()).toMatchObject({ persistence: { kind: 'durable' }, commit: { kind: 'blocked' } })
  })
})
