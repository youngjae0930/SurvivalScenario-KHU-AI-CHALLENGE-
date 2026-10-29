import rules from '../content/rules/questionnaire.json'
import { questionnaireText } from '../content/texts/opening'
import type { ContractResult, QuestionnaireAnswer, StartViewModel } from '../contracts'
import type { ResolvedQuestionnaireAnswer } from '../domain/types'
import { isRecord, isTraitAxis } from '../domain/validation'

export function readQuestions(): StartViewModel['questions'] {
  const counts = { risk: 0, cognition: 0, affect: 0 }
  const ids = new Set<string>()
  if (rules.length !== 6) throw new Error('설문은 6문항이어야 합니다.')
  const questions = rules.map(question => {
    const copy = questionnaireText[question.questionId]
    if (!isTraitAxis(question.axis) || ids.has(question.questionId) || !copy || question.answers.length !== 2
      || new Set(question.answers.map(answer => answer.answerId)).size !== 2
      || !question.answers.every(answer => (answer.delta === -10 || answer.delta === 10) && typeof copy.answers[answer.answerId] === 'string')) throw new Error('설문 콘텐츠가 올바르지 않습니다.')
    ids.add(question.questionId)
    counts[question.axis]++
    return { questionId: question.questionId, text: copy.text, answers: question.answers.map(answer => ({ answerId: answer.answerId, label: copy.answers[answer.answerId] })) }
  })
  if (Object.values(counts).some(count => count !== 2)) throw new Error('축당 2문항이 필요합니다.')
  return questions
}

/** UI answer IDs are mapped through registered content; UI never supplies trait deltas. */
export function resolveAnswers(answers: readonly QuestionnaireAnswer[]): ContractResult<readonly ResolvedQuestionnaireAnswer[]> {
  const fail = (): ContractResult<never> => ({ ok: false, error: { code: 'invalid-input', message: '여섯 질문에 하나씩 응답해 주세요.', decisions: [] } })
  if (!Array.isArray(answers) || answers.length !== 6) return fail()
  const resolved: ResolvedQuestionnaireAnswer[] = []
  const ids = new Set<string>()
  for (const answer of answers) {
    if (!isRecord(answer) || typeof answer.questionId !== 'string' || typeof answer.answerId !== 'string' || ids.has(answer.questionId)) return fail()
    const question = rules.find(question => question.questionId === answer.questionId)
    const response = question?.answers.find(item => item.answerId === answer.answerId)
    if (!question || !isTraitAxis(question.axis) || !response || (response.delta !== -10 && response.delta !== 10)) return fail()
    ids.add(answer.questionId)
    resolved.push({ questionId: question.questionId, axis: question.axis, delta: response.delta })
  }
  return { ok: true, value: resolved }
}
