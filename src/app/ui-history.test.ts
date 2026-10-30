import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CatalogPack, CatalogRun } from '../domain/catalog'
import type { SaveStore } from '../storage/browser-store'
import { readDefaultCatalog } from '../content/catalog/registry'
import { makeCompanionVitalsCatalogFixture } from '../test/catalog-fixtures'
import { makeOrigin } from '../test/opening-paths'
import { encodeCatalogSave, decodeCatalogSave } from '../storage/catalog-save'
import { classifyTrait, relaxedTraitBounds } from '../engine/traits'
import { catalogTraitBounds } from '../engine/catalog/traits'
import { catalogFirstExtreme } from '../engine/catalog/reflection'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, currentGroup, executeCatalogAction, previewCatalogAction } from '../engine/catalog/runtime'
import { StatusPanel } from '../ui/components/StatusPanel'
import { FixedStageHistory } from '../ui/components/FixedStageHistory'
import { GameRoot } from '../ui/GameRoot'
import { createProductClient } from './catalog-client'
import { resolveAnswers } from './questionnaire'
import { catalogFixedStageHistory, catalogGameView } from './view-models/catalog'
import { toStatus } from './view-models/opening'

const pack = readDefaultCatalog(), old = makeCompanionVitalsCatalogFixture()
const origin = makeOrigin(98765), answers = resolveAnswers(origin.answers)
if (!answers.ok) throw new Error('설문')
const input = { ...origin, answers: answers.value }
function initial(p = pack) { return createCatalogRun(p, input) }
function advance(p: CatalogPack, run: CatalogRun, id: string) {
  const result = executeCatalogAction(p, run, id)
  return result.phase === 'result' ? acknowledgeCatalogResult(p, result, result.result!.resultId) : result
}
function reach(index: number, middle = 'hospital') {
  let run = initial()
  while (run.visitIndex < index && run.phase === 'choice') {
    const available = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
    const choice = available.find(c => c.destinationSegmentId === middle)
      ?? available.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
      ?? available.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null)) ?? available[0]
    run = advance(pack, run, choice.id)
  }
  expect(run.visitIndex).toBe(index)
  return run
}
const visibleText = (html: string) => html.replace(/<[^>]*>/g, ' ')

it.each([[0, 'extreme-left'], [15, 'extreme-left'], [16, 'warning-left'], [25, 'warning-left'], [26, 'normal'], [50, 'normal'],
  [74, 'normal'], [75, 'warning-right'], [84, 'warning-right'], [85, 'extreme-right'], [100, 'extreme-right']] as const)(
  '새 성향 경계 %i는 %s이다', (value, band) => { expect(classifyTrait(value, relaxedTraitBounds)).toEqual({ ok: true, value: band }) },
)

it('화면 표시와 실제 극단 선택 제한을15·85로 함께 바꾸고 옛 팩은22·78을 보존한다', () => {
  for (const p of [pack, old]) for (const value of [15, 16, 22, 78, 84, 85]) {
    for (const event of p.events.filter(e => e.intervention)) {
      const base = createCatalogRun(p, input), policy = event.intervention!, location = event.locationIds[0]
      const scene = p.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!
      const run = { ...base, route: [location], visits: [{ locationId: location, eventId: event.id, sceneScriptId: scene.id }],
        core: { ...base.core, protagonist: { ...base.core.protagonist, traits: { ...base.core.protagonist.traits, [policy.axis]: value } } } }
      const bounds = catalogTraitBounds(p)
      const extreme = policy.extremePole === 'left' ? value <= bounds.extremeLeft : value >= bounds.extremeRight
      expect(currentGroup(p, run).id === policy.groupId).toBe(extreme)
      expect(catalogGameView(p, run).kind).toBe('choice')
    }
  }
  const run = initial()
  const changed = (value: number) => ({ ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, traits: { ...run.core.protagonist.traits, risk: value } } } })
  expect(catalogFirstExtreme(changed(78), catalogTraitBounds(pack))).toBeNull()
  expect(catalogFirstExtreme(changed(85), catalogTraitBounds(pack))?.axes).toContain('risk')
})

