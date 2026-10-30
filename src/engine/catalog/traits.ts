import type { CatalogPack } from '../../domain/catalog'
import { originalTraitBounds, relaxedTraitBounds } from '../traits'

export const catalogTraitBounds = (pack: CatalogPack) => pack.manifest.traitRangeVersion === 'relaxed-1' ? relaxedTraitBounds : originalTraitBounds
