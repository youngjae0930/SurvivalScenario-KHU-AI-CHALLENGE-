import type { GeneralRecommendation } from '../../engine/catalog/recommendation'

const direction = { risk: ['모험', '안정'], cognition: ['분석', '직관'], affect: ['이성', '감정'] } as const
export function generalRecommendationCopy(result: GeneralRecommendation): null | { kind: 'withheld'; notice: string } | { kind: 'ready'; text: string; reason: string } {
  if (result.kind === 'inactive') return null
  if (result.kind === 'withheld') return {
    kind: 'withheld',
    notice: result.reason === 'no-available-choice' ? '동료는 지금 실행할 수 있는 행동을 찾지 못했습니다.'
      : result.reason === 'resource-tradeoff' ? '동료는 물자와 장비 중 무엇을 남길지 판단을 유보합니다. 선택 전 비용과 결과를 확인해 주세요.'
        : '동료는 남은 선택 사이에서 뚜렷한 우열을 정하지 못했습니다. 당신의 판단을 기다립니다.',
  }
  const goal = result.value === 50 ? '이 성향축은 중립(50)이어서 목표를 한쪽으로 치우치지 않습니다.'
    : result.preferredGoal ? `${direction[result.axis][result.value < 50 ? 0 : 1]} 성향에 맞는 목표를 우선합니다.`
      : '선호하는 방향의 실행 가능한 선택이 없어 현재 가능한 대안을 살핍니다.'
  return {
    kind: 'ready',
    text: `내 생각에는 ‘${result.choice.label}’ 쪽이 좋겠어.`,
    reason: result.basis === 'representative' ? `${goal} 현재 조건으로 우열이 남은 선택 중, 직전 인물의 대표 선택과 같은 목표에 무게를 둡니다.`
      : `${goal} 실행 가능한 선택을 치명 부상 위험·예상 부상·잔여 체력, 자원 보존, 이동 속도 순으로 비교했습니다. 예측은 성공을 보장하지 않습니다.`,
  }
}
export function rememberedChoiceCopy(label: string, treat: boolean) {
  return { text: `이 상황이라면 ‘${label}’. 내 판단은 변하지 않아.`,
    reason: `직전 회차의 같은 조건에서 내렸던 판단이 이어집니다.${treat ? ' 치료 도구 사용도 함께 권합니다. 확인창에서 직접 선택해 주세요.' : ''}` }
}
