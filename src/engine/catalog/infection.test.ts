import { expect, it } from 'vitest'
import type { CatalogChoice, CatalogPack, CatalogRun } from '../../domain/catalog'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { createCatalogClient } from '../../app/catalog-client'
import { makeCatalogFixture, makeRouteIdentityCatalogFixture, makeInfectionCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { activeCatalogCompanion, reuniteCatalogCompanion } from './companion-journey'
import { createInheritedCatalogRun, isCatalogLegacy } from './inheritance'
import { resolveInfectionContacts } from './infection'
import { assessChoice } from './assessment'
import { acknowledgeCatalogResult, catalogChoices, catalogContext, catalogLegacy, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const companion = { name: '이전의 나', trust: 80, traits: { risk: 50, cognition: 50, affect: 50 } }
const contact: NonNullable<CatalogChoice['infection']> = [{ source: 'infected-person', target: 'actor', contact: 'bite' }]
function fixture(exposures = contact): CatalogPack {
  const base = makeCatalogFixture()
  return compileCatalog({ ...base, scripts: [...base.scripts, { id: 'walk.continue.failure', eventId: 'walk', choiceId: 'continue', slot: 'failure',
    conditions: [], priority: 0, weight: 1, once: false, text: ['구조 검증용 실패.'] }], manifest: { ...base.manifest, revision: 'infection-test-1', infectionVersion: 'immediate-1',
    executionVersion: 'command-1' }, events: base.events.map(event => ({ ...event, groups: event.groups.map(group => ({ ...group,
      choices: group.choices.map(choice => choice.id !== 'continue' ? choice : { ...choice, infection: exposures,
        execution: { role: '구조', risk: 'hazardous', conditions: [], sharedRisk: '실행자가 물릴 수 있다.' },
        behavior: { kind: 'action', variants: [{ conditions: [], action: {
          ...(choice.behavior.kind === 'action' ? choice.behavior.variants[0].action : {}),
          check: { base: 50, physical: false, weaponBonus: false, traitWeights: [{ axis: 'risk', pole: 'left', weight: 1 }] },
          failureEffects: [{ kind: 'add', stat: 'injury', amount: 1 }],
        } }] } }) })) })) })
}
function start(pack: CatalogPack, seed: number, withCompanion = false) {
  const origin = makeOrigin(seed), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  return { origin, run: createCatalogRun(pack, { ...origin, answers: answers.value, ...(withCompanion ? { companion } : {}) }) }
}
function branch(pack: CatalogPack, outcome: 'success' | 'failure', withCompanion = false, actor: 'protagonist' | 'companion' = 'protagonist') {
  for (let seed = 1; seed <= 100; seed++) {
    const { origin, run } = start(pack, Math.imul(seed, 0x9e3779b9) >>> 0, withCompanion)
    const next = executeCatalogAction(pack, run, 'continue', false, actor)
    if (next.result!.resolution.check.outcome === outcome) return { origin, run, next }
  }
  throw new Error('분기 미도달')
}

it('명시한 위험 접촉의 실패만 감염 즉시 사망이며 미리보기는 상태와 난수를 바꾸지 않는다', () => {
  const pack = fixture(), { origin, run, next } = branch(pack, 'failure')
  const before = JSON.stringify(run), preview = previewCatalogAction(pack, run, 'continue')
  expect(preview.infectionDeathsOnFailure).toMatchObject([{ subject: 'protagonist', contact: 'bite' }])
  expect(catalogPreviewView(pack, run, preview, 'token').warnings.join(' ')).toContain('감염 즉시 사망')
  expect(assessChoice(run.core, preview)!.survival.fatalPercent).toBe(100 - (preview.check.kind === 'probability' ? preview.check.probability.percent : 100))
  expect(JSON.stringify(run)).toBe(before)
  expect(executeCatalogAction(pack, run, 'continue')).toEqual(next)
  expect(next.phase).toBe('ending')
  expect(next.core.protagonist.injury).toBe(1)
  expect(catalogLegacy(pack, next)?.ending).toBe('infection-death')
  expect(decodeCatalogSave(encodeCatalogSave(origin, pack, next), resolveAnswers).run).toEqual(next)
  const view = catalogGameView(pack, next)
  expect(view).toMatchObject({ kind: 'ending', ending: 'infection-death', status: { infection: { protagonist: 'dead' } } })
  if (view.kind !== 'ending') throw new Error('결말')
  expect(view.text.join(' ')).not.toContain('상처가 겹쳐')
  expect(() => executeCatalogAction(pack, next, 'continue')).toThrow()
  expect(() => acknowledgeCatalogResult(pack, next, next.result!.resultId)).toThrow()
})

it('성공·일반 부상·단순 접촉에는 감염이 생기지 않는다', () => {
  const pack = fixture(), success = branch(pack, 'success').next
  expect(success.infectionDeaths).toEqual([])
  expect(success.phase).toBe('result')
  const ordinary = fixture()
  const noExposure = compileCatalog({ ...ordinary, events: ordinary.events.map(e => ({ ...e, groups: e.groups.map(g => ({ ...g,
    choices: g.choices.map(({ infection: _ignored, ...choice }) => choice) })) })) })
  const failed = branch(noExposure, 'failure').next
  expect(failed.core.protagonist.injury).toBe(1)
  expect(failed.infectionDeaths).toEqual([])
  expect(failed.phase).toBe('result')
})

it('동료에게 맡긴 실패는 동료만 사망하고 추천/명령/재회 없이 단독 진행한다', () => {
  const pack = fixture(), { origin, run, next } = branch(pack, 'failure', true, 'companion')
  expect(previewCatalogAction(pack, run, 'continue', false, 'companion').infectionDeathsOnFailure).toMatchObject([{ subject: 'companion' }])
  expect(next.phase).toBe('result')
  expect(next.infectionDeaths).toMatchObject([{ subject: 'companion' }])
  expect(activeCatalogCompanion(next)).toBeNull()
  const reloaded = decodeCatalogSave(encodeCatalogSave(origin, pack, next), resolveAnswers).run
  const following = acknowledgeCatalogResult(pack, reloaded, reloaded.result!.resultId)
  expect(activeCatalogCompanion(following)).toBeNull()
  expect(previewCatalogAction(pack, following, 'continue', false, 'companion').allowed).toBe(false)
  const separation = { eventId: 'walk', locationId: 'villa', visitIndex: 0, playerActionId: 'wait', companionActionId: 'continue',
    reunion: { locationTags: ['road'], minVisits: 1, conditions: [] } }
  const away = { ...following, companionJourney: { separation, reunions: [] } }
  expect(reuniteCatalogCompanion(away, catalogContext(pack, away))).toBe(away)
  expect(catalogGameView(pack, following)).toMatchObject({ kind: 'choice', companion: { kind: 'absent' }, status: { infection: { companion: { status: 'dead' } } } })
})

it('감염되지 않은 인물은 전염원이 아니며 같은 실패에서 실제 감염된 뒤에만 혈액 전염된다', () => {
  const pack = fixture([{ source: 'actor', target: 'other', contact: 'blood' }])
  expect(branch(pack, 'failure', true).next.infectionDeaths).toEqual([])
  const chain = fixture([...contact, { source: 'actor', target: 'other', contact: 'blood' }])
  const player = branch(chain, 'failure', true).next
  expect(player.infectionDeaths).toMatchObject([{ subject: 'protagonist', source: 'infected-person' }, { subject: 'companion', source: 'protagonist', contact: 'blood' }])
  const delegated = branch(chain, 'failure', true, 'companion').next
  expect(delegated.infectionDeaths).toMatchObject([{ subject: 'companion', source: 'infected-person' }, { subject: 'protagonist', source: 'companion' }])
  expect(delegated.phase).toBe('ending')
  expect(branch(chain, 'failure').next.infectionDeaths).toHaveLength(1)
  const { run } = start(chain, 2345, true)
  const away = { ...run, companionJourney: { separation: { eventId: 'walk', locationId: 'villa', visitIndex: 0, playerActionId: 'wait', companionActionId: 'continue', reunion: { locationTags: ['road'], minVisits: 1, conditions: [] } }, reunions: [] } }
  expect(resolveInfectionContacts(chain, away, catalogChoices(chain, run)[0], 'protagonist', true)).toHaveLength(1)
})

it('감염 결말의 계승은 새 동료의 감염이나 사망을 복사하지 않는다', () => {
  const pack = fixture(), { origin, next } = branch(pack, 'failure', true)
  const legacy = catalogLegacy(pack, next)!
  expect(isCatalogLegacy(legacy)).toBe(true)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  const inherited = createInheritedCatalogRun(pack, legacy, { ...origin, runId: 'successor', answers: answers.value })
  expect(inherited.infectionDeaths).toEqual([])
  expect(activeCatalogCompanion(inherited)).not.toBeNull()
  expect(decodeCatalogSave(encodeCatalogSave({ ...origin, runId: 'successor' }, pack, inherited), resolveAnswers).run).toEqual(inherited)
})

it('구 경로 팩 저장은 감염 필드를 생성하지 않고 원문 그대로 복원한다', () => {
  const old = makeRouteIdentityCatalogFixture(), { origin, run } = start(old, 17389, true)
  const action = catalogChoices(old, run).find(c => previewCatalogAction(old, run, c.id).allowed)!
  const next = executeCatalogAction(old, run, action.id)
  const raw = encodeCatalogSave(origin, old, next)
  expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(next)
  expect(encodeCatalogSave(origin, old, decodeCatalogSave(raw, resolveAnswers).run)).toBe(raw)
  expect(run).not.toHaveProperty('infectionDeaths')
  const view = catalogGameView(old, next)
  if (!('status' in view)) throw new Error('상태 없음')
  expect(view.status).not.toHaveProperty('infection')
})

it('기존 두 장소만 감염 위험을 명시하고 자원 없는 안전 대안을 유지한다', () => {
  const pack = makeInfectionCatalogFixture()
  const events = pack.events.filter(e => e.groups.some(g => g.choices.some(c => c.infection)))
  expect(events.map(e => e.locationIds[0]).sort()).toEqual(['evacuation-convoy', 'train-connection'])
  expect(pack.events).toHaveLength(54)
  expect(pack.scripts).toHaveLength(1018)
  for (const event of events) for (const group of event.groups) expect(group.choices.some(c => !c.infection
    && c.behavior.kind === 'action' && c.behavior.variants.some(v => !v.action.costs.supply && !v.action.costs.medkit))).toBe(true)
})

it('극단 장면의 독립 동료 선택은 동료가 물리고, 치료 도구를 쓰는 구조도 감염을 예방하지 않는다', () => {
  const pack = makeInfectionCatalogFixture(), { run: initial } = start(pack, 2345, true)
  const event = pack.events.find(e => e.locationIds.includes('train-connection'))!
  const run: CatalogRun = { ...initial, route: ['train-connection', 'southern-tunnel'],
    visits: [{ locationId: 'train-connection', eventId: event.id, sceneScriptId: pack.scripts.find(s => s.eventId === event.id && s.slot === 'scene' && !s.conditions.length)!.id }],
    companion: { ...companion, traits: { ...companion.traits, affect: 100 } },
    core: { ...initial.core, protagonist: { ...initial.core.protagonist, traits: { risk: 50, cognition: 50, affect: 0 } } } }
  const alternative = catalogChoices(pack, run).find(c => c.id === 'companion:E09.help')!
  expect(alternative).toBeTruthy()
  expect(previewCatalogAction(pack, run, alternative.id).infectionDeathsOnFailure).toMatchObject([{ subject: 'companion' }])
  const result = Array.from({ length: 30 }, (_, i) => executeCatalogAction(pack,
    { ...run, rngState: Math.imul(i + 1, 0x9e3779b9) >>> 0 }, alternative.id)).find(r => r.result!.resolution.check.outcome === 'failure')!
  expect(result.phase).toBe('result')
  expect(activeCatalogCompanion(result)).toBeNull()
  const general = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, traits: { risk: 50, cognition: 50, affect: 50 } } } }
  const both = Array.from({ length: 30 }, (_, i) => executeCatalogAction(pack,
    { ...general, rngState: Math.imul(i + 1, 0x9e3779b9) >>> 0 }, 'E09.aid')).find(r => r.result!.resolution.check.outcome === 'failure')!
  expect(both.core.inventory.medkit).toBe(general.core.inventory.medkit - 1)
  expect(both.infectionDeaths?.map(d => d.subject)).toEqual(['protagonist', 'companion'])
  expect(both.phase).toBe('ending')
})

