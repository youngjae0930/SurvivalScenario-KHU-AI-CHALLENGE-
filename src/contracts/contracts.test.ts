import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ActionPreviewViewModel, AppSnapshot, ContractResult, GameClient, GameCommand } from './index'
import { choiceSnapshotFixture, safePreviewFixture, shortcutPreviewFixture, uiScenarios } from './fixtures'

describe('UI와 코어의 공개 계약', () => {
  it('세션·저장·샘플 능력을 구분하고 개발 구간완료를 결말과 구분한다', () => {
    expect(choiceSnapshotFixture.contractVersion).toBe('0.8.0')
    expect(choiceSnapshotFixture.persistence.kind).toBe('fixture')
    expect(uiScenarios.segmentComplete.view.kind).toBe('segment-complete')
    expect(uiScenarios.segmentComplete.view).not.toHaveProperty('ending')
    expect(uiScenarios.nextRunQuestionnaire.view.succession.sourceRunId).toBe('fixture-ended-run')
  })
  it('미리보기와 실행은 같은 스냅샷의 핸들을 사용한다', () => {
    expectTypeOf<GameClient['previewAction']>().returns.toEqualTypeOf<Promise<ContractResult<ActionPreviewViewModel>>>()
    expectTypeOf<GameClient['dispatch']>().returns.toEqualTypeOf<Promise<ContractResult<null>>>()

    for (const preview of [safePreviewFixture, shortcutPreviewFixture]) {
      expect(preview.context).toEqual(choiceSnapshotFixture.view.context)
      expect(choiceSnapshotFixture.view.actions.some(action => action.actionId === preview.actionId)).toBe(true)
    }
  })

  it('저장 중과 저장 실패 샘플은 미커밋 결과를 노출하지 않는다', () => {
    expect(uiScenarios.saving.view).toBe(choiceSnapshotFixture.view)
    expect(uiScenarios.saveFailed.view).toBe(choiceSnapshotFixture.view)
    expect(uiScenarios.saveFailed.commit.operationId).toBe(uiScenarios.saving.commit.operationId)
  })

  it('UI 샘플은 실제 코어 출력으로 표시되지 않고 미정 추천은 계산하지 않는다', () => {
    for (const scenario of Object.values(uiScenarios)) {
      expect(scenario.source).toBe('ui-fixture')
    }
    expect(uiScenarios.pendingPolicy.view.companion.opinion.kind).toBe('pending-decision')
    expect(uiScenarios.pendingPolicy.view.actions.every(action => action.availability.kind === 'pending-decision')).toBe(true)
  })

  it('판정 난수와 미승인 파견 입력은 공개 계약에 포함하지 않는다', () => {
    expectTypeOf<AppSnapshot>().not.toHaveProperty('rngState')
    expectTypeOf<AppSnapshot>().not.toHaveProperty('pendingState')
    expectTypeOf<ActionPreviewViewModel>().not.toHaveProperty('roll')
    expectTypeOf<Extract<GameCommand, { type: 'execute-action' }>>().not.toHaveProperty('actor')
  })
})
