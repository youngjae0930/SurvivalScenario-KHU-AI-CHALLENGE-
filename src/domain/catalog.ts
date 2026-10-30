import type { CoreAction, CoreActionPreview, CoreActionResolution, StateChange } from './actions'
import type { CoreState, EventId, Traits } from './types'

export type StageId = 'early' | 'middle' | 'late'
export type Condition =
  | { readonly kind: 'opportunity'; readonly id: string }
  | { readonly kind: 'number'; readonly subject: 'protagonist' | 'companion'; readonly stat: 'stress' | 'stamina' | 'injury' | keyof Traits | 'trust'; readonly min: number; readonly max: number }
  | { readonly kind: 'resource'; readonly resource: 'supply' | 'medkit'; readonly min: number; readonly max: number }
  | { readonly kind: 'companion'; readonly present: boolean }
  | { readonly kind: 'weapon'; readonly value: boolean }
  | { readonly kind: 'flag'; readonly flag: 'access' | 'data' | 'helpEstablished' | 'routeKnown'; readonly value: boolean }
  | { readonly kind: 'fact'; readonly id: string; readonly value: boolean }
  | { readonly kind: 'visited'; readonly locationId: string; readonly value: boolean }
  | { readonly kind: 'location-tag'; readonly tag: string }
  | { readonly kind: 'stage'; readonly stage: StageId }

