# Auradin 후처리·임베딩·검색 에이전트 구축 컨텍스트

작성일: 2026-07-02 KST  
대상 repo: `AURA-cosmetic-search-engine`  
용도: 크롤링 완료 이후, 다음 에이전트가 **전처리 → catalog 승격 → knowledge chunking → embedding/indexing → 아우라딘 검색 에이전트 연결**을 이어서 구현하기 위한 실행 컨텍스트

---

## 0. 한 줄 결론

크롤링이 끝난 뒤의 다음 목표는 **크롤링 결과를 바로 추천에 쓰는 것**이 아니라, 아래 순서로 **검색 가능한 제품 catalog와 agent loop**로 바꾸는 것이다.

```txt
raw crawl data
-> audit / dedup / normalize
-> ProductCatalogItem
-> ProductKnowledgeDocument
-> ProductKnowledgeChunk
-> Titan embedding / vector index
-> top-k retrieval
-> productId/shadeId aggregation
-> rule + semantic rerank
-> information-gain question loop
-> Naver live offer check
-> recommendation cards
```

핵심 원칙은 변하지 않는다.

```txt
추천 판단의 기준 = ProductCatalogItem
검색 보조 = ProductKnowledgeChunk + embedding/RAG
현재 가격/구매 가능성 = Naver Shopping live offer
문장/질문 자연어화 = LLM
후보 선택/질문 여부/필터 적용 = 서버 결정론 로직
```

---

## 1. 현재 상황

### 1.1 이미 완료 또는 진행 중인 것

- 제품 데이터 크롤링이 거의 완료된 상태다.
- AWS 계정은 사용자 계정으로 연결된 상태다.
- 이후 단계에서 Bedrock을 사용할 수 있다.
- 기존 크롤링 계획 문서가 있다.
  - `AURADIN_PRODUCT_CATALOG_CRAWLING_PLAN_KO.md`
- 기존 아우라딘 대화형 검색 MVP 실행 스펙이 있다.
  - `AURADIN_SEARCH_AGENT_BUILD_PLAN.md`
- 기존 제품 추천 구현 컨텍스트가 있다.
  - `COSMETIC_RECOMMENDATION_AGENT_CONTEXT_KO.md`

### 1.2 현재 프로젝트의 중요한 제약

현재 Naver Shopping API 또는 기존 수집 경로에서 안정적으로 얻는 정보는 대략 아래 수준이다.

```txt
title
link
image
productId
lprice
brand
maker
mallName
category1
category2
category3
category4
```

반대로 아래 정보는 Naver Shopping API가 구조화해서 안정적으로 주는 값이 아니다.

```txt
shadeName
호수/옵션 단위 색상
colorFamily
undertone
finish
texture
intensity
skinTypeTags
coverage
review keywords
전성분
정확한 퍼스널컬러 적합도
```

따라서 이 값들은 아래 중 하나로 만들어야 한다.

```txt
1. 크롤링 상세정보에서 추론
2. 공식몰/상세페이지/상품정보 테이블에서 추출
3. LLM/rule parser로 구조화
4. confidence/evidence를 붙여 보수적으로 사용
5. 중요한 대표 상품은 manual_reviewed로 승격
```

---

## 2. Bedrock 사용 결정

### 2.1 지금 단계에서 쓰는 것

지금은 **Amazon Bedrock AgentCore**가 아니라 **일반 Bedrock Runtime/Converse + Titan Embedding** 중심으로 간다.

사용 목적:

```txt
Bedrock Titan Embedding
- ProductKnowledgeChunk embedding
- query/report/recipe embedding
- cosine similarity 기반 semantic score

Bedrock Claude 또는 다른 LLM
- 사용자 프롬프트 구조화 보조
- 질문/옵션 카피 자연어화
- 추천 카드 설명 생성
- crawler enrichment 결과를 구조화하는 선택적 보조
```

### 2.2 지금 단계에서 쓰지 않는 것

```txt
Bedrock AgentCore
- 지금 MVP에는 과하다.
- production agent runtime, identity, gateway, observability가 필요해질 때 검토한다.

Bedrock Agents
- 지금 core loop에 넣지 않는다.
- 모델이 후보 생성, 질문 여부, filterDelta를 좌우하면 안 된다.
- 나중에 wrapper 또는 일부 action orchestration으로만 검토한다.

Bedrock Knowledge Bases
- 바로 필수는 아니다.
- ProductKnowledgeDocument/chunk 구조가 안정화되면 phase 2에서 sync한다.
```

