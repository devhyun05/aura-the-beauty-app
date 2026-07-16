저장소는 수정하지 않고 CodeGraph, 원문 소스, 618행 카탈로그 및 현재 벡터 인덱스를 대조했다. 큰 결론은 다음과 같다.

- 두 추천 시스템이 공존한다는 판단은 맞다.
- 다만 홈의 제품 추천 액션은 현재 `AuradinSearch`로 연결되고, 레거시는 다른 진입점·분석 연속 흐름에 남아 있다. [homeRoutes.tsx:210-222](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/app/navigation/routes/homeRoutes.tsx:210), [MainTabNavigator.tsx:170-182](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/app/navigation/MainTabNavigator.tsx:170)
- 첨부 문서는 레거시 점수 공식과 신규 Question/MMR 설계를 한 엔진의 “현재 구현”처럼 접합한 문서다.

## A. 프로브 판정

### A1. rule/liveOffer 축은 랭킹셋 내 상수다

판정: **동의. 단, “파이프라인 기여가 0”이 아니라 “필터 적용 후 순서 기여가 0”이다.**

- 생성되는 hard filter는 먼저 후보를 제거한다. `mode=="soft"`는 건너뛰고 나머지를 모두 사전 적용한다. [retrieval_service.py:42-75](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:42)
- 질문의 soft 답변은 `hard_filters`에 들어갔다가 skip되는 구조가 아니라 `split_answer_deltas`에서 아예 `soft_preferences`로 분리된다. [retrieval_service.py:103-122](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:103)
- 프롬프트와 질문 엔진이 실제 생성하는 hard op는 `eq/lte`뿐이다. [intent_parser.py:84-97](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/intent_parser.py:84), [question_engine.py:230-239](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:230)
- 따라서 정상 서빙 경로에서 살아남은 후보는 `_rule_score`의 모든 hard filter를 만족해 전원 1.0이다. 필터가 없으면 전원 0.55다. [ranking.py:177-204](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:177)
- 카탈로그 로더가 price/image/purchase URL이 모두 있는 상품만 보존하고, `_live_offer_score`도 같은 3요소만 보므로 전원 1.0이다. [catalog_loader.py:68-80](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/catalog_loader.py:68), [ranking.py:138-147](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:138)

재현 결과도 `"립 추천해줘"` 117건에서 `rule={1.0}`, `liveOffer={1.0}`이었다. 즉 `rule 0.40 + liveOffer 0.10`은 순서에는 기여하지 않고 matchRate에 고정 오프셋을 준다.

반례는 API 서빙 경로에는 없다. 다만 내부 함수에 알 수 없는 op를 직접 주입하면 `matches_filter`는 통과시키면서 `_rule_score`는 값 일치를 점수화할 수 있어 변별력이 생긴다. 이는 malformed/direct-call 상태이지 현재 API가 생성하는 상태는 아니다. [retrieval_service.py:61-66](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:61)

### A2. 리포트 톤 넛지가 지배 신호가 된다

판정: **동의. 품질 유해 판단도 타당하다. 단, 수치 표현은 수정이 필요하다.**

- 보고서 선호는 `weight=0.5`, `confidence=0.55` 한 개다. [report_profile.py:35-51](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/report_profile.py:35)
- `_preference_score`는 confidence와 `hardFilterEligible`을 전혀 보지 않고 `matched_weight / total_weight`만 계산한다. 단일 선호에서는 0.5가 완전히 소거된다. [ranking.py:150-174](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:150)
- 정확한 점수 해석은 “매치와 비매치의 pairwise 차이가 0.22”다. 선호 없음의 중립값 0.5와 비교하면 매치 +0.11, 비매치 -0.11이지 각각 ±0.22는 아니다.
- 프롬프트 선호가 함께 있으면 보고서 weight는 소거되지 않고 상대 비중으로 작동한다. 따라서 지배 현상은 특히 `"립 추천해줘" + 보고서 한 개` 같은 경우에 강하다.

현재 데이터 전수 집계:

- 전체 undertone 보유 95/618 = 15.4%
- 립은 9/117
- 립 warm은 단 2개이며 둘 다 `hardFilterEligible.undertone=false`, confidence 0.62다. [catalog line 451](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260708.jsonl:451), [catalog line 508](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260708.jsonl:508)

