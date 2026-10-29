import { mkdir, writeFile } from 'node:fs/promises'
import { manifestSchema, locationSchema, eventSchema, scriptSchema, packSchema } from '../src/content/catalog/schema.ts'

const root = new URL('../docs/content-schemas/', import.meta.url)
await mkdir(root, { recursive: true })
for (const [name, schema] of Object.entries({ manifest: manifestSchema, location: locationSchema, event: eventSchema, script: scriptSchema, pack: packSchema })) {
  await writeFile(new URL(`${name}.schema.json`, root), `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: name, ...schema }, null, 2)}\n`)
}
console.log('콘텐츠 JSON Schema 5개를 갱신했습니다.')
