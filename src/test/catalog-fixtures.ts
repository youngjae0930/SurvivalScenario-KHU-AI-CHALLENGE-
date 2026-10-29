import narrativeSnapshot from './opening-catalog-v21.json'
import type { CatalogChoice, CatalogPack } from '../domain/catalog'
import { compileCatalog } from '../engine/catalog/compile'
import openingSnapshot from './opening-catalog-v1.json'
import fourChoiceSnapshot from './opening-catalog-v2.json'
import researchSnapshot from './opening-catalog-v3.json'
import crossingSnapshot from './opening-catalog-v4.json'
import quarantineSnapshot from './opening-catalog-v5.json'
import contactSnapshot from './opening-catalog-v6.json'
import finalRestSnapshot from './opening-catalog-v7.json'
import escapeSnapshot from './opening-catalog-v8.json'
import interventionSnapshot from './opening-catalog-v9.json'
import companionChoiceSnapshot from './opening-catalog-v10.json'
import companionRecoverySnapshot from './opening-catalog-v11.json'
import reflectionSnapshot from './opening-catalog-v12.json'
import recommendationSnapshot from './opening-catalog-v13.json'
import decisionMemorySnapshot from './opening-catalog-v14.json'
import decisionEchoSnapshot from './opening-catalog-v15.json'
import companionJourneySnapshot from './opening-catalog-v16.json'
import companionCommandSnapshot from './opening-catalog-v17.json'
import companionOutcomeSnapshot from './opening-catalog-v18.json'
import variableChoicesSnapshot from './opening-catalog-v20.json'
import flexibleStagesSnapshot from './opening-catalog-v19.json'

export function makeVariableChoicesCatalogFixture(): CatalogPack { return compileCatalog(variableChoicesSnapshot) }

/** Last fixed-choice release; existing saved runs retain these choices. */
export function makeFlexibleStagesCatalogFixture(): CatalogPack { return compileCatalog(flexibleStagesSnapshot) }

export function makeCompanionOutcomeCatalogFixture(): CatalogPack { return compileCatalog(companionOutcomeSnapshot) }

export function makeCompanionCommandCatalogFixture(): CatalogPack { return compileCatalog(companionCommandSnapshot) }

export function makeCompanionJourneyCatalogFixture(): CatalogPack { return compileCatalog(companionJourneySnapshot) }

export function makeDecisionEchoCatalogFixture(): CatalogPack { return compileCatalog(decisionEchoSnapshot) }

/** Pinned migration fixture: adding author files must not invalidate old-rules parity tests. */
export function makeOpeningCatalogFixture(): CatalogPack { return compileCatalog(openingSnapshot, { allowLegacyChoices: true }) }
/** Historical six-event/four-choice release, pinned for saved-run compatibility tests. */
export function makeFourChoiceCatalogFixture(): CatalogPack { return compileCatalog(fourChoiceSnapshot) }
/** Historical seven-event research release, pinned before adding E08. */
export function makeResearchCatalogFixture(): CatalogPack { return compileCatalog(researchSnapshot) }
/** Historical eight-event crossing release, pinned before adding E09. */
export function makeCrossingCatalogFixture(): CatalogPack { return compileCatalog(crossingSnapshot) }
/** Historical nine-event quarantine release, pinned before adding E10. */
export function makeQuarantineCatalogFixture(): CatalogPack { return compileCatalog(quarantineSnapshot) }
/** Historical ten-event contact release, pinned before adding E11. */
export function makeContactCatalogFixture(): CatalogPack { return compileCatalog(contactSnapshot) }
/** Historical eleven-event final-rest release, pinned before adding escape endings. */
export function makeFinalRestCatalogFixture(): CatalogPack { return compileCatalog(finalRestSnapshot) }
/** Twelve-event solo release before companion interventions. */
export function makeEscapeCatalogFixture(): CatalogPack { return compileCatalog(escapeSnapshot) }
/** Original trust-gated companion release, retained for saved-run compatibility. */
export function makeInterventionCatalogFixture(): CatalogPack { return compileCatalog(interventionSnapshot) }
/** Trust-independent extreme companion choices, before recovery sharing. */
export function makeCompanionChoiceCatalogFixture(): CatalogPack { return compileCatalog(companionChoiceSnapshot) }
/** Recovery sharing before first-extreme guidance and brief ending reflection. */
export function makeCompanionRecoveryCatalogFixture(): CatalogPack { return compileCatalog(companionRecoverySnapshot) }
/** First-extreme/brief-reflection release before general recommendations. */
export function makeReflectionCatalogFixture(): CatalogPack { return compileCatalog(reflectionSnapshot) }
/** General recommendation release before decision-context capture. */
export function makeRecommendationCatalogFixture(): CatalogPack { return compileCatalog(recommendationSnapshot) }
/** Situation evidence release before prior decisions affect recommendations. */
export function makeDecisionMemoryCatalogFixture(): CatalogPack { return compileCatalog(decisionMemorySnapshot) }

