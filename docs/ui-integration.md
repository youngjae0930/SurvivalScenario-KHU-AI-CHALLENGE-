# UI와 앱 연결 기준

## 최신: 보호 약속 제외·가변 분량 (2026-10-29)

보호 약속은 사용자 요청으로 제외했으며 이전 준비 문서는 과거 기록이다. 신규 팩 catalog-flexible-stages-1과 routeVersion=stages-1은 선택적 장소 enabled·최소/최대 방문 수를 사용하고 필수 장소와 탈출 마지막을 보장한다. 계약0.7.0 유지, 구 저장은 원문 보존. 작성법·검증·배포 점검은 [가변 분량](flexible-stages.md)을 따른다. 현재 제품 콘텐츠는12필수 장소의 기존 경로이며 사람의 두 회차15분 실측은 남아 있다.


## 최신: 결과 기반 신뢰·이별 갈등 일반화 (2026-10-29)

사용자는 신뢰80을 구조 전용이 아닌 이별로 이어지는 갈등의 동행 유지 기준으로 수정했다. 신규 journey-2의 conflicts는 실제 playerGoalId/companionGoalId 조합을 명시하며 단순 의견 차이는 이탈시키지 않는다. 현재 구조 장면을 전환했고 이동/조사 갈등도 같은 엔진으로 검증했다. 행동 전 신뢰80·명령 수락60은 별도다.

신규 trustVersion=outcome-1은 실제 체력·스트레스·부상·자원·정보 손익과 콘텐츠에 명시한 이야기 결과를 동료 성향으로 합산한다. 초기 밸런스는 한 선택당±5·최종0~100, 양보 고정+10을 대체한다. 추천 불일치 자체에는 감점을 붙이지 않으며 이탈 중 평가하지 않는다. 성공/실패별 미리보기·실제 이유·저장 재생·실패 재시도를 연결했다. 새 팩 catalog-companion-outcome-1·동행 runtime catalog-companion-outcome-1·계승 catalog-succession-9, 계약0.7.0·schema6/7/8·단독 runtime3 유지, 이전 팩 fixture v17 고정.

보호 약속은 여전히 미승인이며 선언·위반 효과를 추가하지 않았다. 이번 신뢰 시스템 진행을 막는 질문으로 두지 않는다. 상세 [결과 기반 관계](relationship-outcomes.md). 추정93%, 다음은 D09 가변 분량·두 회차약15분 실측/전체 검증이다. 아래 고정+10·구조 전용 이탈·약속 정책 대기는 과거 단계다.


## 동료 명령 연결 — 2026-10-29

명시한 행동만 확인창에서 직접/동료 실행을 선택한다. 추천 일치 또는 신뢰60 이상 수락, 독자 이탈 방지는 기존80이다. 기존 비용/성공률/피해를 유지하고 공동 위험을 표시하며 본인4개를 유지한다. 계약0.7.0의 선택적 PreviewActionRequest.executionActor와 ActionPreviewViewModel.execution을 사용한다. 주체 변경은 새 토큰을 발급하고 같은 주체 후보로 저장 재시도한다. 신규 팩 catalog-companion-command-1·계승 catalog-succession-8, schema6/7/8 유지, 구 저장 유지. 상세 [동료 명령](companion-commands.md).

## 데이터 기반 이탈·재회 — 2026-10-29

사건 autonomy 조건/판단과 재회 장소 태그/minVisits/조건으로 연결한다. 현재 신뢰80 이상 동행, 미만에서는 구조 추천과 자기 보존 충돌 시 이탈한다. 동료 신원을 보존하며 부재 중 추천·동료 행동을 제외하고 본인4개를 유지한다. 이탈/재회는 행동/이동과 함께 저장하고 실패 시 동일 후보로 재시도한다. 새 팩 catalog-companion-journey-1·동행 catalog-companion-autonomy-1·계승 catalog-succession-7. 계약0.6.0·schema6/7/8 유지, 구 저장 유지. 상세 [동료 이탈·재회](companion-autonomy.md).

## 이전 판단 추천 연결 — 2026-10-29

