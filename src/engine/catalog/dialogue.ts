import type { CatalogContext, CatalogPack, CatalogScript } from '../../domain/catalog'
import { matches } from './conditions'

export type DialogueSlot = Exclude<CatalogScript['slot'], 'scene' | 'success' | 'failure'>

/** A display-only lookup: priority, then ID. No weights, RNG, history or state mutation. */
export function findDialogue(pack: CatalogPack, context: CatalogContext, eventId: string, slot: DialogueSlot, choiceId: string | null) {
  if (pack.manifest.dialogueVersion !== 'scripts-1') return null
  return pack.scripts.filter(script => script.eventId === eventId && script.slot === slot && script.choiceId === choiceId
    && matches(script.conditions, context))
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null
}
