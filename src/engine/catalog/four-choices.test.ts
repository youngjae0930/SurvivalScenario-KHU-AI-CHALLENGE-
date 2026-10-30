import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import type { CatalogRun } from '../../domain/catalog'
import { makeFourChoiceCatalogFixture, makeOpeningCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { acknowledgeCatalogResult, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeFourChoiceCatalogFixture()
function start(seed = 1) {
  const origin = makeOrigin(seed)
  const resolved = resolveAnswers(origin.answers)
  if (!resolved.ok) throw new Error('설문 오류')
  return { origin, run: createCatalogRun(pack, { ...origin, answers: resolved.value }) }
}
function next(run: CatalogRun) { return acknowledgeCatalogResult(pack, run, run.result!.resultId) }
function arrive(index: number): CatalogRun {
  let { run } = start()
  const path = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass']
  for (let i = 0; i < index; i++) run = next(executeCatalogAction(pack, run, path[i]))
  return run
}

describe('새 회차의 네 선택과 기존 회차 보존', () => {
  it.each([0, 5])('빈 그룹과 중복 행동으로 채운 %i개 그룹은 등록을 거부한다', count => {
    const source = structuredClone(pack)
    const event = source.events[0]
    const choices = event.groups[0].choices
    const invalid = { ...source, events: [{ ...event, groups: [{ ...event.groups[0], choices: count < 4 ? choices.slice(0, count) : [...choices, choices[0]] }] }, ...source.events.slice(1)] }
    expect(() => compileCatalog(invalid)).toThrow()
  })

  it('기존 두 선택 행동의 비용·조건·효과는 전부 유지한다', () => {
    const old = makeOpeningCatalogFixture()
    for (const event of old.events) {
      const current = pack.events.find(item => item.id === event.id)!
      for (const group of event.groups) {
        const choices = current.groups.find(item => item.id === group.id)!.choices
        expect(choices).toHaveLength(4)
        expect(choices.slice(0, 2)).toEqual(group.choices)
      }
    }
  })

  it('모든 사건·극단 경계에서 자원이 없어도 네 칸을 표시하고 실행 가능한 대안을 유지한다', () => {
    for (let index = 0; index < 6; index++) {
      const base = arrive(index)
      for (const risk of [0, 22, 23, 77, 78, 100]) {
        const run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, stamina: 0, traits: { ...base.core.protagonist.traits, risk } }, inventory: { supply: 0, medkit: 0, weapon: false } } }
        const view = catalogGameView(pack, run)
        if (view.kind !== 'choice') throw new Error('선택 아님')
        expect(view.actions).toHaveLength(4)
        expect(view.actions.some(action => action.availability.kind === 'available')).toBe(true)
        const group = currentGroup(pack, run)
        if (group.id === 'extreme') expect(new Set(group.choices.map(choice => choice.goalId)).size).toBe(1)
        for (const action of view.actions.filter(action => action.availability.kind === 'locked')) {
          expect(() => executeCatalogAction(pack, run, action.actionId)).toThrow()
        }
      }
    }
  })

  it('일반·극단의 모든 선택에 미리보기·비용·효과·성패 문구를 연결한다', () => {
    const seen = new Set<string>()
    const outcomes = new Set<string>()
    for (let index = 0; index < 6; index++) {
      const base = arrive(index)
      for (const risk of [0, 50, 100]) {
        const run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, stress: 50, stamina: 70, injury: 1, traits: { ...base.core.protagonist.traits, risk } }, inventory: { supply: 3, medkit: 2, weapon: true } } }
        for (const choice of currentGroup(pack, run).choices) {
          const before = JSON.stringify(run)
          const preview = previewCatalogAction(pack, run, choice.id)
          expect(preview.allowed).toBe(true)
          expect(JSON.stringify(run)).toBe(before)
          for (const rngState of [1, 1495045954]) {
            const result = executeCatalogAction(pack, { ...run, rngState }, choice.id)
            expect(renderCatalogScript(pack, result, result.result!.resultScriptId).length).toBeGreaterThan(0)
            outcomes.add(result.result!.resolution.check.outcome)
            seen.add(choice.id)
          }
        }
      }
    }
    expect(seen).toEqual(new Set(pack.events.flatMap(event => event.groups.flatMap(group => group.choices.map(choice => choice.id)))))
    expect(outcomes).toContain('failure')
    expect(outcomes).toContain('success')
  })

  it('응급 처치는 대상에 따라 내 도구만 소비하거나 내 부상을 줄인다', () => {
    const other = arrive(1)
    const helped = executeCatalogAction(pack, other, 'E02.first-aid')
    expect(helped.core.inventory.medkit).toBe(other.core.inventory.medkit - 1)
    expect(helped.core.protagonist.injury).toBe(other.core.protagonist.injury)
    expect(helped.core.flags.helpEstablished).toBe(true)
    expect(helped.judgmentCounts.rescue).toBe(other.judgmentCounts.rescue + 1)
    const base = arrive(3)
    const injured = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, injury: 2 } } }
    const treated = executeCatalogAction(pack, injured, 'E04.first-aid')
    expect(treated.core.protagonist.injury).toBe(1)
    expect(treated.core.inventory.medkit).toBe(injured.core.inventory.medkit - 1)
    expect(treated.core.inventory.supply).toBe(injured.core.inventory.supply)
    expect(treated.core.protagonist.stamina).toBe(injured.core.protagonist.stamina)
  })

  it.each([1, 1495045954])('추가 선택으로 진행한 새 회차도 모든 단계에서 같은 결과로 저장·복원한다 (seed %i)', seed => {
    const paths = [
      ['E01.plan', 'E02.first-aid', 'E03.wait', 'E04.organize', 'E05.prepare', 'E06.search-kit'],
      ['E01.compose', 'E02.search-cabinet', 'E03.distract', 'E04.first-aid', 'E05.slow-bypass', 'E06.search-kit'],
    ]
    for (const path of paths) {
      let { run } = start(seed)
      const { origin } = start(seed)
      while (run.phase === 'choice') {
        expect(currentGroup(pack, run).choices).toHaveLength(4)
        run = executeCatalogAction(pack, run, path[run.visitIndex])
        const loaded = decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers)
        expect(loaded.run).toEqual(run)
        if (run.phase === 'result') {
          run = next(run)
          expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
        }
      }
      expect(['segment-complete', 'ending']).toContain(run.phase)
    }
  })

  it('이전 schema6 저장은 두 선택인 고정 팩을 그대로 재개한다', () => {
    const old = makeOpeningCatalogFixture()
    const { origin } = start()
    const answers = resolveAnswers(origin.answers)
    if (!answers.ok) throw new Error('설문 오류')
    const run = createCatalogRun(old, { ...origin, answers: answers.value })
    const raw = encodeCatalogSave(origin, old, run)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(currentEvent(loaded.pack, loaded.run).groups[0].choices).toHaveLength(2)
    expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
    expect(pack.manifest.revision).not.toBe(loaded.pack.manifest.revision)
  })
})