### 2.3 AWS 환경 변수 후보

실제 repo의 settings 구조를 확인하고 이름을 맞춰야 한다. 초안은 아래와 같다.

```bash
AWS_REGION=ap-northeast-2
BEDROCK_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
BEDROCK_CONVERSATION_MODEL_ID=<claude-or-nova-model-id>
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

주의:

```txt
- credential은 절대 git에 커밋하지 않는다.
- .env, secrets manager, local shell env 중 하나로만 관리한다.
- smoke test 전에는 AWS region과 model access를 확인한다.
```

---

## 3. 다음 에이전트가 만들어야 하는 산출물

### 3.1 데이터 산출물

```txt
data/auradin/raw/raw_items.jsonl
  크롤링 원본. 가능하면 변형 없이 저장.

reports/auradin/crawl_audit_report.md
  수집 품질 리포트.

data/auradin/processed/product_candidates.jsonl
  중복 제거, 브랜드/카테고리 정규화가 끝난 후보.

data/auradin/catalog/catalog_items_seed.jsonl
  추천 엔진이 기준으로 삼는 ProductCatalogItem.

data/auradin/knowledge/product_knowledge_docs.jsonl
  catalog row에서 파생된 검색용 문서.

data/auradin/knowledge/product_knowledge_chunks.jsonl
  embedding/indexing 대상 chunk.

data/auradin/embeddings/product_knowledge_chunk_embeddings.jsonl
  chunk embedding cache. MVP에서는 파일 cache 허용.

reports/auradin/retrieval_eval_report.md
  top-k 검색 품질 평가.

reports/auradin/auradin_eval_report.md
  고정 질문 기반 end-to-end 평가.
```

### 3.2 코드 산출물 후보

실제 repo 구조에 맞춰 위치는 조정한다. backend가 Python이면 아래 이름을 우선 제안한다.

```txt
services/backend/app/services/auradin/catalog_normalizer.py
services/backend/app/services/auradin/knowledge_doc_builder.py
services/backend/app/services/auradin/chunk_builder.py
services/backend/app/services/auradin/bedrock_embedding_client.py
services/backend/app/services/auradin/embedding_indexer.py
services/backend/app/services/auradin/retrieval_service.py
services/backend/app/services/auradin/search_intent.py
services/backend/app/services/auradin/search_engine.py
services/backend/app/services/auradin/question_engine.py
services/backend/app/services/auradin/live_offer_service.py
services/backend/app/api/search_sessions.py

