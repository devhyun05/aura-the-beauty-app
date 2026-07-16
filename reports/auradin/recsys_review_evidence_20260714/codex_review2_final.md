결론부터 말하면, 보고서의 문제 진단과 큰 방향은 타당하지만 현재 초안은 “최종” 상태가 아닙니다. 특히 R2 공식, RUN_DATE 아티팩트 승격, R1 화면 교체, A8 정화 규칙, 개인화 이벤트 계약은 구현 전에 수정해야 합니다.

## 리뷰 1 재검증 판정

### C4 semantic fail-open

- **판정: 부분 동의 + 일부 반박**
- **근거:** 기본 `auto`에서 현재 hash 인덱스가 정상일 때는 어휘 폴백 또는 비어 있지 않은 결과가 나오므로 “일반적인 실패 시 fail-open”은 과장이 맞습니다. 다만 빈 dict가 명시적 `embedding` 실패에만 한정되지는 않습니다. `auto`에서도 인덱스가 없으면 lexical 경로로 가고, 토큰 중첩이 없으면 `{}`를 반환합니다. 이후 랭커가 이를 semantic `0.5`로 취급합니다: [retrieval_service.py:187](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:187), [vector_index.py:31](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/vector_index.py:31), [ranking.py:220](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:220).
- **수정안:** F12를 “설정·아티팩트 의존적 결함”으로 유지하되, 실패 범위를 `embedding 실패 + auto lexical 무매치`로 적어야 합니다. 반환값도 dict 하나가 아니라 `status=ok|unavailable|no_match`로 구분해야 합니다.

### C11 qualityFlags

- **판정: 동의**
- **근거:** 전면 컷은 커버리지 손실이 크므로 유형별 정책이 합리적입니다.
- **수정안:** 리필·미니·도구는 Top10뿐 아니라 전체 serving 후보에서 배제하고, 기획/세트·단품은 명시적 배지와 함께 유지하는 테스트가 필요합니다. “세트”와 “단품”을 같은 의미로 서술하지 말고 각각의 flag 정의도 고정해야 합니다.

### TOP3 우선순위

- **판정: 동의**
- **근거:** 정상 모바일 흐름과 단일 워커 전제에서는 세션 동시성의 실제 발생 가능성이 낮고, 데이터 커버리지·신선도가 추천 품질에 더 직접적입니다.
- **수정안:** 다만 A5 이벤트 수집보다 A9 멱등성·세션 식별을 먼저 적용해야 합니다. 그렇지 않으면 낮은 우선순위의 세션 결함이 학습 데이터 중복으로 확대됩니다.

---

# R-A. 개선 설계 현실성·부작용

## 1. §13 R2 preference 정규화

- **판정: 수정 필요 — 현 공식 그대로 채택에는 반대**
- **근거:** 현재 구현은 선호가 없을 때 `0.5`, 선호가 있으면 `matchedWeight/totalWeight`를 반환하며 요청 confidence와 상품 attribute confidence를 사용하지 않습니다: [ranking.py:150](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:150). floor는 `answerScore > 0.5`만으로도 열립니다: [ranking.py:254](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:254).

주요 결함은 다음과 같습니다.

- 보고서의 효과량 계산이 2배 큽니다. 보고서 예시 `w=.5, conf=.55`의 중립 대비 preference 변화는 `0.06875`, 최종 점수 변화는 `0.06875×0.22=0.0151`입니다. `+0.03`은 match와 avoid 사이 전체 폭입니다. 사용자 선호 예시도 중립 대비 약 `+0.0347`이지 `+0.07`이 아닙니다. [보고서 §13 R2:362](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_추천시스템_고도화_종합보고서.md:362>)

- avoid만 있는 경우 “안전하지만 미확인인 상품”은 `0.5`, avoid 일치는 `<0.5`가 됩니다. 점수 의미는 자연스럽지만, positive preference가 없으므로 floor 통과가 semantic/evidence에만 의존하게 됩니다. 이 동작을 명시해야 합니다.