/** Structural fixtures only: no approved story or new gameplay balancing. */
export function makeCatalogFixture(): CatalogPack {
  const choice: CatalogChoice = { id: 'continue', goalId: 'move', label: '이동한다', intention: '구조 검증용 이동', target: '다음 장소', judgment: null,
    behavior: { kind: 'action', variants: [{ conditions: [], action: { id: 'continue', eventId: 'E01', requires: {}, costs: { stamina: 0, supply: 0, medkit: 0 }, check: null,
      traitDelta: { risk: 0, cognition: 0, affect: 0 }, successEffects: [], failureEffects: [] } }] }, successFacts: {}, failureFacts: {} }
  const choices = [choice, ...['wait', 'look', 'listen'].map(id => ({ ...choice, id, label: `구조 검증: ${id}`,
    behavior: { kind: 'action' as const, variants: [{ conditions: [], action: { ...(choice.behavior.kind === 'action' ? choice.behavior.variants[0].action : {}), id } }] } }))]
  return compileCatalog({
    manifest: { formatVersion: 1, id: 'structure-demo', revision: 'structure-demo-1', rulesVersion: '1.2-stress-1', title: '구조 검증용', startLocationId: 'villa',
      stages: [{ id: 'early', minVisits: 2, maxVisits: 2 }, { id: 'middle', minVisits: 1, maxVisits: 1 }, { id: 'late', minVisits: 1, maxVisits: 1 }], facts: ['clue'],
      boundary: { nextEventId: 'future', title: '구조 검증 완료', text: ['실제 게임 결말이 아닌 구조 검증 예시입니다.'] } },
    locations: [
      { id: 'villa', name: '빌라', stage: 'early', tags: ['home'], fromTags: [], after: [], required: true, weight: 1 },
      { id: 'store', name: '편의점', stage: 'early', tags: ['road'], fromTags: ['home'], after: [], required: false, weight: 1 },
      { id: 'pharmacy', name: '약국', stage: 'early', tags: ['road'], fromTags: ['home'], after: [], required: false, weight: 1 },
      { id: 'research', name: '연구동', stage: 'middle', tags: ['research'], fromTags: ['road'], after: [], required: true, weight: 1 },
      { id: 'outskirts', name: '외곽', stage: 'late', tags: ['exit'], fromTags: ['research'], after: ['research'], required: true, weight: 1 },
    ],
    events: [{ id: 'walk', title: '구조 검증 사건', locationIds: [], locationTags: ['home', 'road', 'research', 'exit'], conditions: [], weight: 1,
      groups: [{ id: 'basic', priority: 0, conditions: [], notices: [], choices }] }],
    scripts: [
      { id: 'walk.scene', eventId: 'walk', choiceId: null, slot: 'scene', conditions: [], priority: 0, weight: 1, once: false, text: ['{{protagonist.name}} · {{location.name}}. 구조 검증용 문구입니다.'] },
      ...choices.map(item => ({ id: `walk.${item.id}.result`, eventId: 'walk', choiceId: item.id, slot: 'success', conditions: [], priority: 0, weight: 1, once: false, text: ['선택을 기록했습니다.'] })),
    ],
  })
}

export function makeNarrativeCatalogFixture(): CatalogPack { return compileCatalog(narrativeSnapshot) }

import dialogueSnapshot from './opening-catalog-v22.json'
export function makeDialogueCatalogFixture(): CatalogPack { return compileCatalog(dialogueSnapshot) }
