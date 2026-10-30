import { describe, expect, it } from 'vitest'
import { readDefaultCatalog } from '../../content/catalog/registry'
import previousSnapshot from '../../test/trust-scale-catalog-v1.json'
import { extremeAxes, extremeOrigin, startExtremePath, stepExtremePath } from '../../test/middle-extreme-paths'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { historyResultSummary } from '../../content/texts/history-summary'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { createInheritedCatalogRun, isCatalogLegacy } from './inheritance'
import { interventionPolicies } from './intervention'
import { catalogChoices, catalogIntervention, catalogLegacy, currentGroup, executeCatalogAction, findCatalogChoice, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = readDefaultCatalog()
const cases = ['hospital', 'department'].flatMap(route => extremeAxes.flatMap(axis => (['left', 'right'] as const).flatMap(pole => [false, true].map(neutral => ({ route, axis, pole, neutral })))))
describe('정상 선택 누적으로 중반부의 여섯 극단을 경험한다', () => {
  it.each(cases)('$route $axis $pole 중립=$neutral', ({ route, axis, pole, neutral }) => {
    const { origin, run: initial } = startExtremePath(pack, route, axis, pole, neutral)
    let run = initial
    while (run.phase === 'choice' && !currentGroup(pack, run).id.startsWith('extreme')) {
      if (run.visitIndex < 7) expect(Object.values(run.core.protagonist.traits).every(value => value > 15 && value < 85)).toBe(true)
      run = stepExtremePath(pack, run, route, axis, pole)
    }
    expect(run.phase).toBe('choice')
    expect(run.visitIndex + 1).toBe(neutral ? 13 : 11)
    expect(currentGroup(pack, run).id).toBe(`extreme-${axis}-${pole}`)
    const choices = catalogChoices(pack, run)
    expect(new Set(choices.map(choice => choice.goalId)).size).toBe(1)
    // Isolated resource boundary check only; reachability above used the unmodified run.
    const exhausted = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 0 }, inventory: { supply: 0, medkit: 0, weapon: false } } }
    expect(catalogChoices(pack, exhausted).some(choice => previewCatalogAction(pack, exhausted, choice.id).allowed)).toBe(true)
    for (const choice of choices) {
      expect(choice.label).toContain('극단 · 강화')
      const preview = previewCatalogAction(pack, run, choice.id)
      expect(preview.check.kind).toBe('probability')
      if (preview.check.kind === 'probability') expect(preview.check.probability.percent).toBeLessThanOrEqual(70)
      expect(preview.action.failureEffects).toContainEqual({ kind: 'add', stat: 'injury', amount: 2 })
    }
    const free = choices.find(choice => previewCatalogAction(pack, run, choice.id).allowed)!
    const view = catalogGameView(pack, run)
    expect(view.kind).toBe('choice')
    if (view.kind === 'choice') expect(view.notices.join(' ')).toContain('극단')
    const scene = renderCatalogScript(pack, run, run.visits[run.visitIndex].sceneScriptId).join(' ')
    expect(scene).toMatch(/못|않|먼저|매달|판단 밖/)
    const restored = decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers)
    expect(restored.run).toEqual(run)
    const result = executeCatalogAction(pack, run, free.id)
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
  })
})

it('모든 A/B 체크포인트에 여섯 목표·동료 대안을 두고, 빈 재고·체력0에서도 시도는 남긴다', () => {
  const checkpoints = pack.events.filter(event => event.interventions?.length)
  expect(checkpoints).toHaveLength(6)
  for (const event of checkpoints) {
    expect(interventionPolicies(event)).toHaveLength(6)
    for (const policy of interventionPolicies(event)) {
      const group = event.groups.find(group => group.id === policy.groupId)!
      const free = group.choices.find(choice => choice.id !== policy.replaceChoiceId && choice.behavior.kind === 'action' && choice.behavior.variants.some(v => !Object.keys(v.action.requires).length && !v.action.costs.supply && !v.action.costs.medkit))
      expect(free).toBeDefined()
      if (free?.behavior.kind === 'action') expect(free.behavior.variants[0].action.costs.stamina).toBeGreaterThan(0)
      expect(group.choices.every(choice => choice.behavior.kind === 'action' && choice.behavior.variants.every(v => v.action.check !== null))).toBe(true)
    }
  }
})

