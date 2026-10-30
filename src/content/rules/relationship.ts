/** Initial tuning for outcome-1. Historical saves never use this policy. */
export const relationshipBalance = {
  maxChange: 5,
  staminaUnit: 10, stressUnit: 20, injuryUnit: 3,
  supplyUnit: 1.5, medkitUnit: 2, weaponUnit: 2,
  flagUnit: { access: 1, data: 2, helpEstablished: 1, routeKnown: 1 },
  escaped: 5,
  fatal: -100,
} as const
