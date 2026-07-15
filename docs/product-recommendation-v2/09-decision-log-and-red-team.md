# 09. 역할별 반박과 결정 기록

## 검토 방식

기획을 한 관점에서 바로 확정하지 않고 네 흐름으로 나눠 병렬 검토했다.

| 역할 | 집중 질문 | 주요 산출 |
| --- | --- | --- |
| UX/Product | 사용자가 검색·AR·시즌·AURADIN을 구분하는가? | IA, AURADIN 위치, 상태·문구·접근성 |
| Mobile/Backend/Data | 현재 코드에서 무엇을 재사용하고 어디서 데이터가 유실되는가? | route/API/AR save/catalog/schema 감사 |
| Security/Privacy/Legal | 실제 상품·얼굴·행동 데이터를 붙였을 때 무엇이 악용·오인되는가? | P0 취약점, 동의·보존, Naver/광고/권리 gate |
| Integration/Red team | 서로의 제안이 충돌하는가? 가장 단순한 반례는 무엇인가? | 단계별 절단면, 승인 묶음, release gate |

아래는 중요한 대안과 반박을 기록한 decision log다. 구현 중 전제가 바뀌면 이 결정을 조용히 뒤집지 말고 문서를 갱신한다.

## D1. 제품 추천 버튼이 AURADIN으로 바로 가도 되는가

**찬성 논리**

- 새롭고 시각적으로 강한 AURADIN을 바로 보여줄 수 있다.
- 기존 홈 변경이 이미 적용돼 있어 개발량이 적다.

**반박**

- 사용자는 `추천 제품`을 눌렀는데 대화 검색 화면을 만나며, AR·시즌·좋아요 목록의 상위 IA가 사라진다.
- exact product search와 conversational discovery가 한 기능으로 오인된다.
- AURADIN 오류가 모든 추천의 오류처럼 보인다.

**결정: 기각.** 홈은 추천 허브로 간다. AURADIN은 허브의 눈에 띄는 보조 진입점이다.

## D2. AURADIN 젤리를 floating button으로 둘 것인가

**찬성 논리**

- 스크롤 어느 지점에서나 보이고 캐릭터성이 강하다.

**반박**

- 자유 이동이면 heart, 제품 상세 CTA, 하단 navigation과 겹칠 수 있다.
- 기존 `PersistentOrb`의 app-wide GL 인스턴스 전제와 충돌한다.
- 반복 animation은 접근성·배터리·프레임 비용이 있고 AR/시즌보다 시선을 빼앗는다.

**결정: 조건부 채택.** AURADIN은 제품 추천 허브를 대체하지 않는 edge-snapped 젤리 orb로 제공한다. 탭은 대화 탐색, 길게 누른 뒤 드래그는 안전 영역 내 위치 이동으로 분리한다. 자유 배치·무한 애니메이션·콘텐츠 위 overlay는 금지한다. 제품 카드와 좋아요를 가리는 문제가 확인되면 고정 위치 또는 compact gateway로 feature flag를 전환한다.

## D3. AR가 덜 완성됐으니 제품 추천 전체를 미룰 것인가

**찬성 논리**

- 핵심 데이터가 없는 상태에서 허브를 만들면 목업이 될 수 있다.

**반박**

- 시즌, exact search, AURADIN 연결, 좋아요 통합은 AR와 독립적이다.
- AR도 empty state와 save contract를 먼저 구현해 올바른 연결 구조를 만들 수 있다.
- 전체를 미루면 현재 AURADIN 직행 IA가 장기간 굳어진다.

**결정: 부분 기각.** 허브·시즌은 먼저, AR 결과 노출은 recipe+shade 근거 완료까지 gate한다.

## D4. AR 저장소로 `user_ar_filter_states`를 확장할 것인가

**찬성 논리**

- 이름이 AR filter state이고 기존 endpoint가 있다.

**반박**

- 현재 구조는 편집 중 selected color/type/texture와 landmark 등 UI/runtime state가 섞여 있다.
- 최종 룩의 부위별 recipe, 제목, thumbnail, archive와 source를 다루기 어렵다.
- `saved_makeup_styles.style_payload`가 이미 최종 저장 룩 domain과 API를 갖는다.

**결정: 최종 recipe에는 기각.** `user_ar_filter_states`는 draft/복구, `saved_makeup_styles`는 canonical saved look으로 역할을 분리한다.

## D5. Naver 상품 검색에 색상 임베딩을 보낼 것인가

**찬성 논리**

- 별도 상품 DB를 구축하지 않고 많은 상품을 찾을 수 있어 보인다.
- 사용자 요구 문구와 직접 맞는다.

**반박**

