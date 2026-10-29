import { describe, expect, it } from 'vitest'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { makeOrigin } from '../../test/opening-paths'
import { makeStage19CatalogFixture, makeLocalStoriesCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { createInheritedCatalogRun } from './inheritance'
import { matches } from './conditions'
import { allChoices } from './compile'
import { findDialogue } from './dialogue'
import { acknowledgeCatalogResult, catalogChoices, catalogContext, catalogLegacy, createCatalogRun, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeLocalStoriesCatalogFixture()
const origin = makeOrigin(17389)
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문')
const input = { ...origin, answers: resolved.value }
const companion = { name: '이전의 나', trust: 60, traits: { risk: 50, cognition: 50, affect: 50 } }

/** Isolated scene harness, not a valid save: complete route/save coverage is below. */
function scene(locationId: string, stock = 1, kit = 1, injury = 0, affect = 50, withCompanion = false): CatalogRun {
  const run = createCatalogRun(pack, input)
  const event = pack.events.find(event => event.locationIds.includes(locationId))!
  return { ...run, route: [locationId], visits: [{ locationId, eventId: event.id, sceneScriptId: pack.scripts.find(script => script.eventId === event.id && script.slot === 'scene' && script.conditions.length === 0)!.id }],
    core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 80, stress: 30, injury, traits: { risk: 50, cognition: 50, affect } },
      inventory: { ...run.core.inventory, supply: stock, medkit: kit } }, companion: withCompanion ? companion : null }
}
function preferred(p: CatalogPack, run: CatalogRun, middle: string, late: string) {
  const available = catalogChoices(p, run).filter(c => previewCatalogAction(p, run, c.id).allowed)
  return available.find(c => c.destinationSegmentId === (run.visitIndex === 6 ? middle : late))
    ?? available.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
    ?? available.find(c => c.id === 'E02.supplies')
    ?? available.find(c => c.behavior.kind === 'escape' && c.behavior.route === 'short')
    ?? available.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null))
    ?? available[0]
}
function travel(p: CatalogPack, initial: CatalogRun, middle: string, late: string) {
  let run = initial
  for (let n = 0; n < 19; n++) {
    expect(run.phase).toBe('choice')
    const result = executeCatalogAction(p, run, preferred(p, run, middle, late).id)
    run = result.phase === 'result' ? acknowledgeCatalogResult(p, result, result.result!.resultId) : result
    expect(decodeCatalogSave(encodeCatalogSave({ ...origin, runId: initial.runId }, p, run), resolveAnswers).run).toEqual(run)
  }
  return run
}

