import type { CoreState, EngineResult, ResolvedQuestionnaireAnswer, Traits } from '../domain/types'
import { isRecord, isTraitAxis } from '../domain/validation'

export function calculateInitialTraits(answers: readonly ResolvedQuestionnaireAnswer[]): EngineResult<Traits> {
  const invalid = (): EngineResult<never> => ({
    ok: false, error: { code: 'invalid-questionnaire', message: '고유한 6문항, 축당 2개 응답과 각 ±10 값이 필요합니다.' },
  })
  if (!Array.isArray(answers) || answers.length !== 6) return invalid()
  const counts = { risk: 0, cognition: 0, affect: 0 }
  const traits = { risk: 50, cognition: 50, affect: 50 }
  const ids = new Set<string>()
  for (const answer of answers) {
    if (!isRecord(answer) || typeof answer.questionId !== 'string' || answer.questionId.length === 0
      || ids.has(answer.questionId) || !isTraitAxis(answer.axis)
      || (answer.delta !== -10 && answer.delta !== 10)) return invalid()
    ids.add(answer.questionId)
    counts[answer.axis]++
    traits[answer.axis] += answer.delta
  }
  if (Object.values(counts).some(count => count !== 2)) return invalid()
  return { ok: true, value: traits }
}

/** Initial core values only. No run IDs, companion policy, clock or random seed. */
export function createInitialCoreState(name: string, answers: readonly ResolvedQuestionnaireAnswer[]): EngineResult<CoreState> {
  if (typeof name !== 'string') {
    return { ok: false, error: { code: 'invalid-state', message: '표시명은 문자열이어야 합니다.' } }
  }
  const traits = calculateInitialTraits(answers)
  if (!traits.ok) return traits
  return {
    ok: true,
    value: {
      protagonist: { name, traits: traits.value, stress: 30, stamina: 70, injury: 0 },
      inventory: { supply: 1, medkit: 1, weapon: false },
      flags: { access: false, data: false, helpEstablished: false, routeKnown: false, rescueDecision: null },
    },
  }
}
