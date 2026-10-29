import { expect, it } from 'vitest'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { makeStage19CatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { destinationLock } from './slots'
import { acknowledgeCatalogResult, catalogChoices, catalogContext, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const original = makeStage19CatalogFixture()
const entry = { conditions: [{ kind: 'fact' as const, id: 'research-clue', value: true }], reason: '연구 단서가 필요합니다.' }
function gated(id = 'hospital', gate = entry): CatalogPack {
  return compileCatalog({ ...original, manifest: { ...original.manifest, slotPlan: { ...original.manifest.slotPlan!,
    segments: original.manifest.slotPlan!.segments.map(s => s.id === id ? { ...s, entry: gate } : s) } } })
}
function boundary(pack: CatalogPack): CatalogRun {
  const origin = makeOrigin(17389), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  let run = createCatalogRun(pack, { ...origin, answers: answers.value })
  while (run.phase === 'choice' && run.visitIndex < 6) {
    const available = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
    const choice = available.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
      ?? available.find(c => c.id.endsWith('.observe')) ?? available[0]
    const result = executeCatalogAction(pack, run, choice.id)
    run = result.phase === 'result' ? acknowledgeCatalogResult(pack, result, result.result!.resultId) : result
  }
  if (run.visitIndex !== 6 || run.phase !== 'choice') throw new Error('분기 미도달')
  return run
}

it('콘텐츠의 단서 조건으로 진입을 잠그고 미리보기와 실제 실행 모두 같은 조건을 사용한다', () => {
  const pack = gated(), run = boundary(pack)
  const action = catalogChoices(pack, run).find(c => c.destinationSegmentId === 'hospital')!
  const before = JSON.stringify(run)
  expect(previewCatalogAction(pack, run, action.id)).toMatchObject({ allowed: false, reasons: [entry.reason] })
  expect(() => executeCatalogAction(pack, run, action.id)).toThrow(entry.reason)
  expect(JSON.stringify(run)).toBe(before)
  // Isolated before-state: acquiring a clue is authored by the later content step.
  const informed = { ...run, facts: { ...run.facts, 'research-clue': true } }
  expect(previewCatalogAction(pack, informed, action.id).allowed).toBe(true)
  expect(executeCatalogAction(pack, informed, action.id).route).toHaveLength(14)
  expect(destinationLock(pack, run.route[6], 'hospital')).toBe(entry.reason)
  expect(destinationLock(pack, run.route[6], 'hospital', catalogContext(pack, informed))).toBeNull()
  expect(destinationLock(pack, run.route[6], 'subway', catalogContext(pack, informed))).toContain('연결되지')
})

it('예약 잠금은 단서로 우회하지 못하고 기존 일반 경로는 조건 없이 유지한다', () => {
  const pack = gated('research'), run = boundary(pack)
  expect(destinationLock(pack, 'inpatient-ward', 'research', { ...catalogContext(pack, run), facts: { 'research-clue': true } }))
    .toBe(pack.manifest.slotPlan!.segments.find(s => s.id === 'research')!.lockedReason)
  expect(destinationLock(original, run.route[6], 'hospital')).toBeNull()
  expect(destinationLock(original, run.route[6], 'department')).toBeNull()
})

it('없는 단서·시작 구간 잠금·모든 후속 경로의 조건 잠금을 등록 시 거부한다', () => {
  expect(() => gated('hospital', { ...entry, conditions: [{ ...entry.conditions[0], id: 'missing-clue' }] })).toThrow('선언하지 않은 fact')
  expect(() => gated('early')).toThrow('시작 구간')
  const pack = gated()
  expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, slotPlan: { ...pack.manifest.slotPlan!,
    segments: pack.manifest.slotPlan!.segments.map(s => s.id === 'department' ? { ...s, entry } : s) } } })).toThrow('조건 없이 이동')
})
