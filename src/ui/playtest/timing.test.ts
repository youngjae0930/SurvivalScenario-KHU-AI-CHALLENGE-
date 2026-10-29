import { expect, it } from 'vitest'
import { advanceTiming, emptyTiming, formatTime, observeTiming, type TimingFrame } from './timing'

const survey: TimingFrame = { kind: 'questionnaire' }
const choice: TimingFrame = { kind: 'choice', runId: 'one', eventId: 'custom-event' }
const ending: TimingFrame = { kind: 'ending', runId: 'one' }
const begin = () => observeTiming({ ...emptyTiming(), started: true }, survey)
it('설문·선택·결과 시간을 서로 나누고 결말 이후는 더하지 않는다', () => {
  let state = advanceTiming(begin(), survey, 1000, true)
  state = advanceTiming(state, choice, 2000, true)
  state = advanceTiming(state, { ...choice, kind: 'result' }, 3000, true)
  state = observeTiming(state, ending)
  expect(state.rounds[0]).toMatchObject({ elapsedMs: 6000, questionnaireMs: 1000, finished: true, partial: false,
    events: [{ eventId: 'custom-event', choiceMs: 2000, resultMs: 3000 }] })
  expect(advanceTiming(state, ending, 5000, true)).toEqual(state)
})
it('수동 일시정지·백그라운드·긴 공백은 기록하되 플레이 시간에서 제외한다', () => {
  let state = advanceTiming(begin(), survey, 1000, false)
  state = advanceTiming({ ...state, paused: true }, survey, 2000, true)
  state = advanceTiming({ ...state, paused: false }, survey, 20000, true)
  expect(state.rounds[0]).toMatchObject({ elapsedMs: 0, excludedMs: 23000 })
  expect(advanceTiming(state, survey, -1, true)).toEqual(state)
})
it('다음 설문은 둘째 회차로 연결하고 취소·결말 재표시는 회차를 부풀리지 않는다', () => {
  let state = observeTiming(advanceTiming(begin(), choice, 1000, true), ending)
  state = advanceTiming(observeTiming(state, survey), survey, 1000, true)
  expect(state.rounds).toHaveLength(2)
  state = observeTiming(state, ending)
  expect(state.rounds).toHaveLength(1)
  state = observeTiming(state, survey)
  state = advanceTiming(state, { ...choice, runId: 'two' }, 1000, true)
  state = observeTiming(state, { ...ending, runId: 'two' })
  expect(state.rounds.every(round => round.finished && !round.partial)).toBe(true)
  expect(observeTiming(state, survey)).toEqual(state)
})
it('이어하기·중간 시작·미완성 구간은 완전한 두 회차 실측으로 표시하지 않는다', () => {
  const resumed = observeTiming({ ...emptyTiming(), started: true }, { ...survey, partial: true })
  expect(observeTiming(resumed, choice).rounds[0].partial).toBe(true)
  const middle = observeTiming({ ...emptyTiming(), started: true }, choice)
  expect(middle.rounds[0].partial).toBe(true)
  expect(observeTiming(begin(), { kind: 'segment' }).rounds[0]).toMatchObject({ partial: true, finished: true })
  expect(formatTime(125000)).toBe('2:05')
})
