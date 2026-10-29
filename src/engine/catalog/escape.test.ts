import { describe, expect, it } from 'vitest'
import { createProductClient } from '../../app/catalog-client'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import type { CatalogPack, CatalogRun } from '../../domain/catalog'
import type { SaveStore } from '../../storage/browser-store'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeEscapeCatalogFixture, makeFinalRestCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { planRoute } from './route'
import { acknowledgeCatalogResult, catalogLegacy, createCatalogRun, currentEvent, currentGroup, executeCatalogAction, previewCatalogAction, renderCatalogScript } from './runtime'

const pack = makeEscapeCatalogFixture()
function atEscape(help = false, data = false, exhausted = false, content: CatalogPack = pack) {
  const origin = makeOrigin(1)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문 오류')
  let run = createCatalogRun(content, { ...origin, answers: answers.value })
  for (const id of [data ? 'E01.shortcut' : 'E01.safe', help ? 'E02.help' : 'E02.supplies', 'E03.observe', exhausted ? 'E04.organize' : 'E04.rest', 'E05.bypass', 'E06.withdraw', data ? 'E07.dismantle' : 'E07.abandon', 'E08.detour', 'E09.comply', help ? 'E10.network' : 'E10.signal', exhausted ? 'E11.organize' : 'E11.maintain']) {
    run = executeCatalogAction(content, run, id)
    run = acknowledgeCatalogResult(content, run, run.result!.resultId)
  }
  return { origin, run }
}
function actor(run: CatalogRun, stamina: number, injury: number, routeKnown: boolean, data = false): CatalogRun {
  return { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina, injury }, flags: { ...run.core.flags, routeKnown, data } } }
}

