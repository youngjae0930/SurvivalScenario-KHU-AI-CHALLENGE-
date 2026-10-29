import type { CatalogPack, CatalogRun } from '../domain/catalog'
import { compileCatalog } from '../engine/catalog/compile'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, executeCatalogAction } from '../engine/catalog/runtime'
import { RANDOM_ALGORITHM } from '../engine/random'
import { isCompanionContext } from '../engine/catalog/intervention'
import { createInheritedCatalogRun, isCatalogLegacy } from '../engine/catalog/inheritance'
import { isIntegerInRange, isRecord } from '../domain/validation'
import type { AnswerResolver, RunOrigin } from './opening-save'
import { SaveError } from './opening-save'

const MAX_SAVE_LENGTH = 2_000_000
function hasCompanionChoices(pack: CatalogPack): boolean {
  return pack.events.some(event => event.intervention?.mode === 'companion-choice')
}
function companionRuntimeVersion(pack: CatalogPack, succession: boolean) {
  if (pack.manifest.dialogueVersion) return succession ? 'catalog-succession-11' : 'catalog-companion-dialogue-1'
  if (pack.manifest.routeVersion) return succession ? 'catalog-succession-10' : 'catalog-companion-stages-1'
  if (pack.manifest.trustVersion) return succession ? 'catalog-succession-9' : 'catalog-companion-outcome-1'
  if (pack.manifest.executionVersion) return succession ? 'catalog-succession-8' : 'catalog-companion-command-1'
  if (pack.manifest.autonomyVersion) return succession ? 'catalog-succession-7' : 'catalog-companion-autonomy-1'
  if (pack.manifest.decisionEcho) return succession ? 'catalog-succession-6' : 'catalog-companion-echo-1'
  if (pack.manifest.decisionMemoryVersion === 'context-1') return succession ? 'catalog-succession-5' : 'catalog-companion-memory-1'
  if (pack.manifest.recommendationVersion === 'survival-1') return succession ? 'catalog-succession-4' : 'catalog-companion-recommendation-1'
  const sharing = pack.events.some(event => event.groups.some(group => group.choices.some(choice => choice.behavior.kind === 'recovery' && choice.behavior.choice === 'share')))
  return sharing ? (succession ? 'catalog-succession-3' : 'catalog-companion-recovery-1')
    : succession ? (hasCompanionChoices(pack) ? 'catalog-succession-2' : 'catalog-succession-1')
      : hasCompanionChoices(pack) ? 'catalog-companion-choice-1' : 'catalog-intervention-1'
}
function runtimeVersion(pack: CatalogPack) {
  if (pack.manifest.dialogueVersion) return 'catalog-runtime-5'
  if (pack.manifest.routeVersion) return 'catalog-runtime-4'
  if (pack.manifest.decisionMemoryVersion === 'context-1') return 'catalog-runtime-3'
  return pack.events.some(event => event.groups.some(group => group.choices.some(choice => choice.behavior.kind === 'escape'))) ? 'catalog-runtime-2' : 'catalog-runtime-1'
}
function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => equalJson(value, right[index]))
  if (!isRecord(left) || !isRecord(right)) return false
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && equalJson(left[key], right[key]))
}
/** Pin the full validated pack: adding/editing author files cannot reroll an existing run. */
export function encodeCatalogSave(origin: RunOrigin, pack: CatalogPack, run: CatalogRun): string {
  const companion = run.companion !== null
  const succession = run.previousLegacy !== undefined
  if (succession && (!companion || !isCatalogLegacy(run.previousLegacy))) throw new SaveError('save-incompatible', '직전 회차 기록이 올바르지 않습니다.')
  if (companion && (!isCompanionContext(run.companionOrigin) || !isCompanionContext(run.companion))) throw new SaveError('save-incompatible', '동료 입력을 복원할 수 없습니다.')
  const raw = JSON.stringify({ schemaVersion: succession ? 8 : companion ? 7 : 6, kind: companion ? 'catalog-companion' : 'catalog-solo', policy: 'single-slot-v1', runtimeVersion: companion ? companionRuntimeVersion(pack, succession) : runtimeVersion(pack), randomAlgorithm: RANDOM_ALGORITHM,
    ...(succession ? { previousLegacy: run.previousLegacy } : {}),
    ...(companion ? { companionOrigin: run.companionOrigin } : {}),
    origin, pack, checkpoint: run, legacy: catalogLegacy(pack, run) })
  if (raw.length > MAX_SAVE_LENGTH) throw new SaveError('save-failed', '콘텐츠와 회차 저장이 크기 한도를 초과했습니다. 콘텐츠 팩을 나눠 주세요.')
  return raw
}
export function decodeCatalogSave(raw: string, resolveAnswers: AnswerResolver): { origin: RunOrigin; pack: CatalogPack; run: CatalogRun } {
  const invalid = () => new SaveError('save-incompatible', '콘텐츠 또는 진행 기록이 호환되지 않습니다. 원본을 보존하며 덮어쓰지 않습니다.')
  try {
    if (raw.length > MAX_SAVE_LENGTH) throw invalid()
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.policy !== 'single-slot-v1' || data.randomAlgorithm !== RANDOM_ALGORITHM || !isRecord(data.origin) || !isRecord(data.checkpoint)) throw invalid()
    const succession = data.schemaVersion === 8 && data.kind === 'catalog-companion' && ['catalog-succession-1', 'catalog-succession-2', 'catalog-succession-3', 'catalog-succession-4', 'catalog-succession-5', 'catalog-succession-6', 'catalog-succession-7', 'catalog-succession-8', 'catalog-succession-9', 'catalog-succession-10', 'catalog-succession-11'].includes(String(data.runtimeVersion))
    if (succession && !isCatalogLegacy(data.previousLegacy)) throw invalid()
    const companion = succession || (data.schemaVersion === 7 && data.kind === 'catalog-companion' && ['catalog-intervention-1', 'catalog-companion-choice-1', 'catalog-companion-recovery-1', 'catalog-companion-recommendation-1', 'catalog-companion-memory-1', 'catalog-companion-echo-1', 'catalog-companion-autonomy-1', 'catalog-companion-command-1', 'catalog-companion-outcome-1', 'catalog-companion-stages-1', 'catalog-companion-dialogue-1'].includes(String(data.runtimeVersion)))
    if (companion ? !isCompanionContext(data.companionOrigin) : data.schemaVersion !== 6 || data.kind !== 'catalog-solo' || !['catalog-runtime-1', 'catalog-runtime-2', 'catalog-runtime-3', 'catalog-runtime-4', 'catalog-runtime-5'].includes(String(data.runtimeVersion))) throw invalid()
    // Existing schema6 packs pin their original two-choice definitions.
    const pack = compileCatalog(data.pack, { allowLegacyChoices: true })
    if (!companion && data.runtimeVersion !== runtimeVersion(pack)) throw invalid()
    const source = data.origin
    if (typeof source.runId !== 'string' || typeof source.name !== 'string' || source.name !== source.name.trim() || !source.name || source.name.length > 40
      || !isIntegerInRange(source.seed, 0, 0xffffffff) || !Array.isArray(source.answers) || source.answers.length !== 6) throw invalid()
    const answers = source.answers.map(answer => {
      if (!isRecord(answer) || typeof answer.questionId !== 'string' || typeof answer.answerId !== 'string') throw invalid()
      return { questionId: answer.questionId, answerId: answer.answerId }
    })
    const origin: RunOrigin = { runId: source.runId, name: source.name, seed: source.seed, answers }
    const resolved = resolveAnswers(answers)
    if (!resolved.ok) throw invalid()
    let run = succession ? createInheritedCatalogRun(pack, data.previousLegacy as import('../domain/catalog').CatalogLegacy, { ...origin, answers: resolved.value })
      : createCatalogRun(pack, { ...origin, answers: resolved.value, ...(companion ? { companion: data.companionOrigin as import('../domain/catalog').CompanionContext } : {}) })
    const checkpoint = data.checkpoint
    if (!isIntegerInRange(checkpoint.revision, 0, run.route.length * 2) || !Array.isArray(checkpoint.history) || checkpoint.history.length > run.route.length) throw invalid()
    while (run.revision < checkpoint.revision) {
      if (run.phase === 'choice') {
        const entry = checkpoint.history[run.history.length]
        if (!isRecord(entry) || typeof entry.actionId !== 'string' || typeof entry.treat !== 'boolean') throw invalid()
        run = executeCatalogAction(pack, run, entry.actionId, entry.treat, isRecord(entry.execution) && entry.execution.actor === 'companion' ? 'companion' : 'protagonist')
      } else if (run.phase === 'result' && run.result) run = acknowledgeCatalogResult(pack, run, run.result.resultId)
      else throw invalid()
    }
    if (!equalJson(JSON.parse(encodeCatalogSave(origin, pack, run)), data)) throw invalid()
    return { origin, pack, run }
  } catch (error) { if (error instanceof SaveError) throw error; throw invalid() }
}