- Naver 쇼핑 검색 계약은 text query이며 arbitrary color vector 검색이 아니다.
- 제목/카테고리만으로 실제 shade 색을 입증할 수 없다.
- 쇼핑 검색 API 종료일이 2026-07-31로 공지돼 있다.
- 저장·가공·독립 표시·재정렬의 약관 리스크가 있다.

**결정: 기각.** 색상 vector는 자체/제휴 shade catalog에 사용한다. Naver Shopping Insight는 시즌 신호만 담당한다.

## D6. 언어 임베딩 하나로 색상·무드·개인화를 처리할 것인가

**찬성 논리**

- 구현이 단순하고 `여름 웜 글로우` 같은 텍스트 의미를 잘 잡는다.

**반박**

- 의미상 가까운 단어와 지각상 가까운 shade는 다른 문제다.
- 현재 임베딩 입력에 report/skin/profile 텍스트가 들어가 외부 전송 범위가 커진다.
- 점수 설명과 재현이 어려워진다.

**결정: 색상에는 기각.** Lab/ΔE2000을 기본으로 하고 임베딩은 opt-in 문맥/무드의 보조 후보 신호로만 제한한다.

## D7. 99%처럼 높은 match rate를 유지할 것인가

**찬성 논리**

- 카드가 즉시 이해되고 추천 신뢰가 높아 보인다.

**반박**

- 현재 범위 제한 점수는 확률·정확도로 calibration되지 않았다.
- 화면색과 실제 발색 차이가 있어 정밀 숫자가 더 큰 오해를 만든다.

**결정: 기각.** 검증 전 reason chip만 노출한다. 향후 사용자 연구와 calibration이 끝나면 의미가 명시된 범주형 등급부터 검토한다.

## D8. AR 데이터가 없으면 기존 mock 추천을 보여줄 것인가

**찬성 논리**

- 데모가 풍성하고 빈 화면을 피할 수 있다.

**반박**

- 사용자는 자신의 AR 색을 분석한 결과라고 오인한다.
- 실제 API 실패와 추천 성공을 구분할 수 없어 품질/장애 지표가 오염된다.

**결정: production에서 기각.** `AR 룩 만들기` empty state. 내부 fixture는 명시적 QA badge 아래에서만 사용한다.

## D9. 시즌 상품을 완전 자동 생성할 것인가

**찬성 논리**

- 빠르게 바뀌는 trend에 대응하고 운영비를 줄인다.

**반박**

- 상대 클릭 spike, bot/캠페인, 동음이의어, 품절, 광고 관계를 자동으로 판단하기 어렵다.
- 연예인·브랜드 테마는 권리/오인 리스크가 있다.

**결정: 초기에는 기각.** 자동 후보+에디터 검수+유효기간을 사용한다. 품질 자료가 쌓이면 낮은 위험 테마만 자동 publish를 검토한다.

## D10. 사용자 얼굴 톤이 비슷한 사람끼리 추천할 것인가

**찬성 논리**

- 퍼스널 컬러 report를 활용해 공감되는 section을 만들 수 있다.

**반박**

- `얼굴이 비슷한 사람`은 얼굴 비교/생체 분석으로 오인된다.
- 작은 코호트는 재식별과 노이즈 위험이 크다.
- personal color 하나만 같다고 제품 취향이 같지 않다.

**결정: 표현과 데이터 모두 수정.** 얼굴 image/embedding을 쓰지 않고 동의한 broad color preference+행동 집계로 `비슷한 컬러 취향`을 만든다. 모수가 부족하면 숨긴다.

## D11. 기존 추천 API를 버리고 V2 section API만 쓸 것인가

**찬성 논리**

- section별 cache/권한/실패 처리를 처음부터 분리할 수 있다.

**반박**

- 현재 `ProductRecommendationScreen`과 `/api/products/recommendations`가 살아 있고, 홈 진입만 AURADIN으로 바뀐 상태다.
- 기존 보고서 선택, 룩 선택, category tab, sort, product card, likes, purchase link를 버리면 구현량과 회귀 위험이 커진다.
- 사용자도 홈의 `추천 제품` 버튼을 제품 추천 허브로 기대하지, AURADIN 대화형 hero로 바로 들어가는 것을 기대하지 않는다.

**결정: 기각.** P0는 기존 추천 API와 화면을 baseline으로 유지한다. AR/시즌/개인화처럼 cache·권한·실패 경계가 다른 기능은 additive section endpoint로 붙이고, 사용량과 안정성을 본 뒤 legacy payload 축소/분리를 검토한다.

## D12. 좋아요할 때 외부 상품 payload를 함께 저장할 것인가

**찬성 논리**

- 아직 catalog에 없는 검색 결과를 쉽게 likes에 넣을 수 있다.

**반박**

- 인증 사용자가 공용 URL/상품 정보를 덮어쓸 수 있는 catalog poisoning 경로다.
- source/license/신뢰 경계가 클라이언트로 이동한다.

