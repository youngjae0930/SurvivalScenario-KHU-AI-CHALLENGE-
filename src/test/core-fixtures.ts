import type { CoreAction } from '../domain/actions'
import type { CoreState } from '../domain/types'

/** Explicit test inputs, independent of initialization and real event content. */
export function makeCoreState(options: {
  stamina?: number; stress?: number; injury?: number; supply?: number; medkit?: number
  weapon?: boolean; routeKnown?: boolean; data?: boolean
} = {}): CoreState {
  return {
    protagonist: {
      name: '검증', traits: { risk: 50, cognition: 50, affect: 50 },
      stress: options.stress ?? 30, stamina: options.stamina ?? 70, injury: options.injury ?? 0,
    },
    inventory: { supply: options.supply ?? 1, medkit: options.medkit ?? 1, weapon: options.weapon ?? false },
    flags: { access: false, data: options.data ?? false, helpEstablished: false, routeKnown: options.routeKnown ?? false, rescueDecision: null },
  }
}

export function makeAction(overrides: Partial<CoreAction> = {}): CoreAction {
  return {
    id: 'test.explore', eventId: 'E05', requires: {},
    costs: { stamina: 10, supply: 0, medkit: 0 },
    check: { base: 70, physical: true, weaponBonus: false, traitWeights: [{ axis: 'risk', pole: 'left', weight: 1 }] },
    traitDelta: { risk: -8, cognition: 0, affect: 0 },
    successEffects: [{ kind: 'set-flag', flag: 'access', value: true }],
    failureEffects: [{ kind: 'add', stat: 'stress', amount: 10 }, { kind: 'add', stat: 'injury', amount: 1 }],
    ...overrides,
  }
}
