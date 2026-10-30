import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { createProductClient } from '../../app/catalog-client'
import { catalogGameView } from '../../app/view-models/catalog'
import { makeDecisionEchoCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { makeReflectionCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { makeAction } from '../../test/core-fixtures'
import { encodeCatalogSave, decodeCatalogSave } from '../../storage/catalog-save'
import type { SaveStore } from '../../storage/browser-store'
import { compileCatalog } from './compile'
import type { ChoiceAssessment } from './assessment'
import { selectGeneralRecommendation } from './recommendation'
import { acknowledgeCatalogResult, catalogChoices, catalogGeneralRecommendation, catalogRecoveryOpinion, createCatalogRun, currentEvent, executeCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const origin = makeOrigin()
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const input = { ...origin, answers: answers.value }
const friend = (value = 50, trust = 0) => ({ name: '동료', trust, traits: { risk: value, cognition: value, affect: value } })
const route = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain']
function atEvent(id: string, value = 50, selected: CatalogPack = pack): CatalogRun {
  let run = createCatalogRun(selected, { ...input, companion: friend(value) })
  for (const action of route) {
    if (currentEvent(selected, run).id === id) return run
    run = executeCatalogAction(selected, run, action)
    run = acknowledgeCatalogResult(selected, run, run.result!.resultId)
  }
  if (currentEvent(selected, run).id !== id) throw new Error(id)
  return run
}
function candidate(id: string, direction = 0, overrides: Partial<ChoiceAssessment> = {}): ChoiceAssessment {
  const action = makeAction({ id, traitDelta: { risk: direction, cognition: 0, affect: 0 } })
  return { choice: { id, goalId: id, label: id, intention: id, target: id, judgment: null,
    behavior: { kind: 'action', variants: [{ conditions: [], action }] }, successFacts: {}, failureFacts: {} },
    traitDelta: action.traitDelta, successPercent: 100, outcomes: [],
    survival: { fatalPercent: 0, expectedInjury: 0, expectedStamina: 70 },
    resources: { expectedSupply: 1, expectedMedkit: 1, weaponPercent: 0 }, ...overrides }
}
function choose(candidates: readonly ChoiceAssessment[], value = 50) {
  return selectGeneralRecommendation({ axis: 'risk' }, friend(value).traits, candidates)
}

describe('승인된 일반 동료 추천', () => {
  it('49/51은 성향 목표, 정확히50은 중립에서 생존 순위로 고른다', () => {
    const adventure = candidate('adventure', -8, { survival: { fatalPercent: 0, expectedInjury: 0.2, expectedStamina: 60 } })
    const stable = candidate('stable', 8)
    expect(choose([adventure, stable], 49)).toMatchObject({ kind: 'ready', choice: { id: 'adventure' }, preferredGoal: true })
    expect(choose([adventure, stable], 50)).toMatchObject({ kind: 'ready', choice: { id: 'stable' }, preferredGoal: false, value: 50 })
    expect(choose([adventure, stable], 51)).toMatchObject({ kind: 'ready', choice: { id: 'stable' }, preferredGoal: true })
  })

  it.each([
    [ { fatalPercent: 1, expectedInjury: 0, expectedStamina: 100 }, { fatalPercent: 0, expectedInjury: 2, expectedStamina: 1 } ],
    [ { fatalPercent: 0, expectedInjury: 1, expectedStamina: 100 }, { fatalPercent: 0, expectedInjury: 0, expectedStamina: 1 } ],
    [ { fatalPercent: 0, expectedInjury: 0, expectedStamina: 20 }, { fatalPercent: 0, expectedInjury: 0, expectedStamina: 21 } ],
  ])('생존 순위는 치명 위험→예상 부상→잔여 체력이며 자원이 이를 뒤집지 않는다 (%j)', (worse, better) => {
    const a = candidate('a', 0, { survival: worse, resources: { expectedSupply: 3, expectedMedkit: 2, weaponPercent: 100 } })
    const b = candidate('b', 0, { survival: better, resources: { expectedSupply: 0, expectedMedkit: 0, weaponPercent: 0 } })
    expect(choose([a, b])).toMatchObject({ kind: 'ready', choice: { id: 'b' } })
  })

  it('자원별 우위는 비교하되 물자·치료 도구·무기를 한 수치로 환산하지 않는다', () => {
    const a = candidate('a', 0, { resources: { expectedSupply: 2, expectedMedkit: 0, weaponPercent: 0 } })
    const b = candidate('b', 0, { resources: { expectedSupply: 1, expectedMedkit: 1, weaponPercent: 0 } })
    expect(choose([a, b])).toEqual({ kind: 'withheld', reason: 'resource-tradeoff' })
    const dominated = candidate('c', 0, { resources: { expectedSupply: 0, expectedMedkit: 0, weaponPercent: 0 } })
    expect(choose([a, dominated])).toMatchObject({ kind: 'ready', choice: { id: 'a' } })
  })

  it('생존·자원이 같을 때만 명시된 이동 속도를 쓰고 미상/동률은 보류한다', () => {
    const a = candidate('a'), b = candidate('b')
    expect(choose([a, b])).toMatchObject({ kind: 'withheld' })
    const slow = { ...a, choice: { ...a.choice, pace: 'slow' as const } }
    const fast = { ...b, choice: { ...b.choice, pace: 'fast' as const } }
    expect(choose([slow, fast])).toMatchObject({ kind: 'ready', choice: { id: 'b' } })
    expect(choose([slow, { ...fast, choice: { ...fast.choice, pace: 'slow' } }])).toMatchObject({ kind: 'withheld' })
    expect(choose([slow, b])).toMatchObject({ kind: 'withheld' })
    expect(choose([])).toEqual({ kind: 'withheld', reason: 'no-available-choice' })
    expect(choose([fast, slow])).toEqual(choose([slow, fast]))
  })

  it('대표 목표는 같은 조건의 최종 동률만 가르고 성향 목표·안전·속도 우위를 덮어쓰지 않는다', () => {
    const a = candidate('past', -8), b = candidate('other', 8)
    const decide = (items: readonly ChoiceAssessment[], value = 50) => selectGeneralRecommendation({ axis: 'risk' }, friend(value).traits, items, 'past')
    expect(decide([a, b])).toMatchObject({ kind: 'ready', choice: { id: 'past' }, basis: 'representative' })
    expect(decide([a, b], 51)).toMatchObject({ kind: 'ready', choice: { id: 'other' } })
    expect(decide([{ ...a, survival: { ...a.survival, expectedInjury: 1 } }, b])).toMatchObject({ kind: 'ready', choice: { id: 'other' } })
    expect(decide([{ ...a, choice: { ...a.choice, pace: 'slow' } }, { ...b, choice: { ...b.choice, pace: 'fast' } }])).toMatchObject({ kind: 'ready', choice: { id: 'other' } })
    const sameSpeed = [a, b].map(item => ({ ...item, choice: { ...item.choice, pace: 'balanced' as const } }))
    expect(decide(sameSpeed)).toMatchObject({ kind: 'ready', choice: { id: 'past' }, basis: 'representative' })
    expect(decide([...sameSpeed].reverse())).toEqual(decide(sameSpeed))
  })

  it('대표 목표가 있어도 자원 교환관계·목표 내 복수 동률·속도 정보 불균형은 보류한다', () => {
    const a = candidate('past'), b = candidate('other')
    const decide = (items: readonly ChoiceAssessment[]) => selectGeneralRecommendation({ axis: 'risk' }, friend().traits, items, 'past')
    expect(decide([{ ...a, resources: { expectedSupply: 3, expectedMedkit: 0, weaponPercent: 0 } }, b])).toEqual({ kind: 'withheld', reason: 'resource-tradeoff' })
    expect(decide([a, { ...b, choice: { ...b.choice, goalId: 'past' } }])).toMatchObject({ kind: 'withheld' })
    expect(decide([a, { ...b, choice: { ...b.choice, pace: 'balanced' } }])).toMatchObject({ kind: 'withheld' })
    expect(selectGeneralRecommendation({ axis: 'risk' }, friend().traits, [a, b], 'missing')).toMatchObject({ kind: 'withheld' })
  })

  it.each(['E01', 'E02', 'E03', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10', 'E12'])('%s 일반 장면은 본인4개를 유지하고 실행 가능한 추천만 표시한다', id => {
    for (const value of [49, 50, 51]) {
      const run = atEvent(id, value)
      const before = structuredClone(run)
      const result = catalogGeneralRecommendation(pack, run)
      const view = catalogGameView(pack, run)
      if (view.kind !== 'choice') throw new Error('선택')
      expect(view.actions).toHaveLength(4)
      expect(view.actions.every(a => !a.requiresCompanion)).toBe(true)
      expect(catalogChoices(pack, run).map(c => c.id)).toEqual(view.actions.map(a => a.actionId))
      if (result.kind === 'ready') {
        expect(view.actions.filter(a => a.recommended).map(a => a.actionId)).toEqual([result.choice.id])
        expect(view.actions.find(a => a.recommended)?.availability.kind).toBe('available')
        expect(view.companion).toMatchObject({ opinion: { kind: 'ready', actionId: result.choice.id } })
      } else {
        expect(result.kind).toBe('withheld')
        expect(view.actions.some(a => a.recommended)).toBe(false)
        expect(view.notices.join(' ')).toMatch(/판단|찾지/)
      }
      expect(run).toEqual(before)
    }
  })

  it('신뢰0/100과 집계값은 일반 성향 추천을 덮어쓰지 않는다', () => {
    const run = atEvent('E01', 49)
    expect(catalogGeneralRecommendation(pack, run)).toMatchObject({ kind: 'ready', choice: { id: 'E01.shortcut' } })
    const altered = { ...run, companion: { ...run.companion!, trust: 100, judgmentCounts: { rescue: 3, self: 0 } } }
    expect(catalogGeneralRecommendation(pack, altered)).toEqual(catalogGeneralRecommendation(pack, run))
  })

  it('물자·치료 도구가 없으면 현재 무자원 도움 variant를 추천하고 잠긴 선택은 그대로 표시한다', () => {
    const source = atEvent('E02', 70)
    const run = { ...source, core: { ...source.core, inventory: { ...source.core.inventory, supply: 0, medkit: 0 } } }
    const opinion = catalogGeneralRecommendation(pack, run)
    expect(opinion).toMatchObject({ kind: 'ready', choice: { id: 'E02.help' } })
    if (opinion.kind !== 'ready') throw new Error('추천')
    expect(opinion.assessment.resources.expectedSupply).toBe(0)
    const view = catalogGameView(pack, run)
    if (view.kind !== 'choice') throw new Error('선택')
    expect(view.actions).toHaveLength(4)
    expect(view.actions.find(a => a.actionId === 'E02.first-aid')).toMatchObject({ recommended: false, availability: { kind: 'locked' } })
    expect(view.actions.find(a => a.recommended)).toMatchObject({ actionId: 'E02.help', availability: { kind: 'available' } })
  })

  it('탈출은 가능한 경로 안에서 모험=지름길·안정=우회·중립=현재 생존/소모 균형을 따른다', () => {
    for (const value of [49, 50, 51]) {
      const source = atEvent('E12', value)
      const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, stamina: 70, injury: 0 }, flags: { ...source.core.flags, routeKnown: true } } }
      const opinion = catalogGeneralRecommendation(pack, run)
      expect(opinion).toMatchObject({ kind: 'ready', choice: { behavior: { route: value > 50 ? 'detour' : 'short' } } })
      const limited = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 20 } } }
      expect(catalogGeneralRecommendation(pack, limited)).toMatchObject({ kind: 'ready', choice: { behavior: { route: 'short' } } })
      const stranded = { ...limited, core: { ...limited.core, protagonist: { ...limited.core.protagonist, stamina: 0 } } }
      expect(catalogGeneralRecommendation(pack, stranded)).toMatchObject({ kind: 'ready', choice: { behavior: { route: 'request' } } })
    }
  })

  it('동료 없음·과거 팩·정비 예외·극단 동료 슬롯은 기존 정책을 유지한다', () => {
    const solo = createCatalogRun(pack, input)
    expect(catalogGeneralRecommendation(pack, solo)).toEqual({ kind: 'inactive' })
    const old = makeReflectionCatalogFixture()
    const oldRun = atEvent('E01', 49, old)
    const raw = encodeCatalogSave(origin, old, oldRun)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(catalogGeneralRecommendation(loaded.pack, loaded.run)).toEqual({ kind: 'inactive' })
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-recovery-1')
    const rest = atEvent('E04')
    expect(catalogGeneralRecommendation(pack, rest)).toEqual({ kind: 'inactive' })
    expect(catalogRecoveryOpinion(pack, rest)?.choice.id).toBe('E04.share')
    const source = atEvent('E05', 70)
    const extreme = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, traits: { ...source.core.protagonist.traits, risk: 10 } } } }
    expect(catalogGeneralRecommendation(pack, extreme)).toEqual({ kind: 'inactive' })
    expect(catalogChoices(pack, extreme).filter(c => c.id.startsWith('companion:'))).toHaveLength(1)
  })

  it('추천 메타데이터의 누락·알 수 없는 버전·잘못된 축은 등록을 거부한다', () => {
    const missing = structuredClone(pack)
    delete (missing.events[0] as { recommendation?: unknown }).recommendation
    expect(() => compileCatalog(missing)).toThrow('성향축')
    expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, recommendationVersion: 'unknown' } })).toThrow()
    const wrong = { ...pack, events: pack.events.map(e => e.id === 'E12' ? { ...e, recommendation: { axis: 'affect' } } : e) }
    expect(() => compileCatalog(wrong)).toThrow('risk')
  })

  it('추천 실행 저장 실패는 같은 추천·네 선택·이전 상태를 유지하고 동일 결과로 재시도한다', async () => {
    let raw: string | null = encodeCatalogSave(origin, pack, atEvent('E01', 49))
    let fail = false
    const writes: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(raw).toBe(expected); writes.push(next)
      if (fail) throw new Error('저장 실패')
      raw = next
    } }
    const client = createProductClient({ store })
    await client.dispatch({ type: 'resume' })
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택')
    const action = before.actions.find(a => a.recommended)!
    const preview = await client.previewAction({ context: before.context, actionId: action.actionId, treatment: 'none' })
    if (!preview.ok) throw new Error(preview.error.message)
    const previous = raw; fail = true
    expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(raw).toBe(previous)
    expect(client.getSnapshot().view).toEqual(before)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패 아님')
    const attempt = writes.at(-1); fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(writes.at(-1)).toBe(attempt)
    expect(JSON.parse(raw!).runtimeVersion).toBe('catalog-companion-echo-1')
    expect(decodeCatalogSave(raw!, resolveAnswers).run.result?.actionId).toBe(action.actionId)
  })
})
