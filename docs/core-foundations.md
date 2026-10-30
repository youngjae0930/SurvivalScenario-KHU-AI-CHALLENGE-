# 순수 코어 기초 사용법

> 2026-10-29 최신 기준: 정신력은 스트레스로 반전(stress=100−mental, 초기30). 현재 UI 계약0.3.0, 규칙1.2-stress-1, 콘텐츠opening-core-stress-1이며 자동 저장·이어하기를 지원한다. 상세는 `persistence.md`와 `ui-integration.md`. 아래 구현 단계 설명의 미연결/미저장 언급은 당시 상태다.

기준: 기획안 v1.2 §§4~7·13, 기술 설계 검토 초안 v0.2 §2.4. 내부 통합 진입점은 `src/engine/index.ts`다. UI는 `src/contracts`만 사용한다. 이 기초 단계는 계약0.1.0에서 작성되었으며 현재 세션 앱/UI는0.2.0을 사용한다. 최신 연결은 `ui-integration.md`를 따른다.

| API | 역할 |
|---|---|
| createInitialCoreState(name, answers) | 검증된 설문 매핑에서 초기 주인공·물자·플래그 생성 |
| calculateInitialTraits(answers) | 고유6문항·축당2개·각±10 검사 후 30/50/70 계산 |
| classifyTrait(value) | 0~100 정수의 일반/경고/극단 band. 최초 알림 정책은 포함하지 않음 |
| getTriggeredExtreme(eventId, traits, access) | 현재 사건의 지정 축·극 하나만 반환. E07 외곽은 미발동 |
| previewCheck(input) | 선택 전 상태와 명시 판정 데이터에서 최종 P와 원인별 보정 계산. 확정은 check=null |
| resolveCheck(input, rngState) | 동일 미리보기 계산 후 위험 판정만 난수1회. 입력 변경/비용 소모/기록/저장은 하지 않음 |
| initializeRandom(seed) / drawRandom(state) | unsigned32 초기화/다음 상태·[0,1) 난수 반환 |
| validateCoreState(unknown) | domain/validation의 런타임 경계. 손상 수치를 clamp하지 않고 오류 반환 |

모든 실패 가능 API는 `{ok:true,value}` 또는 `{ok:false,error:{code,message}}`를 반환한다. 코어 오류는 앱이 UI ContractError로 매핑할 사항이다. 수학 보조 함수 `roundHalfAwayFromZero`는 유한한 내부 계산값용이며 입력 경계는 previewCheck가 검증한다.

## 입력의 책임

CoreState는 아직 최종 RunState가 아니다. companion·phase·history·계승·저장 봉투를 포함하지 않는다. 타입은 readonly이고 함수는 원본을 변경하지 않는다. 초기 상태를 만들었다고 회차를 저장/확정한 것은 아니다.

설문 입력 ResolvedQuestionnaireAnswer는 questionId/axis/delta다. **UI가 보낸 숫자를 직접 신뢰하지 않는다.** 앱이 콘텐츠의 질문/답 ID를 검증하고 해당 축·±10으로 매핑해야 한다. 문구·답ID 매핑은 이번에 생성하지 않았다.

CheckInput은 state/eventId/check/cooperating을 요구한다. check는 base/traitWeights/physical/weaponBonus가 모두 명시되어야 한다. 1~2개 고유 축, 양의 가중치 합1을 검증한다(합산 오차 허용1e-10). 기본 base70/60/75의 행동별 선택은 향후 콘텐츠 책임이며 이 모듈은 누락값을 채우지 않는다. E12에 위험 check를 전달하면 오류다.

cooperating은 이미 결정된 참여 여부다. 이 모듈은 신뢰 임계값·추천·파견 여부를 결정하지 않는다. E07 access=true 위험 판정에만 +5. D04의 누락된 E07 극단 필드는 어떤 값도 생성하지 않았다.

계산은 선택 가능성 검사가 아니다. requires/비용/phase/중복 실행·치명 종료 여부는 이후 사건 해결기에서 검증해야 한다. E12 check=null은 난수 미소비 계약만 표현하며 경로 성공을 의미하지 않는다. resolveCheck의 반환은 판정 결과이지 완성된 행동 결과/다음 저장 객체가 아니다.

## 재현성

xorshift32-v1, shift13/17/5, 출력 nextState/2^32. initializeRandom(0)은 0x6d2b79f5를 반환한다. 다른 범위 밖 입력은 오류. drawRandom/resolveCheck에 진행 중0을 주면 손상으로 거부하며 임의 복구하지 않는다. seed1의 첫 상태는 270369, 67634689, 2647435461, 307599695, 2398689233이다.

미리보기는 난수 입력 자체가 없고, 확정 판정은 PRNG 위치를 유지한다. 같은 전체 입력·초기상태·선택열에서 같은 결과다. 앱은 향후 회차 생성 시 초기 seed와 현재 위치를 구분하고 pending 저장 성공 뒤 상태를 확정해야 한다. 저장 스키마/버전 정책 자체는 이번에 확정하지 않았다.

## 남은 작업

현재 제품 화면은 환경 확인용이다. 후속 단계에서 단일 행동의 비용/효과·결과 단계 전환, 회복·치료, E12 탈출 규칙을 추가했다(`action-resolution.md` 참조). 12개 사건의 전체 진행, 동료 판단(D01/D02), 약속·파견(D03), 최종 E07 데이터(D04), 저장(D07), 실제 GameClient 연결은 남아 있다. 코어 계산 검증이 전체 게임 인수 테스트 통과를 의미하지 않는다.
