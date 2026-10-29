/** UI contract version; unrelated to save schemaVersion or game rulesVersion. */
export const UI_CONTRACT_VERSION = '0.8.0' as const

/** Narrative IDs come from validated content; mechanical E01~E12 IDs stay internal. */
export type EventId = string
export type DecisionId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05'
  | 'D06' | 'D07' | 'D08' | 'D09'
export type TraitAxis = 'risk' | 'cognition' | 'affect'
export type EndingKind = 'data-and-escape' | 'escape' | 'escape-failed'

export interface TextKey {
  readonly textId: string
  readonly contentRevision: string
  readonly contextVariantId: string
}

/** Issued by the app. UI must forward these values without incrementing them. */
export interface ChoiceContext {
  readonly runId: string
  readonly eventId: EventId
  readonly stateRevision: number
  readonly snapshotId: string
}

export type Availability =
  | { readonly kind: 'available' }
  | { readonly kind: 'locked'; readonly reasons: readonly string[] }
  | {
    readonly kind: 'pending-decision'
    readonly decisions: readonly DecisionId[]
    readonly message: string
  }

export interface ContractError {
  readonly code:
    | 'stale-context' | 'invalid-phase' | 'invalid-input' | 'action-unavailable'
    | 'policy-unresolved' | 'content-invalid' | 'save-failed'
    | 'save-conflict' | 'save-incompatible' | 'busy' | 'internal-error'
  readonly message: string
  readonly decisions: readonly DecisionId[]
}

export type ContractResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ContractError }
