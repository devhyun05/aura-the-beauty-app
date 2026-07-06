> ⚠️ **ARCHIVED (2026-07-06)** — 이 문서는 20260703 데이터 기준으로 작성되어 일부(특히 커버리지·질문 정책 표)가 낡았다.
> 현재 단일 진실 소스는 **[AURADIN.md](AURADIN.md)** 다. 이 문서는 역사적 설계 참고용으로만 본다.

# Auradin MVP 전처리 및 Bedrock 검색 에이전트 실행 계획

작성일: 2026-07-03 KST  
대상 repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`  
현재 결정: **추가 상세 크롤링을 기다리지 않고, 20260703 수집본을 MVP 시드로 승격한 뒤 전처리 → RAG/index → 서버 결정론 에이전트 → Bedrock 보조 → 아우라딘 UI와 제품추천 UI 통합 순서로 구현한다.**

---

## 0. 이번 문서의 위치

기존 문서는 대부분 크롤링 전 또는 크롤링 직후의 이상적인 계획이다. 지금은 데이터가 일부 확보됐고, 완전하지 않아도 MVP 검색 경험을 만들 수 있는 상태다.

따라서 이 문서를 최신 실행 계획으로 둔다.

아우라딘의 아키네이터형 agent loop, 질문 정책, UI 통합까지 포함한 총체 설계는 아래 문서를 함께 우선한다.

```txt
AURADIN_AKINATOR_AGENT_SYSTEM_DESIGN_KO.md
```

```txt
최신 실행 기준:
1. data/auradin/catalog/catalog_items_seed_20260703.jsonl
2. data/auradin/detail/normalized/limited_detail_results_20260703.jsonl
3. data/auradin/knowledge/product_knowledge_docs_20260703.jsonl
4. reports/auradin/limited_detail_collection_summary_20260703.md
5. reports/auradin/limited_detail_field_audit_20260703.md
```

이전 계획의 핵심 원칙은 유지한다.

```txt
RAG = 안정적인 제품 지식 검색
API/live offer = 현재 가격, 링크, 판매처 확인
Agent = 질문 루프, 필터 적용, 설명 생성의 orchestration
LLM = 보조자
서버 로직 = 후보 선택, 질문 여부, filterDelta, hard/soft filter의 최종 권한
```

---

## 1. 현재 데이터 상태 판단

### 1.1 MVP 입력 데이터

현재 20260703 제한 상세 수집본은 아래 상태다.

| 항목 | 상태 |
|---|---:|
| ProductCatalogItem seed | 501 rows |
| Normalized limited detail results | 501 rows |
| ProductKnowledgeDocument seed | 1002 rows |
| 포함 카테고리 | lip 167, cheek 167, shadow 167 |
| collectionStatus | 전부 partial |
| 가격 / 구매 URL / 이미지 | 501 / 501 / 501 |
| 브랜드 국가 | 501 |
| 제조국 | 199 |
| 올리브영 positive listing | 74 |
| 백화점 positive listing | 41 |

중요한 해석:

```txt
- 이 데이터는 완성 catalog가 아니라 MVP 검색 seed다.
- lip / cheek / shadow 중심 MVP에는 충분하다.
- base / brow / liner는 아직 seed 밖이므로 MVP에서는 fallback 또는 후순위로 둔다.
- unknown retail presence는 미입점이 아니다. positive evidence만 filter에 쓴다.
- title_rule_inferred 값은 검색 힌트로 유용하지만 hard filter에는 바로 쓰지 않는다.
```

### 1.2 필드별 신뢰도 상황

| 필드 | Filled | Hard-filter eligible | MVP 사용법 |
|---|---:|---:|---|
| shadeOptions | 239 / 501 | 189 / 501 | 옵션 표시와 색상 후보 확장에 사용 |
| colorFamily | 229 / 501 | 47 / 501 | hard filter는 제한, soft rerank/RAG에 적극 사용 |
| undertone | 212 / 501 | 6 / 501 | hard filter 금지에 가깝게 취급 |
| intensity | 120 / 501 | 0 / 501 | 질문 후보 제외, 설명/soft tag만 사용 |
| finish | 315 / 501 | 207 / 501 | 질문 후보와 hard/soft filter 모두 사용 가능 |
| texture | 382 / 501 | 250 / 501 | 질문 후보와 hard/soft filter 모두 사용 가능 |
| suitableFor | 68 / 501 | 0 / 501 | hard filter 금지, 설명/soft rerank만 사용 |
| sellingPoints | 265 / 501 | 0 / 501 | 설명/soft rerank에 사용 |
| price/link/image | 501 / 501 | live-offer 필수 | 결과 카드 필수 조건 |
| oliveYoungListed | 74 / 501 | 74 / 501 | positive channel filter만 허용 |
| departmentStoreListed | 41 / 501 | 41 / 501 | premium/channel positive filter만 허용 |
| brandCountry | 501 / 501 | 501 / 501 | metadata/filter 가능 |
| madeInCountry | 199 / 501 | 177 / 501 | 근거 있을 때만 표시 |

---

## 2. MVP 전략

### 2.1 검색 약속

MVP가 사용자에게 약속하는 것은 아래다.

```txt
"구매 가능한 립/치크/섀도우 제품 중에서,
사용자 취향을 1~3개 질문으로 좁히고,
가격/판매처/이미지/근거가 있는 추천 카드를 보여준다."
```

MVP가 약속하지 않는 것은 아래다.

```txt
- 모든 호수/옵션의 공식 색상 완전성
- base/brow/liner 전체 카탈로그 검색
- 제조국/입점 여부의 negative claim
- raw title 추론값의 확정적 표현
- Bedrock managed agent가 모든 판단을 수행하는 구조
```

### 2.2 핵심 설계 판단

지금은 **Bedrock Agent 자체를 검색 두뇌로 쓰지 않는다.**

먼저 repo 안에서 결정론 검색 에이전트를 만든다.

```txt
사용자 입력
-> intent parser
-> catalog filter
-> vector retrieval
-> score blend
-> information-gain question
-> answer filterDelta 적용
-> final recommendation card
```

Bedrock은 아래 역할로 제한한다.

```txt
Bedrock Embedding
- ProductKnowledgeChunk embedding
- query embedding
- cosine similarity

