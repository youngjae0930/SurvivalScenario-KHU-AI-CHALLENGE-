import type {
  Availability, ChoiceContext, DecisionId, EndingKind, EventId, TextKey, TraitAxis, UI_CONTRACT_VERSION,
} from './common'

export interface TraitViewModel {
  readonly axis: TraitAxis
  readonly value: number
  readonly leftLabel: string
  readonly rightLabel: string
  readonly band: 'normal' | 'warning-left' | 'warning-right' | 'extreme-left' | 'extreme-right'
}

export interface StatusViewModel {
  /** Independent physical condition; inventory remains shared. Missing on older rules. */
  readonly companion?: { readonly name: string; readonly stamina: number; readonly stress: number; readonly injury: number;
    readonly state: 'present' | 'separated' | 'dead'; readonly deathCause?: 'injury' | 'infection' }
  /** Absent on historical packs whose rules contain no infection mechanic. */
  readonly infection?: { readonly protagonist: 'clear' | 'dead'; readonly companion: { readonly name: string; readonly status: 'clear' | 'dead' } | null }
  readonly name: string
  readonly traits: readonly TraitViewModel[]
  readonly stress: number
  readonly stamina: number
  readonly injury: number
  readonly supply: number
  readonly medkit: number
  readonly weapon: boolean
}

/** Only the app decides whether an already-read story paragraph may collapse. */
export interface StoryBlockViewModel {
  readonly key: TextKey
  readonly text: string
  readonly collapsible: boolean
  readonly initiallyCollapsed: boolean
}

export interface ChangeViewModel {
  readonly traitAxis?: TraitAxis
  readonly label: string
  readonly text: string
  /** Actual delta after clamping; null for non-numeric changes. */
  readonly actualDelta: number | null
}

export type CompanionViewModel =
  | { readonly kind: 'absent' }
  | {
    readonly kind: 'present'
    readonly name: string
    readonly trust: number
    readonly opinion:
      | { readonly kind: 'not-applicable' }
      | {
        readonly kind: 'ready'
        readonly actionId: string
        readonly goalId: string
        readonly text: string
        readonly reason: string
        readonly source: 'extreme' | 'judgment-counts' | 'trait' | 'fallback'
      }
      | {
        readonly kind: 'pending-decision'
        readonly decisions: readonly DecisionId[]
        readonly message: string
      }
  }

export interface ActionViewModel {
  readonly actionId: string
  readonly goalId: string
  readonly label: string
  readonly intention: string
  readonly availability: Availability
  readonly recommended: boolean
  readonly requiresCompanion: boolean
}

export interface ChoiceViewModel {
  readonly fixedStageHistory?: readonly FixedStageChoiceViewModel[]
  readonly treatmentActionIds?: readonly string[]
  readonly notices: readonly string[]
  readonly kind: 'choice'
  readonly context: ChoiceContext
  readonly title: string
  readonly story: readonly StoryBlockViewModel[]
  readonly status: StatusViewModel
  readonly companion: CompanionViewModel
  /** Includes locked cards; array length is not the number of active actions. */
  readonly actions: readonly ActionViewModel[]
  readonly treatment: Availability
  readonly recentResult: { readonly label: string; readonly text: readonly string[] } | null
}

export interface ResultViewModel {
  readonly fixedStageHistory?: readonly FixedStageChoiceViewModel[]
  readonly kind: 'result'
  readonly context: ChoiceContext
  readonly resultId: string
  readonly actionLabel: string
  readonly outcome: 'success' | 'failure' | 'certain'
  readonly text: readonly string[]
  readonly changes: readonly ChangeViewModel[]
  readonly trustReasons: readonly string[]
  readonly consequences: readonly string[]
  readonly status: StatusViewModel
  readonly nextEventId: EventId | null
  readonly nextLabel?: string
  readonly completesSegment?: boolean
}

export interface EndingViewModel {
  readonly fixedStageHistory?: readonly FixedStageChoiceViewModel[]
  readonly kind: 'ending'
  readonly runId: string
  readonly resultId: string
  readonly ending: EndingKind
  readonly title: string
  readonly text: readonly string[]
  readonly status: StatusViewModel
  readonly changes: readonly ChangeViewModel[]
  readonly legacySummary: readonly string[]
  readonly newRun: Availability
}