- 선호가 5개 이상이면 새로운 미일치 선호를 하나 추가하는 것만으로 기존 선호의 영향이 희석됩니다. `Σw=2` 전후에는 분모 규칙이 바뀌는 불연속도 있습니다.

- report/profile 선호만 일치해도 `answerScore>0.5`가 되어 floor가 열립니다. “report는 anchor 보조일 뿐”이라는 §7 원칙과 모순됩니다.

- 요청 confidence만 곱하고 상품 attribute confidence를 반영하지 않습니다. 따라서 브랜드명 오염이나 낮은 신뢰도의 제목 추출값도 공식 데이터와 같은 강도로 가점됩니다.

- 동일 attribute/value 중복, 동일 값의 positive/avoid 충돌, 0·음수·1 초과 weight/confidence의 처리 규칙이 없습니다.

실제 현 카탈로그에 보고서 공식을 그대로 대입해 본 결과, `GOLDEN_QUERIES` 9개 중 3개의 Top3 구성이 바뀌었습니다. `"글리터 추천해줘"`는 matchRate가 `[84,62,62] → [76,73,73]`이 되어 기존 anchor `>=80` 검사를 깨뜨립니다: [test_auradin_glitter_slice.py:86](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/tests/test_auradin_glitter_slice.py:86). `"데일리 블러셔"`처럼 아무 preference도 맞지 않는 질의는 오히려 `[62,61,60] → [73,72,71]`로 상승합니다.

- **구체 수정안:** `W_cap` 정규화 대신 source별 최종 delta를 직접 제한하는 쪽이 단순합니다.

  1. `(attribute,value)` 기준으로 먼저 중복·충돌을 정리하고 `prompt/refine/question > report > profile` 우선순위를 적용합니다.
  2. 상품 attribute confidence까지 포함해 `raw_s=Σ sign·weight·requestConf·itemConf`를 계산합니다.
  3. `Δ_s=clip(k_s·raw_s,-cap_s,+cap_s)`로 제한하고 neutral preference가 포함된 base score에 더합니다. 예: report cap `0.03`, profile cap `0.02`; 실제 값은 오프라인 평가로 확정합니다.
  4. floor는 숫자 `answerScore>0.5`가 아니라 `matchedExplicitUserPreference`와 상품 근거 수준으로 판단합니다. report/profile-only 일치는 floor를 열지 못하게 해야 합니다.
  5. 기존 matchRate 숫자를 유지할 계획이 없다면 “golden 무회귀”가 아니라 새 baseline을 승인하는 명시적 재보정 작업으로 분리해야 합니다.

## 2. §13 R1 레거시 → Auradin 화면 교체

- **판정: 수정 필요**
- **근거:** 가장 큰 퇴행은 “세트 출력”이 아니라 다음 기능입니다.

  - 레거시는 서버 영속 좋아요를 읽고 씁니다: [ProductRecommendationScreen.tsx:249](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx:249), [ProductRecommendationScreen.tsx:390](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx:390). Auradin `saved`는 화면 로컬 state라 재마운트 시 사라집니다: [AuradinSearchScreen.tsx:81](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/auradin/screens/AuradinSearchScreen.tsx:81).

  - 레거시는 분석 리포트 이력 선택, 룩 이미지/무드/팔레트, 사진 변경, 카테고리 탭, 가격·매칭순 정렬, Top3보다 많은 상품 탐색을 제공합니다: [ProductRecommendationScreen.tsx:309](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx:309), [ProductRecommendationScreen.tsx:451](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx:451), [ProductRecommendationScreen.tsx:589](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx:589).

  - 과거 리포트 상세에서는 `reportId`만 레거시 화면으로 전달합니다: [faceAnalysisRoutes.tsx:694](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx:694). Auradin 라우트는 현재 선택된 분석 상태의 `personalColor`에 의존합니다: [recommendationRoutes.tsx:60](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/apps/mobile/src/app/navigation/routes/recommendationRoutes.tsx:60). 단순 목적지 교체 시 과거 리포트 컨텍스트가 유실됩니다.

  - 레거시는 일반 detail header/back 흐름이고 Auradin은 fullscreen immersive 흐름입니다. “라우트 한 줄 롤백” 수준이 아닙니다.

  - 보고서의 “레거시 category set 출력”은 부정확합니다. 서비스 DTO는 `sets`를 매핑하지만 현재 화면은 `data.sets`를 렌더링하지 않습니다. 실제 퇴행 항목과 잠재 기능을 구분해야 합니다.

