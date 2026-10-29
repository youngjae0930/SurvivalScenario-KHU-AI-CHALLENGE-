import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../app/questionnaire'
import { continueOpeningSegment, getOpeningContext } from '../engine'
import { advanceOpening, chooseOpening, engineValue as value, makeOrigin, resolveOpening, startOpening } from '../test/opening-paths'
import { decodeOpeningSave, encodeOpeningSave } from './opening-save'

describe('병원 저장·이전 구간 호환·조기 결말 원자 기록', () => {
  it('새 형식의 모든 선택/결과/경계를 동일한 상태와 난수로 복원한다', () => {
    const origin = makeOrigin()
    let run = startOpening(origin)
    const actions = ['E01.safe', 'E02.help', 'E03.observe', 'E04.rest', 'E05.explore', 'E06.salvage']
    for (let revision = 0; revision <= 12; revision++) {
      const raw = encodeOpeningSave(origin, run)
      const envelope = JSON.parse(raw)
      expect(envelope).toMatchObject({ schemaVersion: 5, kind: 'hospital-solo', legacy: null })
      const loaded = decodeOpeningSave(raw, resolveAnswers).run
      expect(loaded).toEqual(run)
      if (loaded.phase === 'result') expect(loaded.result).toBe(loaded.history.at(-1))
      expect(encodeOpeningSave(origin, loaded)).toBe(raw)
      if (loaded.phase === 'choice') run = resolveOpening(loaded, actions[loaded.history.length])
      else if (loaded.phase === 'result') run = advanceOpening(loaded)
    }
    expect(run).toMatchObject({ phase: 'segment-complete', nextEventId: 'E07', revision: 12 })
  })

  it('이전 schema4 원본을 그대로 읽고 명시적 구간 연결 뒤에만 schema5로 쓴다', () => {
    const origin = makeOrigin()
    let old = startOpening(origin, 'opening-core-stress-1')
    for (const action of ['E01.safe', 'E02.help', 'E03.observe', 'E04.rest']) old = chooseOpening(old, action)
    const raw = encodeOpeningSave(origin, old)
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 4, kind: 'opening-solo' })
    const loaded = decodeOpeningSave(raw, resolveAnswers)
    expect(encodeOpeningSave(loaded.origin, loaded.run)).toBe(raw)
    const next = value(continueOpeningSegment(loaded.run, getOpeningContext(loaded.run)))
    const encoded = encodeOpeningSave(origin, next)
    expect(JSON.parse(encoded)).toMatchObject({ schemaVersion: 5, checkpoint: { eventId: 'E05', phase: 'choice' }, legacy: null })
    expect(decodeOpeningSave(encoded, resolveAnswers).run).toEqual(next)
    expect(next.history).toEqual(old.history)
    expect(next.core).toEqual(old.core)
  })

  it.each(['E05', 'E06'] as const)('%s 치명 결과와 계승을 한 봉투에 저장하고 누락/가짜 기록을 거부한다', (eventId) => {
    const origin = makeOrigin(1495045954)
    let run = startOpening(origin)
    for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest']) run = chooseOpening(run, action)
    if (eventId === 'E06') run = chooseOpening(run, 'E05.bypass')
    run = resolveOpening(run, eventId === 'E05' ? 'E05.explore' : 'E06.salvage')
    const raw = encodeOpeningSave(origin, run)
    const saved = JSON.parse(raw)
    expect(saved).toMatchObject({ checkpoint: { phase: 'ending', core: { protagonist: { injury: 3 } } }, legacy: { representativeActions: { E02: 'E02.supplies', E07: null, E10: null } } })
    expect(decodeOpeningSave(raw, resolveAnswers).run).toEqual(run)
    for (const mutate of [
      (data: typeof saved) => { data.legacy = null },
      (data: typeof saved) => { data.legacy.representativeActions.E07 = 'invented' },
      (data: typeof saved) => { data.legacy.traits.risk = 100 },
      (data: typeof saved) => { data.checkpoint.rngState = 1 },
    ]) {
      const changed = JSON.parse(raw); mutate(changed)
      expect(() => decodeOpeningSave(JSON.stringify(changed), resolveAnswers)).toThrow()
    }
  })

  it('새 버전에서 잠긴 행동을 저장 이력으로 끼워 넣을 수 없다', () => {
    const origin = makeOrigin(1, 'adventure')
    let run = startOpening(origin)
    for (const action of ['E01.shortcut', 'E02.help', 'E03.observe', 'E04.maintain']) run = chooseOpening(run, action)
    expect(run.core.inventory.supply).toBe(0)
    run = resolveOpening(run, 'E05.rush')
    const data = JSON.parse(encodeOpeningSave(origin, run))
    data.checkpoint.history[4].selection.actionId = 'E05.tools'
    expect(() => decodeOpeningSave(JSON.stringify(data), resolveAnswers)).toThrow()
  })
})
