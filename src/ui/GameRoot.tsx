import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { GameCommand, GameRootProps } from '../contracts'
import { Modal } from './components/Modal'
import { StatusPanel } from './components/StatusPanel'
import { FixedStageHistory } from './components/FixedStageHistory'
import { BackgroundMusic } from './components/BackgroundMusic'
import { ChoiceCards } from './components/ChoiceCards'
import { TypewriterStory } from './components/TypewriterStory'
import villaImage from '../assets/villa.png'
import parkingImage from '../assets/parking.png'
import alleyImage from '../assets/alley.png'
import roadImage from '../assets/road.png'
import storeImage from '../assets/store.png'
import busStopImage from '../assets/bus-stop.png'
import laundromatImage from '../assets/laundromat.png'
import bridgeImage from '../assets/bridge.png'
import gasStationImage from '../assets/gas-station.png'
import shelterImage from '../assets/shelter.png'
import hospitalImage from '../assets/hospital.png'
import departmentImage from '../assets/department.png'
import schoolImage from '../assets/school.png'
import riversideImage from '../assets/riverside.png'
import checkpointImage from '../assets/checkpoint.png'
import subwayImage from '../assets/subway.png'
import { StartScreen } from './screens/StartScreen'
import './styles/game.css'

export function GameRoot({ client }: GameRootProps) {
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [restartWarning, setRestartWarning] = useState(false)
  const [startKey, setStartKey] = useState(0)
  const [soundVolume, setSoundVolume] = useState(1)
  const lock = useRef(false)
  const main = useRef<HTMLElement>(null)
  const view = snapshot.view
  const visibleChanges = view.kind === 'result' || view.kind === 'ending' ? view.changes.filter(change => !change.traitAxis) : []
  const contextKey = 'context' in view ? view.context.snapshotId : view.kind
  useEffect(() => { main.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }) }, [contextKey])

  async function send(command: GameCommand): Promise<boolean> {
    if (lock.current) return false
    lock.current = true; setPending(true); setError('')
    try {
      const result = await client.dispatch(command)
      if (!result.ok) { setError(result.error.message); return false }

      if (command.type === 'restart' || (command.type === 'retry-save' && client.getSnapshot().view.kind === 'start')) setStartKey(key => key + 1)
      return true
    } catch { setError('진행을 처리하지 못했습니다. 다시 시도해 주세요.'); return false }
    finally { lock.current = false; setPending(false) }
  }
  const disabled = pending || snapshot.commit.kind !== 'ready'
  const stage = 'context' in view ? Number(view.context.eventId.slice(1)) : view.kind === 'segment-complete' ? view.completedEventIds.length : 0
  const journey = snapshot.presentation?.journey ?? ['대피소 출발', '편의점', '골목', '회복', '병원 진입', '병원 이탈'].map((label, index) => ({ id: label, label, state: index + 1 === stage ? 'current' : index + 1 < stage ? 'visited' : 'upcoming' }))
  const currentStage = journey.findIndex(step => step.state === 'current') + 1
  const villaScene = ['villa', 'villa-stairs'].includes(journey[currentStage - 1]?.id ?? '')
  const parkingScene = ['apartment-parking', 'department-parking'].includes(journey[currentStage - 1]?.id ?? '')
  const alleyScene = journey[currentStage - 1]?.id === 'residential-alley'
  const roadScene = ['main-road', 'convoy-road', 'outskirts-crossroads', 'evacuation-convoy'].includes(journey[currentStage - 1]?.id ?? '')
  const storeScene = journey[currentStage - 1]?.id === 'store'
  const busStopScene = journey[currentStage - 1]?.id === 'bus-stop'
  const laundromatScene = journey[currentStage - 1]?.id === 'laundromat'
  const bridgeScene = journey[currentStage - 1]?.id === 'railway-bridge'
  const gasStationScene = journey[currentStage - 1]?.id === 'gas-station'
  const shelterScene = journey[currentStage - 1]?.id === 'shelter'
  const hospitalScene = ['hospital-desk', 'er-waiting', 'hospital-security', 'pharmacy', 'surgery-prep', 'operating-room', 'icu', 'medical-records', 'hospital-rooftop-comms', 'ward-stairs', 'inpatient-ward'].includes(journey[currentStage - 1]?.id ?? '')
  const departmentScene = ['department-hall', 'clothing-store', 'department-security', 'escalator', 'electronics', 'food-hall', 'warehouse', 'staff-lounge', 'department-stairs', 'loading-dock'].includes(journey[currentStage - 1]?.id ?? '')
  const schoolScene = journey[currentStage - 1]?.id === 'school-playground'
  const riversideScene = journey[currentStage - 1]?.id === 'riverside-path'
  const checkpointScene = ['temporary-barrier', 'outskirts-checkpoint'].includes(journey[currentStage - 1]?.id ?? '')
  const subwayScene = ['turnstiles', 'platform', 'station-office', 'train-carriage', 'subway-control', 'train-connection', 'southern-tunnel'].includes(journey[currentStage - 1]?.id ?? '')
  const researchScene = ['research-wing', 'research-archives', 'sample-lab', 'cold-storage', 'research-isolation', 'infected-lab', 'research-helipad'].includes(journey[currentStage - 1]?.id ?? '')
  const locationImage = villaScene ? villaImage : parkingScene ? parkingImage : alleyScene ? alleyImage : roadScene ? roadImage : storeScene ? storeImage : busStopScene ? busStopImage : laundromatScene ? laundromatImage : bridgeScene ? bridgeImage : gasStationScene ? gasStationImage : shelterScene ? shelterImage : hospitalScene ? hospitalImage : departmentScene ? departmentImage : schoolScene ? schoolImage : riversideScene ? riversideImage : checkpointScene ? checkpointImage : subwayScene ? subwayImage : researchScene ? hospitalImage : null
  const sceneLabel = snapshot.presentation && currentStage > 0 ? `STAGE ${String(currentStage).padStart(2, '0')}` : 'context' in view ? view.context.eventId : ''
  const completesSegment = view.kind === 'result' && (view.completesSegment ?? view.nextEventId === 'E07')
  return <div className="game-shell">
    <header className="site-header"><div className="brand"><span className="brand-symbol" aria-hidden="true">封</span><div>생존 시나리오<span>봉쇄 도시</span></div></div><div className="header-actions"><div className="edition">PROTOTYPE <span>{snapshot.presentation?.edition ?? '병원 구간까지 / 01—06'}</span></div><BackgroundMusic volume={soundVolume} onVolumeChange={setSoundVolume} /></div></header>
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
        <div className="play-layout">{'fixedStageHistory' in view && <FixedStageHistory entries={view.fixedStageHistory} />}<section className="scene">
          {view.kind === 'choice' && <>
            <span className="eyebrow">{sceneLabel} / SURVIVAL JOURNEY</span><h1>{view.title}</h1>
            {locationImage ? <img className="location-image" src={locationImage} alt={villaScene ? '어두운 빌라와 바깥 계단' : parkingScene ? '버려진 지하 주차장' : alleyScene ? '비 내린 주택가 골목길' : roadScene ? '황혼의 폐허 도시 도로' : storeScene ? '비 내린 도시의 편의점' : busStopScene ? '비 내리는 도시의 버스 정류장' : laundromatScene ? '비 내리는 골목의 세탁소' : bridgeScene ? '비 내리는 도시의 육교' : gasStationScene ? '비 내리는 도시의 주유소' : shelterScene ? '비 내리는 도시의 대피소 입구' : hospitalScene ? '버려진 병원의 접수대와 응급실 복도' : departmentScene ? '폐허가 된 백화점 내부' : schoolScene ? '황혼의 버려진 학교 운동장' : riversideScene ? '황혼의 폐허가 된 하천변 보행로' : checkpointScene ? '황혼의 폐허 도시 검문소' : subwayScene ? '폐허가 된 지하철역' : '버려진 연구동'} /> : <div className={`scene-art art-${view.context.eventId}`} aria-hidden="true"><div className="city-silhouette" /><div className="scene-mark">{sceneLabel}<small>봉쇄 도시</small></div></div>}
            <TypewriterStory key={contextKey} paragraphs={view.story.map(block => block.text)} muted={soundVolume === 0} volume={soundVolume} />
            {view.notices.filter(line => !line.startsWith('지금은 한 가지 생각이 다른 판단을 밀어내고 있다.')).map(line => /^(동료가|동료는|동료[ ·])|“/.test(line) ? <section className="companion-advice" aria-label="동료 대화" key={line}><strong>{view.companion.kind === 'present' ? view.companion.name : '동료'}{view.companion.kind === 'present' ? ` · 신뢰 ${view.companion.trust}` : ''}</strong><p>{line}</p></section> : <p className="consequence" key={line}>{line}</p>)}
            {view.companion.kind === 'present' && view.companion.opinion.kind === 'ready' && <section className="companion-advice" aria-label="동료 의견"><strong>{view.companion.name} · 신뢰 {view.companion.trust}</strong><p>{view.companion.opinion.text}</p><small>{view.companion.opinion.reason}</small></section>}
            <div className="choice-heading"><h2>어떻게 하시겠습니까?</h2><span>선택 전 비용과 결과를 확인할 수 있습니다.</span></div>
            <ChoiceCards key={contextKey} client={client} view={view} disabled={disabled} onExecute={send} />
          </>}
          {view.kind === 'result' && <>
            <span className="eyebrow">{sceneLabel} / AFTER THE CHOICE</span><div className={`outcome-badge outcome-${view.outcome}`}>{view.outcome === 'failure' ? '위험 판정 · 실패' : view.outcome === 'success' ? '위험 판정 · 성공' : '확정 행동'}</div>
            <h1>{view.actionLabel}</h1><div className="story result-story">{view.text.map(line => <p key={line}>{line}</p>)}</div>
            <section className="changes" aria-label="상태 변화"><h2>상태 변화</h2><dl>{visibleChanges.map((change, index) => <div key={index}><dt>{change.label}</dt><dd>{change.text}</dd></div>)}</dl>{visibleChanges.length === 0 && <p>추가로 표시할 상태 변화가 없습니다.</p>}</section>
            {view.trustReasons.map(line => <p className="consequence" key={line}>{line}</p>)}
            {view.consequences.map(line => <p className="consequence" key={line}>{line}</p>)}
            <div className="next-step"><span>{view.nextLabel ?? (completesSegment ? '병원 체험 구간의 마지막 결과입니다.' : `다음 사건 · ${view.nextEventId}`)}</span><button className="primary" disabled={disabled} onClick={() => send({ type: 'acknowledge-result', context: view.context, resultId: view.resultId })}>{completesSegment ? '체험 구간 마치기' : '다음 사건으로'} <span aria-hidden="true">→</span></button></div>
          </>}
          {view.kind === 'segment-complete' && <><span className="eyebrow">PLAY SEGMENT / COMPLETE</span><div className="complete-mark" aria-hidden="true">{String(view.completedEventIds.length).padStart(2, '0')}<span>/{String(journey.length).padStart(2, '0')}</span></div><h1>{view.title}</h1><div className="story">{view.text.map(line => <p key={line}>{line}</p>)}</div><div className="completion-note"><strong>{view.completedEventIds.length}개 사건 진행 완료</strong><p>{snapshot.persistence.message}</p>{view.continuation ? <button className="primary" disabled={disabled} onClick={() => view.continuation && send({ type: 'continue-segment', context: view.continuation.context })}>{view.continuation.label} →</button> : <span>다음 구현 구간 · {view.nextEventId}</span>}</div></>}
          {view.kind === 'ending' && <section className="ending-card"><span className="eyebrow">THE END / 여정의 끝</span><h1>{view.title}</h1><div className="story">{view.text.map(line => <p key={line}>{line}</p>)}</div><div className="completion-note"><h2>이번 이야기를 마쳤습니다</h2>{view.legacySummary.filter(line => !/^(성향의 발자취|다음 동료에게 이어질 성향)/.test(line)).map(line => <p key={line}>{line}</p>)}{view.newRun.kind === 'locked' && <p>{view.newRun.reasons.join(' ')}</p>}{view.newRun.kind === 'available' && <button className="primary" disabled={disabled} onClick={() => send({ type: 'prepare-next-run', sourceRunId: view.runId, sourceResultId: view.resultId })}>새 주인공과 다음 회차 시작 →</button>}</div></section>}

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

  </div>
}
