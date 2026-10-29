import type { EngineResult } from '../domain/types'
import { isIntegerInRange } from '../domain/validation'

/** Technical algorithm identity, not a game rulesVersion or save schema choice. */
export const RANDOM_ALGORITHM = 'xorshift32-v1' as const
export const ZERO_SEED_REPLACEMENT = 0x6d2b79f5

export function initializeRandom(seed: number): EngineResult<number> {
  if (!isIntegerInRange(seed, 0, 0xffffffff)) {
    return { ok: false, error: { code: 'invalid-seed', message: 'seed는 unsigned 32비트 정수여야 합니다.' } }
  }
  return { ok: true, value: seed === 0 ? ZERO_SEED_REPLACEMENT : seed }
}

/** Zero normalization happens only at initialization, never silently on restore. */
export function drawRandom(state: number): EngineResult<{ readonly rngState: number; readonly roll: number }> {
  if (!isIntegerInRange(state, 1, 0xffffffff)) {
    return { ok: false, error: { code: 'invalid-seed', message: '진행 중 난수 상태는 0이 아닌 unsigned 32비트 정수여야 합니다.' } }
  }
  let next = state
  next ^= next << 13
  next ^= next >>> 17
  next ^= next << 5
  const rngState = next >>> 0
  return { ok: true, value: { rngState, roll: rngState / 0x100000000 } }
}
