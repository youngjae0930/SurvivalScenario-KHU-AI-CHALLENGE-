import { useEffect, useRef, useState } from 'react'
import type { GameClient } from '../../contracts'
import { advanceTiming, emptyTiming, formatTime, observeTiming, timingFrame } from './timing'
import './playtest.css'

/** Opt-in local QA only. Observes the public client; never dispatches or changes game saves. */
export function PlaytestPanel({ client }: { client: GameClient }) {
  const data = useRef(emptyTiming())
  const [view, setView] = useState(emptyTiming)
  const [background, setBackground] = useState(document.hidden)
  const controls = useRef({ start: () => {}, pause: () => {}, download: () => {} })
  useEffect(() => {
    let snapshot = client.getSnapshot(), cursor = performance.now(), visible = !document.hidden
    function flush(next = snapshot) {
      const now = performance.now()
      data.current = advanceTiming(data.current, timingFrame(snapshot.view), now - cursor, visible && snapshot.commit.kind === 'ready')
      cursor = now; snapshot = next
      data.current = observeTiming(data.current, timingFrame(snapshot.view))
      setView(data.current)
    }
    controls.current = {
      start() {
        cursor = performance.now()
        data.current = observeTiming({ ...emptyTiming(), started: true }, timingFrame(snapshot.view))
        setView(data.current)
      },
      pause() { flush(); data.current = { ...data.current, paused: !data.current.paused }; setView(data.current) },
      download() {
        flush()
        const blob = new Blob([JSON.stringify({ formatVersion: 1, measurement: 'local-foreground-playtest', rounds: data.current.rounds }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob), link = document.createElement('a')
        link.href = url; link.download = 'sealed-city-playtest.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      },
    }
    const unsubscribe = client.subscribe(() => flush(client.getSnapshot()))
    const interval = window.setInterval(() => flush(), 1000)
    const visibility = () => { flush(); visible = !document.hidden; setBackground(!visible) }
    document.addEventListener('visibilitychange', visibility)
    return () => { unsubscribe(); clearInterval(interval); document.removeEventListener('visibilitychange', visibility) }
  }, [client])
  const complete = view.rounds.length === 2 && view.rounds.every(round => round.finished && !round.partial)
  const allFinished = view.rounds.length === 2 && view.rounds.every(round => round.finished)
  const total = view.rounds.reduce((sum, round) => sum + round.elapsedMs, 0)
  return <aside className="playtest-panel" aria-label="플레이 시간 점검">
    <h2>플레이 시간 점검</h2>
    <p>두 회차 목표 약15분 · 이 탭에서만 기록합니다. 새로고침 전 기록을 내려받으세요.</p>
    <p>다른 탭·저장 대기·일시정지·긴 실행 공백은 제외합니다. 자리를 비울 때는 일시정지를 눌러 주세요.</p>
    <div className="playtest-controls">
      {!view.started ? <button onClick={() => controls.current.start()}>시간 측정 시작</button>
        : <button disabled={allFinished} onClick={() => controls.current.pause()}>{view.paused ? '시간 측정 재개' : '시간 측정 일시정지'}</button>}
      <button disabled={!view.started} onClick={() => controls.current.download()}>시간 기록 내려받기</button>
    </div>
    {view.started && <>
      <p>{complete ? '두 회차 측정 완료' : allFinished ? '중간 시작이 포함된 부분 기록' : view.paused ? '일시정지 중' : background ? '다른 탭 사용 중 · 측정 제외' : '측정 중'} · 합계 <strong>{formatTime(total)}</strong></p>
      <ol>{view.rounds.map((round, index) => <li key={index}>
        {index + 1}번째 기록 · {formatTime(round.elapsedMs)} / 제외 {formatTime(round.excludedMs)}{round.partial ? ' · 중간 시작/불완전 기록' : ''}{round.finished ? ' · 종료' : ''}
        <details><summary>사건별 시간</summary><p>설문 {formatTime(round.questionnaireMs)}</p>
          <table><thead><tr><th>사건</th><th>선택·고민</th><th>결과 읽기</th></tr></thead>
            <tbody>{round.events.map((event, i) => <tr key={i}><td>{event.eventId}</td><td>{formatTime(event.choiceMs)}</td><td>{formatTime(event.resultMs)}</td></tr>)}</tbody></table>
        </details>
      </li>)}</ol>
    </>}
  </aside>
}
