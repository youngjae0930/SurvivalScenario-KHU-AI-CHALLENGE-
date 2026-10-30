import type { ActionPreviewViewModel, ChangeViewModel, ChoiceContext, GameViewModel, StatusViewModel } from '../../contracts'
import { actionText, eventText } from '../../content/texts/opening'
import type { NumericStat, StateChange, StateEffect } from '../../domain/actions'
import type { OpeningPreview, OpeningRun } from '../../domain/opening'
import type { CoreState, TraitAxis } from '../../domain/types'
import { classifyTrait, getOpeningLegacy, getTriggeredExtreme, listOpeningActions } from '../../engine'
import { LEGACY_OPENING_CONTENT, openingEventIds, openingGoalId } from '../../engine/opening-content'
import { originalTraitBounds } from '../../engine/traits'

const statNames: Record<NumericStat, string> = { stress: '스트레스', stamina: '스태미나', injury: '부상', supply: '물자', medkit: '치료 도구', risk: '모험 ↔ 안정', cognition: '분석 ↔ 직관', affect: '이성 ↔ 감정' }
const flagNames = { access: '내부 접근', data: '자료 확보', helpEstablished: '도움 연결', routeKnown: '우회 경로', weapon: '무기', rescueDecision: '편의점 판단' }
const poles: Record<TraitAxis, readonly [string, string]> = { risk: ['모험', '안정'], cognition: ['분석', '직관'], affect: ['이성', '감정'] }
const signed = (number: number) => `${number > 0 ? '+' : ''}${number}`

export function toContext(run: OpeningRun): ChoiceContext {
  return { runId: run.runId, eventId: run.eventId, stateRevision: run.revision, snapshotId: `${run.runId}:${run.contentRevision}:${run.revision}` }
}

export function toStatus(state: CoreState, bounds = originalTraitBounds): StatusViewModel {
  const actor = state.protagonist
  return {
    name: actor.name, stress: actor.stress, stamina: actor.stamina, injury: actor.injury,
    ...state.inventory,
    traits: (['risk', 'cognition', 'affect'] as const).map(axis => {
      const band = classifyTrait(actor.traits[axis], bounds)
      if (!band.ok) throw new Error(band.error.message)
      return { axis, value: actor.traits[axis], leftLabel: poles[axis][0], rightLabel: poles[axis][1], band: band.value }
    }),
  }
}

export function toChange(change: StateChange): ChangeViewModel {
  if (change.kind === 'number') return { label: statNames[change.field], text: `${change.before} → ${change.after} (${signed(change.delta)})`, actualDelta: change.delta,
    ...(['risk', 'cognition', 'affect'].includes(change.field) ? { traitAxis: change.field as TraitAxis } : {}) }
  const display = (value: typeof change.after) => value === 'rescue' ? '구조' : value === 'self' ? '자기 보존' : value === true ? '확보' : value === false ? '없음' : '미발생'
  return { label: flagNames[change.field], text: `${display(change.before)} → ${display(change.after)}`, actualDelta: null }
}

export function describeEffect(effect: StateEffect): string {
  switch (effect.kind) {
    case 'add': return `${statNames[effect.stat]} ${signed(effect.amount)}${effect.stat === 'stress' ? effect.amount < 0 ? ' (최소 0)' : ' (최대 100)' : effect.amount > 0 && effect.stat !== 'injury' ? ' (상한 적용)' : ''}`
    case 'set-weapon': return effect.value ? '무기 확보' : '무기 소모'
    case 'set-flag': return `${effect.flag === 'data' ? '탈출 자료' : flagNames[effect.flag]} ${effect.value ? '확보' : '해제'}`
    case 'set-rescue-decision': return `판단 기록: ${effect.value === 'rescue' ? '구조' : effect.value === 'self' ? '자기 보존' : '미발생'}`
    case 'remove-all': return `${effect.resource === 'supply' ? '물자' : '치료 도구'} 전량 소모`
  }
}

export function toPreview(run: OpeningRun, preview: OpeningPreview, previewToken: string): ActionPreviewViewModel {
  const copy = actionText[preview.action.id]
  if (!copy) throw new Error('선택 문구가 없습니다.')
  return toActionPreview(run.core, toContext(run), preview, copy, previewToken)
}

