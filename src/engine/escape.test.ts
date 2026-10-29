import { describe, expect, it } from 'vitest'
import { makeCoreState } from '../test/core-fixtures'
import { getEscapeOptions, resolveEscape } from './escape'

describe('E12 누적 상태로 결정되는 탈출', () => {
  it.each([
    [14, 1, false, ['request']], [14, 1, true, ['request']],
    [15, 1, false, ['short']], [15, 1, true, ['short']],
    [29, 1, true, ['short']], [30, 1, true, ['short', 'detour']],
    [30, 1, false, ['short']], [15, 2, true, ['request']],
    [29, 2, true, ['request']], [30, 2, true, ['detour']],
    [30, 2, false, ['request']], [30, 3, true, []],
  ] as const)('stamina%i injury%i routeKnown%s에서 가능한 경로', (stamina, injury, routeKnown, expected) => {
    const options = getEscapeOptions(makeCoreState({ stamina, injury, routeKnown }))
    if (!options.ok) throw new Error(options.error.message)
    expect(options.value.filter(option => option.allowed).map(option => option.route)).toEqual(expected)
    for (const option of options.value) if (!option.allowed) expect(option.reasons.length).toBeGreaterThan(0)
  })

  it.each([false, true])('단거리 탈출은 스태미나15를 쓰고 data=%s에 따라 결말을 나눈다', data => {
    const request = { state: makeCoreState({ stamina: 15, injury: 1, data }), eventId: 'E12', route: 'short', phase: 'choice' } as const
    const before = structuredClone(request)
    expect(resolveEscape(request, 1)).toMatchObject({ ok: true, value: {
      phase: 'ending', ending: data ? 'data-and-escape' : 'escape', reason: 'escaped',
      state: { protagonist: { stamina: 0, injury: 1 } }, check: { outcome: 'certain', rngState: 1, roll: null },
    } })
    expect(request).toEqual(before)
  })

  it('알려진 우회는 부상2에서도 스태미나30을 쓰고 탈출한다', () => {
    expect(resolveEscape({ state: makeCoreState({ stamina: 30, injury: 2, routeKnown: true }), eventId: 'E12', route: 'detour', phase: 'choice' }, 1)).toMatchObject({ ok: true, value: {
      ending: 'escape', state: { protagonist: { stamina: 0, injury: 2 } }, check: { rngState: 1 },
    } })
  })

  it('두 경로 모두 불가능하면 자료가 있어도 구조 요청/탈출 실패로 끝난다', () => {
    expect(resolveEscape({ state: makeCoreState({ stamina: 0, stress: 100, injury: 2, data: true }), eventId: 'E12', route: 'request', phase: 'choice' }, 1)).toMatchObject({ ok: true, value: {
      phase: 'ending', ending: 'escape-failed', reason: 'rescue-wait',
      state: { protagonist: { stamina: 0, injury: 2 }, flags: { data: true } }, check: { rngState: 1 },
    } })
  })

  it('잠긴 경로·잘못된 사건·이미 끝난 단계와 치명 부상은 실행하지 않는다', () => {
    const base = { state: makeCoreState({ stamina: 15 }), eventId: 'E12', phase: 'choice', route: 'short' } as const
    expect(resolveEscape({ ...base, route: 'detour' }, 1).ok).toBe(false)
    expect(resolveEscape({ ...base, route: 'request' }, 1).ok).toBe(false)
    expect(resolveEscape({ ...base, eventId: 'E11' }, 1).ok).toBe(false)
    expect(resolveEscape({ ...base, phase: 'ending' }, 1).ok).toBe(false)
    expect(resolveEscape({ ...base, state: makeCoreState({ injury: 3 }) }, 1).ok).toBe(false)
  })
})
