import type { CheckPreview, CheckResolution, CoreState, EventId, RiskCheck, Traits } from './types'

export type NumericStat = 'stress' | 'stamina' | 'injury' | 'supply' | 'medkit' | keyof Traits
export type Resource = 'supply' | 'medkit'
export type BooleanFlag = 'access' | 'data' | 'helpEstablished' | 'routeKnown'
export type StateEffect =
  | { readonly kind: 'add'; readonly stat: NumericStat; readonly amount: number }
  | { readonly kind: 'set-flag'; readonly flag: BooleanFlag; readonly value: boolean }
  | { readonly kind: 'set-rescue-decision'; readonly value: 'rescue' | 'self' | null }
  | { readonly kind: 'set-weapon'; readonly value: boolean }
  | { readonly kind: 'remove-all'; readonly resource: Resource }

export interface ActionRequirements {
  readonly stamina?: number
  readonly supply?: number
  readonly medkit?: number
  readonly injuryMax?: number
  readonly weapon?: boolean
  readonly companion?: boolean
  readonly flags?: Readonly<Partial<Record<BooleanFlag, boolean>>>
}

export interface CoreAction {
  readonly id: string
  readonly eventId: EventId
  readonly requires: ActionRequirements
  /** Consumption, expressed as nonnegative integers. Stamina need not be a minimum. */
  readonly costs: { readonly stamina: number; readonly supply: number; readonly medkit: number }
  readonly check: RiskCheck | null
  /** Common to both outcomes. Never inferred from the outcome text. */
  readonly traitDelta: Traits
  readonly successEffects: readonly StateEffect[]
  readonly failureEffects: readonly StateEffect[]
}

export interface CoreActionInput {
  readonly phase: 'choice' | 'result' | 'ending'
  readonly eventId: EventId
  readonly state: CoreState
  readonly action: CoreAction
  readonly companionPresent: boolean
  readonly cooperating: boolean
}

export interface CoreActionPreview {
  readonly allowed: boolean
  readonly reasons: readonly string[]
  readonly check: CheckPreview
}

export type StateChange =
  | { readonly kind: 'number'; readonly field: NumericStat; readonly before: number; readonly after: number; readonly delta: number }
  | {
    readonly kind: 'value'
    readonly field: BooleanFlag | 'weapon' | 'rescueDecision'
    readonly before: boolean | 'rescue' | 'self' | null
    readonly after: boolean | 'rescue' | 'self' | null
  }

export interface AppliedEffects {
  readonly state: CoreState
  readonly changes: readonly StateChange[]
  readonly fatal: boolean
}

export interface CoreActionResolution extends AppliedEffects {
  readonly phase: 'result' | 'ending'
  readonly actionId: string
  readonly eventId: EventId
  readonly check: CheckResolution
}
