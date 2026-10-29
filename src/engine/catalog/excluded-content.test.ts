import { expect, it } from 'vitest'
import { readDefaultCatalog } from '../../content/catalog/registry'
import { compileCatalog } from './compile'

it('사용자가 제외한 보호 약속은 새 콘텐츠에 등록하지 않는다', () => {
  const original = readDefaultCatalog()
  expect(() => compileCatalog({ ...original, manifest: { ...original.manifest, relationshipVersion: 'promise-1' } })).toThrow()
  expect(() => compileCatalog({ ...original, events: original.events.map((event, index) => index ? event : {
    ...event, protectionPromise: { text: '보호 약속', conditions: [] },
  }) })).toThrow()
})
