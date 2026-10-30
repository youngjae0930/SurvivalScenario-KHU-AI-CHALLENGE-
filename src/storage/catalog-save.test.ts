import { describe, expect, it } from 'vitest'
import { resolveAnswers } from '../app/questionnaire'
import { makeOpeningCatalogFixture } from '../test/catalog-fixtures'
import { compileCatalog } from '../engine/catalog/compile'
import { acknowledgeCatalogResult, createCatalogRun, executeCatalogAction } from '../engine/catalog/runtime'
import { makeOrigin } from '../test/opening-paths'
import { decodeCatalogSave, encodeCatalogSave } from './catalog-save'

function setup(seed = 1) {
  const origin = makeOrigin(seed)
  const answers = resolveAnswers(origin.answers)
  if (!answers.ok) throw new Error('설문 오류')
  const pack = makeOpeningCatalogFixture()
  return { origin, pack, run: createCatalogRun(pack, { ...origin, answers: answers.value }) }
}
describe('콘텐츠 팩 고정 저장과 재현 검증', () => {
  it('모든 선택/결과/경계를 장소·사건·문구·난수까지 같은 상태로 복원한다', () => {
    const original = setup()
    let run = original.run
    const actions = ['E01.safe', 'E02.help', 'E03.observe', 'E04.rest', 'E05.explore', 'E06.salvage']
    for (let revision = 0; revision <= 12; revision++) {
      const raw = encodeCatalogSave(original.origin, original.pack, run)
      const loaded = decodeCatalogSave(raw, resolveAnswers)
      expect(loaded.run).toEqual(run)
      expect(encodeCatalogSave(loaded.origin, loaded.pack, loaded.run)).toBe(raw)
      if (loaded.run.phase === 'result') expect(loaded.run.result).toBe(loaded.run.history.at(-1))
      if (run.phase === 'choice') run = executeCatalogAction(original.pack, run, actions[run.visitIndex])
      else if (run.phase === 'result') run = acknowledgeCatalogResult(original.pack, run, run.result!.resultId)
    }
    expect(run.phase).toBe('segment-complete')
  })
  it('작성 파일의 내용과 revision을 바꿔도 이전 회차는 저장된 팩으로 재개한다', () => {
    const { origin, pack, run } = setup()
    const raw = encodeCatalogSave(origin, pack, run)
    const changed = compileCatalog({ ...pack, manifest: { ...pack.manifest, revision: 'changed-2' }, scripts: pack.scripts.map(script => ({ ...script, text: ['바꾼 문구'] })) }, { allowLegacyChoices: true })
    expect(changed.manifest.revision).toBe('changed-2')
    const loaded = decodeCatalogSave(raw, resolveAnswers)
    expect(loaded.pack).toEqual(pack)
    expect(loaded.pack).not.toEqual(changed)
    expect(loaded.run).toEqual(run)
  })
  it.each(['E05', 'E06'] as const)('%s 조기 결말과 실제 Legacy가 함께 복원되며 가짜 문구·경로·기록을 거부한다', eventId => {
    const { origin, pack, run: start } = setup(1495045954)
    let run = start
    for (const action of ['E01.shortcut', 'E02.supplies', 'E03.cross', 'E04.rest', ...(eventId === 'E06' ? ['E05.bypass'] : [])]) {
      run = executeCatalogAction(pack, run, action)
      run = acknowledgeCatalogResult(pack, run, run.result!.resultId)
    }
    run = executeCatalogAction(pack, run, eventId === 'E05' ? 'E05.explore' : 'E06.salvage')
    const raw = encodeCatalogSave(origin, pack, run)
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 6, kind: 'catalog-solo', checkpoint: { phase: 'ending' }, legacy: { representativeActions: { E02: 'E02.supplies', E07: null, E10: null } } })
    expect(decodeCatalogSave(raw, resolveAnswers).run).toEqual(run)
    for (const mutate of [
      (data: any) => data.legacy = null,
      (data: any) => data.checkpoint.route.reverse(),
      (data: any) => data.checkpoint.visits[0].sceneScriptId = 'E02.scene',
      (data: any) => data.checkpoint.usedScripts = [],
      (data: any) => data.checkpoint.rngState = 1,
      (data: any) => data.pack.locations[0].stage = 'typo',
      (data: any) => data.unexpected = true,
    ]) { const changed = JSON.parse(raw); mutate(changed); expect(() => decodeCatalogSave(JSON.stringify(changed), resolveAnswers)).toThrow() }
  })
})