Bedrock LLM
- intent parsing 보조
- 질문 문구 보조
- 추천 이유 문장화
- 실패 시에도 deterministic fallback 유지

Bedrock Agents / Knowledge Bases
- MVP 이후 phase 2
- 기존 deterministic engine을 action group / KB로 감싸는 방향
```

### 2.3 제품추천 UI 통합 결정

아우라딘은 별도 장식 화면이 아니라 **제품추천 경험의 최상위 shell**이 된다. 현재 모바일에는 두 화면 축이 이미 존재한다.

```txt
apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx
  - 아우라딘 wordmark, prompt, searching, question, results 감성 UI
  - 현재 mock-only

apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx
  - 실제 제품 카드, 좋아요, 구매 링크, 보고서 기준 추천, 정렬/카테고리
  - 현재 제품추천 route에서 실제 사용 중
```

MVP 통합 원칙:

```txt
- ProductRecommendationScreen을 통째로 Auradin 안에 넣지 않는다.
- AuradinSearchScreen을 검색/대화 shell로 승격한다.
- ProductRecommendationScreen의 제품 카드 모델, 좋아요, 구매 링크, 가격/이미지 표시 기능을 공용화해 Auradin 결과 영역에서 재사용한다.
- 기존 route name `ProductRecommendation`은 유지해 navigation churn을 줄인다.
- 사용자에게 보이는 title/copy는 `추천 제품`보다 `AURADIN` / `아우라딘` 중심으로 바꾼다.
- 기존 보고서 기반 제품추천 흐름은 Auradin의 입력 context로 흡수한다.
```

결과적으로 사용자는 아래처럼 느껴야 한다.

```txt
"추천 제품 화면에 들어갔다"가 아니라
"아우라딘에게 원하는 메이크업 제품을 말했고,
필요하면 한두 가지 질문을 받고,
바로 살 수 있는 제품을 받았다."
```

### 2.4 사용자 E2E 흐름

아래 흐름이 끊기지 않아야 MVP가 완성이다.

```txt
Flow A. 홈/탭에서 바로 제품 찾기
1. 사용자가 홈 또는 추천 진입점에서 아우라딘을 연다.
2. 프롬프트 입력 또는 quick chip 선택.
3. 검색 중 상태가 뜬다.
4. 서버가 질문 필요 여부를 계산한다.
5. 질문이 필요하면 한 번 탭으로 답한다.
6. 결과 카드가 나온다.
7. 사용자는 상품을 찜하거나 구매 링크를 연다.
8. "다시 찾기" 또는 조건 chip 수정으로 새 검색을 시작할 수 있다.
```

```txt
Flow B. 얼굴 분석 완료 후 제품 찾기
1. FaceCapture / FaceAnalysisLoading 완료 후 `ProductRecommendation`으로 이동한다.
2. route param 또는 navigation flow state의 reportId를 Auradin context로 넘긴다.
3. 화면은 보고서 기반 추천 프롬프트를 자동 구성한다.
4. 사용자는 그대로 검색하거나 "촉촉한 립", "올리브영" 같은 조건을 추가한다.
5. 결과 카드는 report context + prompt 조건을 함께 반영한다.
```

```txt
Flow C. 보고서 상세/프로필에서 특정 보고서 기준 제품 찾기
1. 보고서 카드의 "추천 제품" 버튼을 누른다.
2. 선택된 reportId가 Auradin context가 된다.
3. 화면 상단에는 기준 보고서 요약을 짧게 보여준다.
4. 사용자가 prompt를 입력하지 않아도 기본 추천 질의로 시작할 수 있다.
```

```txt
Flow D. 결과 이후 행동
1. 구매 링크 열기: purchaseUrl이 있는 상품만 카드에 표시한다.
2. 찜하기: 기존 liked product 저장 흐름을 그대로 사용한다.
3. 조건 더 좁히기: 같은 session에 follow-up prompt 또는 추가 질문으로 반영한다.
4. 새로 시작: session을 reset하고 초기 home phase로 돌아간다.
5. 빈 결과: 조건 완화 제안과 "둘 다 좋아요/noop" 성격의 fallback 선택지를 제공한다.
```

```txt
Flow E. 지원 범위 밖 질의
1. base / brow / liner 질의는 현재 seed 부족을 숨기지 않는다.
2. 가능한 경우 lip / cheek / shadow 대체 제안을 보여준다.
3. 완전 실패 대신 "지금은 립·치크·섀도우를 먼저 찾고 있어요" 상태로 복구한다.
```

### 2.5 현재 계획에서 보완해야 할 빠진 부분

현재 계획에 추가로 잠가야 하는 계약은 아래다.

```txt
1. route 진입점
   - 현재 ProductRecommendation route는 ProductRecommendationScreen을 렌더링한다.
   - MVP에서는 ProductRecommendationRouteScreen이 Auradin 통합 화면을 렌더링하도록 바꾼다.

