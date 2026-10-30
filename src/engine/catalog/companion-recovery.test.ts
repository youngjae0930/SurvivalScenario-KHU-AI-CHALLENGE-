import { describe, expect, it } from 'vitest'
import { createProductClient } from '../../app/catalog-client'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { makeCompanionCommandCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import type { CatalogRun, CompanionContext } from '../../domain/catalog'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { SaveStore } from '../../storage/browser-store'
import { makeCompanionChoiceCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { acknowledgeCatalogResult, catalogChoices, catalogRecoveryOpinion, createCatalogRun, currentEvent, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const origin = makeOrigin()
const answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문 오류')
const input = { ...origin, answers: answers.value }
const companion = (trust = 50, affect = 50): CompanionContext => ({ name: '동료', trust, traits: { risk: 50, cognition: 50, affect } })
const route = ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain', 'E05.bypass', 'E06.withdraw', 'E07.abandon', 'E08.detour', 'E09.comply', 'E10.signal']
function atEvent(id: string, friend: CompanionContext | null = companion(), selectedPack = pack): CatalogRun {
  let run = createCatalogRun(selectedPack, { ...input, companion: friend })
  for (const action of route) {
    if (currentEvent(selectedPack, run).id === id) return run
    run = executeCatalogAction(selectedPack, run, action)
    run = acknowledgeCatalogResult(selectedPack, run, run.result!.resultId)
  }
  if (currentEvent(selectedPack, run).id === id) return run
  throw new Error(id)
}

describe('동료 양보와 신뢰 회복의 실제 진행', () => {
  it.each(['E04', 'E11'])('%s은 동행/단독 모두 네 선택이며 양보와 추가 휴식을 구분한다', id => {
    const run = atEvent(id)
    expect(catalogChoices(pack, run)).toHaveLength(4)
    expect(catalogChoices(pack, run).map(c => c.id)).toContain(`${id}.share`)
    expect(catalogChoices(pack, run).map(c => c.id)).not.toContain(`${id}.rest`)
    expect(() => previewCatalogAction(pack, run, `${id}.rest`)).toThrow()
    const solo = atEvent(id, null)
    expect(catalogChoices(pack, solo)).toHaveLength(4)
    expect(catalogChoices(pack, solo).map(c => c.id)).toContain(`${id}.rest`)
    expect(() => previewCatalogAction(pack, solo, `${id}.share`)).toThrow()
  })

  it.each(['E04', 'E11'])('%s 양보는 물자1·체력+10·스트레스-5·신뢰+10이며 치료/중복 실행이 불가하다', id => {
    const source = atEvent(id)
    const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, stamina: 40, stress: 30, injury: 1 } } }
    const before = structuredClone(run)
    const preview = previewCatalogAction(pack, run, `${id}.share`)
    expect(preview.allowed).toBe(true)
    expect(preview.trustChange).toMatchObject({ before: 50, after: 60 })
    expect(preview.action.costs).toEqual({ stamina: 0, supply: 1, medkit: 0 })
    const view = catalogPreviewView(pack, run, preview, 'preview')
    expect(view.outcomes.success.join(' ')).toContain('신뢰 50 → 60')
    expect(() => previewCatalogAction(pack, run, `${id}.share`, true)).toThrow('치료')
    const next = executeCatalogAction(pack, run, `${id}.share`)
    expect(next.core.protagonist).toMatchObject({ stamina: 50, stress: 25, injury: 1 })
    expect(next.core.inventory).toEqual({ ...run.core.inventory, supply: run.core.inventory.supply - 1 })
    expect(next.companion?.trust).toBe(60)
    expect(next.companionOrigin).toEqual(run.companionOrigin)
    expect(next.result?.trustChange).toEqual(preview.trustChange)
    expect(() => executeCatalogAction(pack, next, `${id}.share`)).toThrow('선택')
    const result = catalogGameView(pack, next)
    if (result.kind !== 'result') throw new Error('결과 아님')
    expect(result.changes.find(c => c.label === '동료 신뢰')).toMatchObject({ actualDelta: 10 })
    expect(result.trustReasons).toEqual(['동료에게 물자를 양보했습니다.'])
    const acknowledged = acknowledgeCatalogResult(pack, next, next.result!.resultId)
    expect(acknowledged.companion?.trust).toBe(60)
    expect(() => acknowledgeCatalogResult(pack, acknowledged, next.result!.resultId)).toThrow()
    expect(run).toEqual(before)
  })

  it('신뢰·회복 상한의 실제 증감만 표시한다', () => {
    const source = atEvent('E04', companion(95))
    const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, stamina: 98, stress: 2 } } }
    const next = executeCatalogAction(pack, run, 'E04.share')
    expect(next.companion?.trust).toBe(100)
    expect(next.core.protagonist).toMatchObject({ stamina: 100, stress: 0 })
    const view = catalogGameView(pack, next)
    if (view.kind !== 'result') throw new Error('결과 아님')
    expect(view.changes.find(c => c.label === '동료 신뢰')).toMatchObject({ text: '95 → 100 (+5)', actualDelta: 5 })
    expect(executeCatalogAction(pack, atEvent('E04', companion(100)), 'E04.share').result?.trustChange).toMatchObject({ before: 100, after: 100 })
  })

  it('물자 없으면 양보를 잠그고 무자원 정비를 유지하며 신뢰를 바꾸지 않는다', () => {
    const source = atEvent('E04')
    const run = { ...source, core: { ...source.core, inventory: { ...source.core.inventory, supply: 0 } } }
    expect(previewCatalogAction(pack, run, 'E04.share').allowed).toBe(false)
    expect(() => executeCatalogAction(pack, run, 'E04.share')).toThrow()
    expect(previewCatalogAction(pack, run, 'E04.maintain').allowed).toBe(true)
    expect(catalogRecoveryOpinion(pack, run)?.choice.id).toBe('E04.maintain')
    const next = executeCatalogAction(pack, run, 'E04.maintain')
    expect(next.companion?.trust).toBe(50)
    expect(next.result?.trustChange).toBeUndefined()
  })

  it('회복의 확정 예외대로 affect49는 정비, 50/51은 양보를 권한다', () => {
    for (const affect of [49, 50, 51]) {
      const run = atEvent('E04', companion(0, affect))
      const opinion = catalogRecoveryOpinion(pack, run)!
      expect(opinion.choice.id).toBe(affect < 50 ? 'E04.maintain' : 'E04.share')
      const view = catalogGameView(pack, run)
      if (view.kind !== 'choice') throw new Error('선택 아님')
      expect(view.actions.filter(a => a.recommended).map(a => a.actionId)).toEqual([opinion.choice.id])
      expect(view.actions.find(a => a.actionId === 'E04.share')?.requiresCompanion).toBe(true)
      expect(view.actions.find(a => a.actionId === 'E04.maintain')?.requiresCompanion).toBe(false)
    }
  })

  it('실제 명령으로 생긴 신뢰를 재생하고 위조를 거부하며 이전 동행 팩을 보존한다', () => {
    for (const id of ['E04', 'E11']) {
      const next = executeCatalogAction(pack, atEvent(id), `${id}.share`)
      const raw = encodeCatalogSave(origin, pack, next)
      expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-command-1')
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(next)
      const forged = JSON.parse(raw); forged.checkpoint.companion.trust++
      expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
    }
    const old = makeCompanionChoiceCatalogFixture()
    const run = atEvent('E04', companion(), old)
    const raw = encodeCatalogSave(origin, old, run)
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-companion-choice-1')
    expect(catalogRecoveryOpinion(loaded.pack, loaded.run)).toBeNull()
    expect(() => previewCatalogAction(loaded.pack, loaded.run, 'E04.share')).toThrow()
  })

  it('양보 저장 실패는 이전 신뢰·물자를 유지하고 같은 결과로 재시도한다', async () => {
    let raw: string | null = encodeCatalogSave(origin, pack, atEvent('E04'))
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
    if (before.kind !== 'choice') throw new Error('선택 아님')
    const preview = await client.previewAction({ context: before.context, actionId: 'E04.share', treatment: 'none' })
    if (!preview.ok) throw new Error(preview.error.message)
    const previous = raw; fail = true
    expect((await client.dispatch({ type: 'execute-action', context: before.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(raw).toBe(previous)
    expect(client.getSnapshot().view).toEqual(before)
    const pending = client.getSnapshot().commit
    if (pending.kind !== 'save-failed') throw new Error('저장 실패 아님')
    const attempted = writes.at(-1); fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: pending.operationId })).ok).toBe(true)
    expect(raw).toBe(attempted)
    expect(decodeCatalogSave(raw!, resolveAnswers).run.companion?.trust).toBe(60)
    const resumed = createProductClient({ store }); await resumed.dispatch({ type: 'resume' })
    expect(resumed.getSnapshot().view).toEqual(client.getSnapshot().view)
  })
})