it('작성 검증은 감염 버전 없는 노출, 확정 행동 노출과 자기 전염을 거부한다', () => {
  const pack = fixture()
  expect(() => compileCatalog({ ...pack, manifest: { ...pack.manifest, infectionVersion: undefined } })).toThrow()
  const change = (infection: CatalogChoice['infection'], check: unknown) => ({ ...pack, events: pack.events.map(e => ({ ...e, groups: e.groups.map(g => ({ ...g,
    choices: g.choices.map(c => c.id !== 'continue' || c.behavior.kind !== 'action' ? c : { ...c, infection,
      behavior: { ...c.behavior, variants: c.behavior.variants.map(v => ({ ...v, action: { ...v.action, check } })) } }) })) })) })
  expect(() => compileCatalog(change(contact, null))).toThrow()
  expect(() => compileCatalog(change([{ source: 'companion', target: 'companion', contact: 'blood' }],
    (pack.events[0].groups[0].choices[0].behavior as Extract<CatalogChoice['behavior'], { kind: 'action' }>).variants[0].action.check))).toThrow()
})

it('감염 사망의 저장 실패는 기존 화면을 유지하고 같은 결과로 재시도한다', async () => {
  const pack = fixture(), { origin, run } = branch(pack, 'failure', true)
  let raw = encodeCatalogSave(origin, pack, run), failing = false
  const writes: string[] = []
  const client = createCatalogClient({ pack, store: { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(raw).toBe(expected); writes.push(next); if (failing) throw new Error('quota'); raw = next
  } } })
  await client.dispatch({ type: 'resume' })
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택')
  const preview = await client.previewAction({ context: view.context, actionId: 'continue', treatment: 'none' })
  if (!preview.ok) throw new Error(preview.error.message)
  failing = true
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toBe(view)
  expect(decodeCatalogSave(raw, resolveAnswers).run.infectionDeaths).toEqual([])
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('저장 실패')
  const candidate = writes.at(-1)
  failing = false
  expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
  expect(raw).toBe(candidate)
  expect(client.getSnapshot().view).toMatchObject({ kind: 'ending', ending: 'infection-death' })
  expect(decodeCatalogSave(raw, resolveAnswers).run.infectionDeaths).toHaveLength(1)
})