2. route title/copy
   - routeChrome의 `추천 제품` title은 `AURADIN` 또는 `아우라딘`으로 바꾼다.
   - 단, 접근성 label에는 "추천 제품" 의미도 남긴다.

3. 결과 product card 공용화
   - ProductRecommendationScreen 내부 `ProductCard`는 private function이다.
   - `features/recommendation/components/ProductRecommendationCard.tsx`로 분리한다.

4. 서비스 분리
   - `productRecommendationService.ts`는 기존 `/products/recommendations` adapter로 유지한다.
   - `auradinService.ts` 또는 신규 `auradinSearchService.ts`는 `/search/sessions` adapter가 된다.

5. 타입 통합
   - backend SearchTurn result는 frontend `RecommendedProduct`로 매핑 가능해야 한다.
   - `AuradinCandidateProduct`는 더 이상 별도 mock-only 카드 타입으로 고립시키지 않는다.

6. session persistence
   - 앱 background/foreground, 뒤로가기, polling 중복을 고려한다.
   - MVP는 in-memory session이지만 mobile은 sessionId를 state로 들고, expired면 재시작한다.

7. loading/error/empty state
   - Bedrock timeout, backend unavailable, no result, unsupported category를 각각 다른 문구로 처리한다.
   - API base URL이 없으면 mock Auradin demo가 동작해야 한다.

8. 구매/찜 액션
   - 결과 카드는 기존 purchaseUrl open과 liked product 저장 경로를 재사용한다.
   - purchaseUrl 없는 상품은 backend에서 내려도 frontend에서 숨긴다.

9. 보고서 context
   - reportId가 있으면 prompt/context에 반영한다.
   - reportId가 없어도 free prompt search는 가능해야 한다.

10. AR 룩 추천과 제품 추천의 관계
   - 추천 메이크업 필터/AR 룩은 "룩"이고, Auradin 결과는 "실제 구매 제품"이다.
   - 이름은 합치되 데이터 모델은 섞지 않는다.
```

---

## 3. 전처리 산출물

### 3.1 새로 만들 산출물

```txt
data/auradin/catalog/catalog_items_mvp_20260703.jsonl
  catalog_items_seed_20260703.jsonl을 agent가 바로 읽을 수 있게 정규화한 파일.

data/auradin/knowledge/product_knowledge_chunks_mvp_20260703.jsonl
  RAG 검색 단위. raw crawl text가 아니라 정규화된 필드와 근거 요약만 포함.

data/auradin/embeddings/product_knowledge_chunk_embeddings_mvp_20260703.jsonl
  Bedrock embedding 결과. MVP는 파일 기반 캐시로 충분하다.

reports/auradin/mvp_preprocessing_quality_20260703.md
  row count, 결측률, hard/soft 필드 수, title residual 추론 수, 제외 사유 요약.

reports/auradin/mvp_retrieval_eval_20260703.md
  고정 테스트 질의별 top-k 결과와 실패 케이스.

reports/auradin/mvp_agent_eval_20260703.md
  세션 질문 루프와 final card 품질 평가.
```

### 3.2 정규화 후 CatalogItem MVP schema

```ts
type MvpCatalogItem = {
  id: string;
  sourceCandidateId: string;
  sourceGrain: 'naver_brand_category_top10_candidate';
  productPrecision: 'product';

  brandName: string;
  productName: string;
  normalizedProductName: string;
  rawTitle?: string;
  residualTitleKeywords: TitleKeyword[];

  category: 'lip' | 'cheek' | 'shadow' | 'base' | 'brow' | 'liner';

  shadeOptions: ShadeOption[];
  attributes: {
    colorFamily?: string | null;
    undertone?: string | null;
    intensity?: string | null;
    finish?: string | null;
    texture?: string | null;
    suitableFor: string[];
    sellingPoints: string[];
  };

  liveOffer: {
    priceKrw: number;
    priceTier: string;
    purchaseUrl: string;
    imageUrl: string;
  };

  retailPresence: {
    oliveYoung: PositiveListing;
    departmentStore: PositiveListing;
  };

  brandOrigin: {
    brandCountry?: string | null;
    madeInCountry?: string | null;
  };

  attributeConfidence: Record<string, number>;
  hardFilterEligible: Record<string, boolean>;
  evidence: ProductEvidence[];
  qualityFlags: string[];
  updatedAt: string;
};
```

---

## 4. raw title residual keyword 보강

사용자 판단대로, 못 찾은 필드는 raw 제목에서 제품명을 빼고 남은 표현을 키워드로 뽑는 방식이 가장 현실적이다. 단, 이 값은 **정답 필드가 아니라 inferred evidence**로 다룬다.

### 4.1 처리 순서

```txt
1. rawTitle 확보
   - catalog_items_seed에 rawTitle이 없으면 기존 Top10 입력의 sourceCandidateId/naver productId로 join한다.

