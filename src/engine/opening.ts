import type { CoreAction } from '../domain/actions'
import type { OpeningContentRevision, OpeningContext, OpeningEventId, OpeningHistoryEntry, OpeningLegacy, OpeningPreview, OpeningRun, OpeningSelection } from '../domain/opening'
import type { CoreState, EngineResult, ResolvedQuestionnaireAnswer } from '../domain/types'
import { isIntegerInRange, isRecord, validateCoreState } from '../domain/validation'
import { previewCoreAction, resolveCoreAction } from './actions'
import { createInitialCoreState } from './initial-state'
import { CURRENT_OPENING_CONTENT, getOpeningRules, LEGACY_OPENING_CONTENT, openingEventIds, openingGoalId } from './opening-content'
import type { OpeningChoice } from './opening-content'
import { getTriggeredExtreme } from './traits'
import { initializeRandom } from './random'
import { buildRecoveryAction } from './recovery'

function unavailable(message: string): EngineResult<never> {
  return { ok: false, error: { code: 'action-unavailable', message } }
}

/** Guards the owned in-memory transition state. This is not an untrusted save decoder. */
function validateRun(run: OpeningRun): EngineResult<CoreState> {
  const invalid = (): EngineResult<never> => ({ ok: false, error: { code: 'invalid-state', message: '초반 진행 상태가 올바르지 않습니다.' } })
  if (!isRecord(run) || typeof run.runId !== 'string' || run.runId.trim().length === 0
    || !isIntegerInRange(run.initialSeed, 0, 0xffffffff) || !isIntegerInRange(run.rngState, 1, 0xffffffff)
    || run.rulesVersion !== '1.2-stress-1' || ![LEGACY_OPENING_CONTENT, CURRENT_OPENING_CONTENT].includes(run.contentRevision)
    || !openingEventIds(run.contentRevision).includes(run.eventId) || !Array.isArray(run.history)
    || !isRecord(run.judgmentCounts)) return invalid()
  const ids = openingEventIds(run.contentRevision)
  const index = ids.indexOf(run.eventId)
  const resolved = run.phase === 'result' || run.phase === 'ending'
  const complete = run.phase === 'segment-complete'
  if (!resolved && !complete && run.phase !== 'choice') return invalid()
  if (run.history.length !== (complete ? ids.length : index + (resolved ? 1 : 0))
    || run.revision !== (complete ? ids.length * 2 : index * 2 + (resolved ? 1 : 0))
    || (complete && run.eventId !== ids.at(-1)) || run.nextEventId !== (complete ? ids.length === 4 ? 'E05' : 'E07' : null)) return invalid()
  const counts = { rescue: 0, self: 0 }
  for (const [historyIndex, entry] of run.history.entries()) {
    if (!isRecord(entry) || entry.eventId !== ids[historyIndex]
      || entry.resultId !== `${run.runId}:${entry.eventId}:result` || !isRecord(entry.selection)
      || !isRecord(entry.resolution) || entry.resolution.eventId !== entry.eventId
      || entry.resolution.actionId !== entry.selection.actionId || typeof entry.selection.treat !== 'boolean') return invalid()
    const judgment = entry.eventId === 'E02'
      ? entry.selection.actionId === 'E02.help' ? 'rescue' : entry.selection.actionId === 'E02.supplies' ? 'self' : undefined
      : null
    if (judgment === undefined || entry.judgment !== judgment) return invalid()
    if (judgment !== null) counts[judgment]++
  }
  if (run.judgmentCounts.rescue !== counts.rescue || run.judgmentCounts.self !== counts.self) return invalid()
  const last = run.history.at(-1)
  if (resolved ? !run.result || run.result !== last || (run.phase === 'ending') !== last?.resolution.fatal : run.result !== null) return invalid()
  const state = validateCoreState(run.core)
  if (!state.ok) return state
  if ((run.core.protagonist.injury === 3) !== (run.phase === 'ending')) return invalid()
  return state
}

function checkContext(run: OpeningRun, context: OpeningContext): EngineResult<CoreState> {
  const state = validateRun(run)
  if (!state.ok) return state
  if (!isRecord(context) || context.runId !== run.runId || context.eventId !== run.eventId || context.revision !== run.revision) {
    return { ok: false, error: { code: 'stale-context', message: '현재 회차·사건·진행 번호와 일치하지 않는 입력입니다.' } }
  }
  return state
}

export function getOpeningContext(run: OpeningRun): OpeningContext {
  return { runId: run.runId, eventId: run.eventId, revision: run.revision }
}

