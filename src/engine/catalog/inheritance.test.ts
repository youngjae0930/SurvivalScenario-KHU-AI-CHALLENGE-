import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { makeCompanionRecoveryCatalogFixture } from '../../test/catalog-fixtures'
import type { CatalogRun } from '../../domain/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeOrigin } from '../../test/opening-paths'
import { catalogInheritance, prepareNextCatalogRun } from './inheritance'
import { acknowledgeCatalogResult, createCatalogRun, executeCatalogAction } from './runtime'

const pack = makeCompanionRecoveryCatalogFixture()
const origin = makeOrigin()
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문 오류')
const input = { ...origin, answers: resolved.value }
function atExit(exhausted = false): CatalogRun {
  let run = createCatalogRun(pack, input)
  for (const id of ['E01.safe', 'E02.supplies', 'E03.observe', exhausted ? 'E04.organize' : 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', exhausted ? 'E11.organize' : 'E11.maintain']) {
    run = executeCatalogAction(pack, run, id)
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  return run
}

describe('별개 인물로 이어지는 계승 준비', () => {
  it('진행 중·결과·구간 경계는 계승 대상이 아니며 원본을 유지한다', () => {
    const start = createCatalogRun(pack, input)
    const result = executeCatalogAction(pack, start, 'E01.safe')
    for (const run of [start, result, { ...start, phase: 'segment-complete' as const }]) {
      expect(catalogInheritance(pack, run)).toBeNull()
      expect(() => prepareNextCatalogRun(pack, run, pack, { ...input, runId: 'next' })).toThrow('결말')
    }
  })

  it.each(['escape', 'data-and-escape', 'rescue-wait', 'fatal'] as const)('%s에서도 최종 성향과 실제 판단만 분리 복사한다', kind => {
    const source = atExit(kind === 'rescue-wait')
    const run = kind === 'fatal'
      ? { ...source, phase: 'ending' as const, core: { ...source.core, protagonist: { ...source.core.protagonist, injury: 3 } }, result: { ...source.history.at(-1)!, escape: undefined } }
      : executeCatalogAction(pack, kind === 'data-and-escape' ? { ...source, core: { ...source.core, flags: { ...source.core.flags, data: true } } } : source, kind === 'rescue-wait' ? 'E12.request' : 'E12.short')
    const before = structuredClone(run)
    const inherited = catalogInheritance(pack, run)!
    expect(inherited.companion).toEqual({ name: run.core.protagonist.name, traits: run.core.protagonist.traits, trust: 50 })
    expect(inherited.judgmentCounts).toEqual(run.judgmentCounts)
    expect(inherited.rescueDecision).toBe(run.core.flags.rescueDecision)
    expect(inherited.independentUsed).toBe(false)
    expect(Object.keys(inherited).sort()).toEqual(['companion', 'independentUsed', 'judgmentCounts', 'rescueDecision', 'sourceRunId'])
    expect(inherited.companion.traits).not.toBe(run.core.protagonist.traits)
    expect(inherited.judgmentCounts).not.toBe(run.judgmentCounts)
    expect(run).toEqual(before)
    const view = catalogGameView(pack, run)
    if (view.kind !== 'ending') throw new Error('결말 아님')
    expect(view.legacySummary.join(' ')).toContain('별개의 살아 있는 인물')
    expect(view.legacySummary.join(' ')).toContain(`구조 ${run.judgmentCounts.rescue}회`)
    expect(view.newRun.kind).toBe('locked')
  })

  it('새 설문·seed와 초기 생존값을 사용하고 이전 기록이나 저장을 변경하지 않는다', () => {
    const run = executeCatalogAction(pack, atExit(), 'E12.short')
    const raw = encodeCatalogSave(origin, pack, run)
    const restored = decodeCatalogSave(raw, resolveAnswers)
    const answers = input.answers.map(answer => ({ ...answer, delta: 10 as const }))
    const candidate = prepareNextCatalogRun(restored.pack, restored.run, pack, { runId: 'new-run', name: '새 주인공', seed: 987654, answers })
    expect(candidate.run.core).toEqual({
      protagonist: { name: '새 주인공', traits: { risk: 70, cognition: 70, affect: 70 }, stress: 30, stamina: 70, injury: 0 },
      inventory: { supply: 1, medkit: 1, weapon: false },
      flags: { access: false, data: false, helpEstablished: false, routeKnown: false, rescueDecision: null },
    })
    expect(candidate.run.companion).toEqual({ ...candidate.inherited.companion, judgmentCounts: candidate.inherited.judgmentCounts })
    expect(candidate.run.initialSeed).toBe(987654)
    expect(candidate.run.history).toEqual([])
    expect(candidate.run.judgmentCounts).toEqual({ rescue: 0, self: 0 })
    expect(candidate.run.revision).toBe(0)
    expect(candidate.run.visits).toHaveLength(1)
    expect(encodeCatalogSave(origin, pack, run)).toBe(raw)
    expect(candidate.run.companion?.traits).not.toBe(run.core.protagonist.traits)
    expect(() => prepareNextCatalogRun(pack, run, pack, input)).toThrow('ID')
    expect(() => prepareNextCatalogRun(pack, run, pack, { ...input, runId: 'next', companion: null })).toThrow('직전 결말')
  })
})
