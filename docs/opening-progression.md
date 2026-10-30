# 초반 사건 진행: 단독 E01~E04

> 2026-10-29 최신 기준: E01~E06·병원 극단·조기 치명 부상/Legacy 저장까지 연결했다. UI 계약0.4.0, 규칙1.2-stress-1, 현재콘텐츠hospital-core-stress-2. 기존opening-core-stress-1 저장도 지원한다. 스트레스는100−mental(초기30)이다. 최신은 `hospital-progression.md`·`persistence.md`·`ui-integration.md`를 따른다. 아래 E01~E04 범위·미연결/미저장 언급은 당시 상태다.

기획안 v1.2 문단30~33·70·80·93·144~146, 기술 설계 v0.2의 사건/처리 순서를 바탕으로 첫 회차 단독 구간을 연결했다. 순수 계산 모듈이며 실제 세션 앱/화면에서 사용한다. 공개 계약0.2.0과 앱 연결은 ui-integration.md를 따른다.

## 게임에서 이어지는 내용

| 사건 | 행동 ID | 반영 내용 |
|---|---|---|
| E01 대피소 출발 | E01.safe / E01.shortcut | 안전 확인은 안정+8. 지름길은 모험 방향-8, 스태미나10 부담, 성공 무기, 실패 스트레스+10·부상+1 |
| E02 편의점 | E02.help / E02.supplies | 돕기는 물자1, 없으면 스태미나10 부담. 감정+8·도움 연결·rescue 기록. 물자 우선은 물자+1·이성 방향-8·self 기록 |
| E03 골목 | E03.observe / E03.cross | 관찰은 스태미나5·분석 방향-8. 즉시 통과는 스태미나10·직관+8, 성공 물자1, 실패 스트레스+10·부상+1 |
| E04 회복 | E04.maintain / E04.rest | 기존 정비 규칙 또는 단독 추가 휴식. 정비에서만 부상·도구가 있을 때 treat=true로 치료를 함께 확정 |

위험 판정은 기존 일반 템플릿(base70, 선택 전 상태, 지정 축 가중치1, physical=true)을 사용한다. E01/E03에는 무기 보너스를 부여하지 않는다. 이 구간에는 극단으로 교체되는 행동이 없으며 성향이22/78에 도달해도 두 행동을 유지한다. E02 판단 횟수는 선택 의도대로 한 번만 집계한다. 동료 신뢰/태그 처리는 이 단독 구간에 포함하지 않는다.

각 행동은 결과 단계에서 멈춘다. 결과 확인은 자원·난수·성향·판단을 다시 적용하지 않고 다음 사건으로 이동한다. E04 결과 확인 후 `phase='segment-complete'`, `nextEventId='E05'`로 멈춘다. E05를 건너뛰거나 탈출 결말·Legacy를 생성하지 않는다.

## 앱 연결 예시

```ts
import {
  createOpeningRun, getOpeningContext, listOpeningActions,
  previewOpeningAction, executeOpeningAction, acknowledgeOpeningResult,
} from '../engine'

const created = createOpeningRun({ runId, name, answers: mappedAnswers, seed })
if (!created.ok) return created
const run = created.value
const choices = listOpeningActions(run)
const context = getOpeningContext(run)
const selection = { actionId: 'E01.shortcut', treat: false }
const preview = previewOpeningAction(run, context, selection)
// 확인 취소: 아무 명령도 실행하지 않는다.
const pending = executeOpeningAction(run, context, selection)
if (!pending.ok) return pending
// 이후 앱이 저장 성공 뒤 pending.value를 현재 상태로 확정해야 한다.
const resultRun = pending.value
if (resultRun.phase === 'result' && resultRun.result) {
  const next = acknowledgeOpeningResult(
    resultRun, getOpeningContext(resultRun), resultRun.result.resultId,
  )
  // 결과 확인에 따른 다음 상태도 앱에서 저장/확정한다.
}
```

`answers`는 기존 초기화 함수와 동일하게 승인된 설문 콘텐츠에서 매핑한 6개 응답이다. 문구·답ID 매핑은 아직 작성하지 않았다. 회차 ID와 시드는 호출자가 부여한다. 초기 seed0의 치환 규칙은 기존 엔진을 따른다.

