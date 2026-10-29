import type { CheckInput, CheckPreview, CheckResolution, EngineResult, RiskCheck } from '../domain/types'
import { isIntegerInRange, isRecord, validateCoreState } from '../domain/validation'
import { drawRandom } from './random'

/** ECMAScript Math.round rounds negative halves toward +Infinity. */
export function roundHalfAwayFromZero(value: number): number {
  const rounded = Math.round(Math.abs(value))
  return rounded === 0 ? 0 : Math.sign(value) * rounded
}

export function isRiskCheck(check: unknown): check is RiskCheck {
  if (!isRecord(check) || !isIntegerInRange(check.base, 0, 100)
    || typeof check.physical !== 'boolean' || typeof check.weaponBonus !== 'boolean'
    || !Array.isArray(check.traitWeights) || check.traitWeights.length < 1 || check.traitWeights.length > 2) return false
  let total = 0
  const axes = new Set<string>()
  for (const item of check.traitWeights) {
    if (!isRecord(item) || typeof item.axis !== 'string' || !['risk', 'cognition', 'affect'].includes(item.axis)
      || axes.has(item.axis) || !['left', 'right'].includes(item.pole as string)
      || typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 1) return false
    axes.add(item.axis)
    total += item.weight
  }
  return Math.abs(total - 1) <= 1e-10
}

function conditionPenalty(value: number): number {
  return value < 20 ? -10 : value < 40 ? -5 : 0
}

/** Calculation only: eligibility, costs and participation must already be resolved. */
export function previewCheck(input: CheckInput): EngineResult<CheckPreview> {
  if (!isRecord(input)) {
    return { ok: false, error: { code: 'invalid-check', message: '판정 입력이 필요합니다.' } }
  }
  const stateResult = validateCoreState(input.state)
  if (!stateResult.ok) return stateResult
  if (typeof input.eventId !== 'string' || !/^E(0[1-9]|1[0-2])$/.test(input.eventId) || typeof input.cooperating !== 'boolean') {
    return { ok: false, error: { code: 'invalid-check', message: '사건과 협력 여부를 명시해야 합니다.' } }
  }
  if (input.check === null) return { ok: true, value: { kind: 'certain' } }
  if (input.eventId === 'E12' || !isRiskCheck(input.check)) {
    return { ok: false, error: { code: 'invalid-check', message: '판정 필드를 완성해야 하며 E12는 위험 판정을 사용할 수 없습니다.' } }
  }
  const { protagonist: actor, inventory, flags } = stateResult.value
  const check = input.check
  const affinity = check.traitWeights.reduce((sum, item) => {
    const value = actor.traits[item.axis]
    return sum + item.weight * (item.pole === 'left' ? (50 - value) / 50 : (value - 50) / 50)
  }, 0)
  const trait = roundHalfAwayFromZero(15 * affinity)
  const condition = (actor.stress > 80 ? -10 : actor.stress > 60 ? -5 : 0)
    + (check.physical ? conditionPenalty(actor.stamina) - 5 * actor.injury : 0)
  const equipment = check.weaponBonus && inventory.weapon ? 10 : 0
  const support = input.cooperating ? 10 : 0
  const flag = input.eventId === 'E07' && flags.access ? 5 : 0
  const percent = Math.min(95, Math.max(5, check.base + trait + condition + equipment + support + flag))
  return { ok: true, value: { kind: 'probability', probability: { base: check.base, trait, condition, equipment, support, flag, percent } } }
}

export function isSuccessfulRoll(percent: number, roll: number): EngineResult<boolean> {
  if (!isIntegerInRange(percent, 5, 95) || typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) {
    return { ok: false, error: { code: 'invalid-check', message: '확률 또는 난수의 범위가 올바르지 않습니다.' } }
  }
  return { ok: true, value: 100 * roll < percent }
}

/** Returns a new PRNG position only. Does not mutate state, spend costs or save. */
export function resolveCheck(input: CheckInput, rngState: number): EngineResult<CheckResolution> {
  const preview = previewCheck(input)
  if (!preview.ok) return preview
  if (!isIntegerInRange(rngState, 1, 0xffffffff)) {
    return { ok: false, error: { code: 'invalid-seed', message: '진행 중 난수 상태가 올바르지 않습니다.' } }
  }
  if (preview.value.kind === 'certain') {
    return { ok: true, value: { outcome: 'certain', probability: null, roll: null, rngState } }
  }
  const draw = drawRandom(rngState)
  if (!draw.ok) return draw
  const probability = preview.value.probability
  const success = isSuccessfulRoll(probability.percent, draw.value.roll)
  if (!success.ok) return success
  return {
    ok: true,
    value: { outcome: success.value ? 'success' : 'failure', probability, roll: draw.value.roll, rngState: draw.value.rngState },
  }
}
