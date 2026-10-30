import { expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { makeCompanionVitalsCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import type { CatalogRun } from '../../domain/catalog'
import { makeOrigin } from '../../test/opening-paths'
import { makeRecommendationTrustCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import type { SaveStore } from '../../storage/browser-store'
import { createProductClient } from '../../app/catalog-client'
import { StatusPanel } from '../../ui/components/StatusPanel'
import { activeCatalogCompanion } from './companion-journey'
import { matches } from './conditions'
import { prepareNextCatalogRun } from './inheritance'
import { acknowledgeCatalogResult, catalogChoices, catalogCommandOffer, catalogContext, catalogRecommendedChoice,
  createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog(), old = makeRecommendationTrustCatalogFixture()
const friend = { name: '동료', trust: 100, traits: { risk: 50, cognition: 50, affect: 50 } }
function initial(seed = 1, p = pack) {
  const origin = makeOrigin(seed), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  return { origin, run: createCatalogRun(p, { ...origin, answers: answers.value, companion: friend }) }
}
function at(location: string, seed = 1): CatalogRun {
  const { run } = initial(seed)
  const event = pack.events.find(e => e.locationIds.includes(location))!
  const scene = pack.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!
  return { ...run, route: [location, 'research-helipad'], visits: [{ locationId: location, eventId: event.id, sceneScriptId: scene.id }] }
}
function failed(location = 'residential-alley', id = 'encounter.residential-alley.parcel', lethal = false) {
  for (let seed = 1; seed <= 80; seed++) {
    const base = at(location, seed)
    const run = { ...base, companionVitals: { stamina: 60, stress: 30, injury: lethal ? 2 : 0 },
      core: { ...base.core, protagonist: { ...base.core.protagonist, injury: 2 } } }
    const preview = previewCatalogAction(pack, run, id, false, 'companion')
    if (!preview.allowed) throw new Error(preview.reasons.join(' '))
    const result = executeCatalogAction(pack, run, id, false, 'companion')
    if (result.result!.resolution.check.outcome === 'failure') return { run, result, preview }
  }
  throw new Error('실패 표본 없음')
}

it('두 사람은 같은 초기 생존값에서 독립 출발하며 주인공 소모가 동료에게 복사되지 않는다', () => {
  const { run } = initial()
  expect(run.companionVitals).toEqual({ stamina: 70, stress: 30, injury: 0 })
  expect(run.companionVitals).not.toBe(run.core.protagonist)
  const result = executeCatalogAction(pack, run, 'E01.safe')
  expect(result.core.protagonist.stamina).toBeLessThan(run.core.protagonist.stamina)
  expect(result.companionVitals).toEqual(run.companionVitals)
})

it('동료 실행 실패는 동료의 부상·체력에만 반영하고 주인공의 세 번째 부상으로 만들지 않는다', () => {
  const { run, result, preview } = failed()
  expect(result.core.protagonist.injury).toBe(2)
  expect(result.core.protagonist.stamina).toBe(run.core.protagonist.stamina)
  expect(result.companionVitals!.injury).toBe(1)
  expect(result.companionVitals!.stamina).toBeLessThan(run.companionVitals.stamina)
  expect(result.phase).toBe('result')
  expect(result.result!.resolution.fatal).toBe(false)
  expect(result.result!.trustChange).toEqual(preview.trustOutcomes!.failure)
  const view = catalogGameView(pack, result)
  if (view.kind !== 'result') throw new Error('결과')
  expect(view.status).toMatchObject({ injury: 2, companion: { injury: 1, state: 'present' } })
  expect(view.kind === 'result' && view.changes.some(c => c.label === '동료 부상' && c.actualDelta === 1)).toBe(true)
})

it('동료가 세 번째 부상으로 사망해도 결과 확인 후 다음 장면을 계속 진행한다', () => {
  const { run, result, preview } = failed('residential-alley', 'encounter.residential-alley.parcel', true)
  expect(result.companionVitals!.injury).toBe(3)
  expect(result.phase).toBe('result')
  expect(activeCatalogCompanion(result)).toBeNull()
  const shown = catalogPreviewView(pack, run, preview, 'test')
  expect(shown.warnings.join(' ')).toContain('주인공은 계속 진행')
  expect(shown.costs.join(' ')).toContain('동료 스태미나')
  const next = acknowledgeCatalogResult(pack, result, result.result!.resultId)
  expect(next.phase).toBe('choice')
  expect(catalogRecommendedChoice(pack, next)).toBeNull()
  const view = catalogGameView(pack, next)
  if (view.kind !== 'choice') throw new Error('선택')
  expect(view.status.companion).toMatchObject({ state: 'dead', deathCause: 'injury', injury: 3 })
  expect(view.kind === 'choice' && view.companion.kind).toBe('absent')
})

it('연구동에서 동료만 감염 사망하면 주인공 부상2에서도 게임오버가 되지 않는다', () => {
  const { result } = failed('infected-lab', 'encounter.infected-lab.recover')
  expect(result.result!.infectionDeaths).toEqual(expect.arrayContaining([expect.objectContaining({ subject: 'companion' })]))
  expect(result.core.protagonist.injury).toBe(2)
  expect(result.phase).toBe('result')
  const next = acknowledgeCatalogResult(pack, result, result.result!.resultId)
  expect(next.phase).toBe('choice')
  const view = catalogGameView(pack, next)
  if (view.kind !== 'choice') throw new Error('선택')
  expect(view.status.companion).toMatchObject({ state: 'dead', deathCause: 'infection' })
  expect(catalogCommandOffer(pack, next, catalogChoices(pack, next)[0].id)?.allowed ?? false).toBe(false)
})

it('직접 실행의 세 번째 부상은 주인공만 종료시키며 동료 부상은 바꾸지 않는다', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const base = at('residential-alley', seed), run = { ...base, core: { ...base.core, protagonist: { ...base.core.protagonist, injury: 2 } } }
    const result = executeCatalogAction(pack, run, 'encounter.residential-alley.parcel')
    if (result.result!.resolution.check.outcome !== 'failure') continue
    expect(result.core.protagonist.injury).toBe(3)
    expect(result.phase).toBe('ending')
    expect(result.companionVitals!.injury).toBe(0)
    return
  }
  throw new Error('실패 표본 없음')
})

it('동료의 판정과 상태 조건은 주인공이 아닌 동료의 부상·피로를 사용한다', () => {
  const healthy = at('residential-alley')
  const injured = { ...healthy, companionVitals: { stamina: 10, stress: 90, injury: 2 } }
  const a = previewCatalogAction(pack, healthy, 'encounter.residential-alley.parcel', false, 'companion')
  const b = previewCatalogAction(pack, injured, 'encounter.residential-alley.parcel', false, 'companion')
  expect(a.check.kind === 'probability' && b.check.kind === 'probability' && a.check.probability.percent > b.check.probability.percent).toBe(true)
  expect(matches([{ kind: 'number', subject: 'companion', stat: 'injury', min: 2, max: 2 }], catalogContext(pack, injured))).toBe(true)
  expect(previewCatalogAction(pack, healthy, 'encounter.residential-alley.parcel').check).toEqual(previewCatalogAction(pack, injured, 'encounter.residential-alley.parcel').check)
})

it('동료 정비·치료는 동료 부상만 낮추고 공용 치료 도구를 정확히 한 개 사용한다', () => {
  const base = at('staff-lounge'), run = { ...base, companionVitals: { stamina: 20, stress: 80, injury: 2 } }
  const id = 'encounter.staff-lounge.maintain'
  expect(catalogPreviewView(pack, run, previewCatalogAction(pack, run, id, false, 'companion'), 'test').treatmentAvailability).toEqual({ kind: 'available' })
  const result = executeCatalogAction(pack, run, id, true, 'companion')
  expect(result.companionVitals).toEqual({ stamina: 45, stress: 65, injury: 1 })
  expect(result.core.protagonist).toEqual(run.core.protagonist)
  expect(result.core.inventory.medkit).toBe(run.core.inventory.medkit - 1)
  expect(result.core.inventory.supply).toBe(run.core.inventory.supply - 1)
})

it('사망한 동료는 정비로 부활하지 않고 명령·추천·재회에 참여하지 않는다', () => {
  const base = at('staff-lounge'), run = { ...base, companionVitals: { stamina: 0, stress: 100, injury: 3 } }
  const id = 'encounter.staff-lounge.maintain'
  expect(catalogCommandOffer(pack, run, id)!.allowed).toBe(false)
  expect(previewCatalogAction(pack, run, id, false, 'companion').allowed).toBe(false)
  expect(() => executeCatalogAction(pack, run, id, true, 'companion')).toThrow()
  expect(catalogRecommendedChoice(pack, run)).toBeNull()
})

function play(seed: number, p = pack) {
  const { origin, run: initialRun } = initial(seed, p)
  let run = initialRun
  for (let step = 0; step < 19 && run.phase === 'choice'; step++) {
    const choices = catalogChoices(p, run).filter(c => previewCatalogAction(p, run, c.id).allowed)
    const command = choices.find(c => c.execution && c.behavior.kind === 'action' && c.behavior.variants.some(v => v.action.check !== null)
      && catalogCommandOffer(p, run, c.id)?.allowed && previewCatalogAction(p, run, c.id, false, 'companion').allowed)
    const choice = choices.find(c => c.destinationSegmentId === (run.visitIndex === 6 ? 'hospital' : 'school'))
      ?? command ?? choices.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
      ?? choices.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null)) ?? choices[0]
    run = executeCatalogAction(p, run, choice.id, false, choice === command ? 'companion' : 'protagonist')
    if (run.phase === 'result') run = acknowledgeCatalogResult(p, run, run.result!.resultId)
  }
  return { origin, run }
}