services/backend/scripts/auradin_audit_crawl.py
services/backend/scripts/auradin_build_catalog.py
services/backend/scripts/auradin_build_knowledge_docs.py
services/backend/scripts/auradin_build_chunks.py
services/backend/scripts/auradin_embed_chunks.py
services/backend/scripts/auradin_retrieval_smoke.py
services/backend/scripts/smoke_bedrock_embedding.py
services/backend/scripts/smoke_bedrock_llm.py
```

테스트 후보:

```txt
services/backend/tests/test_auradin_catalog_normalizer.py
services/backend/tests/test_auradin_chunk_builder.py
services/backend/tests/test_auradin_retrieval.py
services/backend/tests/test_auradin_question_engine.py
services/backend/tests/test_auradin_search_sessions.py
```

---

## 4. Phase A — Raw crawl audit

### 4.1 목적

크롤링 결과가 추천 엔진에 넣을 만큼 충분한지 확인한다.

### 4.2 필수 지표

`crawl_audit_report.md`에 아래를 기록한다.

```txt
총 raw item 수
브랜드별 item 수
카테고리별 item 수
중복 productId 수
동일 title 중복 수
imageUrl 없는 item 수
purchaseUrl/link 없는 item 수
가격 없는 item 수
브랜드 whitelist 밖 item 수
비화장품 의심 item 수
수동 검수 필요한 item 수
호수 추론 가능 item 수
finish/texture 추론 가능 item 수
colorFamily/undertone 추론 가능 item 수
```

### 4.3 reject 규칙

아래 항목은 candidate 단계에서 제거하거나 `blocked` 처리한다.

```txt
비화장품 카테고리
패션/의류/신발/주얼리/생활용품
중고/렌탈/벌크/대용량/해외구매 중심 상품
이미지 없음
구매 링크 없음
가격 없음
브랜드 whitelist 밖 상품
상품명이 카테고리와 명백히 불일치하는 항목
```

### 4.4 브랜드 whitelist / alias

최소 아래 브랜드를 지원한다.

```json
{
  "데이지크": ["데이지크", "dasique"],
  "롬앤": ["롬앤", "romand", "rom&nd"],
  "페리페라": ["페리페라", "peripera"],
  "웨이크메이크": ["웨이크메이크", "wakemake"],
  "클리오": ["클리오", "clio"],
  "투쿨포스쿨": ["투쿨포스쿨", "too cool for school", "toocoolforschool"],
  "컬러그램": ["컬러그램", "colorgram"],
  "하트퍼센트": ["하트퍼센트", "heart percent", "heartpercent"],
  "에뛰드": ["에뛰드", "etude"],
  "3CE": ["3CE", "쓰리씨이", "stylenanda 3ce"],
  "뮤드": ["뮤드", "mude"],
  "정샘물 뷰티": ["정샘물", "정샘물 뷰티", "jungsaemmool", "jung saem mool"],
  "에스쁘아": ["에스쁘아", "espoir"],
  "VDL": ["VDL", "브이디엘"],
  "더샘": ["더샘", "the saem", "thesaem"],
  "네이밍": ["네이밍", "naming"],
  "라카": ["라카", "laka"]
}
```

---

## 5. Phase B — ProductCatalogItem 정규화

### 5.1 목적

크롤링/검색 후보를 추천 엔진의 기준 데이터로 변환한다. 이 데이터는 RAG용 텍스트가 아니라 **정규화된 원본 catalog**다.

### 5.2 권장 schema

```ts
type ProductCatalogItem = {
  productId: string;
  sourceProductId?: string;
  sourceType: 'manual' | 'naver_api' | 'brand_feed' | 'partner_feed' | 'allowed_static_collect';
  dataPermission: 'owned' | 'api_allowed' | 'partner_allowed' | 'manual_reviewed' | 'unknown_blocked';
  status: 'candidate' | 'inferred' | 'manual_reviewed' | 'blocked';

  brand: string;
  productName: string;
  variantName?: string;
  shadeName?: string;
  shadeSource?: 'title_inferred' | 'llm_inferred' | 'html_verified' | 'manual' | 'unknown';
  category: 'lip' | 'cheek' | 'shadow' | 'liner' | 'base' | 'brow' | 'other';

  colorHex?: string;
  colorLab?: { l: number; a: number; b: number };
  colorFamily?: 'pink' | 'rose' | 'coral' | 'red' | 'orange' | 'mauve' | 'brown' | 'nude' | 'peach' | 'burgundy' | 'unknown';
  undertone?: 'warm' | 'cool' | 'neutral' | 'unknown';
  finish?: 'matte' | 'gloss' | 'dewy' | 'velvet' | 'satin' | 'shimmer' | 'sheer' | 'unknown';
  texture?: 'tint' | 'balm' | 'lipstick' | 'gloss' | 'cream' | 'powder' | 'pencil' | 'liquid' | 'cushion' | 'unknown';
  intensity?: 'sheer' | 'medium' | 'full' | 'bold' | 'unknown';

  priceBand?: 'under_10000' | '10000_20000' | '20000_30000' | '30000_plus' | 'unknown';
  skinTypeTags?: string[];
  featureTags?: string[];
  cautionTags?: string[];
  containerType?: string;
  officialDescription?: string;

  liveOfferSnapshot?: {
    source: 'naver_shopping' | 'oliveyoung' | 'brand_store' | 'other';
    link: string;
    image?: string;
    lprice?: number;
    mallName?: string;
    fetchedAt: string;
    ttlSeconds?: number;
  };

  confidence: Record<string, number>;
  evidence: Array<{
    field: string;
    sourceType: string;
    sourceUrl?: string;
    rawText: string;
  }>;
  sourceUrls: string[];
  updatedAt: string;
};
```

### 5.3 정규화 원칙

```txt
- productId는 stable해야 한다.
- productId/shadeId를 구분할 수 있으면 shadeId까지 만든다.
- 호수 단위 정보가 불명확하면 productPrecision='product' 또는 shadeSource='unknown'으로 둔다.
- 자동 추론값은 confidence를 반드시 붙인다.
- evidence 없이 confidence 높은 값을 만들지 않는다.
- manual_reviewed가 아닌 값은 사용자에게 확정적으로 말하지 않는다.
```

### 5.4 예시

```json
{
  "productId": "romand-glasting-color-gloss-01-peony-ballet",
  "sourceProductId": "naver-123456789",
  "sourceType": "allowed_static_collect",
  "dataPermission": "manual_reviewed",
  "status": "manual_reviewed",
  "brand": "롬앤",
  "productName": "글래스팅 컬러 글로스",
  "shadeName": "01 피오니 발레",
  "shadeSource": "manual",
  "category": "lip",
  "colorFamily": "pink",
  "undertone": "cool",
  "finish": "gloss",
  "texture": "gloss",
  "intensity": "sheer",
  "priceBand": "10000_20000",
  "featureTags": ["투명광", "데일리", "가벼운 발림"],
  "confidence": {
    "colorFamily": 0.86,
    "undertone": 0.74,
    "finish": 0.92,
    "texture": 0.89
  },
  "evidence": [
    {
      "field": "finish",
      "sourceType": "official_description",
      "rawText": "맑고 투명한 광택의 립 글로스"
    }
  ],
  "sourceUrls": ["https://..."],
  "updatedAt": "2026-07-02T00:00:00+09:00"
}
```

---

## 6. Phase C — ProductKnowledgeDocument 생성

### 6.1 목적

`ProductCatalogItem`을 자연어 검색에 잘 걸리는 문서로 바꾼다. 이 문서는 추천의 정답이 아니라 retrieval 보조 문서다.

### 6.2 문서 생성 원칙

```txt
- raw HTML을 바로 문서화하지 않는다.
- 정규화된 catalog field와 evidence만 사용한다.
- 제품/호수 단위로 문서를 만든다.
- productId/shadeId를 반드시 포함한다.
- 사용자가 쓸 법한 표현을 포함한다.
  예: 물먹립, 데일리, 쿨톤, 웜톤, 보송, 촉촉, 은은한 쉬머, 진하지 않은