export interface QuestionnaireAnswer {
  readonly questionId: string
  readonly answerId: string
}

export interface FixedStageChoiceViewModel {
  readonly resultText?: readonly string[]
  readonly stageNumber: number
  readonly locationId: string
  readonly locationName: string
  readonly actionLabel: string | null
  readonly outcome: 'success' | 'failure' | 'certain' | null
  readonly actor: 'protagonist' | 'companion' | null
  readonly current: boolean
}

export interface StartViewModel {
  readonly succession?: {
    readonly sourceRunId: string
    readonly sourceResultId: string
    readonly endingTitle: string
    readonly summary: readonly string[]
  }
  readonly kind: 'start'
  readonly introduction: readonly string[]
  readonly questions: readonly {
    readonly questionId: string
    readonly text: string
    readonly answers: readonly { readonly answerId: string; readonly label: string }[]
  }[]
  readonly previousAnswers: readonly QuestionnaireAnswer[]
  readonly canResume: boolean
  readonly newRun: Availability
}

/** A development segment boundary, never a product ending or Legacy. */
export interface SegmentCompleteViewModel {
  readonly continuation: { readonly context: ChoiceContext; readonly label: string } | null
  readonly kind: 'segment-complete'
  readonly title: string
  readonly text: readonly string[]
  readonly status: StatusViewModel
  readonly completedEventIds: readonly EventId[]
  readonly nextEventId: EventId
}

export type GameViewModel = StartViewModel | ChoiceViewModel | ResultViewModel | EndingViewModel | SegmentCompleteViewModel

/** A failed write keeps the last committed view; pending outcomes stay private. */
export type CommitStatus =
  | { readonly kind: 'ready' }
  | { readonly kind: 'saving'; readonly operationId: string }
  | { readonly kind: 'save-failed'; readonly operationId: string; readonly message: string }
  | { readonly kind: 'blocked'; readonly message: string }

export interface AppSnapshot {
  readonly presentation?: {
    readonly edition: string
    readonly journey: readonly { readonly id: string; readonly label: string; readonly state: 'current' | 'visited' | 'upcoming' }[]
  }
  readonly contractVersion: typeof UI_CONTRACT_VERSION
  readonly source: 'core' | 'ui-fixture'
  /** session commits are in memory only; fixture never executes gameplay. */
  readonly persistence: { readonly kind: 'session' | 'durable' | 'fixture'; readonly message: string }
  readonly view: GameViewModel
  readonly commit: CommitStatus
  readonly profile: { readonly collapseReadTextEnabled: boolean }
  readonly pendingDecisions: readonly DecisionId[]
}

export type ParticipationViewModel =
  | { readonly kind: 'absent' }
  | {
    readonly kind: 'cooperate' | 'refuse' | 'independent'
    readonly explanation: string
    readonly contribution: readonly string[]
  }

export interface ActionPreviewViewModel {
  /** Treatment availability for the currently selected actor. */
  readonly treatmentAvailability?: Availability
  /** Omitted for actions/old packs without an explicit actor option. No fifth story choice. */
  readonly execution?: {
    readonly actor: 'protagonist' | 'companion'
    readonly role: string
    readonly options: readonly { readonly actor: 'protagonist' | 'companion'; readonly label: string; readonly availability: Availability }[]
  }
  /** App-issued handle bound to the exact context, action and treatment inputs. */
  readonly previewToken: string
  readonly context: ChoiceContext
  readonly actionId: string
  readonly treatment: 'none' | 'medkit'
  readonly goalId: string
  readonly label: string
  readonly intention: string
  readonly target: string
  readonly availability: Availability
  readonly requirements: readonly string[]
  readonly costs: readonly string[]
  readonly traitChanges: readonly string[]
  readonly outcomes: { readonly success: readonly string[]; readonly failure: readonly string[] }
  readonly risk:
    | { readonly kind: 'certain'; readonly explanation: string }
    | { readonly kind: 'probability'; readonly percent: number; readonly breakdown: readonly string[] }
  readonly participation: ParticipationViewModel
  readonly warnings: readonly string[]
}
