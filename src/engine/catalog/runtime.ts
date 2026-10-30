import type { CoreAction, CoreActionPreview } from '../../domain/actions'
import type { CatalogChoice, CatalogContext, CatalogDecisionSituation, CatalogEvent, CatalogPack, CatalogRun, CatalogScript, CompanionContext } from '../../domain/catalog'
import type { ResolvedQuestionnaireAnswer } from '../../domain/types'
import { validateCoreState } from '../../domain/validation'
import { previewCoreAction, resolveCoreAction } from '../actions'
import { createInitialCoreState } from '../initial-state'
import { initializeRandom } from '../random'
import { buildRecoveryAction, recoveryTrustAfter, resolveRecovery } from '../recovery'
import { buildEscapeAction, getEscapeOptions, resolveEscape } from '../escape'
import { asCompanionChoice, isCompanionContext, selectIntervention, sourceChoiceId } from './intervention'
import { allChoices, eventFits } from './compile'
import { matches } from './conditions'
import { weightedPick } from './random'
import { planRoute } from './route'
import { destinationLock, planSlotSegment } from './slots'
import { assessChoice } from './assessment'
import { evaluateRelationship, protectRecommendedTrust, type TrustChange } from './relationship'
import { selectGeneralRecommendation, type GeneralRecommendation } from './recommendation'
import { decisionMemoryFor } from './decision-memory'
import { equalRememberedAction, findRememberedDecision, representativeGoal } from './decision-echo'
import { activeCatalogCompanion, reuniteCatalogCompanion } from './companion-journey'
import { findDialogue, type DialogueSlot } from './dialogue'
import { infectionActor, infectionState, resolveInfectionContacts } from './infection'
import { placeOpportunities } from './opportunities'
import { companionActorState, projectCompanionAction, type CompanionProjection } from './companion-vitals'
import { catalogTraitBounds } from './traits'

