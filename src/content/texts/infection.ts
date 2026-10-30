import type { CatalogRun, InfectionDeath } from '../../domain/catalog'

/** Minimal shared copy; outcomes describe actual contact, never hypothetical future failure. */
export function infectionOutcome(run: CatalogRun, deaths: readonly InfectionDeath[]): string[] {
  const name = (subject: 'protagonist' | 'companion') => subject === 'protagonist' ? '당신' : run.companion!.name
  return deaths.flatMap(death => {
    const source = death.source === 'infected-person' ? '감염자' : name(death.source)
    return [death.contact === 'bite' ? `${source}의 이빨이 ${name(death.subject)}의 살을 파고들었다.`
      : `${source}의 감염된 혈액이 ${name(death.subject)}의 상처에 닿았다.`,
    death.subject === 'protagonist' ? '감염이 퍼지자 몸이 말을 듣지 않았다. 이번 여정은 여기서 끝난다.'
      : `${run.companion!.name}의 숨이 끊어졌다. 끝내 다시 함께 걸을 수 없게 되었다.`]
  })
}

export function infectionRisk(run: CatalogRun, deaths: readonly InfectionDeath[]): string[] {
  if (!deaths.length) return []
  const names = deaths.map(death => death.subject === 'protagonist' ? '주인공' : `동료 ${run.companion!.name}`)
  return [`위험 접촉에 실패하면 ${names.join('·')} 감염 즉시 사망. 일반 치료 도구로 막을 수 없습니다.`,
    ...(deaths.some(death => death.source !== 'infected-person') ? ['감염된 사람의 혈액이 다른 사람의 상처에 닿는 전염 위험을 포함합니다.'] : [])]
}