D08 세부 기준 사용자 승인으로 동일 상황의 과거 행동 추천과 최종 동률에서의 약한 대표 목표 선호를 연결했다. 네 선택·플레이어 실행 결정을 유지하며 불가능한 과거 행동은 열지 않는다. 신규 catalog-decision-echo-1·동행 catalog-companion-echo-1·계승 catalog-succession-6, 계약0.6.0·schema6/7/8 유지. 구 저장은 고정 팩 유지. 상세 [이전 판단 추천](decision-echo.md).

## 선택 당시 상황 보존 — 2026-10-29

신규 catalog-decision-memory-1은 manifest.decisionMemoryVersion=context-1을 명시한다. 실제 선택 전 상태/동료/현재 네 후보·잠금·variant·미리보기·선택적 치료를 엔진이 기록하며 JSON 작성 모델이 과거 기록을 작성하지 않는다. 계약0.6.0 유지, 새 단독 runtime3·동행 catalog-companion-memory-1·계승 catalog-succession-5(schema6/7/8). 구 저장에는 소급 추가하지 않는다. UI는 기존 계약을 계속 사용하며 내부 기록을 직접 계산/조회하지 않는다. 동일 상황 재현/약한 영향은 다음 단계다. 상세 [상황 보존](decision-memory.md).

## 일반 추천 연결 — 2026-10-29

일반 장면의 본인4개 안에서 성향·현재 생존·자원·명시 속도에 따른 추천/보류를 표시한다. 신뢰로 잠그지 않는다. 계약0.6.0과 공개 필드는 유지하며 앱이 의견/추천/notices를 전달한다. 신규 팩 catalog-recommendation-1, 동행 runtime catalog-companion-recommendation-1·계승 catalog-succession-4이며 schema6/7/8은 유지한다. 이전 팩에는 소급 적용하지 않는다. D08 이전 맥락/동일 상황 재현은 다음 단계다. 상세 [일반 추천](companion-recommendations.md).

## 최신 사용자 확정과 안내·회고 구현 (2026-10-29)

사용자가 D01/D02/D03/D05/D06/D08/D09의 방향을 확정했다. 상세 [최신 결정](decisions-2026-10-29.md)을 먼저 읽는다. 중립50 유지·생존 안정성>자원 효율>이동 속도·성향별 탈출 선호, 일반 본인4개 유지, 자율 동료의 구조/이별/재회, 첫 극단 회차전체1회, 짧은 감정적 회고, 대표 선택의 약한 판단 영향과 동일 상황 동일 선택, 두 회차 합계약15분·가변 스테이지가 최신 기준이다. 아래 D01~D09 미정·고정 준비형/탈출 순위·회차당 독자 행동1회·회차당15~25분은 해당 범위에서 이전 기록이다. 구체적인 고신뢰 경계·동일 상황 비교와 가중치는 연결 단계에서 검토하며 임의 확정하지 않는다.

이번에는 D05/D06을 구현했다. 팩 catalog-reflection-1, manifest.presentationVersion=reflection-1. 첫 안내는 실제 저장 이력의 최초 극단 도달 결과에만 표시하고 이후 상태창을 유지한다. 결말은2문장 회고·출발→최종 성향·실제 대표 선택(최대3)·계승 특징을 표시한다. 조기 종료의 없는 기록을 생성하지 않는다. 게임 수치/난수/Legacy/저장 스키마/계약0.6.0은 유지하며 이전 저장의 표시도 원문대로 유지한다. 이전 팩 fixture v11을 고정했다. 35파일420테스트·lint/build/content:check 통과. 실제 브라우저 E01 첫 안내→동행 E12 결말 회고를 확인했다. 상세 [안내와 회고](reflection-progression.md).

다음은 일반 추천과 이전 선택 맥락 보존, 이후 동일 상황 재현→자율 행동·이별/재회→가변 분량/15분 검증이다. 신규 범위를 포함한 전체 추정은 **약75~80%**로 재산정한다. 이전96%는 축소 프로토타입 기준이었다.


## 최신: 동료 양보·정비 추천 연결 (2026-10-29)