특히 “undertone 없음”과 “명시적 반대 톤”을 둘 다 0점으로 취급한다. 즉 108개의 undertone 미상 립이 7개의 cool 립과 똑같이 패널티를 받는다. caveat가 표시되더라도 이미 순위와 83% 대 62% matchRate 차이는 만들어진 뒤다. 따라서 “soft이고 제거하지 않으니 무해하다”는 반론은 약하다.

### A3. floor 게이트의 semantic 팔은 죽어 있다

판정: **현재 스냅샷에는 동의, 엔진 일반 명제로는 반박.**

- 현재 인덱스 메타데이터는 `modelId=hash-fallback`, dimension 1024다. [vector index:1](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260708.json:1)
- floor는 semantic 0.5 이상 또는 preference 매치 또는 evidence 0.45 이상을 요구한다. [ranking.py:254-266](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:254)
- 재현값은 broad 립 semantic max 0.1307, 봄웜 결합 시 0.1426이고 semantic 통과는 0건, evidence 통과는 110/117이었다. 현재 스냅샷의 정상 질의에서는 사실상 evidence 게이트라는 분석이 맞다.
- 다만 코드상 hash cosine에 0.5 상한은 없다. 다른 질의나 실제 Bedrock 인덱스는 0.5 이상이 가능하고, 엔진은 Bedrock 인덱스를 지원한다. [retrieval_service.py:187-213](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:187)

더 위험한 반례가 있다. semantic 검색이 실패해 빈 dict가 반환되면 모든 후보의 semanticScore를 0.5로 설정한다. 그러면 semantic floor가 전 후보에게 열린다. [retrieval_service.py:227-234](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:227), [ranking.py:214-220](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:214)

따라서 semantic 팔은 현재 데이터에서는 죽었지만, 실패 시에는 오히려 **fail-open**이다.

### A4. 동점 타이브레이크가 brandName 내림차순이다

판정: **동의.**

최종 정렬이 `(row["score"], brandName)`에 `reverse=True`이므로 동일 점수에서 브랜드 문자열 Unicode 역순이다. 한국어 사전순이 아니라 코드포인트 기준이며, 한글 브랜드가 ASCII 브랜드보다 우선되는 부작용도 있다. [ranking.py:245](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:245)

보강하면, final score를 먼저 소수점 6자리로 반올림한 뒤 정렬하므로 원래 미세하게 달랐던 점수도 인위적으로 동점이 된다. [ranking.py:223-245](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:223)

### A5. `_build_result`의 사후 드랍

판정: **코드 위치에는 동의, live Naver 발동 가능성은 반박.**

- 실제로 floor/MMR/역할 배치 후 price/image/purchase URL을 다시 검사한다. [session_manager.py:189-207](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:189)
- 그러나 serving catalog는 로드 시 이미 동일 조건으로 필터링되며 현재 618개 전부 purchasable이다. [catalog_loader.py:68-80](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/catalog_loader.py:68)
- live Naver 상품은 `_build_result`를 거치지 않고 이후 enrichment에서 추가된다. 또한 `build_mvp_catalog_item`이 동일한 3조건을 만족하지 못하면 `None`을 반환한다. [knowledge_chunk_builder.py:159-170](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/knowledge_chunk_builder.py:159), [enrichment.py:856-860](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:856)

따라서 현행 curated/live 서빙 경로에서 이 사후 필터 때문에 3개 미만이 되는 경우는 사실상 없다. 3개 미만은 floor 자체가 1~2개만 남겼거나 malformed catalog를 직접 주입했을 때 가능하다.

## B. 첨부 문서 판정

### B1. 레거시 수치를 신규 Auradin으로 오인했다

판정: **동의.**

첨부의 74 베이스, +12/+4/+4/+3/+7, -8, -12, index penalty, 62~99는 레거시 구현과 일치한다. [검토.md:30-40](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_알고리즘_검토.md:30>), [shopping_products.py:690-739](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:690)

65/35 Titan 결합과 `_color_match_adjustment`도 레거시다. [shopping_products.py:23-26](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:23), [shopping_products.py:881-887](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:881), [shopping_products.py:1002-1077](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:1002)

