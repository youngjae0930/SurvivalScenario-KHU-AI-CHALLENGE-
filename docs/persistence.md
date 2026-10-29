# 저장·이어하기와 스트레스 전환

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


## 최신 계승 저장: schema8 (2026-10-29)

실제 다음 회차는 schema8/catalog-companion/catalog-succession-1로 저장한다. 직전 한 인물의 compact Legacy·동료 최초 입력·새 설문/seed·현재 전체 팩/명령을 고정하고 재실행 대조한다. 준비/취소는 쓰기 없음, 출발 실패는 이전 결말 유지·동일 후보 재시도다. 기존schema6/7 및schema4/5는 자동 전환하지 않는다. 이전 완료catalog에서 명시적 새 출발 때만 최신팩으로 시작한다. 현재동료입력은 종료 후에도 불변이며 과거 전체를 재귀 보관하지 않는다. 상세 succession-progression.md.

## 최신 동행 입력 저장 (2026-10-29)

동료가 있는 회차만 schema7/catalog-companion/catalog-intervention-1로 분리한다. companionOrigin과 고정 팩을 보존하고 초기 입력부터 제지 행동을 재실행한다. 단독 schema6와 schema4/5는 그대로다. 원래12사건은 opening-catalog-v8.json으로 고정했다. 저장 실패 동일 후보 재시도와 변조 거부는 자동 테스트로 확인했다. 새 회차 전환은 아직 연결하지 않았다. 상세 companion-intervention.md.

## 최신 E12 결말 저장 (2026-10-29)

catalog-escape-1은 E12 선택 직전/실제 결말/전체 선택 기록/Legacy를 schema6/catalog-solo의 **catalog-runtime-2**로 저장한다. 공개 계약 0.5.0·규칙 1.2-stress-1은 유지한다. 탈출 behavior가 없는 기존 팩은 runtime-1을 그대로 사용하고 원래 팩으로 복원한다. 이전 11사건 팩은 opening-catalog-v7.json에 고정했다. runtime과 팩 정의 일치 및 전체 재실행 대조로 변조 결말을 거부한다. 영속 저장 성공 뒤에만 결말 화면을 확정하며 실패 시 기존 상태와 저장 유지·동일 후보 재시도다. 새 회차 교체나 기존 저장 갱신은 추가하지 않았다. 상세는 escape-progression.md. 아래 E12 대기는 이전 단계 기록이다.

## 최신 E11 저장 (2026-10-29)

catalog-final-rest-1은 E11 선택·정비/치료 결과·E12 대기를 schema6/catalog-solo/runtime1로 저장한다. 계약0.5.0·규칙1.2-stress-1 유지. 저장 실패는 기존 상태 유지·동일 후보 재시도이며 치료 도구/물자를 중복 소비하지 않는다. 이전10사건 팩은 opening-catalog-v6.json에 고정했고 기존 회차에는 E11을 삽입하지 않는다. 상세는 `final-rest-progression.md`.

## 최신 E10 저장 (2026-10-29)

신규 catalog-contact-1의 E10 선택·결과·E11 대기와 실제 치명 Legacy를 schema6/catalog-solo/runtime1로 저장한다. 계약0.5.0/규칙1.2-stress-1을 유지한다. E10 대표 행동과 판단 집계·E02 연락망/routeKnown을 실제 계산 결과로 보존한다. 실패는 기존 화면/저장 유지·동일 후보 재시도다. 이전9사건은 opening-catalog-v5.json으로 고정했으며 기존 저장은 원래 팩으로 이어한다. 상세는 contact-progression.md다.

## 최신 E09 저장 (2026-10-29)

catalog-quarantine-1은 E01~E09의 검증된 콘텐츠와 진행을 고정한다. schema6/catalog-solo/runtime1과 D07 정책은 그대로다. E09 선택/결과/E10 대기·치명 결과/판단 집계/Legacy·저장 실패 동일 후보를 검증했다. 이전 schema4/5 및 schema6의6/7/8사건 저장에 새 사건을 삽입하지 않는다. 이전8사건 대조 자료는 `src/test/opening-catalog-v4.json`이다. 상세는 `quarantine-progression.md`다.

## 최신 E08 저장 (2026-10-29)

신규 팩 catalog-crossing-1은 E01~E08 전체 콘텐츠를 고정한다. schema6/catalog-solo/runtime1과 D07 정책은 그대로다. E08 선택/결과/E09 대기·치명 결과/Legacy·저장 실패 동일 후보 재시도를 검증했다. 기존schema4/5와 이전schema6의6/7사건 회차는 원래 내용으로 복원하며 E08을 자동 삽입하지 않는다. 이전 연구동 팩의 고정 대조 자료는 `src/test/opening-catalog-v3.json`이다. 상세는 `crossing-progression.md`다.