- **구체 수정안:** R1에 parity gate를 추가하십시오. 최소 조건은 `reportId/personalColor 전달`, 서버 저장 연동, 뒤로가기/홈 의미, 과거 리포트 진입, category/sort/룩 선택 기능의 유지 또는 명시적 폐기 결정입니다. feature flag로 전환하고 현재 리포트·과거 리포트·재마운트 후 저장 유지 E2E를 통과한 뒤 기본 경로를 바꿔야 합니다.

## 3. §14 A7 파서 확장

- **판정: 수정 필요**
- **근거:** 현재 가격 파서는 방향 키워드가 선택 사항이어서 `"2만원 이상"`도 lte가 됩니다: [intent_parser.py:127](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/intent_parser.py:127). 따라서 방향 키워드 필수화 자체는 맞습니다. 다만 단순 부정 substring 규칙은 기존 질의를 깨뜨릴 수 있습니다.

  - 기존 평가 문장 `"글리터 강한 아이섀도우 말고 은은한 쉬머"`에서 `"아이섀도우 말고"`를 한 덩어리로 제거하면 category까지 사라질 수 있습니다.
  - `"2만원 이하"`는 현재 end-to-end golden에 있으므로 regex alternation 순서나 optional group 변경으로 lte가 빠지는 회귀를 직접 고정해야 합니다: [test_auradin_golden.py:29](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/tests/test_auradin_golden.py:29).
  - retrieval/ranking은 gte를 일부 지원하지만 필터 라벨은 항상 “이하”, 이유 생성과 no-result 완화도 lte에 고정되어 있습니다: [session_manager.py:82](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:82), [ranking.py:433](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:433).
  - `"미만"`은 `<`, `"초과"`는 `>`이므로 각각 lte/gte로 처리하면 경계 가격 상품이 잘못 포함됩니다.

- **구체 수정안:** 부정은 토큰 포함 여부가 아니라 clause/span 단위로 적용하십시오. 가격 연산자는 `lt/lte/gt/gte/range`를 명시하고, 라벨·추천 이유·refine 병합·no-result 완화까지 같은 연산자를 사용해야 합니다. 최소 회귀 행렬에 `이하/미만/이상/초과/N만원대/1만5천원/1~2만원/쉼표 가격`, `"립 말고 블러셔"`, `"매트는 싫고 글로시"`, `"싫지 않은"`, 기존 글리터 문장을 넣어야 합니다.

## 4. §14 A8 undertone 오염 정화

- **판정: 수정 필요**
- **근거:** `matchedToken ⊂ brandName`만으로 attribute 전체를 null 처리하면 정당한 데이터도 삭제됩니다.

  - 같은 `cool` 토큰이 브랜드명과 실제 상품명·쉐이드명 양쪽에 있을 수 있습니다.
  - undertone이 다른 공식 근거에도 의해 뒷받침되는 경우 브랜드 evidence 하나 때문에 전체 속성을 지우면 안 됩니다.
  - 현재 추출기는 residual을 만든 뒤 원본 제목을 다시 searchable text에 넣어 브랜드 오염을 재도입합니다: [title_keyword_extractor.py:104](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/catalog/title_keyword_extractor.py:104), [title_keyword_extractor.py:125](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/catalog/title_keyword_extractor.py:125).
  - 반대로 residual만 검색하면 product name 자체가 제거되어 정당한 undertone도 놓칠 수 있습니다.
  - live discovery는 별도의 metadata extractor를 사용하므로 배치 경로만 고치면 재오염됩니다: [enrichment.py:665](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:665).

