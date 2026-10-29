import type { CoreAction, CoreActionPreview, CoreActionResolution } from './actions'
import type { CoreState } from './types'

export type OpeningEventId = 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06'
export type OpeningContentRevision = 'opening-core-stress-1' | 'hospital-core-stress-2'
export interface OpeningContext {
  readonly runId: string
  readonly eventId: OpeningEventId
  readonly revision: number
}
export interface OpeningSelection {
  readonly executionActor?: 'protagonist' | 'companion'
  readonly actionId: string
  readonly treat: boolean
}
export interface OpeningPreview extends CoreActionPreview {
  readonly goalId: string
  readonly context: OpeningContext
  readonly selection: OpeningSelection
  readonly action: CoreAction
  readonly judgment: 'rescue' | 'self' | null
}
export interface OpeningHistoryEntry {
  readonly resultId: string
  readonly eventId: OpeningEventId
  readonly selection: OpeningSelection
  readonly judgment: 'rescue' | 'self' | null
  readonly resolution: CoreActionResolution
}
/** Internal solo E01~E06 state; storage owns the versioned envelope. */
export interface OpeningRun {
  readonly runId: string
  readonly initialSeed: number
  readonly rngState: number
  readonly rulesVersion: '1.2-stress-1'
  readonly contentRevision: OpeningContentRevision
  readonly core: CoreState
  readonly eventId: OpeningEventId
  readonly phase: 'choice' | 'result' | 'ending' | 'segment-complete'
  readonly revision: number
  readonly history: readonly OpeningHistoryEntry[]
  readonly judgmentCounts: { readonly rescue: number; readonly self: number }
  readonly result: OpeningHistoryEntry | null
  readonly nextEventId: 'E05' | 'E07' | null
}

/** Actual early-ending inheritance only; no invented records for unreached events. */
export interface OpeningLegacy {
  readonly legacyId: string
  readonly sourceRunId: string
  readonly name: string
  readonly traits: CoreState['protagonist']['traits']
  readonly rescueDecision: CoreState['flags']['rescueDecision']
  readonly judgmentCounts: OpeningRun['judgmentCounts']
  readonly representativeActions: { readonly E02: string | null; readonly E07: null; readonly E10: null }
  readonly ending: 'escape-failed'
  readonly rulesVersion: OpeningRun['rulesVersion']
  readonly contentRevision: OpeningContentRevision
}
