# 장소·사건·선택·스토리 작성 기준

## 현재: catalog-story-1 (2026-10-30)

54개 장소의 상황·결과·동료 표현을 보완했다. 고정 슬롯/A·B 후보, 7·14번 분기, 비용·확률·효과·신뢰·이별/재회 계산은 그대로다. 무작위 직전 장소를 단정하지 말고 실제 방문/획득 조건으로 회상을 제한한다. 재회에서 확인되지 않은 부재 중 사건을 만들어 내지 않는다.

manifest.reactionVersion=contextual-1의 recommendation-failure는 실제 추천 행동의 실패와 새 부상에만, infection-ending은 실제 주인공 감염 사망에만 표시한다. 성공·신뢰 감소만으로 책임 대사를 붙이지 않는다. 두 슬롯은 표시 전용이며 난수를 소비하지 않는다. 이전 저장은 저장된 팩의 문구와 반응을 유지한다. 상세 [대사 가이드](dialogue-authoring.md), [변경·검증 기록](story-revision-review.md)을 따른다. 아래 버전별 항목은 이전 기록이다.


## 최신 신규 팩: catalog-playtest-1 (2026-10-30)

신규reactionVersion=responsibility-1은 실행 전에 실제로 추천한 행동의 실패/신뢰 감소에 공통 책임 반응을 추가한다. 장소별 대사가 추천 여부를 추측해 ‘내가 제안했다’고 단정하지 않도록 한다. 이름 뒤 ‘이’를 붙이지 말고 ‘동료가’ 또는 조사가 필요 없는 문장으로 작성한다. 단서 설명은 특정 수납물에 고정하지 않으며 개발 변경량(예: 기존보다15%p 낮음)은 상황 본문에 넣지 않는다. 정확한 확률·감염 경고는 확인창에서 제공한다. [실화면 점검과 범위](playtest-2026-10-30.md). 아래catalog-balance-1은 이전 팩이다.

## 최신 신규 팩: catalog-balance-1 (2026-10-30)

일반 행동 성향은 사용자 승인±4 기준으로 작성한다(이전±8을 복사하지 않는다). 비용·극단 경계·설문 수치 변경 권한을 뜻하지 않는다. 지하터널/도시 외곽 탈출 결말은 manifest `endingVersion: routes-1`과 escape 행동의 조건부 ending으로 연결한다. [작성 파일·저장·검증](route-endings-balance.md). 아래catalog-research-1은 직전 버전이다.

## 현재 신규 팩: 19스테이지 (2026-10-30)

현재 revision은 `catalog-research-1`이다. 활성54곳의 고유 사건을 `stage19/events/<locationId>.json`, 상황·결과·대사를 `stage19/scripts/<locationId>.json`에서 편집한다. 무작위 조사 기회·진입·치료제 결말은 [연구동 작성법](research-route.md), 감염 접촉은 [감염 작성법](infection.md), 경로 행동/사실은 [경로별 특징](route-identities.md)을 참조한다. 새 장소/문구도 자동 수집되지만 슬롯 후보와 사건 대상·조건을 함께 확인해야 한다.

신규 기본 콘텐츠는 `src/content/catalog/packs/stage19/`다. 슬롯 후보·7/14번 경로 선택·작성 파일·저장 호환은 [19스테이지 구현/작성 지침](stage19-progression.md)을 먼저 읽는다. 아래12사건 필수 경로는 기존 팩 기록이다. 기존 조건부 사건·문구·동료 대화 작성 방법은 새 팩에도 적용한다.

## 최신: 선택 개수 고정 해제 (2026-10-29)

사용자가4개 고정을 철회했다. 장면마다 필요한 행동만 정의하며 수를 맞추는 복제 선택을 만들지 않는다. 극단 본인 목표 제한·독립 동료 슬롯·무자원 대안은 유지한다. 신규 팩 catalog-variable-choices-1의 E12는 중복 단거리 제거 후3개다. 기존 저장은 원래 선택 수를 유지한다. 아래 네 선택 고정은 과거 기록이다. 상세 [가변 선택](variable-choices.md), 이후 순서는 [동료 서사 보강](companion-experience-roadmap.md).