신규는 `/search/sessions`와 0.40/0.08/0.22/0.20/0.10 가중합이다. [search_sessions.py:23-41](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/api/search_sessions.py:23), [ranking.py:58-67](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:58)

첨부 §14와 §19가 “현재 구현은 Naver/GET products 중심”이라고 한 것도 이미 신규 세션 API가 구현된 현 저장소와 맞지 않는다. [검토.md:447-469](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_알고리즘_검토.md:447>), [검토.md:580-609](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_알고리즘_검토.md:580>)

### B2. 색상 이중 가산 지적

판정: **동의. 오히려 문서보다 더 심하다.**

레거시에서 색상은 다음 경로로 중복된다.

1. 일반 field 매치로 개당 +12, 최대 +36.
2. 같은 `_score_product_match` 안에서 다시 `COLOR_MATCH_BONUS=+10` 또는 -12.
3. semantic 65/35 결합 후 `_color_match_adjustment`로 다시 +10/-12.
4. profile/product embedding text에서도 색상 문자열을 각각 세 번 반복한다.

근거: [shopping_products.py:703-735](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:703), [shopping_products.py:972-990](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:972), [shopping_products.py:890-952](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:890)

따라서 “두 단계에서 색상을 본다”보다 정확한 평가는 “rule 내부 두 번 + final adjustment + semantic 입력 강조”다. 색상 지배를 문서가 오히려 덜 비판했다.

### B3. Question Engine §7~§10

판정: **‘대체로 일치’에는 동의하지만, 제시한 불일치 사유 일부는 반박.**

첨부는 실제로 actionability를 포함한 gain 공식을 명시한다. 코드도 `entropy × coverage × confidence × priority × actionability`이며 hard=1.0, soft=0.62다. [검토.md:175-200](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_알고리즘_검토.md:175>), [question_engine.py:188-196](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:188)

또 첨부에는 질문 3개 제한과 0.1/0.18 threshold가 이미 정확히 적혀 있고 코드도 같다. [검토.md:309-315](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_알고리즘_검토.md:309>), [question_engine.py:340-361](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:340)

실제 불일치는 다음이다.

- 첨부는 후보 3개 이하 종료를 주장하지만 코드에는 그 조건이 없다.
- score-gap 종료는 아무 질의에나 적용되지 않고 category/price/channel hard lock이 있어야 한다.
- 질문 분포와 `expectedCandidateCount`는 전체 후보가 아니라 상위 40개만 본다. [question_engine.py:158-159](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:158), [question_engine.py:248-305](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:248)
- entropy는 raw entropy지만 첨부도 normalized entropy라고 주장하지는 않으므로 이것은 문서-코드 불일치가 아니다.

### B4. ProductInteractionEvent/SearchRefinementEvent 로깅

판정: **핵심 동의, “로깅이 전혀 없다”는 표현은 일부 과함.**

두 타입과 repository 메서드는 계획 문서에만 있다. [RAG plan:418-465](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/COSMETIC_RECOMMENDATION_RAG_SHOPPING_PLAN_KO.md:418), [RAG plan:680-695](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/COSMETIC_RECOMMENDATION_RAG_SHOPPING_PLAN_KO.md:680)

실제 Auradin API에는 create/get/answer/cancel/refine만 있고 interaction endpoint가 없다. [search_sessions.py:23-165](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/api/search_sessions.py:23)

다만 refine/질문 결정 로그는 세션의 `logs` 배열에 쌓이고 Postgres JSON state에 같이 저장된다. 이는 LTR용 정규화 이벤트는 아니지만 “아무 로그도 없음”은 아니다. [session_manager.py:544-555](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:544), [session_manager.py:664-679](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:664)

Auradin 모바일의 상세 열기와 저장은 현재 로컬 React state만 바꾸므로 서버 행동 데이터가 아니다. [AuradinSearchScreen.tsx:227-237](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx:227)

### B5. 신규는 hash-fallback 인덱스다

판정: **현재 배포 스냅샷에는 동의, 엔진 기능 범위로는 부분동의.**

