import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../app/questionnaire'
import { acknowledgeOpeningResult, createOpeningRun, executeOpeningAction, getOpeningContext } from '../engine'
import type { EngineResult } from '../domain/types'
import { decodeOpeningSave, encodeOpeningSave } from './opening-save'

const origin = { runId: 'saved-run', name: '생존자', seed: 1495045943, answers: Array.from({ length: 6 }, (_, i) => ({ questionId: `Q0${i + 1}`, answerId: i % 2 === 0 ? 'a' : 'b' })) }
function value<T>(result: EngineResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value }
const resolved = resolveAnswers(origin.answers)
if (!resolved.ok) throw new Error('설문 실패')
const initial = () => value(createOpeningRun({ ...origin, answers: resolved.value, contentRevision: 'opening-core-stress-1' }))

describe('버전 저장과 결정적 복원', () => {
  it('선택·결과·구간완료 모든 진행 위치를 같은 수치/난수/기록으로 복원한다', () => {
    let run = initial()
    for (let revision = 0; revision <= 8; revision++) {
      const raw = encodeOpeningSave(origin, run)
      const decoded = decodeOpeningSave(raw, resolveAnswers)
      expect(decoded.run).toEqual(run)
      expect(decoded.origin).toEqual(origin)
      if (decoded.run.phase === 'result') expect(decoded.run.result).toBe(decoded.run.history.at(-1))
      expect(encodeOpeningSave(decoded.origin, decoded.run)).toBe(raw)
      if (run.phase === 'choice') {
        const actionId = { E01: 'E01.shortcut', E02: 'E02.help', E03: 'E03.observe', E04: 'E04.maintain', E05: 'E05.explore', E06: 'E06.withdraw' }[run.eventId]
        run = value(executeOpeningAction(decoded.run, getOpeningContext(decoded.run), { actionId, treat: run.eventId === 'E04' }))
      } else if (run.phase === 'result') run = value(acknowledgeOpeningResult(decoded.run, getOpeningContext(decoded.run), run.result!.resultId))
    }
    expect(run.core.protagonist).toMatchObject({ stress: 35, injury: 0 })
  })

  it.each([
    (data: any) => { data.schemaVersion = 3 },
    (data: any) => { data.rulesVersion = '1.2' },
    (data: any) => { data.contentRevision = 'old' },
    (data: any) => { data.randomAlgorithm = 'other' },
    (data: any) => { data.checkpoint.rngState = 0 },
    (data: any) => { data.checkpoint.core.protagonist.stress = 0 },
    (data: any) => { data.checkpoint.core.protagonist.mental = 70; delete data.checkpoint.core.protagonist.stress },
    (data: any) => { data.origin.answers[0].answerId = 'unknown' },
    (data: any) => { data.checkpoint.revision = 8 },
    (data: any) => { data.checkpoint.history[0].resolution.check.roll = 0 },
    (data: any) => { data.checkpoint.history[0].resolution.state.inventory.weapon = true },
    (data: any) => { data.extra = true },
  ])('손상/미지원/수치와 기록 변조를 거부한다: %#', mutate => {
    const run = value(executeOpeningAction(initial(), getOpeningContext(initial()), { actionId: 'E01.shortcut', treat: false }))
    const data = JSON.parse(encodeOpeningSave(origin, run))
    mutate(data)
    expect(() => decodeOpeningSave(JSON.stringify(data), resolveAnswers)).toThrow()
  })

  it.each(['{', 'null', '[]', 'x'.repeat(100_001)])('잘못된 JSON/대용량을 거부한다: %#', raw => {
    expect(() => decodeOpeningSave(raw, resolveAnswers)).toThrow()
  })
})