**결정: 즉시 기각.** internal UUID 또는 server-signed reference만 허용한다.

## D13. 개인화 이벤트를 기본으로 켤 것인가

**찬성 논리**

- cold start 기간을 줄이고 추천 개선 데이터가 빨리 쌓인다.

**반박**

- 사용자는 AR 색상 매칭을 위해 행동 추적까지 필수라고 예상하지 않을 수 있다.
- search query와 클릭은 취향·관심을 세밀하게 드러낸다.
- 동의 품질이 낮으면 장기적으로 신뢰와 법적 안정성이 떨어진다.

**결정: 기각.** AR 명시 요청과 public 시즌은 추적 개인화 없이 제공하고, engagement/cohort는 목적별 opt-in으로 둔다.

## D14. 기존 1개 대형 screen을 직접 수정할 것인가

**찬성 논리**

- 파일 이동 없이 빠르게 시각 변경 가능하다.

**반박**

- 현재 screen은 이미 매우 크고 data/state/UI가 결합돼 있다.
- section별 부분 실패, 접근성, analytics, test를 추가하면 회귀 범위가 폭증한다.

**결정: 점진 분해.** 외부 route/screen export는 유지하고 section/component/hook/service를 먼저 추출한다. 무관한 전면 refactor는 하지 않는다.

## D15. 연예인 trend를 시즌 카드 전면에 쓸 것인가

**찬성 논리**

- 인지도가 높고 즉시 눈에 띈다.

**반박**

- 성명·초상·콘텐츠·보증 관계 오인과 광고 disclosure 문제가 있다.
- 라이선스가 없으면 출시 직전 전체 캠페인을 내릴 수 있다.

**결정: 권리 확보 전 기각.** 일반 trend theme로 시작하고, 연예인 콘텐츠는 계약·표시가 확인된 별도 캠페인으로만 운영한다.

## 최종 교차검토에서 보강한 결정

### D16. `colorHex`를 사용자가 본 최종 색으로 볼 것인가

**반박:** 기존 recipe v2의 color는 shader 입력색이며 피부 pixel, opacity, intensity, blend mode 뒤의 합성 결과가 아니다.  
**결정:** P0는 `authoring_color_v1`로 명시하고 `선택한 AR 색과 가까워요`라고 쓴다. 기존 recipe v2를 `saved_ar_look_v1`이 감싸며 raw region/finish를 보존한다. 예측 합성색은 별도 version과 검증 없이는 사용하지 않는다.

### D17. 여러 부위 상품을 한 rail에 섞을 것인가

**반박:** 립, 블러셔, 아이라이너는 category와 색상 근거가 달라 한 순위로 읽을 수 없다.  
**결정:** API는 region `groups`를 반환하고 UI는 `립/블러셔/아이라이너` chip으로 rail을 전환한다. 기본은 활성 lip, 없으면 첫 ready group이다.

### D18. 추천 shade와 heart 식별자를 같게 할 것인가

**반박:** 색상 추천은 shade 단위지만 사용자 요구는 `좋아요한 제품`이며 기존 관계도 product 단위다.  
**결정:** heart는 product family 단위로 유지하고 추천 shade는 표시·optional source context로만 보존한다. shade 즐겨찾기는 별도 요구가 생길 때 새 모델로 추가한다.

### D19. 얼굴 preview를 저장 룩 thumbnail로 자동 보관할 것인가

**반박:** 얼굴 crop도 개인정보이며 raw frame 즉시 폐기 원칙과 충돌한다.  
**결정:** 저장 직후 화면은 on-device 세션 preview를 일시 표시할 수 있지만 기본 서버 thumbnail은 비얼굴 swatch mosaic다. 얼굴 thumbnail은 별도 opt-in/private media/delete lifecycle 전에는 저장하지 않는다.

### D20. 시즌 publish를 개발자 seed 한 번으로 운영할 것인가

**반박:** trend source, 권리 만료, 광고 표시, 품절을 검수·중지할 주체가 없으면 자동 만료가 작동해도 사고를 막기 어렵다.  
**결정:** production은 editor와 publisher를 분리하고 immutable revision, audit log, 즉시 suspend를 둔다. 내부 demo seed 권한과 production publish 권한도 분리한다.

## 남아 있는 조직 의사결정

기술로 대신 결정할 수 없는 항목이다.

- 실제 product/shade catalog 제공자와 라이선스
- Naver에 받을 서면 확인의 담당자
- 개인정보 동의·보존기간과 미성년자 정책
- 시즌 editor/product expert
- affiliate·sponsored 정책
- staging/production migration과 release owner
- 현재 iOS/Unity 수정 담당자와 병합 순서

기본 권고안은 [06. 구현 로드맵과 사전 승인](06-implementation-roadmap-and-approvals.md)에 정리돼 있다.