it('실제19장면 경로에서 동료 사망 뒤에도 완주하고 저장·복원·다음 회차의 초기화를 유지한다', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const { origin, run } = play(Math.imul(seed, 0x9e3779b9) >>> 0)
    const death = run.history.find(entry => (entry.companionChange?.after.injury ?? 0) >= 3 || entry.infectionDeaths?.some(death => death.subject === 'companion'))
    if (!death) continue
    expect(run.phase).toBe('ending')
    expect(run.visitIndex).toBe(18)
    expect(death.visitIndex).toBeLessThan(18)
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
    const answers = resolveAnswers(origin.answers)
    if (!answers.ok) throw new Error('설문')
    const nextOrigin = { ...origin, runId: 'next-vitals', name: '다음 생존자' }
    const next = prepareNextCatalogRun(pack, run, pack, { ...nextOrigin, answers: answers.value }).run
    expect(next.companionVitals).toEqual({ stamina: 70, stress: 30, injury: 0 })
    expect(activeCatalogCompanion(next)).not.toBeNull()
    const raw = encodeCatalogSave(nextOrigin, pack, next)
    expect(JSON.parse(raw).runtimeVersion).toBe('catalog-succession-18')
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(next)
    return
  }
  throw new Error('동료 사망 완주 표본 없음')
}, 30000)

