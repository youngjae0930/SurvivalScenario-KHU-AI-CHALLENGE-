import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ActionPreviewViewModel, ChoiceViewModel, GameCommand, GameRootProps } from '../contracts'
import { Modal } from './components/Modal'
import { StatusPanel } from './components/StatusPanel'
import { StartScreen } from './screens/StartScreen'
import './styles/game.css'

export function GameRoot({ client }: GameRootProps) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)
  const [preview, setPreview] = useState<ActionPreviewViewModel | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [restartWarning, setRestartWarning] = useState(false)
  const [startKey, setStartKey] = useState(0)
  const lock = useRef(false)
  const main = useRef<HTMLElement>(null)
  const view = snapshot.view
  const contextKey = 'context' in view ? view.context.snapshotId : view.kind
  useEffect(() => { main.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }) }, [contextKey])

  async function send(command: GameCommand): Promise<boolean> {
    if (lock.current) return false
    lock.current = true; setPending(true); setError('')
    try {
      const result = await client.dispatch(command)
      if (!result.ok) { setError(result.error.message); if (['stale-context', 'save-failed', 'save-conflict'].includes(result.error.code)) setPreview(null); return false }
      setPreview(null)
      if (command.type === 'restart' || (command.type === 'retry-save' && client.getSnapshot().view.kind === 'start')) setStartKey(key => key + 1)
      return true
    } catch { setError('진행을 처리하지 못했습니다. 다시 시도해 주세요.'); return false }
    finally { lock.current = false; setPending(false) }
  }
  async function showPreview(choice: ChoiceViewModel, actionId: string, treatment: 'none' | 'medkit' = 'none', executionActor: 'protagonist' | 'companion' = 'protagonist') {
    if (lock.current) return
    lock.current = true; setPending(true); setError('')
    try {
      const result = await client.previewAction({ context: choice.context, actionId, treatment,
        ...(executionActor === 'companion' ? { executionActor } : {}) })
      if (result.ok) setPreview(result.value)
      else setError(result.error.message)
    } catch { setError('선택 정보를 불러오지 못했습니다.') }
    finally { lock.current = false; setPending(false) }
  }
  const disabled = pending || snapshot.commit.kind !== 'ready'
  const stage = 'context' in view ? Number(view.context.eventId.slice(1)) : view.kind === 'segment-complete' ? view.completedEventIds.length : 0
  const journey = snapshot.presentation?.journey ?? ['대피소 출발', '편의점', '골목', '회복', '병원 진입', '병원 이탈'].map((label, index) => ({ id: label, label, state: index + 1 === stage ? 'current' : index + 1 < stage ? 'visited' : 'upcoming' }))
  const currentStage = journey.findIndex(step => step.state === 'current') + 1
  const sceneLabel = snapshot.presentation && currentStage > 0 ? `STAGE ${String(currentStage).padStart(2, '0')}` : 'context' in view ? view.context.eventId : ''
  const completesSegment = view.kind === 'result' && (view.completesSegment ?? view.nextEventId === 'E07')
  return <div className="game-shell">
    <header className="site-header"><div className="brand"><span className="brand-symbol" aria-hidden="true">封</span><div>생존 시나리오:<span>봉쇄 도시</span></div></div><div className="edition">PROTOTYPE <span>{snapshot.presentation?.edition ?? '병원 구간까지 / 01—06'}</span></div></header>
    <div className="session-banner" role="note"><span className="signal" aria-hidden="true" />{snapshot.persistence.message}</div>
    {(view.kind !== 'start' || view.canResume || view.succession) && <div className="restart-controls"><button className="secondary" disabled={disabled} onClick={() => setRestartWarning(true)}>처음부터 시작</button></div>}
    <main ref={main} tabIndex={-1} className="main-content" aria-busy={pending}>
      {snapshot.source === 'ui-fixture' && <p className="notice-text">개발 샘플 화면</p>}
      {snapshot.commit.kind === 'blocked' && <p role="alert" className="error-message">{snapshot.commit.message}</p>}
      {snapshot.commit.kind === 'saving' && <p role="status" className="notice-text">진행 저장 중… 창을 닫지 말아 주세요.</p>}
      {snapshot.commit.kind === 'save-failed' && <section role="alert" className="error-message"><p>{snapshot.commit.message}</p><button className="primary" disabled={pending} onClick={() => snapshot.commit.kind === 'save-failed' && send({ type: 'retry-save', operationId: snapshot.commit.operationId })}>같은 결과로 저장 재시도</button></section>}
      {error && snapshot.commit.kind === 'ready' && <p role="alert" className="error-message">{error}</p>}
      {view.kind === 'start' ? <StartScreen key={startKey} view={view} pending={disabled} error={error} persistenceMessage={snapshot.persistence.message} edition={snapshot.presentation?.edition} onStart={send} /> : <>
        <nav className="journey" aria-label="체험 구간 진행"><ol>{journey.map((step, index) => <li key={step.id} className={step.state === 'upcoming' ? '' : step.state} aria-current={step.state === 'current' ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span>{step.label}</li>)}</ol><span className="journey-note">도시 외곽을 향해</span></nav>
        <div className="play-layout"><section className="scene">
          {view.kind === 'choice' && <>
            <span className="eyebrow">{sceneLabel} / SURVIVAL JOURNEY</span><h1>{view.title}</h1>
            <div className={`scene-art art-${view.context.eventId}`} aria-hidden="true"><div className="city-silhouette" /><div className="scene-mark">{sceneLabel}<small>봉쇄 도시</small></div></div>
            <div className="story">{view.story.map(block => <p key={block.key.textId}>{block.text}</p>)}</div>
            {view.notices.map(line => <p className="consequence" key={line}>{line}</p>)}
            {view.companion.kind === 'present' && view.companion.opinion.kind === 'ready' && <section className="companion-advice" aria-label="동료 의견"><strong>{view.companion.name} · 신뢰 {view.companion.trust}</strong><p>{view.companion.opinion.text}</p><small>{view.companion.opinion.reason}</small></section>}
            <div className="choice-heading"><h2>어떻게 하시겠습니까?</h2><span>선택 전 비용과 결과를 확인할 수 있습니다.</span></div>
            <div className="action-list">{view.actions.map((action, index) => <button key={action.actionId} className="action-card" disabled={disabled || action.availability.kind !== 'available'} onClick={() => showPreview(view, action.actionId)}><span className="action-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{action.label}</strong>{(action.recommended || action.requiresCompanion) && <small className="recommendation-badge">{action.requiresCompanion ? '동료 선택' : '동료 추천'}</small>}<small>{action.intention}</small>{action.availability.kind === 'locked' && <small>{action.availability.reasons.join(' ')}</small>}</span><span className="action-arrow" aria-hidden="true">↗</span></button>)}</div>
            {(view.treatmentActionIds?.length ?? (view.context.eventId === 'E04' ? 1 : 0)) > 0 && <p className="scene-hint">치료는 정비 선택의 확인창에서 함께 결정합니다. {view.treatment.kind === 'locked' ? view.treatment.reasons.join(' ') : '현재 치료 도구를 사용할 수 있습니다.'}</p>}
            {view.recentResult && <details className="recent-result"><summary>직전 선택 · {view.recentResult.label}</summary><ul>{view.recentResult.text.map((line, index) => <li key={index}>{line}</li>)}</ul></details>}
          </>}
          {view.kind === 'result' && <>
            <span className="eyebrow">{sceneLabel} / AFTER THE CHOICE</span><div className={`outcome-badge outcome-${view.outcome}`}>{view.outcome === 'failure' ? '위험 판정 · 실패' : view.outcome === 'success' ? '위험 판정 · 성공' : '확정 행동'}</div>
            <h1>{view.actionLabel}</h1><div className="story result-story">{view.text.map(line => <p key={line}>{line}</p>)}</div>
            <section className="changes" aria-label="이번 선택의 변화"><h2>선택이 남긴 것</h2><dl>{view.changes.map((change, index) => <div key={index}><dt>{change.label}</dt><dd>{change.text}</dd></div>)}</dl>{view.changes.length === 0 && <p>수치 변화 없음</p>}</section>
            {view.trustReasons.map(line => <p className="consequence" key={line}>{line}</p>)}
            {view.consequences.map(line => <p className="consequence" key={line}>{line}</p>)}
            <div className="next-step"><span>{view.nextLabel ?? (completesSegment ? '병원 체험 구간의 마지막 결과입니다.' : `다음 사건 · ${view.nextEventId}`)}</span><button className="primary" disabled={disabled} onClick={() => send({ type: 'acknowledge-result', context: view.context, resultId: view.resultId })}>{completesSegment ? '체험 구간 마치기' : '다음 사건으로'} <span aria-hidden="true">→</span></button></div>
          </>}
          {view.kind === 'segment-complete' && <><span className="eyebrow">PLAY SEGMENT / COMPLETE</span><div className="complete-mark" aria-hidden="true">{String(view.completedEventIds.length).padStart(2, '0')}<span>/{String(journey.length).padStart(2, '0')}</span></div><h1>{view.title}</h1><div className="story">{view.text.map(line => <p key={line}>{line}</p>)}</div><div className="completion-note"><strong>{view.completedEventIds.length}개 사건 진행 완료</strong><p>{snapshot.persistence.message}</p>{view.continuation ? <button className="primary" disabled={disabled} onClick={() => view.continuation && send({ type: 'continue-segment', context: view.continuation.context })}>{view.continuation.label} →</button> : <span>다음 구현 구간 · {view.nextEventId}</span>}</div></>}
          {view.kind === 'ending' && <><span className="eyebrow">JOURNEY / ENDED</span><h1>{view.title}</h1><div className="story">{view.text.map(line => <p key={line}>{line}</p>)}</div><section className="changes"><h2>마지막 선택이 남긴 것</h2><dl>{view.changes.map((change, index) => <div key={index}><dt>{change.label}</dt><dd>{change.text}</dd></div>)}</dl></section><div className="completion-note"><h2>이번 이야기를 마쳤습니다</h2>{view.legacySummary.map(line => <p key={line}>{line}</p>)}{view.newRun.kind === 'locked' && <p>{view.newRun.reasons.join(' ')}</p>}{view.newRun.kind === 'available' && <button className="primary" disabled={disabled} onClick={() => send({ type: 'prepare-next-run', sourceRunId: view.runId, sourceResultId: view.resultId })}>새 주인공과 다음 회차 시작 →</button>}</div></>}
        </section><StatusPanel status={view.status} companion={view.kind === 'choice' ? view.companion : undefined} /></div>
      </>}
    </main>
    <footer className="site-footer"><span>생존 시나리오: 봉쇄 도시</span><span>선택은 성향을 바꾸고, 결과는 다음 장면에 남습니다.</span></footer>
    {restartWarning && <Modal title="처음부터 시작할까요?" onClose={() => { if (!pending) setRestartWarning(false) }}>
      <p className="error-message">현재 진행과 이 저장에 포함된 결말·계승 동료 기록이 모두 삭제됩니다. 삭제한 데이터는 되돌릴 수 없습니다.</p>
      <p>계승 없이 첫 회차의 이름과 설문부터 다시 시작합니다.</p>
      <div className="dialog-actions"><button className="secondary" disabled={pending} onClick={() => setRestartWarning(false)}>취소하고 계속하기</button><button className="primary" disabled={disabled} onClick={async () => {
        await send({ type: 'restart', confirmation: 'discard-saved-progress' })
        setRestartWarning(false)
      }}>데이터 삭제 후 처음부터 시작</button></div>
    </Modal>}
    {preview && view.kind === 'choice' && <Modal title={preview.label} onClose={() => { if (!pending) setPreview(null) }}>
      <p>{preview.intention}</p>
      {preview.execution && <fieldset className="execution-options"><legend>실행 주체</legend>{preview.execution.options.map(option => <label className="treatment-option" key={option.actor}>
        <input type="radio" name="execution-actor" checked={preview.execution!.actor === option.actor} disabled={disabled || option.availability.kind !== 'available'}
          onChange={() => showPreview(view, preview.actionId, preview.treatment, option.actor)} />
        <span>{option.label}{option.availability.kind === 'locked' && <small>{option.availability.reasons.join(' ')}</small>}</span>
      </label>)}</fieldset>}
      {preview.requirements.length > 0 && <p className="notice-text">필요 조건 · {preview.requirements.join(' · ')}</p>}
      <div className="preview-facts"><div><h3>공통 비용</h3><ul>{preview.costs.map(line => <li key={line}>{line}</li>)}</ul></div><div><h3>성향 변화</h3><ul>{preview.traitChanges.map(line => <li key={line}>{line}</li>)}</ul></div></div>
      <div className="risk-box"><strong>{preview.risk.kind === 'certain' ? '확정 행동' : `성공 확률 ${preview.risk.percent}%`}</strong>{preview.risk.kind === 'probability' ? <p>{preview.risk.breakdown.join(' · ')}</p> : <p>{preview.risk.explanation}</p>}</div>
      <div className="preview-facts"><div><h3>{preview.risk.kind === 'certain' ? '행동 효과' : '성공하면'}</h3><ul>{preview.outcomes.success.map(line => <li key={line}>{line}</li>)}</ul></div>{preview.outcomes.failure.length > 0 && <div><h3>실패하면</h3><ul>{preview.outcomes.failure.map(line => <li key={line}>{line}</li>)}</ul></div>}</div>
      {(view.treatmentActionIds?.includes(preview.actionId) ?? preview.actionId === 'E04.maintain') && <label className="treatment-option"><input type="checkbox" checked={preview.treatment === 'medkit'} disabled={disabled || view.treatment.kind !== 'available'} onChange={event => showPreview(view, preview.actionId, event.target.checked ? 'medkit' : 'none')} /><span>치료 도구 1개로 부상 1 치료{view.treatment.kind === 'locked' && <small>{view.treatment.reasons.join(' ')}</small>}</span></label>}
      <ul className="preview-warnings">{preview.warnings.map(line => <li key={line}>{line}</li>)}</ul>
      {preview.availability.kind === 'locked' && <p role="alert">{preview.availability.reasons.join(' ')}</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="dialog-actions"><button className="secondary" disabled={pending} onClick={() => setPreview(null)}>돌아가기</button><button className="primary" disabled={disabled || preview.availability.kind !== 'available'} onClick={() => send({ type: 'execute-action', context: preview.context, previewToken: preview.previewToken })}>{pending ? '처리 중…' : '이 선택을 실행'}</button></div>
    </Modal>}
  </div>
}
