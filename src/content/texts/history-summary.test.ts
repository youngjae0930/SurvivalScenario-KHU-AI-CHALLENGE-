import { expect, test } from 'vitest'
import { historyResultSummary } from './history-summary'

test('saved results retain key rewards even when their historical script ID differs', () => {
  expect(historyResultSummary(['벽 사이로 몸을 밀어 공구함을 열었다. 쇠지렛대를 쥐고 돌아 나올 공간부터 확인했다.'], 'historical-script'))
    .toBe('공구함에서 쇠지렛대를 확보했다.')
  expect(historyResultSummary(['생존자의 다리에 붕대를 감고 물병을 손 가까이에 놓았다. 생존자는 고맙다는 말 대신 연락 주파수를 천천히 불러 주었다.']))
    .toContain('대피소 연락 주파수')
})
