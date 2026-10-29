from pathlib import Path
import json
r=Path(__file__).resolve().parents[1];base=r/'src/content/catalog/packs/opening'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
compact=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
main=['# 생존 시나리오 수정 대본','','catalog-dialogue-1 · 현재 JSON에서 추출한 사건·선택·효과 검토본. 성향별 결과와 추천·이별·재회 대사는 [동료 대사 검토본](동료대사_검토본.md)에 수록했다.','','확률은 기본값이며 최종 성공률은 기존 성향·상태 계산을 따른다. 동료 반응이 있는 결과도 게임에서는 완성된 본문 하나를 선택한다.']
dialogues=['# 동료 대사 검토본','','catalog-dialogue-1 · 실제 JSON 문구와 조건. 성향 변형은 사건별로 관련 축을 사용한다. 모든 축 조합에 고유 대사를 만든 것은 아니다. 기본/성향별 반응은 실제로 하나만 표시한다.','','조건 표기는 원본 JSON을 짧게 표시했다. 50은 기본 동행 문구, 0~49/51~100은 축별 변형이다. 각 결과 항목은 게임에서 표시하는 전체 본문이다.']
names={'scene':'상황','success':'확정·성공 결과','failure':'실패 결과','opinion':'추천 의견','hesitation':'망설임','departure-warning':'이별 예고','departure':'이별','absent':'부재','reunion':'재회'}
for ep in sorted((base/'events').glob('*.json')):
 e=read(ep);scripts=read(base/'scripts'/ep.name)
 main+=['',f"## {e['id']} {e['title']}"]
 dialogues+=['',f"## {e['id']} {e['title']}"]
 for s in scripts:
  if s['slot']=='scene':main+=['',f"### 상황 · {s['id']}",'',*s['text']]
 for g in e['groups']:
  main+=['',f"### 선택 묶음 {g['id']}",'',f"조건: `{compact(g['conditions'])}`"]
  for c in g['choices']:
   main+=['',f"#### {c['label']} · {c['id']}",'',c['intention'],'']
   b=c['behavior']
   if b['kind']=='action':
    for v in b['variants']:
     a=v['action'];cost=a['costs'];check=a['check']
     main += [f"- 소모: 스태미나 {cost['stamina']}, 물자 {cost['supply']}, 치료 도구 {cost['medkit']}",'- 판정: '+('확정' if check is None else compact(check)),f"- 성향 변화: `{compact(a['traitDelta'])}`",f"- 성공 효과: `{compact(a['successEffects'])}`",f"- 실패 효과: `{compact(a['failureEffects'])}`"]
   else:main += [f"- 기존 {b['kind']} 규칙: `{compact(b)}`"]
   for s in scripts:
    if s['choiceId']==c['id'] and s['slot'] in ['success','failure'] and s['conditions']==[]:
     main+=['',f"**{names[s['slot']]}**",'',*s['text']]
 for s in scripts:
  if s['slot']=='scene' or (s['slot'] in ['success','failure'] and not s['conditions']):continue
  dialogues+=['',f"### {names[s['slot']]} · {s['id']}",'',f"조건: `{compact(s['conditions'])}` · 우선순위 {s['priority']}",'',*s['text']]
(r/'docs/수정대본_검토본.md').write_text('\n'.join(main)+'\n',encoding='utf-8')
(r/'docs/동료대사_검토본.md').write_text('\n'.join(dialogues)+'\n',encoding='utf-8')
p=r/'docs/narrative-review.md';s=p.read_text(encoding='utf-8').replace('전체 자동 검사 556개','전체 자동 검사 563개');s=s.replace('실제 브라우저: 새 단독 12사건 탈출, 동행 회차의 이견·격리 구역 이별·집결지 재회 확인.','실제 브라우저: 새 버전 단독 12사건 탈출과 다음 회차의 JSON 동료 의견·결과 표시 확인. 이별·부재·재회는 새 버전 자동 실행·저장 복원 검사로 확인했고, 이전 수정본에서는 화면도 확인했다.');p.write_text(s,encoding='utf-8')
