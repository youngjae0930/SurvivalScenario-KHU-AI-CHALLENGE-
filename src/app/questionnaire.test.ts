import { describe, expect, it } from 'vitest'
import { calculateInitialTraits } from '../engine'
import { readQuestions, resolveAnswers } from './questionnaire'

describe('제품 설문 콘텐츠', () => {
  it('실제 문구와 고유 질문·답 매핑을 제공한다', () => {
    const questions = readQuestions()
    expect(questions).toHaveLength(6)
    expect(new Set(questions.map(item => item.questionId)).size).toBe(6)
    expect(questions.every(item => item.text.length > 10 && item.answers.length === 2)).toBe(true)
  })
  it('모든64응답 조합은 축당 두 개의 ±10으로 30/50/70을 만든다', () => {
    const questions = readQuestions()
    for (let mask = 0; mask < 64; mask++) {
      const answers = resolveAnswers(questions.map((question, i) => ({ questionId: question.questionId, answerId: question.answers[(mask >> i) & 1].answerId })))
      expect(answers.ok).toBe(true)
      if (!answers.ok) throw new Error(answers.error.message)
      const result = calculateInitialTraits(answers.value)
      expect(result.ok).toBe(true)
      if (result.ok) expect(Object.values(result.value).every(number => [30, 50, 70].includes(number))).toBe(true)
    }
  })
})