## 최신: 보호 약속 제외·가변 분량 (2026-10-29)

보호 약속은 사용자 요청으로 제외했으며 이전 준비 문서는 과거 기록이다. 신규 팩 catalog-flexible-stages-1과 routeVersion=stages-1은 선택적 장소 enabled·최소/최대 방문 수를 사용하고 필수 장소와 탈출 마지막을 보장한다. 계약0.7.0 유지, 구 저장은 원문 보존. 작성법·검증·배포 점검은 [가변 분량](flexible-stages.md)을 따른다. 현재 제품 콘텐츠는12필수 장소의 기존 경로이며 사람의 두 회차15분 실측은 남아 있다.


## 최신: 결과 기반 신뢰·이별 콘텐츠 작성 (2026-10-29)

신규 팩 catalog-companion-outcome-1은 trustVersion=outcome-1 / autonomyVersion=journey-2다. 신뢰 증감을 직접 지정하지 말고 choice.relationship.success/failure에 실제 가치관/동료 지원 결과만 작성한다. 체력·부상·자원·정보 손익은 엔진이 합산하며 한 선택당±5다. autonomy.conflicts에는 실제 이별로 이어지는 중요한 playerGoalId/companionGoalId 조합과 이유만 지정한다. 단순 의견 차이는 이별로 만들지 않는다. 신뢰80은 동행 유지, 명령60과 별도다. 이전 고정+10·구조 전용은 과거 단계다. 상세 [결과 기반 관계](relationship-outcomes.md).


## 동료 명령 연결 — 2026-10-29

명시한 행동만 확인창에서 직접/동료 실행을 선택한다. 추천 일치 또는 신뢰60 이상 수락, 독자 이탈 방지는 기존80이다. 기존 비용/성공률/피해를 유지하고 공동 위험을 표시하며 본인4개를 유지한다. 계약0.7.0의 선택적 PreviewActionRequest.executionActor와 ActionPreviewViewModel.execution을 사용한다. 주체 변경은 새 토큰을 발급하고 같은 주체 후보로 저장 재시도한다. 신규 팩 catalog-companion-command-1·계승 catalog-succession-8, schema6/7/8 유지, 구 저장 유지. 상세 [동료 명령](companion-commands.md).
execution의 역할/조건/sharedRisk를 명시한 일반 행동만 파견 대상이다. 사건 ID나 physical로 파견 가능성을 추론하지 않는다. 확정 행동에 없는 실패 위험을 서술하거나 새 수치 보너스를 만들지 않는다. 실행 주체 선택을 다섯 번째 이야기 선택으로 추가하지 않는다. 보호 약속·배신 태그는 아직 작성하지 않는다.


## 데이터 기반 이탈·재회 — 2026-10-29

사건 autonomy 조건/판단과 재회 장소 태그/minVisits/조건으로 연결한다. 현재 신뢰80 이상 동행, 미만에서는 구조 추천과 자기 보존 충돌 시 이탈한다. 동료 신원을 보존하며 부재 중 추천·동료 행동을 제외하고 본인4개를 유지한다. 이탈/재회는 행동/이동과 함께 저장하고 실패 시 동일 후보로 재시도한다. 새 팩 catalog-companion-journey-1·동행 catalog-companion-autonomy-1·계승 catalog-succession-7. 계약0.6.0·schema6/7/8 유지, 구 저장 유지. 상세 [동료 이탈·재회](companion-autonomy.md).
새 사건도 JSON의 autonomy 조건과 실제 판단/추천을 사용하고 재회할 거점에는 해당 locationTags를 부여한다. 신뢰80 이상 동행 기준을 지킨다. 엔진에 사건 번호를 추가하지 않는다. 없는 재회 태그는 검증 실패이며 실제 경로에 조건 충족 거점이 없으면 부재가 유지된다. 정찰/전투 명령·추가 위험/보상을 임의로 작성하지 않는다.


## 이전 판단 추천 연결 — 2026-10-29

