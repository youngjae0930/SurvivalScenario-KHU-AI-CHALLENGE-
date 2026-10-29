export const companionJourneyCopy = {
  departure: (name: string) => `${name}은(는) 자신의 판단을 따르기로 했다. 당신과 동료는 서로 다른 길로 움직인다.`,
  warning: (name: string) => `${name}은(는) 당신과 다른 행동을 택하려 합니다. 이 행동 후 이동을 계속하면 동료와 헤어집니다. 이후 재회 조건을 충족하는 거점에서 다시 만날 수 있습니다.`,
  absent: (name: string) => `${name}과(와) 따로 이동 중입니다. 지금은 동료의 도움이나 추천을 받을 수 없습니다.`,
  reunion: (name: string) => `거점에서 ${name}과(와) 다시 만났다. 이제 함께 움직일 수 있다.`,
}
