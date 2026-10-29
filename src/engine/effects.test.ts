import { describe, expect, it } from 'vitest'
import type { StateEffect } from '../domain/actions'
import { makeCoreState } from '../test/core-fixtures'
import { applyStateEffects } from './effects'

describe('행동 효과의 최종 합산', () => {
  it('스트레스는 반대 방향 효과를 합산한 뒤 0~100으로 제한하고 실제 변화만 기록한다', () => {
    for (let oldMental = 0; oldMental <= 100; oldMental++) {
      for (const oldEffects of [[15], [-10], [15, -10], [-15, 5], [200], [-200]]) {
        const stress = 100 - oldMental
        const result = applyStateEffects(makeCoreState({ stress }), oldEffects.map(amount => ({ kind: 'add' as const, stat: 'stress' as const, amount: -amount })))
        if (!result.ok) throw new Error(result.error.message)
        const oldAfter = Math.min(100, Math.max(0, oldMental + oldEffects.reduce((sum, delta) => sum + delta, 0)))
        expect(result.value.state.protagonist.stress).toBe(100 - oldAfter)
        expect(result.value.fatal).toBe(false)
        const actual = 100 - oldAfter - stress
        expect(result.value.changes).toEqual(actual === 0 ? [] : [{ kind: 'number', field: 'stress', before: stress, after: 100 - oldAfter, delta: actual }])
      }
    }
  })
  it('부상 증가와 치료를 합산한 뒤 치명 여부를 판단한다', () => {
    const result = applyStateEffects(makeCoreState({ injury: 2 }), [
      { kind: 'add', stat: 'injury', amount: 1 }, { kind: 'add', stat: 'injury', amount: -1 },
    ])
    expect(result).toMatchObject({ ok: true, value: { fatal: false, state: { protagonist: { injury: 2 } } } })
    const fatal = applyStateEffects(makeCoreState({ injury: 2 }), [{ kind: 'add', stat: 'injury', amount: 1 }])
    expect(fatal).toMatchObject({ ok: true, value: { fatal: true, state: { protagonist: { injury: 3 } } } })
  })

  it('상한 처리 전 순변화를 합산하고 실제 변화만 기록한다', () => {
    const result = applyStateEffects(makeCoreState({ stamina: 100, supply: 3 }), [
      { kind: 'add', stat: 'stamina', amount: 20 }, { kind: 'add', stat: 'stamina', amount: -10 },
      { kind: 'add', stat: 'supply', amount: 1 }, { kind: 'add', stat: 'stress', amount: 10 },
    ])
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.state.protagonist.stamina).toBe(100)
    expect(result.value.state.inventory.supply).toBe(3)
    expect(result.value.changes).toEqual([{ kind: 'number', field: 'stress', before: 30, after: 40, delta: 10 }])
  })

  it('전량 포기와 무기/플래그 변경을 반영하고 생략한 플래그는 유지한다', () => {
    const input = makeCoreState({ supply: 2, weapon: true, data: true })
    const before = structuredClone(input)
    const result = applyStateEffects(input, [
      { kind: 'remove-all', resource: 'supply' }, { kind: 'set-weapon', value: false },
      { kind: 'set-flag', flag: 'routeKnown', value: true },
    ])
    expect(result).toMatchObject({ ok: true, value: { state: { inventory: { supply: 0, weapon: false }, flags: { routeKnown: true, data: true } } } })
    expect(input).toEqual(before)
  })

  it.each([
    [{ kind: 'remove-all', resource: 'supply' }, { kind: 'add', stat: 'supply', amount: -1 }],
    [{ kind: 'remove-all', resource: 'supply' }, { kind: 'add', stat: 'supply', amount: 1 }],
    [{ kind: 'remove-all', resource: 'supply' }, { kind: 'add', stat: 'supply', amount: -1 }, { kind: 'add', stat: 'supply', amount: 1 }],
    [{ kind: 'set-flag', flag: 'data', value: true }, { kind: 'set-flag', flag: 'data', value: false }],
    [{ kind: 'add', stat: 'medkit', amount: -2 }],
    [{ kind: 'add', stat: 'stress', amount: NaN }],
    [{ kind: 'add', stat: 'stress', amount: 0.5 }],
    [{ kind: 'eval', code: 'not executable content' }],
    Array(1),
  ].map(effects => ({ effects })))('상충하거나 잘못된 효과를 거부한다: %#', ({ effects }) => {
    expect(applyStateEffects(makeCoreState(), effects as StateEffect[])).toMatchObject({ ok: false, error: { code: 'invalid-action' } })
  })
})