D08 세부 기준 사용자 승인으로 동일 상황의 과거 행동 추천과 최종 동률에서의 약한 대표 목표 선호를 연결했다. 네 선택·플레이어 실행 결정을 유지하며 불가능한 과거 행동은 열지 않는다. 신규 catalog-decision-echo-1·동행 catalog-companion-echo-1·계승 catalog-succession-6, 계약0.6.0·schema6/7/8 유지. 구 저장은 고정 팩 유지. 상세 [이전 판단 추천](decision-echo.md).
콘텐츠 작성 시 decisionEcho.compatibleRevisions는 현재 revision과 의미 호환을 검토한 revision만 명시한다. 장면/행동 의미 변경을 자동 호환 처리하지 않는다. 대표 목표는 같은 사건의 실제 goalId를 사용하며 과거 기록·수치 가중치를 생성하지 않는다.


## 선택 당시 상황 보존 — 2026-10-29

신규 catalog-decision-memory-1은 manifest.decisionMemoryVersion=context-1을 명시한다. 실제 선택 전 상태/동료/현재 네 후보·잠금·variant·미리보기·선택적 치료를 엔진이 기록하며 JSON 작성 모델이 과거 기록을 작성하지 않는다. 계약0.6.0 유지, 새 단독 runtime3·동행 catalog-companion-memory-1·계승 catalog-succession-5(schema6/7/8). 구 저장에는 소급 추가하지 않는다. UI는 기존 계약을 계속 사용하며 내부 기록을 직접 계산/조회하지 않는다. 동일 상황 재현/약한 영향은 다음 단계다. 상세 [상황 보존](decision-memory.md).

## 일반 추천 확장 — 2026-10-29

신규 팩 catalog-recommendation-1은 manifest.recommendationVersion=survival-1을 명시한다. 일반 사건에 `recommendation: {"axis":"risk"}`(또는 cognition/affect)를 지정한다. 실행 가능한 variant의 traitDelta 방향과 goalId로 성향 목표를 정하며 정확히50은 중립이다. 탈출은 risk축과 기존 escape route로 비교한다. recovery 예외는 기존 정책을 유지한다. 이동 속도는 문구에 근거가 있을 때만 선택에 `pace: "slow" | "balanced" | "fast"`를 쓴다. 미상은 생략하며 시간 수치나 위험 보정을 생성하지 않는다. 두 자원이 교환관계이거나 동률/속도 미상일 때는 보류하므로 한 선택을 강제로 추천하려고 콘텐츠 수치를 바꾸지 않는다. 검증 스키마는 content:schema로 내보낸다. 상세 [일반 추천](companion-recommendations.md).

## 최신 기준

[사용자 확정 기획](decisions-2026-10-29.md)을 우선한다. 현재 팩 catalog-reflection-1, 표시 정책 reflection-1. 일반 본인4개·극단 본인3+동료1을 유지하고 회고는 짧게 작성한다. D03 자율 행동/이별·재회 및 D08 동일 상황 판단은 아직 엔진이 연결되지 않았으므로 문구만으로 작동한다고 가정하지 않는다. 전체 목표는 두 회차 합계약15분이며 유동 분량을 지원한다.

## 최신 회복 콘텐츠

현재 팩은 catalog-companion-recovery-1(12장소/12사건/22그룹/88선택 항목/145문구). 동행 E04/E11에 recovery/share를 제공한다. companion=true 조건 그룹·물자1 요구·기존 정비/치료 제한을 유지하며 수치 효과를 action으로 복제하지 않는다. 일반 추천 미정 정책은 생성하지 않는다. 상세 [companion-recovery.md](companion-recovery.md).

## 최신 제지 메타데이터 (2026-10-29)

기본 팩 catalog-intervention-1은 12장소/12사건/20그룹/80선택 항목/141문구다. event의 선택적 intervention에 극단 그룹/축/극, 교체 ID, 다른 그룹의 반대 목표 행동 참조, 집계 방향, 대사와 안내를 명시한다. E05~E10이 예시다. 원래 네 항목은 유지하고 표시할 때만 3+1로 구성한다. 비용/수치를 복제하지 않는다. 교체 뒤에도 무자원 극단 행동을 남겨야 하며 schema/등록에서 참조와 축을 검사한다. 고정 fixture v1~v8은 수정하지 않는다. 상세 companion-intervention.md.