- **구체 수정안:** attribute 삭제가 아니라 offending evidence span만 제거한 후 남은 provenance로 재계산해야 합니다. “브랜드를 제거한 product name + listing residual”을 공통 추출 입력으로 만들고 curated/live 경로가 같은 함수를 사용하게 하십시오. 성공 기준도 `undertone=cool 0건`이 아니라 “유일한 evidence가 브랜드명 내부인 cool 0건 + 브랜드 밖 cool positive control 유지”로 바꿔야 합니다.

## 5. §6.2 주간/월간 파이프라인

- **판정: 수정 필요 — 중요한 실패 모드 누락**
- **근거:** 주간 트랙이 새 RUN_DATE의 catalog만 만들고 chunk/vector를 만들지 않으면 새 날짜의 vector가 존재하지 않습니다. loader는 같은 RUN_DATE 파일을 찾고 캐시합니다: [catalog_loader.py:12](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/catalog_loader.py:12). `auto`는 이때 조용히 lexical backend로 내려갈 수 있어 추천 의미가 바뀝니다: [retrieval_service.py:164](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/retrieval_service.py:164). 이는 C4를 운영상 다시 키우는 설계입니다.

Naver 동일 상품 재매칭도 취약합니다.

- 기존 Naver product ID가 다르면 브랜드 동일성 없이 토큰 중첩률과 임계값 `0.5`로 매칭합니다: [collect_auradin_naver_offer_metadata.py:229](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/scripts/collect_auradin_naver_offer_metadata.py:229).
- 리스팅 ID 교체, 리필/본품, 미니/정품, 용량·수량·쉐이드 차이, 이름이 짧은 상품에서 오매칭할 수 있습니다.
- Naver 최저가는 다른 옵션의 가격일 수 있고, ±60% 검사는 잘못된 변형의 20% 차이를 잡지 못하면서 정상 세일은 검수 대상으로 만들 수 있습니다.
- 429/5xx/검색 실패와 실제 미판매를 구분하지 않으면 “2회 miss=stale”가 정상 offer를 제거합니다.

- **구체 수정안:** catalog/chunks/vector/model ID/checksum/schema version을 하나의 immutable manifest로 묶어 원자적으로 승격하십시오. 프로세스 재시작·멀티워커 캐시 일치까지 health check에 포함해야 합니다. offer 매칭은 `정확한 listing ID → 브랜드 동일 + core-name + variant signature + 2위 후보와의 margin` 순으로 하고, 애매하면 기존 offer를 유지해야 합니다. `fetch_failed/no_match/ambiguous/unavailable`을 분리하고 내부 `catalogItemId`와 변경 가능한 offer/listing ID 및 이력을 분리하십시오.

## 6. §7 개인화 루프

- **판정: 수정 필요**
- **근거:** 제안 스키마에는 중복·버전·실험·노출 연결에 필요한 필드가 부족합니다. 또한 현재 인증 fallback은 device-scoped anonymous ID가 아니라 공용 개발 subject입니다: [security.py:168](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/core/security.py:168).

필수 누락은 다음입니다.

- `clientEventId` unique, `occurredAt/receivedAt`, `schemaVersion`
- `sessionId/turnId/resultSetId/impressionId/questionId/optionId`
- catalog/ranker/parser/embedding/weight version
- experiment ID/variant/exposure
- app version/platform/locale/consent
- `unsave/unhide`, 실제 impression과 단순 response 생성의 구분
- retention, account deletion, profile 삭제, 인덱스·check constraint
- 실패 시 추천 응답을 막지 않는 event write fail-open

