import { expect, it } from 'vitest'
import balanceSnapshot from '../../test/balance-catalog-v1.json'
// Frozen responsibility-1 behavior remains valid for existing saves.
import { makePlaytestCatalogFixture as readDefaultCatalog } from '../../test/catalog-fixtures'
import { resolveAnswers } from '../../app/questionnaire'
import { catalogGameView } from '../../app/view-models/catalog'
import { makeOrigin } from '../../test/opening-paths'
import { encodeCatalogSave, decodeCatalogSave } from '../../storage/catalog-save'
import { recommendationResponsibility } from '../../content/texts/companion-responsibility'
import { compileCatalog } from './compile'
import { catalogRecommendedChoice, createCatalogRun, executeCatalogAction } from './runtime'

const pack = readDefaultCatalog(), old = compileCatalog(balanceSnapshot)
function start(seed = 1, risk = 70, p = pack, present = true) {
  const origin = makeOrigin(seed), answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문')
  const run = createCatalogRun(p, { ...origin, answers: answers.value,
    ...(present ? { companion: { name: '민서', trust: 50, traits: { risk, cognition: 50, affect: 50 } } } : {}) })
  return { origin, run }
}

it('실제 추천을 따른 뒤 신뢰가 감소하면 제안의 대가를 인정하며 계산은 그대로 유지한다', () => {
  const { origin, run } = start(), choice = catalogRecommendedChoice(pack, run)!
  const result = executeCatalogAction(pack, run, choice.id)
  expect(choice.id).toBe('E01.safe')
  expect(result.result?.followedCompanionRecommendation).toBe(true)
  expect(result.result?.trustChange!.after).toBeLessThan(result.result?.trustChange!.before ?? 0)
  expect(catalogGameView(pack, result)).toMatchObject({ kind: 'result', text: expect.arrayContaining([expect.stringContaining('내가 제안해 놓고')]) })
  const previous = start(1, 70, old)
  const previousResult = executeCatalogAction(old, previous.run, choice.id)
  expect(result.result?.resolution).toEqual(previousResult.result?.resolution)
  expect(result.result?.trustChange).toEqual(previousResult.result?.trustChange)
  expect(result.rngState).toBe(previousResult.rngState)
  const raw = encodeCatalogSave(origin, pack, result), restored = decodeCatalogSave(raw, resolveAnswers)
  expect(restored.run).toEqual(result)
  expect(catalogGameView(restored.pack, restored.run)).toEqual(catalogGameView(pack, result))
})

it('다른 행동을 골랐거나 동료가 없으면 제안했다고 말하지 않는다', () => {
  for (const present of [false, true]) {
    const { run } = start(1, 70, pack, present)
    const result = executeCatalogAction(pack, run, 'E01.shortcut')
    expect(result.result).not.toHaveProperty('followedCompanionRecommendation')
    expect(recommendationResponsibility(result.result!)).toEqual([])
  }
})

it('동료가 제안한 위험 행동이 실제 실패하면 미안함을 표시한다', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { run } = start(seed, 30), choice = catalogRecommendedChoice(pack, run)!
    const result = executeCatalogAction(pack, run, choice.id)
    if (result.result?.resolution.check.outcome !== 'failure') continue
    expect(result.result.followedCompanionRecommendation).toBe(true)
    expect(catalogGameView(pack, result)).toMatchObject({ kind: 'result', text: expect.arrayContaining([expect.stringContaining('내가 제안한 방법이었는데')]) })
    return
  }
  throw new Error('추천 위험 행동의 실패 표본 없음')
})

it('이별·감염·치명 결과에 평상시 책임 대사를 덧붙이지 않는다', () => {
  const { run } = start(), result = executeCatalogAction(pack, run, 'E01.safe').result!
  expect(recommendationResponsibility({ ...result, resolution: { ...result.resolution, fatal: true } })).toEqual([])
  expect(recommendationResponsibility({ ...result, infectionDeaths: [{ subject: 'companion', contact: 'bite', source: 'infected-person', visitIndex: result.visitIndex, eventId: result.eventId, actionId: result.actionId }] })).toEqual([])
})

it('직전 팩의 저장 원문과 예전 대사를 보존한다', () => {
  const { origin, run } = start(1, 70, old), result = executeCatalogAction(old, run, 'E01.safe')
  expect(result.result).not.toHaveProperty('followedCompanionRecommendation')
  const raw = encodeCatalogSave(origin, old, result), restored = decodeCatalogSave(raw, resolveAnswers)
  expect(encodeCatalogSave(restored.origin, restored.pack, restored.run)).toBe(raw)
  expect(catalogGameView(old, result)).toMatchObject({ kind: 'result', text: expect.arrayContaining([expect.stringContaining('민서이')]) })
})