it('재고 상한·연구 단서 배정 여부에 따른 일반 그룹에서도 중반 성향 형성 방향이 사라지지 않는다', () => {
  for (const segment of pack.manifest.slotPlan!.segments.filter(segment => ['hospital', 'department'].includes(segment.id))) {
    for (const slot of segment.slots.filter(slot => [8, 9, 10, 12].includes(slot.number))) for (const location of slot.candidates) {
      const event = pack.events.find(event => event.locationIds.includes(location))!
      const axes = slot.number === 9 ? ['affect'] as const : slot.number === 10 ? ['risk', 'cognition'] as const : extremeAxes
      for (const group of event.groups) for (const axis of axes) for (const sign of [-1, 1]) {
        expect(group.choices.some(choice => choice.behavior.kind === 'action' && choice.behavior.variants.some(variant => variant.action.traitDelta[axis] * sign > 0)), `${location}/${group.id}/${axis}/${sign}`).toBe(true)
      }
    }
  }
})

it('강화 결과·기록은 목표별 이익과 큰 실패 대가를 남기며 성공 사실은 다음 분기에서 회상한다', () => {
  const rewardSignatures = new Set<string>()
  for (const event of pack.events.filter(event => event.interventions?.length)) for (const policy of interventionPolicies(event)) {
    const group = event.groups.find(group => group.id === policy.groupId)!
    const first = group.choices[0]
    if (first.behavior.kind !== 'action') throw new Error('강화 행동 누락')
    rewardSignatures.add(JSON.stringify(first.behavior.variants[0].action.successEffects))
    const success = pack.scripts.find(script => script.eventId === event.id && script.choiceId === first.id && script.slot === 'success' && !script.conditions.length)!
    const failure = pack.scripts.find(script => script.eventId === event.id && script.choiceId === first.id && script.slot === 'failure' && !script.conditions.length)!
    expect(historyResultSummary(success.text, success.id)).not.toBe('맨몸으로 위험 안쪽을 파고들었다.')
    expect(historyResultSummary(failure.text, failure.id)).toContain('크게 다쳤다')
    const fact = Object.keys(first.successFacts)[0]
    expect(pack.scripts.some(script => script.slot === 'scene' && script.conditions.some(condition => condition.kind === 'fact' && condition.id === fact && condition.value))).toBe(true)
  }
  expect(rewardSignatures.size).toBe(6)
})

it('실제 극단 결말을 계승한 동료가 반대 목표를 제안하고, 별도 피해·저장·기록을 유지한다', () => {
  let { run } = startExtremePath(pack, 'hospital', 'risk', 'left')
  while (run.phase === 'choice') run = stepExtremePath(pack, run, 'hospital', 'risk', 'left')
  const legacy = catalogLegacy(pack, run)!
  expect(isCatalogLegacy(legacy)).toBe(true)
  const origin = extremeOrigin('department', 'risk', 'right'), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  let inherited = createInheritedCatalogRun(pack, legacy, { ...origin, answers: answers.value })
  while (inherited.phase === 'choice' && !currentGroup(pack, inherited).id.startsWith('extreme')) inherited = stepExtremePath(pack, inherited, 'department', 'risk', 'right')
  expect(currentGroup(pack, inherited).id).toBe('extreme-risk-right')
  const intervention = catalogIntervention(pack, inherited)!
  expect(intervention.choice.id).toMatch(/^companion:/)
  const own = catalogChoices(pack, inherited).filter(choice => !choice.id.startsWith('companion:'))
  expect(own.every(choice => choice.goalId !== intervention.choice.goalId)).toBe(true)
  expect(findCatalogChoice(pack, inherited.visits[inherited.visitIndex].eventId, intervention.choice.id).id).toBe(intervention.choice.id)
  expect(catalogGameView(pack, inherited).kind).toBe('choice')
  const next = executeCatalogAction(pack, inherited, intervention.choice.id)
  expect(next.core.protagonist.injury).toBe(inherited.core.protagonist.injury)
  expect(decodeCatalogSave(encodeCatalogSave(origin, pack, next), resolveAnswers).run).toEqual(next)
})

it('이전 신뢰2배 팩의 상태와 판본을 새 극단 콘텐츠로 바꾸지 않고 복원한다', () => {
  const old = compileCatalog(previousSnapshot), { origin, run } = startExtremePath(old, 'hospital', 'affect', 'right')
  const restored = decodeCatalogSave(encodeCatalogSave(origin, old, run), resolveAnswers)
  expect(restored.pack.manifest.revision).toBe('catalog-trust-scale-1')
  expect(restored.pack.manifest.extremeExperienceVersion).toBeUndefined()
  expect(restored.run).toEqual(run)
})