F2와의 상호작용도 큽니다. profile을 기존 `softPreferences`에 weight `≤0.3`으로 주입하면:

- R2 분모를 키워 명시적 사용자 선호를 희석합니다.
- profile-only 일치가 floor를 열 수 있습니다.
- live discovery query에도 profile이 들어갑니다: [enrichment.py:625](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/enrichment.py:625). 따라서 “anchor에만 적용, diverse/discovery에는 미적용”이라는 §7 설명은 단순 주입으로 구현되지 않습니다.
- 음수 affinity를 음수 weight로 넣으면 현재 scorer 전제가 깨집니다.

- **구체 수정안:** profile은 `softPreferences`와 분리된 `profileScore`로 계산하고 anchor 선정 단계에만 사용하십시오. 명시적 세션 attribute가 있으면 같은 attribute의 report/profile은 억제해야 합니다. 음수 affinity는 양의 weight를 가진 `avoidValues`로 변환하고 최소 support를 요구하십시오. cold start는 “이벤트 5개”가 아니라 여러 세션/날짜의 actionable event 5개 이상으로 정의하고 반복 클릭·저장에는 cap을 둬야 합니다.

---

# R-B. 테스트 계획 공격

## §9.2/A1~A10 성공 기준

| 항목 | 판정 | 현재 기준의 구멍과 수정 |
|---|---|---|
| A1/R2 | 수정 필요 | `TOP3 교체 ≤1`, `swing≤ε`에서 ε가 없고 기능이 전혀 작동하지 않아도 통과할 수 있습니다. stable 상품 ID·순위·source별 delta의 상한과 최소 효과를 함께 검사하고 report/profile-only floor 통과를 금지해야 합니다. |
| A2 tie | 수정 필요 | “분포가 균등”의 모집단·허용 오차가 없습니다. Python `hash()`가 아니라 고정 SHA 계열 키를 쓰고, 고정 session fixture N개에 대한 재현성과 노출 편차를 정의해야 합니다. |
| A3/F6 | 반박 | 보고서 자체가 현재 경로상 이론적이라고 인정한 문제입니다. “live pick 테스트”는 실제 `_build_result` 경로를 증명하지 못하므로 A3을 즉시 항목에서 빼거나 재현 경로가 생길 때 활성화하십시오. |
| A4 contradiction | 수정 필요 | “probe 0건”만으로 부족합니다. known/unknown/live 후보별 금지 조합표와 fail-closed 기대값을 고정해야 합니다. |
| A5 events | 수정 필요 | “row inserted”는 너무 쉽습니다. 재시도 중복, 권한, 삭제, out-of-order, DB 장애, version/experiment 기록, recommendation latency 비영향을 검사해야 합니다. |
| A6 pipeline | 수정 필요 | 1회 승격 성공은 잘못된 offer나 lexical fallback도 허용합니다. manifest 일치, backend 유형, ID churn, variant ambiguity, partial API failure, rollback을 fixture로 검증해야 합니다. |
| A7 parser | 수정 필요 | 제안된 4개 예시는 정상 `"2만원 이하"`와 기존 복합 부정 질의를 보호하지 못합니다. 앞서 제시한 가격·부정 행렬이 필요합니다. |
| A8 cleanup | 수정 필요 | “cool 0건”은 과삭제를 성공으로 만듭니다. brand-only evidence 0건과 정당한 product/shade evidence 보존을 동시에 검사해야 합니다. |
| A9 session | 수정 필요 | stale question, duplicate request, 결과 후 `lastQuestion=None`, results 전 refine, 동시 CAS, 재시작 후 retry를 추가해야 합니다. |
| A10 flags | 수정 필요 | Top10만 검사하면 rank 11 이하나 특정 카테고리에서 재노출됩니다. 전체 serving 후보에서 제외 flag 부재와 카테고리별 coverage floor, 유지 flag positive control을 함께 검사해야 합니다. |