- 현재 기본 인덱스는 확실히 hash-fallback이고 semantic weight는 0.08이다. [vector index:1](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260708.json:1), [ranking.py:61-67](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:61)
- 그러나 코드 자체는 hash 전용이 아니다. 메타데이터가 실제 모델과 맞으면 Bedrock client로 파일 인덱스를 검색하며, 설정에 따라 runtime autobuild도 가능하다. lexical fallback도 있다. [retrieval_service.py:187-234](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:187)

## C. 추가 발견

### C1. undertone 데이터가 브랜드명으로 오염된다

판정: **확정, 매우 심각.**

`_residual_text`는 브랜드와 상품명을 제거하지만, 바로 다음 줄에서 `searchable`에 원본 title 전체를 다시 붙인다. 이후 단순 substring으로 키워드를 찾는다. [title_keyword_extractor.py:104-125](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/title_keyword_extractor.py:104), [title_keyword_extractor.py:129-147](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/title_keyword_extractor.py:129)

그 결과 `투쿨포스쿨`의 브랜드명 `쿨`이 undertone=cool로 추론된다. 실제 카탈로그 항목에도 `matchedToken="쿨"`과 undertone=cool이 들어 있다. [catalog line 504](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260708.jsonl:504)

전수 집계 결과:

- cool 59개 중 42개가 투쿨포스쿨
- 립 cool 7개 중 6개가 투쿨포스쿨

A2의 보고서 넛지와 결합하면 여름쿨 리포트가 “쿨톤 제품”보다 특정 브랜드를 강하게 밀어 올린다.

### C2. 질문의 hard filter가 `hardFilterEligible`을 무시한다

판정: **확정.**

질문 엔진은 상위 후보의 hard-eligible 비율이 45% 이상이면 속성 전체를 hard question으로 승격한다. [question_engine.py:173-189](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:173)

그러나 실제 필터링은 각 상품의 `hardFilterEligible`을 확인하지 않고 속성값만 비교한다. [retrieval_service.py:22-66](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:22)

현재 립 glossy 45개 중 27개가 `hardFilterEligible.finish=false`다. 사용자가 질문에서 glossy를 고르면 이 27개도 hard 조건 충족 상품으로 남는다. live Naver 항목은 모든 추론 속성을 명시적으로 false로 표시하지만 live `_eligible`도 동일한 `matches_filter`만 호출한다. [enrichment.py:690-717](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:690), [enrichment.py:746-757](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:746)

즉 “soft-only metadata는 hard filter에 쓰지 않는다”는 계약이 실제 데이터 경로에서 깨진다.

### C3. intent parser가 부정과 가격 비교 방향을 뒤집는다

판정: **확정.**

가격 regex의 `이하|미만|under` 부분이 optional이라 숫자+`만`만 매치하면 무조건 `lte`를 생성한다. [intent_parser.py:127-141](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/intent_parser.py:127)

재현:

- `"2만원 이상 립"` → `priceKrw <= 20,000`
- `"1만원대 립"` → `priceKrw <= 10,000`
- `"립 말고 블러셔"` → 고정 순서에서 먼저 발견한 lip hard lock
- `"매트는 싫고 글로시"` → glossy와 matte를 둘 다 positive preference로 생성

원인은 단순 substring 카테고리 탐색과 부정 문맥 없는 soft-term 수집이다. [intent_parser.py:79-81](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/intent_parser.py:79), [intent_parser.py:113-117](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/intent_parser.py:113), [intent_parser.py:144-147](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/intent_parser.py:144)

### C4. semantic 검색 실패가 floor를 전부 개방한다

판정: **확정.**

embedding missing/failed는 빈 dict를 반환한다. [retrieval_service.py:227-234](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:227)

`rank_candidates`는 빈 semantic map을 “검색 실패”가 아니라 “semantic 정보 없음”으로 해석해 모든 후보에게 0.5를 준다. 이 값은 floor의 `>=0.5`를 정확히 통과한다. [ranking.py:214-220](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:214), [ranking.py:261-266](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:261)

빈 결과와 중립 semantic을 구분하지 않은 명백한 fail-open이다.

### C5. 답변 재전송과 질문 중 refine이 상태를 오염시킨다

판정: **확정, 실행 재현됨.**

