import { expect, it } from 'vitest'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { resolveAnswers } from '../../app/questionnaire'
import { makeOrigin } from '../../test/opening-paths'
import { makeResearchRouteCatalogFixture } from '../../test/catalog-fixtures'
import { decodeCatalogSave, encodeCatalogSave } from '../../storage/catalog-save'
import { catalogChoices, createCatalogRun, executeCatalogAction } from './runtime'

const pack = readDefaultCatalog()

it('선택 성향만 ±8에서 ±4로 바꾸고 비용·판정·효과와 옛 저장은 보존한다', () => {
  const old = makeResearchRouteCatalogFixture()
  let changed = 0
  for (const event of pack.events) for (const group of event.groups) for (const choice of group.choices) {
    if (choice.behavior.kind !== 'action') continue
    const previous = old.events.find(e => e.id === event.id)!.groups.find(g => g.id === group.id)!.choices.find(c => c.id === choice.id)!
    if (previous.behavior.kind !== 'action') throw new Error('행동 종류 변경')
    expect(choice.behavior).toEqual({ ...previous.behavior, variants: previous.behavior.variants.map(variant => ({
      ...variant, action: { ...variant.action, traitDelta: Object.fromEntries(Object.entries(variant.action.traitDelta).map(([axis, value]) => {
        if (Math.abs(value) === 8) { changed++; return [axis, value / 2] }
        return [axis, value]
      })) },
    })) })
  }
  expect(changed).toBe(181)
  const origin = makeOrigin(), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  const run = createCatalogRun(old, { ...origin, answers: answers.value })
  const raw = encodeCatalogSave(origin, old, run), restored = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
  expect(restored.pack.manifest.revision).toBe('catalog-research-1')
})

it.each(['a', 'b', 'mixed'] as const)('설문 %s의 초기 성향은 유지하며 첫 선택으로 극단에 도달하지 않는다', mode => {
  const origin = makeOrigin()
  const answers = resolveAnswers(origin.answers.map(answer => ({ ...answer, answerId: mode === 'mixed' ? answer.answerId : mode })))
  if (!answers.ok) throw new Error('설문')
  const run = createCatalogRun(pack, { ...origin, answers: answers.value })
  expect(Object.values(run.core.protagonist.traits)).toEqual([mode === 'a' ? 30 : mode === 'b' ? 70 : 50, mode === 'a' ? 30 : mode === 'b' ? 70 : 50, mode === 'a' ? 30 : mode === 'b' ? 70 : 50])
  for (const choice of catalogChoices(pack, run)) {
    const next = executeCatalogAction(pack, run, choice.id)
    expect(Object.values(next.core.protagonist.traits).every(value => value > 22 && value < 78)).toBe(true)
  }
})
