import { describe, expect, it } from 'vitest'
import type { OpeningRun } from '../domain/opening'
import { makeCoreState } from '../test/core-fixtures'
import { advanceOpening, chooseOpening, engineValue as value, makeOrigin, resolveOpening, startOpening } from '../test/opening-paths'
import { previewCoreAction, resolveCoreAction } from './actions'
import { buildOpeningAction, continueOpeningSegment, executeOpeningAction, getOpeningContext, getOpeningLegacy, listOpeningActions } from './opening'
import { toGameView, toPreview } from '../app/view-models/opening'
import { getOpeningRules } from './opening-content'

function hospital(risk: 'normal' | 'adventure' | 'stability' = 'normal', seed = 1): OpeningRun {
  let run = startOpening(makeOrigin(seed, risk))
  for (const action of [risk === 'adventure' ? 'E01.shortcut' : 'E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest']) run = chooseOpening(run, action)
  return run
}
const ids = (run: OpeningRun) => value(listOpeningActions(run)).map(preview => preview.action.id)

describe('병원 E05/E06 실제 진행', () => {
  it('일반 탐사·철수는 실제 내부 접근을 남기고 E07 대기까지 진행한다', () => {
    let run = hospital()
    expect(run).toMatchObject({ eventId: 'E05', phase: 'choice', revision: 8 })
    expect(ids(run)).toEqual(['E05.explore', 'E05.bypass'])
    run = chooseOpening(run, 'E05.explore')
    expect(run).toMatchObject({ eventId: 'E06', core: { flags: { access: true } }, rngState: 270369 })
    run = chooseOpening(run, 'E06.withdraw')
    expect(run).toMatchObject({ phase: 'segment-complete', nextEventId: 'E07', revision: 12, core: { flags: { access: true } }, rngState: 270369 })
    expect(getOpeningLegacy(run)).toBe(null)
    expect(executeOpeningAction(run, getOpeningContext(run), { actionId: 'E06.withdraw', treat: false }).ok).toBe(false)
  })

  it('우회는 접근을 false로 남기고, 잔여 회수는 물자만 얻는다', () => {
    let run = chooseOpening(hospital(), 'E05.bypass')
    expect(run.rngState).toBe(1)
    expect(ids(run)).toEqual(['E06.withdraw', 'E06.salvage'])
    run = chooseOpening(run, 'E06.salvage')
    expect(run.core).toMatchObject({ inventory: { supply: 3 }, flags: { access: false } })
    expect(run.rngState).toBe(270369)
  })

  it('모험 극단은 두 돌입만 제공하고 같은 목표·서로 다른 비용/확률을 공개한다', () => {
    const run = hospital('adventure')
    expect(run.core.protagonist.traits.risk).toBe(22)
    const previews = value(listOpeningActions(run))
    expect(previews.map(preview => preview.action.id)).toEqual(['E05.rush', 'E05.tools'])
    expect(previews.map(preview => preview.goalId)).toEqual(['clear', 'clear'])
    expect(previews[0].action).toMatchObject({ costs: { stamina: 15, supply: 0 }, check: { base: 60, physical: true, weaponBonus: true } })
    expect(previews[1].action).toMatchObject({ requires: { supply: 1 }, costs: { stamina: 10, supply: 1 }, check: { base: 75 } })
    const tools = chooseOpening(run, 'E05.tools')
    expect(tools.core).toMatchObject({ inventory: { supply: 1, medkit: 2 }, flags: { access: true }, protagonist: { traits: { risk: 14 } } })
    const rush = chooseOpening(run, 'E05.rush')
    expect(rush.core.protagonist.stress).toBe(run.core.protagonist.stress + 5)
    expect(executeOpeningAction(run, getOpeningContext(run), { actionId: 'E05.bypass', treat: false }).ok).toBe(false)
    expect(toGameView(run)).toMatchObject({ kind: 'choice', notices: [expect.stringContaining('모험 극단')] })
  })

  it('안정 극단의 짐 버리기는 확정·물자 전량 포기·스트레스/부상 감소이며 난수를 쓰지 않는다', () => {
    let run = chooseOpening(hospital('stability'), 'E05.bypass')
    expect(ids(run)).toEqual(['E06.abandon', 'E06.defend'])
    const before = run
    run = chooseOpening(run, 'E06.abandon')
    expect(run.rngState).toBe(before.rngState)
    expect(run.core).toMatchObject({ inventory: { supply: 0 }, protagonist: { injury: 0, stress: 10, traits: { risk: 94 } } })
    expect(value(listOpeningActions(before)).map(preview => preview.goalId)).toEqual(['withdraw', 'withdraw'])
    expect(executeOpeningAction(before, getOpeningContext(before), { actionId: 'E06.salvage', treat: false }).ok).toBe(false)
  })

  it.each([['E05', 22, 'E05.rush', 'E05.bypass'], ['E05', 23, 'E05.bypass', 'E05.rush'], ['E06', 77, 'E06.withdraw', 'E06.abandon'], ['E06', 78, 'E06.abandon', 'E06.withdraw']] as const)('%s risk%i에서 지정 극 경계를 적용한다', (event, risk, allowed, denied) => {
    const base = makeCoreState()
    const state = { ...base, protagonist: { ...base.protagonist, traits: { ...base.protagonist.traits, risk } } }
    expect(buildOpeningAction(event, state, { actionId: allowed, treat: false }).ok).toBe(true)
    expect(buildOpeningAction(event, state, { actionId: denied, treat: false }).ok).toBe(false)
  })

  it.each([['E05', 0, ['E05.rush', 'E05.tools']], ['E05', 100, ['E05.explore', 'E05.bypass']], ['E06', 0, ['E06.withdraw', 'E06.salvage']], ['E06', 100, ['E06.abandon', 'E06.defend']]] as const)('%s risk%i의 최저 자원에서도 한 행동 이상을 실행 가능하게 남긴다', (eventId, risk, actions) => {
    const base = makeCoreState({ stamina: 0, stress: 100, supply: 0, medkit: 0, injury: 2 })
    const state = { ...base, protagonist: { ...base.protagonist, traits: { ...base.protagonist.traits, risk } } }
    const previews = actions.map(actionId => value(buildOpeningAction(eventId, state, { actionId, treat: false })).action)
      .map(action => value(previewCoreAction({ state, eventId, action, phase: 'choice', companionPresent: false, cooperating: false })))
    expect(previews.some(preview => preview.allowed)).toBe(true)
    if (risk === (eventId === 'E05' ? 0 : 100)) expect(previews[1].allowed).toBe(false)
  })

  it('E06 방어 성공은 물자1과 체력10을 쓰고 스트레스15·부상1을 줄인다', () => {
    const base = makeCoreState({ injury: 2, stress: 50 })
    const state = { ...base, protagonist: { ...base.protagonist, traits: { ...base.protagonist.traits, risk: 78 } } }
    const action = value(buildOpeningAction('E06', state, { actionId: 'E06.defend', treat: false })).action
    const result = value(resolveCoreAction({ state, action, eventId: 'E06', phase: 'choice', companionPresent: false, cooperating: false }, 1))
    expect(result).toMatchObject({ phase: 'result', check: { outcome: 'success' }, state: { protagonist: { stress: 35, injury: 1, stamina: 60 }, inventory: { supply: 0 } } })
  })

  it('E05 탐사의 장비 보정은 무기 보유 때만 +10이고 모험/분석을 반씩 반영한다', () => {
    const run = hospital()
    const preview = value(listOpeningActions(run))[0]
    expect(preview.action.check).toMatchObject({ traitWeights: [{ axis: 'risk', pole: 'left', weight: 0.5 }, { axis: 'cognition', pole: 'left', weight: 0.5 }], weaponBonus: true })
    const armed = { ...run, core: { ...run.core, inventory: { ...run.core.inventory, weapon: true } } }
    const withWeapon = value(listOpeningActions(armed))[0]
    if (preview.check.kind !== 'probability' || withWeapon.check.kind !== 'probability') throw new Error('확률 아님')
    expect(withWeapon.check.probability.percent - preview.check.probability.percent).toBe(10)
    expect(withWeapon.check.probability.equipment).toBe(10)
  })

  it('이전 E04 경계 연결은 기존 선택·난수·수치를 그대로 유지하고 다시 연결할 수 없다', () => {
    let old = startOpening(makeOrigin(), 'opening-core-stress-1')
    for (const action of ['E01.safe', 'E02.help', 'E03.observe', 'E04.rest']) old = chooseOpening(old, action)
    const next = value(continueOpeningSegment(old, getOpeningContext(old)))
    expect(next).toMatchObject({ eventId: 'E05', revision: 8, phase: 'choice', contentRevision: 'hospital-core-stress-2' })
    expect(next.core).toBe(old.core); expect(next.history).toBe(old.history); expect(next.rngState).toBe(old.rngState)
    expect(continueOpeningSegment(next, getOpeningContext(next)).ok).toBe(false)
    expect(continueOpeningSegment(old, { ...getOpeningContext(old), revision: 9 }).ok).toBe(false)
  })

  it('추가된 병원 규칙은 이전 네 사건 규칙을 변경하지 않는다', () => {
    expect(value(getOpeningRules()).events.slice(0, 4)).toEqual(value(getOpeningRules('opening-core-stress-1')).events)
  })

  it('세 번째 부상은 즉시 종료하고 실제 대표 기록과 미도달 null을 계승한다', () => {
    let run = startOpening(makeOrigin(1495045954))
    for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest']) run = chooseOpening(run, action)
    expect(run.core.protagonist.injury).toBe(2)
    const issued = value(listOpeningActions(run))[0]
    expect(toPreview(run, issued, 'fatal-preview').warnings).toContain('실패하면 세 번째 부상으로 여정이 종료됩니다.')
    run = resolveOpening(run, 'E05.explore')
    expect(run).toMatchObject({ phase: 'ending', revision: 9, core: { protagonist: { injury: 3, stress: 50 } }, result: { resolution: { check: { outcome: 'failure' } } } })
    expect(getOpeningLegacy(run)).toMatchObject({ name: '병원 생존자', sourceRunId: run.runId, ending: 'escape-failed', representativeActions: { E02: 'E02.supplies', E07: null, E10: null }, judgmentCounts: { self: 1, rescue: 0 }, traits: run.core.protagonist.traits })
    expect(toGameView(run)).toMatchObject({ kind: 'ending', ending: 'escape-failed', status: { injury: 3 }, newRun: { kind: 'locked' } })
    expect(() => advanceOpening(run)).toThrow()
    expect(executeOpeningAction(run, getOpeningContext(run), { actionId: 'E05.explore', treat: false }).ok).toBe(false)
  })

  it('설문64조합·위험 성패·두 선택 전략에서 종료 또는 E07 경계까지 진행할 수 있다', () => {
    for (let mask = 0; mask < 64; mask++) for (const seed of [1, 1495045954]) for (const strategy of [0, 1]) {
      const origin = makeOrigin(seed)
      let run = startOpening({ ...origin, answers: origin.answers.map((answer, index) => ({ ...answer, answerId: (mask >> index) & 1 ? 'a' : 'b' })) })
      for (let event = 0; event < 6 && run.phase === 'choice'; event++) {
        const options = value(listOpeningActions(run)).filter(preview => preview.allowed)
        expect(options.length).toBeGreaterThan(0)
        const selected = options[Math.min(strategy, options.length - 1)]
        run = chooseOpening(run, selected.action.id)
      }
      expect(['ending', 'segment-complete']).toContain(run.phase)
      expect(run.history.length).toBeGreaterThanOrEqual(5)
      expect(run.history.length).toBeLessThanOrEqual(6)
    }
  })
})
