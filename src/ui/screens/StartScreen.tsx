import survivalMap from '../../assets/survival-map.png'
import { useState } from 'react'
import type { GameCommand, StartViewModel } from '../../contracts'
import { Modal } from '../components/Modal'

export function StartScreen({ view, pending, error, persistenceMessage, edition, onStart }: { view: StartViewModel; pending: boolean; error: string; persistenceMessage: string; edition?: string; onStart: (command: GameCommand) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [review, setReview] = useState(false)
  const complete = view.questions.length === 6 && view.questions.every(question => answers[question.questionId]) && name.trim().length > 0
  return <>
    {view.succession && <section className="completion-note" aria-label="이어지는 판단"><h2>새 동료와 다시 출발하기</h2><p>직전 결말 · {view.succession.endingTitle}</p><details><summary>이어질 성향과 선택 기록</summary>{view.succession.summary.map(line => <p key={line}>{line}</p>)}</details><button className="secondary" disabled={pending} onClick={() => onStart({ type: 'cancel-next-run' })}>이전 결말로 돌아가기</button></section>}
    <section className="cover" aria-labelledby="intro-title">
      <div className="cover-copy"><span className="eyebrow">SURVIVAL SCENARIO / {view.succession ? 'NEW DEPARTURE' : 'FIRST DEPARTURE'}</span><h1 id="intro-title">도시는 멈췄다.<br /><em>선택은 남았다.</em></h1>
        {view.introduction.map(line => <p key={line}>{line}</p>)}
        <div className="cover-tags"><span>{edition ?? '01—06 병원 구간까지'}</span><span>선택형 생존 게임</span><span>생존 프로토타입</span></div>
      </div>
      <img className="cover-map-image" src={survivalMap} alt="폐허가 된 도시의 생존 이동 경로 지도" />
    </section>
    {view.canResume && <section className="completion-note"><h2>남겨 둔 여정</h2><p>저장된 회차가 있습니다. 마지막으로 확정한 장면에서 이어합니다.</p><button className="primary" disabled={pending} onClick={() => onStart({ type: 'resume' })}>이어하기 <span aria-hidden="true">→</span></button></section>}
    {!view.canResume && <section className="questionnaire" aria-labelledby="questionnaire-title">
      <div className="section-heading"><div><span className="eyebrow">BEFORE YOU LEAVE</span><h2 id="questionnaire-title">출발하기 전, 당신은</h2></div><p>정답은 없습니다. 지금의 판단을 골라 주세요.</p></div>
      <form onSubmit={event => { event.preventDefault(); if (complete) setReview(true) }}>
        <label className="name-field">생존자 이름<input name="survivor-name" required maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="어떻게 불러야 할까요?" autoComplete="off" /></label>
        <div className="questions">{view.questions.map((question, index) => <fieldset key={question.questionId} disabled={pending}>
          <legend><span className="question-number">0{index + 1}</span>{question.text}</legend>
          {question.answers.map(answer => <label className="answer" key={answer.answerId}><input type="radio" name={question.questionId} value={answer.answerId} required checked={answers[question.questionId] === answer.answerId} onChange={() => setAnswers(current => ({ ...current, [question.questionId]: answer.answerId }))} /><span>{answer.label}</span></label>)}
        </fieldset>)}</div>
        <div className="form-footer"><p>{Object.keys(answers).length} / {view.questions.length} 응답 · 확인 후 출발합니다.</p><button className="primary" disabled={!complete || pending || view.newRun.kind !== 'available'} type="submit">응답 확인 <span aria-hidden="true">↗</span></button></div>
      </form>
    </section>}
    {review && <Modal title="이대로 출발할까요?" onClose={() => { if (!pending) setReview(false) }}>
      <p><strong>{name.trim()}</strong>의 {view.succession ? '새로운' : '첫'} 이동을 시작합니다. 응답은 출발 성향을 정하고 이후 선택으로 바뀝니다.</p>
      {view.succession && <p className="notice-text">이어하기는 새 여정에서 계속됩니다. 직전 결말·성향·대표 선택 기록은 남고, 체력·물자·부상은 새로 시작합니다.</p>}
      <p className="notice-text">{persistenceMessage}</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="dialog-actions"><button className="secondary" disabled={pending} onClick={() => setReview(false)}>응답 수정</button><button className="primary" disabled={pending} onClick={async () => {
        const fields = { name: name.trim(), answers: view.questions.map(question => ({ questionId: question.questionId, answerId: answers[question.questionId] })) }
        await onStart(view.succession ? { type: 'start-next-run', sourceRunId: view.succession.sourceRunId, sourceResultId: view.succession.sourceResultId, ...fields } : { type: 'start-run', ...fields })
        setReview(false)
      }}>{pending ? '출발 준비 중…' : '이 응답으로 출발'}</button></div>
    </Modal>}
  </>
}