export function createOpeningRun(input: {
  readonly runId: string; readonly name: string; readonly answers: readonly ResolvedQuestionnaireAnswer[]; readonly seed: number
  readonly contentRevision?: OpeningContentRevision
}): EngineResult<OpeningRun> {
  if (!isRecord(input) || typeof input.runId !== 'string' || input.runId.trim().length === 0) {
    return { ok: false, error: { code: 'invalid-state', message: '앱에서 부여한 회차 ID가 필요합니다.' } }
  }
  if (input.contentRevision !== undefined && ![LEGACY_OPENING_CONTENT, CURRENT_OPENING_CONTENT].includes(input.contentRevision)) return { ok: false, error: { code: 'invalid-state', message: '지원하지 않는 콘텐츠 버전입니다.' } }
  const rules = getOpeningRules(input.contentRevision)
  if (!rules.ok) return rules
  const core = createInitialCoreState(input.name, input.answers)
  if (!core.ok) return core
  const rng = initializeRandom(input.seed)
  if (!rng.ok) return rng
  return { ok: true, value: {
    runId: input.runId, initialSeed: input.seed, rngState: rng.value,
    rulesVersion: rules.value.rulesVersion, contentRevision: rules.value.contentRevision,
    core: core.value, eventId: 'E01', phase: 'choice', revision: 0,
    history: [], judgmentCounts: { rescue: 0, self: 0 }, result: null, nextEventId: null,
  } }
}

/** Registered data only; callers cannot supply their own rewards or check definitions. */
export function buildOpeningAction(eventId: OpeningEventId, state: CoreState, selection: OpeningSelection, revision: OpeningContentRevision = CURRENT_OPENING_CONTENT): EngineResult<{
  readonly action: CoreAction; readonly judgment: 'rescue' | 'self' | null
}> {
  const valid = validateCoreState(state)
  if (!valid.ok) return valid
  if (!isRecord(selection) || typeof selection.actionId !== 'string' || typeof selection.treat !== 'boolean') {
    return { ok: false, error: { code: 'invalid-action', message: '행동 ID와 치료 확인 여부가 필요합니다.' } }
  }
  const rules = getOpeningRules(revision)
  if (!rules.ok) return rules
  const available = contextualChoices(rules.value.events.find(event => event.id === eventId)?.choices ?? [], eventId, valid.value)
  if (!available.ok) return available
  const choice = available.value.find(choice => choice.id === selection.actionId)
  if (!choice) return unavailable('현재 사건에 등록된 행동이 아닙니다.')
  if (choice.kind === 'recovery') {
    const action = buildRecoveryAction({ state: valid.value, phase: 'choice', eventId, choice: choice.choice, treat: selection.treat, companionTrust: null })
    return action.ok ? { ok: true, value: { action: action.value, judgment: null } } : action
  }
  if (selection.treat) return unavailable('치료는 회복 사건의 정비 확인에서만 가능합니다.')
  const variant = choice.variants.find(variant => variant.when === 'always'
    || variant.when === (valid.value.inventory.supply >= 1 ? 'supply-present' : 'supply-empty'))
  if (!variant) return unavailable('현재 자원에 대응하는 행동 정의가 없습니다.')
  return { ok: true, value: { action: variant.action, judgment: choice.judgment } }
}

function contextualChoices(choices: readonly OpeningChoice[], eventId: OpeningEventId, state: CoreState): EngineResult<readonly OpeningChoice[]> {
  if (eventId !== 'E05' && eventId !== 'E06') return { ok: true, value: choices }
  const triggered = getTriggeredExtreme(eventId, state.protagonist.traits, state.flags.access)
  return triggered.ok ? { ok: true, value: triggered.value ? choices.slice(2) : choices.slice(0, 2) } : triggered
}

export function previewOpeningAction(run: OpeningRun, context: OpeningContext, selection: OpeningSelection): EngineResult<OpeningPreview> {
  if (selection.executionActor === 'companion') return unavailable('이전 회차 규칙에는 동료 실행이 없습니다.')
  const state = checkContext(run, context)
  if (!state.ok) return state
  if (run.phase !== 'choice') return unavailable('선택 단계에서만 행동을 미리 볼 수 있습니다.')
  const registered = buildOpeningAction(run.eventId, state.value, selection, run.contentRevision)
  if (!registered.ok) return registered
  const preview = previewCoreAction({ state: state.value, action: registered.value.action, eventId: run.eventId, phase: 'choice', companionPresent: false, cooperating: false })
  return preview.ok ? { ok: true, value: { ...preview.value, goalId: openingGoalId(selection.actionId), context: getOpeningContext(run), selection: { ...selection }, ...registered.value } } : preview
}