2. productName 정규화
   - HTML tag 제거
   - 브랜드 alias 제거
   - 괄호/대괄호 기획 문구 분리
   - 용량/수량/증정/기획/단품/세트/리필/본품/케이스/브러쉬 증정 같은 판매 문구 분리

3. residual 계산
   - normalized rawTitle에서 normalized productName 토큰을 제거한다.
   - 남은 토큰을 color/finish/texture/selling keyword 후보로 분류한다.

4. keyword mapping
   - 색상: pink, rose, coral, red, orange, mauve, brown, nude, peach, burgundy
   - undertone: warm, cool, neutral
   - intensity: sheer, medium, bold
   - finish: matte, glossy, satin, sheer, velvet, shimmer
   - texture: balm, tint, cream, powder, gel, stick, pencil, liquid
   - sellingPoints: glow, blur, longwear, moisturizing, lightweight, daily, vegan 등 제한 whitelist

5. evidence 저장
   - sourceType = title_residual_rule_inferred
   - confidence = 0.45~0.62
   - matchedToken, normalizedToken, field, value를 evidence에 남긴다.

6. 승격 규칙
   - 이미 공식/리테일 근거가 있는 필드는 덮어쓰지 않는다.
   - 비어 있는 필드만 soft inferred value로 채운다.
   - hardFilterEligible은 기본 false.
   - 독립 source 2개 이상이 같은 값을 주거나 field-specific cutoff를 넘을 때만 hard 승격을 검토한다.
```

### 4.2 title residual 보강의 MVP 역할

```txt
hard filter:
  거의 사용하지 않음.

soft rerank:
  사용자 질의와 맞으면 점수 보정.

RAG text:
  검색될 수 있도록 chunk에 포함하되 "추론" marker를 붙임.

card copy:
  확정 표현 금지.
  예: "제품명과 판매 문구상 글로우/블러 계열로 보여요."
```

### 4.3 금지 규칙

```txt
- "쿨톤용" 같은 적합 대상은 title residual 하나만으로 확정하지 않는다.
- "올리브영 입점 안 됨"처럼 unknown을 negative로 바꾸지 않는다.
- "공식 호수"라고 표현하지 않는다.
- "제조국"은 title residual로 만들지 않는다.
```

---

## 5. Knowledge chunk 설계

### 5.1 chunk type

`product_knowledge_docs_20260703.jsonl`를 바로 embedding해도 되지만, MVP 검색 품질을 위해 chunk를 다시 나눈다.

```txt
product_overview
  브랜드, 제품명, 카테고리, 가격대, 판매처, 이미지/구매 가능성.

shade_color
  shadeOptions, colorFamily, undertone, intensity.
  색상/톤/호수 검색에 사용.

finish_texture
  finish, texture, 발림/광/매트/벨벳/쉬머 등.

suitability_claims
  suitableFor, sellingPoints.
  "데일리", "촉촉", "블러", "롱웨어" 같은 soft intent에 사용.

retail_origin
  올리브영/백화점 positive listing, brandCountry, madeInCountry.
```

### 5.2 chunk text 원칙

```txt
- raw HTML, 리뷰, 전성분은 넣지 않는다.
- evidence source와 confidence를 metadata로 둔다.
- hardFilterEligible=false인 값은 text에는 넣되 metadata에서 soft_only=true로 둔다.
- 옵션이 여러 개인 상품은 "상품 전체 색상"과 "옵션 색상"을 분리한다.
- 한 상품 안에 여러 shadeOptions가 있으면 검색 결과는 상품 단위로 aggregate한다.
```

### 5.3 chunk metadata

```ts
type ProductKnowledgeChunk = {
  chunkId: string;
  catalogItemId: string;
  sourceCandidateId: string;
  chunkType:
    | 'product_overview'
    | 'shade_color'
    | 'finish_texture'
    | 'suitability_claims'
    | 'retail_origin';
  text: string;
  fields: string[];
  confidence: Record<string, number>;
  hardFilterEligible: Record<string, boolean>;
  softOnlyFields: string[];
  evidenceSourceTypes: string[];
  category: string;
  brandName: string;
  priceKrw: number;
  priceTier: string;
};
```

---

## 6. Retrieval / ranking 설계

### 6.1 1차 후보 생성

```txt
입력 prompt
-> intent parser가 category, price, channel, finish, texture, colorFamily 후보를 추출
-> locked filter와 soft preference 분리
-> catalog_items_mvp에서 필수 조건을 먼저 필터링
```

필수 조건 예:

```txt
- category가 명시되어 있고 seed에 있으면 category hard filter
- 가격 조건은 liveOffer.priceKrw로 hard filter
- "올리브영에서"는 oliveYoungListed=true positive filter
- "백화점"은 departmentStoreListed=true positive filter
- 이미지/링크/가격 없는 상품은 결과 제외
```

### 6.2 2차 RAG 검색

```txt
prompt embedding
-> product_knowledge_chunk_embeddings_mvp top-k
-> catalogItemId 단위로 aggregate
-> chunkType별 가중치 적용
```

권장 가중치:

```txt
explicit locked filter match: +3.0
hard eligible attribute match: +2.0
soft inferred attribute match: +0.7
semantic top-k score: +0.0~1.5
price match: +1.0
positive channel match: +1.0
fresh live offer available: +0.5
low confidence contradiction: -1.0
missing image/link/price: exclude
```

### 6.3 질문 선택

질문은 LLM이 고르지 않는다. 서버가 고른다.

```txt
질문 후보 필드:
- finish
- texture
- priceTier
- channel
- colorFamily는 coverage가 충분할 때만

