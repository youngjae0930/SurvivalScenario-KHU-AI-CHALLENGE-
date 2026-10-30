import { describe, expect, it } from 'vitest'
import { createProductClient } from '../../app/catalog-client'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import type { SaveStore } from '../../storage/browser-store'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeContactCatalogFixture, makeFinalRestCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { getEscapeOptions } from '../escape'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeFinalRestCatalogFixture()
function atFinalRest(help = false, injured = false, content: CatalogPack = pack) {
  const origin = makeOrigin(injured ? 16000 : 1)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문 오류')
  let run = createCatalogRun(content, { ...origin, answers: answers.value })
  for (const id of [injured ? 'E01.shortcut' : 'E01.safe', help ? 'E02.help' : 'E02.supplies', 'E03.observe', 'E04.rest', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', help ? 'E10.network' : 'E10.signal']) {
    run = executeCatalogAction(content, run, id)
    run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  return { origin, run }
}
function state(run: CatalogRun, stamina: number, stress: number, injury: number, supply: number, medkit = 1): CatalogRun {
  return { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina, stress, injury }, inventory: { ...run.core.inventory, supply, medkit } } }
}

describe('E11 최종 정비와 탈출 준비', () => {
  it('기존 열 사건을 보존하고 150개 seed에서 통신소 뒤 차량 대기소를 한 번 방문한다', () => {
    const previous = makeContactCatalogFixture()
    for (const key of ['events', 'locations', 'scripts'] as const) {
      for (const entry of previous[key]) expect(pack[key].find(item => item.id === entry.id)).toEqual(entry)
    }
    for (let seed = 1; seed <= 150; seed++) {
      const { route } = planRoute(pack, seed * 17389)
      expect(route).toHaveLength(11)
      expect(route.filter(id => id === 'vehicle-shelter')).toHaveLength(1)
      expect(route.indexOf('vehicle-shelter')).toBe(route.indexOf('relay-station') + 1)
    }
    const { run } = atFinalRest()
    expect(run.history).toHaveLength(10)
    expect(currentEvent(pack, run).id).toBe('E11')
  })

  it.each([0, 22, 23, 77, 78, 100])('성향%i와 무자원 상태에서도 극단 없이 네 선택과 휴식을 제공한다', affect => {
    const base = state(atFinalRest().run, 0, 100, 2, 0, 0)
    const run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, traits: { risk: affect, cognition: affect, affect } } } }
    const group = currentGroup(pack, run)
    expect(group.choices).toHaveLength(4)
    expect(previewCatalogAction(pack, run, 'E11.maintain').allowed).toBe(true)
    expect(previewCatalogAction(pack, run, 'E11.rest').allowed).toBe(true)
    const view = catalogGameView(pack, run)
    if (view.kind !== 'choice') throw new Error('선택 아님')
    expect(view.treatmentActionIds).toEqual(['E11.maintain'])
    expect(view.actions.find(action => action.actionId === 'E11.first-aid')?.availability).toMatchObject({ kind: 'locked', reasons: expect.any(Array) })
    expect(view.notices.join(' ')).toContain('체력 15 이상·부상 1 이하')
    expect(view.notices.join(' ')).toContain('통로 정보 확보·체력 30 이상·부상 2 이하')
  })

  it.each([0, 1, 3])('물자%i의 정비는 실제 재고로 소모와 회복량을 결정한다', supply => {
    const run = state(atFinalRest().run, 30, 50, 2, supply)
    const preview = previewCatalogAction(pack, run, 'E11.maintain')
    expect(preview.action.costs).toEqual({ stamina: 0, supply: supply ? 1 : 0, medkit: 0 })
    const result = executeCatalogAction(pack, run, 'E11.maintain')
    expect(result.core.protagonist).toMatchObject({ stamina: supply ? 55 : 40, stress: supply ? 35 : 45, injury: 2 })
    expect(result.core.inventory.supply).toBe(Math.max(0, supply - 1))
    expect(result.core.inventory.medkit).toBe(1)
    expect(result.rngState).toBe(run.rngState)
  })

  it('정비와 선택적 치료를 한 번에 처리하고 취소/미리보기에서는 상태와 난수를 소비하지 않는다', () => {
    const run = state(atFinalRest().run, 30, 50, 2, 1)
    const before = structuredClone(run)
    const preview = previewCatalogAction(pack, run, 'E11.maintain', true)
    expect(run).toEqual(before)
    expect(preview.action.costs).toEqual({ stamina: 0, supply: 1, medkit: 1 })
    const shown = catalogPreviewView(pack, run, preview, 'preview')
    expect(shown.outcomes.success.join(' ')).toContain('부상 -1')
    const result = executeCatalogAction(pack, run, 'E11.maintain', true)
    expect(result.core.protagonist).toMatchObject({ stamina: 55, stress: 35, injury: 1 })
    expect(result.core.inventory).toMatchObject({ supply: 0, medkit: 0 })
    expect(result.result?.treat).toBe(true)
    expect(result.history).toHaveLength(11)
    expect(() => executeCatalogAction(pack, result, 'E11.maintain', true)).toThrow()
    const complete = acknowledgeCatalogResult(pack, result, result.result!.resultId)
    expect(() => executeCatalogAction(pack, complete, 'E11.maintain')).toThrow()
    expect(() => acknowledgeCatalogResult(pack, complete, result.result!.resultId)).toThrow()
    expect(complete.core).toEqual(result.core)
  })

  it('휴식·도구 처치·장비 정리는 서로 다른 자원을 사용하며 중복 치료를 허용하지 않는다', () => {
    const run = state(atFinalRest().run, 30, 50, 2, 2)
    for (const [id, stamina, stress, injury, medkit] of [
      ['E11.rest', 45, 40, 2, 1], ['E11.first-aid', 30, 45, 1, 0], ['E11.organize', 25, 35, 2, 1],
    ] as const) {
      const result = executeCatalogAction(pack, run, id)
      expect(result.core.protagonist).toMatchObject({ stamina, stress, injury })
      expect(result.core.inventory).toMatchObject({ supply: 2, medkit })
      expect(result.core.protagonist.traits).toEqual(run.core.protagonist.traits)
      expect(result.core.flags).toEqual(run.core.flags)
      expect(result.judgmentCounts).toEqual(run.judgmentCounts)
      expect(result.rngState).toBe(run.rngState)
      expect(result.result?.resolution.check.outcome).toBe('certain')
      expect(renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ').length).toBeGreaterThan(0)
      expect(() => previewCatalogAction(pack, run, id, true)).toThrow()
    }
    for (const input of [state(run, 30, 50, 0, 1, 1), state(run, 30, 50, 2, 1, 0)]) {
      expect(() => previewCatalogAction(pack, input, 'E11.maintain', true)).toThrow()
    }
  })

  it('회복 상하한을 지키고 부상 없는 도구 점검은 부상을 음수로 만들지 않는다', () => {
    const full = state(atFinalRest().run, 95, 3, 1, 1)
    const result = executeCatalogAction(pack, full, 'E11.maintain', true)
    expect(result.core.protagonist).toMatchObject({ stamina: 100, stress: 0, injury: 0 })
    const healthy = executeCatalogAction(pack, state(full, 10, 3, 0, 0), 'E11.first-aid')
    expect(healthy.core.protagonist).toMatchObject({ stamina: 10, stress: 0, injury: 0 })
    expect(healthy.core.inventory.medkit).toBe(0)
    const exhausted = executeCatalogAction(pack, state(full, 0, 3, 2, 0), 'E11.organize')
    expect(exhausted.core.protagonist).toMatchObject({ stamina: 0, stress: 0, injury: 2 })
  })

  it('E10 통로 정보를 보존해 실제 E12 공통 조건에서 치료/회복의 영향을 확인한다', () => {
    for (const help of [false, true]) {
      const { run } = atFinalRest(help)
      expect(renderCatalogScript(pack, run, run.visits.at(-1)!.sceneScriptId).join(' ')).toContain(help ? '우회 통로 정보가 남아' : '확인하지 못한 상태')
      const wounded = state(run, 10, 50, 2, 1)
      const before = getEscapeOptions(wounded.core)
      if (!before.ok) throw new Error('탈출 조건 오류')
      expect(before.value.find(option => option.route === 'request')?.allowed).toBe(true)
      const rested = executeCatalogAction(pack, wounded, 'E11.maintain')
      const options = getEscapeOptions(rested.core)
      if (!options.ok) throw new Error('탈출 조건 오류')
      expect(options.value.find(option => option.route === 'short')?.allowed).toBe(false)
      expect(options.value.find(option => option.route === 'detour')?.allowed).toBe(help)
      const treated = executeCatalogAction(pack, wounded, 'E11.maintain', true)
      const treatedOptions = getEscapeOptions(treated.core)
      if (!treatedOptions.ok) throw new Error('탈출 조건 오류')
      expect(treatedOptions.value.find(option => option.route === 'short')?.allowed).toBe(true)
      expect(treated.core.flags).toEqual(run.core.flags)
      expect(catalogLegacy(pack, treated)).toBeNull()
    }
  })

  it('실제 부상 회차의 모든 정비 행동과 치료 유무를 저장/복원하며 E12 대기는 결말이 아니다', () => {
    for (const help of [false, true]) {
      const { origin, run } = atFinalRest(help, true)
      expect(run.core.protagonist.injury).toBe(1)
      for (const [id, treat] of [['E11.maintain', false], ['E11.maintain', true], ['E11.rest', false], ['E11.first-aid', false], ['E11.organize', false]] as const) {
        const result = executeCatalogAction(pack, run, id, treat)
        const complete = acknowledgeCatalogResult(pack, result, result.result!.resultId)
        for (const checkpoint of [run, result, complete]) expect(decodeCatalogSave(encodeCatalogSave(origin, pack, checkpoint), resolveAnswers).run).toEqual(checkpoint)
        expect(catalogGameView(pack, complete)).toMatchObject({ kind: 'segment-complete', nextEventId: 'E12' })
        expect(catalogLegacy(pack, complete)).toBeNull()
        expect(complete.judgmentCounts).toEqual(run.judgmentCounts)
      }
    }
  })

  it('치료 저장 실패는 이전 상태를 유지하고 도구/물자를 중복 사용하지 않고 같은 후보를 재시도한다', async () => {
    const { origin, run } = atFinalRest(false, true)
    let raw = encodeCatalogSave(origin, pack, run)
    let fail = true
    const candidates: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(expected).toBe(raw)
      candidates.push(next)
      if (fail) throw new Error('quota')
      raw = next
    } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택 아님')
    const preview = await client.previewAction({ context: before.context, actionId: 'E11.maintain', treatment: 'medkit' })
    if (!preview.ok) throw new Error('미리보기 오류')
    const saved = raw
    expect((await client.dispatch({ type: 'execute-action', context: preview.value.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(before)
    expect(raw).toBe(saved)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
    expect(candidates[0]).toBe(candidates[1])
    const loaded = createProductClient({ store })
    expect((await loaded.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(loaded.getSnapshot().view).toEqual(client.getSnapshot().view)
    const restored = decodeCatalogSave(raw, resolveAnswers).run
    expect(restored.core.inventory).toMatchObject({ supply: run.core.inventory.supply - 1, medkit: 0 })
    expect(restored.core.protagonist.injury).toBe(0)
    const forged = JSON.parse(raw)
    forged.checkpoint.core.inventory.medkit = 1
    expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
  })

  it('이전 열 사건 저장은 E11을 삽입하거나 읽기만으로 변경하지 않는다', async () => {
    const old = makeContactCatalogFixture()
    const { origin, run } = atFinalRest(true, false, old)
    const raw = encodeCatalogSave(origin, old, run)
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async () => { throw new Error('기존 저장 변경 금지') } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(client.getSnapshot().presentation?.journey).toHaveLength(10)
    expect(client.getSnapshot().view).toMatchObject({ kind: 'segment-complete', nextEventId: 'E11' })
    expect(decodeCatalogSave(raw, resolveAnswers).pack.manifest.revision).toBe('catalog-contact-1')
  })
})