describe('장소 고유 이야기와 실제 효과', () => {
  it('활성47곳은 독립 사건/기본 상황을 가지며 예약7곳은 잠금을 유지한다', () => {
    const active = pack.locations.filter(l => l.enabled !== false)
    const localEvents = active.map(l => pack.events.filter(e => e.locationIds.includes(l.id)))
    expect(active).toHaveLength(47)
    expect(localEvents.every(list => list.length === 1 && list[0].locationIds.length === 1)).toBe(true)
    expect(new Set(localEvents.map(([event]) => pack.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!.text.join(''))).size).toBe(47)
    expect(pack.manifest.slotPlan!.segments.find(s => s.id === 'research')!.lockedReason).toBeTruthy()
    expect(pack.locations.filter(l => l.enabled === false)).toHaveLength(7)
  })

  it('물자0/상한·부상·극단·동료 조건에서도 실행 가능한 선택과 대사/결과가 남는다', () => {
    for (const location of pack.locations.filter(l => l.enabled !== false)) {
      for (const [stock, kit, injury, affect, withCompanion] of [[0, 0, 0, 50, false], [3, 2, 1, 50, true], [1, 1, 2, 0, true], [1, 1, 0, 100, true]] as const) {
        const run = scene(location.id, stock, kit, injury, affect, withCompanion)
        const available = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
        expect(available.length, location.id).toBeGreaterThan(0)
        for (const choice of available) {
          if (withCompanion) expect(findDialogue(pack, catalogContext(pack, run), run.visits[0].eventId, 'opinion', choice.id.replace('companion:', '')), choice.id).toBeTruthy()
          const result = executeCatalogAction(pack, run, choice.id)
          const script = pack.scripts.find(s => s.id === result.result!.resultScriptId)!
          expect(matches(script.conditions, catalogContext(pack, result)), choice.id).toBe(true)
          const text = renderCatalogScript(pack, result, script.id).join(' ')
          expect(text).not.toContain('{{')
          if (result.result!.resolution.fatal) expect(text).not.toMatch(/다시 움직이자|다음 길도|괜찮아\?/)
        }
      }
    }
  })

  it.each(['pharmacy', 'surgery-prep', 'icu', 'electronics', 'train-carriage'])('%s의 처치함은 식량 대신 치료 도구를 주고 상한에서는 제안하지 않는다', location => {
    const run = scene(location, 1, 0)
    const choice = catalogChoices(pack, run).find(c => c.id.endsWith('.kit'))!
    const outcomes = Array.from({ length: 100 }, (_, n) => executeCatalogAction(pack, { ...run, rngState: Math.imul(n + 1, 0x9e3779b9) >>> 0 }, choice.id))
    const success = outcomes.find(r => r.result!.resolution.check.outcome === 'success')!
    const failure = outcomes.find(r => r.result!.resolution.check.outcome === 'failure')!
    expect(success.core.inventory).toMatchObject({ supply: 1, medkit: 1 })
    expect(failure.core.inventory).toMatchObject({ supply: 1, medkit: 0 })
    expect(pack.scripts.find(s => s.id === failure.result!.resultScriptId)!.slot).toBe('failure')
    expect(catalogChoices(pack, scene(location, 1, 2)).some(c => c.id.endsWith('.kit'))).toBe(false)
  })

  it.each(['bus-stop', 'hospital-security', 'medical-records', 'department-security', 'warehouse', 'station-office', 'subway-control'])('%s는 실제 기록을 읽은 경우에만 우회 정보를 준다', location => {
    const run = scene(location)
    const choices = catalogChoices(pack, run)
    const info = choices.find(c => c.behavior.kind === 'action' && c.behavior.variants.some(v => v.action.successEffects.some(e => e.kind === 'set-flag' && e.flag === 'routeKnown')))!
    expect(executeCatalogAction(pack, run, info.id).core.flags.routeKnown).toBe(true)
    const other = choices.find(c => c.id !== info.id)!
    expect(executeCatalogAction(pack, run, other.id).core.flags.routeKnown).toBe(false)
  })

  it('옥상 호출은 실제로 얻은 주파수가 있어야 확인하며, 정보 없는 청취는 경로를 열지 않는다', () => {
    const run = scene('hospital-rooftop-comms')
    expect(catalogChoices(pack, run)).toHaveLength(1)
    expect(executeCatalogAction(pack, run, catalogChoices(pack, run)[0].id).core.flags.routeKnown).toBe(false)
    const known = { ...run, core: { ...run.core, flags: { ...run.core.flags, helpEstablished: true } } }
    const contact = catalogChoices(pack, known).find(c => c.id.endsWith('.contact'))!
    expect(executeCatalogAction(pack, known, contact.id).core.flags.routeKnown).toBe(true)
  })

  it('높은 스트레스와 실제로 읽은 기록이 다음 장면 본문에 반영된다', () => {
    function arrive(locationId: string, stress: number, facts: Record<string, boolean>) {
      const start = createCatalogRun(pack, input)
      const run = { ...start, route: ['villa', locationId], facts,
        core: { ...start.core, protagonist: { ...start.core.protagonist, stress } } }
      const result = executeCatalogAction(pack, run, 'E01.safe')
      return acknowledgeCatalogResult(pack, result, result.result!.resultId)
    }
    const stressed = arrive('pharmacy', 85, {})
    expect(renderCatalogScript(pack, stressed, stressed.visits[1].sceneScriptId).join(' ')).toContain('어깨가 움츠러든다')
    const informed = arrive('outskirts-crossroads', 30, { 'hospital-records': true })
    const uninformed = arrive('outskirts-crossroads', 30, {})
    expect(renderCatalogScript(pack, informed, informed.visits[1].sceneScriptId).join(' ')).toContain('기록실에서 읽은')
    expect(renderCatalogScript(pack, uninformed, uninformed.visits[1].sceneScriptId).join(' ')).not.toContain('기록실에서 읽은')
  })

  it('식품관은 분배/처치이며 수술방 구조와 다르고, 이성 극단의 버리기는 물자1만 소비한다', () => {
    const food = scene('food-hall')
    const choice = catalogChoices(pack, food).find(c => c.id === 'E07.share-food')!
    const result = executeCatalogAction(pack, food, choice.id)
    expect(result.core.inventory.supply).toBe(0)
    expect(result.core.protagonist.traits.affect).toBe(58)
    expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ')).not.toMatch(/침대|수술|잔해/)
    for (const location of ['train-connection', 'evacuation-convoy']) {
      const run = scene(location, 3, 2, 0, 0)
      const discard = catalogChoices(pack, run).find(c => c.id.endsWith('.discard'))!
      const result = executeCatalogAction(pack, run, discard.id)
      expect(result.core.inventory).toMatchObject({ supply: 2, medkit: 2 })
    }
  })

  it('병원/행렬 위기에서 극단 본인 목표 제한과 독립 동료 대안이 유지된다', () => {
    const surgery = scene('operating-room', 1, 1, 0, 100, true)
    expect(currentGroup(pack, surgery).id).toBe('extreme')
    expect(catalogChoices(pack, surgery).some(c => c.id.startsWith('companion:'))).toBe(true)
    expect(allChoices(pack.events.find(e => e.id === 'E10')!).filter(c => c.judgment === 'rescue').length).toBeGreaterThan(0)
    const food = scene('food-hall', 1, 1, 0, 100)
    expect(catalogChoices(pack, food).every(c => c.goalId === 'rescue')).toBe(true)
  })
})