기존 golden도 기대보다 약합니다. `GOLDEN_QUERIES`는 9개이고, 다수 검사는 category/reason/price 정도만 확인합니다: [test_auradin_golden.py:24](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/tests/test_auradin_golden.py:24). 동일 질의를 현재 코드로 두 번 실행하는 deterministic 검사는 checked-in ranking snapshot이 아닙니다. 보고서의 “golden 32건”이 pytest test count를 의미한다면 질의 corpus 32개와 구분해 써야 합니다.

또한 §15의 다음 기준은 현 상태에서 실행 불가능하거나 불명확합니다.

- `components.answerScore`는 공개 응답 diagnostics에 노출되지 않습니다. 응답은 rankedCount/floorCount/topScoreGap 정도만 제공합니다: [session_manager.py:189](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/session_manager.py:189). 내부 테스트로 명시하거나 diagnostics 계약을 추가해야 합니다.
- “브랜드 제외”는 parser와 `_item_value`가 brand preference/avoid를 지원하지 않으므로 A7만으로 테스트할 수 없습니다: [ranking.py:81](/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/services/backend/app/services/auradin_agent/ranking.py:81).
- “1,000원”, 희귀 색상 같은 극단 사례는 기대 상태가 없습니다. 결과 0건, 완화 검색, 질문 전환 중 무엇이 성공인지 정의해야 합니다.

### 반드시 추가할 극단 사례

- R2: avoid-only, positive/avoid 충돌, 중복 선호, 0·음수·1 초과 confidence, 20개 선호, 낮은 item confidence, report/profile-only floor.
- A7: 정확히 경계 가격인 상품, `19,900원`, `1만5천원`, `1~2만원`, 이중부정, category 부정과 finish 부정이 한 문장에 있는 경우.
- A8: 브랜드와 상품명 양쪽에 같은 토큰, 복수 evidence, live discovery 경로.
- 파이프라인: 동일 상품의 listing ID 교체, 리필/본품 동점 후보, 429 후 정상 복구, 벡터 누락, 두 워커의 서로 다른 RUN_DATE.
- 개인화: client retry, out-of-order event, save→unsave, 반복 클릭 abuse, anonymous→login, 계정 삭제, 명시적 선호와 profile 충돌.

---

# R-C. 최종 모순·누락·과잉 주장

## 보고서 내부 주장

1. **판정: 수정 필요 — “모든 발견 실행 재현” 과장**

   [보고서 서두:15](</Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/아우라딘_추천시스템_고도화_종합보고서.md:15>)와 F6의 “현재 경로상 이론적”, 일부 추론형 항목이 모순됩니다. 각 finding에 `실행 재현/코드 확인/추론/설정 의존` evidence tag를 붙이십시오.

2. **판정: 수정 필요 — 우선순위 서술 불일치**

   §6.2는 파이프라인을 최우선이라 하고, §0·§14·§18은 각각 다른 순서를 제시합니다. 단일 번호 순서 대신 `정확성 트랙`과 `데이터 운영 트랙`을 병렬 P0로 표시해야 합니다.

3. **판정: 반박 — “즉시·낮은 회귀 위험”**

   §14의 A1, A5, A6, A7, A8, A10은 낮은 회귀 위험이 아닙니다. A1은 실제 Top3와 기존 matchRate 테스트를 바꾸고, A8은 배치 데이터 삭제, A6은 운영 아티팩트 승격입니다.

4. **판정: 수정 필요 — R1 설명 과장**

   “레거시 세트 출력”은 현재 UI 기능이 아니며, “한 라우팅 줄 롤백”도 사실이 아닙니다. 실제 parity 항목과 잠재 기능을 분리해야 합니다.

5. **판정: 수정 필요 — 자동 rollback 표현**

   golden/coverage gate에서 승격을 거부하는 것은 rollback이 아니라 failed promotion입니다. 승격 후 문제를 발견했을 때 이전 manifest로 되돌리는 절차가 있어야 rollback입니다.