- 과장 표현을 피한다.
- 의학적 효과를 단정하지 않는다.
```

### 6.3 문서 schema

```ts
type ProductKnowledgeDocument = {
  docId: string;
  productId: string;
  shadeId?: string;
  brand: string;
  category: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
  sourceUrls: string[];
  dataPermission: string;
  confidence: Record<string, number>;
  updatedAt: string;
};
```

### 6.4 문서 템플릿

```txt
브랜드: {brand}
제품: {productName}
호수/옵션: {shadeName}
카테고리: {categoryLabel}
색상: {colorFamily}, {undertone}, {colorDescription}
질감/마무리: {finish}, {texture}, {intensity}
추천 맥락: {usageContextTags}
잘 맞는 요청: {positiveQueryExamples}
주의할 요청: {negativeQueryExamples}
근거: {shortEvidenceSummary}
```

### 6.5 예시

```json
{
  "docId": "doc-romand-glasting-color-gloss-01",
  "productId": "romand-glasting-color-gloss",
  "shadeId": "romand-glasting-color-gloss-01-peony-ballet",
  "brand": "롬앤",
  "category": "lip",
  "title": "롬앤 글래스팅 컬러 글로스 01 피오니 발레",
  "text": "롬앤 글래스팅 컬러 글로스 01 피오니 발레는 밝은 핑크 계열의 립 글로스다. 쿨톤 데일리 립, 너무 진하지 않은 글로시 립, 투명한 물먹립을 찾는 사용자에게 후보가 될 수 있다. 마무리감은 글로시하고 가벼운 광택에 가깝다. 고발색 매트 립을 찾는 사용자에게는 우선순위가 낮다.",
  "metadata": {
    "category": "lip",
    "colorFamily": "pink",
    "undertone": "cool",
    "finish": "gloss",
    "texture": "gloss",
    "intensity": "sheer"
  },
  "dataPermission": "manual_reviewed",
  "updatedAt": "2026-07-02T00:00:00+09:00"
}
```

---

## 7. Phase D — Chunking

### 7.1 목적

검색은 chunk 단위로 수행하되, 최종 추천은 productId/shadeId 단위로 병합한다.

### 7.2 금지

```txt
- raw HTML 전체를 바로 chunking하지 않는다.
- 배송/교환/쿠폰/광고/관련상품 영역을 chunk에 넣지 않는다.
- 리뷰 원문을 무단 대량 저장/embedding하지 않는다.
- sourceUrl, productId, shadeId 없는 chunk를 만들지 않는다.
```

### 7.3 권장 chunk 타입

```txt
product_overview
  브랜드, 제품명, 카테고리, 대표 특징