export function listOpeningActions(run: OpeningRun): EngineResult<readonly OpeningPreview[]> {
  const state = validateRun(run)
  if (!state.ok) return state
  if (run.phase !== 'choice') return unavailable('선택 단계가 아닙니다.')
  const rules = getOpeningRules(run.contentRevision)
  if (!rules.ok) return rules
  const event = rules.value.events.find(event => event.id === run.eventId)
  if (!event) return unavailable('초반 구현 범위 밖의 사건입니다.')
  const previews: OpeningPreview[] = []
  const choices = contextualChoices(event.choices, run.eventId, state.value)
  if (!choices.ok) return choices
  for (const choice of choices.value) {
    const preview = previewOpeningAction(run, getOpeningContext(run), { actionId: choice.id, treat: false })
    if (!preview.ok) return preview
    previews.push(preview.value)
  }
  return { ok: true, value: previews }
}

/** Returns a candidate transition. The future app must persist before committing it. */
export function executeOpeningAction(run: OpeningRun, context: OpeningContext, selection: OpeningSelection): EngineResult<OpeningRun> {
  const preview = previewOpeningAction(run, context, selection)
  if (!preview.ok) return preview
  const resolution = resolveCoreAction({ state: run.core, action: preview.value.action, eventId: run.eventId, phase: 'choice', companionPresent: false, cooperating: false }, run.rngState)
  if (!resolution.ok) return resolution
  const judgment = preview.value.judgment
  const entry: OpeningHistoryEntry = {
    resultId: `${run.runId}:${run.eventId}:result`, eventId: run.eventId,
    selection: { actionId: selection.actionId, treat: selection.treat }, judgment, resolution: resolution.value,
  }
  return { ok: true, value: {
    ...run, core: resolution.value.state, rngState: resolution.value.check.rngState,
    phase: resolution.value.phase, revision: run.revision + 1, result: entry,
    history: [...run.history, entry],
    judgmentCounts: { rescue: run.judgmentCounts.rescue + (judgment === 'rescue' ? 1 : 0), self: run.judgmentCounts.self + (judgment === 'self' ? 1 : 0) },
  } }
}

export function acknowledgeOpeningResult(run: OpeningRun, context: OpeningContext, resultId: string): EngineResult<OpeningRun> {
  const state = checkContext(run, context)
  if (!state.ok) return state
  if (run.phase !== 'result' || run.result?.resultId !== resultId) return unavailable('확인할 현재 결과가 아닙니다.')
  const ids = openingEventIds(run.contentRevision)
  if (run.eventId === ids.at(-1)) {
    return { ok: true, value: { ...run, phase: 'segment-complete', revision: run.revision + 1, result: null, nextEventId: ids.length === 4 ? 'E05' : 'E07' } }
  }
  const next = ids[ids.indexOf(run.eventId) + 1]
  return { ok: true, value: { ...run, eventId: next, phase: 'choice', revision: run.revision + 1, result: null } }
}

/** Explicit forward extension at the old development boundary; no replayed/replaced outcomes. */
export function continueOpeningSegment(run: OpeningRun, context: OpeningContext): EngineResult<OpeningRun> {
  const valid = checkContext(run, context)
  if (!valid.ok) return valid
  if (run.contentRevision !== LEGACY_OPENING_CONTENT || run.phase !== 'segment-complete') return unavailable('이 구간에서 이어갈 수 없습니다.')
  return { ok: true, value: { ...run, contentRevision: CURRENT_OPENING_CONTENT, eventId: 'E05', phase: 'choice', nextEventId: null } }
}

export function getOpeningLegacy(run: OpeningRun): OpeningLegacy | null {
  if (run.phase !== 'ending') return null
  const valid = validateRun(run)
  if (!valid.ok) throw new Error(valid.error.message)
  return {
    legacyId: `${run.runId}:legacy`, sourceRunId: run.runId, name: run.core.protagonist.name,
    traits: { ...run.core.protagonist.traits }, rescueDecision: run.core.flags.rescueDecision,
    judgmentCounts: { ...run.judgmentCounts },
    representativeActions: { E02: run.history.find(entry => entry.eventId === 'E02')?.selection.actionId ?? null, E07: null, E10: null },
    ending: 'escape-failed', rulesVersion: run.rulesVersion, contentRevision: run.contentRevision,
  }
}