## 최신 기본 팩: E12 포함 (2026-10-29)

catalog-escape-1: 장소 12·사건 12·그룹 20·선택 항목 80·문구 141이다. E12는 **behavior.kind=escape, ruleEventId=E12, route=short/detour/request**를 사용한다. 각 그룹은 정확히 네 선택이며 세 경로 종류를 모두 포함한다. 네 번째 항목은 같은 단거리 규칙의 다른 서술이다. judgment=null, successFacts/failureFacts={}이며 일반 action으로 탈출 수치를 복제하지 않는다. 종료 장소는 후반부 필수 장소이고 반드시 경로 마지막이다. 구조 요청은 무자원 대안이며 실제 실행 가능 여부는 엔진이 두 경로 불가 조건으로 검사한다. 탈출 결과 문구의 선택은 난수를 소비하지 않는다. 앞선 11사건과 고정 fixture v1~v7은 수정하지 않는다. 상세는 escape-progression.md. 아래 이전 팩 수치는 각 단계 기록이다.

## 최신 기본 팩: E11 포함 (2026-10-29)

catalog-final-rest-1: 장소11·사건11·그룹19·선택 항목76·문구133이다. E11은 네 선택과 routeKnown 조건 문구로 구성한다. recovery behavior의 ruleEventId=E11을 사용하며 추가 점검/정리는 일반 확정 action이다. 모든 E11 성향 변화는0이다. 기존10사건과 고정 fixture를 바꾸지 않는다. 출처·신규 프로토타입 수치는 `final-rest-progression.md`를 따른다.

## 최신 기본 팩: E10 포함 (2026-10-29)

catalog-contact-1: 장소10·사건10·그룹18·선택 항목72·문구127이다. E10은 일반/연락망/감정 극단 세 그룹에 각각4개이며 공통 구조 행동을 재사용해 고유행동9개다. 동일ID 재사용 시 정의가 완전히 같아야 한다. helpEstablished 조건·priority로 연락망과 극단을 구분하고 기존9사건을 변경하지 않았다. 수치와 출처는 `contact-progression.md`. 이전팩 고정fixture는수정하지 않는다.

## 최신 E09 팩 (2026-10-29)

기본 팩 catalog-quarantine-1은 E01~E09·9장소·15그룹·60행동·109스크립트다. E09는 affect<=22의 이성 극단에서 quarantine 목표 네 선택을 제공한다. 원문/신규 수치·자원 소비·판단 집계 기준은 `quarantine-progression.md`, 계산 흐름은 `gameplay-data-flow.md`다. 이전 고정 fixture v1~v4는 신규 콘텐츠에 맞춰 수정하지 않는다. 목적지 선택 이동과 콘텐츠 대량 확장은 프로토타입 완료 뒤다. 아래 E08 팩은 과거 기록이다.

## 최신 프로토타입 팩 (2026-10-29)

기본 팩은 catalog-crossing-1, E01~E08·8장소·13그룹·52행동·93스크립트다. E08 정의/출처/추가 프로토타입 수치는 `crossing-progression.md`다. 각 그룹은 정확히4개, 직관 극단은cross 목표를 유지한다. 목적지 선택 이동은 아직 없으므로 JSON에 임의 이동 필드를 넣지 않는다. 콘텐츠 대량 확장과 이동 분기는 프로토타입 완료 뒤에 진행한다. 이전 고정 fixture v1/v2/v3는 새 콘텐츠에 맞춰 수정하지 않는다.

2026-10-29. 사용자 승인에 따라 고정 E01~E06을 콘텐츠 팩으로 전환했다. 새 장소·사건·선택·문구는 JSON 추가로 등록된다. 게임 중 AI API를 호출하지 않는다. 저렴한 모델로 초안을 만들고 검증·검수한 파일을 빌드에 포함하는 방식이다.

## 폴더와 실제 반영

```text
src/content/catalog/packs/opening/
  manifest.json           # 구간 길이·시작 장소·이야기 조건 선언·구간완료
  locations/*.json         # 장소 하나 또는 배열
  events/*.json            # 사건·선택·규칙 하나 또는 배열
  scripts/*.json           # 본문·결과 문구 하나 또는 배열
```

