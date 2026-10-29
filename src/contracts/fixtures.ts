/** UI-only display samples. Not executable content, engine output or saved game data. */
import { UI_CONTRACT_VERSION } from './common'
import type { ActionPreviewViewModel, AppSnapshot, ChoiceViewModel, StatusViewModel } from './views'

const status = {
  name: 'UI 샘플',
  traits: [
    { axis: 'risk', value: 50, leftLabel: '모험', rightLabel: '안정', band: 'normal' },
    { axis: 'cognition', value: 50, leftLabel: '분석', rightLabel: '직관', band: 'normal' },
    { axis: 'affect', value: 50, leftLabel: '이성', rightLabel: '감정', band: 'normal' },
  ],
  stress: 30, stamina: 70, injury: 0, supply: 1, medkit: 1, weapon: false,
} as const satisfies StatusViewModel

const context = {
  runId: 'fixture-run', eventId: 'E01', stateRevision: 0, snapshotId: 'fixture-choice',
} as const

export const choiceFixture = {
  notices: [],
  kind: 'choice', context, title: '대피소 출발 · UI 표시 샘플',
  story: [{
    key: { textId: 'fixture.E01.intro', contentRevision: 'fixture-1', contextVariantId: 'solo' },
    text: '화면 배치 검토용 문장입니다. 안전을 확인하거나 지름길로 이동합니다.',
    collapsible: false, initiallyCollapsed: false,
  }],
  status, companion: { kind: 'absent' }, recentResult: null,
  actions: [
    {
      actionId: 'fixture.E01.safe', goalId: 'fixture.safe', label: '안전 확인',
      intention: '안전을 확인하고 출발한다.', availability: { kind: 'available' },
      recommended: false, requiresCompanion: false,
    },
    {
      actionId: 'fixture.E01.shortcut', goalId: 'fixture.shortcut', label: '지름길',
      intention: '위험을 감수하고 지름길로 이동한다.', availability: { kind: 'available' },
      recommended: false, requiresCompanion: false,
    },
  ],
  treatment: { kind: 'locked', reasons: ['회복 사건에서만 치료할 수 있습니다.'] },
} as const satisfies ChoiceViewModel

export const safePreviewFixture = {
  previewToken: 'fixture-preview-safe', context, actionId: 'fixture.E01.safe', treatment: 'none', goalId: 'fixture.safe',
  label: '안전 확인', intention: '안전을 확인하고 출발한다.', target: '이동 경로',
  availability: { kind: 'available' }, requirements: [], costs: ['비용 없음'],
  traitChanges: ['안정 방향 +8'],
  outcomes: { success: ['안전을 확인합니다.'], failure: [] },
  risk: { kind: 'certain', explanation: '확정 행동입니다.' },
  participation: { kind: 'absent' }, warnings: [],
} as const satisfies ActionPreviewViewModel

export const shortcutPreviewFixture = {
  ...safePreviewFixture,
  previewToken: 'fixture-preview-shortcut', actionId: 'fixture.E01.shortcut', goalId: 'fixture.shortcut',
  label: '지름길', intention: '위험을 감수하고 지름길로 이동한다.',
  costs: ['스태미나 10'], traitChanges: ['모험 방향 -8'],
  risk: { kind: 'probability', percent: 70, breakdown: ['일반 위험 70% · 나머지 보정 0%p'] },
  warnings: ['실패 시 스트레스 증가와 부상 위험이 있습니다.'],
  outcomes: { success: ['무기 획득'], failure: ['스트레스 +10', '부상 +1'] },
} as const satisfies ActionPreviewViewModel

/** Actor options live inside a preview; the four scene choices are not expanded. */
export const commandPreviewFixture = {
  ...shortcutPreviewFixture,
  execution: { actor: 'companion', role: '정찰', options: [
    { actor: 'protagonist', label: '직접 실행', availability: { kind: 'available' } },
    { actor: 'companion', label: '동료에게 정찰 맡기기', availability: { kind: 'available' } },
  ] },
  participation: { kind: 'cooperate', explanation: '동료가 앞장서고 주인공은 뒤에서 지원합니다.', contribution: ['별도의 성공률 보너스는 없습니다.'] },
  warnings: [...shortcutPreviewFixture.warnings, '주인공도 지원·후퇴 중 같은 위험을 감수합니다.'],
} as const satisfies ActionPreviewViewModel

