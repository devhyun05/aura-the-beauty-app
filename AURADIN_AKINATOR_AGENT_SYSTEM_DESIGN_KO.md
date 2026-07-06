> ⚠️ **ARCHIVED (2026-07-06)** — 이 문서는 20260703 데이터 기준으로 작성되어 일부(특히 커버리지·질문 정책 표)가 낡았다.
> 현재 단일 진실 소스는 **[AURADIN.md](AURADIN.md)** 다. 이 문서는 역사적 설계 참고용으로만 본다.

# Auradin 아키네이터형 검색 에이전트 총체 설계

작성일: 2026-07-03 KST  
대상 repo: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine`  
연결 문서:

```txt
AURADIN_SEARCH_AGENT_BUILD_PLAN.md
AURADIN_MVP_PREPROCESSING_BEDROCK_AGENT_PLAN_KO.md
AURADIN_POST_CRAWL_PREPROCESSING_AGENT_CONTEXT_KO.md
```

---

## 0. 한 줄 정의

아우라딘은 단순 상품 검색창이 아니라 **화장품계의 아키네이터**다.

사용자가 처음부터 완벽한 조건을 말하지 않아도, 에이전트가 후보군을 읽고 **가장 많이 갈라지는 질문을 1~3개 던진 뒤**, 실제 구매 가능한 제품 카드로 결론을 낸다.

```txt
사용자 prompt / 보고서 context
-> 후보 생성
-> 후보 분포 분석
-> 정보이득 질문
-> 답변 기반 후보 재랭킹
-> 필요하면 다음 질문
-> 실제 구매 가능한 제품 추천
```

중요한 점:

```txt
- 아키네이터 느낌은 UI 애니메이션이 아니라 "질문이 똑똑하게 후보를 좁힌다"는 구조에서 나온다.
- LLM이 즉흥적으로 대화하는 것이 아니라, 서버가 후보 분포를 보고 질문을 고른다.
- Bedrock은 임베딩/카피/보조 추론 역할이지, 후보 선택권의 주인이 아니다.
```

---

## 1. 기존 기획 반영 여부

`AURADIN_SEARCH_AGENT_BUILD_PLAN.md`의 원래 킥은 반영되어 있다.

반영된 핵심:

```txt
- 정보이득 기반 멀티턴 아키네이터 루프
- 서버 결정론 ask/no-ask
- filterDelta 직접 보유
- 최대 3턴
- noop / 둘 다 좋아요
- Claude/LLM은 카피 보조만 담당
- 질문 로그: attribute, gain, coverage, candidate count before/after
```

다만 최신 데이터 상태 때문에 조정해야 하는 부분이 있다.

```txt
원래 계획:
  intensity, colorFamily, finish, priceTier 등을 적극 질문 후보로 둠.

현재 20260703 데이터:
  finish / texture는 질문 후보로 강함.
  priceTier / channel은 hard filter로 강함.
  colorFamily는 soft 질문으로는 유용하지만 hard coverage가 낮음.
  undertone / intensity / suitableFor는 hard 질문으로 쓰면 위험함.
```

따라서 아키네이터 루프는 유지하되, 질문을 두 종류로 나눈다.

```txt
Hard narrowing question:
  답변이 실제 필터로 후보를 제거해도 안전한 질문.
  예: 가격대, 카테고리, 구매 채널, finish, texture.

Soft preference question:
  답변이 후보를 제거하지 않고 점수/설명에 반영되는 질문.
  예: 은은한 느낌, 데일리, 진하지 않은, 쿨/웜 뉘앙스.