E04/E11 동행 그룹은 정비·물자 양보·상처 처치·주변/배낭 정리의4개다. 양보는 물자1, 체력+10, 스트레스-5, 신뢰+10(최대100), 치료 불가이며 결과에 실제 신뢰 변화와 이유를 남긴다. affect49 이하는 정비, 50 이상은 양보 추천(물자 없으면 정비)이라는 기존 회복 예외만 연결했다. 일반 사건의 D01 전체 순위·협력/독자 행동·D03은 확정하지 않았다.

팩 catalog-companion-recovery-1, 12장소/12사건/22그룹/88선택 항목/145문구. 계약0.6.0 유지, 단독 schema6/runtime2 유지, 신규 동행 schema7/catalog-companion-recovery-1·계승 schema8/catalog-succession-3이다. 이전 팩은 opening-catalog-v10.json으로 고정하며 구 저장 규칙을 유지한다. 34파일412테스트·lint/build/content:check 통과. 브라우저에서 신뢰0→10, 물자2→1, 체력65→75, 스트레스30→25를 확인했다. 추정 **약96%**, 다음은 일반 동료 추천/참여 정책 연결이다. 상세 [동료 정비](companion-recovery.md).


## 최신: 극단 장면의 독립 동료 선택 (2026-10-29)

사용자 수정으로 신뢰 기반 반대 목표 제지를 대체했다. 신규 팩 **catalog-companion-choice-1**은 극단 장면 E05~E10에서 본인 선택 3개+동료 선택 1개로 총4개를 유지한다. 본인의 반대 목표는 신뢰와 무관하게 제공하지 않으며, 별도 동료 명령은 동료 성향/유효 판단 집계에 따라 반대 목표가 될 수 있다. 동료가 같은 방향/중립이면 콘텐츠에 지정된 기본 동료 행동을 유지한다. 동료 없음은 기존 극단 본인4개다. 비용·판정·성향·결과는 원래 행동을 재사용하며 협력 보너스나 신뢰 증감은 추가하지 않았다.

계약0.6.0 유지. 신규 동행 schema7/runtime **catalog-companion-choice-1**, 계승 schema8/runtime **catalog-succession-2**. mode 없는 저장 팩의 이전 신뢰40 규칙과 schema4~8 원문을 보존한다. 구 팩은 opening-catalog-v9.json으로 고정했다. 33파일·403테스트, lint/build/콘텐츠 검사 통과. 실제 브라우저에서 신뢰0 우회 실행·성향/체력 반영·같은 방향 동료 슬롯을 검증했다. 추정 진척도 **약95%** 유지, 다음은 일반 동료 추천·협력/신뢰·양보 연결(미정 D01/D03 임의 확정 금지). 상세 [동료 선택 규칙](companion-choices.md). 아래 신뢰40 기반 제지는 과거 기록이다.


## 최신 계약0.6.0: 실제 다음 회차 (2026-10-29)

EndingViewModel.newRun=available이면 prepare-next-run에 sourceRunId/sourceResultId를 전달한다. StartViewModel.succession에는 직전 결말 제목과 요약을 표시하며 cancel-next-run 또는 새 설문을 담은 start-next-run을 보낸다. UI가 동료/계승을 생성하지 않는다. 설문 열기는 저장을 바꾸지 않고, 출발은 영속 커밋 성공 뒤 확정한다. 실패 확인창은 닫아 같은 후보 저장 재시도에 접근할 수 있다. 상세 succession-progression.md.

## 최신 동료 제지 연결 (2026-10-29)

계약0.5.0의 기존 companion/opinion, recommended, requiresCompanion으로 신뢰와 제지 의견·배지·네 선택·잠금 이유를 표시한다. 교체 목록과 신뢰40/자원 조건은 엔진에서 계산하며 UI는 재계산하지 않는다. 상태판의 단독 고정 문구를 동행 여부에 맞췄다. 제품 새 회차 시작은 아직 잠겨 있고 개발 전용 동행 체험을 제공한다. 상세 companion-intervention.md.

## 최신 E12 결말 연결 (2026-10-29)