비활성 상태는 `expired/cancelled`뿐이다. `results/failed`에서도 answer와 refine을 받는다. [session_manager.py:22-27](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:22), [session_manager.py:368-405](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:368)

결과 생성 시 `lastQuestion`을 지우지 않기 때문에 마지막 답변을 재전송하면 동일 answer가 다시 append되고 questionCount가 증가한다. [session_manager.py:291-298](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:291), [session_manager.py:405-423](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:405)

실행 재현에서는 results 상태에서 답변 수가 3→4, questionCount가 3→4가 됐다.

또 질문 상태에서 `refine(more_diverse)`를 보내면 cached ranking으로 바로 결과를 만들고 질문을 제거한다. 실행 재현에서 `question → results`로 전이됐다. [session_manager.py:475-477](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:475), [session_manager.py:528-577](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:528)

### C6. Postgres/in-memory 이원화는 장애 전환과 동시성에 취약하다

판정: **확정.**

- 기본 store는 postgres지만 DB 연결이 없으면 조용히 메모리로 폴백한다. [settings.py:69-73](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/core/settings.py:69), [session_manager.py:636-637](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:636)
- DB가 다시 연결되면 `get_session_persisted`는 Postgres만 읽고 기존 메모리 세션을 보지 않는다. [session_manager.py:734-758](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:734)
- 여러 워커에서 DB 미연결 상태라면 생성 워커가 아닌 워커의 poll은 404가 된다.
- Postgres 갱신은 `select state` → 메모리 수정 → unconditional upsert다. version, row lock, compare-and-swap이 없어 동시 answer/refine은 last-write-wins다. [session_manager.py:664-702](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:664)
- 스키마에도 version 필드가 없다. [schema.sql:316-324](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/docs/backend/schema.sql:316)

### C7. MMR은 Top3만 필요하지만 전체 후보를 O(n³)로 재랭킹한다

판정: **확정.**

`mmr_rerank`는 각 단계마다 모든 remaining 후보에 대해 모든 selected 후보와 유사도를 계산하며, `top_n=None`이면 끝까지 반복한다. [ranking.py:290-320](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:290)

`build_slice_result`는 결과 3개만 필요하면서도 `top_n=3`을 전달하지 않고 전체 floor 후보를 재랭킹한 뒤 역할 3개만 선택한다. [ranking.py:375-397](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:375)

속성 시그니처가 비어 있을 때는:

- 양쪽 모두 비고 다른 브랜드: similarity 0
- 한쪽만 비어도: similarity 0
- 양쪽 모두 비고 같은 브랜드: similarity 0.34

0으로 나누는 오류는 없지만, 속성 없는 다른 브랜드 간에는 다양성 제어가 전혀 없다. [ranking.py:269-287](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:269)

### C8. live enrichment는 hard filter는 보지만 floor와 MMR을 우회한다

판정: **확정.**

live 후보는 `rank_candidates`까지만 거치고 `passes_floor`나 기존 후보와의 MMR을 거치지 않는다. 이후 curated discovery를 제거하고 바로 append한다. [enrichment.py:798-839](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:798)

추가 문제:

- semantic_scores를 주지 않아 live 후보 전원 semanticScore=0.5다.
- Naver 질의 사다리가 category-only까지 후퇴할 수 있어 soft preference를 무시한 상품도 discovery로 들어올 수 있다. [enrichment.py:616-637](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:616)
- 중복은 ID와 정규화 상품명으로 잘 막지만, 속성 유사도 기준 중복은 막지 않는다. [enrichment.py:748-756](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:748), [enrichment.py:806-824](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:806)

즉 hard filter 누수는 C2의 eligibility 문제이고, 별도로 floor/MMR 계약도 우회한다.

### C9. 질문의 “N개 남아요”는 실제 전체 후보 수가 아니다

판정: **확정.**

Question Engine은 상위 40개만 분석한다. 질문과 각 옵션의 `expectedCandidateCount`도 이 40개 내 숫자다. [question_engine.py:158-159](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:158), [question_engine.py:242-267](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:242)

따라서 실제 후보 117개인데 UI에는 현재 후보 40개처럼 보일 수 있다. 첨부 §10의 “N개 남아요” 해석은 전체 검색셋 기준으로는 부정확하다.