```

이렇게 해야 원래 킥은 살리고, 현재 데이터의 불완전성 때문에 추천이 틀어지는 문제도 피한다.

---

## 2. 제품 철학

### 2.1 사용자가 느끼는 경험

사용자는 아래처럼 느껴야 한다.

```txt
"내가 원하는 느낌을 대충 말했더니,
아우라딘이 딱 필요한 것만 물어보고,
실제 살 수 있는 제품으로 좁혀줬다."
```

사용자가 느끼면 안 되는 경험:

```txt
- 그냥 네이버 쇼핑 검색 결과를 예쁘게 보여줌
- 질문이 랜덤하거나 MBTI 테스트처럼 느껴짐
- 질문에 답해도 결과가 거의 안 바뀜
- 제품 카드는 있지만 왜 추천됐는지 모르겠음
- 아우라딘 화면과 제품추천 화면이 다른 기능처럼 분리되어 보임
```

### 2.2 에이전트의 핵심 약속

```txt
1. 실제 구매 가능한 상품만 결과로 보여준다.
2. 가격/링크/이미지는 결과 카드 필수 조건이다.
3. 질문은 후보군을 실제로 좁히거나 랭킹을 의미 있게 바꿔야 한다.
4. 근거가 약한 필드는 확정적으로 말하지 않는다.
5. 최대 3질문 안에 결과를 낸다.
6. 빈 결과가 나오면 조용히 조건을 풀지 않고, 어떤 조건이 빡빡했는지 알려준다.
```

---

## 3. 전체 시스템 구성

아우라딘은 6개 두뇌로 구성한다.

```txt
1. Catalog Brain
   20260703 수집본을 검색 가능한 catalog와 chunk로 정규화.

2. Intent Brain
   prompt/report/AR look context를 locked filter와 soft preference로 분리.

3. Retrieval Brain
   catalog filter + Bedrock embedding search로 후보군 생성.

4. Akinator Brain
   후보 분포를 보고 다음 질문을 결정.

5. Ranking Brain
   답변, rule score, semantic score, live offer score를 합쳐 순위 결정.

6. Presentation Brain
   UI phase, 질문 문구, 결과 카드 설명, confidence 표현을 관리.
```

LLM/Bedrock은 `Intent Brain`과 `Presentation Brain`을 보조한다. `Akinator Brain`과 `Ranking Brain`의 최종 결정권은 서버 코드가 가진다.

---

## 4. 데이터 계층

### 4.1 입력

MVP 입력은 아래 파일이다.

```txt
data/auradin/catalog/catalog_items_seed_20260703.jsonl
data/auradin/detail/normalized/limited_detail_results_20260703.jsonl
data/auradin/knowledge/product_knowledge_docs_20260703.jsonl
```

범위:

```txt
lip: 167
cheek: 167
shadow: 167
총 501개 seed
```

### 4.2 전처리 출력

```txt
data/auradin/catalog/catalog_items_mvp_20260703.jsonl
data/auradin/knowledge/product_knowledge_chunks_mvp_20260703.jsonl
data/auradin/embeddings/product_knowledge_chunk_embeddings_mvp_20260703.jsonl
```

### 4.3 신뢰도 정책

필드는 세 등급으로 나눈다.

```txt
hard_filter_safe
  가격, 구매 URL, 이미지, 카테고리, positive channel listing, 일부 finish/texture.

soft_preference_safe
  colorFamily, intensity, suitableFor, sellingPoints, title residual keyword.

display_only
  shadeName, optionName, 낮은 confidence의 undertone/intensity, raw title 추론값.
