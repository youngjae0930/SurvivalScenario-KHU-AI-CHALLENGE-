import type { FixedStageChoiceViewModel } from '../../contracts'

export function FixedStageHistory({ entries }: { entries: readonly FixedStageChoiceViewModel[] | undefined }) {
  if (!entries?.length) return null
  const records = entries.filter(entry => entry.actionLabel && entry.resultText?.length)
  return <section className="choice-history" aria-label="선택의 기록">
    <hr className="history-divider" />
    <div className="history-journal" tabIndex={0} role="region" aria-label="남겨진 선택 기록">
      {records.length ? records.map(entry => <p key={`${entry.stageNumber}:${entry.locationId}`}>{entry.resultText?.join(' ')}</p>)
        : <p className="choice-history-pending">선택이 남긴 이야기가 이곳에 기록됩니다.</p>}
    </div>
  </section>
}
