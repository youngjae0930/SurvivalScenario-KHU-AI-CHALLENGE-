import { interventionPolicy } from '../../engine/catalog/intervention'
import type { ActionPreviewViewModel, AppSnapshot, ChoiceContext, FixedStageChoiceViewModel, GameViewModel } from '../../contracts'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { catalogDialogue, catalogAutonomyDeparture, catalogCommandOffer, catalogChoices, catalogContext, catalogGeneralRecommendation, catalogIntervention, catalogLegacy, catalogRecoveryOpinion, catalogRememberedChoice, currentEvent, currentGroup, findCatalogChoice, previewCatalogAction, renderCatalogScript } from '../../engine/catalog/runtime'
import { activeCatalogCompanion } from '../../engine/catalog/companion-journey'
import { companionJourneyCopy } from '../../content/texts/companion-journey'
import type { CatalogPreview } from '../../engine/catalog/runtime'
import { catalogInheritance } from '../../engine/catalog/inheritance'
import { catalogFirstExtreme, catalogReflection } from '../../engine/catalog/reflection'
import { reflectionCopy } from '../../content/texts/reflection'
import { generalRecommendationCopy, rememberedChoiceCopy } from '../../content/texts/recommendation'
import { usesNarrative, companionOpinion, companionHesitation, companionAfter, relationshipSummary, narrativeJourney } from '../../content/texts/companion-narrative'
import { recommendationResponsibility } from '../../content/texts/companion-responsibility'
import { extremeChanges, toActionPreview, toChange, toStatus } from './opening'
import { catalogVisitLimit } from '../../engine/catalog/slots'
import { infectionActor, infectionState } from '../../engine/catalog/infection'
import { companionActorState } from '../../engine/catalog/companion-vitals'
import { catalogTraitBounds } from '../../engine/catalog/traits'
import { infectionOutcome, infectionRisk } from '../../content/texts/infection'
import { historyResultSummary } from '../../content/texts/history-summary'
import { isStoryLineVisible } from '../../ui/story-copy'

const stageLabels = { early: '전반부', middle: '중반부', late: '후반부' }
const traitLabels = { risk: '모험–안정', cognition: '분석–직관', affect: '이성–감정' }
const signed = (value: number) => value > 0 ? `+${value}` : `${value}`
const trustLines = (change: CatalogPreview['trustChange'], narrative = false, authored = false) => change
  ? [`동료 신뢰 ${change.before} → ${change.after} (${signed(change.after - change.before)})`, ...(authored ? [] : [narrative ? relationshipSummary(change) : change.reason])] : []
const trustChanges = (change: CatalogPreview['trustChange']) => change
  ? [{ label: '동료 신뢰', text: `${change.before} → ${change.after} (${signed(change.after - change.before)})`, actualDelta: change.after - change.before }] : []