계약 0.5.0의 기존 선택/미리보기/결말 ViewModel로 E12 네 선택·잠금 이유·비용과 예상 결말을 표시한다. 단거리 두 접근은 같은 조건/비용이며 우회는 routeKnown을 요구한다. 구조 요청은 두 경로 모두 불가능할 때만 열린다. 실행 뒤 결과 확인 버튼을 거치지 않고 실제 결말과 최종 상태·E02/E07/E10 대표 선택을 표시한다. 구조 대기에는 치명 부상 문구를 붙이지 않는다. UI가 탈출 규칙을 복제 계산하지 않는다. 새 회차 시작은 아직 제공하지 않는다. 상세는 escape-progression.md. 아래 E11 뒤 E12 대기 설명은 이전 팩 기록이다.

## 최신 E11 연결 (2026-10-29)

계약0.5.0의 기존 actions/treatmentActionIds로 E11 네 선택·잠금·선택적 치료를 표시한다. 현재 자원과 회복량은 앱에서 계산해 전달한다. UI에 별도 회복·탈출 계산을 추가하지 않았다. 상태판/확인창과 장면 안내에 E12 조건을 공개하며 E11 결과 뒤는 E12 대기다. 상세는 `final-rest-progression.md`.

## 최신 E10 연결 (2026-10-29)

계약0.5.0의 기존 actions 배열로 일반/연락망/감정 극단의 네 선택과 잠금·확률·보상을 표시한다. 연락망 확보 여부와 극단 판단을 UI에서 재계산하지 않는다. E10 연락망 결과에는 우회 경로 확보를 표시하며 정상 결과 뒤는E11대기다. 장식의 고정 QUARANTINE ZONE만 ‘봉쇄 도시’로 변경했다. 상세는 `contact-progression.md`.

## 최신 E09 연결 (2026-10-29)

계약0.5.0과 기존 UI를 그대로 사용해 E09 일반/이성 극단 네 선택, 자원 조건, 확률·스트레스 효과·실제 변화를 전달한다. 일반 돕기는 신체 보정, 극단은 비신체 판정이며 UI가 조건을 복제 계산하지 않는다. E09 결과 확인 뒤는E10대기다. 상세는 `quarantine-progression.md`, 실제 계산 흐름은 `gameplay-data-flow.md`다.

## 최신 E08 연결 (2026-10-29)

공개 계약0.5.0 변경 없이 E08 붕괴 통로와 일반/직관 극단 네 선택을 표시한다. 성공 체력 보상과 기본 비용은 미리보기에 각각 표시하고 실제 순변화는 결과에서 표시한다. E08 정상 결과 확인 뒤는 E09 대기다. UI는 극단·경로·비용을 복제 계산하지 않는다. 시작 제목과 여정은 현재/저장 팩 메타데이터를 사용한다. 상세는 `crossing-progression.md`다.

## 최신 계약0.5.0: 콘텐츠 기반 연결

연구동 E07 확장에서도 계약0.5.0을 유지한다. 팩 메타데이터의 제목/여정, access에 따른 내부/외곽 문구, 분석 극단 그룹을 앱에서 전달한다. UI는 E07 조건을 재계산하지 않는다. 시작 제목도 현재 또는 저장 팩의 메타데이터를 사용한다. 정상 E07 결과는 completesSegment=true와 E08 대기 경계를 표시한다. 기존6장소 저장의 제목/여정도 그대로 복원한다.

후속 네 선택 변경은 공개 계약0.5.0의 actions 배열을 그대로 사용한다. 신규 팩의 모든 그룹에 정확히4개를 정의하고 UI는 받은 순서/잠금을 표시한다. UI에서 두 개를 복제하거나 잘라서4개로 만들지 않는다. 이전 저장 회차의2개 표시도 계속 지원한다. 변경 내용은 `four-choice-update.md`를 따른다.

신규 회차 제품 진입점은 `createProductClient({store: createBrowserStore()})`다. 기존 schema4/5는 이전 드라이버, 빈 슬롯/schema6는 catalog 드라이버로 분기한다. `createDriverClient`가 토큰·입력 잠금·pending·저장 확정을 공유한다. 아래 createGameClient 예제는 기존 저장/엔진용이다.