하위 폴더도 자동 수집한다. 새 파일을 import 목록이나 ID enum에 추가하지 않는다. ID는 영문자로 시작하고 영문/숫자/점/하이픈/밑줄, 최대80자다. 다른 pack을 만들려면 packs 아래 새 폴더와 manifest를 둔다. 파일명은 등록 순서에 영향을 주지 않는다.

1. 해당 폴더에 JSON을 추가한다.
2. `npm run content:check`로 모든 팩의 형식·참조·도달 가능성·기본 문구를 검사한다.
3. `npm run dev` 상태에서 `http://127.0.0.1:5173/?content-preview=opening`으로 저장 없는 검증 회차를 시작한다. 다른 팩은 query에 그 manifest.id를 사용한다. 개발 모드에서만 제공한다.
4. 검수 후 `npm run lint`, `npm run test:run`, `npm run build`를 실행한다. 배포에는 새 빌드가 필요하다.

실제 제품의 새 회차는 opening 팩을 쓴다. 기존 회차는 저장된 콘텐츠와 경로를 고정해서 이어한다. 파일을 추가했다고 이미 진행 중인 회차에 새 장소를 끼워 넣지 않는다. 기존 저장을 지우거나 새 회차 교체 정책을 우회하지 않는다.

## 장소와 개연성

현재 신규 팩은 `catalog-research-1`이다. E07 연구동은 병원 이탈 태그와 선행 방문을 요구하는 중반부 필수 장소로 연결했다. 현재7장소/7사건/44행동/76문구이며 D04는 사용자가 명시적으로 승인했다. `research-progression.md`를 현재 작성 예시로 함께 제공한다. 아래6장소/E07 미구현 설명은 최초 전환 시점 기록이다. 새 콘텐츠 추가 때 대조 fixture 두 개를 수정하지 않는다.

```json
{
  "id": "corner-store",
  "name": "골목 편의점",
  "stage": "early",
  "tags": ["road", "store"],
  "fromTags": ["road"],
  "after": ["villa"],
  "required": false,
  "weight": 2
}
```

위 예시는 **기존 store 태그 사건을 재사용하는 구조 설명용**이다. 본문이 원래 장소를 지칭한다면 해당 장소 전용 사건·문구도 작성해야 한다. 같은 태그를 붙였다고 서사 내용까지 자동으로 타당해지는 것은 아니다.

| 필드 | 의미 |
|---|---|
| stage | early/전반부, middle/중반부, late/후반부 |
| tags | 이 장소의 연결·사건 검색 태그 |
| fromTags | 직전 장소가 이 중 하나의 태그를 가져야 진입 가능 |
| after | 모두 실제 경로에서 먼저 방문해야 하는 장소 ID |
| required | 살아서 해당 구간을 진행하면 반드시 한 번 방문 |
| weight | 다른 가능 후보보다 선택될 상대 가중치. 확률%가 아님 |

장소는 회차당 최대 한 번이다. 시작 장소는manifest.startLocationId이며 전반부의required=true 장소여야 한다. 구간을 역행하거나 건너뛰지 않는다. 구간별minVisits/maxVisits 안에서 필수 장소·연결·선행 조건을 모두 만족하는 경로를 만든다. 불가능하면 필수 장소를 생략하는 대신 오류로 중단한다. 선택 장소도 한 번 이상 유효한 경로에 포함될 수 있어야 등록된다. 탐색 한도 초과도 명시적 오류다.

연구동을 필수로 만들 때는 연구동 장소에required=true를 지정하고 기본 사건/문구와 접근 가능한 연결을 제공한다. 회차가 조기 치명 부상으로 끝나면 미도달 장소는 방문한 것으로 기록하지 않는다. 필수 방문은 생존한 경로 진행의 보장이다.

현재 opening 팩은 기존 여섯 사건의 앞뒤 관계를after로 보존했다. 전반부최소4/최대8, 중반부최소2/최대8, 후반부최소0/최대8은 **기존 부분 콘텐츠를 연결하기 위한 편집 설정**이며 전체 게임의 최종 길이/밸런스 확정이 아니다. 현재 추가 후보가 없어 기본 경로는 여섯 장소다. 연구동/E07은 미구현이며 임의로 채우지 않았다.