export class CatalogRuntimeError extends Error {
  readonly code: 'action-unavailable' | 'stale-context' | 'invalid-phase' | 'content-invalid'
  constructor(code: CatalogRuntimeError['code'], message: string) { super(message); this.code = code }
}
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new CatalogRuntimeError('action-unavailable', result.error.message)
  return result.value
}
export function catalogContext(pack: CatalogPack, run: CatalogRun): CatalogContext {
  const location = pack.locations.find(item => item.id === run.route[run.visitIndex])
  if (!location) throw new CatalogRuntimeError('content-invalid', '현재 장소가 콘텐츠에 없습니다.')
  const companion = activeCatalogCompanion(run)
  return { core: run.core, companion: companion && run.companionVitals ? { ...companion, ...run.companionVitals } : companion, facts: run.facts, visited: run.route.slice(0, run.visitIndex + 1), location,
    ...(pack.manifest.traitRangeVersion ? { extremeBounds: { left: catalogTraitBounds(pack).extremeLeft, right: catalogTraitBounds(pack).extremeRight } } : {}),
    ...(pack.manifest.opportunities ? { opportunities: Object.keys(run.opportunities ?? {}).filter(id => run.opportunities![id] === location.id) } : {}),
    ...(pack.manifest.infectionVersion ? { infection: infectionState(run) } : {}) }
}
export function currentEvent(pack: CatalogPack, run: CatalogRun): CatalogEvent {
  const event = pack.events.find(item => item.id === run.visits[run.visitIndex]?.eventId)
  if (!event) throw new CatalogRuntimeError('content-invalid', '현재 사건이 콘텐츠에 없습니다.')
  return event
}
export function currentGroup(pack: CatalogPack, run: CatalogRun) {
  const context = catalogContext(pack, run)
  const groups = [...currentEvent(pack, run).groups].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const group = groups.find(item => matches(item.conditions, context))
  if (!group) throw new CatalogRuntimeError('content-invalid', '현재 조건의 선택 그룹이 없습니다.')
  return group
}
function selectScript(pack: CatalogPack, run: CatalogRun, slot: CatalogScript['slot'], choiceId: string | null, deterministic = false): { script: CatalogScript; rngState: number } {
  const context = catalogContext(pack, run)
  const eventId = run.visits[run.visitIndex].eventId
  const eligible = pack.scripts.filter(script => script.eventId === eventId && script.choiceId === choiceId && script.slot === slot
    && (!script.once || !run.usedScripts.includes(script.id)) && matches(script.conditions, context))
  const priority = Math.max(...eligible.map(script => script.priority))
  const candidates = eligible.filter(script => script.priority === priority)
  const unseen = candidates.filter(script => !run.usedScripts.includes(script.id))
  const pool = unseen.length ? unseen : candidates
  if (!pool.length) throw new CatalogRuntimeError('content-invalid', '현재 조건의 결과 문구가 없습니다.')
  const picked = deterministic ? { item: [...pool].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0], rngState: run.rngState } : weightedPick(pool, run.rngState)
  return { script: picked.item, rngState: picked.rngState }
}
function enterLocation(pack: CatalogPack, run: CatalogRun): CatalogRun {
  run = reuniteCatalogCompanion(run, catalogContext(pack, run))
  const context = catalogContext(pack, run)
  const picked = weightedPick(pack.events.filter(event => eventFits(event, context.location) && matches(event.conditions, context)), run.rngState)
  if (allChoices(picked.item).some(choice => choice.behavior.kind === 'escape') && run.visitIndex !== run.route.length - 1) throw new CatalogRuntimeError('content-invalid', '탈출 장소는 여정의 마지막이어야 합니다.')
  const provisional: CatalogRun = { ...run, rngState: picked.rngState, visits: [...run.visits, { locationId: context.location.id, eventId: picked.item.id, sceneScriptId: '' }] }
  const scene = selectScript(pack, provisional, 'scene', null)
  return { ...provisional, rngState: scene.rngState, visits: [...run.visits, { locationId: context.location.id, eventId: picked.item.id, sceneScriptId: scene.script.id }], usedScripts: [...run.usedScripts, scene.script.id] }
}
export function createCatalogRun(pack: CatalogPack, input: { runId: string; name: string; seed: number; answers: readonly ResolvedQuestionnaireAnswer[]; companion?: CompanionContext | null }): CatalogRun {
  if (!input.runId || input.runId.length > 200 || !input.name.trim() || input.name.trim().length > 40) throw new CatalogRuntimeError('content-invalid', '회차 이름/ID를 확인해 주세요.')
  if (input.companion && !isCompanionContext(input.companion)) throw new CatalogRuntimeError('content-invalid', '동료 문맥 값이 올바르지 않습니다.')
  const core = unwrap(createInitialCoreState(input.name.trim(), input.answers))
  const random = unwrap(initializeRandom(input.seed))
  const planned = planRoute(pack, random)
  const placed = placeOpportunities(pack, planned.route, planned.rngState)
  return enterLocation(pack, {
    runId: input.runId, initialSeed: input.seed, rngState: placed.rngState, route: planned.route, visitIndex: 0, visits: [], usedScripts: [],
    ...(pack.manifest.opportunities ? { opportunities: placed.opportunities } : {}),
    core, companion: input.companion ? structuredClone(input.companion) : null,
    ...(input.companion && pack.manifest.companionStateVersion ? { companionVitals: { stamina: 70, stress: 30, injury: 0 } } : {}),
    ...(pack.manifest.infectionVersion ? { infectionDeaths: [] } : {}),
    ...(input.companion ? { companionOrigin: structuredClone(input.companion) } : {}), facts: Object.fromEntries(pack.manifest.facts.map(id => [id, false])),
    ...(input.companion && pack.manifest.autonomyVersion ? { companionJourney: { separation: null, reunions: [] } } : {}),
    phase: 'choice', revision: 0, history: [], result: null, judgmentCounts: { rescue: 0, self: 0 },
  })
}
export interface CatalogPreview extends CoreActionPreview {
  readonly companionOutcomes?: Readonly<Partial<Record<'success' | 'failure', CompanionProjection>>>
  readonly escapeEnding?: NonNullable<import('../../domain/catalog').CatalogHistory['escape']>['ending']
  readonly infectionDeathsOnFailure?: readonly import('../../domain/catalog').InfectionDeath[]
  readonly trustOutcomes?: { readonly success?: TrustChange; readonly failure?: TrustChange }
  readonly executionActor?: 'protagonist' | 'companion'
  readonly choice: CatalogChoice
  readonly action: CoreAction
  readonly treat: boolean
  readonly trustChange?: import('../../domain/catalog').CatalogHistory['trustChange']
}
export function catalogIntervention(pack: CatalogPack, run: CatalogRun) {
  return selectIntervention(currentEvent(pack, run), currentGroup(pack, run), catalogContext(pack, run))
}
/** Only recovery's already specified affect>=50 exception; no general neutral ranking. */
export function catalogRecoveryOpinion(pack: CatalogPack, run: CatalogRun) {
  const companion = activeCatalogCompanion(run)
  if (!companion) return null
  const group = currentGroup(pack, run)
  const share = group.choices.find(choice => choice.behavior.kind === 'recovery' && choice.behavior.choice === 'share')
  const maintain = group.choices.find(choice => choice.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain')
  if (!share || !maintain) return null
  const prefersShare = companion.traits.affect >= 50
  const choice = prefersShare && run.core.inventory.supply >= 1 ? share : maintain
  return { choice, source: 'trait' as const,
    text: choice === share ? '조금 나눠서 함께 쉬자. 다음 길도 같이 버텨야 하니까.' : '지금은 네 몸과 장비부터 추스르자.',
    reason: choice === share ? '동료는 서로 돌보며 쉬는 쪽을 권합니다.' : prefersShare ? '나눌 물자가 없어 소모 없이 정비하는 쪽을 권합니다.' : '동료는 앞으로의 이동을 위한 정비를 권합니다.' }
}
export function catalogChoices(pack: CatalogPack, run: CatalogRun): readonly CatalogChoice[] {
  const group = currentGroup(pack, run)
  const intervention = catalogIntervention(pack, run)
  return intervention ? group.choices.map(choice => choice.id === intervention.replaceChoiceId ? intervention.choice : choice) : group.choices
}
/** Read-only current candidates, using exactly the same availability and effects as play. */
export function assessCatalogChoices(pack: CatalogPack, run: CatalogRun) {
  return catalogChoices(pack, run).flatMap(choice => {
    const assessment = assessChoice(run.core, previewCatalogActionBase(pack, run, choice.id))
    return assessment ? [assessment] : []
  })
}
export function catalogGeneralRecommendation(pack: CatalogPack, run: CatalogRun, useMemory = true): GeneralRecommendation {
  const event = currentEvent(pack, run)
  const companion = activeCatalogCompanion(run)
  if (run.phase !== 'choice' || !companion || pack.manifest.recommendationVersion !== 'survival-1' || !event.recommendation
    || catalogIntervention(pack, run) || catalogRecoveryOpinion(pack, run)) return { kind: 'inactive' }
  const rememberedGoal = useMemory && pack.manifest.decisionEcho && run.previousLegacy?.decisionMemory
    ? representativeGoal(pack.manifest.decisionEcho, run.previousLegacy, catalogDecisionSituationBase(pack, run)) : undefined
  return selectGeneralRecommendation(event.recommendation, companion.traits, assessCatalogChoices(pack, run), rememberedGoal)
}
function baseOpinionChoice(pack: CatalogPack, run: CatalogRun) {
  const special = catalogIntervention(pack, run) ?? catalogRecoveryOpinion(pack, run)
  if (special) return special.choice
  const general = catalogGeneralRecommendation(pack, run, false)
  return general.kind === 'ready' ? general.choice : null
}
export function catalogRecommendedChoice(pack: CatalogPack, run: CatalogRun) {
  const remembered = catalogRememberedChoice(pack, run)
  const special = remembered ?? catalogIntervention(pack, run) ?? catalogRecoveryOpinion(pack, run)
  if (special) return special.choice
  const general = catalogGeneralRecommendation(pack, run)
  return general.kind === 'ready' ? general.choice : null
}
/** User-approved order acceptance. Independent following still uses its separate trust80 policy. */
export function catalogCommandOffer(pack: CatalogPack, run: CatalogRun, actionId: string) {
  const choice = catalogChoices(pack, run).find(choice => choice.id === actionId)
  const recovery = pack.manifest.companionStateVersion && choice?.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain'
  const policy = recovery ? { role: '정비와 치료', conditions: [], sharedRisk: '선택한 사람의 체력·스트레스·부상을 정비합니다. 물자와 치료 도구는 공용 재고에서 사용합니다.' } : choice?.execution
  if (pack.manifest.executionVersion !== 'command-1' || !policy || (!recovery && choice?.behavior.kind !== 'action')
    || actionId !== sourceChoiceId(actionId)) return null
  const companion = activeCatalogCompanion(run)
  const reasons = !companion ? ['지금 함께 행동할 동료가 없습니다.']
    : !matches(policy.conditions, catalogContext(pack, run)) ? ['이 행동을 동료에게 맡길 상황 조건을 충족하지 못했습니다.']
      : recovery || companion.trust >= 60 || sourceChoiceId(catalogRecommendedChoice(pack, run)?.id ?? '') === actionId ? []
        : ['동료는 이 행동을 권하지 않습니다. 다른 행동을 맡기려면 신뢰 60 이상이 필요합니다.']
  return { policy, allowed: reasons.length === 0, reasons }
}
/** Same priority as the displayed opinion. No added rolls, hidden actions, or player effects. */
export function catalogAutonomyDeparture(pack: CatalogPack, run: CatalogRun, actionId: string) {
  const policy = currentEvent(pack, run).autonomy
  if (!pack.manifest.autonomyVersion || !policy || !activeCatalogCompanion(run) || run.phase !== 'choice'
    || actionId !== sourceChoiceId(actionId) || !matches(policy.conditions, catalogContext(pack, run))) return null
  const chosen = catalogChoices(pack, run).find(choice => choice.id === actionId)
  const preferred = catalogRecommendedChoice(pack, run)
  const conflict = policy.conflicts?.find(conflict => conflict.playerGoalId === chosen?.goalId && conflict.companionGoalId === preferred?.goalId)
  if (policy.conflicts) {
    if (activeCatalogCompanion(run)!.trust >= 80 || !chosen || !preferred
      || !conflict) return null
  } else if (chosen?.judgment !== policy.playerJudgment || preferred?.judgment !== policy.companionJudgment) return null
  return { eventId: currentEvent(pack, run).id, locationId: catalogContext(pack, run).location.id, visitIndex: run.visitIndex,
    playerActionId: actionId, companionActionId: preferred.id, reunion: structuredClone(policy.reunion), ...(conflict ? { reason: conflict.reason } : {}) }
}
export function catalogRememberedChoice(pack: CatalogPack, run: CatalogRun) {
  if (run.phase !== 'choice' || !activeCatalogCompanion(run) || !run.previousLegacy?.decisionMemory || !pack.manifest.decisionEcho) return null
  const entry = findRememberedDecision(pack.manifest.decisionEcho, run.previousLegacy, catalogDecisionSituationBase(pack, run), remembered => {
    try {
      const preview = previewCatalogActionBase(pack, run, remembered.actionId, remembered.treat)
      const selfRecovery = pack.manifest.companionStateVersion && preview.choice.behavior.kind === 'recovery' && preview.choice.behavior.choice === 'maintain'
      if (remembered.context.executionActor === 'companion' && (!pack.manifest.executionVersion || (!selfRecovery && (!preview.choice.execution
        || !matches(preview.choice.execution.conditions, catalogContext(pack, run)))))) return false
      return preview.allowed && equalRememberedAction(preview.action, remembered.context.selectedAction)
    } catch (error) {
      if (error instanceof CatalogRuntimeError && error.code === 'action-unavailable') return false
      throw error
    }
  })
  return entry ? { choice: previewCatalogActionBase(pack, run, entry.actionId, entry.treat).choice, treat: entry.treat,
    actor: entry.context.executionActor ?? 'protagonist' as const } : null
}
function withTrustPreview(pack: CatalogPack, run: CatalogRun, preview: CatalogPreview): CatalogPreview {
  if (preview.allowed && pack.manifest.companionStateVersion && infectionActor(preview.choice.id, preview.executionActor ?? 'protagonist') === 'companion') {
    preview = { ...preview, companionOutcomes: { success: projectCompanionAction(run, preview.action, 'success'), failure: projectCompanionAction(run, preview.action, 'failure') } }
  }
  if (pack.manifest.infectionVersion) preview = { ...preview, infectionDeathsOnFailure: resolveInfectionContacts(pack, run, preview.choice, infectionActor(preview.choice.id, preview.executionActor ?? 'protagonist'), true) }
  const companion = activeCatalogCompanion(run)
  if (!pack.manifest.trustVersion || !companion) return preview
  const outcomes = assessChoice(run.core, preview)?.outcomes ?? []
  const before = preview.companionOutcomes ? companionActorState(run) : run.core
  return { ...preview, trustOutcomes: Object.fromEntries(outcomes.map(branch => {
    const body = preview.companionOutcomes?.[branch.outcome]
    const after = body ? { ...branch.state, protagonist: { ...before.protagonist, ...body.companionVitals } } : branch.state
    return [branch.outcome, evaluateRelationship(before, after, companion, preview.choice, branch.outcome,
      preview.choice.behavior.kind === 'escape' && preview.choice.behavior.route !== 'request', pack.manifest.trustScale ?? 1)]
  })) }
}
export function previewCatalogAction(pack: CatalogPack, run: CatalogRun, actionId: string, treat = false, actor: 'protagonist' | 'companion' = 'protagonist'): CatalogPreview {
  const preview = previewCatalogActionBase(pack, run, actionId, treat, actor)
  if (pack.manifest.trustVersion !== 'outcome-2' || !preview.trustOutcomes
    || catalogRecommendedChoice(pack, run)?.id !== actionId) return preview
  return { ...preview, trustOutcomes: Object.fromEntries(Object.entries(preview.trustOutcomes)
    .map(([branch, change]) => [branch, protectRecommendedTrust(change, true)])) }
}
/** Recommendation and memory matching compare unprotected outcomes, avoiding a circular recommendation. */
function previewCatalogActionBase(pack: CatalogPack, run: CatalogRun, actionId: string, treat = false, actor: 'protagonist' | 'companion' = 'protagonist'): CatalogPreview {
  if (run.phase !== 'choice') throw new CatalogRuntimeError('invalid-phase', '선택 단계가 아닙니다.')
  if (actor !== 'protagonist' && actor !== 'companion') throw new CatalogRuntimeError('action-unavailable', '실행 주체를 확인해 주세요.')
  if (actor === 'companion' && !pack.manifest.companionStateVersion) {
    const preview = previewCatalogActionBase(pack, run, actionId, treat)
    const offer = catalogCommandOffer(pack, run, actionId)
    if (!offer) throw new CatalogRuntimeError('action-unavailable', '이 행동은 동료에게 맡길 수 없습니다.')
    return withTrustPreview(pack, run, { ...preview, executionActor: 'companion', allowed: preview.allowed && offer.allowed, reasons: [...preview.reasons, ...offer.reasons] })
  }
  unwrap(validateCoreState(run.core))
  const choice = catalogChoices(pack, run).find(item => item.id === actionId)
  if (!choice) throw new CatalogRuntimeError('action-unavailable', '현재 장면에서 제공하는 선택이 아닙니다.')
  const separateActor = pack.manifest.companionStateVersion && infectionActor(actionId, actor) === 'companion'
  if (separateActor && (!run.companion || !run.companionVitals)) throw new CatalogRuntimeError('action-unavailable', '함께 행동할 동료가 없습니다.')
  const actorState = separateActor ? companionActorState(run) : run.core
  const offer = actor === 'companion' ? catalogCommandOffer(pack, run, actionId) : null
  if (actor === 'companion' && !offer) throw new CatalogRuntimeError('action-unavailable', '이 행동은 동료에게 맡길 수 없습니다.')
  let action: CoreAction
  if (choice.behavior.kind === 'escape') {
    if (treat) throw new CatalogRuntimeError('action-unavailable', '탈출 중에는 추가 치료할 수 없습니다.')
    const route = choice.behavior.route
    action = { ...buildEscapeAction(route), id: choice.id }
    const option = unwrap(getEscapeOptions(run.core)).find(item => item.route === route)!
    const preview = unwrap(previewCoreAction({ state: run.core, action, eventId: 'E12', phase: 'choice', companionPresent: activeCatalogCompanion(run) !== null, cooperating: false }))
    return withTrustPreview(pack, run, { ...preview, allowed: option.allowed, reasons: option.reasons, choice, action, treat,
      escapeEnding: catalogEscapeEnding(pack, run, choice, route === 'request' ? 'escape-failed' : run.core.flags.data ? 'data-and-escape' : 'escape') })
  } else if (choice.behavior.kind === 'recovery') {
    const built = unwrap(buildRecoveryAction({ state: actorState, phase: 'choice', eventId: choice.behavior.ruleEventId, choice: choice.behavior.choice, treat,
      companionTrust: choice.behavior.choice === 'share' ? run.companion?.trust ?? null : null }))
    action = { ...built, id: choice.id }
  } else {
    if (treat) throw new CatalogRuntimeError('action-unavailable', '정비 행동에서만 치료할 수 있습니다.')
    const variant = choice.behavior.variants.find(item => matches(item.conditions, catalogContext(pack, run)))
    if (!variant) throw new CatalogRuntimeError('content-invalid', '현재 상태의 행동 정의가 없습니다.')
    action = variant.action
  }
  if (choice.id !== sourceChoiceId(choice.id)) action = { ...action, id: choice.id, requires: { ...action.requires, companion: true } }
  const preview = unwrap(previewCoreAction({ state: actorState, action, eventId: action.eventId, phase: 'choice', companionPresent: activeCatalogCompanion(run) !== null, cooperating: false }))
  const intervention = catalogIntervention(pack, run)
  const routeLock = choice.destinationSegmentId ? destinationLock(pack, run.route[run.visitIndex], choice.destinationSegmentId, catalogContext(pack, run)) : null
  return withTrustPreview(pack, run, { ...preview, allowed: preview.allowed && !routeLock && !(intervention?.choice.id === actionId && !intervention.allowed) && (!offer || offer.allowed),
    reasons: [...preview.reasons, ...(offer?.reasons ?? []), ...(routeLock ? [routeLock] : []), ...(intervention?.choice.id === actionId && !intervention.allowed ? [intervention.lockReason] : [])], choice, action, treat,
    ...(actor === 'companion' ? { executionActor: actor } : {}),
    ...(!pack.manifest.trustVersion && choice.behavior.kind === 'recovery' && choice.behavior.choice === 'share' && run.companion
      ? { trustChange: { before: run.companion.trust, after: recoveryTrustAfter(run.companion.trust, 'share'), reason: '동료에게 물자를 양보했습니다.' } } : {}) })
}
/** Shared evidence for recording and comparing; querying it cannot choose or execute. */
export function catalogDecisionSituation(pack: CatalogPack, run: CatalogRun): CatalogDecisionSituation {
  const situation = catalogDecisionSituationBase(pack, run)
  if (pack.manifest.trustVersion !== 'outcome-2' || !activeCatalogCompanion(run)) return situation
  const recommendedId = catalogRecommendedChoice(pack, run)?.id
  return { ...situation, options: situation.options.map(option => !option.trustOutcomes ? option : {
    ...option, baseTrustOutcomes: option.trustOutcomes,
    trustOutcomes: option.actionId === recommendedId
      ? Object.fromEntries(Object.entries(option.trustOutcomes).map(([branch, delta]) => [branch, Math.max(0, delta)]))
      : option.trustOutcomes,
  }) }
}
function catalogDecisionSituationBase(pack: CatalogPack, run: CatalogRun): CatalogDecisionSituation {
  if (run.phase !== 'choice') throw new CatalogRuntimeError('invalid-phase', '선택 단계가 아닙니다.')
  return structuredClone({
    ...(run.companionVitals ? { companionVitals: run.companionVitals } : {}),
    ...(pack.manifest.opportunities ? { opportunities: catalogContext(pack, run).opportunities } : {}),
    ...(pack.manifest.infectionVersion ? { infection: infectionState(run) } : {}),
    ...(catalogChoices(pack, run).length !== 4 ? { optionCount: catalogChoices(pack, run).length } : {}),
    ...(pack.manifest.trustVersion && activeCatalogCompanion(run)
      ? { relationship: { version: pack.manifest.trustVersion, companion: activeCatalogCompanion(run)! } } : {}),
    ...(pack.manifest.executionVersion && activeCatalogCompanion(run) && catalogChoices(pack, run).some(choice => choice.execution)
      ? { commandTrustSufficient: activeCatalogCompanion(run)!.trust >= 60 } : {}),
    ...(pack.manifest.autonomyVersion && currentEvent(pack, run).autonomy && activeCatalogCompanion(run)
      && (pack.manifest.autonomyVersion !== 'journey-2' || activeCatalogCompanion(run)!.trust < 80)
      && matches(currentEvent(pack, run).autonomy!.conditions, catalogContext(pack, run))
      ? { autonomy: { policy: currentEvent(pack, run).autonomy!, preferredActionId: baseOpinionChoice(pack, run)?.id ?? null } } : {}),
    content: { packId: pack.manifest.id, revision: pack.manifest.revision, rulesVersion: pack.manifest.rulesVersion },
    eventId: currentEvent(pack, run).id, locationId: catalogContext(pack, run).location.id, stage: catalogContext(pack, run).location.stage,
    groupId: currentGroup(pack, run).id, sceneScriptId: run.visits[run.visitIndex].sceneScriptId,
    core: run.core, companion: activeCatalogCompanion(run), facts: run.facts, visitedLocationIds: run.route.slice(0, run.visitIndex + 1),
    options: catalogChoices(pack, run).map(choice => {
      const option = previewCatalogActionBase(pack, run, choice.id)
      return { actionId: choice.id, goalId: choice.goalId, judgment: choice.judgment, behavior: choice.behavior.kind,
        ...((pack.manifest.endingVersion || pack.manifest.researchVersion) && choice.ending ? { ending: choice.ending } : {}),
        ...(pack.manifest.infectionVersion && choice.infection ? { infection: choice.infection } : {}),
        ...(choice.behavior.kind === 'escape' ? { route: choice.behavior.route } : {}), ...(choice.pace ? { pace: choice.pace } : {}),
        ...(pack.manifest.executionVersion && choice.execution ? { execution: choice.execution }
          : pack.manifest.companionStateVersion && choice.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain'
            ? { execution: { role: '정비와 치료', conditions: [], sharedRisk: '선택한 사람의 개별 상태를 정비합니다.' } } : {}),
        ...(pack.manifest.trustVersion && choice.relationship ? { relationship: choice.relationship } : {}),
        ...(option.trustOutcomes ? { trustOutcomes: Object.fromEntries(Object.entries(option.trustOutcomes).map(([branch, change]) => [branch, change.after - change.before])) } : {}),
        action: option.action, preview: { allowed: option.allowed, reasons: option.reasons, check: option.check } }
    }),
  })
}
function catalogEscapeEnding(pack: CatalogPack, run: CatalogRun, choice: CatalogChoice, original: 'data-and-escape' | 'escape' | 'escape-failed') {
  return original !== 'escape-failed' && (pack.manifest.endingVersion || pack.manifest.researchVersion) && choice.ending && matches(choice.ending.conditions, catalogContext(pack, run))
    ? choice.ending.kind : original
}
export function executeCatalogAction(pack: CatalogPack, run: CatalogRun, actionId: string, treat = false, actor: 'protagonist' | 'companion' = 'protagonist'): CatalogRun {
  const preview = previewCatalogAction(pack, run, actionId, treat, actor)
  if (!preview.allowed) throw new CatalogRuntimeError('action-unavailable', preview.reasons.join(' '))
  const followedRecommendation = (pack.manifest.reactionVersion || pack.manifest.trustVersion === 'outcome-2') && activeCatalogCompanion(run)
    && catalogRecommendedChoice(pack, run)?.id === actionId
  const departure = actor === 'companion' ? null : catalogAutonomyDeparture(pack, run, actionId)
  const decisionContext = pack.manifest.decisionMemoryVersion === 'context-1' ? { ...catalogDecisionSituation(pack, run), selectedAction: preview.action,
    ...(actor === 'companion' ? { executionActor: 'companion' as const } : {}) } : null
  const rawEscape = preview.choice.behavior.kind === 'escape' ? unwrap(resolveEscape({ state: run.core, eventId: 'E12', phase: 'choice', route: preview.choice.behavior.route }, run.rngState)) : null
  const escape = rawEscape ? { ...rawEscape, ending: catalogEscapeEnding(pack, run, preview.choice, rawEscape.ending) } : null
  const sharing = !pack.manifest.trustVersion && preview.choice.behavior.kind === 'recovery' && preview.choice.behavior.choice === 'share'
    ? unwrap(resolveRecovery({ state: run.core, phase: 'choice', eventId: preview.choice.behavior.ruleEventId, choice: 'share', treat, companionTrust: run.companion?.trust ?? null }, run.rngState)) : null
  const separateActor = pack.manifest.companionStateVersion && infectionActor(actionId, actor) === 'companion'
  const rawResolution = escape ? { ...escape, actionId } : sharing ? { ...sharing, actionId }
    : unwrap(resolveCoreAction({ state: separateActor ? companionActorState(run) : run.core, action: preview.action, eventId: preview.action.eventId, phase: 'choice', companionPresent: activeCatalogCompanion(run) !== null, cooperating: false }, run.rngState))
  const body = separateActor ? projectCompanionAction(run, preview.action, rawResolution.check.outcome === 'failure' ? 'failure' : 'success') : null
  const resolution = body ? { ...rawResolution, state: body.state, changes: body.changes, fatal: body.fatal, phase: body.fatal ? 'ending' as const : 'result' as const } : rawResolution
  const failure = resolution.check.outcome === 'failure'
  const infectionDeaths = resolveInfectionContacts(pack, run, preview.choice, infectionActor(actionId, actor), failure)
  const infectionFatal = infectionDeaths.some(death => death.subject === 'protagonist')
  const companion = activeCatalogCompanion(run)
  const relationshipBefore = body ? companionActorState(run) : run.core
  const relationshipAfter = body ? { ...resolution.state, protagonist: { ...relationshipBefore.protagonist, ...body.companionVitals } } : resolution.state
  const trustChange = pack.manifest.trustVersion && companion
    ? protectRecommendedTrust(evaluateRelationship(relationshipBefore, relationshipAfter, companion, preview.choice, failure ? 'failure' : 'success', escape?.reason === 'escaped', pack.manifest.trustScale ?? 1),
      pack.manifest.trustVersion === 'outcome-2' && !!followedRecommendation)
    : sharing ? preview.trustChange : undefined
  const facts = { ...run.facts, ...(failure ? preview.choice.failureFacts : preview.choice.successFacts) }
  const next = { ...run, core: resolution.state, facts, rngState: resolution.check.rngState,
    ...(body ? { companionVitals: body.companionVitals } : {}),
    ...(trustChange && run.companion ? { companion: { ...run.companion, trust: trustChange.after } } : {}) }
  const selected = selectScript(pack, next, failure ? 'failure' : 'success', sourceChoiceId(actionId), escape !== null)
  const extension = preview.choice.destinationSegmentId && !failure && !resolution.fatal
    ? planSlotSegment(pack, preview.choice.destinationSegmentId, selected.rngState) : null
  const placed = extension ? placeOpportunities(pack, extension.route, extension.rngState, run.opportunities) : null
  const result = { resultId: `${run.runId}:result:${run.revision + 1}`, visitIndex: run.visitIndex, eventId: currentEvent(pack, run).id, actionId, treat, judgment: preview.choice.judgment, resultScriptId: selected.script.id, resolution,
    ...(body ? { companionChange: { before: run.companionVitals!, after: body.companionVitals, changes: body.companionChanges } } : {}),
    ...(followedRecommendation ? { followedCompanionRecommendation: true as const } : {}),
    ...(infectionDeaths.length ? { infectionDeaths } : {}),
    ...(actor === 'companion' ? { execution: { actor: 'companion' as const, role: catalogCommandOffer(pack, run, actionId)!.policy.role, sharedRisk: catalogCommandOffer(pack, run, actionId)!.policy.sharedRisk } } : {}),
    ...(departure && !resolution.fatal && !escape && !infectionDeaths.length ? { companionDeparture: departure } : {}),
    ...(decisionContext ? { decisionContext: structuredClone(decisionContext) } : {}),
    ...(escape ? { escape: { ending: escape.ending, reason: escape.reason } } : {}),
    ...(trustChange ? { trustChange } : {}) }
  return {
    ...next, ...(pack.manifest.infectionVersion ? { infectionDeaths: [...(run.infectionDeaths ?? []), ...infectionDeaths] } : {}),
    ...(placed && pack.manifest.opportunities ? { opportunities: placed.opportunities } : {}),
    ...(extension ? { route: [...run.route, ...extension.route] } : {}), phase: infectionFatal || escape || resolution.fatal ? 'ending' : 'result', rngState: placed?.rngState ?? selected.rngState, revision: run.revision + 1,
    ...(result.companionDeparture && run.companionJourney ? { companionJourney: { ...run.companionJourney, separation: result.companionDeparture } } : {}),
    usedScripts: [...run.usedScripts, selected.script.id], history: [...run.history, result], result,
    judgmentCounts: { rescue: run.judgmentCounts.rescue + (preview.choice.judgment === 'rescue' ? 1 : 0), self: run.judgmentCounts.self + (preview.choice.judgment === 'self' ? 1 : 0) },
  }
}
export function acknowledgeCatalogResult(pack: CatalogPack, run: CatalogRun, resultId: string): CatalogRun {
  if (run.phase !== 'result' || run.result?.resultId !== resultId) throw new CatalogRuntimeError('stale-context', '현재 확인할 결과가 아닙니다.')
  if (run.visitIndex + 1 === run.route.length) return { ...run, phase: 'segment-complete', revision: run.revision + 1, result: null }
  return enterLocation(pack, { ...run, phase: 'choice', visitIndex: run.visitIndex + 1, revision: run.revision + 1, result: null })
}
export function renderCatalogScript(pack: CatalogPack, run: CatalogRun, scriptId: string): string[] {
  const script = pack.scripts.find(item => item.id === scriptId)
  if (!script) throw new CatalogRuntimeError('content-invalid', '저장된 문구가 없습니다.')
  const values: Record<string, string | undefined> = { 'protagonist.name': run.core.protagonist.name, 'companion.name': run.companion?.name, 'location.name': catalogContext(pack, run).location.name }
  return script.text.map(line => line.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
    if (values[key] === undefined) throw new CatalogRuntimeError('content-invalid', '문구에 필요한 인물이 없습니다.')
    return values[key]
  }))
}

