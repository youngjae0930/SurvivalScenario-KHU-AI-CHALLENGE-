import type { ContractResult, GameClient } from './index'
import type { ActionPreviewViewModel, AppSnapshot } from './views'
import { safePreviewFixture, shortcutPreviewFixture, uiScenarios } from './fixtures'

export type UiScenario = keyof typeof uiScenarios

/** Manual UI scenario viewer, with previews but no gameplay or persistence. */
export function createUiFixtureClient(initial: UiScenario = 'choice') {
  let snapshot: AppSnapshot = uiScenarios[initial]
  const listeners = new Set<() => void>()
  const client: GameClient = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async previewAction(request): Promise<ContractResult<ActionPreviewViewModel>> {
      if (request.executionActor === 'companion') return { ok: false, error: { code: 'action-unavailable', message: '이 샘플은 실행 주체 선택을 제공하지 않습니다.', decisions: [] } }
      const view = snapshot.view
      if (snapshot.commit.kind !== 'ready') {
        return { ok: false, error: { code: 'busy', message: '샘플 입력이 잠겨 있습니다.', decisions: [] } }
      }
      if (view.kind !== 'choice'
        || request.context.runId !== view.context.runId
        || request.context.eventId !== view.context.eventId
        || request.context.stateRevision !== view.context.stateRevision
        || request.context.snapshotId !== view.context.snapshotId) {
        return { ok: false, error: { code: 'stale-context', message: '현재 선택 화면을 다시 확인하세요.', decisions: [] } }
      }
      const action = view.actions.find(item => item.actionId === request.actionId)
      if (!action || action.availability.kind !== 'available' || request.treatment !== 'none') {
        return { ok: false, error: { code: 'action-unavailable', message: '이 샘플에서는 미리볼 수 없는 입력입니다.', decisions: [] } }
      }
      const preview = [safePreviewFixture, shortcutPreviewFixture].find(item => item.actionId === request.actionId)
      if (!preview) {
        return { ok: false, error: { code: 'action-unavailable', message: '해당 미리보기 샘플이 없습니다.', decisions: [] } }
      }
      return { ok: true, value: preview }
    },
    async dispatch() {
      return {
        ok: false,
        error: {
          code: 'invalid-phase',
          message: 'UI 샘플은 명령을 실행하거나 저장하지 않습니다. showScenario로 화면을 전환하세요.',
          decisions: [],
        },
      }
    },
  }

  return {
    client,
    showScenario(scenario: UiScenario) {
      const next = uiScenarios[scenario]
      if (snapshot === next) return
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}