it('과거 공유 피해 저장은 그대로 복원하고 새 저장의 동료 수치 변조는 거부한다', () => {
  const { origin, run } = initial(1, old), result = executeCatalogAction(old, run, 'E01.safe')
  expect(result).not.toHaveProperty('companionVitals')
  const raw = encodeCatalogSave(origin, old, result), loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
  const current = initial(), data = JSON.parse(encodeCatalogSave(current.origin, pack, current.run))
  data.checkpoint.companionVitals.injury = 3
  expect(() => decodeCatalogSave(JSON.stringify(data), resolveAnswers)).toThrow()
})

function earlyCompanionInjury() {
  for (let index = 1; index <= 64; index++) {
    const { origin, run: start } = initial(Math.imul(index, 0x9e3779b9) >>> 0)
    let run = start
    for (let step = 0; step < 6 && run.phase === 'choice'; step++) {
      const choices = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
      const command = choices.find(c => c.execution && c.behavior.kind === 'action' && c.behavior.variants.some(v => v.action.check !== null)
        && catalogCommandOffer(pack, run, c.id)?.allowed)
      const choice = command ?? choices.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null)) ?? choices[0]
      const result = executeCatalogAction(pack, run, choice.id, false, command ? 'companion' : 'protagonist')
      if (result.result!.companionChange && result.result!.companionChange.after.injury > 0) return { origin, run, result, id: choice.id }
      run = result.phase === 'result' ? acknowledgeCatalogResult(pack, result, result.result!.resultId) : result
    }
  }
  throw new Error('자연 진행 중 동료 부상 표본 없음')
}

