import type { CoreState, EngineResult, TraitAxis, Traits } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export function isTraitAxis(value: unknown): value is TraitAxis {
  return value === 'risk' || value === 'cognition' || value === 'affect'
}

export function isTraits(value: unknown): value is Traits {
  return isRecord(value) && ['risk', 'cognition', 'affect'].every(axis => isIntegerInRange(value[axis], 0, 100))
}

/** Rejects corrupt values; never clamps data coming from an external boundary. */
export function validateCoreState(value: unknown): EngineResult<CoreState> {
  if (!isRecord(value) || !isRecord(value.protagonist) || !isRecord(value.inventory) || !isRecord(value.flags)) {
    return { ok: false, error: { code: 'invalid-state', message: '주인공·물자·플래그 객체가 필요합니다.' } }
  }
  const { protagonist: actor, inventory, flags } = value
  if (typeof actor.name !== 'string' || !isTraits(actor.traits)
    || !isIntegerInRange(actor.stress, 0, 100) || !isIntegerInRange(actor.stamina, 0, 100)
    || !isIntegerInRange(actor.injury, 0, 3)
    || !isIntegerInRange(inventory.supply, 0, 3) || !isIntegerInRange(inventory.medkit, 0, 2)
    || typeof inventory.weapon !== 'boolean'
    || !['access', 'data', 'helpEstablished', 'routeKnown'].every(key => typeof flags[key] === 'boolean')
    || ![null, 'rescue', 'self'].includes(flags.rescueDecision as null | string)) {
    return { ok: false, error: { code: 'invalid-state', message: '상태 필드의 형식 또는 범위가 올바르지 않습니다.' } }
  }
  // Construct a whitelisted projection; no caller-owned nested objects escape.
  return {
    ok: true,
    value: {
      protagonist: {
        name: actor.name, traits: { risk: actor.traits.risk, cognition: actor.traits.cognition, affect: actor.traits.affect },
        stress: actor.stress, stamina: actor.stamina, injury: actor.injury,
      },
      inventory: { supply: inventory.supply, medkit: inventory.medkit, weapon: inventory.weapon },
      flags: {
        access: flags.access as boolean, data: flags.data as boolean,
        helpEstablished: flags.helpEstablished as boolean, routeKnown: flags.routeKnown as boolean,
        rescueDecision: flags.rescueDecision as 'rescue' | 'self' | null,
      },
    },
  }
}