describe('고유 이야기의 완주·저장 호환', () => {
  it.each([['hospital', 'subway'], ['hospital', 'school'], ['department', 'subway'], ['department', 'school']])('%s → %s를19장면과 다음 회차 동료로 완주한다', (middle, late) => {
    const ending = travel(pack, createCatalogRun(pack, input), middle, late)
    expect(ending.phase).toBe('ending')
    expect(ending.result!.escape?.ending).toBe('escape')
    expect(ending.history.filter(h => h.judgment !== null)).toHaveLength(3)
    const legacy = catalogLegacy(pack, ending)!
    const next = createInheritedCatalogRun(pack, legacy, { ...input, runId: 'local-successor' })
    expect(next.companion?.traits).toEqual(ending.core.protagonist.traits)
    expect(travel(pack, next, middle, late).phase).toBe('ending')
  })

  it('이전19스테이지 저장은 예전 문구·선택·추첨 그대로 복원한다', () => {
    const old = makeStage19CatalogFixture()
    const run = createCatalogRun(old, input)
    const raw = encodeCatalogSave(origin, old, run)
    const restored = decodeCatalogSave(raw, resolveAnswers)
    expect(restored.pack.manifest.revision).toBe('catalog-stage19-1')
    expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
    expect(catalogChoices(restored.pack, restored.run)).toEqual(catalogChoices(old, run))
    expect(executeCatalogAction(restored.pack, restored.run, 'E01.safe')).toEqual(executeCatalogAction(old, run, 'E01.safe'))
    expect(pack.manifest.decisionEcho!.compatibleRevisions).not.toContain('catalog-stage19-1')
  })
})