it('성향 바는 유지하되 숫자와 일반 상태는 렌더링하지 않는다', () => {
  const base = initial(), core = { ...base.core, protagonist: { ...base.core.protagonist, traits: { risk: 66, cognition: 26, affect: 26 } } }
  const html = renderToStaticMarkup(createElement(StatusPanel, { status: toStatus(core, catalogTraitBounds(pack)) }))
  const text = visibleText(html)
  expect(text).not.toMatch(/\b66\b|\b26\b|일반|경고 범위/)
  expect(html).toContain('aria-valuetext="안정 쪽"')
  expect(html.match(/성향"/g)).toHaveLength(3)
  const warning = { ...core, protagonist: { ...core.protagonist, traits: { risk: 85, cognition: 25, affect: 50 } } }
  const shown = renderToStaticMarkup(createElement(StatusPanel, { status: toStatus(warning, catalogTraitBounds(pack)) }))
  expect(visibleText(shown)).toContain('극단 범위')
  expect(visibleText(shown)).toContain('경고 범위')
})

it('고정 장소만 기록하고 미방문 장소·무작위 후보·취소한 선택은 기록하지 않는다', () => {
  const start = initial(), before = catalogFixedStageHistory(pack, start)
  expect(before).toEqual([expect.objectContaining({ stageNumber: 1, locationId: 'villa', actionLabel: null })])
  previewCatalogAction(pack, start, 'E01.shortcut')
  expect(catalogFixedStageHistory(pack, start)).toEqual(before)
  const run = reach(3), rows = catalogFixedStageHistory(pack, run)
  expect(rows.map(row => row.stageNumber)).toEqual([1, 4])
  expect(rows[0].actionLabel).not.toBeNull()
  expect(rows[1]).toMatchObject({ locationId: 'store', actionLabel: null, current: true })
  const markup = renderToStaticMarkup(createElement(FixedStageHistory, { entries: rows }))
  expect(markup).toContain('남겨진 선택')
  expect(markup).toContain('STAGE 04')
  expect(markup).not.toContain('STAGE 02')
})

it.each(['hospital', 'department'])('%s 분기의 고정8번 장소를 실제 방문 경로에서 표시한다', middle => {
  const rows = catalogFixedStageHistory(pack, reach(7, middle))
  expect(rows.map(row => row.stageNumber)).toEqual([1, 4, 7, 8])
  expect(rows.at(-1)!.locationId).toBe(middle === 'hospital' ? 'hospital-desk' : 'department-hall')
})

it('고정4번 선택은 결과 즉시 기록하고 저장·새로고침 복원 후 같은 레이아웃을 제공한다', () => {
  const run = reach(3), result = executeCatalogAction(pack, run, 'E02.help')
  const rows = catalogFixedStageHistory(pack, result)
  expect(rows.at(-1)).toMatchObject({ stageNumber: 4, actionLabel: '생존자와 먹을 것을 나눈다', actor: 'protagonist', outcome: 'certain' })
  const raw = encodeCatalogSave(origin, pack, result), loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(JSON.parse(raw).runtimeVersion).toBe('catalog-runtime-13')
  expect(catalogFixedStageHistory(loaded.pack, loaded.run)).toEqual(rows)
  expect(catalogGameView(loaded.pack, loaded.run)).toEqual(catalogGameView(pack, result))
  expect(catalogFixedStageHistory(pack, acknowledgeCatalogResult(pack, result, result.result!.resultId)).map(row => row.stageNumber)).toEqual([1, 4])
})

it('실제 결과 화면과 직전 선택에서 성향 수치 변화만 숨기고 생존 변화·원본 계산은 유지한다', async () => {
  const run = initial(), result = executeCatalogAction(pack, run, 'E01.safe')
  expect(result.core.protagonist.traits.risk).toBe(run.core.protagonist.traits.risk + 4)
  let raw = encodeCatalogSave(origin, pack, result)
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (_, next) => { raw = next } }
  const client = createProductClient({ store }); await client.dispatch({ type: 'resume' })
  const text = visibleText(renderToStaticMarkup(createElement(GameRoot, { client })))
  expect(text).toContain('70 → 62')
  expect(text).not.toContain('50 → 54')
  expect(text).toContain('남겨진 선택')
  const next = catalogGameView(pack, acknowledgeCatalogResult(pack, result, result.result!.resultId))
  expect(next.kind === 'choice' && next.recentResult?.text.join(' ')).not.toMatch(/모험 ↔ 안정|50 → 54/)
})

it('저장 실패 동안 고정 장소의 선택 전 표시를 유지하고 같은 후보 재시도 후에만 기록한다', async () => {
  const run = reach(3)
  let raw = encodeCatalogSave(origin, pack, run), fail = true, attempted = ''
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(expected).toBe(raw); attempted = next
    if (fail) throw new Error('저장 실패')
    raw = next
  } }
  const client = createProductClient({ store }); await client.dispatch({ type: 'resume' })
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택')
  const preview = await client.previewAction({ context: view.context, actionId: 'E02.help', treatment: 'none' })
  if (!preview.ok) throw new Error('미리보기')
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toEqual(view)
  expect(view.fixedStageHistory!.at(-1)!.actionLabel).toBeNull()
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('저장 실패 상태')
  const pending = attempted; fail = false
  expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
  expect(raw).toBe(pending)
  const result = client.getSnapshot().view
  expect(result.kind === 'result' && result.fixedStageHistory!.at(-1)!.actionLabel).toBe('생존자와 먹을 것을 나눈다')
})

it('이전 팩의 저장 원문·기존 경계는 보존하며 UI 기록은 기존 확정 이력에서 읽는다', () => {
  const run = executeCatalogAction(old, initial(old), 'E01.safe')
  const raw = encodeCatalogSave(origin, old, run), loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
  expect(catalogTraitBounds(loaded.pack).extremeLeft).toBe(22)
  expect(catalogFixedStageHistory(loaded.pack, loaded.run)[0].actionLabel).not.toBeNull()
})
