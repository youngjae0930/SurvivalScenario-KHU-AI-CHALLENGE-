import { describe, expect, it } from 'vitest'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogPresentation } from '../../app/view-models/catalog'
import { makeOrigin } from '../../test/opening-paths'
import { makeDialogueCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { planRoute } from './route'
import { catalogVisitLimit, planSlotSegment, validateSlotPlan } from './slots'
import { acknowledgeCatalogResult, catalogChoices, catalogLegacy, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'
import { createInheritedCatalogRun, isCatalogLegacy } from './inheritance'

const pack = readDefaultCatalog()
const origin = makeOrigin(17389)
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문 오류')
const input = { ...origin, answers: resolved.value }
export function stageChoice(run: CatalogRun, middle = 'hospital', late = 'subway'): string {
  const available = catalogChoices(pack, run).filter(choice => previewCatalogAction(pack, run, choice.id).allowed)
  return (available.find(choice => choice.destinationSegmentId === (run.visitIndex === 6 ? middle : late))
    ?? available.find(choice => choice.behavior.kind === 'recovery' && choice.behavior.choice === 'maintain')
    ?? available.find(choice => choice.id.endsWith('.observe'))
    ?? available.find(choice => ['E01.safe', 'E02.supplies', 'E10.signal', 'E10.network', 'E09.comply', 'E09.protect', 'E12.short'].includes(choice.id))
    ?? available[0]).id
}
export function advanceStage(run: CatalogRun, middle = 'hospital', late = 'subway'): CatalogRun {
  const result = executeCatalogAction(pack, run, stageChoice(run, middle, late))
  return result.phase === 'result' ? acknowledgeCatalogResult(pack, result, result.result!.resultId) : result
}
function through(run: CatalogRun, count: number, middle = 'hospital', late = 'subway') {
  while (run.phase === 'choice' && run.history.length < count) run = advanceStage(run, middle, late)
  return run
}

describe('19스테이지 슬롯과 플레이 중 경로 선택', () => {
  it('54개 장소를 슬롯에 빠짐없이 배정하고 연구동만 잠금 상태로 유지한다', () => {
    expect(pack.locations).toHaveLength(54)
    expect(validateSlotPlan(pack)).toEqual([])
    expect(catalogVisitLimit(pack)).toBe(19)
    expect(pack.manifest.slotPlan!.segments.find(segment => segment.id === 'research')!.lockedReason).toBeTruthy()
    expect(pack.locations.filter(location => location.enabled === false)).toHaveLength(7)
    const run = createCatalogRun(pack, input)
    expect(run.route).toHaveLength(7)
    expect(catalogPresentation(pack, run)!.journey).toHaveLength(19)
    expect(catalogPresentation(pack, run)!.journey[7].label).toContain('경로 선택 후 결정')
  })

  it('각 A/B 후보가 추첨되고 고정 슬롯/순서/같은 시드의 재현성을 지킨다', () => {
    for (const segment of pack.manifest.slotPlan!.segments.filter(segment => !segment.lockedReason)) {
      const seen = segment.slots.map(() => new Set<string>())
      for (let seed = 1; seed <= 32; seed++) {
        const sample = planSlotSegment(pack, segment.id, Math.imul(seed, 0x9e3779b9) >>> 0)
        expect(planSlotSegment(pack, segment.id, Math.imul(seed, 0x9e3779b9) >>> 0)).toEqual(sample)
        sample.route.forEach((id, index) => { expect(segment.slots[index].candidates).toContain(id); seen[index].add(id) })
      }
      segment.slots.forEach((slot, index) => expect(seen[index]).toEqual(new Set(slot.candidates)))
    }
    expect(planRoute(pack, 100).route[0]).toBe('villa')
  })

  it.each([['hospital', 'subway'], ['hospital', 'school'], ['department', 'subway'], ['department', 'school']])('%s → %s가 실제 선택으로19번까지 진행하고 저장/계승된다', (middle, late) => {
    let run = createCatalogRun(pack, input)
    for (let index = 0; index < 19; index++) {
      expect(run.phase).toBe('choice')
      expect(run.visitIndex).toBe(index)
      run = advanceStage(run, middle, late)
      const raw = encodeCatalogSave(origin, pack, run)
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
    }
    expect(run.phase).toBe('ending')
    expect(run.history).toHaveLength(19)
    expect(run.route).toHaveLength(19)
    expect(run.route[7]).toBe(middle === 'hospital' ? 'hospital-desk' : 'department-hall')
    expect(run.route[14]).toBe(late === 'subway' ? 'turnstiles' : 'school-playground')
    expect(run.route[18]).toBe(late === 'subway' ? 'southern-tunnel' : 'outskirts-checkpoint')
    expect(run.result!.escape?.ending).toBe('escape')
    const legacy = catalogLegacy(pack, run)!
    expect(isCatalogLegacy(legacy)).toBe(true)
    const nextOrigin = { ...origin, runId: 'stage19-successor', seed: 87456 }
    const next = createInheritedCatalogRun(pack, legacy, { ...nextOrigin, answers: resolved.value })
    expect(next.companion?.traits).toEqual(run.core.protagonist.traits)
    expect(decodeCatalogSave(encodeCatalogSave(nextOrigin, pack, next), resolveAnswers).run).toEqual(next)
    const secondEnding = through(next, 19, middle, late)
    expect(secondEnding.phase).toBe('ending')
    expect(secondEnding.history).toHaveLength(19)
    expect(decodeCatalogSave(encodeCatalogSave(nextOrigin, pack, secondEnding), resolveAnswers).run).toEqual(secondEnding)
  })

  it('경로 미리보기는 추첨하지 않고 실행 결과 저장에 확정된 후보를 둔다', () => {
    const run = through(createCatalogRun(pack, input), 6)
    const before = JSON.stringify(run)
    const choice = stageChoice(run)
    for (let i = 0; i < 3; i++) previewCatalogAction(pack, run, choice)
    expect(JSON.stringify(run)).toBe(before)
    const result = executeCatalogAction(pack, run, choice)
    expect(result.route).toHaveLength(14)
    expect(executeCatalogAction(pack, run, choice)).toEqual(result)
    const loaded = decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers)
    expect(loaded.run).toEqual(result)
    const changed = JSON.parse(encodeCatalogSave(origin, pack, result))
    changed.checkpoint.route[8] = result.route[8] === 'er-waiting' ? 'hospital-security' : 'er-waiting'
    expect(() => decodeCatalogSave(JSON.stringify(changed), resolveAnswers)).toThrow()
  })

  it('두 중반 경로 모두 고정14번에서 단서를 기록하며 히든은 추첨 없이 거절한다', () => {
    for (const middle of ['hospital', 'department']) {
      const run = through(createCatalogRun(pack, input), 13, middle)
      const hidden = catalogChoices(pack, run).find(choice => choice.destinationSegmentId === 'research')!
      expect(previewCatalogAction(pack, run, hidden.id)).toMatchObject({ allowed: false })
      expect(() => executeCatalogAction(pack, run, hidden.id)).toThrow('출입 방법')
      const result = executeCatalogAction(pack, run, stageChoice(run, middle))
      expect(result.facts['research-clue']).toBe(true)
      expect(result.route).toHaveLength(19)
    }
  })

  it('연결 없는 분기·중복 후보·잘못된 순서·탈출 뒤 이동을 등록 단계에서 거절한다', () => {
    const invalid = (edit: (value: CatalogPack) => void) => {
      const value = structuredClone(pack); edit(value); expect(() => compileCatalog(value)).toThrow()
    }
    invalid(value => { (value.manifest.slotPlan!.segments[0].slots[1].candidates as string[]).push('villa') })
    invalid(value => { Object.assign(value.manifest.slotPlan!.segments[1].slots[0], { number: 9 }) })
    invalid(value => { Object.assign(value.events.find(event => event.locationIds.includes('shelter'))!.groups[0].choices[0], { destinationSegmentId: 'subway' }) })
    invalid(value => { (value.manifest.slotPlan!.segments.find(segment => segment.id === 'subway')!.slots as unknown[]).push({ number: 20, candidates: ['villa'] }) })
  })

  it('기존12사건 고정 팩은 새 경로/슬롯을 삽입하지 않고 원문 그대로 복원한다', () => {
    const old = makeDialogueCatalogFixture()
    const run = createCatalogRun(old, input)
    const raw = encodeCatalogSave(origin, old, run)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(loaded.pack.manifest.revision).toBe('catalog-dialogue-1')
    expect(loaded.run.route).toHaveLength(12)
    expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
  })
})
