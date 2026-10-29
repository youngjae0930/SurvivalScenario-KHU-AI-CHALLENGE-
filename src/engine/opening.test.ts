import { describe, expect, it } from 'vitest'
import type { OpeningRun } from '../domain/opening'
import type { EngineResult, ResolvedQuestionnaireAnswer } from '../domain/types'
import { makeCoreState } from '../test/core-fixtures'
import { resolveCoreAction } from './actions'
import { acknowledgeOpeningResult, buildOpeningAction, createOpeningRun, executeOpeningAction, getOpeningContext, listOpeningActions, previewOpeningAction } from './opening'
import { getOpeningRules, parseOpeningRules } from './opening-content'

function value<T>(result: EngineResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
const answers: readonly ResolvedQuestionnaireAnswer[] = ['risk', 'cognition', 'affect'].flatMap(axis => [
  { questionId: `${axis}.1`, axis: axis as ResolvedQuestionnaireAnswer['axis'], delta: -10 as const },
  { questionId: `${axis}.2`, axis: axis as ResolvedQuestionnaireAnswer['axis'], delta: 10 as const },
])
function start(seed = 1): OpeningRun {
  return value(createOpeningRun({ runId: 'run-1', name: '테스트', seed, answers, contentRevision: 'opening-core-stress-1' }))
}
function execute(run: OpeningRun, actionId: string, treat = false): OpeningRun {
  return value(executeOpeningAction(run, getOpeningContext(run), { actionId, treat }))
}
function acknowledge(run: OpeningRun): OpeningRun {
  if (!run.result) throw new Error('결과 없음')
  return value(acknowledgeOpeningResult(run, getOpeningContext(run), run.result.resultId))
}
function choose(run: OpeningRun, actionId: string, treat = false): OpeningRun {
  return acknowledge(execute(run, actionId, treat))
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
}

describe('초반 E01~E04 진행', () => {
  it('확정 선택으로 네 사건을 지나면 E05 대기 지점이며 결말·계승은 만들지 않는다', () => {
    let run = start()
    expect(run).toMatchObject({ phase: 'choice', eventId: 'E01', revision: 0, history: [], judgmentCounts: { rescue: 0, self: 0 } })
    for (const [index, actionId] of ['E01.safe', 'E02.help', 'E03.observe', 'E04.maintain'].entries()) {
      const result = execute(run, actionId)
      expect(result).toMatchObject({ phase: 'result', eventId: `E0${index + 1}`, revision: index * 2 + 1 })
      expect(result.history).toHaveLength(index + 1)
      expect(result.result?.resolution.check).toMatchObject({ outcome: 'certain', rngState: 1 })
      run = acknowledge(result)
      expect(run.core).toBe(result.core)
      expect(run.history).toBe(result.history)
      expect(run.rngState).toBe(result.rngState)
    }
    expect(run).toMatchObject({
      phase: 'segment-complete', eventId: 'E04', nextEventId: 'E05', revision: 8, result: null,
      core: { protagonist: { stamina: 75, stress: 25, injury: 0, traits: { risk: 58, cognition: 42, affect: 58 } }, inventory: { supply: 0, medkit: 1, weapon: false }, flags: { rescueDecision: 'rescue', helpEstablished: true } },
      judgmentCounts: { rescue: 1, self: 0 },
    })
    expect(run).not.toHaveProperty('legacy')
    expect(run).not.toHaveProperty('ending')
    expect(listOpeningActions(run).ok).toBe(false)
    expect(executeOpeningAction(run, getOpeningContext(run), { actionId: 'E05.explore', treat: false }).ok).toBe(false)
    expect(acknowledgeOpeningResult(run, getOpeningContext(run), 'run-1:E04:result').ok).toBe(false)
  })

  it('위험 선택 성공은 무기·물자로 남고 난수는 두 번만 진행한다', () => {
    let run = choose(start(), 'E01.shortcut')
    expect(run.core.inventory.weapon).toBe(true)
    expect(run.rngState).toBe(270369)
    run = choose(run, 'E02.help')
    run = choose(run, 'E03.cross')
    expect(run.rngState).toBe(67634689)
    expect(run.core.inventory.supply).toBe(1)
    run = choose(run, 'E04.maintain')
    expect(run.core).toMatchObject({ protagonist: { stamina: 75, stress: 15, injury: 0, traits: { risk: 42, cognition: 58, affect: 58 } }, inventory: { supply: 0, weapon: true } })
    expect(run.rngState).toBe(67634689)
  })

  it('지름길 실패는 비용·부상을 남기며 물자 우선 판단과 회복 치료가 이어진다', () => {
    let run = execute(start(1495045943), 'E01.shortcut')
    expect(run.result?.resolution).toMatchObject({ check: { outcome: 'failure' }, state: { protagonist: { stamina: 60, stress: 40, injury: 1, traits: { risk: 42 } }, inventory: { weapon: false } } })
    run = choose(acknowledge(run), 'E02.supplies')
    run = choose(run, 'E03.observe')
    const rngBefore = run.rngState
    const withoutTreatment = value(previewOpeningAction(run, getOpeningContext(run), { actionId: 'E04.maintain', treat: false }))
    const withTreatment = value(previewOpeningAction(run, getOpeningContext(run), { actionId: 'E04.maintain', treat: true }))
    expect(withoutTreatment.action.costs.medkit).toBe(0)
    expect(withTreatment.action.costs.medkit).toBe(1)
    run = choose(run, 'E04.maintain', true)
    expect(run.core).toMatchObject({ protagonist: { stamina: 80, stress: 25, injury: 0 }, inventory: { supply: 1, medkit: 0 }, flags: { rescueDecision: 'self', helpEstablished: false } })
    expect(run.judgmentCounts).toEqual({ rescue: 0, self: 1 })
    expect(run.rngState).toBe(rngBefore)
    expect(run.history.at(-1)?.selection).toEqual({ actionId: 'E04.maintain', treat: true })
  })

  it('골목 즉시 통과 실패도 의도한 성향을 적용하며 휴식은 치료를 대신하지 않는다', () => {
    let run = choose(start(1495045943), 'E01.safe')
    run = choose(run, 'E02.help')
    run = execute(run, 'E03.cross')
    expect(run.result?.resolution).toMatchObject({ check: { outcome: 'failure' }, state: { protagonist: { injury: 1, stress: 40, stamina: 60, traits: { cognition: 58 } }, inventory: { supply: 0 } } })
    run = acknowledge(run)
    expect(value(listOpeningActions(run)).map(item => item.action.id)).toEqual(['E04.maintain', 'E04.rest'])
    expect(previewOpeningAction(run, getOpeningContext(run), { actionId: 'E04.rest', treat: true }).ok).toBe(false)
    run = choose(run, 'E04.rest')
    expect(run.core).toMatchObject({ protagonist: { injury: 1, stress: 30, stamina: 75 }, inventory: { supply: 0, medkit: 1 } })
  })

  it('미리보기·취소는 입력, 자원, 난수, 기록을 바꾸지 않고 반환 콘텐츠도 독립된다', () => {
    const run = start()
    const before = structuredClone(run)
    freeze(run)
    const first = value(listOpeningActions(run))
    const second = value(listOpeningActions(run))
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first[1]).toMatchObject({ allowed: true, check: { kind: 'probability', probability: { percent: 70 } }, action: { costs: { stamina: 10 } } })
    freeze(first)
    expect(value(previewOpeningAction(run, getOpeningContext(run), { actionId: 'E01.shortcut', treat: false }))).toEqual(second[1])
    execute(run, 'E01.shortcut')
    expect(run).toEqual(before)
  })

  it('오래된 회차·사건·revision과 다른 사건 행동을 거부한다', () => {
    const run = start()
    const context = getOpeningContext(run)
    const selection = { actionId: 'E01.safe', treat: false }
    for (const wrong of [{ ...context, runId: 'other' }, { ...context, eventId: 'E02' as const }, { ...context, revision: 1 }]) {
      expect(executeOpeningAction(run, wrong, selection)).toMatchObject({ ok: false, error: { code: 'stale-context' } })
    }
    for (const actionId of ['E02.help', 'unknown', 'E01.safe;eval()']) {
      expect(executeOpeningAction(run, context, { actionId, treat: false }).ok).toBe(false)
    }
    expect(executeOpeningAction(run, context, { ...selection, treat: true }).ok).toBe(false)
    expect(acknowledgeOpeningResult(run, context, 'run-1:E01:result').ok).toBe(false)
  })

  it('선택과 결과 확인을 최신 상태에서 중복 처리하지 않는다', () => {
    const initial = start()
    const result = execute(initial, 'E01.safe')
    expect(executeOpeningAction(result, getOpeningContext(initial), { actionId: 'E01.safe', treat: false })).toMatchObject({ ok: false, error: { code: 'stale-context' } })
    expect(executeOpeningAction(result, getOpeningContext(result), { actionId: 'E01.safe', treat: false }).ok).toBe(false)
    expect(acknowledgeOpeningResult(result, getOpeningContext(result), 'foreign-result').ok).toBe(false)
    const next = acknowledge(result)
    expect(acknowledgeOpeningResult(next, getOpeningContext(result), result.result!.resultId)).toMatchObject({ ok: false, error: { code: 'stale-context' } })
    expect(acknowledgeOpeningResult(next, getOpeningContext(next), result.result!.resultId).ok).toBe(false)
    expect(next.core.protagonist.traits.risk).toBe(58)
    expect(next.history).toHaveLength(1)
  })

  it.each([0, 1, 1495045943, 0xffffffff])('seed %i에서 모든 기본 경로가 같은 입력으로 재현된다', seed => {
    for (let mask = 0; mask < 16; mask++) {
      const play = () => {
        let run = start(seed)
        for (const [index, choices] of [['E01.safe', 'E01.shortcut'], ['E02.help', 'E02.supplies'], ['E03.observe', 'E03.cross'], ['E04.maintain', 'E04.rest']].entries()) {
          run = choose(run, choices[(mask >> index) & 1])
        }
        return run
      }
      const result = play()
      expect(result).toEqual(play())
      expect(result.phase).toBe('segment-complete')
      expect(result.history.map(item => item.eventId)).toEqual(['E01', 'E02', 'E03', 'E04'])
      expect(result.judgmentCounts.rescue + result.judgmentCounts.self).toBe(1)
    }
  })

  it('초반 성향이 극단에 도달해도 튜토리얼 행동 두 개를 유지한다', () => {
    const extremeAnswers = answers.map(answer => ({ ...answer, delta: (answer.axis === 'affect' ? 10 : -10) as -10 | 10 }))
    let run = value(createOpeningRun({ runId: 'extreme', name: '극단', answers: extremeAnswers, seed: 1 }))
    run = choose(run, 'E01.shortcut')
    expect(run.core.protagonist.traits.risk).toBe(22)
    run = choose(run, 'E02.help')
    expect(run.core.protagonist.traits.affect).toBe(78)
    expect(value(listOpeningActions(run)).every(item => item.allowed)).toBe(true)
    run = choose(run, 'E03.observe')
    expect(run.core.protagonist.traits.cognition).toBe(22)
    expect(value(listOpeningActions(run)).map(item => item.action.id)).toEqual(['E04.maintain', 'E04.rest'])
  })

  it('잘못된 초기화·단계·기록 수·난수 상태를 거부한다', () => {
    const input = { runId: 'run', name: '검증', answers, seed: 1 }
    expect(createOpeningRun({ ...input, runId: ' ' }).ok).toBe(false)
    expect(createOpeningRun({ ...input, seed: -1 }).ok).toBe(false)
    expect(createOpeningRun({ ...input, answers: answers.slice(1) }).ok).toBe(false)
    const run = start()
    for (const corrupted of [{ ...run, phase: 'segment-complete' as const }, { ...run, revision: 1 }, { ...run, rngState: 0 }, { ...run, judgmentCounts: { rescue: 1, self: 0 } }, { ...run, history: Array(1) }]) {
      expect(listOpeningActions(corrupted).ok).toBe(false)
    }
  })
})