const companionChanges = (run: CatalogRun) => (run.result?.companionChange?.changes ?? []).map(change => ({ ...toChange(change), label: `동료 ${toChange(change).label}` }))
function extremeGuidance(run: CatalogRun, pack: CatalogPack): string[] {
  const first = catalogFirstExtreme(run, catalogTraitBounds(pack))
  return first && (first.resultId === null ? run.phase === 'choice' && run.history.length === 0 : run.result?.resultId === first.resultId)
    ? [reflectionCopy.firstExtreme] : []
}
function briefReflection(pack: CatalogPack, run: CatalogRun): string[] {
  const reflection = catalogReflection(run)
  return [
    `${reflectionCopy.risk[reflection.directions.risk]} ${reflectionCopy.affect[reflection.directions.affect]}`,
    `성향의 발자취 · ${(['risk', 'cognition', 'affect'] as const).map(axis => `${traitLabels[axis]} ${reflection.initial[axis]} → ${reflection.final[axis]}`).join(' / ')}`,
    ...reflection.representatives.map(item => `기억에 남은 선택 · ${findCatalogChoice(pack, item.eventId, item.actionId).label}`),
    `동료에게 이어질 특징 · ${(['risk', 'cognition', 'affect'] as const).map(axis => reflectionCopy.inherited[axis][reflection.directions[axis]]).join(' · ')}`,
  ]
}
export function catalogChoiceContext(pack: CatalogPack, run: CatalogRun): ChoiceContext {
  return { runId: run.runId, eventId: currentEvent(pack, run).id, stateRevision: run.revision, snapshotId: `${run.runId}:${pack.manifest.id}:${pack.manifest.revision}:${run.revision}` }
}
/** Derive only committed choices at visited fixed slots; existing run saves already preserve this evidence. */
export function catalogFixedStageHistory(pack: CatalogPack, run: CatalogRun): readonly FixedStageChoiceViewModel[] {
  const fixed = pack.manifest.slotPlan?.segments.flatMap(segment => segment.slots.filter(slot => slot.candidates.length === 1))
  if (!fixed) return []
  return run.route.slice(0, run.visitIndex + 1).flatMap((locationId, index) => {
    if (!fixed.some(slot => slot.number === index + 1 && slot.candidates[0] === locationId)) return []
    const entry = run.history.find(item => item.visitIndex === index)
    const location = pack.locations.find(item => item.id === locationId)!
    return [{ stageNumber: index + 1, locationId, locationName: location.name,
      actionLabel: entry ? findCatalogChoice(pack, entry.eventId, entry.actionId).label : null,
      resultText: entry ? [historyResultSummary(renderCatalogScript(pack, { ...run, visitIndex: index, core: entry.resolution.state }, entry.resultScriptId), entry.resultScriptId)] : [],
      outcome: entry?.resolution.check.outcome ?? null,
      actor: entry ? entry.execution?.actor === 'companion' || entry.actionId.startsWith('companion:') ? 'companion' as const : 'protagonist' as const : null,
      current: index === run.visitIndex }]
  })
}
export function catalogPresentation(pack: CatalogPack, run: CatalogRun | null): AppSnapshot['presentation'] {
  return {
    edition: pack.manifest.title,
    journey: run ? Array.from({ length: pack.manifest.slotPlan ? catalogVisitLimit(pack) : run.route.length }, (_, index) => {
      const id = run.route[index]
      if (!id) {
        const segment = pack.manifest.slotPlan!.segments.find(segment => segment.slots.some(slot => slot.number === index + 1))!
        return { id: `pending-slot-${index + 1}`, label: `${stageLabels[segment.stage]} · 경로 선택 후 결정`, state: 'upcoming' as const }
      }
      const location = pack.locations.find(item => item.id === id)!
      return { id, label: index <= run.visitIndex ? location.name : `${stageLabels[location.stage]} · 이동 예정`, state: index < run.visitIndex || run.phase === 'segment-complete' ? 'visited' : index === run.visitIndex ? 'current' : 'upcoming' }
    }) : [],
  }
}
export function catalogPreviewView(pack: CatalogPack, run: CatalogRun, preview: CatalogPreview, token: string): ActionPreviewViewModel {
  const separate = !!pack.manifest.companionStateVersion
  const companionActor = separate && infectionActor(preview.choice.id, preview.executionActor ?? 'protagonist') === 'companion'
  const state = companionActor ? companionActorState(run) : run.core
  const base = toActionPreview(state, catalogChoiceContext(pack, run), { ...preview, selection: { actionId: preview.choice.id, treat: preview.treat }, goalId: preview.choice.goalId }, preview.choice, token)
  const prefix = (line: string) => companionActor && /^(스태미나|스트레스|부상)/.test(line) ? `동료 ${line}` : line
  const view = { ...base, costs: base.costs.map(prefix), outcomes: { success: base.outcomes.success.map(prefix), failure: base.outcomes.failure.map(prefix) },
    warnings: base.warnings.map(line => companionActor ? line.replace('세 번째 부상으로 여정이 종료됩니다.', '세 번째 부상으로 동료가 사망합니다. 주인공은 계속 진행할 수 있습니다.') : line) }
  const departure = preview.executionActor === 'companion' ? null : catalogAutonomyDeparture(pack, run, preview.choice.id)
  const offer = catalogCommandOffer(pack, run, preview.choice.id)
  const execution = offer && run.companion ? { actor: preview.executionActor ?? 'protagonist', role: offer.policy.role,
    options: [{ actor: 'protagonist' as const, label: separate && preview.choice.behavior.kind === 'recovery' ? '나를 정비' : '직접 실행', availability: { kind: 'available' as const } },
      { actor: 'companion' as const, label: separate && preview.choice.behavior.kind === 'recovery' ? '동료를 정비' : `동료에게 ${offer.policy.role} 맡기기`, availability: offer.allowed ? { kind: 'available' as const } : { kind: 'locked' as const, reasons: offer.reasons } }] } : undefined
  const authored = pack.manifest.dialogueVersion === 'scripts-1'
  const warnings = [...infectionRisk(run, preview.infectionDeathsOnFailure ?? []), ...(departure && run.companion ? authored ? catalogDialogue(pack, run, 'departure-warning', preview.choice.id) : [...(departure.reason ? [departure.reason] : []), (usesNarrative(pack) ? narrativeJourney : companionJourneyCopy).warning(run.companion.name)] : []),
    ...(preview.executionActor === 'companion' && offer ? separate ? ['동료의 개별 체력·스트레스·부상을 사용합니다. 물자와 치료 도구는 공용입니다.']
      : [`동료 선행 실행 · ${offer.policy.sharedRisk}`, '비용·성공률·피해는 직접 실행과 같습니다. 동료를 보내도 주인공의 위험은 사라지지 않습니다.'] : [])]
  if (preview.choice.behavior.kind === 'escape') {
    return { ...view, risk: { kind: 'certain', explanation: '현재 상태와 공개된 조건으로 결정합니다. 새 성공/실패 추첨은 없습니다.' },
      outcomes: { success: [...view.outcomes.success, ...trustLines(preview.trustOutcomes?.success, usesNarrative(pack), pack.manifest.dialogueVersion === 'scripts-1')], failure: [] } }
  }
  return { ...view, ...(execution ? { execution } : {}),
    ...(separate && preview.choice.behavior.kind === 'recovery' && preview.choice.behavior.choice === 'maintain'
      ? { treatmentAvailability: state.protagonist.injury > 0 && state.protagonist.injury < 3 && run.core.inventory.medkit > 0 && (!companionActor || !!activeCatalogCompanion(run))
        ? { kind: 'available' as const } : { kind: 'locked' as const, reasons: ['선택한 사람에게 치료할 부상이 있고 치료 도구가 있어야 합니다. 사망한 동료는 치료할 수 없습니다.'] } } : {}),
    ...(preview.executionActor === 'companion' && offer ? { participation: { kind: offer.allowed ? 'cooperate' as const : 'refuse' as const,
      explanation: offer.allowed ? separate ? '동료가 자신의 상태로 행동하며 신체 소모와 피해를 감수합니다.' : '동료가 선행 실행을 맡습니다. 주인공도 공동 위험을 감수합니다.' : offer.reasons.join(' '), contribution: ['별도의 성공률 보너스는 없습니다.'] } } : {}),
    warnings: [...view.warnings, ...warnings], outcomes: {
    success: [...view.outcomes.success, ...trustLines(preview.trustOutcomes?.success ?? preview.trustChange, usesNarrative(pack), pack.manifest.dialogueVersion === 'scripts-1'), ...Object.keys(preview.choice.successFacts).map(() => '이후 사건의 이야기 조건 변화')],
    failure: [...view.outcomes.failure, ...infectionRisk(run, preview.infectionDeathsOnFailure ?? []), ...trustLines(preview.trustOutcomes?.failure, usesNarrative(pack), pack.manifest.dialogueVersion === 'scripts-1'), ...Object.keys(preview.choice.failureFacts).map(() => '이후 사건의 이야기 조건 변화')],
  } }
}
export function catalogGameView(pack: CatalogPack, run: CatalogRun, nextRunAllowed = false): GameViewModel {
  const companion = activeCatalogCompanion(run)
  const narrative = usesNarrative(pack)
  const authored = pack.manifest.dialogueVersion === 'scripts-1'
  const journeyCopy = narrative ? narrativeJourney : companionJourneyCopy
  const infected = infectionState(run)
  const companionDead = infected.companion || (run.companionVitals?.injury ?? 0) >= 3
  const journeyNotices = companionDead ? [pack.manifest.companionStateVersion ? `동료가 ${infected.companion ? '감염' : '치명적인 부상'}으로 세상을 떠났다. 당신은 혼자 길을 이어갈 수 있다.`
    : `${run.companion!.name}은(는) 감염으로 세상을 떠났다. 이제 혼자 길을 이어가야 한다.`] : run.companionJourney?.separation && run.companion ? (authored ? catalogDialogue(pack, run, 'absent') : [journeyCopy.absent(run.companion.name)])
    : run.companion && run.companionJourney?.reunions.at(-1)?.visitIndex === run.visitIndex ? (authored ? catalogDialogue(pack, run, 'reunion') : [journeyCopy.reunion(run.companion.name)]) : []
  const status = { ...toStatus(run.core, catalogTraitBounds(pack)), ...(run.companion && run.companionVitals ? { companion: { name: run.companion.name, ...run.companionVitals,
    state: companionDead ? 'dead' as const : run.companionJourney?.separation ? 'separated' as const : 'present' as const,
    ...(companionDead ? { deathCause: infected.companion ? 'infection' as const : 'injury' as const } : {}) } } : {}), ...(pack.manifest.infectionVersion ? { infection: {
    protagonist: infected.protagonist ? 'dead' as const : 'clear' as const,
    companion: run.companion ? { name: run.companion.name, status: infected.companion ? 'dead' as const : 'clear' as const } : null,
  } } : {}) }
  const outcomeText = run.result?.infectionDeaths?.length ? [...infectionOutcome(run, run.result.infectionDeaths),
    ...(pack.manifest.reactionVersion === 'contextual-1' ? catalogDialogue(pack, run, 'infection-ending', run.result.actionId) : [])]
    : run.result?.companionChange ? [(run.companionVitals?.injury ?? 0) >= 3 ? '동료가 행동 중 치명적인 부상을 입고 숨졌다. 당신의 여정은 계속된다.'
      : run.result.treat ? '치료 도구로 동료의 상처를 처치하고 몸을 정비했다.'
        : run.result.resolution.check.outcome === 'failure' ? run.result.companionChange.after.injury > run.result.companionChange.before.injury
          ? '동료가 행동 중 다쳤다. 당신은 퇴로를 지켰다.' : '동료가 행동에 실패하고 돌아왔다. 당신은 다음 이동을 준비했다.'
          : run.result.execution?.role === '정비와 치료' ? '동료가 몸과 장비를 정비했다.' : '동료가 앞장선 행동을 마쳤다. 당신은 뒤에서 다음 이동을 준비했다.']
      : run.result ? renderCatalogScript(pack, run, run.result.resultScriptId) : []
  const context = catalogChoiceContext(pack, run)
  const location = catalogContext(pack, run).location
  const event = currentEvent(pack, run)
  const fixedStageHistory = catalogFixedStageHistory(pack, run)
  if (run.phase === 'segment-complete') return { kind: 'segment-complete', title: pack.manifest.boundary.title,
    text: pack.manifest.boundary.text, completedEventIds: run.visits.map(visit => visit.eventId), nextEventId: pack.manifest.boundary.nextEventId, continuation: null, status }
  if (run.phase === 'ending' && run.result) {
    const legacy = catalogLegacy(pack, run)!
    const ending = legacy.ending
    const inherited = catalogInheritance(pack, run)!
    const title = ending === 'tunnel-escape' ? '지하터널 탈출 · 어둠 너머의 새벽' : ending === 'outskirts-escape' ? '도시 외곽 탈출 · 차단선 너머로' : ending === 'cure-discovery' ? '치료제 발견 · 이어지는 생존' : ending === 'infection-death' ? '감염 · 끝나 버린 여정' : ending === 'data-and-escape' ? '자료를 지니고 도시를 벗어났다' : ending === 'escape' ? '도시를 벗어났다' : run.result.escape ? '구조를 기다리며' : '도시를 벗어나지 못했다'
    return { kind: 'ending', runId: run.runId, resultId: run.result.resultId, ending, title, fixedStageHistory,
      text: [...(run.result.execution && !authored ? [narrative ? `동료가 앞을 살피는 동안 당신은 퇴로를 지켰다.` : `동료가 ${run.result.execution.role}에 앞장섰다. ${run.result.execution.sharedRisk}`] : []), ...outcomeText, ...(narrative && companion && !run.result.infectionDeaths?.length ? companionAfter(findCatalogChoice(pack, run.result.eventId, run.result.actionId), run.result, true) : !authored && run.result.trustChange ? [run.result.trustChange.reason] : []), ...(!run.result.escape && ending !== 'infection-death' ? ['상처가 겹쳐 더는 이동을 이어갈 수 없었다. 이번 여정은 여기서 끝난다.'] : []), ...(pack.manifest.presentationVersion ? extremeGuidance(run, pack) : [])],
      changes: [...run.result.resolution.changes.map(toChange), ...companionChanges(run), ...trustChanges(run.result.trustChange)], status,
      legacySummary: pack.manifest.presentationVersion ? briefReflection(pack, run) : [`${legacy.name}의 최종 성향과 실제 선택 기록을 남겼습니다.`, `실제 도달 사건 ${run.history.length}개의 선택을 기록했습니다. 미도달 사건은 미기록입니다.`,
        ...(['E02', 'E07', 'E10'] as const).flatMap(id => { const actionId = legacy.representativeActions[id]; return actionId ? [`${id} · ${findCatalogChoice(pack, id, actionId).label}`] : [] }),
        `다음 동료에게 이어질 성향 · 모험–안정 ${inherited.companion.traits.risk} / 분석–직관 ${inherited.companion.traits.cognition} / 이성–감정 ${inherited.companion.traits.affect}`,
        `판단 기록 · 구조 ${inherited.judgmentCounts.rescue}회 / 자기 우선 ${inherited.judgmentCounts.self}회. 기록이 없는 사건은 거절로 세지 않습니다.`,
        '다음 동료는 이 판단 방식을 반영하는 별개의 살아 있는 인물입니다. 이전 인물의 죽음이나 탈출 경험을 기억하지 않습니다.',
        '다음 회차의 신뢰는 50에서 시작합니다. 주인공의 설문·체력·스트레스·물자·부상·통로 정보는 새로 시작합니다.'
      ],
      newRun: nextRunAllowed ? { kind: 'available' } : { kind: 'locked', reasons: ['현재 버전은 결말 기록을 유지합니다. 새 회차 시작은 아직 제공하지 않습니다.'] } }
  }
  if (run.phase === 'result' && run.result) {
    const result = run.result
    const choice = findCatalogChoice(pack, result.eventId, result.actionId)
    const nextLocation = pack.locations.find(item => item.id === run.route[run.visitIndex + 1])
    return { kind: 'result', context, resultId: result.resultId, actionLabel: choice.label, outcome: result.resolution.check.outcome, fixedStageHistory,
      text: [...(result.execution && !authored ? [narrative ? '동료가 앞을 살피는 동안 당신은 퇴로를 지켰다.' : `동료가 ${result.execution.role}에 앞장섰다. ${result.execution.sharedRisk}`] : []), ...outcomeText, ...(result.treat && !result.companionChange ? ['치료 도구를 사용해 상처를 처치했다.'] : []),
        ...(narrative && companion && !result.companionDeparture && !result.infectionDeaths?.length ? companionAfter(choice, result) : []),
        ...(pack.manifest.reactionVersion === 'contextual-1' ? catalogDialogue(pack, run, 'recommendation-failure', result.actionId)
          : pack.manifest.reactionVersion && companion ? recommendationResponsibility(result) : []),
        ...(result.companionDeparture && run.companion ? authored ? catalogDialogue(pack, run, 'departure', result.actionId) : [...(result.companionDeparture.reason ? [result.companionDeparture.reason] : []), journeyCopy.departure(run.companion.name)] : [])],
      changes: [...result.resolution.changes.map(toChange), ...companionChanges(run), ...trustChanges(result.trustChange)],
      trustReasons: !authored && result.trustChange ? [narrative ? relationshipSummary(result.trustChange) : result.trustChange.reason] : [], consequences: pack.manifest.presentationVersion ? extremeGuidance(run, pack) : extremeChanges(result.resolution.changes), status,
      nextEventId: null, nextLabel: nextLocation ? `다음 장소 · ${nextLocation.name}` : '현재 등록된 구간의 마지막 결과입니다.', completesSegment: !nextLocation }
  }
  if (run.phase !== 'choice') throw new Error('현재 장면을 표시할 수 없습니다.')
  const group = currentGroup(pack, run)
  const intervention = catalogIntervention(pack, run)
  const remembered = catalogRememberedChoice(pack, run)
  const general = remembered ? { kind: 'inactive' as const } : catalogGeneralRecommendation(pack, run)
  const generalCopy = generalRecommendationCopy(general)
  const rememberedCopy = remembered ? rememberedChoiceCopy(remembered.choice.label, remembered.treat) : null
  const opinion = (remembered && rememberedCopy ? { choice: remembered.choice, source: 'fallback' as const, ...rememberedCopy,
    reason: rememberedCopy.reason + (remembered.actor === 'companion' ? ' 이전에는 동료에게 맡겼던 행동입니다. 실행 주체는 직접 선택할 수 있습니다.' : '') } : null)
    ?? intervention ?? catalogRecoveryOpinion(pack, run) ?? (general.kind === 'ready' && generalCopy?.kind === 'ready'
    ? { choice: general.choice, source: general.value === 50 ? 'fallback' as const : 'trait' as const, text: generalCopy.text, reason: generalCopy.reason } : null)
  const previous = run.history.at(-1)
  const treatmentActionIds = group.choices.filter(choice => choice.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain').map(choice => choice.id)
  const scene = run.visits[run.visitIndex].sceneScriptId
  return { kind: 'choice', context, title: event.title, fixedStageHistory, notices: [...(narrative || authored ? [] : journeyNotices), ...(intervention ? interventionPolicy(event, group.id)!.notices : group.notices), ...(pack.manifest.presentationVersion ? extremeGuidance(run, pack) : []), ...(generalCopy?.kind === 'withheld' ? authored ? catalogDialogue(pack, run, 'hesitation') : [narrative && general.kind === 'withheld' ? companionHesitation(general.reason) : generalCopy.notice] : [])], status,
    story: [...(narrative || authored ? journeyNotices : []), ...renderCatalogScript(pack, run, scene).filter(isStoryLineVisible).map(line => line.replace('남쪽으로 빠져나간다는 마지막 연락을 다시 읽는다.', '대피소에서 사람들을 모으고 있다는 마지막 연락을 다시 읽는다.'))].map((text, index) => ({ key: { textId: `${scene}.${index}`, contentRevision: pack.manifest.revision, contextVariantId: `${location.id}:${run.visitIndex}` }, text, collapsible: false, initiallyCollapsed: false })),
    companion: companion ? { kind: 'present', name: companion.name, trust: companion.trust,
      opinion: opinion ? { kind: 'ready', actionId: opinion.choice.id, goalId: opinion.choice.goalId, text: authored ? catalogDialogue(pack, run, 'opinion', opinion.choice.id).join(' ') || opinion.text : narrative ? companionOpinion(opinion.choice, opinion.text) : opinion.text, reason: narrative || authored ? '' : opinion.reason, source: opinion.source }
        : { kind: 'not-applicable' } } : { kind: 'absent' },
    actions: catalogChoices(pack, run).map(choice => {
      const preview = previewCatalogAction(pack, run, choice.id)
      return { actionId: choice.id, goalId: choice.goalId, label: choice.label, intention: choice.intention, availability: preview.allowed ? { kind: 'available' } : { kind: 'locked', reasons: preview.reasons }, recommended: opinion?.choice.id === choice.id, requiresCompanion: intervention?.choice.id === choice.id || preview.action.requires.companion === true }
    }), treatmentActionIds,
    treatment: treatmentActionIds.length && status.injury > 0 && status.medkit > 0 ? { kind: 'available' } : { kind: 'locked', reasons: ['치료는 부상과 치료 도구가 있는 정비 선택에서만 가능합니다.'] },
    recentResult: previous ? { label: findCatalogChoice(pack, previous.eventId, previous.actionId).label, text: previous.resolution.changes.filter(change => !toChange(change).traitAxis).map(change => `${toChange(change).label} ${toChange(change).text}`) } : null,
  }
}