## 최신 형식: schema6/catalog-solo

연구동 확장의 신규 revision은 `catalog-research-1`이다. 전체 고정 팩 저장 방식을 유지하므로 schema6/runtime1은 변경하지 않는다. 새 회차는7장소 경로·연구동 선택/자료·무기/물자 변화를 재현하고, 기존schema6의6장소 팩은 그대로 복원한다. E07 치명 부상 시 실제 대표 E07 행동을 Legacy에 기록하며 E10은null이다. E07 정상 완료는E08 대기이며 결말/Legacy를 생성하지 않는다. 연구동 규칙은 `research-progression.md`를 따른다.

후속 네 선택 변경의 신규 콘텐츠 revision은 `catalog-opening-2-four-choices`다. 신규 파일 등록은4개를 요구한다. 저장 디코더만 기존 선택 수를 허용하는 `savedPackSchema`로 전체 팩을 검증하여 이전 schema6 두 선택 회차도 원문 그대로 복원한다. 원래 행동·난수 처리·저장 봉투 형식은 바뀌지 않아 schema/runtime 버전을 유지한다. 사용자 승인 없이 저장 팩의 선택을 추가하거나 기존 회차를 초기화하지 않는다.

신규 회차는 `src/storage/catalog-save.ts`의 **schemaVersion6 / kind=catalog-solo / policy=single-slot-v1 / runtimeVersion=catalog-runtime-1**을 쓴다. 규칙1.2-stress-1과 xorshift32-v1을 유지한다. 검증된 팩 전체, 출발 정보, 선택 경로·방문·선택 사건/문구ID·난수·이력·실제 조기 Legacy를 같은 봉투에 저장한다. 새 JSON 추가/수정은 다음 회차에만 반영하며 진행 회차는 저장된 팩을 사용한다.

복원은 저장 팩을 구조/참조/경로 검증하고 출발부터 재현하여 봉투 전체를 비교한다. 임의 기록/문구/상태 변조와 지원하지 않는 형식은 보존하고 차단한다. 이는 보안 서명이 아닌 일관성 검사다. 저장 문자열은 최대2백만 자로 제한하며 초과나 브라우저 용량 실패 시 동일pending 재시도 절차를 따른다. 치명 결과/Legacy 원자 저장과 대표 행동 E02/E07/E10 범위를 유지한다.

제품은 기존 **schema4/5를 자동 변환하지 않고** 원래 엔진·콘텐츠로 지원한다. 아래schema4→5의 명시적 E04 연결도 유지한다. 새 콘텐츠와 옛 데이터를 섞지 않는다. D07 한 슬롯/한 활성 탭/같은 결과 재시도/손상 원본 보존은 그대로다. 새 회차 교체·전체 동료 저장 정책은 추가 승인하지 않았다. 아래schema5 ‘현재’ 표기는 이전 병원 단계 기록이다. 공개 UI 계약은0.5.0이다.

2026-10-29 사용자 승인: 한 브라우저·한 회차·한 활성 플레이 탭, 실패 시 동일 결과 재시도, 손상/구버전 원본 보존, 진행 중 이어하기만 제공. D05 최초 성향 경고는 이번 구현에서 제외한다. 전체 게임/Legacy 저장 정책을 모두 확정한 것은 아니다.

## 플레이 동작

- 출발, 행동 실행, 결과 확인마다 다음 진행을 자동 저장한 뒤 화면을 확정한다.
- 새로고침/재실행 시 시작 화면의 **이어하기**로 선택 장면·이미 판정된 결과·구간완료·조기 결말을 복원한다. 재추첨하거나 비용을 다시 쓰지 않는다.
- 저장 실패 시 직전 확정 화면을 유지하고 입력을 잠근다. **같은 결과로 저장 재시도**는 메모리에 보관한 동일 후보를 쓴다. 실패 중 창을 닫으면 마지막 저장 성공 지점으로 돌아간다.
- 다른 탭이 진행 중이거나 저장이 외부에서 변경되면 덮어쓰지 않고 중단한다. 해당 탭을 닫고 새로고침해서 이어한다.
- 손상·호환 불가 저장은 초기화/삭제하지 않는다. 원본을 보존하고 시작을 막으며 설명한다. 저장 삭제·새 회차 교체 UI는 제공하지 않는다.
- 저장 위치는 현재 브라우저와 출처(origin)에 한정된다. 브라우저 데이터 삭제·다른 브라우저·다른 주소/포트는 별도 저장이다. 계정/클라우드 동기화나 무기한 보존을 보장하지 않는다.