shade_color
  호수명, 색상군, 언더톤, 컬러칩, colorHex/colorLab

texture_finish
  글로시, 매트, 벨벳, 쉬머, 글리터, 촉촉함, 보송함

skin_fit
  건성/지성/민감성/모든피부용, 베이스 제품 적합성

usage_context
  데일리, 면접, 청순, 트렌디, 쿨톤 메이크업, 웜톤 메이크업

caution
  고발색 주의, 끈적임 가능, 향료 확인 필요, 색상 차이 가능

review_summary
  허용된 리뷰 요약이 있을 때만 사용
```

### 7.4 chunk schema

```ts
type ProductKnowledgeChunk = {
  chunkId: string;
  docId: string;
  productId: string;
  shadeId?: string;
  chunkType: 'product_overview' | 'shade_color' | 'texture_finish' | 'skin_fit' | 'usage_context' | 'caution' | 'review_summary';
  text: string;
  metadata: {
    brand: string;
    category: string;
    colorFamily?: string;
    undertone?: string;
    finish?: string;
    texture?: string;
    intensity?: string;
    priceBand?: string;
    dataPermission: string;
    status: string;
  };
  confidence: Record<string, number>;
  sourceUrls: string[];
  tokenEstimate?: number;
  updatedAt: string;
};
```

### 7.5 권장 크기

```txt
chunk text 길이: 한국어 기준 200~600자
한 제품/호수당 chunk 개수: 2~6개
너무 긴 상세 설명은 속성별로 분해
너무 짧은 chunk는 product_overview와 합치기
```

---

## 8. Phase E — Embedding / Indexing

### 8.1 MVP 권장 방식

지금은 Bedrock Knowledge Base보다 **직접 Titan embedding batch + 간단한 vector index/cache**를 우선 권장한다.

이유:

```txt
- productId/shadeId aggregation을 직접 제어해야 한다.
- 정보이득 질문 엔진이 후보 분포를 직접 봐야 한다.
- rule score와 semantic score를 직접 합쳐야 한다.
- MVP에서는 인프라보다 디버깅 가능성이 중요하다.
```

### 8.2 embedding cache schema

```ts
type ChunkEmbeddingRecord = {
  chunkId: string;
  docId: string;
  productId: string;
  shadeId?: string;
  embeddingModelId: string;
  embeddingDimension: number;
  textHash: string;
  embedding: number[];
  createdAt: string;
};
```

### 8.3 idempotency

```txt
- chunk text + metadata 주요 필드로 textHash를 만든다.
- 같은 chunkId와 같은 textHash면 embedding을 재생성하지 않는다.
- modelId가 바뀌면 embedding을 재생성한다.
- 실패한 chunk는 failed_embeddings.jsonl에 기록한다.
```

### 8.4 Bedrock smoke test

먼저 script로 확인한다.

```bash
cd services/backend
python scripts/smoke_bedrock_embedding.py
python scripts/smoke_bedrock_llm.py
```

성공 기준:

```txt
- Titan embedding vector dimension 확인
- 한글 query embedding 성공
- Claude/LLM JSON 응답 1회 성공
- 실패 시 region/model/access/credential 문제를 구분해서 로그 출력
```

### 8.5 Bedrock Knowledge Base 전환 시점

아래 조건이 충족되면 Knowledge Base sync를 검토한다.

```txt
- ProductKnowledgeChunk schema가 안정화됨
- sourceUrl/dataPermission 정책이 정리됨
- top-k retrieval eval set이 있음
- 자체 retrieval과 KB retrieval을 비교할 수 있음
```

---

## 9. Phase F — Retrieval / Top-K / Aggregation

### 9.1 query text 생성

검색 query는 사용자 프롬프트만 쓰면 안 된다. 보고서, AR recipe, 답변 조건을 합친다.

```txt
사용자 요청: {prompt}
보고서 조건: {personalColor} {skinType} {toneSummary} {recommendedMood} {makeupGuideline}
AR recipe 조건: {region} {colorHex/colorLab} {finish} {texture} {opacity}
확정 필터: {lockedFilters}
답변 조건: {answers}
```

### 9.2 hard filter

vector 검색 전에 가능한 metadata filter를 먼저 건다.

```txt
category
brand include/exclude
price constraint
channel constraint
status != blocked
dataPermission != unknown_blocked
image/purchaseUrl 존재 여부는 final/live offer 단계에서 확인
```

### 9.3 top-k 기본값

초기값:

```txt
chunk retrieval topK = 50
product aggregation topK = 25
question candidate set = 20~40
live offer check topK = 10
final cards = 3~5
```

### 9.4 chunk -> product aggregation

검색 결과는 chunk 단위로 나오지만 최종 후보는 product/shade 단위여야 한다.

나쁜 방식:

```txt
같은 제품의 chunk 점수를 전부 sum
```

이 방식은 문서가 긴 제품을 과도하게 유리하게 만든다.

권장 방식:

```txt
aggregatedSemanticScore =
  max(bestChunkScore)
  + 0.10 * secondBestChunkScore
  + sectionMatchBonus
