import { UI_CONTRACT_VERSION } from '../contracts'
import type { ActionPreviewViewModel, AppSnapshot, ChoiceContext, ContractError, ContractResult, GameClient, GameCommand, GameViewModel, PreviewActionRequest, StartViewModel } from '../contracts'
import { sessionNotice } from '../content/texts/opening'
import type { OpeningRun, OpeningSelection } from '../domain/opening'
import { isRecord } from '../domain/validation'
import { acknowledgeOpeningResult, continueOpeningSegment, createOpeningRun, executeOpeningAction, getOpeningContext, previewOpeningAction } from '../engine'
import { readQuestions, resolveAnswers } from './questionnaire'
import { toContext, toGameView, toPreview } from './view-models/opening'
import type { SaveStore } from '../storage/browser-store'
import { decodeOpeningSave, encodeOpeningSave, SaveError } from '../storage/opening-save'
import type { RunOrigin } from '../storage/opening-save'
import type { EngineResult, ResolvedQuestionnaireAnswer } from '../domain/types'

export interface RunDriver<R> {
  readonly introduction?: readonly string[]
  create(input: { runId: string; name: string; seed: number; answers: readonly ResolvedQuestionnaireAnswer[] }): EngineResult<R>
  next?(previous: R, input: Parameters<RunDriver<R>['create']>[0]): EngineResult<R>
  decode(raw: string): { origin: RunOrigin; run: R }
  encode(origin: RunOrigin, run: R): string
  view(run: R): GameViewModel
  context(run: R): ChoiceContext
  preview(run: R, selection: OpeningSelection, token: string): EngineResult<ActionPreviewViewModel>
  execute(run: R, selection: OpeningSelection): EngineResult<R>
  acknowledge(run: R, resultId: string): EngineResult<R>
  continue(run: R): EngineResult<R>
  presentation?(run: R | null): AppSnapshot['presentation']
}
export interface ClientOptions { makeSeed?: () => number; makeRunId?: () => string; store?: SaveStore }

const openingDriver: RunDriver<OpeningRun> = {
  create: createOpeningRun, decode: raw => decodeOpeningSave(raw, resolveAnswers), encode: encodeOpeningSave,
  view: toGameView, context: toContext,
  preview(run, selection, token) {
    if (selection.executionActor === 'companion') return { ok: false, error: { code: 'action-unavailable', message: '이전 회차 규칙에는 동료 실행이 없습니다.' } }
    const preview = previewOpeningAction(run, getOpeningContext(run), selection)
    return preview.ok ? { ok: true, value: toPreview(run, preview.value, token) } : preview
  },
  execute: (run, selection) => executeOpeningAction(run, getOpeningContext(run), selection),
  acknowledge: (run, resultId) => acknowledgeOpeningResult(run, getOpeningContext(run), resultId),
  continue: run => continueOpeningSegment(run, getOpeningContext(run)),
}

function fail(code: ContractError['code'], message: string): ContractResult<never> {
  return { ok: false, error: { code, message, decisions: [] } }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(freeze)
  }
  return value
}
function sameContext(left: unknown, right: ChoiceContext): boolean {
  return isRecord(left) && left.runId === right.runId && left.eventId === right.eventId
    && left.stateRevision === right.stateRevision && left.snapshotId === right.snapshotId
}

/** Real opening gameplay. An injected store enables durable commits; no server/Legacy calls. */
export function createGameClient(options: ClientOptions = {}): GameClient { return createDriverClient(openingDriver, options) }