export function toActionPreview(state: CoreState, context: ChoiceContext,
  preview: Pick<OpeningPreview, 'action' | 'selection' | 'goalId' | 'allowed' | 'reasons' | 'check'>,
  copy: { label: string; intention: string; target: string }, previewToken: string): ActionPreviewViewModel {
  const action = preview.action
  const costs = Object.entries(action.costs).filter(([, amount]) => amount > 0).map(([stat, amount]) => `${statNames[stat as 'stamina' | 'supply' | 'medkit']} ${amount}`)
  const traits = (['risk', 'cognition', 'affect'] as const).filter(axis => action.traitDelta[axis] !== 0).map(axis => `${poles[axis][action.traitDelta[axis] > 0 ? 1 : 0]} 쪽으로 ${Math.abs(action.traitDelta[axis])}`)
  const check = preview.check
  return {
    previewToken, context, actionId: action.id, treatment: preview.selection.treat ? 'medkit' : 'none', goalId: preview.goalId,
    label: copy.label, intention: copy.intention, target: copy.target,
    availability: preview.allowed ? { kind: 'available' } : { kind: 'locked', reasons: preview.reasons },
    requirements: [...(preview.selection.treat ? ['부상 1 이상 · 치료 도구 1 이상'] : []),
      ...(['stamina', 'supply', 'medkit'] as const).flatMap(stat => action.requires[stat] ? [`${statNames[stat]} ${action.requires[stat]} 이상`] : []),
      ...(action.requires.injuryMax !== undefined ? [`부상 ${action.requires.injuryMax} 이하`] : []),
      ...(action.requires.weapon !== undefined ? [`무기 ${action.requires.weapon ? '필요' : '미보유'}`] : []),
      ...(action.requires.companion !== undefined ? [action.requires.companion ? '동료 동행 필요' : '단독 진행'] : []),
      ...Object.entries(action.requires.flags ?? {}).map(([flag, value]) => `${flagNames[flag as keyof typeof action.requires.flags]} ${value ? '확보' : '없음'}`),
    ],
    costs: costs.length ? costs : ['소모 없음'], traitChanges: traits.length ? traits : ['변화 없음'],
    outcomes: { success: action.successEffects.length ? action.successEffects.map(describeEffect) : ['추가 수치 변화 없음'], failure: action.failureEffects.map(describeEffect) },
    risk: check.kind === 'certain' ? { kind: 'certain', explanation: '확정 행동 · 성공/실패 추첨 없음' } : {
      kind: 'probability', percent: check.probability.percent,
      breakdown: [
        `기본 ${check.probability.base}%`, `성향 ${signed(check.probability.trait)}%p`,
        `상태 ${signed(check.probability.condition)}%p`, `장비 ${signed(check.probability.equipment)}%p`,
        `협력 ${signed(check.probability.support)}%p`, `사건 ${signed(check.probability.flag)}%p`,
      ],
    },
    participation: { kind: 'absent' }, warnings: ['성향 변화와 비용은 성패에 관계없이 적용됩니다.', '회복·획득은 보유 상한이 적용됩니다. 실제 변화는 결과에서 확인할 수 있습니다.', ...(state.protagonist.injury === 2 && action.failureEffects.some(effect => effect.kind === 'add' && effect.stat === 'injury' && effect.amount > 0) ? ['실패하면 세 번째 부상으로 여정이 종료됩니다.'] : [])],
  }
}