export interface CatalogLocation {
  /** Author switch for optional locations. Missing on historical packs means enabled. */
  readonly enabled?: boolean
  readonly id: string
  readonly name: string
  readonly stage: StageId
  readonly tags: readonly string[]
  /** Entry is allowed if the preceding location has at least one matching tag. */
  readonly fromTags: readonly string[]
  readonly after: readonly string[]
  readonly required: boolean
  readonly weight: number
}
export interface CatalogChoice {
  readonly ending?: { readonly conditions: readonly Condition[]; readonly kind: 'cure-discovery' | 'tunnel-escape' | 'outskirts-escape' }
  /** Ordered contacts on a failed check only; each source must actually be infected. */
  readonly infection?: readonly InfectionContact[]
  /** Append this authored route segment after committing this navigation action. */
  readonly destinationSegmentId?: string
  /** Authored story consequences, in evaluation units, never a direct trust delta. */
  readonly relationship?: { readonly success: readonly RelationshipImpact[]; readonly failure: readonly RelationshipImpact[] }
  /** Author-defined command role and explicit shared-risk explanation; never inferred from physical. */
  readonly execution?: {
    /** Explicit authored risk class; missing means unknown on historical packs. */
    readonly risk?: 'routine' | 'hazardous'
    readonly role: string
    readonly conditions: readonly Condition[]
    readonly sharedRisk: string
  }
  /** Narrative tempo only; absent means unknown, never inferred from an ID or label. */
  readonly pace?: 'slow' | 'balanced' | 'fast'
  readonly id: string
  readonly goalId: string
  readonly label: string
  readonly intention: string
  readonly target: string
  readonly judgment: 'rescue' | 'self' | null
  readonly behavior:
    | { readonly kind: 'action'; readonly variants: readonly { readonly conditions: readonly Condition[]; readonly action: CoreAction }[] }
    | { readonly kind: 'recovery'; readonly ruleEventId: 'E04' | 'E11'; readonly choice: 'maintain' | 'share' | 'rest' }
    | { readonly kind: 'escape'; readonly ruleEventId: 'E12'; readonly route: 'short' | 'detour' | 'request' }
  readonly successFacts: Readonly<Record<string, boolean>>
  readonly failureFacts: Readonly<Record<string, boolean>>
}
export interface CatalogEvent {
  /** Additional authored extreme groups, each retaining an independent companion alternative. */
  readonly interventions?: readonly NonNullable<CatalogEvent['intervention']>[]
  readonly autonomy?: CatalogAutonomyPolicy
  readonly recommendation?: { readonly axis: keyof Traits }
  readonly id: string
  readonly title: string
  readonly locationIds: readonly string[]
  readonly locationTags: readonly string[]
  readonly conditions: readonly Condition[]
  readonly weight: number
  readonly intervention?: {
    /** Absent on historical packs: preserve the original trust-gated intervention. */
    readonly mode?: 'companion-choice'
    readonly groupId: string
    readonly axis: keyof Traits
    readonly extremePole: 'left' | 'right'
    readonly replaceChoiceId: string
    readonly alternatives: readonly { readonly groupId: string; readonly choiceId: string }[]
    readonly judgment: 'rescue' | 'self' | null
    readonly text: string
    readonly notices: readonly string[]
  }
  readonly groups: readonly {
    readonly id: string
    readonly priority: number
    readonly conditions: readonly Condition[]
    readonly notices: readonly string[]
    readonly choices: readonly CatalogChoice[]
  }[]
}
export interface CatalogScript {
  readonly id: string
  readonly eventId: string
  readonly choiceId: string | null
  readonly slot: 'scene' | 'success' | 'failure' | 'opinion' | 'hesitation' | 'departure-warning' | 'departure' | 'absent' | 'reunion' | 'recommendation-failure' | 'infection-ending'
  readonly conditions: readonly Condition[]
  readonly priority: number
  readonly weight: number
  readonly once: boolean
  readonly text: readonly string[]
}
export interface CatalogManifest {
  readonly extremeExperienceVersion?: 'middle-1'
  readonly traitRangeVersion?: 'relaxed-1'
  readonly companionStateVersion?: 'separate-1'
  readonly reactionVersion?: 'responsibility-1' | 'contextual-1'
  readonly endingVersion?: 'routes-1'
  readonly researchVersion?: 'research-1'
  readonly opportunities?: readonly { readonly id: string; readonly locationTags: readonly string[] }[]
  readonly infectionVersion?: 'immediate-1'
  readonly slotPlan?: {
    readonly startSegmentId: string
    readonly segments: readonly CatalogSegment[]
  }
  /** Authored dialogue channels; display lookup never consumes gameplay randomness. */
  readonly dialogueVersion?: 'scripts-1'
  readonly routeVersion?: 'stages-1' | 'slots-1'
  readonly trustVersion?: 'outcome-1' | 'outcome-2'
  readonly trustScale?: 2
  readonly executionVersion?: 'command-1'
  readonly autonomyVersion?: 'journey-1' | 'journey-2'
  /** Only explicitly compatible content revisions may share decision meanings. */
  readonly decisionEcho?: { readonly version: 'echo-1'; readonly compatibleRevisions: readonly string[] }
  /** Capture only actual new decisions. Omitted on historical frozen packs. */
  readonly decisionMemoryVersion?: 'context-1'
  /** Saved packs without this field retain their previous companion opinions. */
  readonly recommendationVersion?: 'survival-1'
  /** Saved packs without this field retain their previous presentation. */
  readonly presentationVersion?: 'reflection-1'
  readonly formatVersion: 1
  readonly id: string
  readonly revision: string
  readonly rulesVersion: '1.2-stress-1'
  readonly title: string
  readonly startLocationId: string
  readonly stages: readonly { readonly id: StageId; readonly minVisits: number; readonly maxVisits: number }[]
  readonly facts: readonly string[]
  readonly boundary: { readonly nextEventId: string; readonly title: string; readonly text: readonly string[] }
}
export interface CatalogSegment {
  /** State-based entry gate; static lockedReason remains a separate authoring switch. */
  readonly entry?: { readonly conditions: readonly Condition[]; readonly reason: string }
  readonly id: string
  readonly stage: StageId
  readonly slots: readonly { readonly number: number; readonly candidates: readonly string[] }[]
  readonly nextSegmentIds: readonly string[]
  /** Unresolved hidden-route policy stays explicitly unavailable. */
  readonly lockedReason?: string
}
export interface CatalogPack {
  readonly manifest: CatalogManifest
  readonly locations: readonly CatalogLocation[]
  readonly events: readonly CatalogEvent[]
  readonly scripts: readonly CatalogScript[]
}
export interface CompanionContext {
  readonly name: string
  readonly traits: Traits
  readonly trust: number
  readonly judgmentCounts?: { readonly rescue: number; readonly self: number }
}
export interface CompanionVitals {
  readonly stamina: number
  readonly stress: number
  readonly injury: number
}
export interface CatalogContext {
  readonly extremeBounds?: { readonly left: number; readonly right: number }
  readonly opportunities?: readonly string[]
  readonly infection?: { readonly protagonist: boolean; readonly companion: boolean }
  readonly core: CoreState
  readonly companion: (CompanionContext & Partial<CompanionVitals>) | null
  readonly facts: Readonly<Record<string, boolean>>
  readonly visited: readonly string[]
  readonly location: CatalogLocation
}
export interface CatalogVisit {
  readonly locationId: string
  readonly eventId: string
  readonly sceneScriptId: string
}
export interface CatalogHistory {
  readonly companionChange?: { readonly before: CompanionVitals; readonly after: CompanionVitals; readonly changes: readonly StateChange[] }
  /** Captured before execution; never infer a past recommendation from the outcome. */
  readonly followedCompanionRecommendation?: true
  readonly infectionDeaths?: readonly InfectionDeath[]
  readonly execution?: { readonly actor: 'companion'; readonly role: string; readonly sharedRisk: string }
  readonly companionDeparture?: CatalogSeparation
  readonly decisionContext?: CatalogDecisionContext
  readonly resultId: string
  readonly visitIndex: number
  readonly eventId: string
  readonly actionId: string
  readonly treat: boolean
  readonly judgment: 'rescue' | 'self' | null
  readonly resultScriptId: string
  readonly resolution: CoreActionResolution
  readonly trustChange?: { readonly before: number; readonly after: number; readonly reason: string }
  readonly escape?: { readonly ending: 'data-and-escape' | 'escape' | 'escape-failed' | 'cure-discovery' | 'tunnel-escape' | 'outskirts-escape'; readonly reason: 'escaped' | 'rescue-wait' }
}
/** Before-state evidence, not a policy for deciding whether two scenes are the same. */
export interface CatalogDecisionContext {
  readonly companionVitals?: CompanionVitals
  readonly opportunities?: readonly string[]
  readonly infection?: { readonly protagonist: boolean; readonly companion: boolean }
  /** Non-four groups record their count; absent in historical four-choice evidence. */
  readonly optionCount?: number
  readonly relationship?: { readonly version: 'outcome-1' | 'outcome-2'; readonly companion: CompanionContext }
  readonly executionActor?: 'companion'
  readonly commandTrustSufficient?: boolean
  readonly autonomy?: { readonly policy: CatalogAutonomyPolicy; readonly preferredActionId: string | null }
  readonly content: { readonly packId: string; readonly revision: string; readonly rulesVersion: '1.2-stress-1' }
  readonly eventId: string
  readonly locationId: string
  readonly stage: StageId
  readonly groupId: string
  readonly sceneScriptId: string
  readonly core: CoreState
  readonly companion: CompanionContext | null
  readonly facts: Readonly<Record<string, boolean>>
  readonly visitedLocationIds: readonly string[]
  readonly options: readonly {
    readonly actionId: string
    readonly goalId: string
    readonly judgment: 'rescue' | 'self' | null
    readonly behavior: 'action' | 'recovery' | 'escape'
    readonly route?: 'short' | 'detour' | 'request'
    readonly pace?: CatalogChoice['pace']
    readonly execution?: NonNullable<CatalogChoice['execution']>
    readonly relationship?: NonNullable<CatalogChoice['relationship']>
    readonly infection?: readonly InfectionContact[]
    readonly ending?: CatalogChoice['ending']
    readonly trustOutcomes?: Readonly<Partial<Record<'success' | 'failure', number>>>
    /** outcome-2 comparison evidence before the recommendation's loss protection. */
    readonly baseTrustOutcomes?: Readonly<Partial<Record<'success' | 'failure', number>>>
    readonly action: CoreAction
    readonly preview: CoreActionPreview
  }[]
  /** Includes actual optional treatment; ordinary options above remain untreated. */
  readonly selectedAction: CoreAction
}
export interface CatalogDecisionMemory {
  readonly version: 'context-1'
  readonly entries: readonly {
    readonly eventId: string
    readonly actionId: string
    readonly treat: boolean
    readonly context: CatalogDecisionContext
  }[]
}
/** Current read-only evidence, before any action (or optional treatment) is selected. */
export type CatalogDecisionSituation = Omit<CatalogDecisionContext, 'selectedAction'>
/** One previous character only. Historical survival evidence never initializes the new actor. */
export interface CatalogLegacy {
  readonly decisionMemory?: CatalogDecisionMemory
  readonly legacyId: string
  readonly sourceRunId: string
  readonly name: string
  readonly traits: Traits
  readonly rescueDecision: CoreState['flags']['rescueDecision']
  readonly judgmentCounts: { readonly rescue: number; readonly self: number }
  readonly representativeActions: Readonly<Record<'E02' | 'E07' | 'E10', string | null>>
  readonly ending: 'data-and-escape' | 'escape' | 'escape-failed' | 'infection-death' | 'cure-discovery' | 'tunnel-escape' | 'outskirts-escape'
  readonly rulesVersion: '1.2-stress-1'
  readonly contentRevision: string
}
export interface CatalogRun {
  readonly companionVitals?: CompanionVitals
  readonly opportunities?: Readonly<Record<string, string>>
  readonly infectionDeaths?: readonly InfectionDeath[]
  readonly companionJourney?: {
    readonly separation: CatalogSeparation | null
    readonly reunions: readonly { readonly separation: CatalogSeparation; readonly visitIndex: number; readonly locationId: string }[]
  }
  readonly runId: string
  readonly initialSeed: number
  readonly rngState: number
  readonly route: readonly string[]
  readonly visitIndex: number
  readonly visits: readonly CatalogVisit[]
  readonly usedScripts: readonly string[]
  readonly core: CoreState
  readonly companion: CompanionContext | null
  readonly facts: Readonly<Record<string, boolean>>
  readonly phase: 'choice' | 'result' | 'ending' | 'segment-complete'
  readonly companionOrigin?: CompanionContext
  readonly previousLegacy?: CatalogLegacy
  readonly revision: number
  readonly history: readonly CatalogHistory[]
  readonly result: CatalogHistory | null
  readonly judgmentCounts: { readonly rescue: number; readonly self: number }
}
export interface InfectionContact {
  readonly source: 'infected-person' | 'protagonist' | 'companion' | 'actor'
  readonly target: 'protagonist' | 'companion' | 'actor' | 'other'
  readonly contact: 'bite' | 'blood'
}
export interface InfectionDeath {
  readonly subject: 'protagonist' | 'companion'
  readonly source: 'infected-person' | 'protagonist' | 'companion'
  readonly contact: 'bite' | 'blood'
  readonly visitIndex: number
  readonly eventId: string
  readonly actionId: string
}
/** Rule event IDs retain their existing mechanical meaning; narrative IDs are open. */
export type RuleEventId = EventId

/** Authored conditions and location tags, never engine event-number branches. */
export type CatalogAutonomyPolicy = {
  readonly conditions: readonly Condition[]
  readonly reunion: {
    readonly locationTags: readonly string[]
    readonly minVisits: number
    readonly conditions: readonly Condition[]
  }
} & ({ readonly playerJudgment: 'rescue' | 'self'; readonly companionJudgment: 'rescue' | 'self'; readonly conflicts?: never }
  | { readonly conflicts: readonly { readonly playerGoalId: string; readonly companionGoalId: string; readonly reason: string }[];
      readonly playerJudgment?: never; readonly companionJudgment?: never })
export type RelationshipImpact =
  | { readonly kind: 'value'; readonly axis: keyof Traits; readonly pole: 'left' | 'right'; readonly magnitude: number; readonly reason: string }
  | { readonly kind: 'support'; readonly magnitude: number; readonly reason: string }
export interface CatalogSeparation {
  readonly reason?: string
  readonly eventId: string
  readonly locationId: string
  readonly visitIndex: number
  readonly playerActionId: string
  readonly companionActionId: string
  readonly reunion: CatalogAutonomyPolicy['reunion']
}