## 사건과 선택

최신 사용자 지시로 **선택지4개 고정을 해제했다.** 장면에 의미 있는 행동만 작성하고 개수를 맞추기 위한 복제·동일 행동의 문구 변형을 추가하지 않는다. 형식상 그룹은1~20개를 지원하며 이는 기술적 허용 범위이지 목표 개수가 아니다. 일반·극단 모두 적용한다. 극단의 본인 목표 제한과 독립 동료 슬롯은 유지한다. 동료 슬롯이 있는 그룹에는 본인 행동과 명시적 동료 슬롯이 필요하다. 자원 부족 잠금 이유·무자원 대안·반복 가능한 결과 문구도 유지한다. 기존 저장 팩은 그대로 이어한다. 최신 내용은 `variable-choices.md`, 아래 네 선택 규칙과 `four-choice-update.md`는 과거 기록이다.

events의locationIds(직접 지정) 또는locationTags(태그 매칭) 중 하나에 맞는 사건이 후보가 된다. conditions까지 맞는 후보에서weight로 추첨한다. 새 사건 파일에 장소 대상을 지정하면 기존 장소 파일의사건 목록을 수정할 필요가 없다. 장소마다조건 없는 기본 사건이 최소 하나 필요하다.

groups는 조건별 선택 묶음이다. 현재 조건에 맞는 그룹 중priority가 가장 높은 하나를 표시한다. 동률이면 ID 오름차순이다. 조건 없는 기본 그룹은 정확히 하나, 권장priority0이다. 일반 그룹에는 물자0/치료도구0/스태미나0에서도 실행 가능한 기본 행동이 있어야 한다. 탈출 그룹은 전용 request 경로를 포함하고 엔진이 이동 불가 조건을 검사한다. 요구를 만족하지 못하는 추가 행동은 잠금 이유와 함께 표시된다.

선택은id/goalId/label/intention/target/judgment/behavior/successFacts/failureFacts를 명시한다. goalId는 같은 목표의 다른 실행방식을 묶는다. judgment는rescue/self/null이며 단순 감정 문구만으로 판단 기록을 만들지 않는다.

- behavior.kind=action: conditions에 처음 맞는variants의action을 사용한다. 마지막variant는conditions=[]인 기본 정의여야 한다.
- action은requires/costs/check/traitDelta/successEffects/failureEffects를 모두 명시한다. 물자 소모는costs에 쓰며, 판정은check=null이면 확정이다. 스크립트가 수치를 바꾸지 않는다.
- action.eventId는 **기존 코어의 규칙 문맥 E01~E12**다. 사건의 자유 ID와 다르다. E07의접근 보정/E02의구조판단 같은 의미를 유지한다. 일반 새 사건에특수 규칙을 무심코 재사용하지 않는다. E12는 일반 action으로 사용할 수 없으며 전용 escape behavior를 사용한다.
- behavior.kind=recovery는 기존 E04/E11의maintain/rest 규칙을 호출한다. 수치를 복제하지 않는다. 정비에서만 치료 도구를 함께 사용한다.
- successFacts/failureFacts는manifest.facts에 선언한 이야기 조건을 변경한다. 처음에는 모두false다. 수치·동료 판단·새 시스템을 대신하는 임의 코드로 사용하지 않는다.

완전한 동작 예시는events/E02.json(물자별 방식), E04.json(정비/치료), E05.json(극단 대체·잠금), E06.json(확정 포기·위험 철수)을 따른다. 모두 기존 승인 콘텐츠에서 옮겼다. 새 감염·거래·파견·탈출 시스템은 JSON만으로 구현 완료가 되지 않으며 엔진의 명시적 확장이 필요하다.

## 조건과 스크립트

모든conditions는AND다. OR는 여러 정의로 나눈다. 문자열코드·eval·임의 JavaScript는 지원하지 않는다. 숫자 범위의min/max는양끝 포함이다.