질문 제외 필드:
- undertone: hard coverage가 너무 낮음
- intensity: hard coverage 0
- suitableFor: hard coverage 0
- madeInCountry: 사용자 질의에 직접 등장할 때만
```

질문 선택 기준:

```txt
1. 현재 후보군을 실제로 줄이는가?
2. hard/soft confidence가 충분한가?
3. 사용자가 이미 말한 조건을 다시 묻지 않는가?
4. 데모 UX상 자연스러운가?
5. 최대 3턴 안에 결과로 갈 수 있는가?
```

---

## 7. Bedrock 연결 방식

### 7.1 MVP 기본값

MVP에서는 AWS Bedrock을 아래처럼 얇게 연결한다.

```txt
Embedding:
  Bedrock Runtime invoke_model 또는 converse embedding API
  기본 후보: amazon.titan-embed-text-v2:0
  실제 model id / inference profile은 AWS 계정의 enabled model 기준으로 확인

LLM:
  Bedrock Converse API
  Claude 또는 Nova 계열 중 계정에서 사용 가능한 모델
  intent/copy 보조만 담당
```

모델 ID와 region은 계정/리전마다 달라질 수 있으므로 구현 직전 CLI로 확인한다.

### 7.2 CLI preflight

AWS 연결 시 먼저 아래를 확인한다.

```bash
aws sts get-caller-identity
aws configure list
aws bedrock list-foundation-models --region <region>
```

그 다음 smoke test를 한다.

```txt
1. embedding model access 확인
2. chat/converse model access 확인
3. 1개 chunk embedding 생성
4. 1개 query embedding 생성
5. cosine search 결과가 나오는지 확인
6. LLM 실패 시 deterministic fallback이 동작하는지 확인
```

### 7.3 지금 필요한 AWS 정보

구현할 때 사용자에게 받을 수 있는 정보:

```txt
필수:
- AWS profile 이름 또는 현재 shell에 세팅된 credential 사용 여부
- AWS region
- Bedrock embedding model id 또는 inference profile ARN
- Bedrock chat model id 또는 inference profile ARN

선택:
- 이미 만든 Bedrock Knowledge Base ID
- 이미 만든 Bedrock Agent ID
- Agent Alias ID
- S3 bucket / prefix
- backend action group으로 연결할 공개 URL
- Naver live refresh를 할 경우 Naver client id / secret
```

단, MVP 1차 구현은 Bedrock Knowledge Base / managed Agent ID 없이도 가능하다.

---

## 8. 백엔드 구현 계획

### 8.1 새 패키지

기존 `services/backend/app/services/auradin_catalog`는 수집/정규화 계층으로 유지한다. 검색 에이전트는 별도 패키지로 만든다.

```txt
services/backend/app/services/auradin_agent/
  __init__.py
  catalog_loader.py
  title_keyword_extractor.py
  knowledge_chunk_builder.py
  embedding_client.py
  vector_index.py
  intent_parser.py
  retrieval_service.py
  question_engine.py
  ranking.py
  session_manager.py
```

### 8.2 API

```txt
services/backend/app/api/search_sessions.py
```

계약:

```txt
POST /api/search/sessions
GET  /api/search/sessions/{sessionId}
POST /api/search/sessions/{sessionId}/answer
```

기존 응답 envelope를 유지한다.

```txt
{ data, meta, error }
```

### 8.3 파일 기반 MVP index

501 catalog rows / 1002 docs 규모에서는 pgvector나 Bedrock Knowledge Base 없이도 충분하다.

```txt
서버 시작 시:
  catalog_items_mvp_20260703.jsonl load
  product_knowledge_chunk_embeddings_mvp_20260703.jsonl load
  numpy 없이 pure Python cosine 또는 optional numpy

장점:
  데모 안정적
  인프라 적음
  Bedrock 호출 실패 시 캐시로 계속 동작

Phase 2:
  Postgres pgvector 또는 Bedrock Knowledge Base sync