it('동료 부상 저장 실패는 화면과 양쪽 상태를 유지하며 동일 부상 후보로 재시도한다', async () => {
  const { origin, run, result, id } = earlyCompanionInjury()
  let raw = encodeCatalogSave(origin, pack, run), fail = true, attempted = ''
  const store: SaveStore = { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(expected).toBe(raw); attempted = next
    if (fail) throw new Error('저장 실패')
    raw = next
  } }
  const client = createProductClient({ store }); await client.dispatch({ type: 'resume' })
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택')
  const preview = await client.previewAction({ context: view.context, actionId: id, treatment: 'none', executionActor: 'companion' })
  if (!preview.ok) throw new Error(preview.error.message)
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toEqual(view)
  expect(decodeCatalogSave(raw, resolveAnswers).run.companionVitals).toEqual(run.companionVitals)
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('저장 실패')
  const pending = attempted; fail = false
  expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
  expect(raw).toBe(pending)
  expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(result)
})

it('실제 동료 부상 후 정비에서 동료만 치료하고 그 기록을 저장·계승 근거로 복원한다', () => {
  const { origin, result } = earlyCompanionInjury()
  let run = acknowledgeCatalogResult(pack, result, result.result!.resultId)
  for (let step = 0; step < 7 && run.phase === 'choice'; step++) {
    const choices = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
    const maintain = choices.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
    if (maintain) {
      const treated = executeCatalogAction(pack, run, maintain.id, true, 'companion')
      expect(treated.companionVitals!.injury).toBe(run.companionVitals!.injury - 1)
      expect(treated.core.protagonist).toEqual(run.core.protagonist)
      expect(treated.core.inventory.medkit).toBe(run.core.inventory.medkit - 1)
      const raw = encodeCatalogSave(origin, pack, treated)
      expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(treated)
      return
    }
    const choice = choices.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null)) ?? choices[0]
    const next = executeCatalogAction(pack, run, choice.id)
    run = next.phase === 'result' ? acknowledgeCatalogResult(pack, next, next.result!.resultId) : next
  }
  throw new Error('정비 도착 실패')
})

it('상태 패널은 동료 부상1 게이지와 주인공 부상2를 각각 렌더링한다', () => {
  const { result } = failed()
  const view = catalogGameView(pack, result)
  if (view.kind !== 'result') throw new Error('결과')
  const html = renderToStaticMarkup(createElement(StatusPanel, { status: view.status }))
  expect(html).toContain('aria-label="동료 개별 상태"')
  expect(html).toMatch(/<meter[^>]*max="3"[^>]*value="1"[^>]*aria-label="동료 부상"/)
  expect(html).toContain('<dt>부상</dt><dd>2')
})
