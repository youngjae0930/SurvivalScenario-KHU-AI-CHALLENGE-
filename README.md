# 생존 시나리오: 봉쇄 도시 (Vercel 배포 주소: https://choice-echoes.vercel.app/)

## 실행과 검증

의존성이 없는 최초 환경에서는 `npm ci`로 package-lock 기준 설치한다.

```sh
npm run dev
npm run lint
npm run test:run
npm run build
npm run preview
npm run content:check
npm run content:schema
```

React19 · TypeScript7 · Vite8 · Tailwind4 · Vitest5 · Oxlint를 사용한다. 정확한 의존성은 package-lock.json을 따른다.

## 구조

| 경로 | 책임 |
|---|---|
| src/app | 명령·상태 조정·GameClient·화면 모델 변환 |
| src/ui | 화면·컴포넌트·UI 상태·스타일 |
| src/contracts | 앱과 UI의 공개 경계 |
| src/domain / src/engine | 내부 타입/검증 / 순수 게임 규칙 |
| src/storage | 저장·복원·호환 |
| src/content/rules / texts | 수치·조건 / 한국어 이야기·표시 문구 |
| src/content/catalog/packs | 신규 회차의 자동 등록 장소·사건·선택지·스크립트 JSON |
| src/engine/catalog | 콘텐츠 검증·단계별 경로·조건·가중 추첨·진행 |
| src/assets / public | 번들 자산 / URL로 제공할 정적 자산 |
| docs/references | 원문 추출본과 출처 정보 |

예정된 하위 구조와 단계별 완료 기준은 로드맵에 있다. 빈 영역은 실제 기능을 구현하면서 채운다.