it('실제19스테이지의 동료 감염과 주인공 감염 결말·판단 기록을 저장·복원하고 다음 회차를 시작한다', () => {
  const pack = makeInfectionCatalogFixture()
  let found: { origin: ReturnType<typeof makeOrigin>; run: CatalogRun; next: CatalogRun } | null = null
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const initial = start(pack, Math.imul(seed, 0x9e3779b9) >>> 0, true)
    let run = initial.run
    while (run.phase === 'choice' && run.visitIndex < 17) {
      const available = catalogChoices(pack, run).filter(c => previewCatalogAction(pack, run, c.id).allowed)
      const choice = available.find(c => c.destinationSegmentId === (run.visitIndex === 6 ? 'hospital' : 'school'))
        ?? available.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
        ?? available.find(c => c.id === 'E02.supplies')
        ?? available.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null))
        ?? available[0]
      const result = executeCatalogAction(pack, run, choice.id)
      run = result.phase === 'result' ? acknowledgeCatalogResult(pack, result, result.result!.resultId) : result
    }
    if (run.phase !== 'choice' || run.visitIndex !== 17) continue
    const action = catalogChoices(pack, run).find(c => c.id === 'encounter.evacuation-convoy.help')
    if (!action || !previewCatalogAction(pack, run, action.id, false, 'companion').allowed) continue
    const next = executeCatalogAction(pack, run, action.id, false, 'companion')
    if (next.result?.resolution.check.outcome === 'failure') found = { origin: initial.origin, run, next }
  }
  expect(found).not.toBeNull()
  const { origin, run, next } = found!
  expect(next.phase).toBe('result')
  expect(activeCatalogCompanion(next)).toBeNull()
  expect(decodeCatalogSave(encodeCatalogSave(origin, pack, next), resolveAnswers).run).toEqual(next)
  const direct = executeCatalogAction(pack, run, 'encounter.evacuation-convoy.help')
  expect(direct.phase).toBe('ending')
  expect(isCatalogLegacy(catalogLegacy(pack, direct))).toBe(true)
  expect(decodeCatalogSave(encodeCatalogSave(origin, pack, direct), resolveAnswers).run).toEqual(direct)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  const successor = createInheritedCatalogRun(pack, catalogLegacy(pack, direct)!, { ...origin, runId: 'actual-successor', answers: answers.value })
  expect(activeCatalogCompanion(successor)).not.toBeNull()
  expect(successor.infectionDeaths).toEqual([])
  expect(decodeCatalogSave(encodeCatalogSave({ ...origin, runId: 'actual-successor' }, pack, successor), resolveAnswers).run).toEqual(successor)
})
