# JSON 동료 대사 작성 가이드

현재 신규 팩은 `stage19/catalog-story-1`, `manifest.dialogueVersion="scripts-1"`이다. 새 팩은 `src/content/catalog/packs/stage19/scripts/`와 `events/`를 편집한다. 공간·슬롯 연결은 [19스테이지 작성 지침](stage19-progression.md)을 따른다. 아래12사건 파일 경로는 기존 팩 참조용이다. 기존 팩 대사는 `src/content/catalog/packs/opening/scripts/E01.json`부터 `E12.json`에 작성한다. 선택 설명과 비용·효과는 같은 팩의 `events/E01.json`부터 `E12.json`에 둔다. 내용 작성 때문에 엔진이나 화면 코드를 수정하지 않는다.

## 기존 방식으로 유지하는 부분

`scene`은 사건 본문이다. `success`/`failure`는 실제 효과 적용 후 상태로 선택하는 완성된 결과 본문이다. 동료 반응도 이 본문에 포함한다. 기본 결과 뒤에 무조건 반응을 붙이지 않는다. contextual-1의 책임 반응과 감염 결말 보충은 아래의 실제 발생 조건을 만족할 때만 별도 조회한다. 다친 결과에 성공 축하가 붙거나 부재 중인 동료가 말하지 않도록 본문 전체를 검수한다.

성향별 결과는 기존 `conditions`로 작성한다. 예를 들어 동료 `affect` 0~49/50/51~100의 반응을 달리할 수 있다. 이 경계는 표현 구분이며 게임의 극단 성향 판정 기준을 바꾸지 않는다. 한 장면에서 의미 있는 축을 먼저 사용한다. 여러 축을 함께 쓸 때는 조건 겹침과 priority를 직접 검토한다. 27가지 조합을 의무적으로 복제하지 않는다.

기본 scene/success/failure 문구는 `conditions=[]`, `once=false`로 남긴다. 동료용 변형에는 `present=true`를 붙이고 더 높은 priority를 준다. 이 세 슬롯의 기존 가중 추첨·선택 ID 저장 방식은 유지한다.

## 추가한 표시 채널

|slot|choiceId|표시되는 실제 상황|
|---|---|---|
|opinion|원본 선택 ID|현재 동료가 실제로 추천한 선택|
|hesitation|null|일반 추천을 보류하고 다른 우선 의견도 없을 때|
|departure-warning|원본 선택 ID|그 선택을 직접 실행하면 이별하게 되는 미리보기|
|departure|원본 선택 ID|실제로 이별한 선택 결과|
|absent|null|이별 후 동료가 부재한 장면|
|reunion|null|기존 재회 규칙으로 다시 만난 장소|
|recommendation-failure|원본 선택 ID|실제 추천을 따라 실행한 행동이 실패하고 새 부상이 생긴 결과|
|infection-ending|원본 선택 ID|해당 행동으로 실제 주인공 감염 사망이 발생한 결말|

이 채널은 추천 대상을 고르거나 이별을 발생시키지 않는다. 기존 판정이 먼저 일어나고 문구만 조회한다. 예를 들어 `departure` JSON을 추가했다고 동료가 떠나지 않는다. 신뢰·성공률·자원·난수도 변경하지 않는다.

표시 채널은 최고 priority 중 ID 오름차순으로 하나를 선택한다. `weight=1`, `once=false`만 허용한다. 난수를 소비하지 않으며 화면 갱신 때 같은 상태면 같은 문구가 나온다. 저장 복원은 저장에 포함된 팩으로 처리한다. 기존 저장의 문구를 최신 팩으로 덮어쓰지 않는다.