/** Only an actual engine event can open its presentation channel. */
export function catalogDialogue(pack: CatalogPack, run: CatalogRun, slot: DialogueSlot, actionId: string | null = null): string[] {
  const active = activeCatalogCompanion(run)
  if (slot === 'recommendation-failure') {
    const result = run.result
    if (pack.manifest.reactionVersion !== 'contextual-1' || run.phase !== 'result' || !active || !result
      || result.actionId !== actionId || !result.followedCompanionRecommendation || result.resolution.check.outcome !== 'failure'
      || result.companionDeparture || result.infectionDeaths?.length || result.resolution.fatal
      || !result.resolution.changes.some(change => change.kind === 'number' && change.field === 'injury' && change.delta > 0)) return []
  }
  if (slot === 'infection-ending' && (pack.manifest.reactionVersion !== 'contextual-1' || run.phase !== 'ending'
    || run.result?.actionId !== actionId || !run.result.infectionDeaths?.some(death => death.subject === 'protagonist'))) return []
  if (slot === 'opinion' && (run.phase !== 'choice' || !active || !actionId
    || sourceChoiceId(catalogRecommendedChoice(pack, run)?.id ?? '') !== sourceChoiceId(actionId))) return []
  if (slot === 'hesitation' && (run.phase !== 'choice' || !active || catalogRecommendedChoice(pack, run) || catalogGeneralRecommendation(pack, run).kind !== 'withheld')) return []
  if (slot === 'departure-warning' && (!actionId || run.phase !== 'choice' || !catalogAutonomyDeparture(pack, run, actionId))) return []
  if (slot === 'departure' && (!run.result?.companionDeparture || actionId !== run.result.actionId)) return []
  if (slot === 'absent' && (run.phase !== 'choice' || !run.companionJourney?.separation)) return []
  if (slot === 'reunion' && (run.phase !== 'choice' || !active || run.companionJourney?.reunions.at(-1)?.visitIndex !== run.visitIndex)) return []
  const context = catalogContext(pack, run)
  const script = findDialogue(pack, slot === 'departure' ? { ...context, companion: run.companion } : context,
    currentEvent(pack, run).id, slot, actionId === null ? null : sourceChoiceId(actionId))
  return script ? renderCatalogScript(pack, run, script.id) : []
}
export function catalogLegacy(pack: CatalogPack, run: CatalogRun): import('../../domain/catalog').CatalogLegacy | null {
  if (run.phase !== 'ending') return null
  return {
    legacyId: `${run.runId}:legacy`, sourceRunId: run.runId, name: run.core.protagonist.name, traits: run.core.protagonist.traits,
    rescueDecision: run.core.flags.rescueDecision, judgmentCounts: run.judgmentCounts,
    // Keep approved representative slots; do not invent preferences from other events (D08).
    representativeActions: { E02: run.history.find(entry => entry.eventId === 'E02')?.actionId ?? null,
      E07: run.history.find(entry => entry.eventId === 'E07')?.actionId ?? null, E10: run.history.find(entry => entry.eventId === 'E10')?.actionId ?? null },
    ending: infectionState(run).protagonist ? 'infection-death' : run.result?.escape?.ending ?? 'escape-failed', rulesVersion: pack.manifest.rulesVersion, contentRevision: pack.manifest.revision,
    ...(pack.manifest.decisionMemoryVersion === 'context-1' ? { decisionMemory: decisionMemoryFor(run) } : {}),
  }
}
export function findCatalogChoice(pack: CatalogPack, eventId: string, actionId: string): CatalogChoice {
  const event = pack.events.find(item => item.id === eventId)
  const companion = event?.intervention?.mode === 'companion-choice' && actionId !== sourceChoiceId(actionId)
  const choice = event && allChoices(event).find(item => item.id === (companion ? sourceChoiceId(actionId) : actionId))
  if (!choice) throw new CatalogRuntimeError('content-invalid', '결과의 선택 정의가 없습니다.')
  return companion ? asCompanionChoice(choice) : choice
}
