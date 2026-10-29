import { resolveAnswers } from '../app/questionnaire'
import type { OpeningContentRevision, OpeningRun } from '../domain/opening'
import type { EngineResult } from '../domain/types'
import { acknowledgeOpeningResult, createOpeningRun, executeOpeningAction, getOpeningContext } from '../engine'
import type { RunOrigin } from '../storage/opening-save'

export function engineValue<T>(result: EngineResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
export function makeOrigin(seed = 1, risk: 'normal' | 'adventure' | 'stability' = 'normal'): RunOrigin {
  return { runId: 'hospital-test', name: '병원 생존자', seed, answers: Array.from({ length: 6 }, (_, i) => ({
    questionId: `Q0${i + 1}`, answerId: i < 2 && risk !== 'normal' ? risk === 'adventure' ? 'a' : 'b' : i % 2 === 0 ? 'a' : 'b',
  })) }
}
export function startOpening(origin: RunOrigin, contentRevision?: OpeningContentRevision): OpeningRun {
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error(answers.error.message)
  return engineValue(createOpeningRun({ ...origin, answers: answers.value, contentRevision }))
}
export function resolveOpening(run: OpeningRun, actionId: string, treat = false): OpeningRun {
  return engineValue(executeOpeningAction(run, getOpeningContext(run), { actionId, treat }))
}
export function advanceOpening(run: OpeningRun): OpeningRun {
  if (!run.result) throw new Error('결과 없음')
  return engineValue(acknowledgeOpeningResult(run, getOpeningContext(run), run.result.resultId))
}
export function chooseOpening(run: OpeningRun, actionId: string, treat = false): OpeningRun {
  const result = resolveOpening(run, actionId, treat)
  return result.phase === 'ending' ? result : advanceOpening(result)
}