```

sectionMatchBonus 예시:

```txt
사용자 query에 색상 표현 많음 + shade_color chunk hit -> bonus
사용자 query에 질감 표현 많음 + texture_finish chunk hit -> bonus
사용자 query에 피부타입 표현 많음 + skin_fit chunk hit -> bonus
```

### 9.5 최종 rerank

MVP 기본 점수:

```txt
finalScore = 0.45 * semanticScore + 0.40 * ruleScore + 0.15 * popularityScore
```

RAG/chunk 구조가 안정화된 뒤 확장 점수:

```txt
finalScore =
  0.35 * ruleScore
+ 0.25 * chunkRetrievalScore
+ 0.20 * queryItemEmbeddingScore
+ 0.10 * availabilityScore
+ 0.10 * popularityScore
```

Titan embedding이 실패하면:

```txt
semanticScore = unavailable
ruleScore / popularityScore / availabilityScore로 가중치 재분배
실패해도 결과 또는 질문 loop는 계속 진행
```

---

## 10. Phase G — Search Agent Loop

### 10.1 핵심 원칙

아우라딘은 겉으로는 AI 에이전트처럼 보이지만, 실제 검색/추천 결정은 서버 로직이 한다.

```txt
LLM 가능:
- 사용자 말 구조화 보조
- 질문 카피 개선
- 추천 이유 카피 생성
- 애매한 표현을 filter candidate로 제안

LLM 금지:
- catalog 밖 제품 생성
- 가격/구매링크 생성
- 후보 생성 최종 결정
- ask/no ask 결정
- filterDelta 변경
- hard constraint 완화
```

### 10.2 API 계약 후보

```txt
POST /api/search/sessions
  req: { prompt: string, reportId?: string, makeupRecipeId?: string }
  res: { sessionId: string, phase: 'searching' }

GET /api/search/sessions/{sessionId}
  res: SearchTurn

POST /api/search/sessions/{sessionId}/answer
  req: { questionId: string, optionId: string }
  res: { sessionId: string, phase: 'searching' }
