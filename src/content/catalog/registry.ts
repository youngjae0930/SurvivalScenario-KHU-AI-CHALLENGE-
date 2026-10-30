import type { CatalogPack } from '../../domain/catalog'
import { compileCatalog } from '../../engine/catalog/compile'

// New JSON files are discovered at build time; no ID list or import edits needed.
const manifests = import.meta.glob('./packs/*/manifest.json', { eager: true, import: 'default' })
const locations = import.meta.glob('./packs/*/locations/**/*.json', { eager: true, import: 'default' })
const events = import.meta.glob('./packs/*/events/**/*.json', { eager: true, import: 'default' })
const scripts = import.meta.glob('./packs/*/scripts/**/*.json', { eager: true, import: 'default' })

export function readCatalogPacks(): CatalogPack[] {
  const records = (files: Record<string, unknown>, root: string) => Object.entries(files).filter(([path]) => path.startsWith(root))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([, value]) => Array.isArray(value) ? value : [value])
  const packs = Object.entries(manifests).map(([path, manifest]) => {
    const root = path.slice(0, -'manifest.json'.length)
    try { return compileCatalog({ manifest, locations: records(locations, root), events: records(events, root), scripts: records(scripts, root) }) }
    catch (error) { throw new Error(`${root}\n${error instanceof Error ? error.message : '콘텐츠 형식 오류'}`) }
  })
  if (new Set(packs.map(pack => pack.manifest.id)).size !== packs.length) throw new Error('중복 콘텐츠 팩 ID가 있습니다.')
  return packs
}
export function readDefaultCatalog(): CatalogPack {
  const pack = readCatalogPacks().find(pack => pack.manifest.id === 'stage19')
  if (!pack) throw new Error('stage19 콘텐츠 팩이 없습니다.')
  return pack
}
