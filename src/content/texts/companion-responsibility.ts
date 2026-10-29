import type { CatalogHistory } from '../../domain/catalog'

/** Reaction only: recorded pre-action advice never changes the trust calculation. */
export function recommendationResponsibility(result: CatalogHistory): string[] {
  if (!result.followedCompanionRecommendation || result.companionDeparture || result.infectionDeaths?.length || result.resolution.fatal || result.escape) return []
  if (result.resolution.check.outcome === 'failure') return ['동료가 곁으로 다가온다. “내가 제안한 방법이었는데…… 미안해. 이렇게 될 줄은 몰랐어. 지금은 네 상태부터 살피자.”']
  if (result.trustChange && result.trustChange.after < result.trustChange.before) return ['동료가 걸음을 늦춘다. “내가 제안해 놓고 네가 감수할 몫을 가볍게 봤네. 해낸 건 다행이지만…… 잠깐, 네 상태부터 살피자.”']
  return []
}
