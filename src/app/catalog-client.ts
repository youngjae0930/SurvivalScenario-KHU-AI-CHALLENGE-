import type { CatalogPack, CatalogRun, CompanionContext } from '../domain/catalog'
import type { EngineResult } from '../domain/types'
import { readCatalogPacks, readDefaultCatalog } from '../content/catalog/registry'
import { compileCatalog } from '../engine/catalog/compile'
import { acknowledgeCatalogResult, CatalogRuntimeError, createCatalogRun, executeCatalogAction, previewCatalogAction } from '../engine/catalog/runtime'
import { decodeCatalogSave, encodeCatalogSave } from '../storage/catalog-save'
import { prepareNextCatalogRun } from '../engine/catalog/inheritance'
import { createDriverClient, createGameClient } from './create-game-client'
import type { ClientOptions, RunDriver } from './create-game-client'
import { resolveAnswers } from './questionnaire'
import { catalogChoiceContext, catalogGameView, catalogPresentation, catalogPreviewView } from './view-models/catalog'

function attempt<T>(callback: () => T): EngineResult<T> {
  try { return { ok: true, value: callback() } }
  catch (error) { return { ok: false, error: { code: error instanceof CatalogRuntimeError && error.code === 'action-unavailable' ? 'action-unavailable' : 'invalid-action', message: error instanceof Error ? error.message : '콘텐츠를 처리하지 못했습니다.' } } }
}
export function createCatalogClient(options: ClientOptions & { pack?: CatalogPack; packId?: string; companion?: CompanionContext } = {}) {
  let pinnedPack = options.pack ? compileCatalog(options.pack) : null
  let candidatePack: { runId: string; pack: CatalogPack } | null = null
  const pack = () => {
    if (pinnedPack) return pinnedPack
    pinnedPack = options.packId ? readCatalogPacks().find(item => item.manifest.id === options.packId) ?? null : readDefaultCatalog()
    if (!pinnedPack) throw new Error(`없는 콘텐츠 팩입니다: ${options.packId}`)
    return pinnedPack
  }
  const forRun = (run: CatalogRun | null) => run && candidatePack?.runId === run.runId ? candidatePack.pack : pack()
  const driver: RunDriver<CatalogRun> = {
    ...(options.companion ? { introduction: ['봉쇄된 도시. 동료와 함께 도시 외곽으로 이동합니다.', '여섯 응답으로 주인공 성향을 정합니다. 극단 장면의 동료 선택은 동료의 성향과 판단에 따라 달라집니다.'] } : {}),
    create: input => attempt(() => createCatalogRun(pack(), { ...input, companion: options.companion })),
    decode(raw) { const loaded = decodeCatalogSave(raw, resolveAnswers); pinnedPack = loaded.pack; return loaded },
    encode: (origin, run) => encodeCatalogSave(origin, forRun(run), run),
    context: run => catalogChoiceContext(forRun(run), run), view: run => catalogGameView(forRun(run), run, true),
    next(previous, input) {
      return attempt(() => {
        const nextPack = options.pack ? compileCatalog(options.pack) : readDefaultCatalog()
        const sourcePack = forRun(previous)
        const prepared = prepareNextCatalogRun(sourcePack, previous, nextPack, input)
        pinnedPack = sourcePack
        candidatePack = { runId: prepared.run.runId, pack: nextPack }
        return prepared.run
      })
    },
    preview: (run, selection, token) => attempt(() => catalogPreviewView(forRun(run), run, previewCatalogAction(forRun(run), run, selection.actionId, selection.treat, selection.executionActor), token)),
    execute: (run, selection) => attempt(() => executeCatalogAction(forRun(run), run, selection.actionId, selection.treat, selection.executionActor)),
    acknowledge: (run, resultId) => attempt(() => acknowledgeCatalogResult(forRun(run), run, resultId)),
    continue: () => ({ ok: false, error: { code: 'action-unavailable', message: '아직 다음 콘텐츠가 연결되지 않았습니다.' } }),
    presentation: run => catalogPresentation(forRun(run), run),
  }
  return createDriverClient(driver, options)
}
/** Existing schema4/5 runs stay on their original runtime; new runs use catalog data. */
export function createProductClient(options: ClientOptions = {}) {
  if (options.store) {
    try {
      const raw = options.store.read()
      if (raw !== null) {
        const data: unknown = JSON.parse(raw)
        if (!data || typeof data !== 'object' || !('schemaVersion' in data) || ![6, 7, 8].includes(Number(data.schemaVersion))) return createGameClient(options)
      }
    } catch { return createGameClient(options) }
  }
  return createCatalogClient(options)
}
