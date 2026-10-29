import type { ChoiceContext, ContractResult, TextKey } from './common'
import type { ActionPreviewViewModel, AppSnapshot, QuestionnaireAnswer } from './views'

export interface PreviewActionRequest {
  readonly executionActor?: 'protagonist' | 'companion'
  readonly context: ChoiceContext
  readonly actionId: string
  readonly treatment: 'none' | 'medkit'
}

export type GameCommand =
  | { readonly type: 'restart'; readonly confirmation: 'discard-saved-progress' }
  | { readonly type: 'start-run'; readonly name: string; readonly answers: readonly QuestionnaireAnswer[] }
  | { readonly type: 'prepare-next-run'; readonly sourceRunId: string; readonly sourceResultId: string }
  | { readonly type: 'cancel-next-run' }
  | { readonly type: 'start-next-run'; readonly sourceRunId: string; readonly sourceResultId: string; readonly name: string; readonly answers: readonly QuestionnaireAnswer[] }
  | { readonly type: 'resume' }
  | { readonly type: 'continue-segment'; readonly context: ChoiceContext }
  | { readonly type: 'execute-action'; readonly context: ChoiceContext; readonly previewToken: string }
  | { readonly type: 'acknowledge-result'; readonly context: ChoiceContext; readonly resultId: string }
  | { readonly type: 'retry-save'; readonly operationId: string }
  | { readonly type: 'set-collapse-read-text'; readonly enabled: boolean }
  | { readonly type: 'mark-text-read'; readonly key: TextKey }

/** App layer injected into UI. No engine state exposed. */
export interface GameClient {
  /** Immutable and referentially stable until the next published update. */
  getSnapshot(): AppSnapshot
  /** Notifies after replacing the cached snapshot. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** No random draw, resource use, history write or persistent game mutation. */
  previewAction(request: PreviewActionRequest): Promise<ContractResult<ActionPreviewViewModel>>
  /** Success follows the declared persistence mode: memory commit for session, durable write for durable. */
  dispatch(command: GameCommand): Promise<ContractResult<null>>
}

export interface GameRootProps {
  readonly client: GameClient
}

export interface ChoiceScreenProps {
  readonly view: Extract<AppSnapshot['view'], { readonly kind: 'choice' }>
  readonly disabled: boolean
  readonly onPreview: (request: PreviewActionRequest) => Promise<ContractResult<ActionPreviewViewModel>>
  readonly onExecute: (preview: ActionPreviewViewModel) => Promise<ContractResult<null>>
}