| kind | 필드/판정 |
|---|---|
| number | subject=protagonist: stress/stamina/injury/risk/cognition/affect. subject=companion: risk/cognition/affect/trust. min/max |
| resource | resource=supply/medkit, min/max |
| companion | present=true/false |
| weapon | value=true/false |
| flag | flag=access/data/helpEstablished/routeKnown, value |
| fact | 선언한id, value |
| visited | locationId, value. 현재 장소도 방문으로 포함 |
| location-tag | tag |
| stage | stage=early/middle/late |

```json
{
  "id": "E05.scene.companion-analysis",
  "eventId": "E05",
  "choiceId": null,
  "slot": "scene",
  "conditions": [
    { "kind": "companion", "present": true },
    { "kind": "number", "subject": "companion", "stat": "cognition", "min": 0, "max": 22 }
  ],
  "priority": 30,
  "weight": 1,
  "once": false,
  "text": ["{{companion.name}}이 출입구의 흔적을 살핀다."]
}
```

동료 유무·성향·신뢰 조건은 실제 동행 문맥에서 평가한다. 추천 대상과 신뢰·이별 여부는 기존 게임 규칙이 결정하며 대사는 그 결과를 표현한다.

기본 슬롯은 scene/success/failure다. scene은 choiceId=null, success/failure는 실제 선택 ID가 필요하다. 조건에 맞는 최고 priority에서 가중 추첨하며, 미사용 문구 우선·once 규칙을 유지한다. 기본 사건 본문과 실행 가능한 성패에는 conditions=[]/once=false인 기본 문구가 필요하다. 결과와 동료 반응은 함께 검수한 완성된 본문으로 작성한다.

manifest.dialogueVersion="scripts-1"인 팩은 opinion/hesitation/departure-warning/departure/absent/reunion 슬롯을 추가로 지원한다. opinion과 두 departure 슬롯에는 실제 선택 ID를 쓰고 나머지는 null이다. 이 채널은 이미 발생한 추천·이별·재회 상황에만 표시하며 최고 priority, ID 오름차순으로 하나를 고른다. weight=1/once=false만 허용하고 난수·진행·신뢰를 변경하지 않는다. 상세 규칙과 예시는 [동료 대사 작성](dialogue-authoring.md)을 따른다.

변수는 {{protagonist.name}}/{{companion.name}}/{{location.name}}만 허용한다. 동료 이름에는 present=true 조건이 필수다. HTML/코드를 실행하지 않는다. scene은 진입 시점, success/failure는 효과 적용 후 상태로 판단한다. 선택된 본문 ID는 저장하며 이어하기에서 재추첨하지 않는다. 표시 전용 채널은 저장된 현재 상태에서 결정적으로 조회한다.

주인공의 생각은 ‘남쪽까지 가야 하는데.’처럼 작은따옴표, 실제 발화는 “여기 사람이 있어요?”처럼 큰따옴표로 구분한다. 모든 문단을 대화로 만들지 말고 판단·감정이 드러나는 지점에만 넣는다. 기존 저장은 내장된 팩과 당시 표시 방식으로 복원하며 신규 대사를 소급 적용하지 않는다.

## 저렴한 모델에 전달할 자료

`content-model-prompt.md`와 작성 대상 schema, 관련 기존 JSON, 승인된 사건 규칙/장소 연결표를 전달한다. 모델은 대량 초안을 작성하고 사람/개발자가 규칙과 서사를 검수한다. 자동 검사는 문구의 개연성이나 ‘보상 획득’ 서술과 수치의 의미 일치까지 증명하지 않는다.

JSON Schema는 content-schemas/manifest.schema.json, location.schema.json, event.schema.json, script.schema.json, pack.schema.json이다. `npm run content:schema`로 런타임과 같은 정의에서 재생성한다. 최종 검증은 형식뿐 아니라 참조/경로를 검사하는 `npm run content:check`다.

원본 rules/opening*.json과 texts/opening.ts는 schema4/5 저장 호환용으로 보존한다. 신규 콘텐츠는 catalog 아래에 작성한다. src/test/opening-catalog-v1.json은 기존 규칙 대조용 고정 자료이며 신규 파일 추가 때 수정하지 않는다.