UI는 계속 contracts만 사용한다. 공개 EventId는 임의 문자열이며 E01~E12 enum이나 사건명 분기로 화면을 구성하지 않는다. `AppSnapshot.presentation`의 edition/journey로 팩 이름과 동적 여정을 표시한다. 기존 스냅샷에는 이 값이 없을 수 있어 이전 표시를 지원한다. `choice.treatmentActionIds`로 치료 가능한 행동을 받는다. result의 `nextEventId`는null일 수 있고 `nextLabel`/`completesSegment`로 다음 이동과 구간 완료를 표시한다. 값이 없거나null인 것을 미래 사건ID로 보완하지 않는다.

개발 전용 `/?content-preview=opening`은 저장소를 주입하지 않는 세션 회차다. 기존 저장을 읽거나 변경하지 않는다. 일반 제품 경로는 durable이며 새schema6의 고정 팩으로 복원한다. 장소/사건 JSON 추가 시 UI 변경이 필요하지 않다. 작성법은 `content-authoring.md`를 따른다. 아래0.4.0 설명은 이전 병원 단계 기록이다.

2026-10-29. 공개 계약 **0.4.0**, 규칙 **1.2-stress-1**, 콘텐츠 **hospital-core-stress-2**. Codex가 전 영역을 담당한다. 실제 E01~E06 플레이와 브라우저 자동 저장·이어하기, 병원 극단 선택·치명 부상 결말/계승 기록을 연결했다. 이전opening-core-stress-1 저장도 명시적으로 지원한다. 저장 형식/지원 범위/승인 기록은 `persistence.md`, 개발 순서는 `roadmap.md`를 따른다.

## 연결과 사용

UI는 `src/contracts/index.ts`의 GameClient/ViewModel만 사용한다. engine/domain/storage/규칙 JSON을 직접 import하거나 수치·확률·잠금을 계산하지 않는다.

```tsx
import { useState } from 'react'
import { createGameClient } from './app/create-game-client'
import { createBrowserStore } from './storage/browser-store'
import { GameRoot } from './ui/GameRoot'

export default function App() {
  const [client] = useState(() => createGameClient({ store: createBrowserStore() }))
  return <GameRoot client={client} />
}
```

store 주입은 durable, 생략은 내부/테스트용 session이다. fixture는 별도 화면 샘플이며 실제 게임 명령을 실행하지 않는다. 제품은 durable이며 클라우드·서버·계정·생성형 AI 호출은 없다.

`useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot)`로 구독한다. 스냅샷/미리보기는 깊이 동결되며 다음 알림 전 참조가 안정적이다. 명령 성공은 session에서 메모리 확정, durable에서 영속 쓰기 완료 뒤다. 저장 중/실패 알림도 구독되므로 알림 횟수를 성공한 행동 수로 해석하지 않는다.

## 0.3.0 → 0.4.0

`ChoiceViewModel.notices`는 현재 사건의 극단 안내다. 행동 배열은 앱이 일반/극단 규칙을 적용해 반환하며 UI는 다시 고르지 않는다. `SegmentCompleteViewModel.continuation`은 이전 E04 저장에서만 `{context,label}`이며 `continue-segment`에 그대로 전달한다. 현재 E06 경계에서는null이고 버튼을 표시하지 않는다. `snapshotId`에는콘텐츠 버전도 포함되므로 UI가 직접 만들지 않는다. 치명 부상은 실제ending 화면의 변화와 Legacy 요약으로 표시한다. 최초 경고 확인 이력(D05)은 추가하지 않았다.

## 이전 변경: 0.2.0 → 0.3.0

`StatusViewModel.mental`을 제거하고 **stress**로 바꿨다. 초기30, 낮을수록 안정이다. 원문 정신력의 반대 수치이며 회복은 감소, 손실은 증가다. 60 초과 성공률−5, 80 초과−10이고 스태미나/부상 규칙은 유지한다. 화면·예상 효과·실제 변화·fixture·사용처를 함께 변경했다. UI가 자체적으로 mental을 변환하지 않는다.

0.2.0에서 추가한 persistence, segment-complete, preview.treatment/outcomes는 유지한다. 저장 지원은 기존 resume/retry-save/commit 계약으로 연결한다.

## 명령과 화면