export const choiceSnapshotFixture = {
  contractVersion: UI_CONTRACT_VERSION, source: 'ui-fixture', view: choiceFixture,
  persistence: { kind: 'fixture', message: '화면 검토용 샘플이며 게임을 실행하거나 저장하지 않습니다.' },
  commit: { kind: 'ready' }, profile: { collapseReadTextEnabled: false },
  pendingDecisions: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09'],
} as const satisfies AppSnapshot

/** Independent scenarios; they do not form a simulated playable game. */
export const uiScenarios = {
  start: {
    ...choiceSnapshotFixture,
    view: {
      kind: 'start', introduction: ['첫 회차는 혼자 진행합니다. 설문 화면 배치용 예시입니다.'],
      questions: Array.from({ length: 6 }, (_, index) => ({
        questionId: `fixture.question.${index + 1}`,
        text: `설문 ${index + 1} · 문구 검토 전 자리 표시자`,
        answers: [
          { answerId: `fixture.answer.${index + 1}.a`, label: '응답 A' },
          { answerId: `fixture.answer.${index + 1}.b`, label: '응답 B' },
        ],
      })),
      previousAnswers: [], canResume: false, newRun: { kind: 'available' },
    },
  },
  choice: choiceSnapshotFixture,
  nextRunQuestionnaire: {
    ...choiceSnapshotFixture,
    view: { kind: 'start', introduction: ['새 주인공 설문 표시용 예시입니다.'], questions: [], previousAnswers: [], canResume: false, newRun: { kind: 'available' },
      succession: { sourceRunId: 'fixture-ended-run', sourceResultId: 'fixture-ended-result', endingTitle: '탈출 · 표시 샘플', summary: ['직전 성향·판단 계승 표시 예시입니다.'] } },
  },
  saving: { ...choiceSnapshotFixture, commit: { kind: 'saving', operationId: 'fixture-operation' } },
  saveFailed: {
    ...choiceSnapshotFixture,
    commit: { kind: 'save-failed', operationId: 'fixture-operation', message: '저장 실패 표시 샘플입니다. 재시도는 같은 결과를 저장합니다.' },
  },
  locked: {
    ...choiceSnapshotFixture,
    view: {
      ...choiceFixture,
      actions: [choiceFixture.actions[0], {
        ...choiceFixture.actions[1],
        availability: { kind: 'locked', reasons: ['UI 잠금 표현 검토용입니다. 실제 E01 규칙이 아닙니다.'] },
      }],
    },
  },
  pendingPolicy: {
    ...choiceSnapshotFixture,
    view: {
      ...choiceFixture,
      companion: {
        kind: 'present', name: '동료 표시 샘플', trust: 50,
        opinion: { kind: 'pending-decision', decisions: ['D01', 'D02'], message: '추천 정책 결정 대기' },
      },
      actions: choiceFixture.actions.map(action => ({
        ...action,
        availability: { kind: 'pending-decision', decisions: ['D01', 'D02'], message: '추천 정책 결정 전 실행하지 않습니다.' },
      })),
    },
  },
  result: {
    ...choiceSnapshotFixture,
    view: {
      kind: 'result', context: { ...context, stateRevision: 1, snapshotId: 'fixture-result' },
      resultId: 'fixture-result', actionLabel: '안전 확인', outcome: 'certain',
      text: ['안전을 확인했습니다. 결과 화면 표시용 예시입니다.'],
      changes: [{ label: '안정 성향', text: '50 → 58', actualDelta: 8 }],
      trustReasons: [], consequences: [],
      status: { ...status, traits: [{ ...status.traits[0], value: 58 }, status.traits[1], status.traits[2]] },
      nextEventId: 'E02',
    },
  },
  segmentComplete: {
    ...choiceSnapshotFixture,
    view: {
      kind: 'segment-complete', title: '초반 체험 완료 · UI 표시 샘플',
      text: ['E04 뒤의 개발 구간 경계이며 실제 게임 결말이 아닙니다.'],
      status, completedEventIds: ['E01', 'E02', 'E03', 'E04'], nextEventId: 'E05', continuation: null,
    },
  },
  ending: {
    ...choiceSnapshotFixture,
    view: {
      kind: 'ending', runId: 'fixture-ending-run', resultId: 'fixture-ending-result',
      ending: 'escape', title: '탈출 · UI 표시 샘플', text: ['종료 화면 배치용 예시입니다.'],
      status: { ...status, stamina: 15 }, changes: [],
      legacySummary: ['실제 계승 데이터는 생성하지 않은 화면 예시입니다.'],
      newRun: { kind: 'available' },
    },
  },
} as const satisfies Readonly<Record<string, AppSnapshot>>
