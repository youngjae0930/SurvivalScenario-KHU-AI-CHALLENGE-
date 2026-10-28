import { describe, expect, it } from 'vitest'

describe('개발 환경', () => {
  it('TypeScript 테스트를 실행할 수 있다', () => {
    const values: number[] = [1, 2, 3]

    const total = values.reduce((sum, value) => sum + value, 0)

    expect(total).toBe(6)
  })
})