```

절대 규칙:

```txt
- unknown retail presence를 negative로 바꾸지 않는다.
- title residual만으로 제조국/입점 여부를 만들지 않는다.
- confidence 낮은 값을 질문 hard filter로 쓰지 않는다.
- 결과 카피에서 "공식", "정확한 호수" 같은 표현을 쓰지 않는다.
```

---

## 5. 세션 모델

### 5.1 Session state

```ts
type AuradinSessionState = {
  sessionId: string;
  phase: 'searching' | 'question' | 'results' | 'failed' | 'expired';

  prompt: string;
  context: {
    reportId?: string;
    reportSummary?: string;
    source?: 'freePrompt' | 'faceReport' | 'profileReport' | 'quickPrompt' | 'arLook';
  };

  intent: SearchIntent;
  lockedFilters: FilterDelta[];
  softPreferences: SoftPreference[];
  answers: QuestionAnswer[];
  askedAttributes: string[];
  questionCount: number;

  currentCandidateIds: string[];
  rankedCandidateIds: string[];
  lastQuestion?: AuradinQuestion;
  result?: AuradinSearchResult;

  logs: AkinatorDecisionLog[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};
```

### 5.2 FilterDelta

```ts
type FilterDelta = {
  attribute:
    | 'category'
    | 'priceKrw'
    | 'priceTier'
    | 'channel'
    | 'finish'
    | 'texture'
    | 'colorFamily'
    | 'undertone'
    | 'intensity';
  op: 'eq' | 'in' | 'lte' | 'gte' | 'noop';
  values?: string[];
  numberValue?: number;
  source: 'prompt' | 'question' | 'report';
  locked: boolean;
  confidence: number;
};
```

### 5.3 SoftPreference

```ts
type SoftPreference = {
  attribute:
    | 'colorFamily'
    | 'undertone'
    | 'intensity'
    | 'suitableFor'
    | 'sellingPoints'
    | 'mood'
    | 'occasion';
  values: string[];
  source: 'prompt' | 'question' | 'report' | 'titleResidual';
  confidence: number;
  weight: number;
};
```

---

## 6. Akinator Brain 설계

### 6.1 ask/no-ask 정책

질문은 매번 아래 순서로 결정한다.

```txt
1. 현재 후보군 수 확인
2. top1/top2 점수 gap 확인
3. askable attribute 후보 생성
4. attribute별 expected gain 계산
5. hard question과 soft question 분리
6. UX 비용과 질문 반복 여부를 반영
7. 질문 또는 결과 종료 결정
```

MVP 기본 정책:

```txt
- broad prompt면 첫 결과 전 최소 1개 질문을 묻는다.
- 모호한 prompt면 2개 질문까지 자연스럽게 허용한다.
- 질문은 최대 3개다.
- strong locked filters + top score gap이 충분하면 질문 없이 결과로 갈 수 있다.
- candidate가 0이면 질문보다 조건 완화/near-match 안내를 우선한다.
```

### 6.2 Broad prompt 판정

아래에 해당하면 broad prompt다.

```txt
- category가 없음: "데일리로 쓸 만한 제품"
- 가격 조건 없음
- finish/texture/color 조건 없음
- 구매 채널 조건 없음
- report context만 있고 사용자 추가 조건 없음
```

broad prompt에서는 아키네이터 느낌을 위해 첫 질문을 거의 반드시 띄운다.

권장 첫 질문:

```txt
category:
  "어느 부위를 먼저 찾아볼까요?"

priceTier:
  "예산은 어느 정도가 편해요?"

finish/texture:
  "마무리감은 어느 쪽이 좋아요?"
```

### 6.3 질문 후보 attribute

현재 데이터 기준 질문 후보를 아래처럼 둔다.

| Attribute | 질문 유형 | 사용 조건 |
|---|---|---|
| category | hard | prompt에서 부위가 불명확할 때 |
| priceTier | hard | 가격 조건이 없고 후보 가격 분포가 넓을 때 |
| channel | hard | 올리브영/백화점 positive listing이 후보군을 의미 있게 나눌 때 |
| finish | hard 또는 soft | coverage/confidence가 충분할 때 |
| texture | hard 또는 soft | coverage/confidence가 충분할 때 |
| colorFamily | soft 우선 | hard coverage가 충분한 후보군에서만 hard |
| undertone | soft/display | hard 질문 금지에 가깝게 처리 |
| intensity | soft/display | hard 질문 금지 |
| suitableFor | soft | 질문보다는 prompt/rerank에 반영 |

### 6.4 정보이득 계산

기본식:

```txt
rawGain(attribute) = entropy(candidate values)
adjustedGain =
  rawGain
  * coverage(attribute)
  * averageConfidence(attribute)
  * uxPriority(attribute)
  * actionability(attribute)
  * resultVisibility(attribute)
```

각 항목 의미:

```txt
coverage:
  unknown/null이 아닌 후보 비율.

averageConfidence:
  해당 attribute의 평균 confidence.

uxPriority:
  사용자가 대답하기 쉬운 질문일수록 높음.

actionability:
  답변 후 실제 filterDelta 또는 rerank가 가능한 정도.

resultVisibility:
  결과 카드에서 사용자가 차이를 확인할 수 있는 정도.
```

권장 priority:

```txt
finish: 1.20
texture: 1.15
priceTier: 1.10
category: 1.05
channel: 0.95
colorFamily: 0.90
intensity: 0.55
undertone: 0.45
suitableFor: 0.40
```

제외 조건:

```txt
- 이미 질문한 attribute
- value 종류가 2개 미만
- 한 value가 85% 이상으로 쏠림
- coverage < hard cutoff이고 hard question으로만 가능한 attribute
- confidence 평균이 낮아 결과 왜곡 가능성이 큼
```

### 6.5 옵션 생성

질문 옵션은 2~4개다.

항상 포함 가능한 옵션:

```txt
상관 없어요 / 둘 다 좋아요
  -> filterDelta op='noop'
```

옵션 생성 규칙:

```txt
- 실제 후보군에 존재하는 value만 옵션으로 만든다.
- 없는 value를 예쁜 카피 때문에 만들지 않는다.
- 각 option은 예상 후보 수를 가진다.
- 후보 수가 0이 되는 option은 숨긴다.
- option label은 사용자 언어로 바꾸되, filterDelta는 서버가 만든 원본을 유지한다.
```

예:

```ts
{
  id: 'q-finish-001',
  attribute: 'finish',
  title: '마무리감은 어느 쪽이 좋아요?',
  options: [
    {
      id: 'glow',
      label: '촉촉한 광택감',
      expectedCandidateCount: 37,
      filterDelta: {
        attribute: 'finish',
        op: 'in',
        values: ['glossy', 'satin', 'shimmer'],
        source: 'question',
        locked: false,
        confidence: 0.72,
      },
    },
    {
      id: 'soft-matte',
      label: '보송한 마무리',
      expectedCandidateCount: 24,
      filterDelta: {
        attribute: 'finish',
        op: 'in',
        values: ['matte', 'velvet'],
        source: 'question',
        locked: false,
        confidence: 0.70,
      },
    },
    {
      id: 'either',
      label: '상관 없어요',
      expectedCandidateCount: 61,
      filterDelta: {
        attribute: 'finish',
        op: 'noop',
        source: 'question',
        locked: false,
        confidence: 1,
      },
    },
  ],
}
```

### 6.6 답변 반영

답변은 두 단계로 반영한다.

```txt
Hard filter answer:
  candidate set을 실제로 줄인다.

Soft preference answer:
  candidate set은 유지하고 score에 가중치를 더한다.
```

soft answer도 무시하면 안 된다. 결과 로그와 reason에 반영해야 한다.

예:

```txt
"은은한 느낌을 골라서, 강한 발색보다 쉬어/글로우 계열 후보를 앞에 뒀어요."
```

### 6.7 종료 조건

결과로 종료하는 조건:

```txt
- questionCount >= 3
- 후보가 3~8개로 충분히 좁혀짐
- top1/top2 점수 gap >= 0.12
- 더 물을 수 있는 high-gain 질문이 없음
- 사용자가 noop을 선택했고 다음 gain이 낮음
- time budget 초과
```

주의:

```txt
- 질문이 귀찮아지기 전에 끝내야 한다.
- 하지만 broad prompt에서 질문 없이 바로 결과를 내면 아키네이터 킥이 사라진다.
```

---

## 7. 검색/랭킹 설계

### 7.1 점수 구성

```txt
finalScore =
  0.35 * ruleScore
  + 0.25 * semanticScore
  + 0.20 * answerScore
  + 0.10 * evidenceScore
  + 0.10 * liveOfferScore
```

Bedrock embedding 실패 시:

```txt
semanticScore 비중을 ruleScore / answerScore / evidenceScore에 재분배한다.
```

### 7.2 ruleScore

```txt
- category match
- price condition match
- channel positive listing match
- finish/texture hard match
- prompt keyword match
- report context match
```

### 7.3 semanticScore

```txt
query text =
  사용자 prompt
  + 보고서 요약
  + locked filter
  + 질문 답변
  + soft preference

chunk search =
  product_overview
  shade_color
  finish_texture
  suitability_claims
  retail_origin
```

### 7.4 answerScore

질문 답변으로 얻은 조건은 별도 점수를 가진다. 그래야 사용자가 “내 답변이 결과에 반영됐다”고 느낀다.

```txt
hard answer match: +1.0
soft answer match: +0.35~0.7
noop: score 변화 없음, 대신 다음 질문 gain threshold를 높임
```

### 7.5 evidenceScore

```txt
official/retail evidence: 높음
prior detail: 중간
title residual: 낮음
brand whitelist: metadata 전용
```

### 7.6 liveOfferScore

```txt
- imageUrl 있음
- purchaseUrl 있음
- priceKrw 있음
- oliveYoung / departmentStore positive listing
- 최신 Naver live offer 확인
```

결과 카드 필수:

```txt
imageUrl
purchaseUrl
priceKrw
brandName
productName
category
reason
```

---

## 8. API 설계

### 8.1 세션 시작

```http
POST /api/search/sessions
```

Request:

```ts
type CreateAuradinSessionRequest = {
  prompt: string;
  reportId?: string;
  source?: 'freePrompt' | 'faceReport' | 'profileReport' | 'quickPrompt' | 'arLook';
  context?: {
    lookId?: string;
    initialCategory?: string;
    userNickname?: string;
  };
};
```

Response:

```ts
type CreateAuradinSessionResponse = {
  sessionId: string;
  phase: 'searching';
  retryAfterMs: number;
};
```

### 8.2 세션 조회

```http
GET /api/search/sessions/{sessionId}
```

Response:

```ts
type AuradinSearchTurn = {
  sessionId: string;
  phase: 'searching' | 'question' | 'results' | 'failed' | 'expired';
  thinking: {
    id: string;
    label: string;
    status: 'done' | 'active' | 'pending';
  }[];
  contextSummary?: string;
  appliedFilters: {
    label: string;
    source: 'prompt' | 'question' | 'report' | 'fallback';
    confidence?: number;
  }[];
  question?: AuradinQuestion;
  result?: AuradinSearchResult;
  error?: {
    code:
      | 'backend_unavailable'
      | 'unsupported_category'
      | 'no_results'
      | 'expired'
      | 'bedrock_timeout'
      | 'internal_error';
    message: string;
    recoverable: boolean;
  };
  retryAfterMs?: number;
};
```

### 8.3 질문 답변

```http
POST /api/search/sessions/{sessionId}/answer
```

Request:

```ts
type AnswerAuradinQuestionRequest = {
  questionId: string;
  optionId: string;
};
```

Response:

```ts
type AnswerAuradinQuestionResponse = {
  sessionId: string;
  phase: 'searching';
  retryAfterMs: number;
};
```

### 8.4 Follow-up refinement

MVP 필수는 아니지만, UX상 results 이후 조건 추가를 열어두는 것이 좋다.

```http
POST /api/search/sessions/{sessionId}/refine
```

Request:

```ts
type RefineAuradinSessionRequest = {
  prompt: string;
};
```

의미:

```txt
"이 중에서 올리브영에서 살 수 있는 것만"
"좀 더 촉촉한 걸로"
"2만원 이하로"
```

MVP에서 구현이 부담되면 새 session으로 재시작하되, 이전 appliedFilters를 prompt context로 넘긴다.

---

## 9. 백엔드 모듈 설계

```txt
services/backend/app/services/auradin_agent/
  catalog_loader.py
    catalog_items_mvp 로드, schema 검증, field access helper.

  title_keyword_extractor.py
    raw title residual keyword 추출. soft evidence만 생성.

  knowledge_chunk_builder.py
    ProductKnowledgeChunk 생성.

  embedding_client.py
    Bedrock embedding wrapper. lazy import, timeout, cache.

  vector_index.py
    file-based embedding index, cosine search.

  intent_parser.py
    prompt/report context -> lockedFilters, softPreferences.

  retrieval_service.py
    hard filter + vector retrieval + aggregate.

  question_engine.py
    information gain, option generation, ask/no-ask.

  ranking.py
    finalScore 계산, soft relaxation, evidence scoring.

  session_manager.py
    session lifecycle, TTL, background task, answer/refine.

  presenter.py
    SearchTurn, question copy, result reason 생성.
```

API:

```txt
services/backend/app/api/search_sessions.py
```

라우터:

```txt
services/backend/app/api/router.py
```

---

## 10. 모바일 통합 설계

### 10.1 Route

MVP에서는 기존 route를 유지한다.

```txt
RootStack route name: ProductRecommendation
실제 화면: AuradinSearchScreen
```

이유:

```txt
- face analysis 완료 후 이미 ProductRecommendation으로 이동한다.
- 보고서 카드/프로필 카드의 추천 제품 버튼도 ProductRecommendation으로 연결되어 있다.
- route churn을 줄이고 기존 E2E를 살린다.
```

### 10.2 Screen

```txt
AuradinSearchScreen
  home
  searching
  question
  results
  failed
  expired
```

기존 mock `setTimeout` 흐름을 API polling으로 교체한다.

```txt
POST /search/sessions
-> GET polling
-> question이면 option tap
-> POST answer
-> GET polling
-> results
```

### 10.3 Product card 재사용

`ProductRecommendationScreen` 내부의 `ProductCard`는 공용 컴포넌트로 분리한다.

```txt
apps/mobile/src/features/recommendation/components/ProductRecommendationCard.tsx
```

재사용 기능:

```txt
- imageUrl -> { uri }
- 가격 표시
- match badge
- purchaseUrl 열기
- like/unlike
- palette swatch
- accessibility label
```

### 10.4 Service

```txt
apps/mobile/src/features/recommendation/services/auradinSearchService.ts
```

함수:

```ts
createAuradinSearchSession(request)
getAuradinSearchTurn(sessionId)
answerAuradinQuestion(sessionId, questionId, optionId)
mapAuradinProductToRecommendedProduct(product)
```

fallback:

```txt
backend base URL 없음:
  기존 auradin mock demo 유지.

backend error:
  failed state 표시.
  productRecommendationMock으로 몰래 대체하지 않는다.
```

### 10.5 화면 copy

```txt
Route title:
  AURADIN 또는 아우라딘

Prompt placeholder:
  원하는 색·질감·예산을 말해보세요

Results header:
  조건에 가까운 제품을 골랐어요
  또는
  답변 기준으로 후보를 좁혔어요

Low confidence 표현:
  "제품명과 판매 문구상 ... 계열로 보여요"
```

---

## 11. E2E 흐름

### Flow A. 자유 검색

```txt
Home/Profile/Recommendation entry
-> ProductRecommendation route
-> Auradin home phase
-> prompt 입력
-> searching
-> question
-> answer
-> results
-> purchase / like / restart
```

### Flow B. 얼굴 분석 이후

```txt
FaceCapture
-> FaceAnalysisLoading
-> ProductRecommendation route with reportId
-> Auradin context bar shows report summary
-> prompt 자동 제안
-> question/results
```

### Flow C. 보고서 상세에서

```txt
FaceAnalysisReportDetail or Profile report card
-> 추천 제품
-> ProductRecommendation route with reportId
-> report context applied
```

### Flow D. 결과 이후 refine

```txt
results
-> "조건 더 추가"
-> prompt: 올리브영에서 살 수 있는 것만
-> same session refine or new session with previous filters
-> results
```

### Flow E. 범위 밖 질의

```txt
브로우 추천해줘
-> unsupported_category 또는 limited_seed 안내
-> 립/치크/섀도우 quick option 제안
```

---

## 12. Bedrock 설계

### 12.1 MVP 사용

```txt
Bedrock Titan Embedding
  - chunk embedding
  - query embedding

Bedrock LLM
  - intent parser 보조
  - question copy 보조
  - result reason 보조
```

### 12.2 사용하지 않는 것

```txt
Bedrock managed Agent
  - MVP core loop에는 넣지 않는다.
  - action group/KB/IAM/endpoint 때문에 핵심 데모를 늦출 수 있다.

Bedrock Knowledge Base
  - 파일 index가 안정화된 뒤 phase 2에서 sync.
```

### 12.3 안전장치

```txt
- boto3/botocore import는 lazy 처리.
- Bedrock timeout이면 deterministic fallback.
- LLM JSON parse 실패 시 rule intent만 사용.
- LLM이 filterDelta를 새로 만들 수 없음.
- prompt injection이 제품 속성/근거를 조작하지 못하게 catalog evidence만 사용.
```

---

## 13. 관측 로그

아키네이터 경험은 로그로 검증해야 한다.

```ts
type AkinatorDecisionLog = {
  step: number;
  candidateCountBefore: number;
  candidateCountAfter?: number;
  topScoresBefore: number[];
  topScoresAfter?: number[];
  proposedAttributes: {
    attribute: string;
    gain: number;
    coverage: number;
    confidence: number;
    uxPriority: number;
    actionability: number;
    excludedReason?: string;
  }[];
  selectedQuestion?: {
    questionId: string;
    attribute: string;
    type: 'hard' | 'soft';
  };
  answer?: {
    questionId: string;
    optionId: string;
    filterDelta?: FilterDelta;
  };
};
```

MVP report:

```txt
reports/auradin/mvp_agent_eval_20260703.md
```

반드시 기록:

```txt
- 질문 attribute
- gain
- coverage
- confidence
- 후보 수 before/after
- top1/top2 gap before/after
- hard/soft 여부
```

---

## 14. 테스트 전략

### 14.1 Backend unit tests

```txt
test_auradin_intent_parser.py
test_auradin_question_engine.py
test_auradin_ranking.py
test_auradin_session_manager.py
test_auradin_search_sessions_api.py
```

중점:

```txt
- broad prompt는 질문을 생성한다.
- 같은 attribute를 반복 질문하지 않는다.
- noop 답변은 후보를 제거하지 않는다.
- hard filter는 명시 조건을 절대 완화하지 않는다.
- confidence 낮은 title residual은 hard question 후보에서 제외된다.
```

### 14.2 Mobile tests

```txt
auradinSearchService.test.ts
AuradinSearchScreen.test.tsx
ProductRecommendationCard.test.tsx
navigation.test.ts
```

중점:

```txt
- ProductRecommendation route가 AuradinSearchScreen을 렌더링한다.
- search -> question -> answer -> results phase가 그려진다.
- product imageUrl이 {uri}로 변환된다.
- purchaseUrl/like action이 연결된다.
- expired/failed/no result 상태가 깨지지 않는다.
```

### 14.3 Golden E2E prompts

```txt
1. 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
2. 데일리로 쓸 만한 제품 추천해줘
3. 올리브영에서 살 수 있는 데일리 립
4. 면접용 자연스러운 블러셔, 너무 붉지 않게
5. 글리터 강한 아이섀도우 말고 은은한 쉬머
6. 브로우 추천해줘
```

통과 기준:

```txt
- 1,2는 아키네이터 질문이 반드시 보인다.
- 3은 oliveYoung positive listing을 조용히 풀지 않는다.
- 4,5는 cheek/shadow 결과를 반환한다.
- 6은 범위 밖 안내와 복구 option을 보여준다.
```

---

## 15. 구현 순서

### P0. 문서/계약 고정

```txt
- 이 총체 설계를 최신 기준으로 링크한다.
- AURADIN_SEARCH_AGENT_BUILD_PLAN.md의 원래 킥은 보존한다.
- 최신 데이터 기반 hard/soft 질문 정책을 우선한다.
```

### P1. 데이터 전처리

```txt
- catalog_items_mvp 생성
- title residual soft keyword 보강
- chunk 생성
- embedding cache 생성
```

### P2. Backend core

```txt
- catalog_loader
- intent_parser
- vector_index
- retrieval_service
- ranking
```

### P3. Akinator Brain

```txt
- question_engine
- information gain
- option generation
- answer application
- logs
```

### P4. Session API

```txt
- POST /search/sessions
- GET /search/sessions/{id}
- POST /search/sessions/{id}/answer
- failed/expired/no_result
```

### P5. Mobile integration

```txt
- ProductRecommendation route -> AuradinSearchScreen
- Product card 공용화
- auradinSearchService
- results grid
- report context bar
```

### P6. Bedrock assist

```txt
- embedding smoke
- query embedding
- LLM copy assist
- timeout fallback
```

### P7. E2E validation

```txt
- backend golden prompt eval
- mobile typecheck
- manual app flow
- mvp_agent_eval report
```

---

## 16. 최종 설계 판정

아우라딘 에이전트의 중심은 RAG도, Bedrock managed Agent도, 예쁜 검색 UI도 아니다.

중심은 **후보군을 실제로 줄이는 질문 엔진**이다.

따라서 MVP 성공 기준은 아래다.

```txt
1. 사용자가 대충 말해도 시작된다.
2. 후보군이 넓으면 질문을 한다.
3. 질문은 데이터 coverage/confidence가 받쳐주는 속성에서 고른다.
4. 답변 후 후보 수나 순위가 실제로 바뀐다.
5. 결과는 실제 구매 가능한 제품 카드다.
6. 찜/구매/다시 찾기까지 한 화면 흐름으로 이어진다.
```

이 구조가 지켜지면 아우라딘은 "화장품 검색창"이 아니라 "색조 제품을 찾아주는 아키네이터형 에이전트"가 된다.
