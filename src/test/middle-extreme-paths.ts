import type { CatalogPack, CatalogRun } from '../domain/catalog'
import type { Traits } from '../domain/types'
import { resolveAnswers } from '../app/questionnaire'
import { acknowledgeCatalogResult, catalogChoices, createCatalogRun, executeCatalogAction, previewCatalogAction } from '../engine/catalog/runtime'

export const extremeAxes = ['risk', 'cognition', 'affect'] as const
export function extremeOrigin(route: string, axis: keyof Traits, pole: 'left' | 'right', neutral = false, seed = 1) {
  return { runId: `extreme-${route}-${axis}-${pole}-${neutral}-${seed}`, name: '발현 검수', seed,
    answers: Array.from({ length: 6 }, (_, i) => ({ questionId: `Q0${i + 1}`,
      answerId: !neutral && Math.floor(i / 2) === extremeAxes.indexOf(axis) ? pole === 'left' ? 'a' : 'b' : i % 2 ? 'b' : 'a' })) }
}
export function startExtremePath(pack: CatalogPack, route: string, axis: keyof Traits, pole: 'left' | 'right', neutral = false, seed = 1) {
  const origin = extremeOrigin(route, axis, pole, neutral, seed), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문 오류')
  return { origin, run: createCatalogRun(pack, { ...origin, answers: answers.value }) }
}
/** A present-preview strategy: never reads a future roll, sets state or skips an event. */
export function stepExtremePath(pack: CatalogPack, run: CatalogRun, route: string, axis: keyof Traits, pole: 'left' | 'right') {
  const sign = pole === 'left' ? -1 : 1
  const candidates = catalogChoices(pack, run).map(choice => ({ choice, preview: previewCatalogAction(pack, run, choice.id) })).filter(x => x.preview.allowed)
  const ranked = candidates.map(x => {
    const injury = x.preview.action.failureEffects.reduce((sum, effect) => sum + (effect.kind === 'add' && effect.stat === 'injury' ? effect.amount : 0), 0)
    const chance = x.preview.check.kind === 'certain' ? 100 : x.preview.check.probability.percent
    return { ...x, score: x.preview.action.traitDelta[axis] * sign * 100 + (x.choice.behavior.kind === 'recovery' ? 25 : 0)
      - (100 - chance) * injury * .5 - x.preview.action.costs.stamina * .1 }
  }).sort((a, b) => b.score - a.score)
  const selected = candidates.find(x => x.choice.destinationSegmentId === (run.visitIndex === 6 ? route : 'school')) ?? ranked[0]
  if (!selected) throw new Error('실행 가능한 선택 없음')
  const treat = selected.choice.behavior.kind === 'recovery' && selected.choice.behavior.choice === 'maintain' && run.core.protagonist.injury > 0 && run.core.inventory.medkit > 0
  const result = executeCatalogAction(pack, run, selected.choice.id, treat)
  return result.phase === 'result' ? acknowledgeCatalogResult(pack, result, result.result!.resultId) : result
}
