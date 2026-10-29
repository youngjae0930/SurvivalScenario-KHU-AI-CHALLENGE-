import { expect, it } from 'vitest'
import { readCatalogPacks } from './registry'

it('추가된 모든 JSON 콘텐츠 팩의 형식·참조·기본 문구·필수 경로를 검증한다', () => {
  const packs = readCatalogPacks()
  expect(packs.length).toBeGreaterThan(0)
  for (const pack of packs) console.info(`${pack.manifest.id}: 장소 ${pack.locations.length}, 사건 ${pack.events.length}, 문구 ${pack.scripts.length} 검증 완료`)
})
