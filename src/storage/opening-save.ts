import type { OpeningRun } from '../domain/opening'
import type { ResolvedQuestionnaireAnswer } from '../domain/types'
import { isIntegerInRange, isRecord } from '../domain/validation'
import { acknowledgeOpeningResult, createOpeningRun, executeOpeningAction, getOpeningContext, getOpeningLegacy } from '../engine'
import { CURRENT_OPENING_CONTENT, LEGACY_OPENING_CONTENT } from '../engine/opening-content'
import { RANDOM_ALGORITHM } from '../engine/random'

export interface SavedAnswer { readonly questionId: string; readonly answerId: string }
export interface RunOrigin {
  readonly runId: string
  readonly name: string
  readonly seed: number
  readonly answers: readonly SavedAnswer[]
}
export type AnswerResolver = (answers: readonly SavedAnswer[]) =>
  | { readonly ok: true; readonly value: readonly ResolvedQuestionnaireAnswer[] }
  | { readonly ok: false; readonly error: { readonly message: string } }

export class SaveError extends Error {
  readonly code: 'save-failed' | 'save-conflict' | 'save-incompatible'
  constructor(code: SaveError['code'], message: string) { super(message); this.code = code }
}

/** Versioned solo segment. Schema5 includes an early ending and its Legacy atomically. */
export function encodeOpeningSave(origin: RunOrigin, run: OpeningRun): string {
  const legacyFormat = run.contentRevision === LEGACY_OPENING_CONTENT
  return JSON.stringify({
    schemaVersion: legacyFormat ? 4 : 5, kind: legacyFormat ? 'opening-solo' : 'hospital-solo', policy: 'single-slot-v1',
    rulesVersion: run.rulesVersion, contentRevision: run.contentRevision, randomAlgorithm: RANDOM_ALGORITHM,
    origin, checkpoint: run, ...(legacyFormat ? {} : { legacy: getOpeningLegacy(run) }),
  })
}

function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, i) => equalJson(value, right[i]))
  if (!isRecord(left) || !isRecord(right) || Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
}

/** Replay verifies state, RNG position, every result and revision; returns owned engine objects. */
export function decodeOpeningSave(raw: string, resolveAnswers: AnswerResolver): { origin: RunOrigin; run: OpeningRun } {
  const corrupt = () => new SaveError('save-incompatible', '저장 데이터가 손상되었거나 진행 기록이 일치하지 않습니다. 원본을 보존하며 새 회차로 덮어쓰지 않습니다.')
  let data: unknown
  try { if (raw.length > 100_000) throw corrupt(); data = JSON.parse(raw) } catch { throw corrupt() }
  if (!isRecord(data)) throw corrupt()
  const oldFormat = data.schemaVersion === 4 && data.kind === 'opening-solo' && data.contentRevision === LEGACY_OPENING_CONTENT
  const newFormat = data.schemaVersion === 5 && data.kind === 'hospital-solo' && data.contentRevision === CURRENT_OPENING_CONTENT
  if ((!oldFormat && !newFormat) || data.policy !== 'single-slot-v1'
    || data.rulesVersion !== '1.2-stress-1' || data.randomAlgorithm !== RANDOM_ALGORITHM) {
    throw new SaveError('save-incompatible', '이 버전에서 지원하지 않는 저장입니다. 원본은 유지됩니다. 호환되는 게임 버전으로 열어 주세요.')
  }
  const source = data.origin
  const checkpoint = data.checkpoint
  if (!isRecord(source) || typeof source.runId !== 'string' || source.runId.length > 200
    || typeof source.name !== 'string' || source.name.trim() !== source.name || source.name.length < 1 || source.name.length > 40
    || !isIntegerInRange(source.seed, 0, 0xffffffff) || !Array.isArray(source.answers) || source.answers.length !== 6
    || !isRecord(checkpoint) || !isIntegerInRange(checkpoint.revision, 0, oldFormat ? 8 : 12) || !Array.isArray(checkpoint.history) || checkpoint.history.length > (oldFormat ? 4 : 6)) throw corrupt()
  const answers: SavedAnswer[] = []
  for (const answer of source.answers) {
    if (!isRecord(answer) || typeof answer.questionId !== 'string' || typeof answer.answerId !== 'string') throw corrupt()
    answers.push({ questionId: answer.questionId, answerId: answer.answerId })
  }
  const resolved = resolveAnswers(answers)
  if (!resolved.ok) throw corrupt()
  const origin: RunOrigin = { runId: source.runId, name: source.name, seed: source.seed, answers }
  const initial = createOpeningRun({ ...origin, answers: resolved.value, contentRevision: oldFormat ? LEGACY_OPENING_CONTENT : CURRENT_OPENING_CONTENT })
  if (!initial.ok) throw corrupt()
  let run = initial.value
  while (run.revision < checkpoint.revision) {
    if (run.phase === 'choice') {
      const entry = checkpoint.history[run.history.length]
      if (!isRecord(entry) || !isRecord(entry.selection) || typeof entry.selection.actionId !== 'string' || typeof entry.selection.treat !== 'boolean') throw corrupt()
      const next = executeOpeningAction(run, getOpeningContext(run), { actionId: entry.selection.actionId, treat: entry.selection.treat })
      if (!next.ok) throw corrupt()
      run = next.value
    } else if (run.phase === 'result' && run.result) {
      const next = acknowledgeOpeningResult(run, getOpeningContext(run), run.result.resultId)
      if (!next.ok) throw corrupt()
      run = next.value
    } else throw corrupt()
  }
  // This comparison also rejects unknown/missing fields, impossible rewards and invented history.
  if (!equalJson(JSON.parse(encodeOpeningSave(origin, run)), data)) throw corrupt()
  return { origin, run }
}
