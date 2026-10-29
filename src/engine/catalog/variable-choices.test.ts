import { expect, it } from 'vitest'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { makeCatalogFixture, makeFlexibleStagesCatalogFixture } from '../../test/catalog-fixtures'
import { makeOrigin } from '../../test/opening-paths'
import { compileCatalog } from './compile'
import { decisionMemoryFor, isDecisionMemory } from './decision-memory'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, executeCatalogAction } from './runtime'

const origin = makeOrigin(1)
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문')
const input = { ...origin, answers: resolved.value }

it.each([1, 2, 3, 5])('%i개 선택을 복제 없이 표시하고 선택 당시 구성과 저장을 복원한다', count => {
  const source = makeCatalogFixture(), event = source.events[0], group = event.groups[0]
  const extra = structuredClone(group.choices[0])
  const additional = { ...extra, id: 'additional', behavior: extra.behavior.kind === 'action'
    ? { ...extra.behavior, variants: extra.behavior.variants.map(v => ({ ...v, action: { ...v.action, id: 'additional' } })) } : extra.behavior }
  const choices = [...group.choices, additional].slice(0, count)
  const scripts = [...source.scripts, { ...source.scripts.find(s => s.choiceId === extra.id)!, id: 'additional.result', choiceId: 'additional' }]
    .filter(s => s.choiceId === null || choices.some(c => c.id === s.choiceId))
  const pack = compileCatalog({ ...source, manifest: { ...source.manifest, decisionMemoryVersion: 'context-1', recommendationVersion: 'survival-1' },
    events: [{ ...event, recommendation: { axis: 'risk' }, groups: [{ ...group, choices }] }], scripts })
  let run = createCatalogRun(pack, input)
  const view = catalogGameView(pack, run)
  if (view.kind !== 'choice') throw new Error('선택')
  expect(view.actions.map(a => a.actionId)).toEqual(choices.map(c => c.id))
  run = executeCatalogAction(pack, run, 'continue')
  const memory = decisionMemoryFor(run)
  expect(memory.entries[0].context.options).toHaveLength(count)
  expect(isDecisionMemory(memory)).toBe(true)
  const incomplete = { ...memory, entries: [{ ...memory.entries[0], context: { ...memory.entries[0].context,
    options: memory.entries[0].context.options.slice(1) } }] }
  expect(isDecisionMemory(incomplete)).toBe(false)
  expect(decodeCatalogSave(encodeCatalogSave(origin, pack, run), resolveAnswers).run).toEqual(run)
})

it('극단 그룹을 두 선택으로 줄여도 본인 행동과 독립 동료 선택을 유지한다', () => {
  const source = readDefaultCatalog(), event = source.events.find(e => e.id === 'E05')!, policy = event.intervention!
  const group = event.groups.find(g => g.id === policy.groupId)!
  const choices = [group.choices.find(c => c.id !== policy.replaceChoiceId)!, group.choices.find(c => c.id === policy.replaceChoiceId)!]
  const changed = { ...event, groups: event.groups.map(g => g.id === group.id ? { ...g, choices } : g) }
  const validIds = new Set(changed.groups.flatMap(g => g.choices.map(c => c.id)))
  const pack = compileCatalog({ ...source, events: source.events.map(e => e.id === event.id ? changed : e),
    scripts: source.scripts.filter(s => s.eventId !== event.id || s.choiceId === null || validIds.has(s.choiceId)) })
  let run = createCatalogRun(pack, { ...input, companion: { name: '동료', traits: { risk: 100, cognition: 50, affect: 50 }, trust: 0 } })
  for (const id of ['E01.safe', 'E02.supplies', 'E03.observe', 'E04.maintain']) {
    run = executeCatalogAction(pack, run, id)
    run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
  }
  run = { ...run, core: { ...run.core, protagonist: { ...run.core.protagonist, traits: { ...run.core.protagonist.traits, risk: 0 } } } }
  const options = catalogChoices(pack, run)
  expect(options).toHaveLength(2)
  expect(options.filter(c => c.id.startsWith('companion:'))).toHaveLength(1)
  expect(options.find(c => !c.id.startsWith('companion:'))!.goalId).toBe(group.choices[0].goalId)
})

it('신규 탈출은 세 경로만 제공하고 이전 고정 팩 저장은 네 선택을 보존한다', () => {
  const current = readDefaultCatalog(), old = makeFlexibleStagesCatalogFixture()
  expect(current.events.find(e => e.id === 'E12')!.groups[0].choices.map(c => c.id)).toEqual(['E12.short', 'E12.detour', 'E12.request'])
  const raw = encodeCatalogSave(origin, old, createCatalogRun(old, input))
  const loaded = decodeCatalogSave(raw, resolveAnswers)
  expect(loaded.pack.events.find(e => e.id === 'E12')!.groups[0].choices).toHaveLength(4)
  expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
  expect(current.manifest.revision).not.toBe(old.manifest.revision)
})
