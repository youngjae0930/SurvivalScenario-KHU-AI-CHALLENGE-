import type { CatalogChoice, CatalogEvent, CatalogPack, Condition } from '../../domain/catalog'
import { packSchema, savedPackSchema, validateShape } from '../../content/catalog/schema'
import { isCoreAction } from '../actions'
import { planRoute } from './route'
import { previewCoreAction } from '../actions'
import { validateSlotPlan } from './slots'

export class ContentError extends Error {
  readonly issues: readonly string[]
  constructor(issues: readonly string[]) { super(issues.slice(0, 12).join('\n')); this.issues = issues }
}
const compareId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
export function eventFits(event: CatalogEvent, location: CatalogPack['locations'][number]): boolean {
  return event.locationIds.includes(location.id) || event.locationTags.some(tag => location.tags.includes(tag))
}
export function allChoices(event: CatalogEvent): CatalogChoice[] { return event.groups.flatMap(group => [...group.choices]) }

/** Closed vocabulary, cross references, unconditional fallbacks and route feasibility. */
export function compileCatalog(input: unknown, options: { allowLegacyChoices?: boolean } = {}): CatalogPack {
  const shapeErrors = validateShape(options.allowLegacyChoices ? savedPackSchema : packSchema, input)
  if (shapeErrors.length) throw new ContentError(shapeErrors)
  const pack = structuredClone(input) as CatalogPack
  const issues: string[] = []
  const check = (condition: boolean, message: string) => { if (!condition) issues.push(message) }
  const unique = (ids: readonly string[], path: string) => check(new Set(ids).size === ids.length, `${path}: 중복 ID가 있습니다.`)
  unique(pack.locations.map(item => item.id), 'locations'); unique(pack.events.map(item => item.id), 'events'); unique(pack.scripts.map(item => item.id), 'scripts'); unique(pack.manifest.facts, 'facts')
  const locations = new Map(pack.locations.map(location => [location.id, location]))
  const events = new Map(pack.events.map(event => [event.id, event]))
  const facts = new Set(pack.manifest.facts)
  const opportunities = new Set(pack.manifest.opportunities?.map(p => p.id))
  if (pack.manifest.reactionVersion) check(pack.manifest.dialogueVersion === 'scripts-1', 'reactionVersion: 동료 대사 버전이 필요합니다.')
  if (pack.manifest.opportunities) {
    check(pack.manifest.researchVersion === 'research-1' && pack.manifest.routeVersion === 'slots-1', 'opportunities: research-1/slots-1이 필요합니다.')
    unique(pack.manifest.opportunities.map(p => p.id), 'opportunities')
    for (const policy of pack.manifest.opportunities) for (const tag of policy.locationTags)
      check(pack.locations.some(l => l.tags.includes(tag) && l.enabled !== false), `opportunity ${policy.id}: 활성 장소 태그가 없습니다: ${tag}`)
  }
  if (pack.manifest.routeVersion === 'slots-1') issues.push(...validateSlotPlan(pack))
  else check(!pack.manifest.slotPlan && pack.events.every(event => allChoices(event).every(choice => !choice.destinationSegmentId)), 'slotPlan/목적지에는 slots-1 경로 버전이 필요합니다.')
  if (pack.manifest.decisionEcho) {
    check(pack.manifest.decisionMemoryVersion === 'context-1' && pack.manifest.recommendationVersion === 'survival-1', 'decisionEcho: 상황 기록과 일반 추천 버전이 필요합니다.')
    unique(pack.manifest.decisionEcho.compatibleRevisions, 'decisionEcho.compatibleRevisions')
    check(pack.manifest.decisionEcho.compatibleRevisions.includes(pack.manifest.revision), 'decisionEcho: 현재 콘텐츠 revision을 포함해야 합니다.')
  }
  if (pack.manifest.trustVersion) check(pack.manifest.recommendationVersion === 'survival-1', 'trust: 성향 평가에는 일반 추천 버전이 필요합니다.')
  if (pack.manifest.autonomyVersion === 'journey-2') check(pack.manifest.trustVersion === 'outcome-1', 'journey-2: 결과 기반 신뢰 버전이 필요합니다.')
  check(!!pack.manifest.recommendationVersion || pack.events.every(event => !event.recommendation && allChoices(event).every(choice => !choice.pace)),
    'recommendation: 추천 메타데이터는 manifest.recommendationVersion이 필요합니다.')
  if (pack.manifest.recommendationVersion) for (const event of pack.events) {
    check(!!event.recommendation || allChoices(event).some(choice => choice.behavior.kind === 'recovery'), `event ${event.id}: 일반 추천의 성향축이 필요합니다.`)
  }
  const stages = ['early', 'middle', 'late']
  check(pack.manifest.stages.every((stage, index) => stage.id === stages[index] && stage.minVisits <= stage.maxVisits), 'stages: early/middle/late 순서와 최소/최대 방문 수를 확인하세요.')
  check(pack.manifest.stages[0].minVisits >= 1, 'stages: 시작 구간은 최소 1개 장소가 필요합니다.')
  const start = locations.get(pack.manifest.startLocationId)
  check(!!start && start.stage === 'early' && start.required && start.after.length === 0, 'startLocationId: 전반부의 필수 장소이며 선행 조건이 없어야 합니다.')
  if (pack.manifest.routeVersion === 'stages-1') for (const stage of pack.manifest.stages) {
    const active = pack.locations.filter(location => location.stage === stage.id && location.enabled !== false)
    check(active.length >= stage.minVisits && active.filter(location => location.required).length <= stage.maxVisits,
      `stage ${stage.id}: 활성 장소 수·필수 장소 수와 최소/최대 방문 수가 맞지 않습니다.`)
  }
  const verifyConditions = (conditions: readonly Condition[], path: string) => {
    for (const condition of conditions) {
      if (condition.kind === 'opportunity') check(opportunities.has(condition.id), `${path}: 선언하지 않은 opportunity ${condition.id}`)
      if (condition.kind === 'number' || condition.kind === 'resource') check(condition.min <= condition.max, `${path}: min > max`)
      if (condition.kind === 'resource') check(condition.max <= (condition.resource === 'medkit' ? 2 : 3), `${path}: 자원 보유 상한을 벗어난 조건입니다.`)
      if (condition.kind === 'number' && condition.stat === 'injury') check(condition.max <= 3, `${path}: 부상 상한은 3입니다.`)
      if (condition.kind === 'number') check(condition.subject === 'companion' ? ['risk', 'cognition', 'affect', 'trust'].includes(condition.stat) : condition.stat !== 'trust', `${path}: 해당 주체에 없는 파라미터입니다.`)
      if (condition.kind === 'visited') check(locations.has(condition.locationId), `${path}: 없는 장소 ${condition.locationId}`)
      if (condition.kind === 'fact') check(facts.has(condition.id), `${path}: 선언하지 않은 fact ${condition.id}`)
    }
  }
  for (const segment of pack.manifest.slotPlan?.segments ?? []) {
    if (segment.entry) {
      verifyConditions(segment.entry.conditions, `segment ${segment.id}.entry`)
      check(segment.id !== pack.manifest.slotPlan!.startSegmentId, '시작 구간에는 진입 조건을 지정할 수 없습니다.')
    }
  }
  for (const location of pack.locations) {
    check(location.enabled === undefined || !!pack.manifest.routeVersion, `location ${location.id}: 활성 여부에는 경로 버전이 필요합니다.`)
    check(pack.manifest.routeVersion === 'slots-1' || location.enabled !== false || !location.required, `location ${location.id}: 필수 장소는 비활성화할 수 없습니다.`)
    unique(location.tags, `location ${location.id}.tags`); unique(location.after, `location ${location.id}.after`)
    for (const id of location.after) check(id !== location.id && locations.has(id) && stages.indexOf(locations.get(id)!.stage) <= stages.indexOf(location.stage), `location ${location.id}: 잘못된 선행 장소 ${id}`)
    check(pack.events.some(event => eventFits(event, location) && event.conditions.length === 0), `location ${location.id}: 조건 없는 기본 사건이 필요합니다.`)
  }
  for (const event of pack.events) {
    const terminal = allChoices(event).some(choice => choice.behavior.kind === 'escape')
    if (terminal && event.recommendation) check(event.recommendation.axis === 'risk', `event ${event.id}: 탈출 추천의 성향축은 risk여야 합니다.`)
    if (terminal) {
      check(allChoices(event).every(choice => choice.behavior.kind === 'escape' && choice.judgment === null && Object.keys(choice.successFacts).length === 0 && Object.keys(choice.failureFacts).length === 0), `event ${event.id}: 탈출 사건에는 탈출 행동만 정의하며 판단 집계/fact를 변경하지 않습니다.`)
      check(pack.locations.filter(location => eventFits(event, location)).every(location => location.stage === 'late' && location.required), `event ${event.id}: 탈출은 후반부 필수 장소에만 연결합니다.`)
    }
    check(event.locationIds.length + event.locationTags.length > 0, `event ${event.id}: 장소 대상이 필요합니다.`)
    event.locationIds.forEach(id => check(locations.has(id), `event ${event.id}: 없는 장소 ${id}`))
    verifyConditions(event.conditions, `event ${event.id}`)
    if (event.autonomy) {
      const policy = event.autonomy
      check(!!pack.manifest.autonomyVersion && pack.manifest.recommendationVersion === 'survival-1' && !terminal,
        `event ${event.id}: 자율 행동 버전·추천이 필요하며 탈출 사건에는 지정할 수 없습니다.`)
      if (policy.conflicts) {
        check(pack.manifest.autonomyVersion === 'journey-2', `event ${event.id}: 목표 갈등에는 journey-2가 필요합니다.`)
        unique(policy.conflicts.map(conflict => `${conflict.playerGoalId}/${conflict.companionGoalId}`), `event ${event.id}.autonomy.conflicts`)
        for (const conflict of policy.conflicts) check(conflict.playerGoalId !== conflict.companionGoalId
          && [conflict.playerGoalId, conflict.companionGoalId].every(goal => allChoices(event).some(choice => choice.goalId === goal)),
        `event ${event.id}: 이별 갈등은 서로 다른 실제 목표를 참조해야 합니다.`)
      } else {
        check(pack.manifest.autonomyVersion === 'journey-1', `event ${event.id}: journey-2에는 명시적 이별 갈등이 필요합니다.`)
        check(policy.playerJudgment !== policy.companionJudgment, `event ${event.id}: 자율 행동에는 서로 다른 판단이 필요합니다.`)
        check(allChoices(event).some(choice => choice.judgment === policy.playerJudgment)
          && allChoices(event).some(choice => choice.judgment === policy.companionJudgment), `event ${event.id}: 양쪽 판단의 행동이 필요합니다.`)
      }
      verifyConditions(policy.conditions, `event ${event.id}.autonomy`)
      verifyConditions(policy.reunion.conditions, `event ${event.id}.autonomy.reunion`)
      unique(policy.reunion.locationTags, `event ${event.id}.autonomy.reunion.locationTags`)
      for (const tag of policy.reunion.locationTags) check(pack.locations.some(location => location.tags.includes(tag)), `event ${event.id}: 재회 장소 태그가 없습니다: ${tag}`)
    }
    unique(event.groups.map(group => group.id), `event ${event.id}.groups`)
    check(event.groups.filter(group => group.conditions.length === 0).length === 1, `event ${event.id}: 기본 그룹은 정확히 하나 필요합니다.`)
    if (event.intervention) {
      const policy = event.intervention
      const group = event.groups.find(item => item.id === policy.groupId)
      check(!terminal && !!group && group.choices.length >= 2, `event ${event.id}: 동료 선택 그룹에는 본인 행동과 동료 슬롯이 필요합니다.`)
      check(!!group?.conditions.some(condition => condition.kind === 'number' && condition.subject === 'protagonist' && condition.stat === policy.axis
        && (policy.extremePole === 'left' ? condition.min === 0 && condition.max === 22 : condition.min === 78 && condition.max === 100)), `event ${event.id}: 제지 축/극이 그룹 발동 조건과 다릅니다.`)
      check(!!group?.choices.some(choice => choice.id === policy.replaceChoiceId), `event ${event.id}: 교체할 선택이 없습니다.`)
      if (policy.mode === 'companion-choice') check(group?.choices.find(choice => choice.id === policy.replaceChoiceId)?.behavior.kind === 'action',
        `event ${event.id}: 기본 동료 선택은 일반 행동이어야 합니다.`)
      check(!!group && new Set(group.choices.map(choice => choice.goalId)).size === 1, `event ${event.id}: 제지 전 극단 그룹은 한 목표여야 합니다.`)
      unique(policy.alternatives.map(ref => ref.groupId), `event ${event.id}.intervention`)
      for (const ref of policy.alternatives) {
        const source = event.groups.find(item => item.id === ref.groupId)
        const alternative = source?.choices.find(choice => choice.id === ref.choiceId)
        check(ref.groupId !== policy.groupId && !!alternative && alternative.behavior.kind === 'action' && alternative.goalId !== group?.choices[0]?.goalId,
          `event ${event.id}: 반대 목표의 기존 일반 행동을 참조해야 합니다.`)
      }
      check(!!group?.choices.some(choice => choice.id !== policy.replaceChoiceId && choice.behavior.kind === 'action' && choice.behavior.variants.some(variant =>
        variant.conditions.length === 0 && Object.keys(variant.action.requires).length === 0 && variant.action.costs.supply === 0 && variant.action.costs.medkit === 0)), `event ${event.id}: 제지 뒤에도 무자원 극단 행동이 필요합니다.`)
    }
    const seen = new Map<string, string>()
    for (const group of event.groups) {
      verifyConditions(group.conditions, `group ${event.id}/${group.id}`)
      unique(group.choices.map(choice => choice.id), `group ${group.id}.choices`)
      if (terminal) for (const route of ['short', 'detour', 'request']) {
        check(group.choices.some(choice => choice.behavior.kind === 'escape' && choice.behavior.route === route), `group ${event.id}/${group.id}: 탈출 경로 ${route}가 필요합니다.`)
      }
      for (const choice of group.choices) {
        if (choice.ending) {
          check(choice.behavior.kind === 'escape' && (pack.manifest.endingVersion === 'routes-1'
            || (choice.ending.kind === 'cure-discovery' && pack.manifest.researchVersion === 'research-1')), `choice ${choice.id}: 조건부 결말에는 호환되는 결말 버전과 탈출 행동이 필요합니다.`)
          verifyConditions(choice.ending.conditions, `choice ${choice.id}.ending`)
        }
        if (choice.infection) {
          check(pack.manifest.infectionVersion === 'immediate-1', `choice ${choice.id}: 감염 버전이 필요합니다.`)
          check(choice.behavior.kind === 'action' && choice.behavior.variants.every(v => v.action.check !== null), `choice ${choice.id}: 감염 노출에는 실패 가능한 행동만 사용할 수 있습니다.`)
          check(!choice.destinationSegmentId, `choice ${choice.id}: 경로 선택에 감염 노출을 지정할 수 없습니다.`)
          check(choice.infection.every(c => c.source !== c.target), `choice ${choice.id}: 자기 자신에게 전염시킬 수 없습니다.`)
        }
        if (choice.relationship) check(pack.manifest.trustVersion === 'outcome-1', `choice ${choice.id}: 결과 기반 신뢰 버전이 필요합니다.`)
        if (choice.execution) {
          check(pack.manifest.executionVersion === 'command-1', `choice ${choice.id}: 동료 명령 버전이 필요합니다.`)
          check(choice.behavior.kind === 'action', `choice ${choice.id}: 정비·탈출에는 동료 선행 실행을 지정할 수 없습니다.`)
          verifyConditions(choice.execution.conditions, `choice ${choice.id}.execution`)
        }
        const encoded = JSON.stringify(choice)
        check(!seen.has(choice.id) || seen.get(choice.id) === encoded, `event ${event.id}: 같은 선택 ID의 정의가 다릅니다: ${choice.id}`)
        seen.set(choice.id, encoded)
        Object.keys({ ...choice.successFacts, ...choice.failureFacts }).forEach(id => check(facts.has(id), `choice ${choice.id}: 선언하지 않은 fact ${id}`))
        if (choice.behavior.kind === 'action') {
          check(choice.behavior.variants.filter(variant => variant.conditions.length === 0).length === 1, `choice ${choice.id}: 마지막 기본 variant가 필요합니다.`)
          check(choice.behavior.variants.at(-1)?.conditions.length === 0, `choice ${choice.id}: 기본 variant는 마지막이어야 합니다.`)
          for (const variant of choice.behavior.variants) {
            verifyConditions(variant.conditions, `choice ${choice.id}`)
            check(isCoreAction(variant.action) && variant.action.id === choice.id, `choice ${choice.id}: 행동 규칙/ID가 올바르지 않습니다.`)
            check(variant.action.eventId !== 'E12', `choice ${choice.id}: E12는 escape behavior로 연결해야 합니다.`)
            const action = variant.action
            check([...action.successEffects, ...action.failureEffects].every(effect => effect.kind !== 'add' || !['supply', 'medkit'].includes(effect.stat) || effect.amount >= 0), `choice ${choice.id}: 물자 소모는 effects 대신 costs에 작성하세요.`)
            const tested = previewCoreAction({ action, eventId: action.eventId, phase: 'choice', companionPresent: action.requires.companion ?? false, cooperating: false,
              state: { protagonist: { name: '콘텐츠 검증', stress: 30, stamina: 100, injury: 0, traits: { risk: 50, cognition: 50, affect: 50 } },
                inventory: { supply: 3, medkit: 2, weapon: action.requires.weapon ?? false },
                flags: { access: false, data: false, helpEstablished: false, routeKnown: false, rescueDecision: null, ...action.requires.flags } } })
            check(tested.ok, `choice ${choice.id}: 효과 충돌 또는 잘못된 판정입니다.${tested.ok ? '' : ` ${tested.error.message}`}`)
          }
        }
      }
      // A group must always offer a resource-free action, even at stamina 0.
      check(group.choices.some(choice => choice.behavior.kind === 'escape' ? choice.behavior.route === 'request' : choice.behavior.kind === 'recovery' ? choice.behavior.choice === 'maintain' : choice.behavior.variants.some(variant =>
        variant.conditions.length === 0 && Object.keys(variant.action.requires).length === 0 && variant.action.costs.supply === 0 && variant.action.costs.medkit === 0)), `group ${event.id}/${group.id}: 무자원 기본 행동이 필요합니다.`)
    }
    const fallback = (slot: string, choiceId: string | null) => check(pack.scripts.some(script => script.eventId === event.id && script.choiceId === choiceId && script.slot === slot && script.conditions.length === 0 && !script.once), `event ${event.id}/${choiceId ?? 'scene'}/${slot}: 반복 가능한 기본 문구가 필요합니다.`)
    fallback('scene', null)
    for (const choice of allChoices(event)) { fallback('success', choice.id); if (choice.behavior.kind === 'action' && choice.behavior.variants.some(variant => variant.action.check !== null)) fallback('failure', choice.id) }
    if (pack.manifest.dialogueVersion === 'scripts-1') for (const choice of allChoices(event)) {
      check(pack.scripts.some(script => script.eventId === event.id && script.slot === 'opinion' && script.choiceId === choice.id
        && script.conditions.length === 1 && script.conditions[0].kind === 'companion' && script.conditions[0].present),
      `event ${event.id}: 선택 ${choice.id}에 기본 동행 의견이 필요합니다.`)
    }
  }
  for (const script of pack.scripts) {
    const event = events.get(script.eventId)
    check(!!event, `script ${script.id}: 없는 사건 ${script.eventId}`)
    const dialogue = !['scene', 'success', 'failure'].includes(script.slot)
    const choiceSlot = ['success', 'failure', 'opinion', 'departure-warning', 'departure'].includes(script.slot)
    check(choiceSlot ? !!event && allChoices(event).some(choice => choice.id === script.choiceId) : script.choiceId === null, `script ${script.id}: 잘못된 선택/문구 슬롯 참조`)
    if (dialogue) {
      check(pack.manifest.dialogueVersion === 'scripts-1', `script ${script.id}: dialogueVersion이 필요합니다.`)
      check(script.weight === 1 && !script.once, `script ${script.id}: 대화 채널은 weight=1/once=false여야 합니다.`)
      check(script.slot === 'absent' || script.conditions.some(c => c.kind === 'companion' && c.present), `script ${script.id}: 동행 대사에는 companion present=true가 필요합니다.`)
      if (script.slot === 'absent') check(script.conditions.some(c => c.kind === 'companion' && !c.present), `script ${script.id}: 부재 문구에는 companion present=false가 필요합니다.`)
      if (script.slot === 'departure' || script.slot === 'departure-warning') check(!!event?.autonomy, `script ${script.id}: 이별 정책이 없는 사건입니다.`)
    }
    verifyConditions(script.conditions, `script ${script.id}`)
    for (const line of script.text) {
      const tokens = [...line.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1])
      const remainder = line.replace(/\{\{([^{}]+)\}\}/g, '')
      check(!remainder.includes('{{') && !remainder.includes('}}'), `script ${script.id}: 닫히지 않은 문구 변수`)
      check(tokens.every(token => ['protagonist.name', 'companion.name', 'location.name'].includes(token)), `script ${script.id}: 허용되지 않은 문구 변수`)
      if (tokens.includes('companion.name')) check(script.conditions.some(condition => condition.kind === 'companion' && condition.present), `script ${script.id}: 동료 이름에는 동행 조건이 필요합니다.`)
    }
  }
  if (issues.length) throw new ContentError(issues)
  // Stable order makes filename/import order irrelevant to seeded selection.
  const result: CatalogPack = { ...pack, locations: [...pack.locations].sort(compareId), events: [...pack.events].sort(compareId), scripts: [...pack.scripts].sort(compareId) }
  try {
    const verifyTerminal = (route: readonly string[]) => {
      for (const [index, id] of route.entries()) {
        const location = locations.get(id)!
        if (result.events.some(event => eventFits(event, location) && allChoices(event).some(choice => choice.behavior.kind === 'escape')) && index !== route.length - 1) throw new Error('탈출 장소 뒤에 다른 장소를 연결할 수 없습니다.')
      }
    }
    verifyTerminal(planRoute(result, 1).route)
    if (result.manifest.routeVersion !== 'slots-1') for (const location of result.locations.filter(location => location.enabled !== false)) verifyTerminal(planRoute(result, 1, [location.id]).route)
  } catch (error) { throw new ContentError([error instanceof Error ? error.message : '경로 검증 실패']) }
  function freeze(value: unknown): void { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze) } }
  freeze(result)
  return result
}