export function toGameView(run: OpeningRun): GameViewModel {
  const status = toStatus(run.core)
  if (run.phase === 'segment-complete') {
    const old = run.contentRevision === LEGACY_OPENING_CONTENT
    return {
      kind: 'segment-complete', title: old ? '병원으로 이어지는 길' : '병원을 뒤로하고', status,
      text: old ? ['이전 버전의 E01~E04 체험 기록을 불러왔습니다. 이름·선택·상태·판정 결과는 그대로입니다.', '이제 병원 진입과 이탈을 이어서 플레이할 수 있습니다. 아래 버튼으로 다음 구간을 시작합니다.']
        : ['병원 구역을 벗어났다. 들어갈 때 내린 판단은 앞으로 접근할 수 있는 곳을 바꾸었다.', '현재 구현 구간 E01~E06을 마쳤습니다. 다음은 E07 자료 조사이며 아직 연결되지 않았습니다. 이 화면은 결말이 아니며 계승을 생성하지 않습니다.'],
      completedEventIds: openingEventIds(run.contentRevision), nextEventId: old ? 'E05' : 'E07',
      continuation: old ? { context: toContext(run), label: 'E05 병원으로 이동' } : null,
    }
  }
  const legacy = getOpeningLegacy(run)
  if (legacy && run.result) return {
    kind: 'ending', runId: run.runId, resultId: run.result.resultId, ending: 'escape-failed', title: '도시를 벗어나지 못했다', status,
    text: [...actionText[run.result.selection.actionId].failure, '상처가 겹쳐 더는 이동을 이어갈 수 없었다. 이번 여정은 여기서 끝난다.'],
    changes: run.result.resolution.changes.map(toChange),
    legacySummary: [`${legacy.name}의 최종 성향과 실제 선택 기록을 남겼습니다.`, `편의점 선택: ${legacy.representativeActions.E02 ? actionText[legacy.representativeActions.E02].label : '미도달'}`, 'E07·E10은 도달하지 않아 기록이 없습니다. 다음 회차 동료 연결은 후속 개발입니다.'],
    newRun: { kind: 'locked', reasons: ['현재 버전은 결말 기록을 유지합니다. 새 회차 시작은 아직 제공하지 않습니다.'] },
  }
  if (run.phase === 'result' && run.result) {
    const entry = run.result
    const copy = actionText[entry.selection.actionId]
    if (!copy) throw new Error('결과 문구가 없습니다.')
    return {
      kind: 'result', context: toContext(run), resultId: entry.resultId,
      actionLabel: copy.label, outcome: entry.resolution.check.outcome,
      text: [...(entry.resolution.check.outcome === 'failure' ? copy.failure : copy.success), ...(entry.selection.treat ? ['치료 도구를 사용해 상처를 처치했다.'] : [])],
      changes: entry.resolution.changes.map(toChange), trustReasons: [],
      consequences: [...(entry.selection.actionId === 'E02.help' ? ['도움 연결이 형성되었습니다. E10의 연락망 확인에 반영됩니다.'] : []), ...(run.eventId === 'E05' ? [run.core.flags.access ? '병원 내부 접근을 확보했습니다. E07 내부 조사에 쓰일 조건입니다. E07 플레이는 아직 연결되지 않았습니다.' : '병원 내부 접근을 확보하지 못했습니다. E07은 외곽 조사 맥락을 사용할 예정이며 아직 연결되지 않았습니다.'] : []), ...extremeChanges(entry.resolution.changes)],
      status, nextEventId: ({ E01: 'E02', E02: 'E03', E03: 'E04', E04: 'E05', E05: 'E06', E06: 'E07' } as const)[run.eventId],
    }
  }
  if (run.phase !== 'choice') throw new Error('지원되지 않는 초반 진행 단계입니다.')
  const choices = listOpeningActions(run)
  if (!choices.ok) throw new Error(choices.error.message)
  const copy = eventText[run.eventId]
  const previous = run.history.at(-1)
  const triggered = getTriggeredExtreme(run.eventId, run.core.protagonist.traits, run.core.flags.access)
  const extreme = triggered.ok && triggered.value !== null
  const story = run.eventId === 'E05' && extreme ? eventText.E05.extremeStory
    : run.eventId === 'E06' ? extreme ? eventText.E06.extremeStory : !run.core.flags.access ? eventText.E06.exteriorStory : copy.story
      : copy.story
  return {
    notices: extreme ? [run.eventId === 'E05' ? '모험 극단: 우회보다 구역 돌입에 집중합니다. 두 돌입 방식 중에서 선택합니다.' : '안정 극단: 물자 회수보다 철수에 집중합니다. 두 철수 방식 중에서 선택합니다.'] : [],
    kind: 'choice', context: toContext(run), title: copy.title, status,
    story: story.map((text, index) => ({ key: { textId: `${run.eventId}.intro.${index}`, contentRevision: run.eventId === 'E05' || run.eventId === 'E06' ? 'hospital-text-1' : 'opening-text-1', contextVariantId: extreme ? 'solo-extreme' : run.eventId === 'E06' ? run.core.flags.access ? 'solo-interior' : 'solo-exterior' : 'solo' }, text, collapsible: false, initiallyCollapsed: false })),
    companion: { kind: 'absent' },
    actions: choices.value.map(preview => {
      const text = actionText[preview.action.id]
      if (!text) throw new Error('선택 문구가 없습니다.')
      return { actionId: preview.action.id, goalId: openingGoalId(preview.action.id), label: text.label, intention: text.intention, availability: preview.allowed ? { kind: 'available' as const } : { kind: 'locked' as const, reasons: preview.reasons }, recommended: false, requiresCompanion: false }
    }),
    treatment: run.eventId === 'E04' && status.injury > 0 && status.medkit > 0 ? { kind: 'available' } : { kind: 'locked', reasons: [run.eventId !== 'E04' ? '회복 사건의 정비에서만 치료할 수 있습니다.' : status.injury === 0 ? '치료할 부상이 없습니다.' : '치료 도구가 없습니다.'] },
    recentResult: previous ? { label: actionText[previous.selection.actionId].label, text: previous.resolution.changes.filter(change => !toChange(change).traitAxis).map(change => `${toChange(change).label} ${toChange(change).text}`) } : null,
  }
}

export function extremeChanges(changes: readonly StateChange[]): string[] {
  const messages: string[] = []
  for (const change of changes) {
    if (change.kind !== 'number' || !['risk', 'cognition', 'affect'].includes(change.field)) continue
    const before = classifyTrait(change.before), after = classifyTrait(change.after)
    if (!before.ok || !after.ok || before.value === after.value) continue
    const name = statNames[change.field]
    if (before.value.startsWith('extreme')) messages.push(`${name} 극단 범위를 벗어났습니다.`)
    if (after.value.startsWith('extreme')) messages.push(`${name} 극단 범위에 진입했습니다. 해당 성향이 지정된 사건에서 선택 목표가 달라집니다.`)
  }
  return messages
}
