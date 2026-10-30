import type { AppliedEffects, NumericStat, StateChange, StateEffect } from '../domain/actions'
import type { CoreState, EngineResult } from '../domain/types'
import { isRecord, validateCoreState } from '../domain/validation'

const limits: Record<NumericStat, number> = {
  stress: 100, stamina: 100, injury: 3, supply: 3, medkit: 2, risk: 100, cognition: 100, affect: 100,
}
const stats = Object.keys(limits) as NumericStat[]
const booleanFlags = ['access', 'data', 'helpEstablished', 'routeKnown'] as const

export function isStateEffect(value: unknown): value is StateEffect {
  if (!isRecord(value)) return false
  const only = (...keys: string[]) => Object.keys(value).every(key => keys.includes(key))
  switch (value.kind) {
    case 'add': return only('kind', 'stat', 'amount') && typeof value.stat === 'string' && stats.includes(value.stat as NumericStat) && Number.isSafeInteger(value.amount)
    case 'set-flag': return only('kind', 'flag', 'value') && typeof value.flag === 'string' && (booleanFlags as readonly string[]).includes(value.flag) && typeof value.value === 'boolean'
    case 'set-rescue-decision': return only('kind', 'value') && (value.value === null || value.value === 'rescue' || value.value === 'self')
    case 'set-weapon': return only('kind', 'value') && typeof value.value === 'boolean'
    case 'remove-all': return only('kind', 'resource') && (value.resource === 'supply' || value.resource === 'medkit')
    default: return false
  }
}

/** Internal arithmetic: affordability is checked by resolveCoreAction before this. */
export function applyStateEffects(state: CoreState, effects: readonly StateEffect[]): EngineResult<AppliedEffects> {
  const validated = validateCoreState(state)
  if (!validated.ok) return validated
  const invalid = (message: string): EngineResult<never> => ({ ok: false, error: { code: 'invalid-action', message } })
  if (!Array.isArray(effects)) return invalid('효과 데이터가 올바르지 않습니다.')
  const validatedEffects: unknown[] = Array.from(effects)
  if (!validatedEffects.every(isStateEffect)) return invalid('효과 데이터가 올바르지 않습니다.')
  const source = validated.value
  const actor = source.protagonist
  const before = {
    stress: actor.stress, stamina: actor.stamina, injury: actor.injury,
    supply: source.inventory.supply, medkit: source.inventory.medkit, ...actor.traits,
  }
  const totals: Record<NumericStat, number> = { stress: 0, stamina: 0, injury: 0, supply: 0, medkit: 0, risk: 0, cognition: 0, affect: 0 }
  const removeAll = new Set<'supply' | 'medkit'>()
  const assignments = new Map<string, boolean | 'rescue' | 'self' | null>()
  for (const effect of validatedEffects) {
    if (effect.kind === 'add') {
      totals[effect.stat] += effect.amount
      if (!Number.isSafeInteger(totals[effect.stat])) return invalid('효과 합산값이 안전한 정수 범위를 벗어났습니다.')
    } else if (effect.kind === 'remove-all') {
      removeAll.add(effect.resource)
    } else {
      const key = effect.kind === 'set-flag' ? effect.flag : effect.kind === 'set-weapon' ? 'weapon' : 'rescueDecision'
      if (assignments.has(key) && assignments.get(key) !== effect.value) return invalid('동일 필드에 상충하는 설정 효과가 있습니다.')
      assignments.set(key, effect.value)
    }
  }
  for (const resource of removeAll) {
    // Even offsetting add/remove operations would make ordering ambiguous.
    if (validatedEffects.some(effect => effect.kind === 'add' && effect.stat === resource && effect.amount !== 0)) {
      return invalid('자원 전량 제거와 같은 자원 증감/소모를 동시에 적용할 수 없습니다.')
    }
  }
  const after = { ...before }
  const changes: StateChange[] = []
  for (const stat of stats) {
    const raw = before[stat] + totals[stat]
    if (!Number.isSafeInteger(raw)) return invalid('결과 수치가 안전한 정수 범위를 벗어났습니다.')
    if ((stat === 'supply' || stat === 'medkit') && raw < 0) return invalid('물자를 음수로 소비할 수 없습니다.')
    after[stat] = (stat === 'supply' || stat === 'medkit') && removeAll.has(stat) ? 0 : Math.min(limits[stat], Math.max(0, raw))
    if (after[stat] !== before[stat]) changes.push({ kind: 'number', field: stat, before: before[stat], after: after[stat], delta: after[stat] - before[stat] })
  }
  const flags = { ...source.flags }
  let weapon = source.inventory.weapon
  for (const [key, value] of assignments) {
    const previous = key === 'weapon' ? weapon : flags[key as keyof typeof flags]
    if (previous !== value) changes.push({ kind: 'value', field: key as 'weapon' | keyof typeof flags, before: previous, after: value })
    if (key === 'weapon') weapon = value as boolean
    else if (key === 'rescueDecision') flags.rescueDecision = value as 'rescue' | 'self' | null
    else flags[key as typeof booleanFlags[number]] = value as boolean
  }
  return {
    ok: true,
    value: {
      state: {
        protagonist: { name: actor.name, traits: { risk: after.risk, cognition: after.cognition, affect: after.affect }, stress: after.stress, stamina: after.stamina, injury: after.injury },
        inventory: { supply: after.supply, medkit: after.medkit, weapon }, flags,
      },
      changes, fatal: after.injury >= 3,
    },
  }
}
