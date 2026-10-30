import type { CompanionViewModel, StatusViewModel } from '../../contracts'
import type { CSSProperties } from 'react'

function riskColor(risk: number): CSSProperties {
  const amount = Math.max(0, Math.min(1, risk))
  const green = [176, 187, 141]
  const yellow = [224, 193, 107]
  const red = [233, 96, 90]
  const progress = amount <= 0.5 ? 0 : amount < 0.85 ? (amount - 0.5) / 0.35 : (amount - 0.85) / 0.15
  const start = amount < 0.85 ? green : yellow
  const end = amount < 0.85 ? yellow : red
  return { '--meter-color': `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * progress)).join(', ')})` } as CSSProperties
}

const bands = { normal: '', 'warning-left': '경고 범위', 'warning-right': '경고 범위', 'extreme-left': '극단 범위', 'extreme-right': '극단 범위' }
export function StatusPanel({ status, companion }: { status: StatusViewModel; companion?: CompanionViewModel }) {
  return <aside className="status-panel" aria-label="현재 상태">
    <section className="protagonist-status" aria-label="나의 상태">
    <div className="panel-heading"><span className="eyebrow">SURVIVOR / 나</span><span className="live-dot">{companion?.kind === 'present' ? '동행 중' : companion?.kind === 'absent' ? '단독 이동' : '이동 기록'}</span></div>
    <h2>{status.name}</h2>
    {status.infection?.protagonist === 'dead' && <p className="panel-footnote" aria-label="감염 상태">감염 사망</p>}
    <div className="vitals">
      <h3 className="status-section-title">상태</h3>
      {[{ label: '스트레스', value: status.stress, stress: true }, { label: '스태미나', value: status.stamina, stress: false }].map(({ label, value, stress }) => <div className={`vital${stress ? ' vital-stress' : ''}`} key={label}>
        <div><span>{label}</span><strong>{value}<small>/100</small></strong></div>
        <meter min={0} max={100} value={value} style={riskColor(stress ? value / 100 : 1 - value / 100)} aria-label={label} />
      </div>)}
      <div className="vital vital-injury"><div><span>부상</span><strong>{status.injury}<small>/3</small></strong></div><meter min={0} max={3} value={status.injury} style={riskColor(status.injury / 3)} aria-label="부상" /></div>
    </div>
    <section className="inventory-section" aria-label="물자와 장비"><h3 className="status-section-title">물자 · 장비</h3><dl className="inventory">
      <div><dt>물자</dt><dd>{status.supply}<small>/3</small></dd></div>
      <div><dt>치료 도구</dt><dd>{status.medkit}<small>/2</small></dd></div>
      <div><dt>무기</dt><dd className="equipment">{status.weapon ? '보유' : '없음'}</dd></div>
    </dl>
    </section>
    <div className="traits"><h3 className="status-section-title">성향 · 선택의 방향</h3>
      {status.traits.map(trait => <div className="trait" key={trait.axis}>
        <div><span>{trait.leftLabel}</span><span>{trait.rightLabel}</span></div>
        <meter min={0} max={100} value={trait.value} style={riskColor(Math.abs(trait.value - 50) / 50)} aria-label={`${trait.leftLabel}–${trait.rightLabel} 성향`}
          aria-valuetext={`${trait.value < 50 ? `${trait.leftLabel} 쪽` : trait.value > 50 ? `${trait.rightLabel} 쪽` : '중립'}${bands[trait.band] ? ` · ${bands[trait.band]}` : ''}`} />
        {trait.band !== 'normal' && <small className="trait-warning">{bands[trait.band]}</small>}
      </div>)}
    </div>
    </section>
    {(status.companion || companion?.kind === 'present') && <section className="companion-vitals" aria-label="동료 개별 상태">
      <span className="eyebrow">COMPANION / 동료</span>
      <h2>{status.companion?.name ?? (companion?.kind === 'present' ? companion.name : '')}</h2>
      <p>{status.companion?.state === 'dead' ? status.companion.deathCause === 'infection' ? '감염으로 사망' : '치명 부상으로 사망'
        : status.companion?.state === 'separated' ? '따로 이동 중' : '동행 중'}</p>
      {status.companion && <div className="vitals">{[{ label: '동료 부상', value: status.companion.injury, max: 3 }].map(({ label, value, max }) => <div className="vital" key={label}>
        <div><span>{label}</span><strong>{value}<small>/{max}</small></strong></div>
        <meter min={0} max={max} value={value} style={riskColor(value / max)} aria-label={label} />
      </div>)}</div>}
      {companion?.kind === 'present' && <div className="vital"><div><span>동료 신뢰도</span><strong>{companion.trust}<small>/100</small></strong></div><meter min={0} max={100} value={companion.trust} aria-label="동료 신뢰도" /></div>}
    </section>}
    {!status.companion && companion?.kind === 'absent' && <p className="panel-footnote">지금은 혼자 이동하고 있습니다.</p>}
  </aside>
}