각 선택에는 동행 조건 하나만 가진 기본 opinion을 반드시 둔다. 성향 변형의 조건이 맞지 않을 때도 의견을 표현하기 위해서다. opinion/hesitation/이별/재회에는 명시적인 `companion present=true`, absent에는 `present=false`가 필요하다. 이별 슬롯은 autonomy 정책이 있는 사건에서만 사용할 수 있다. recommendation-failure와 infection-ending은 manifest.reactionVersion=contextual-1에서만 사용한다. 책임 반응에는 present=true가 필요하며 이별·치명 부상·감염 사망 때는 붙이지 않는다. 성공이나 신뢰 감소만으로 사과하지 않는다. infection-ending은 단독 플레이에도 사용할 수 있어 동행 조건이 필수가 아니다. 연구 기록·시료를 언급하려면 실제 fact 조건을 붙인다. 기존 responsibility-1 저장은 이전 표시 방식을 보존한다. 추가 조건·우선순위·참조 오류는 콘텐츠 검사가 확인한다. 실제 서사의 개연성은 별도로 읽고 검수한다.

## 의견 변형 예시

다음은 E01.safe에 추가하는 변형 한 개다. 기존 기본 opinion과 함께 둔다.

```json
{
  "id": "E01.dialogue.opinion.safe.cautious-example",
  "eventId": "E01",
  "choiceId": "E01.safe",
  "slot": "opinion",
  "conditions": [
    { "kind": "companion", "present": true },
    { "kind": "number", "subject": "companion", "stat": "risk", "min": 51, "max": 100 }
  ],
  "priority": 20,
  "weight": 1,
  "once": false,
  "text": ["“큰길로 가자. 담장 너머는 안 보이잖아. 천천히 돌아가도 괜찮아.”"]
}
```

이 문구는 E01.safe가 실제 추천일 때만 표시된다. JSON에 다른 선택의 대사를 적어서 추천 결과를 바꿀 수 없다. 중립값 50은 동행 기본 문구로 돌아간다. 현재 콘텐츠는 사건별로 모험–안정, 분석–직관, 이성–감정 중 관련된 축을 사용한다.

## 서술 기준과 검증

주인공의 생각은 `‘남쪽까지 가야 하는데.’`, 소리 내는 말은 `“안에 누구 있어요?”`로 구분한다. 사건 설명을 모두 대화로 바꾸지 않는다. 행동 이유나 망설임이 드러나는 지점에 짧게 넣는다. 변수는 `{{protagonist.name}}`, `{{companion.name}}`, `{{location.name}}`만 허용하며 동료 이름에는 동행 조건이 필요하다.

결과 문구는 실제 얻은 물품·부상·탈출 여부와 맞아야 한다. 재회 대사에서 구현하지 않은 구조 성공이나 신뢰 보상을 만들어내지 않는다. 치명 부상에서는 다음 장소에 도착하거나 탈출했다고 쓰지 않는다. 신뢰 변화 수치는 기존 결과 영역에서 확인하며 사람의 말에 계산 근거를 그대로 옮기지 않는다.

검증 순서는 `npm run content:schema`, `npm run content:check`, `npm run test:run`, `npm run build`다. 이후 실제 화면에서 단독/동행, 성향 변형, 이별·부재·재회를 확인한다. 자동 검사가 문학적 완성도나 모든 문장의 개연성을 보장하지는 않는다.

`src/content/texts/companion-narrative.ts`는 직전 `catalog-narrative-1` 저장의 표시를 보존하기 위한 파일이다. 신규 대사는 이 파일에 추가하지 않는다. 구 저장 복원용 fixture도 수정하지 않는다.

## 고정 사건과 무작위 후보의 연결

무작위 직전 장소를 방문했다고 가정하지 않는다. 고정 사건은 현재 장소와 목적만으로 읽혀야 한다. 특정 장소를 회상하려면 visited 조건, 조사 결과·획득물을 언급하려면 fact 조건을 사용한다. 단순 방문을 조사 성공으로 간주하지 않는다. 재회 문구는 부재 중 구조 성공이나 물자 획득을 만들어 내지 않는다. 현재 결과에 필요한 성향 축 하나부터 구분하고 50은 기본 반응으로 둔다.