/** Shared transaction/token/lock pipeline for legacy and data-driven runs. */
export function createDriverClient<R extends { readonly runId: string; readonly initialSeed: number; readonly phase: string; readonly core: { readonly protagonist: { readonly name: string } } }>(driver: RunDriver<R>, options: ClientOptions = {}): GameClient {
  let run: R | null = null
  let preparingNext = false
  let origin: RunOrigin | null = null
  let savedRaw: string | null = null
  let resumable: { origin: RunOrigin; run: R } | null = null
  let pendingSave: { next: R; origin: RunOrigin; raw: string; operationId: string } | null = null
  const store = options.store
  let busy = false
  let counter = 0
  let issued: { token: string; context: ChoiceContext; selection: OpeningSelection } | null = null
  const listeners = new Set<() => void>()
  const wrap = (view: GameViewModel, next: R | null = null): AppSnapshot => freeze({
    ...(driver.presentation ? { presentation: driver.presentation(next) } : {}),
    contractVersion: UI_CONTRACT_VERSION, source: 'core',
    persistence: store ? { kind: 'durable', message: '이 브라우저에 자동 저장합니다. 새로 열면 이어할 수 있습니다. 브라우저 데이터 삭제 시 저장도 사라집니다.' } : { kind: 'session', message: sessionNotice }, view,
    commit: { kind: 'ready' }, profile: { collapseReadTextEnabled: false },
    pendingDecisions: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D08', 'D09'],
  })
  let snapshot: AppSnapshot
  try {
    const start: StartViewModel = {
      kind: 'start', introduction: driver.introduction ?? ['봉쇄된 도시. 끊긴 방송. 도시 외곽으로 이어지는 길.', '첫 이동은 혼자 시작합니다. 여섯 가지 응답으로 출발 성향을 정하고, 이후의 선택으로 변화시킵니다.'],
      questions: readQuestions(), previousAnswers: [], canResume: false, newRun: { kind: 'available' },
    }
    if (store) {
      savedRaw = store.read()
      if (savedRaw !== null) resumable = driver.decode(savedRaw)
    }
    snapshot = wrap(resumable ? { ...start, introduction: ['저장된 여정이 있습니다. 마지막으로 확정한 장면에서 이야기를 이어갑니다.'], canResume: true, previousAnswers: resumable.origin.answers, newRun: { kind: 'locked', reasons: ['저장된 회차가 있습니다. 이어하기로 확인해 주세요.'] } } : start)
  } catch (error) {
    const message = error instanceof SaveError ? error.message : '설문 또는 저장 데이터를 불러오지 못했습니다. 원본을 보존하며 진행을 중단합니다. 브라우저 저장 접근 권한도 확인해 주세요.'
    snapshot = freeze({ ...wrap({ kind: 'start', introduction: [], questions: [], previousAnswers: [], canResume: false, newRun: { kind: 'locked', reasons: [message] } }), commit: { kind: 'blocked', message } })
  }
  function notify() {
    for (const listener of listeners) { try { listener() } catch { /* isolate external UI observers */ } }
  }
  function publish(next: R) {
    const nextSnapshot = wrap(driver.view(next), next)
    run = next
    preparingNext = false
    snapshot = nextSnapshot
    issued = null
    // Subscriber failures must not turn an already committed transition into a reported failure.
    notify()
  }
  function setCommit(commit: AppSnapshot['commit']) { snapshot = freeze({ ...snapshot, commit }); notify() }
  async function persistPending(): Promise<ContractResult<null>> {
    if (!store || !pendingSave) return fail('invalid-phase', '재시도할 저장이 없습니다.')
    const candidate = pendingSave
    setCommit({ kind: 'saving', operationId: candidate.operationId })
    try {
      if (!await store.acquire()) throw new SaveError('save-conflict', '다른 탭에서 플레이 중입니다. 그 탭을 닫은 뒤 이 탭을 새로고침해 주세요.')
      await store.compareAndSet(savedRaw, candidate.raw)
      savedRaw = candidate.raw
      origin = candidate.origin
      pendingSave = null
      resumable = null
      publish(candidate.next)
      return { ok: true, value: null }
    } catch (error) {
      if (error instanceof SaveError && error.code === 'save-conflict') {
        pendingSave = null
        setCommit({ kind: 'blocked', message: error.message })
        return fail('save-conflict', error.message)
      }
      const message = error instanceof SaveError ? error.message : '저장하지 못했습니다. 창을 닫지 말고 저장을 다시 시도해 주세요. 선택과 난수는 다시 처리하지 않습니다.'
      setCommit({ kind: 'save-failed', operationId: candidate.operationId, message })
      return fail('save-failed', message)
    }
  }
  async function commit(next: R, nextOrigin: RunOrigin | null = origin): Promise<ContractResult<null>> {
    // Prepare presentation before writing: no content failure after a successful write.
    driver.view(next)
    if (!store) { origin = nextOrigin; publish(next); return { ok: true, value: null } }
    if (!nextOrigin) return fail('internal-error', '회차 시작 정보가 없습니다.')
    pendingSave = { next, origin: nextOrigin, raw: driver.encode(nextOrigin, next), operationId: `${next.runId}:save:${++counter}` }
    issued = null
    return persistPending()
  }
  function engineError(error: { code: string; message: string }): ContractResult<never> {
    return fail(error.code === 'stale-context' ? 'stale-context' : error.code === 'action-unavailable' ? 'action-unavailable' : 'content-invalid', error.message)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async previewAction(request: PreviewActionRequest): Promise<ContractResult<ActionPreviewViewModel>> {
      if (busy || snapshot.commit.kind !== 'ready') return fail('busy', '진행 중인 처리를 기다려 주세요.')
      if (!run || run.phase !== 'choice') return fail('invalid-phase', '현재는 행동을 선택할 수 없습니다.')
      if (!isRecord(request) || !sameContext(request.context, driver.context(run))) return fail('stale-context', '현재 장면을 다시 확인해 주세요.')
      if (typeof request.actionId !== 'string' || !['none', 'medkit'].includes(request.treatment)
        || (request.executionActor !== undefined && !['protagonist', 'companion'].includes(request.executionActor))) return fail('invalid-input', '선택 입력이 올바르지 않습니다.')
      try {
        const selection: OpeningSelection = { actionId: request.actionId, treat: request.treatment === 'medkit',
          ...(request.executionActor === 'companion' ? { executionActor: 'companion' } : {}) }
        const token = `${run.runId}:preview:${++counter}`
        const preview = driver.preview(run, selection, token)
        if (!preview.ok) return engineError(preview.error)
        const view = freeze(preview.value)
        issued = { token, context: driver.context(run), selection }
        return { ok: true, value: view }
      } catch { return fail('content-invalid', '선택 정보를 불러오지 못했습니다.') }
    },
    async dispatch(command: GameCommand): Promise<ContractResult<null>> {
      if (!isRecord(command)) return fail('invalid-input', '명령 형식이 올바르지 않습니다.')
      const retry = command.type === 'retry-save' && snapshot.commit.kind === 'save-failed'
      if (busy || (snapshot.commit.kind !== 'ready' && !retry)) return fail('busy', '진행 중인 처리를 기다려 주세요.')
      busy = true
      try {
        // Lock synchronously before yielding so rapid calls cannot both commit the same input.
        await Promise.resolve()
        switch (command.type) {
          case 'retry-save': {
            if (!pendingSave || command.operationId !== pendingSave.operationId) return fail('stale-context', '현재 재시도할 저장 요청이 아닙니다.')
            return await persistPending()
          }
          case 'resume': {
            if (!store || run || !resumable) return fail('invalid-phase', '이어할 회차가 없습니다.')
            if (!await store.acquire()) {
              const message = '다른 탭에서 플레이 중입니다. 그 탭을 닫은 뒤 이 탭을 새로고침해 주세요.'
              setCommit({ kind: 'blocked', message }); return fail('save-conflict', message)
            }
            if (store.read() !== savedRaw) {
              const message = '저장 내용이 변경되었습니다. 새로고침 후 최신 회차를 이어해 주세요.'
              setCommit({ kind: 'blocked', message }); return fail('save-conflict', message)
            }
            origin = resumable.origin
            publish(resumable.run)
            resumable = null
            return { ok: true, value: null }
          }
          case 'prepare-next-run': {
            if (!run || preparingNext || !driver.next) return fail('invalid-phase', '다음 회차를 준비할 수 없습니다.')
            const ending = driver.view(run)
            if (ending.kind !== 'ending' || ending.newRun.kind !== 'available') return fail('invalid-phase', '결말을 확인한 뒤 다음 회차를 시작할 수 있습니다.')
            if (command.sourceRunId !== ending.runId || command.sourceResultId !== ending.resultId) return fail('stale-context', '현재 결말에서 다시 시작해 주세요.')
            const start: StartViewModel = {
              kind: 'start', questions: readQuestions(), previousAnswers: [], canResume: false, newRun: { kind: 'available' },
              introduction: ['새 주인공의 이름과 여섯 응답을 정해 주세요. 직전 인물의 최종 성향과 판단 기록은 새로운 동료에게 이어집니다.',
                '출발을 확정하기 전까지 이전 결말은 유지됩니다. 다음 동료는 이전 인물의 생존이나 죽음을 기억하는 인물이 아닙니다.'],
              succession: { sourceRunId: ending.runId, sourceResultId: ending.resultId, endingTitle: ending.title, summary: ending.legacySummary },
            }
            preparingNext = true
            issued = null
            snapshot = wrap(start, run)
            notify()
            return { ok: true, value: null }
          }
          case 'cancel-next-run': {
            if (!preparingNext || !run) return fail('invalid-phase', '준비 중인 다음 회차가 없습니다.')
            publish(run)
            return { ok: true, value: null }
          }
          case 'start-run':
          case 'start-next-run': {
            const successor = command.type === 'start-next-run'
            if (successor) {
              if (!preparingNext || !run || !driver.next) return fail('invalid-phase', '결말에서 다음 회차 설문을 먼저 열어 주세요.')
              const ending = driver.view(run)
              if (ending.kind !== 'ending' || ending.newRun.kind !== 'available' || command.sourceRunId !== ending.runId || command.sourceResultId !== ending.resultId) return fail('stale-context', '계승할 결말이 변경되었습니다.')
            } else if (run || savedRaw !== null) return fail('invalid-phase', '이미 시작한 회차가 있습니다. 진행 중인 회차를 덮어쓰지 않습니다.')
            if (typeof command.name !== 'string' || command.name.trim().length === 0 || command.name.trim().length > 40) return fail('invalid-input', '이름을 1~40자로 입력해 주세요.')
            const answers = resolveAnswers(command.answers)
            if (!answers.ok) return answers
            const nextInput = {
              runId: (options.makeRunId ?? (() => crypto.randomUUID()))(), name: command.name.trim(), answers: answers.value,
              seed: (options.makeSeed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]))(),
            }
            const created = successor ? driver.next!(run!, nextInput) : driver.create(nextInput)
            if (!created.ok) return engineError(created.error)
            return await commit(created.value, { runId: created.value.runId, name: created.value.core.protagonist.name, seed: created.value.initialSeed, answers: command.answers.map(answer => ({ questionId: answer.questionId, answerId: answer.answerId })) })
          }
          case 'execute-action': {
            if (!run || run.phase !== 'choice') return fail('invalid-phase', '현재는 행동을 실행할 수 없습니다.')
            if (!sameContext(command.context, driver.context(run)) || !issued || command.previewToken !== issued.token || !sameContext(command.context, issued.context)) return fail('stale-context', '미리보기가 만료되었습니다. 선택을 다시 확인해 주세요.')
            const resolved = driver.execute(run, issued.selection)
            if (!resolved.ok) return engineError(resolved.error)
            return await commit(resolved.value)
          }
          case 'continue-segment': {
            if (!run || run.phase !== 'segment-complete') return fail('invalid-phase', '이어갈 이전 체험 구간이 없습니다.')
            if (!sameContext(command.context, driver.context(run))) return fail('stale-context', '현재 저장된 구간을 다시 확인해 주세요.')
            const next = driver.continue(run)
            if (!next.ok) return engineError(next.error)
            return await commit(next.value)
          }
          case 'acknowledge-result': {
            if (!run || run.phase !== 'result') return fail('invalid-phase', '현재 확인할 결과가 없습니다.')
            if (!sameContext(command.context, driver.context(run))) return fail('stale-context', '현재 결과를 다시 확인해 주세요.')
            const next = driver.acknowledge(run, command.resultId)
            if (!next.ok) return engineError(next.error)
            return await commit(next.value)
          }
          default: return fail('invalid-phase', '현재 체험 버전에는 읽기 설정 기능이 없습니다.')
        }
      } catch { return fail('internal-error', '진행을 처리하지 못했습니다. 현재 장면에서 다시 시도해 주세요.') }
      finally { busy = false }
    },
  }
}