describe('초반 규칙 콘텐츠 경계', () => {
  it('물자가 없을 때 돕기는 스태미나 부담으로 대체하며 성공 보상으로 비용을 빌리지 않는다', () => {
    for (const supply of [0, 1]) {
      const state = makeCoreState({ supply, stamina: 0 })
      const registered = value(buildOpeningAction('E02', state, { actionId: 'E02.help', treat: false }))
      expect(registered.action.costs).toEqual({ stamina: supply === 0 ? 10 : 0, supply, medkit: 0 })
      const result = value(resolveCoreAction({ state, eventId: 'E02', phase: 'choice', companionPresent: false, cooperating: false, action: registered.action }, 1))
      expect(result.state).toMatchObject({ protagonist: { stamina: 0, traits: { affect: 58 } }, inventory: { supply: 0 }, flags: { rescueDecision: 'rescue', helpEstablished: true } })
      expect(result.check.rngState).toBe(1)
    }
  })

  it('파싱 때 순서·중복·동적 조건·미완성 판정·다른 사건 참조를 거부한다', () => {
    const rules = value(getOpeningRules())
    const bad = [
      { ...rules, rulesVersion: 'other' },
      { ...rules, events: [...rules.events].reverse() },
      { ...rules, events: Array(4) },
      { ...rules, events: [{ ...rules.events[0], nextEventId: 'E12' }, ...rules.events.slice(1)] },
    ]
    for (const data of bad) expect(parseOpeningRules(data).ok).toBe(false)
    for (const mutation of ['condition', 'check', 'event', 'duplicate', 'effect', 'missing-variant']) {
      const data = JSON.parse(JSON.stringify(rules))
      const choice = data.events[0].choices[1]
      if (mutation === 'condition') choice.variants[0].when = 'eval'
      if (mutation === 'check') delete choice.variants[0].action.check.physical
      if (mutation === 'event') choice.variants[0].action.eventId = 'E02'
      if (mutation === 'duplicate') data.events[0].choices[1] = data.events[0].choices[0]
      if (mutation === 'effect') choice.variants[0].action.successEffects = [{ kind: 'script', code: 'eval()' }]
      if (mutation === 'missing-variant') data.events[1].choices[0].variants.pop()
      expect(parseOpeningRules(data).ok, mutation).toBe(false)
    }
    expect(getOpeningRules()).toEqual({ ok: true, value: rules })
  })
})