`listOpeningActions()`는 기본 두 선택의 비용·확률·가능 여부를 제공한다. 치료 확인은 별도 행동을 추가하지 않고 E04.maintain의 `treat=true` 미리보기로 요청한다. 임의 action 데이터는 받지 않고 등록된 ID에서 엔진이 정의를 찾는다. 실행 때 같은 정의·요구를 다시 확인한다.

`history`에는 사건/행동/치료 의도, 결과 ID, 실제 수치 변화와 판정·소비 후 난수 위치가 남는다. 결과 ID는 회차와 사건에서 결정한다. `revision`은 실행/결과 확인마다1 증가하며 회차·사건과 함께 오래된 입력을 거부한다. 입력은 변경하지 않는다. 반환된 객체는 readonly 타입이지만 런타임 동결하지 않으므로 호출자도 수정하지 않는다.

## 콘텐츠·검증 경계

JSON은 `src/content/rules/opening.json`에 있으며 rulesVersion=1.2, contentRevision=opening-core-1이다. `resolveJsonModule` 설정을 추가해 타입 검사/번들러가 JSON을 함께 읽는다. 의존성 추가는 없다. 문구·대사·스타일·Opus 소유 폴더는 변경하지 않았다.

콘텐츠 파서는 사건 순서·연결, 고정 행동 ID·종류, E02 판단, 자원 분기, 필수 판정·비용·효과 형식과 사건 참조를 검사한다. E02 물자 분기는 always/supply-present/supply-empty의 닫힌 종류만 사용한다. 임의 조건식이나 스크립트는 실행하지 않는다. 선택 미리보기/실행은 기존 효과 검증도 거친다. 회복 행동 생성은 기존 회복 모듈을 공유해 비용/치료 규칙을 복제하지 않았다.

`OpeningRun`은 소유한 메모리 상태의 부분 모델이다. 저장 디코더·최종 RunState·Legacy 형식이 아니며 D07을 결정하지 않는다. 결과와 마지막 history는 같은 기록 객체를 참조한다. 상태 검사는 진행 단계·기록 수·현재 결과·counts 등의 기본 일관성을 확인하며, 외부에서 변조한 저장 전체를 인증/복원하는 기능은 아니다.

순수 함수에 **과거 선택 스냅샷을 다시 넘기면 같은 후보 상태를 다시 계산할 수 있다.** 최신 상태 보관·동기 입력 잠금·previewToken 발급·원자 저장·재시도는 앱 GameClient의 남은 책임이다. `pending.value`는 영속 확정이나 저장 성공을 뜻하지 않는다. 치명 결과를 처리하는 일반 경계가 있으나 정상 초기 상태의 이 네 사건에서는 최대 부상2라 치명 종료에 이르지 않는다. 전체 게임의 결말·계승 저장 구현으로 보고하지 않는다.

## UI와 다음 연결

사용자 요청으로 Codex가 UI·스토리·앱·코어를 모두 맡는다. UI는 계속 `src/contracts/index.ts`의 GameClient/ViewModel만 사용하고 이 모듈을 직접 import하지 않는다. 기존 fixture client의 명령 실행 불가 동작도 유지한다. 실제 앱 어댑터가 내부 history/상태를 공개 화면으로 변환하고 본문/이유/표시명을 content/texts의 ID와 연결해야 한다. 내부 OpeningContext는 공개 ChoiceContext나 previewToken을 대체하지 않는다.

E01~E04 세션 플레이/화면 연결을 완료했다. 세션 능력·성공 의미와 구간완료 화면은 공개 계약0.2.0에 명시했다. 다음은 roadmap.md의 저장·이어하기이며 관련 D07/D05를 먼저 확인한다. E07 콘텐츠(D04), 동료/약속/파견(D01~D03)도 해당 단계 전에 필요한 결정만 확인한다.

검증은 첫 회차 기본16경로×4시드 재현, 확정 행동·미리보기·결과 확인의 난수 불변, 위험 성패/보상, E02 저자원 대체·판단1회, E04 선택/치료, 성향22/78, 잘못된 콘텐츠·회차/사건/revision·중복 입력 거부를 포함한다. 제품 화면 수동 플레이·저장 복원·동료/2회차 검증은 포함하지 않는다.
