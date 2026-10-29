import type { GameViewModel } from '../../contracts'

export interface TimingFrame { kind: 'questionnaire' | 'choice' | 'result' | 'ending' | 'segment'; runId?: string; eventId?: string; partial?: boolean }
export interface RoundTiming {
  runId: string | null; partial: boolean; finished: boolean; elapsedMs: number; excludedMs: number; questionnaireMs: number
  events: { eventId: string; choiceMs: number; resultMs: number }[]
}
export interface TimingState { started: boolean; paused: boolean; rounds: RoundTiming[] }
export const emptyTiming = (): TimingState => ({ started: false, paused: false, rounds: [] })
export function timingFrame(view: GameViewModel): TimingFrame {
  if (view.kind === 'start') return { kind: 'questionnaire', partial: view.canResume }
  if (view.kind === 'ending') return { kind: 'ending', runId: view.runId }
  if (view.kind === 'segment-complete') return { kind: 'segment', partial: true }
  return { kind: view.kind, runId: view.context.runId, eventId: view.context.eventId }
}
function newRound(frame: TimingFrame): RoundTiming {
  return { runId: frame.runId ?? null, partial: frame.kind !== 'questionnaire' || frame.partial === true,
    finished: false, elapsedMs: 0, excludedMs: 0, questionnaireMs: 0, events: [] }
}
export function observeTiming(state: TimingState, frame: TimingFrame): TimingState {
  if (!state.started) return state
  let rounds = state.rounds
  const last = rounds.at(-1)
  if (frame.kind === 'ending' && frame.runId) {
    const existing = rounds.findIndex(round => round.runId === frame.runId && round.finished)
    // Cancelling a successor questionnaire returns to the old ending, not a second completion.
    if (existing >= 0) return { ...state, rounds: rounds.slice(0, existing + 1) }
  }
  if (!last || (last.finished && frame.kind === 'questionnaire')
    || (frame.runId && last.runId && frame.runId !== last.runId)) {
    if (rounds.length >= 2) return state
    rounds = [...rounds, newRound(frame)]
  }
  const current = { ...rounds.at(-1)! }
  if (current.finished) return state
  if (frame.runId && current.runId === null) current.runId = frame.runId
  if (frame.kind === 'ending' || frame.kind === 'segment') {
    current.finished = true
    if (frame.kind === 'segment') current.partial = true
  }
  return { ...state, rounds: [...rounds.slice(0, -1), current] }
}
/** Elapsed time is injected by the UI; no game mutation, clock, RNG or storage access. */
export function advanceTiming(state: TimingState, frame: TimingFrame, elapsedMs: number, foreground: boolean): TimingState {
  if (!state.started || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return state
  const next = observeTiming(state, frame), current = next.rounds.at(-1)
  if (!current || current.finished) return next
  const round = { ...current, events: current.events.map(event => ({ ...event })) }
  // A throttled/suspended browser interval is uncertain; never turn it into measured reading time.
  if (!foreground || state.paused || elapsedMs > 5000) round.excludedMs += elapsedMs
  else {
    round.elapsedMs += elapsedMs
    if (frame.kind === 'questionnaire') round.questionnaireMs += elapsedMs
    else if (frame.eventId) {
      let event = round.events.at(-1)
      if (!event || event.eventId !== frame.eventId) { event = { eventId: frame.eventId, choiceMs: 0, resultMs: 0 }; round.events.push(event) }
      if (frame.kind === 'choice') event.choiceMs += elapsedMs
      if (frame.kind === 'result') event.resultMs += elapsedMs
    }
  }
  return { ...next, rounds: [...next.rounds.slice(0, -1), round] }
}
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