```

### 8.4 검색 세션 응답을 모바일 제품 카드로 매핑

Backend `SearchTurn.result`는 모바일이 바로 제품추천 카드로 그릴 수 있게 `RecommendedProduct` 호환 필드를 포함해야 한다.

```ts
type AuradinSearchResult = {
  headerLabel: string;
  contextSummary?: string;
  appliedFilters: {
    label: string;
    source: 'prompt' | 'question' | 'report' | 'fallback';
    confidence?: number;
  }[];
  products: {
    id: string;
    brandName: string;
    productName: string;
    shadeName: string;
    category: 'lip' | 'cheek' | 'shadow' | 'liner' | 'base';
    matchRate: number;
    price: number;
    tags: string[];
    imageUrl: string;
    purchaseUrl: string;
    palette: string[];
    productInfo?: {
      brand?: string;
      colors?: string[];
      effects?: string[];
      features?: string[];
      maker?: string;
      origin?: string;
      productNumber?: string;
      skinTypes?: string[];
      tones?: string[];
    };
    reason: string;
    evidenceSummary?: string[];
    softOnlyFields?: string[];
  }[];
};
```

프론트 매핑 규칙:

```txt
- imageUrl + purchaseUrl이 모두 있는 product만 표시한다.
- priceKrw가 내려오면 price로 매핑한다.
- matchRate는 0~100 정수로 제한한다.
- low-confidence title residual 근거는 tag보다 reason/evidenceSummary에 약하게 표현한다.
- palette가 없으면 category별 안전 fallback swatch를 사용한다.
- products가 비어 있으면 fallback mock product로 몰래 채우지 않고 empty state를 보여준다.
```

### 8.5 모바일 구현 계획

모바일은 `apps/mobile/src/features/recommendation` 안에서 통합한다.

```txt
apps/mobile/src/features/recommendation/
  components/
    ProductRecommendationCard.tsx
    AuradinResultProductGrid.tsx
    AuradinPromptComposer.tsx
    AuradinQuestionPanel.tsx
    AuradinContextBar.tsx
  services/
    auradinSearchService.ts
    productRecommendationService.ts
  screens/
    AuradinSearchScreen.tsx
    ProductRecommendationScreen.tsx
```

역할:

```txt
ProductRecommendationCard
  - 기존 ProductRecommendationScreen의 ProductCard를 분리.
  - 좋아요, 구매 링크, 이미지, 가격, match badge를 공용 처리.

AuradinSearchScreen
  - home/searching/question/results phase를 유지.
  - results phase에서 AuradinResultProductGrid를 렌더링.
  - reportId/source context를 받을 수 있게 props 확장.

auradinSearchService
  - createAuradinSearchSession(prompt, context)
  - getAuradinSearchTurn(sessionId)
  - answerAuradinQuestion(sessionId, questionId, optionId)
  - backend base URL이 없으면 기존 auradin mock으로 fallback.

ProductRecommendationRouteScreen
  - MVP에서는 ProductRecommendationScreen 대신 AuradinSearchScreen을 렌더링.
  - sourceReportId를 AuradinSearchScreen에 전달.
  - 촬영/갤러리 변경 액션은 기존 FaceCapture route로 유지.

ProductRecommendationScreen
  - 당장 삭제하지 않는다.
  - 통합 후에도 legacy/reference 화면으로 보존하거나, 카드/모달 컴포넌트 제공자로 남긴다.
```

route 전략:

```txt
MVP:
  Root route name은 `ProductRecommendation` 유지.
  화면 title/copy만 Auradin 중심으로 변경.

Phase 2:
  `AuradinSearch` route를 별도로 만들고,
  ProductRecommendation은 legacy redirect 또는 alias로 둘 수 있다.
