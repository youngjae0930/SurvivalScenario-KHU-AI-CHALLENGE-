import { describe, expect, expectTypeOf, it } from 'vitest'
import type { EventId, TraitAxis, TraitBand } from '../domain/types'
import type { EventId as UiEventId, TraitAxis as UiTraitAxis, TraitViewModel } from '../contracts'
import { classifyTrait, getTriggeredExtreme } from './traits'

describe('성향 경계와 지정 극단', () => {
  it.each([
    [0, 'extreme-left'], [22, 'extreme-left'], [23, 'warning-left'], [30, 'warning-left'],
    [31, 'normal'], [50, 'normal'], [69, 'normal'], [70, 'warning-right'],
    [77, 'warning-right'], [78, 'extreme-right'], [100, 'extreme-right'],
  ] as const)('%i 경계는 %s', (value, expected) => {
    expect(classifyTrait(value)).toEqual({ ok: true, value: expected })
  })

  it.each([-1, 101, 22.5, NaN, Infinity])('범위 밖 값 %s를 거부한다', value => {
    expect(classifyTrait(value).ok).toBe(false)
  })

  it('여러 극단이 있어도 사건의 지정 축·극 하나만 사용한다', () => {
    const traits = { risk: 0, cognition: 100, affect: 0 }
    expect(getTriggeredExtreme('E05', traits, true)).toEqual({ ok: true, value: { axis: 'risk', pole: 'left' } })
    expect(getTriggeredExtreme('E06', traits, true)).toEqual({ ok: true, value: null })
    expect(getTriggeredExtreme('E08', traits, true)).toEqual({ ok: true, value: { axis: 'cognition', pole: 'right' } })
    expect(getTriggeredExtreme('E09', traits, true)).toEqual({ ok: true, value: { axis: 'affect', pole: 'left' } })
    expect(getTriggeredExtreme('E10', traits, true)).toEqual({ ok: true, value: null })
    expect(getTriggeredExtreme('E12', traits, true)).toEqual({ ok: true, value: null })
  })

  it('E07은 내부에서만 분석 극단을 적용하고 경고 경계는 발동하지 않는다', () => {
    const traits = { risk: 50, cognition: 22, affect: 50 }
    expect(getTriggeredExtreme('E07', traits, true)).toEqual({ ok: true, value: { axis: 'cognition', pole: 'left' } })
    expect(getTriggeredExtreme('E07', traits, false)).toEqual({ ok: true, value: null })
    expect(getTriggeredExtreme('E07', { ...traits, cognition: 23 }, true)).toEqual({ ok: true, value: null })
    expectTypeOf<EventId>().toExtend<UiEventId>()
    expectTypeOf<TraitAxis>().toEqualTypeOf<UiTraitAxis>()
    expectTypeOf<TraitBand>().toEqualTypeOf<TraitViewModel['band']>()
  })
})