또 best attribute의 `build_question`이 옵션 2개를 만들지 못하면 차선 attribute를 시도하지 않고 질문을 종료한다. [question_engine.py:318-320](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:318), [question_engine.py:366-368](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/question_engine.py:366)

noop 답변도 filter에는 반영되지 않지만 semantic query text에는 `attribute=None` 형태로 포함된다. 실제 프로브에서 priceTier noop 전후 semantic 수치가 변했다. [retrieval_service.py:78-100](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:78), [retrieval_service.py:103-109](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:103)

### C10. refine 롤백은 괜찮지만 반복 prompt의 semantic 상태가 불일치한다

판정: **부분 결함.**

후보 0 refine에서 result/filter/λ를 복구하는 롤백은 잘 되어 있다. [session_manager.py:481-490](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:481), [session_manager.py:557-566](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:557)

하지만 새 refine prompt는 해당 attribute의 기존 refine 필터만 교체하고 다른 attribute 필터는 유지한다. [session_manager.py:501-514](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:501)

반면 semantic query에는 유지된 이전 refine 필터들이 직렬화되지 않고 최신 `refinePrompt` 하나만 추가된다. [retrieval_service.py:78-100](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:78), [retrieval_service.py:139-145](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:139)

따라서 반복 refine 후 rule/preference 상태와 semantic query가 서로 다른 조건 집합을 본다. 빈/broad refine prompt는 기존 refine 필터를 제거하지도 않는다.

### C11. curated catalog는 생성한 qualityFlags를 무시한다

판정: **확정.**

리필·세트·미니·케이스를 `qualityFlags`로 표시하고 결과에 저장하지만, catalog loader는 purchasable 여부만 보고 이를 제거하지 않는다. [knowledge_chunk_builder.py:85-98](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/knowledge_chunk_builder.py:85), [knowledge_chunk_builder.py:248-253](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/knowledge_chunk_builder.py:248), [catalog_loader.py:77-81](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/catalog_loader.py:77)

반대로 live discovery는 qualityFlags가 하나라도 있으면 제거한다. [enrichment.py:713-718](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:713)

현재 전수 집계에서 126/618개가 flagged다. broad 립 상위권에도 `"기획/단품"` flagged 상품이 실제로 들어온다. [catalog line 504](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260708.jsonl:504)

### C12. 레거시 matchRate는 보고서 유무에 따라 역설적으로 변한다

판정: **확정.**

레거시는 profile이 없으면 Naver index만으로 96, 94, … 최저 82를 부여한다. profile 객체가 있으면 인식 가능한 target term이 하나도 없어도 74에서 시작해 index penalty를 받고 최저 62가 된다. [shopping_products.py:690-701](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:690), [shopping_products.py:727-739](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/shopping_products.py:727)

즉 인식 불가능한 보고서를 첨부하는 것만으로 동일 상품의 matchRate가 20점 이상 내려갈 수 있다. 이 점수는 서로 다른 입력 상태 간 calibration이 전혀 되어 있지 않다.

## 가장 치명적인 문제 TOP3

1. **낮은 신뢰도 메타데이터가 지배 신호로 증폭되는 구조**  
   단일 보고서 선호의 weight/confidence가 사실상 소거되고, undertone 데이터 자체도 `투쿨포스쿨 → cool` 같은 브랜드명 오염을 포함한다. 잘못된 데이터가 matchRate 20점대 격차로 증폭된다.

2. **hard constraint 계약을 신뢰할 수 없음**  
   `"2만원 이상"`을 `<=2만원`으로 뒤집고, `"립 말고 블러셔"`를 립으로 잠그며, 질문/live 필터는 `hardFilterEligible=false` 상품도 hard 조건 충족으로 인정한다.

3. **세션 상태의 비멱등성과 동시성 부재**  
   결과 후 답변 재전송이 중복 반영되고, 질문 중 refine으로 퍼널을 건너뛸 수 있으며, Postgres 갱신에는 version/lock이 없어 동시 요청이 last-write-wins다.

운영 관점의 바로 다음 문제는 Top3만 필요하면서 전체 후보를 재랭킹하는 MMR의 O(n³) 비용이다.