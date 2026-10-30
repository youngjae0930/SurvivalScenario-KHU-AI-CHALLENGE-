import { expect, it } from 'vitest'
import type { CatalogPack } from '../../domain/catalog'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView, catalogPreviewView } from '../../app/view-models/catalog'
import { createProductClient } from '../../app/catalog-client'
import { makeOrigin } from '../../test/opening-paths'
import { makeResearchRouteCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { compileCatalog } from './compile'
import { createInheritedCatalogRun, isCatalogLegacy } from './inheritance'
import { acknowledgeCatalogResult, catalogChoices, catalogLegacy, createCatalogRun, executeCatalogAction, previewCatalogAction } from './runtime'

const pack = readDefaultCatalog()
const companion = { name: '이전 생존자', trust: 50, traits: { risk: 50, cognition: 50, affect: 50 } }
function reach(middle: string, late: string, withCompanion = false, p: CatalogPack = pack) {
  for (let seed = 1; seed <= 40; seed++) {
    const origin = makeOrigin(Math.imul(seed, 0x9e3779b9) >>> 0), answers = resolveAnswers(origin.answers)
    if (!answers.ok) throw new Error('설문')
    let run = createCatalogRun(p, { ...origin, answers: answers.value, ...(withCompanion ? { companion } : {}) })
    while (run.phase === 'choice' && run.visitIndex < 18) {
      const allowed = catalogChoices(p, run).filter(c => previewCatalogAction(p, run, c.id).allowed)
      const choice = allowed.find(c => c.destinationSegmentId === (run.visitIndex === 6 ? middle : late))
        ?? allowed.find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
        ?? allowed.find(c => c.id === 'E02.supplies')
        ?? allowed.find(c => c.behavior.kind === 'action' && c.behavior.variants.every(v => v.action.check === null))
        ?? allowed[0]
      const next = executeCatalogAction(p, run, choice.id)
      run = next.phase === 'result' ? acknowledgeCatalogResult(p, next, next.result!.resultId) : next
    }
    if (run.phase !== 'choice' || run.visitIndex !== 18) continue
    const choice = catalogChoices(p, run).find(c => c.behavior.kind === 'escape' && c.behavior.route === 'short' && previewCatalogAction(p, run, c.id).allowed)
    if (choice) return { origin, run, choice }
  }
  throw new Error('탈출 전 상태에 미도달')
}

it.each(['hospital', 'department'].flatMap(middle => ['subway', 'school'].flatMap(late => [false, true].map(withCompanion => [middle, late, withCompanion] as const))))
  ('%s→%s 동료=%s: 미리보기·실제 결말·저장·계승이 경로별 결말을 보존한다', (middle, late, withCompanion) => {
    const { origin, run, choice } = reach(middle, late, withCompanion)
    const expected = late === 'subway' ? 'tunnel-escape' : 'outskirts-escape'
    const preview = previewCatalogAction(pack, run, choice.id)
    expect(preview.escapeEnding).toBe(expected)
    expect(catalogPreviewView(pack, run, preview, 'test').outcomes.success.join(' ')).toContain(late === 'subway' ? '지하터널 탈출' : '도시 외곽 탈출')
    const final = executeCatalogAction(pack, run, choice.id)
    expect(final.history).toHaveLength(19)
    expect(final.result?.escape?.ending).toBe(expected)
    expect(catalogGameView(pack, final)).toMatchObject({ kind: 'ending', ending: expected, title: expect.stringContaining(late === 'subway' ? '지하터널 탈출' : '도시 외곽 탈출') })
    expect(decodeCatalogSave(encodeCatalogSave(origin, pack, final), resolveAnswers).run).toEqual(final)
    const legacy = catalogLegacy(pack, final)!
    expect(isCatalogLegacy(legacy)).toBe(true)
    const answers = resolveAnswers(origin.answers)
    if (!answers.ok) throw new Error('설문')
    const inherited = createInheritedCatalogRun(pack, legacy, { ...origin, runId: 'route-successor', answers: answers.value })
    expect(inherited.previousLegacy?.ending).toBe(expected)
    expect(inherited.companion?.traits).toEqual(final.core.protagonist.traits)
    expect(decodeCatalogSave(encodeCatalogSave({ ...origin, runId: 'route-successor' }, pack, inherited), resolveAnswers).run).toEqual(inherited)
  })

it.each(['subway', 'school'])('%s에서 구조 대기는 탈출 성공 결말로 분류하지 않는다', late => {
  const { run } = reach('hospital', late)
  const exhausted = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, stamina: 0, injury: 2 }, flags: { ...run.core.flags, routeKnown: false } } }
  const choice = catalogChoices(pack, exhausted).find(c => c.behavior.kind === 'escape' && c.behavior.route === 'request')!
  expect(previewCatalogAction(pack, exhausted, choice.id)).toMatchObject({ allowed: true, escapeEnding: 'escape-failed' })
  expect(executeCatalogAction(pack, exhausted, choice.id).result?.escape?.ending).toBe('escape-failed')
})

it('이전 연구동 팩의 일반 탈출 저장은 기존 escape 결말로 원문 복원한다', () => {
  const old = makeResearchRouteCatalogFixture(), { origin, run, choice } = reach('hospital', 'subway', true, old)
  const final = executeCatalogAction(old, run, choice.id)
  expect(final.result?.escape?.ending).toBe('escape')
  const raw = encodeCatalogSave(origin, old, final), restored = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
  expect(restored.pack.manifest).not.toHaveProperty('endingVersion')
})

it('새 결말을 일반 행동 또는 이전 결말 버전에 연결하면 등록을 거부한다', () => {
  const withoutVersion = { ...pack, manifest: { ...pack.manifest, endingVersion: undefined } }
  expect(() => compileCatalog(withoutVersion)).toThrow()
  const ordinary = pack.events.find(e => e.locationIds.includes('villa'))!
  expect(() => compileCatalog({ ...pack, events: pack.events.map(e => e.id !== ordinary.id ? e : { ...e,
    groups: e.groups.map(g => ({ ...g, choices: g.choices.map(c => ({ ...c, ending: { conditions: [], kind: 'tunnel-escape' } })) })) }) })).toThrow('결말')
})

it('결말 저장 실패는 이전 선택 화면을 유지하고 같은 탈출 결말로 재시도한다', async () => {
  const { origin, run, choice } = reach('hospital', 'school')
  let raw = encodeCatalogSave(origin, pack, run), fail = false
  const writes: string[] = []
  const client = createProductClient({ store: { read: () => raw, acquire: async () => true, compareAndSet: async (expected, next) => {
    expect(raw).toBe(expected); writes.push(next); if (fail) throw new Error('quota'); raw = next
  } } })
  await client.dispatch({ type: 'resume' })
  const view = client.getSnapshot().view
  if (view.kind !== 'choice') throw new Error('선택')
  const preview = await client.previewAction({ context: view.context, actionId: choice.id, treatment: 'none' })
  if (!preview.ok) throw new Error(preview.error.message)
  fail = true
  expect((await client.dispatch({ type: 'execute-action', context: view.context, previewToken: preview.value.previewToken })).ok).toBe(false)
  expect(client.getSnapshot().view).toBe(view)
  const commit = client.getSnapshot().commit
  if (commit.kind !== 'save-failed') throw new Error('저장 실패')
  const candidate = writes.at(-1)
  fail = false
  expect((await client.dispatch({ type: 'retry-save', operationId: commit.operationId })).ok).toBe(true)
  expect(raw).toBe(candidate)
  expect(client.getSnapshot().view).toMatchObject({ kind: 'ending', ending: 'outskirts-escape' })
})
