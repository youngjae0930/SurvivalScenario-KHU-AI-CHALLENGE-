import { describe, expect, it } from 'vitest'
import { catalogGameView } from '../../app/view-models/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { reflectionCopy } from '../../content/texts/reflection'
import type { CatalogRun } from '../../domain/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeCompanionRecoveryCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { catalogFirstExtreme, catalogInitialTraits, catalogReflection } from './reflection'
import { acknowledgeCatalogResult, createCatalogRun, executeCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const origin = makeOrigin()
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문 오류')
const input = { ...origin, answers: resolved.value }
const allLeftOrigin = { ...origin, answers: origin.answers.map(answer => ({ ...answer, answerId: 'a' })) }
const allLeft = resolveAnswers(allLeftOrigin.answers)
if (!allLeft.ok) throw new Error('설문 오류')
const leftInput = { ...allLeftOrigin, answers: allLeft.value, companion: { name: '동료', trust: 0, traits: { risk: 70, cognition: 70, affect: 70 } } }
const advance = (run: CatalogRun) => acknowledgeCatalogResult(pack, run, run.result!.resultId)
function ending() {
  let run = createCatalogRun(pack, input)
  for (const id of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal', 'E11.maintain']) run = advance(executeCatalogAction(pack, run, id))
  return executeCatalogAction(pack, run, 'E12.short')
}
function guidance(run: CatalogRun): readonly string[] {
  const view = catalogGameView(pack, run)
  return view.kind === 'result' ? view.consequences : view.kind === 'choice' ? view.notices : view.kind === 'ending' ? view.text : []
}

describe('회차별 첫 극단 안내와 짧은 회고', () => {
  it('첫 극단은 전체 축에서 한 번이며 다른 축·재진입·해제에 안내를 반복하지 않는다', () => {
    let run = createCatalogRun(pack, leftInput)
    expect(catalogFirstExtreme(run)).toBeNull()
    run = executeCatalogAction(pack, run, 'E01.shortcut')
    expect(catalogFirstExtreme(run)).toEqual({ resultId: run.result!.resultId, axes: ['risk'] })
    expect(guidance(run)).toEqual([reflectionCopy.firstExtreme])
    for (const id of ['E02.supplies', 'E03.observe', 'E04.maintain', 'companion:E05.bypass', 'E06.salvage']) {
      run = advance(run)
      expect(guidance(run)).not.toContain(reflectionCopy.firstExtreme)
      run = executeCatalogAction(pack, run, id)
      expect(guidance(run)).toEqual([])
    }
    expect(run.core.protagonist.traits.risk).toBe(22)
    expect(catalogFirstExtreme(run)?.resultId).toContain(':result:1')
  })

  it('저장 복원은 같은 첫 결과를 유지하고 다음 결과부터 안내를 반복하지 않는다', () => {
    const result = executeCatalogAction(pack, createCatalogRun(pack, leftInput), 'E01.shortcut')
    const raw = encodeCatalogSave(allLeftOrigin, pack, result)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(catalogGameView(loaded.pack, loaded.run)).toEqual(catalogGameView(pack, result))
    const next = advance(result)
    const after = decodeCatalogSave(encodeCatalogSave(allLeftOrigin, pack, next), resolveAnswers)
    expect(guidance(after.run)).not.toContain(reflectionCopy.firstExtreme)
    expect(after.pack.manifest.presentationVersion).toBe('reflection-1')
  })

  it('새 회차는 첫 안내를 새로 제공한다', () => {
    for (const runId of ['first-run', 'next-run']) {
      const run = executeCatalogAction(pack, createCatalogRun(pack, { ...leftInput, runId }), 'E01.shortcut')
      expect(guidance(run)).toEqual([reflectionCopy.firstExtreme])
    }
  })

  it('나중에 도달한 안정 극단도 첫 안내 대상이며 설문 출발 성향은 이력에서 복원한다', () => {
    const source = makeOrigin(1, 'stability')
    const resolved = resolveAnswers(source.answers)
    if (!resolved.ok) throw new Error('설문 오류')
    let run = createCatalogRun(pack, { ...source, answers: resolved.value })
    for (const id of ['E01.shortcut', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass']) run = advance(executeCatalogAction(pack, run, id))
    run = executeCatalogAction(pack, run, 'E06.withdraw')
    const first = catalogFirstExtreme(run)!
    expect(first.axes).toEqual(['risk'])
    expect(first.resultId).toBe(run.history.find(h => h.eventId === 'E06')!.resultId)
    expect(catalogInitialTraits(run)).toEqual({ risk: 70, cognition: 50, affect: 50 })
  })

  it('회고는 두 문장과 실제 변화·대표 선택3개·계승 특징을 담고 게임 상태를 바꾸지 않는다', () => {
    const run = ending(), before = structuredClone(run)
    const view = catalogGameView(pack, run)
    if (view.kind !== 'ending') throw new Error('결말 아님')
    expect(view.legacySummary[0]).toContain('위험을 피해')
    expect(view.legacySummary[0]).toContain('이성을 붙들려')
    expect(view.legacySummary[0]).toContain('동료에게 이어집니다')
    expect(view.legacySummary[0].length).toBeLessThan(180)
    expect(view.legacySummary).toHaveLength(6)
    expect(view.legacySummary[1]).toContain(`모험–안정 50 → ${run.core.protagonist.traits.risk}`)
    expect(view.legacySummary.filter(line => line.startsWith('기억에 남은 선택'))).toHaveLength(3)
    expect(view.legacySummary.at(-1)).toContain('단서를 살피는 판단')
    expect(view.legacySummary.join(' ')).not.toContain('질문지')
    expect(run).toEqual(before)
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
  })

  it('중립50을 한쪽 성향으로 표현하지 않는다', () => {
    const source = ending()
    const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, traits: { risk: 50, cognition: 50, affect: 50 } } } }
    expect(catalogReflection(run).directions).toEqual({ risk: 'neutral', cognition: 'neutral', affect: 'neutral' })
    const view = catalogGameView(pack, run)
    if (view.kind !== 'ending') throw new Error('결말 아님')
    expect(view.legacySummary.at(-1)).toContain('분석과 직관 사이의 균형')
    expect(view.legacySummary[0]).not.toContain('이성을 붙들려')
  })

  it('조기 종료에는 미도달 대표 선택을 채우지 않는다', () => {
    const result = executeCatalogAction(pack, createCatalogRun(pack, input), 'E01.safe')
    const run = { ...result, phase: 'ending' as const, core: { ...result.core, protagonist: { ...result.core.protagonist, injury: 3 } } }
    const view = catalogGameView(pack, run)
    if (view.kind !== 'ending') throw new Error('결말 아님')
    expect(view.legacySummary.filter(line => line.startsWith('기억에 남은 선택'))).toHaveLength(0)
    expect(view.legacySummary.join(' ')).not.toContain('자료를')
  })

  it('이전 저장 팩은 반복 진입 안내와 기존 결말 설명을 그대로 유지한다', () => {
    const old = makeCompanionRecoveryCatalogFixture()
    const first = executeCatalogAction(old, createCatalogRun(old, leftInput), 'E01.shortcut')
    const loaded = decodeCatalogSave(encodeCatalogSave(allLeftOrigin, old, first), resolveAnswers)
    const view = catalogGameView(loaded.pack, loaded.run)
    if (view.kind !== 'result') throw new Error('결과 아님')
    expect(view.consequences.join(' ')).toContain('극단 범위에 진입')
    expect(view.consequences).not.toContain(reflectionCopy.firstExtreme)
    expect(loaded.pack.manifest.presentationVersion).toBeUndefined()
  })
})
