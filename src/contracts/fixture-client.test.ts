import { describe, expect, it } from 'vitest'
import { createUiFixtureClient } from './fixture-client'
import { choiceFixture } from './fixtures'

describe('별도 UI 개발용 샘플 클라이언트', () => {
  it('스냅샷 참조를 유지하고 화면 변경과 구독 해제를 지원한다', () => {
    const harness = createUiFixtureClient()
    const initial = harness.client.getSnapshot()
    let calls = 0
    const unsubscribe = harness.client.subscribe(() => { calls++ })
    expect(harness.client.getSnapshot()).toBe(initial)
    harness.showScenario('choice')
    expect(calls).toBe(0)
    harness.showScenario('result')
    expect(calls).toBe(1)
    expect(harness.client.getSnapshot().view.kind).toBe('result')
    unsubscribe()
    harness.showScenario('ending')
    expect(calls).toBe(1)
  })

  it('반복 미리보기는 현재 화면을 변경하지 않고 오래된 입력을 거부한다', async () => {
    const { client } = createUiFixtureClient()
    const before = client.getSnapshot()
    const request = { context: choiceFixture.context, actionId: 'fixture.E01.safe', treatment: 'none' } as const
    const first = await client.previewAction(request)
    expect(first.ok).toBe(true)
    expect(await client.previewAction(request)).toEqual(first)
    expect(client.getSnapshot()).toBe(before)
    const stale = await client.previewAction({ ...request, context: { ...request.context, stateRevision: 99 } })
    expect(stale).toMatchObject({ ok: false, error: { code: 'stale-context' } })
  })

  it('잠금·미승인·저장실패 샘플에서는 미리보기를 실행하지 않는다', async () => {
    const harness = createUiFixtureClient('locked')
    const request = { context: choiceFixture.context, actionId: 'fixture.E01.shortcut', treatment: 'none' } as const
    expect((await harness.client.previewAction(request)).ok).toBe(false)
    harness.showScenario('pendingPolicy')
    expect((await harness.client.previewAction(request)).ok).toBe(false)
    harness.showScenario('saveFailed')
    expect(await harness.client.previewAction(request)).toMatchObject({ ok: false, error: { code: 'busy' } })
  })

  it('샘플 명령은 실제 실행·저장 성공을 가장하지 않는다', async () => {
    const { client } = createUiFixtureClient()
    const before = client.getSnapshot()
    const result = await client.dispatch({ type: 'execute-action', context: choiceFixture.context, previewToken: 'fixture-preview-safe' })
    expect(result.ok).toBe(false)
    expect(client.getSnapshot()).toBe(before)
  })
})