1. 시작 시 저장이 있으면 `canResume=true`, `newRun=locked`다. UI는 이어하기를 보여 주고 새 설문으로 덮어쓰지 않는다. 저장 오류/호환 불가는 commit=blocked와 안내로 표시한다.
2. start-run은 이름1~40자·등록된 질문/답ID6개를 검사한다. UI의 delta는 받지 않는다. 앱이 회차ID/seed를 생성하고 첫 상태를 저장한다.
3. previewAction({context,actionId,treatment})은 비용·확률·성향·성패 효과를 준다. 난수/자원/기록/저장은 변경하지 않는다. 치료 변경은 새 토큰을 받으며 이전 토큰을 무효화한다. 취소/Esc는 실행하지 않는다.
4. execute-action({context,previewToken})은 앱의 최신 확정 선택을 다시 검증한다. 현재 회차/사건/revision/snapshotId를 전달하고 UI가 증가시키지 않는다.
5. 앱은 다음 상태·화면·저장 문자열을 준비하고 commit=saving을 알린다. 저장 전에는 이전 확정 장면을 유지한다. 저장 성공 후에만 결과를 표시한다.
6. 실패는 save-failed(operationId,message)다. 일반 입력은 잠그고 `retry-save({operationId})` 버튼만 허용한다. 같은 후보/난수/결과를 쓰며 다시 계산하지 않는다. 실패 중 창을 닫으면 마지막 저장 성공 지점으로 돌아간다.
7. acknowledge-result({context,resultId})도 다음 장면 저장 뒤 이동한다. 같은 결과를 두 번 확인할 수 없다. 새 콘텐츠는 E04→E05, E06 뒤는segment-complete/E07 대기다. 이전 콘텐츠의 E04 경계는continue-segment로 연결하며 같은pending/commit 절차를 쓴다.
8. resume는 저장된 choice/result/segment-complete/ending을 그대로 되살린다. 이미 나온 판정은 바뀌지 않는다. 단일 활성 탭 충돌은 blocked로 중단하고 새로고침을 안내한다. 치명 부상은 결과/Legacy 저장 성공 후에만ending을 표시한다.

UI와 앱은 각각 즉시 입력 잠금을 두며 앱은 비동기 경계 전에 잠근다. 토큰은 저장하지 않고 복원 후 새 미리보기를 받는다. UI의 이름/응답·미리보기·치료 체크·확인창은 확정 전 임시 상태다. 치료는 앱이 허용한 E04 정비에서만 제공한다.

## 파일 책임

| 파일/폴더 | 책임 |
|---|---|
| app/create-game-client.ts | 명령·구독·최신 토큰·pending·저장 성공 확정·재개 |
| app/questionnaire.ts | 등록 설문과 답ID 검증/매핑 |
| app/view-models/opening.ts | 상태·문구·실제 변화·예상 효과를 공개 모델로 변환 |
| storage/opening-save.ts | 버전 봉투·재현 검증 디코더 |
| storage/browser-store.ts | 단일 키 쓰기·Web Locks·이전 저장 충돌 검사 |
| ui/GameRoot.tsx | 화면 분기·선택 확인·저장/오류 안내·재시도 |
| ui/screens/StartScreen.tsx | 설문·응답 확인·이어하기 |
| ui/components / styles | 상태판·확인창·초점·반응형 디자인 |
| content/rules / texts | 등록된 수치 / 한국어 표시 문구 |

## 남은 범위

E07 이후 진행·전체 탈출 결말·2회차 동료·새 회차 교체·약속/파견·전체 기록/읽은 글 접기는 후속이다. 조기 치명 부상과 실제 Legacy는 연결 완료했다. 최초 성향 경고(D05)는 보류이며 현재 극단 안내·수치/밴드 표시와 구분한다. E07은 D04 확인이 먼저이고 D01~D03/D06/D08/D09도 관련 기능 전에 확인한다. D07 승인 범위 안에서 단독 조기 결말을schema5로 확장했으며 전체 계승/새 회차 정책은 확정하지 않았다.

자동 검증은 저장 전 성공 반환 금지, 동일 pending 재시도, choice/result/구간완료 복원, 손상/구버전 보존, 중복 실행/탭 충돌, 스트레스 전체 범위 등가성을 포함한다. 실제 브라우저에서 새로고침·이어하기·단일 탭 잠금·실패 스트레스 증가·휴식 감소를 별도로 검증한다.