```

---

## 9. 구현 순서

### Phase 0. 데이터 잠금

```txt
- 20260703 수집본을 MVP input으로 고정
- line count와 schema snapshot 생성
- 기존 untracked 수집 산출물은 건드리지 않고 읽기 입력으로만 사용
```

완료 기준:

```txt
- reports/auradin/mvp_preprocessing_quality_20260703.md 초안 생성
- 입력 파일별 row count / hash / schema key 목록 기록
```

### Phase 1. catalog_items_mvp 생성

```txt
- seed row schema validate
- sourceCandidateId join으로 rawTitle 보강
- normalizedProductName 생성
- title residual keyword 추출
- evidence merge
- hardFilterEligible 재계산
- qualityFlags 추가
- catalog_items_mvp_20260703.jsonl 저장
```

완료 기준:

```txt
- 가격/링크/이미지 100%
- productName/brand/category 100%
- qualityFlags로 bundle/live/refill/case/mini/tool noise 표시
- title residual 추론값은 softOnly 처리
```

### Phase 2. knowledge chunks 생성

```txt
- 5개 chunk type으로 분리
- chunk text와 metadata 생성
- softOnlyFields / evidenceSourceTypes 기록
- ProductKnowledgeChunk jsonl 저장
```

완료 기준:

```txt
- chunkId stable
- catalogItemId foreign key 100%
- raw crawl text 미포함
- source confidence 표시
```

### Phase 3. Bedrock embedding 캐시 생성

```txt
- AWS CLI profile/region preflight
- embedding smoke test
- chunk embedding batch 생성
- 실패 row 재시도
- embedding cache jsonl 저장
```

완료 기준:

```txt
- chunk count와 embedding count 일치
- dimension 일관성 검증
- 빈 text / 너무 긴 text 제외 리포트
```

### Phase 4. retrieval / ranking 구현

```txt
- prompt intent parser
- locked filter와 soft preference 분리
- catalog hard filter
- vector top-k
- product aggregate
- score blend
- final top candidates 반환
```

완료 기준:

```txt
- 고정 질의 5개에서 top-k 결과 생성
- 가격/채널 hard filter가 실제로 지켜짐
- confidence 낮은 필드는 ranking 보정만 함
```

### Phase 5. question engine 구현

```txt
- 후보군 coverage 계산
- information gain 계산
- 묻지 말아야 할 필드 제외
- 1~3턴 session state 관리
- noop / 둘 다 좋아요 옵션 제공
```

완료 기준:

```txt
- 이미 명시된 조건을 다시 묻지 않음
- 후보군이 충분히 좁혀지면 바로 results
- 질문 후 결과가 실제로 바뀜
```

### Phase 6. API 연결

```txt
- search_sessions router 추가
- session_manager 연결
- app/api/router.py에 include
- error/expired/failed 처리
```

완료 기준:

```txt
- POST -> GET polling -> question/results
- answer -> GET polling -> next turn/results
- standard response envelope 유지
```

### Phase 7. Bedrock LLM 보조

```txt
- deterministic intent parser를 기본값으로 둔다.
- Bedrock LLM은 JSON intent refinement와 copy generation만 수행한다.
- timeout / failure fallback 필수.
```

완료 기준:

```txt
- LLM off에서도 검색 가능
- LLM on에서는 카피만 더 자연스러움
- LLM이 없는 필드를 만들어내지 않음
```

### Phase 8. 모바일 카드 공용화

```txt
- ProductRecommendationScreen 내부 ProductCard를 공용 컴포넌트로 분리
- purchaseUrl open, like/unlike, imageUrl -> {uri} 처리 유지
- 기존 ProductRecommendationScreen에서 새 공용 컴포넌트를 사용하게 변경
- 시각 스타일은 현재 제품추천 카드의 밀도와 아우라딘 results tone 사이에서 조정
```

완료 기준:

```txt
- 기존 제품추천 화면 동작이 깨지지 않음
- 좋아요 토글과 구매 링크 열기가 그대로 동작
- 공용 카드가 Auradin results에서도 재사용 가능
```

### Phase 9. Auradin UI와 제품추천 결과 통합

```txt
- auradinSearchService를 backend `/search/sessions` 계약에 맞게 구현
- AuradinSearchScreen props에 sourceReportId/context 추가
- home/searching/question/results phase를 backend SearchTurn과 연결
- results phase에서 RecommendedProduct-compatible grid/carousel 렌더링
- ProductRecommendationRouteScreen이 AuradinSearchScreen을 렌더링하도록 전환
- routeChrome title/copy를 Auradin 중심으로 수정
- unsupported category / empty / expired / backend unavailable 상태 추가
```

완료 기준:

```txt
- `ProductRecommendation` route로 들어오면 아우라딘 UI가 열린다.
- reportId가 있으면 기준 보고서 context가 화면과 검색 요청에 반영된다.
- prompt만으로도 제품 검색이 가능하다.
- 질문 option tap 후 결과 product list가 바뀐다.
- 결과 카드에서 찜하기와 구매 링크가 동작한다.
- API base URL이 없으면 mock Auradin demo가 유지된다.
```

### Phase 10. E2E polish

```txt
- quick prompt를 실제 MVP seed 범위에 맞게 조정
- `립/치크/섀도우` 지원 범위 안내를 자연스럽게 노출
- 조건 chip/applied filter bar 추가
- "다시 찾기"와 "조건 완화" 액션 추가
- 결과 reason에서 confidence 낮은 추론값은 확정 표현하지 않게 카피 조정
- VoiceOver/accessibility label에 브랜드/제품명/가격/구매 가능성을 포함
```

완료 기준:

```txt
- 처음 진입한 사용자가 입력 -> 질문 -> 결과 -> 구매/찜까지 막힘 없이 간다.
- 빈 결과에서도 다음 행동이 보인다.
- 버튼/카드 텍스트가 작은 모바일 화면에서 넘치지 않는다.
```

---

## 10. 테스트와 평가

### 10.1 단위 테스트

```txt
services/backend/tests/test_auradin_title_keyword_extractor.py
services/backend/tests/test_auradin_mvp_catalog_loader.py
services/backend/tests/test_auradin_knowledge_chunk_builder.py
services/backend/tests/test_auradin_vector_index.py
services/backend/tests/test_auradin_retrieval_service.py
services/backend/tests/test_auradin_question_engine.py
services/backend/tests/test_auradin_search_sessions_api.py
apps/mobile/src/features/recommendation/services/auradinSearchService.test.ts
apps/mobile/src/features/recommendation/components/ProductRecommendationCard.test.tsx
apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.test.tsx
apps/mobile/src/app/navigation/navigation.test.ts
```

### 10.2 고정 평가 질의

```txt
1. 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
2. 데일리로 쓸 만한 제품 추천해줘
3. 올리브영에서 살 수 있는 데일리 립
4. 면접용 자연스러운 블러셔, 너무 붉지 않게
5. 글리터 강한 아이섀도우 말고 은은한 쉬머
```

### 10.3 합격 기준

```txt
- 결과 카드의 모든 상품에 가격/이미지/구매 URL이 있음
- 명시 가격 조건 위반 0건
- 명시 채널 조건 위반 0건
- low-confidence title inference를 확정 표현하지 않음
- 질문은 최대 3회
- 질문 하나 이상에서 후보군이 실제로 줄어듦
- lip/cheek/shadow 질의는 결과를 반환
- base/brow/liner 질의는 seed 부족 fallback 또는 명시적인 범위 안내
- ProductRecommendation route에서 Auradin 통합 화면이 열린다
- reportId 진입 시 기준 보고서 context가 검색 요청에 포함된다
- 결과 카드에서 purchaseUrl open과 like/unlike가 동작한다
- API base URL 없음 / backend 실패 / expired session / no result 상태가 각각 깨지지 않는다
```

### 10.4 모바일 E2E 검증 시나리오

```txt
1. 홈/추천 진입점 -> ProductRecommendation route -> Auradin home phase
2. quick chip "쿨톤 글로시 립" 선택 -> searching -> question 또는 results
3. question option 선택 -> results -> 첫 상품 구매 링크 열기
4. 첫 상품 찜하기 -> LikedProductList에서 확인
5. FaceCapture 완료 후 ProductRecommendation 진입 -> reportId context 반영
6. 보고서 상세에서 특정 reportId로 진입 -> 기준 보고서 요약 표시
7. "올리브영에서 살 수 있는 데일리 립" -> oliveYoung positive listing만 hard filter
8. "글리터 강한 아이섀도우 말고 은은한 쉬머" -> shadow 결과 반환
9. "브로우 추천해줘" -> unsupported/fallback 안내
10. backend off 상태 -> mock Auradin demo 표시
```

실행 명령:

```bash
npm --prefix apps/mobile run typecheck
```

---

## 11. 운영 리스크

### 11.1 데이터 리스크

```txt
리스크:
  undertone/intensity/suitableFor는 hard filter로 쓰기 어렵다.