describe('E12 누적 조건 탈출과 결말', () => {
  it('앞선 열한 사건을 보존하고 150seed에서 차량 대기소 뒤 마지막 탈출 장소에 도달한다', () => {
    const old = makeFinalRestCatalogFixture()
    for (const key of ['events', 'locations', 'scripts'] as const) for (const entry of old[key]) expect(pack[key].find(item => item.id === entry.id)).toEqual(entry)
    for (let seed = 1; seed <= 150; seed++) {
      const { route } = planRoute(pack, seed * 17389)
      expect(route).toHaveLength(12)
      expect(route.at(-1)).toBe('evacuation-gate')
      expect(route.at(-2)).toBe('vehicle-shelter')
    }
    const { run } = atEscape()
    expect(run.history).toHaveLength(11)
    expect(currentEvent(pack, run).id).toBe('E12')
  })

  it.each([0, 14, 15, 29, 30, 100])('체력%i의 부상·통로 경계에서 네 선택과 잠금 이유를 실제 조건으로 계산한다', stamina => {
    const source = atEscape().run
    for (const injury of [0, 1, 2, 3]) for (const known of [false, true]) {
      const run = actor(source, stamina, injury, known)
      const short = stamina >= 15 && injury <= 1
      const detour = known && stamina >= 30 && injury <= 2
      const request = injury < 3 && !short && !detour
      const expected = { 'E12.short': short, 'E12.barrier': short, 'E12.detour': detour, 'E12.request': request }
      expect(currentGroup(pack, run).choices).toHaveLength(4)
      const view = catalogGameView(pack, run)
      if (view.kind !== 'choice') throw new Error('선택 아님')
      for (const id of Object.keys(expected) as (keyof typeof expected)[]) {
        const preview = previewCatalogAction(pack, run, id)
        expect(preview.allowed).toBe(expected[id])
        expect(preview.check.kind).toBe('certain')
        const shown = view.actions.find(item => item.actionId === id)!
        if (!expected[id]) {
          expect(shown.availability.kind).toBe('locked')
          expect(preview.reasons.length).toBeGreaterThan(0)
          expect(() => executeCatalogAction(pack, run, id)).toThrow()
        }
      }
      expect(view.actions.some(item => item.availability.kind === 'available')).toBe(injury < 3)
    }
  })

  it('단거리 두 접근 방식은 같은 비용/조건이며 성향·스트레스·무기가 탈출 조건을 뒤집지 않는다', () => {
    for (const value of [0, 22, 23, 77, 78, 100]) {
      const source = actor(atEscape().run, 15, 1, false)
      const run = { ...source, core: { ...source.core, protagonist: { ...source.core.protagonist, stress: value, traits: { risk: value, cognition: value, affect: value } }, inventory: { ...source.core.inventory, weapon: true } } }
      const short = executeCatalogAction(pack, run, 'E12.short')
      const barrier = executeCatalogAction(pack, run, 'E12.barrier')
      expect(short.core).toEqual(barrier.core)
      expect(short.core.protagonist).toMatchObject({ stamina: 0, injury: 1, stress: value, traits: run.core.protagonist.traits })
      expect(short.rngState).toBe(run.rngState)
      expect(barrier.rngState).toBe(run.rngState)
      expect(short.result?.resolution.actionId).toBe('E12.short')
      expect(barrier.result?.resolution.actionId).toBe('E12.barrier')
      expect(catalogLegacy(pack, short)?.ending).toBe('escape')
    }
  })

  it('우회는 실제 연락망과 체력을 사용하고 자료 보유 여부로 결말·문구를 구분한다', () => {
    for (const data of [false, true]) {
      const { run } = atEscape(true, data)
      expect(run.core.flags.routeKnown).toBe(true)
      expect(run.core.flags.data).toBe(data)
      const preview = previewCatalogAction(pack, run, 'E12.detour')
      expect(preview.allowed).toBe(true)
      expect(preview.action.costs.stamina).toBe(30)
      const before = structuredClone(run)
      const shown = catalogPreviewView(pack, run, preview, 'preview')
      expect(shown.outcomes.success.join(' ')).toContain(data ? '연구 자료를 지닌 탈출' : '탈출 결말')
      expect(run).toEqual(before)
      const result = executeCatalogAction(pack, run, 'E12.detour')
      expect(result.phase).toBe('ending')
      expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina - 30)
      expect(result.core.protagonist.injury).toBe(run.core.protagonist.injury)
      expect(result.core.flags).toEqual(run.core.flags)
      expect(result.result?.escape).toEqual({ ending: data ? 'data-and-escape' : 'escape', reason: 'escaped' })
      expect(result.rngState).toBe(run.rngState)
      const text = renderCatalogScript(pack, result, result.result!.resultScriptId).join(' ')
      expect(text.includes('배낭 속 연구 자료')).toBe(data)
      const view = catalogGameView(pack, result)
      expect(view).toMatchObject({ kind: 'ending', ending: data ? 'data-and-escape' : 'escape' })
      if (view.kind !== 'ending') throw new Error('결말 아님')
      expect(view.text.join(' ')).not.toContain('상처가 겹쳐')
      expect(view.newRun.kind).toBe('locked')
    }
  })

  it('실제 무위험 소모 경로에서 구조 요청만 가능하며 추가 상처 없이 실패/대기 결말을 저장한다', () => {
    const { origin, run } = atEscape(false, false, true)
    expect(run.core.protagonist.stamina).toBe(10)
    expect(run.core.protagonist.injury).toBe(0)
    const view = catalogGameView(pack, run)
    if (view.kind !== 'choice') throw new Error('선택 아님')
    expect(view.actions.filter(item => item.availability.kind === 'available').map(item => item.actionId)).toEqual(['E12.request'])
    const shown = catalogPreviewView(pack, run, previewCatalogAction(pack, run, 'E12.request'), 'preview')
    expect(shown.outcomes.success.join(' ')).toContain('탈출 실패 · 구조 대기')
    const result = executeCatalogAction(pack, run, 'E12.request')
    expect(result.phase).toBe('ending')
    expect(result.core).toEqual(run.core)
    expect(result.rngState).toBe(run.rngState)
    expect(result.result?.escape).toEqual({ ending: 'escape-failed', reason: 'rescue-wait' })
    expect(catalogGameView(pack, result)).toMatchObject({ kind: 'ending', title: '구조를 기다리며', ending: 'escape-failed' })
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, result), resolveAnswers).run).toEqual(result)
  })

  it('세 결말을 실제 선택·대표 기록·집계와 함께 저장하며 재실행·치료·결과 재확인을 거부한다', () => {
    for (const [help, data, exhausted, id, ending] of [
      [false, false, false, 'E12.short', 'escape'], [true, true, false, 'E12.detour', 'data-and-escape'], [false, false, true, 'E12.request', 'escape-failed'],
    ] as const) {
      const { origin, run } = atEscape(help, data, exhausted)
      expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
      expect(() => previewCatalogAction(pack, run, id, true)).toThrow()
      const result = executeCatalogAction(pack, run, id)
      const legacy = catalogLegacy(pack, result)
      expect(legacy).toMatchObject({ ending, rescueDecision: help ? 'rescue' : 'self', judgmentCounts: run.judgmentCounts,
        representativeActions: { E02: help ? 'E02.help' : 'E02.supplies', E07: data ? 'E07.dismantle' : 'E07.abandon', E10: help ? 'E10.network' : 'E10.signal' } })
      expect(result.history).toHaveLength(12)
      expect(result.judgmentCounts).toEqual(run.judgmentCounts)
      const raw = encodeCatalogSave(origin, pack, result)
      expect(JSON.parse(raw).runtimeVersion).toBe('catalog-runtime-2')
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
      for (const field of ['ending', 'runtime']) {
        const forged = JSON.parse(raw)
        if (field === 'ending') forged.legacy.ending = ending === 'escape' ? 'data-and-escape' : 'escape'
        else forged.runtimeVersion = 'catalog-runtime-1'
        expect(() => decodeCatalogSave(JSON.stringify(forged), resolveAnswers)).toThrow()
      }
      expect(() => executeCatalogAction(pack, result, id)).toThrow()
      expect(() => acknowledgeCatalogResult(pack, result, result.result!.resultId)).toThrow()
    }
  })

  it('결말 저장 실패는 기존 선택 화면과 저장을 유지하고 동일 결말 후보만 재시도한다', async () => {
    const { origin, run } = atEscape(true, true)
    let raw = encodeCatalogSave(origin, pack, run)
    let fail = true
    const attempts: string[] = []
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
      expect(expected).toBe(raw)
      attempts.push(next)
      if (fail) throw new Error('quota')
      raw = next
    } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    const before = client.getSnapshot().view
    if (before.kind !== 'choice') throw new Error('선택 아님')
    const preview = await client.previewAction({ context: before.context, actionId: 'E12.detour', treatment: 'none' })
    if (!preview.ok) throw new Error('미리보기 오류')
    const saved = raw
    expect((await client.dispatch({ type: 'execute-action', context: preview.value.context, previewToken: preview.value.previewToken })).ok).toBe(false)
    expect(client.getSnapshot().view).toBe(before)
    expect(raw).toBe(saved)
    const commit = client.getSnapshot().commit
    if (commit.kind !== 'save-failed') throw new Error('저장 실패 아님')
    fail = false
    expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
    expect(attempts[0]).toBe(attempts[1])
    expect(client.getSnapshot().view).toMatchObject({ kind: 'ending', ending: 'data-and-escape' })
    const loaded = createProductClient({ store })
    expect((await loaded.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(loaded.getSnapshot().view).toEqual(client.getSnapshot().view)
  })

  it('이전 열한 사건은 runtime1과 E12 대기 상태 그대로 복원하며 자동 전환하지 않는다', async () => {
    const old = makeFinalRestCatalogFixture()
    const { origin, run } = atEscape(true, false, false, old)
    const raw = encodeCatalogSave(origin, old, run)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-runtime-1')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
    const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async () => { throw new Error('기존 저장 변경 금지') } }
    const client = createProductClient({ store })
    expect((await client.dispatch({ type: 'resume' })).ok).toBe(true)
    expect(client.getSnapshot().view).toMatchObject({ kind: 'segment-complete', nextEventId: 'E12' })
    expect(client.getSnapshot().presentation?.journey).toHaveLength(11)
  })

  it('탈출 결과 문구가 여러 개여도 최종 행동의 난수 위치를 변경하지 않는다', () => {
    const copy = structuredClone(pack)
    const original = copy.scripts.find(script => script.id === 'E12.short.ending')!
    const custom = compileCatalog({ ...copy, scripts: [...copy.scripts, { ...original, id: 'E12.short.ending.alternate', text: ['테스트 전용 결말 문구'] }] })
    const { run } = atEscape(false, false, false, custom)
    expect(executeCatalogAction(custom, run, 'E12.short').rngState).toBe(run.rngState)
  })

  it('누락 경로·일반 행동 혼합·집계 효과·탈출 뒤 장소를 등록 시 거부한다', () => {
    const mutate = (edit: (copy: any) => void) => { const copy = structuredClone(pack); edit(copy); return () => compileCatalog(copy) }
    expect(mutate(copy => { copy.events.find((event: any) => event.id === 'E12').groups[0].choices[3].behavior.route = 'short' })).toThrow()
    expect(mutate(copy => { copy.events.find((event: any) => event.id === 'E12').groups[0].choices[0].judgment = 'rescue' })).toThrow()
    expect(mutate(copy => { copy.events.find((event: any) => event.id === 'E12').groups[0].choices[0].behavior = copy.events.find((event: any) => event.id === 'E01').groups[0].choices[0].behavior })).toThrow()
    expect(mutate(copy => { copy.locations.push({ id: 'after-exit', name: '금지된 후속 장소', stage: 'late', tags: ['after-exit'], fromTags: ['exit'], after: ['evacuation-gate'], required: true, weight: 1 }); copy.events[0].locationIds.push('after-exit') })).toThrow()
  })
})