```

### 10.3 session state

```ts
type SearchSessionState = {
  sessionId: string;
  prompt: string;
  phase: 'searching' | 'question' | 'results' | 'failed' | 'expired';
  createdAt: number;
  expiresAt: number;

  reportId?: string;
  makeupRecipeId?: string;
  queryText: string;
  lockedFilters: FilterDelta[];
  softFilters: FilterDelta[];
  answers: Array<{ questionId: string; optionId: string; filterDelta: FilterDelta }>;
  askedAttributes: string[];
  questionCount: number;

  candidateIds: string[];
  lastQuestion?: AskedQuestion;
  result?: SearchResult;
  error?: { code: string; message: string };
};
```

### 10.4 loop

```txt
1. prompt/report/recipe 입력 수신
2. ProductSearchState 생성
3. catalog/retrieval 후보 생성
4. rule + semantic + popularity score 계산
5. 정보이득 기반 질문 가치 계산
6. 질문 필요하면 phase='question'
7. 답변 들어오면 filterDelta 적용
8. 후보 재검색/재랭킹
9. 종료조건 충족 시 phase='results'
10. live offer 확인 후 hero + alternatives 반환
```

### 10.5 종료조건

```txt
questionCount >= 3
후보가 3개 이하
top1과 top2 점수 차이가 충분히 큼
더 물을 수 있는 고신뢰 속성이 없음
사용자가 noop 답변을 했고 다음 질문 정보이득이 낮음
```

---

## 11. Phase H — Information Gain Question Engine

### 11.1 질문 후보 속성

```txt
category
priceTier
finish
intensity
colorFamily
channel
```

이미 확정된 속성, 이미 물어본 속성, coverage/confidence가 낮은 속성은 제외한다.

### 11.2 정보이득 계산

```txt
H(C, a) = -Σ p_v log2(p_v)
gain(a) = H(C, a) * coverage(a) * uxPriority(a) * confidence(a)
```

기본 cutoff:

```txt
coverage >= 0.60
confidence >= 0.55
unknown 비율 <= 0.40
한 값 쏠림 <= 0.85
값 종류 2개 이상
```

### 11.3 옵션 생성 예시

```json
{
  "id": "q-finish-1",
  "attribute": "finish",
  "title": "마무리감은 어느 쪽이 좋아요?",
  "options": [
    {
      "id": "glossy",
      "label": "촉촉한 광택감",
      "filterDelta": {
        "attribute": "finish",
        "op": "in",
        "values": ["gloss", "satin", "dewy"],
        "source": "question"
      }
    },
    {
      "id": "matte",
      "label": "보송한 마무리",
      "filterDelta": {
        "attribute": "finish",
        "op": "eq",
        "values": ["matte"],
        "source": "question"
      }
    },
    {
      "id": "either",
      "label": "상관 없어요",
      "filterDelta": {
        "attribute": "finish",
        "op": "noop",
        "source": "question"
      }
    }
  ]
}
```

### 11.4 로그 필수

각 질문마다 아래를 로그에 남긴다.

```txt
sessionId
candidateCountBefore
attribute
gain
coverage
confidence
valueDistribution
candidateCountAfterAnswer
selectedOption
```

---

## 12. Phase I — Live Offer Check

### 12.1 역할

Naver Shopping API 또는 허가된 쇼핑 API는 추천 판단의 원본이 아니라 **현재 구매 가능성 확인**에 사용한다.

```txt
가격
판매처
구매 링크
이미지
네이버페이 여부
중고/렌탈/해외구매 제외
```

### 12.2 final card 조건

최종 노출 카드에는 최소 아래가 있어야 한다.

```txt
brandName
productName
category
priceKrw 또는 priceText
imageUrl
purchaseUrl
matchSummary
```

`imageUrl` 또는 `purchaseUrl`이 없으면 final card에서 제외한다.

### 12.3 TTL

```txt
live offer TTL 기본값: 6~24시간
가격/판매처는 장기 지식으로 저장하지 않음
추천 문구에 "조회 시점 기준" 또는 "현재 확인된" 표현 사용
```

---

## 13. Phase J — Evaluation

### 13.1 고정 eval query

최소 아래 쿼리를 사용한다.

```txt
1. 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
2. 데일리로 쓸 만한 제품 추천해줘
3. 올리브영에서 살 수 있는 데일리 립
4. 면접용 자연스러운 블러셔, 너무 붉지 않게
5. 글리터 강한 아이섀도우 말고 은은한 쉬머
6. 웜톤 가을, 채도 낮은 벽돌 립, 매트하지 않게
7. 민감성 피부라 향료/자극 표현이 많은 제품은 제외
8. AR recipe의 #D94B74 립과 비슷한 네이버쇼핑 구매 가능 제품
```

### 13.2 평가 기준

```txt
catalog 밖 제품 추천 0건
blocked product 노출 0건
가격 hard constraint 위반 0건
imageUrl/purchaseUrl 없는 final card 0건
질문이 후보 분포를 실제로 줄임
같은 속성 반복 질문 없음
LLM 실패 시에도 deterministic loop 동작
호수/색상 추론값을 확정처럼 말하지 않음
피부/의학적 효과 단정 없음
```

### 13.3 retrieval 지표

```txt
recall@20
precision@5
nDCG@10
same product duplicate rate
unknown metadata leakage
manual_reviewed ratio in top results
query latency
embedding cache hit rate
```

---

## 14. 추천 실행 순서

크롤링 완료 후 다음 에이전트는 아래 순서로 진행한다.

```txt
1. raw crawl 파일 위치 확인
2. crawl_audit_report.md 생성
3. product_candidates.jsonl 생성
4. catalog_items_seed.jsonl 생성
5. ProductCatalogItem quality check
6. product_knowledge_docs.jsonl 생성
7. product_knowledge_chunks.jsonl 생성
8. Bedrock embedding smoke test
9. chunk embedding batch 생성
10. retrieval_service.py 구현
11. productId/shadeId aggregation 구현
12. rule + semantic rerank 연결
13. question_engine.py 구현 또는 기존 구현 연결
14. live_offer_service.py 연결
15. search session API 구현
16. AuradinSearchScreen mock 제거 및 API polling 연결
17. fixed eval query 실행
18. auradin_eval_report.md 작성
```

---

## 15. 구현 시 주의할 위험 지점

```txt
1. raw HTML을 그대로 embedding하면 노이즈가 많다.
2. 긴 문서를 chunk sum 방식으로 점수화하면 문서가 긴 제품이 유리해진다.
3. Naver title 기반 shade 추론은 틀릴 수 있다.
4. LLM이 제품/가격/URL을 생성하면 안 된다.
5. live offer 없는 후보를 final card로 내면 안 된다.
6. category/price/channel hard constraint를 조용히 완화하면 안 된다.
7. confidence 낮은 속성으로 질문하면 사용자 경험이 나빠진다.
8. 보고서의 피부/민감성 정보는 민감정보에 준해 최소 사용한다.
9. Bedrock credential은 repo에 남기지 않는다.
10. Bedrock/Titan 실패 시 fallback path가 있어야 한다.
```

---

## 16. Codex/개발 에이전트 시작 프롬프트

다음 에이전트에게 아래 프롬프트를 그대로 줄 수 있다.

```txt
너는 AURA/Auradin 프로젝트의 backend/search engineer다.
현재 크롤링은 완료되었고, 다음 목표는 raw crawl data를 아우라딘 검색 에이전트가 사용할 수 있는 catalog/knowledge/index로 변환하는 것이다.

