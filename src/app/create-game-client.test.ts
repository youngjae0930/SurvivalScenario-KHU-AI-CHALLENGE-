import { describe, expect, it, vi } from 'vitest'
import type { ChoiceViewModel, ContractResult, GameClient, GameCommand, ResultViewModel } from '../contracts'
import { createGameClient } from './create-game-client'

function value<T>(result: ContractResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
const answers = Array.from({ length: 6 }, (_, i) => ({ questionId: `Q0${i + 1}`, answerId: i % 2 === 0 ? 'a' : 'b' }))
const startCommand: GameCommand = { type: 'start-run', name: '검증', answers }
const create = (seed = 1) => createGameClient({ makeSeed: () => seed, makeRunId: () => 'app-run' })
async function started(seed = 1) { const client = create(seed); value(await client.dispatch(startCommand)); return client }
function choice(client: GameClient): ChoiceViewModel {
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택 아님')
  return view
}
function result(client: GameClient): ResultViewModel {
  const view = client.getSnapshot().view
  if (view.kind !== 'result') throw new Error('결과 아님')
  return view
}
async function execute(client: GameClient, actionId: string, treatment: 'none' | 'medkit' = 'none') {
  const preview = value(await client.previewAction({ context: choice(client).context, actionId, treatment }))
  value(await client.dispatch({ type: 'execute-action', context: preview.context, previewToken: preview.previewToken }))
}
async function acknowledge(client: GameClient) {
  const view = result(client)
  value(await client.dispatch({ type: 'acknowledge-result', context: view.context, resultId: view.resultId }))
}

describe('실제 세션 GameClient', () => {
  it('저장 없는 시작 화면·안정된 참조·깊은 읽기 전용 스냅샷을 제공한다', () => {
    const client = create()
    const snapshot = client.getSnapshot()
    expect(snapshot).toBe(client.getSnapshot())
    expect(snapshot).toMatchObject({ contractVersion: '0.7.0', source: 'core', persistence: { kind: 'session' }, commit: { kind: 'ready' }, view: { kind: 'start', canResume: false } })
    expect(snapshot.persistence.message).toContain('새로고침')
    expect(snapshot.view).not.toHaveProperty('rngState')
    expect(Object.isFrozen(snapshot.view)).toBe(true)
    expect(Reflect.set(snapshot.persistence, 'kind', 'durable')).toBe(false)
  })

  it('설문부터 실제 여섯 사건을 플레이하고 결말이 아닌 구간완료에 도달한다', async () => {
    const client = await started()
    const observer = vi.fn()
    const unsubscribe = client.subscribe(observer)
    for (const actionId of ['E01.safe', 'E02.help', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw']) {
      await execute(client, actionId)
      const before = result(client)
      await acknowledge(client)
      const after = client.getSnapshot().view
      if ('status' in after) expect(after.status).toEqual(before.status)
    }
    expect(client.getSnapshot().view).toMatchObject({ kind: 'segment-complete', nextEventId: 'E07', completedEventIds: ['E01', 'E02', 'E03', 'E04', 'E05', 'E06'], status: { stress: 25, stamina: 65, supply: 0, injury: 0 } })
    expect(client.getSnapshot().view).not.toHaveProperty('legacySummary')
    expect(observer).toHaveBeenCalledTimes(12)
    unsubscribe()
    expect((await client.dispatch(startCommand)).ok).toBe(false)
    expect(create().getSnapshot().view.kind).toBe('start')
  })

  it('미리보기와 취소는 실제 수치·판정·구독을 변경하지 않는다', async () => {
    const client = await started()
    const before = client.getSnapshot()
    const listener = vi.fn(); client.subscribe(listener)
    for (let i = 0; i < 5; i++) {
      const preview = value(await client.previewAction({ context: choice(client).context, actionId: 'E01.shortcut', treatment: 'none' }))
      expect(preview.risk).toMatchObject({ kind: 'probability', percent: 70 })
      expect(preview.outcomes).toEqual({ success: ['무기 확보'], failure: ['스트레스 +10 (최대 100)', '부상 +1'] })
      expect(Reflect.set(preview.context, 'stateRevision', 999)).toBe(false)
    }
    expect(client.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    await execute(client, 'E01.shortcut')
    expect(result(client)).toMatchObject({ outcome: 'success', status: { weapon: true, stamina: 60 } })
  })

  it('최신 미리보기 토큰만 실행하고 변조한 스냅샷을 거부한다', async () => {
    const client = await started()
    const context = choice(client).context
    const first = value(await client.previewAction({ context, actionId: 'E01.safe', treatment: 'none' }))
    const second = value(await client.previewAction({ context, actionId: 'E01.shortcut', treatment: 'none' }))
    expect(await client.dispatch({ type: 'execute-action', context, previewToken: first.previewToken })).toMatchObject({ ok: false, error: { code: 'stale-context' } })
    expect(await client.dispatch({ type: 'execute-action', context: { ...context, snapshotId: 'forged' }, previewToken: second.previewToken })).toMatchObject({ ok: false, error: { code: 'stale-context' } })
    value(await client.dispatch({ type: 'execute-action', context, previewToken: second.previewToken }))
    expect(result(client).actionLabel).toContain('지름길')
  })

  it('빠른 시작·실행·결과 확인은 각각 한 번만 커밋한다', async () => {
    const client = create()
    const starts = await Promise.all([client.dispatch(startCommand), client.dispatch(startCommand)])
    expect(starts.filter(item => item.ok)).toHaveLength(1)
    expect(starts[1]).toMatchObject({ ok: false, error: { code: 'busy' } })
    const preview = value(await client.previewAction({ context: choice(client).context, actionId: 'E01.safe', treatment: 'none' }))
    const command: GameCommand = { type: 'execute-action', context: preview.context, previewToken: preview.previewToken }
    const executions = await Promise.all([client.dispatch(command), client.dispatch(command)])
    expect(executions.filter(item => item.ok)).toHaveLength(1)
    expect(result(client).status.traits[0].value).toBe(58)
    const view = result(client)
    const ack: GameCommand = { type: 'acknowledge-result', context: view.context, resultId: view.resultId }
    expect((await Promise.all([client.dispatch(ack), client.dispatch(ack)])).filter(item => item.ok)).toHaveLength(1)
    expect(choice(client).context).toMatchObject({ eventId: 'E02', stateRevision: 2 })
    expect((await client.dispatch(command)).ok).toBe(false)
    expect((await client.dispatch(ack)).ok).toBe(false)
  })

  it('부상 치료의 미리보기 변경은 토큰을 교체하고 확정한 비용만 쓴다', async () => {
    const client = await started(1495045943)
    for (const actionId of ['E01.safe', 'E02.help', 'E03.cross']) { await execute(client, actionId); await acknowledge(client) }
    const view = choice(client)
    expect(view.status.injury).toBe(1)
    expect(view.treatment.kind).toBe('available')
    const untreated = value(await client.previewAction({ context: view.context, actionId: 'E04.maintain', treatment: 'none' }))
    const treated = value(await client.previewAction({ context: view.context, actionId: 'E04.maintain', treatment: 'medkit' }))
    expect(treated.costs).toEqual(['치료 도구 1'])
    expect(treated.outcomes.success).toContain('부상 -1')
    expect(client.getSnapshot().view).toBe(view)
    expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: untreated.previewToken })).ok).toBe(false)
    value(await client.dispatch({ type: 'execute-action', context: treated.context, previewToken: treated.previewToken }))
    expect(result(client).status).toMatchObject({ medkit: 0, injury: 0, supply: 0, stress: 35, stamina: 70 })
    expect(result(client).text.join(' ')).toContain('처치')
  })

  it('잘못된 설문과 이름은 시작하지 않고 수정 후 재시도할 수 있다', async () => {
    const client = create()
    for (const command of [
      { ...startCommand, name: ' ' }, { ...startCommand, name: '가'.repeat(41) },
      { ...startCommand, answers: answers.slice(1) }, { ...startCommand, answers: Array(6) },
      { ...startCommand, answers: answers.map(() => answers[0]) },
      { ...startCommand, answers: [{ questionId: 'Q01', answerId: 'not-real' }, ...answers.slice(1)] },
    ]) {
      expect(await client.dispatch(command)).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
      expect(client.getSnapshot().view.kind).toBe('start')
    }
    value(await client.dispatch(startCommand))
    expect(choice(client).status.name).toBe('검증')
  })

  it('틀린 사건·치료 조합·결과 ID·저장 명령은 상태를 바꾸지 않는다', async () => {
    const client = await started()
    const context = choice(client).context
    for (const request of [
      { context, actionId: 'E02.help', treatment: 'none' as const },
      { context, actionId: 'E01.safe', treatment: 'medkit' as const },
      { context: { ...context, runId: 'foreign' }, actionId: 'E01.safe', treatment: 'none' as const },
    ]) expect((await client.previewAction(request)).ok).toBe(false)
    for (const command of [{ type: 'resume' }, { type: 'retry-save', operationId: 'made-up' }, { type: 'unknown' }] as unknown as GameCommand[]) expect((await client.dispatch(command)).ok).toBe(false)
    expect(choice(client).context.stateRevision).toBe(0)
    await execute(client, 'E01.safe')
    const before = client.getSnapshot()
    expect((await client.dispatch({ type: 'acknowledge-result', context: result(client).context, resultId: 'foreign' })).ok).toBe(false)
    expect(client.getSnapshot()).toBe(before)
  })

  it('구독자 오류가 커밋 성공을 실패로 바꾸지 않고 구독 해제가 동작한다', async () => {
    const client = create()
    client.subscribe(() => { throw new Error('UI observer failure') })
    const listener = vi.fn(); const unsubscribe = client.subscribe(listener)
    value(await client.dispatch(startCommand))
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    await execute(client, 'E01.safe')
    expect(listener).toHaveBeenCalledOnce()
    expect(result(client).status.traits[0].value).toBe(58)
  })

  it('초기화 오류는 기존 화면을 보존하고 잠금을 해제한다', async () => {
    let first = true
    const client = createGameClient({ makeSeed: () => { if (first) { first = false; throw new Error('seed failure') } return 1 }, makeRunId: () => 'retry-run' })
    const before = client.getSnapshot()
    expect(await client.dispatch(startCommand)).toMatchObject({ ok: false, error: { code: 'internal-error' } })
    expect(client.getSnapshot()).toBe(before)
    value(await client.dispatch(startCommand))
    expect(choice(client).context.runId).toBe('retry-run')
  })
})
