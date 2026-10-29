import type { CompanionViewModel, StatusViewModel } from '../../contracts'

const bands = { normal: '일반', 'warning-left': '경고 범위', 'warning-right': '경고 범위', 'extreme-left': '극단 범위', 'extreme-right': '극단 범위' }
export function StatusPanel({ status, companion }: { status: StatusViewModel; companion?: CompanionViewModel }) {
  return <aside className="status-panel" aria-label="현재 상태">
    <div className="panel-heading"><span className="eyebrow">SURVIVOR / 생존자</span><span className="live-dot">{companion?.kind === 'present' ? '동행 중' : companion?.kind === 'absent' ? '단독 이동' : '이동 기록'}</span></div>
    <h2>{status.name}</h2>
    <div className="vitals">
      {[{ label: '스트레스', value: status.stress, stress: true }, { label: '스태미나', value: status.stamina, stress: false }].map(({ label, value, stress }) => <div className={`vital${stress ? ' vital-stress' : ''}`} key={label}>
        <div><span>{label}</span><strong>{value}<small>/100</small></strong></div>
        <meter min={0} max={100} value={value} low={stress ? 60 : undefined} high={stress ? 80 : undefined} optimum={stress ? 0 : 100} aria-label={label} />
        {stress && <small className="stress-help">낮을수록 안정 · 60 초과 판정 −5 · 80 초과 −10</small>}
      </div>)}
    </div>
    <dl className="inventory">
      <div><dt>부상</dt><dd>{status.injury}<small>/3</small></dd></div>
      <div><dt>물자</dt><dd>{status.supply}<small>/3</small></dd></div>
      <div><dt>치료 도구</dt><dd>{status.medkit}<small>/2</small></dd></div>
      <div><dt>무기</dt><dd className="equipment">{status.weapon ? '보유' : '없음'}</dd></div>
    </dl>
    <div className="traits"><h3>선택의 방향</h3><p>성향은 앞으로의 선택에 따라 달라집니다.</p>
      {status.traits.map(trait => <div className="trait" key={trait.axis}>
        <div><span>{trait.leftLabel}</span><strong>{trait.value}</strong><span>{trait.rightLabel}</span></div>
        <meter min={0} max={100} value={trait.value} aria-label={`${trait.leftLabel}–${trait.rightLabel} 성향`} />
        <small className={trait.band === 'normal' ? '' : 'trait-warning'}>{bands[trait.band]}</small>
      </div>)}
    </div>
    {companion?.kind === 'present' ? <p className="panel-footnote">동료 · {companion.name}<br />신뢰 {companion.trust}/100</p> : companion?.kind === 'absent' ? <p className="panel-footnote">지금은 혼자 이동하고 있습니다.</p> : null}
  </aside>
}