반드시 이 문서를 먼저 읽고 작업하라:
- AURADIN_POST_CRAWL_PREPROCESSING_AGENT_CONTEXT_KO.md
- AURADIN_PRODUCT_CATALOG_CRAWLING_PLAN_KO.md
- AURADIN_SEARCH_AGENT_BUILD_PLAN.md
- COSMETIC_RECOMMENDATION_AGENT_CONTEXT_KO.md

작업 순서:
1. raw crawl 데이터 위치와 스키마를 확인한다.
2. crawl audit script를 만든다.
3. product_candidates.jsonl을 생성한다.
4. catalog_items_seed.jsonl을 생성한다.
5. product_knowledge_docs.jsonl과 chunks를 생성한다.
6. Bedrock Titan embedding smoke test를 만든다.
7. chunk embedding cache를 만든다.
8. retrieval_service와 product aggregation을 구현한다.
9. question_engine과 search session API에 연결한다.
10. fixed eval query로 결과를 검증한다.

금지:
- raw HTML을 그대로 embedding하지 마라.
- LLM이 제품명/가격/URL을 생성하게 하지 마라.
- Claude/LLM이 후보 생성, 질문 여부, filterDelta를 좌우하게 하지 마라.
- imageUrl/purchaseUrl 없는 상품을 final card에 내지 마라.
- hard constraint를 조용히 완화하지 마라.
- AWS credential을 커밋하지 마라.
```

---

## 17. 완료 기준

이 단계는 아래가 끝나야 완료다.

```txt
[데이터]
- crawl_audit_report.md 존재
- product_candidates.jsonl 존재
- catalog_items_seed.jsonl 존재
- product_knowledge_docs.jsonl 존재
- product_knowledge_chunks.jsonl 존재

[임베딩/검색]
- Bedrock Titan embedding smoke 통과
- chunk embedding cache 생성
- top-k retrieval smoke 통과
- productId/shadeId aggregation 동작

[에이전트]
- prompt/report 기반 SearchState 생성
- 후보 retrieval + rerank 동작
- 정보이득 질문 1~3회 동작
- 답변 후 후보 재랭킹 동작
- live offer 확인 후 final cards 생성

[품질]
- 고정 eval query 최소 5개 통과
- 결과 후보 모두 imageUrl/purchaseUrl/price 보유
- catalog 밖 제품 추천 없음
- LLM 실패 시 fallback 동작
```

---

## 18. 최종 판단

지금 다음 단계의 성공은 “Bedrock Agent를 멋지게 붙이는 것”이 아니라, **크롤링된 상품 데이터를 신뢰 가능한 catalog와 검색 chunk로 바꾸고, deterministic search loop가 그 데이터를 잘 사용하게 만드는 것**이다.

따라서 구현 우선순위는 아래가 맞다.

```txt
catalog quality
> chunk metadata
> embedding/indexing
> retrieval aggregation
> rule/semantic rerank
> information-gain question engine
> live offer check
> LLM copy generation
> Bedrock Knowledge Base / AgentCore 확장
```
