/** Internal core values, not a RunState or a persistence schema. */
export type TraitAxis = 'risk' | 'cognition' | 'affect'
export type TraitPole = 'left' | 'right'
export type TraitBand = 'normal' | 'warning-left' | 'warning-right' | 'extreme-left' | 'extreme-right'
export type EventId =
  | 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06'
  | 'E07' | 'E08' | 'E09' | 'E10' | 'E11' | 'E12'

export interface Traits {
  readonly risk: number
  readonly cognition: number
  readonly affect: number
}

export interface CoreState {
  readonly protagonist: {
    readonly name: string
    readonly traits: Traits
    readonly stress: number
    readonly stamina: number
    readonly injury: number
  }
  readonly inventory: { readonly supply: number; readonly medkit: number; readonly weapon: boolean }
  readonly flags: {
    readonly access: boolean
    readonly data: boolean
    readonly helpEstablished: boolean
    readonly routeKnown: boolean
    readonly rescueDecision: 'rescue' | 'self' | null
  }
}

/** Mapped by the app from validated questionnaire content, never trusted from UI. */
export interface ResolvedQuestionnaireAnswer {
  readonly questionId: string
  readonly axis: TraitAxis
  readonly delta: -10 | 10
}

export interface RiskCheck {
  readonly base: number
  readonly traitWeights: readonly {
    readonly axis: TraitAxis
    readonly pole: TraitPole
    readonly weight: number
  }[]
  readonly physical: boolean
  readonly weaponBonus: boolean
}

export interface CheckInput {
  readonly state: CoreState
  readonly eventId: EventId
  readonly check: RiskCheck | null
  /** Already decided by companion participation; this module does not choose it. */
  readonly cooperating: boolean
}

export interface ProbabilityBreakdown {
  readonly base: number
  readonly trait: number
  readonly condition: number
  readonly equipment: number
  readonly support: number
  readonly flag: number
  readonly percent: number
}

export type CheckPreview =
  | { readonly kind: 'certain' }
  | { readonly kind: 'probability'; readonly probability: ProbabilityBreakdown }

export type CheckResolution =
  | { readonly outcome: 'certain'; readonly probability: null; readonly roll: null; readonly rngState: number }
  | {
    readonly outcome: 'success' | 'failure'
    readonly probability: ProbabilityBreakdown
    readonly roll: number
    readonly rngState: number
  }

export type EngineResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
    readonly ok: false
    readonly error: {
      readonly code: 'invalid-state' | 'invalid-questionnaire' | 'invalid-check' | 'invalid-seed'
        | 'invalid-action' | 'action-unavailable' | 'stale-context'
      readonly message: string
    }
  }