## 구현 경계

`src/storage/browser-store.ts`는 localStorage의 `choice-echoes.save` 한 키에 봉투 전체를 원자 교체한다. Web Locks `choice-echoes.active-player`를 첫 시작/이어하기 때 획득해 문서가 닫히거나 pagehide가 발생할 때까지 유지한다. 획득한 소유자만 저장하며 예상 이전 문자열도 검사한다. 지원하지 않는 브라우저/저장 접근 거부는 오류로 표시하며 조용히 메모리 모드로 바꾸지 않는다. HTTPS 또는 localhost의 최신 브라우저를 전제로 한다.

`src/storage/opening-save.ts`의 현재 형식은 **schemaVersion=5 / kind=hospital-solo / policy=single-slot-v1**이다. origin에 실제 이름·설문 응답ID·초기seed·runId를, checkpoint에 결과/난수/상태/진행/이력을 보관하며 legacy는 진행 중null, 조기 치명 부상 종료 시 실제 기록이다. 규칙 `1.2-stress-1`, 콘텐츠 `hospital-core-stress-2`, 난수 `xorshift32-v1`을 지원한다.

**schemaVersion4 / kind=opening-solo / opening-core-stress-1**도 기존 JSON 규칙 묶음을 보존해 지원한다. 읽기/이어하기만으로 저장을 바꾸지 않고 E04까지 기존 묶음을 유지한다. E04 완료의 **E05 병원으로 이동**에서 이름·상태·이력·난수를 그대로 둔 연결 후보를 생성하고 저장 성공 후에만schema5로 바꾼다. 실패 시 기존 저장은 유지하고 같은 후보로 재시도한다. 다른 구버전·mental 저장을 자동 변환하거나 지원하는 척하지 않는다.

복원은 등록된 설문과 행동으로 전체 짧은 진행을 재현하고 Legacy를 포함한 봉투 전체를 구조 비교한다. 결과·수치·난수·진행번호·알 수 없는 필드가 다르면 거부한다. 결과와 마지막 history의 객체 참조도 재구성한다. 이는 손상/불일치 검출이며 사용자가 일관되게 고친 데이터를 막는 보안 서명은 아니다. E05/E06 추가와 조기 결말은 새schema5로 구분했다. 치명 결과와 Legacy는 같은 키에 함께 저장하며 미도달E07/E10은null이다. 전체 탈출/동료/다음 회차 교체는 후속 범위다.

앱 `createGameClient({store})`는 durable, store 생략은 테스트/내부용 session이다. `App.tsx`는 browser store를 주입한다. UI는 contracts만 사용한다. pending 후보는 영속 쓰기 전에 확정하고 retry-save에 같은 operationId를 요구한다. 저장 중/실패 상태의 일반 명령·미리보기는 거부한다.

## 승인된 스트레스 규칙

`stress = 100 - 기존 mental`. 초기30, 정수0~100, 낮을수록 안정이다. 이전 정신력 효과의 부호를 모두 뒤집고 수치 크기는 유지한다.

| 상황 | 스트레스 효과 |
|---|---|
| E01/E03 위험 실패 | +10 |
| 물자 있는 정비 E04/E11 | −15 |
| 물자 없는 정비 | −5 |
| 단독 추가 휴식 | −10 |
| 동료 양보 코어 계산 | −5 (동료 플레이는 후속) |

스트레스 ≤60은 보정0, 60 초과~80은 −5, 80 초과는 −10. 물리 판정의 스태미나/부상 보정은 그대로 더한다. 스트레스100 자체가 사망을 만들지 않는다. 모든 효과를 합산한 뒤0~100 제한하고 실제 변화만 표시한다. 앞으로 E06/E09/E10/동료 효과를 구현할 때도 원문 mental+n→stress−n, mental−n→stress+n을 적용한다.

공개 UI 계약은 **0.4.0**이다. 0.3.0에서 `StatusViewModel.mental`을 제거하고 `stress`로 바꿨고, 0.4.0에서 극단 안내와 명시적 구간 이동을 추가했다. 화면·예상 효과·결과·fixture·테스트를 함께 갱신했다. 원문 참조와 과거 개발 로그는 출처 보존을 위해 변경하지 않는다.