대응:
  질문 후보에서 제외하고 soft rerank/copy에만 사용한다.
```

```txt
리스크:
  productName 자체가 여전히 Naver title 성격을 가진 행이 있다.

대응:
  normalizedProductName과 residualTitleKeywords를 분리하고,
  판매 문구는 qualityFlags로 관리한다.
```

```txt
리스크:
  한 상품에 여러 shadeOptions가 있어 product-level color가 섞인다.

대응:
  product-level attribute와 shade-level option을 분리하고,
  "옵션 중 pink 계열"처럼 표현한다.
```

### 11.2 AWS 리스크

```txt
리스크:
  Bedrock model access / region / inference profile이 계정마다 다르다.

대응:
  CLI preflight 후 model id를 확정한다.
  embedding cache를 파일로 남겨 재호출 없이 데모 가능하게 한다.
```

```txt
리스크:
  Bedrock managed Agent로 바로 가면 action group, KB, IAM, endpoint 연결 때문에 데모가 늦어진다.

대응:
  MVP는 app-level deterministic agent + Bedrock Runtime.
  managed Agent/KB는 phase 2로 연결한다.
```

---

## 12. 지금 바로 필요한 결정

구현을 시작하려면 아래만 정하면 된다.

```txt
1. MVP 검색 범위
   - 권장: lip / cheek / shadow만 1차 공개
   - base / brow / liner는 fallback 또는 "준비 중" 처리

2. vector index
   - 권장: 파일 기반 embedding cache + in-memory cosine
   - phase 2: pgvector 또는 Bedrock Knowledge Base

3. AWS 연결
   - AWS profile 이름
   - region
   - embedding model id 또는 inference profile
   - chat model id 또는 inference profile

4. agent 형태
   - 권장: repo backend app-level agent
   - 선택: 이후 Bedrock managed Agent wrapper

5. 모바일 route 전략
   - 권장: 기존 `ProductRecommendation` route를 Auradin 통합 화면으로 전환
   - 선택: phase 2에서 `AuradinSearch` route를 별도로 추가

6. 제품추천 legacy 화면 처리
   - 권장: 삭제하지 않고 공용 컴포넌트 추출 후 legacy/reference로 보존
   - ProductCard, LookSummary, liked product action은 재사용 가능한 단위로 분리

7. report context
   - 권장: reportId가 있으면 Auradin prompt/context에 자동 반영
   - reportId가 없어도 free prompt search는 가능해야 함
```

---

## 13. 한 줄 결론

지금 할 일은 더 긁는 것이 아니라, **501개 partial seed를 정직하게 정규화하고, raw title residual을 soft keyword로 보강한 뒤, Bedrock embedding + 서버 결정론 질문 루프를 붙이고, 그 결과를 기존 제품추천 카드/찜/구매 UI와 합쳐 사용자가 입력부터 구매까지 한 흐름으로 느끼는 아우라딘 MVP를 완성하는 것**이다.
