import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ActionPreviewViewModel, ChoiceViewModel, GameClient, GameCommand } from '../../contracts'

export function ChoiceCards({ client, view, disabled, onExecute }: { client: GameClient; view: ChoiceViewModel; disabled: boolean; onExecute: (command: GameCommand) => Promise<boolean> }) {
  const [previews, setPreviews] = useState<Record<string, ActionPreviewViewModel>>({})
  const [treatments, setTreatments] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (disabled) return
    let cancelled = false
    async function load() {
      const values: Record<string, ActionPreviewViewModel> = {}
      for (const action of view.actions) {
        const result = await client.previewAction({ context: view.context, actionId: action.actionId, treatment: treatments[action.actionId] ? 'medkit' : 'none' })
        if (cancelled) return
        if (result.ok) values[action.actionId] = result.value
        else setError(result.error.message)
      }
      if (!cancelled) setPreviews(values)
    }
    // A ready snapshot can be published before dispatch releases its internal lock.
    const timer = window.setTimeout(() => {
      void load().catch(() => { if (!cancelled) setError('선택 정보를 불러오지 못했습니다.') })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [client, view, treatments, disabled])

  async function execute(actionId: string) {
    if (busy || disabled) return
    setBusy(true); setError('')
    try {
      // Refresh the single-use token immediately before executing this choice.
      const result = await client.previewAction({ context: view.context, actionId, treatment: treatments[actionId] ? 'medkit' : 'none' })
      if (!result.ok) { setError(result.error.message); return }
      await onExecute({ type: 'execute-action', context: result.value.context, previewToken: result.value.previewToken })
    } catch { setError('선택을 처리하지 못했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }

  return <div className="action-list">{view.actions.map(action => {
    const preview = previews[action.actionId]
    const risk = preview?.risk.kind === 'probability' ? Math.max(0, Math.min(1, (60 - preview.risk.percent) / 60)) : 0
    const recovery = view.treatmentActionIds?.includes(action.actionId) ?? action.actionId === 'E04.maintain'
    return <div className={`inline-choice${risk > 0 ? ' choice-risk' : ''}`} style={{ '--risk-tint': risk * 0.18, '--risk-border': 0.1 + risk * 0.45 } as CSSProperties} key={action.actionId}>
      <button className="action-card" disabled={disabled || busy || !preview || action.availability.kind !== 'available' || preview.availability.kind !== 'available'} onClick={() => execute(action.actionId)}>
        <span><strong>{action.label}</strong>{(action.recommended || action.requiresCompanion) && <small className="recommendation-badge">{action.requiresCompanion ? '동료 선택' : '동료 추천'}</small>}<small>{action.intention}</small>
        {preview && <small className="choice-cost">비용 · {preview.costs.join(' · ') || '없음'}{preview.risk.kind === 'probability' && <><br />성공 확률 {preview.risk.percent}%</>}</small>}
        {action.availability.kind === 'locked' && <small>{action.availability.reasons.join(' ')}</small>}</span>
        <span className="action-arrow" aria-hidden="true">↗</span>
      </button>
      {preview && <div className="choice-outcomes"><div className="choice-success"><strong>{preview.risk.kind === 'certain' ? '행동 결과' : '성공 시'}</strong>{preview.outcomes.success.map((line, i) => <p key={i}>{line}</p>)}</div>
        {preview.outcomes.failure.length > 0 && <div className="choice-failure"><strong>실패 시</strong>{preview.outcomes.failure.map((line, i) => <p key={i}>{line}</p>)}</div>}
      </div>}
      {recovery && <button type="button" className="inline-treatment" aria-pressed={!!treatments[action.actionId]} disabled={disabled || busy || (preview?.treatmentAvailability ?? view.treatment).kind !== 'available'} onClick={() => { setPreviews({}); setTreatments(current => ({ ...current, [action.actionId]: !current[action.actionId] })) }}>치료 도구 1개로 내 부상 1 치료{treatments[action.actionId] ? ' · 사용 선택됨' : ''}</button>}
    </div>
  })}{error && <p role="alert" className="error-message">{error}</p>}</div>
}