6. **판정: 수정 필요 — 상품 identity 확정 표현**

   “normalized name key가 listing 교체를 견딘다”는 보장이 없습니다. 일반명 충돌과 variant 혼동이 있으므로 확률적 fallback이라고 표현해야 합니다. “shade row 분리 금지”도 가격·재고가 shade별로 다른 경우에는 지나치게 절대적입니다.

7. **판정: 수정 필요 — A/B 의존성 누락**

   §7의 온라인 A/B는 실험 배정과 exposure/version 이벤트가 먼저 있어야 합니다. C5 인프라를 뒤로 미룬 상태에서는 B7 평가가 해석 불가능합니다.

8. **판정: 수정 필요 — 비용·성능 확정치**

   “수 ms”, “수 원”, 특정 NDCG 개선폭과 업계 표준 표현은 벤치마크나 출처가 없으면 목표/가설로 낮춰 써야 합니다.

## A1~A10 및 후속 로드맵 순서

- **A9 → A5:** 멱등 request/event ID 계약을 먼저 만들고 이벤트를 쌓아야 합니다.
- **A6-lite → A8:** manifest·원자 승격·rollback을 먼저 만든 뒤 정화 카탈로그를 승격해야 합니다.
- **A7/A8 → A1:** 파서와 오염 데이터가 고정되기 전에 R2 weight를 보정하면 다시 보정해야 합니다.
- **A10 정책 확정 → 컷 적용:** 어떤 flag를 유지·배제할지와 카테고리 coverage budget을 먼저 결정해야 합니다.
- **B4 안전 파이프라인 → B3 enrichment 운영 승격:** enrichment 결과를 안정적으로 배포할 수 있는 경로가 선행해야 합니다.
- **B2 embedding + B8 weight/floor 재보정:** embedding 교체와 `s_floor`·가중치·matchRate 보정은 같은 평가 릴리스에서 원자적으로 다뤄야 합니다.
- **R1은 parity gate 이후:** C2의 “세트” 자체보다는 저장 영속성, 리포트 전달, category/sort/룩 선택 유지 여부가 선행 의사결정입니다.
- **실험 exposure 기록 → 온라인 A/B:** B7보다 먼저 최소 실험 배정·버전 로깅을 배치해야 합니다.

권장 순서는 다음과 같습니다.

1. 테스트 baseline·manifest/version 계약 확정
2. A9, A6-lite
3. A7, A8 및 카탈로그 재생성
4. A1/R2 재설계·재보정, A2, A4, A10
5. A5 이벤트 수집과 shadow profile
6. R1 parity 완료 후 화면 전환
7. B3 enrichment, B2 embedding, B8 재보정의 gated promotion
8. 실험 인프라 후 온라인 A/B

# 보고서 반영 필수 수정 TOP5

1. **R2 공식을 source별 capped delta로 재설계하고, report/profile-only floor 통과를 금지한다.** 기존 golden을 “유지”할지 “재승인”할지도 명시한다.
2. **RUN_DATE catalog/chunks/vector를 단일 manifest로 원자 승격하고 offer identity·실패 상태·rollback을 설계한다.** C4의 auto lexical 빈 결과도 함께 수정한다.
3. **R1에 화면 parity 계약을 추가한다.** 서버 저장, 과거 reportId 전달, 뒤로가기, category/sort/룩 선택을 다루고 “레거시 세트 출력”과 “한 줄 롤백” 주장을 제거한다.
4. **A7/A8을 span·provenance 기반으로 바꾸고 회귀 행렬을 확장한다.** 브랜드명 포함만으로 attribute 전체 삭제하거나 단순 `"말고"` substring 제거를 해서는 안 된다.
5. **이벤트 스키마에 멱등성·버전·실험·삭제 계약을 넣고 profile을 softPreferences에서 분리한다.** 순서도 A9→A5로 고친다.

저장소와 보고서는 읽기 전용으로 검토했으며 파일 수정은 하지 않았습니다.