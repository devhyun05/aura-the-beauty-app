# 아우라딘: 화장품 아키네이터형 AI 검색 기획서

작성일: 2026-06-30 KST

상태: 제품/기술 최종 정리 초안. 현재 앱의 단순 쇼핑몰 탭을 대체하거나 통합할 AI 검색 방향성 문서다.

## 0. 한 줄 결론

`아우라딘`은 LLM이 화장품을 상상해서 추천하는 서비스가 아니라, **제품/호수 후보 DB를 아키네이터처럼 좁히고, AR 레시피와 이미지 입력을 연결하며, live 쇼핑 API로 실제 구매 가능성을 확인한 뒤 LLM이 자연스럽게 질문과 설명을 담당하는 화장품 탐색 서비스**다.

```txt
사용자 말 / AR MakeupRecipe / 이미지 입력
-> ProductSearchState 구조화
-> 후보 제품/호수 점수화
-> 가장 가치 있는 추가 질문 선택
-> live offer 확인
-> 추천 카드와 조건 수정 버튼 제공
-> 사용자의 탐색 행동을 다음 추천에 반영
```

목표는 "정답을 맞히는 추천"이 아니다.

```txt
정답을 맞힌다 X
사용자가 만족할 가능성이 높은 후보를 빠르게 좁힌다 O
```

## 1. 왜 아키네이터 방식인가

화장품 추천은 인물 맞히기처럼 정답 하나가 있는 문제가 아니다. 사용자는 추천 직후에 실제 발색, 지속력, 피부 반응을 알 수 없다. 따라서 추천 정확도를 "맞다/틀리다"로만 볼 수 없다.

대신 아래를 잘해야 한다.

```txt
- 사용자가 말한 조건을 구조화한다.
- 부족한 조건만 짧게 묻는다.
- 카탈로그 밖 제품을 만들지 않는다.
- 색상/질감/가격/구매 가능성 같은 객관 조건을 지킨다.
- 결과가 애매하면 사용자가 쉽게 방향을 수정하게 한다.
```

아키네이터 원리는 이 지점에 잘 맞는다.

```txt
후보 DB가 있다.
사용자 답변으로 후보 점수를 계속 바꾼다.
다음 질문은 남은 후보를 가장 잘 가르는 질문으로 고른다.
정답 확정 대신 top 후보와 수정 방향을 보여준다.
```

## 2. 제품 컨셉

제품명: `아우라딘`

의미:

```txt
AURA + Akinator/Djinn
사용자의 아우라와 원하는 분위기를 읽고, 화장품 후보를 마법처럼 좁혀주는 탐색 도우미
```

사용자 경험:

```txt
사용자: 쿨톤인데 너무 진하지 않은 글로시 립 찾아줘. 2만원 이하로.
아우라딘: 맑은 핑크 쪽이 좋아요, 차분한 로즈 쪽이 좋아요?
사용자: 차분한 로즈.
아우라딘: 조건에 맞는 제품 5개를 찾았어요. 현재 구매 링크도 확인했어요.
```

AR 연결 경험:

```txt
사용자: AR에서 저장한 이 립이랑 비슷한 제품 찾아줘.
아우라딘:
  - AR recipe의 lip colorHex, finish, opacity를 읽는다.
  - 제품 catalog의 색상/질감과 비교한다.
  - live offer를 확인한다.
  - 비슷한 실제 제품/호수를 카드로 보여준다.
```

이미지 연결 경험:

```txt
사용자: 이 사진 느낌이랑 비슷한 블러셔 찾아줘.
아우라딘:
  - 사진은 Media API로 업로드한다.
  - 이미지 분석 결과에서 색상/부위/질감 요약만 추천 엔진에 전달한다.
  - 원본 사진을 추천 로직에 기본 저장하지 않는다.
```

## 3. 핵심 원칙

### 3.1 LLM은 추천 결정자가 아니라 대화 조율자

LLM 역할:

```txt
- 사용자 말을 ProductSearchState로 구조화
- 추가 질문을 자연스럽게 표현
- 추천 이유를 이해하기 쉽게 설명
- 사용자의 애매한 답변을 조건 수정으로 변환
```

LLM이 하면 안 되는 일:

```txt
- catalog에 없는 제품 생성
- 확인되지 않은 가격/링크 생성
- 피부 질환이나 의학적 효과 단정
- 제품 상세/리뷰를 출처 없이 사실처럼 말하기
```

### 3.2 Catalog는 원본, RAG는 보조

```txt
ProductCatalogItem
  제품/호수의 정규화 원본 DB

ProductKnowledgeDocument
  catalog에서 파생한 RAG 검색용 설명 문서
```

정답 기준은 항상 catalog다. RAG 문서가 틀렸으면 catalog를 고치고 다시 색인한다.

### 3.3 가격/링크는 live offer로 확인

가격, 판매처, 구매 링크, 품절 여부는 오래 저장하면 금방 낡는다. RAG에 넣지 않고 live 쇼핑 API 또는 허가된 partner API로 확인한다.

### 3.4 피드백은 평가가 아니라 탐색 행동부터 기록

추천 직후 사용자는 제품을 써보지 않았다. 따라서 "좋아요/싫어요 이유를 말해달라"는 UX는 과하다.

MVP에서는 아래를 기록한다.

```txt
ProductInteractionEvent
  사용자가 봤는지, 열었는지, 저장했는지, 구매 링크를 눌렀는지

SearchRefinementEvent
  더 저렴하게, 덜 진하게, 더 촉촉하게, 이 브랜드 제외 같은 조건 수정

PostUseFeedback
  실제 구매/사용 이후에만 받는 사용 후 피드백
```

## 4. 현재 앱과의 연결

현재 앱에는 이미 제품 추천 화면과 쇼핑 API 기반 추천 백엔드 초석이 있다.

```txt
Mobile
  CustomTab -> ProductRecommendationScreen
  sourceReportId로 얼굴 분석 리포트 연결 가능
  추천 카드, 가격, 구매 URL, 찜 UI 존재

Backend
  GET /api/products/recommendations
  Naver Shopping API 설정
  products, user_product_likes, product_recommendation_runs schema 존재
```

따라서 새 방향은 "완전 신규 앱"이 아니라 아래처럼 전환한다.

```txt
기존 CustomTab/추천 제품 화면
-> 아우라딘 AI 검색 화면
-> 추천 카드/찜/구매 링크 UI는 결과 레이어로 재사용
```

## 5. 주요 사용자 흐름

### 5.1 텍스트 검색 흐름

```txt
1. 사용자가 자연어로 원하는 제품을 말한다.
2. 서버가 ProductSearchState를 만든다.
3. catalog에서 후보를 찾고 점수화한다.
4. 질문 가치가 높으면 1개만 되묻는다.
5. 충분하면 live offer를 확인한다.
6. 추천 카드 3-5개와 조건 수정 버튼을 보여준다.
```

### 5.2 AR MakeupRecipe 기반 흐름

```txt
1. 사용자가 AR 룩 또는 부위 recipe를 저장한다.
2. "비슷한 제품 찾기"를 누른다.
3. 추천 API에 makeupRecipeId 또는 recipe payload가 전달된다.
4. recipe의 region/colorHex/finish/texture/opacity가 ProductTarget으로 변환된다.
5. 색상 거리와 질감 유사도를 중심으로 후보를 좁힌다.
6. live offer 확인 후 제품/호수 카드를 보여준다.
```

### 5.3 이미지 기반 흐름

```txt
1. 사용자가 사진을 업로드한다.
2. Media API가 mediaAssetId를 만든다.
3. 이미지 분석은 별도 job에서 수행한다.
4. 추천에는 원본 이미지가 아니라 mediaAnalysisSummary를 전달한다.
5. 추출된 색상/부위/질감/조명 품질을 검색 조건으로 사용한다.
```

### 5.4 결과 수정 흐름

추천 결과에서 "싫어요 이유"를 직접 묻기보다 조건 수정 버튼을 제공한다.

```txt
- 더 저렴하게
- 덜 진하게
- 더 촉촉하게
- 더 매트하게
- 핑크 말고 로즈로
- 이 브랜드 제외
- 올리브영/네이버에서만 보기
```

이 버튼은 평가가 아니라 다음 검색 조건이다.

## 6. 핵심 스키마

### 6.1 ProductSearchState

기존 `RecommendationIntent` 후보를 이 이름으로 바꾼다. 핵심 키워드 모음이 아니라 "현재까지 이해한 검색 조건판"이다.

```ts
type ProductSearchState = {
  sessionId?: string;
  originalQuery?: string;
  targets: ProductTarget[];
  constraints: SearchConstraints;
  missingSlots: SearchSlot[];
  confidence: "low" | "medium" | "high";
  source: "text" | "makeup_recipe" | "media" | "analysis_report" | "mixed";
  updatedAt: string;
};
```

MVP에서는 한 번에 `primary target` 1개를 우선 처리한다. 세트 추천은 target 여러 개를 다루는 2단계 기능으로 둔다.

### 6.2 ProductTarget

사용자가 찾는 제품 단위다.

```ts
type ProductTarget = {
  targetId: string;
  role: "primary" | "pairing" | "replacement";
  category?: "lip" | "cheek" | "shadow" | "liner" | "base" | "brow" | "other";
  colorHex?: string;
  colorLab?: {
    l: number;
    a: number;
    b: number;
  };
  colorFamily?: "pink" | "rose" | "coral" | "red" | "mauve" | "brown" | "nude" | "peach" | "unknown";
  undertone?: "warm" | "cool" | "neutral" | "unknown";
  finish?: "matte" | "velvet" | "satin" | "gloss" | "dewy" | "shimmer" | "unknown";
  texture?: "tint" | "balm" | "lipstick" | "gloss" | "cream" | "powder" | "pencil" | "liquid" | "unknown";
  intensity?: "sheer" | "medium" | "full" | "unknown";
  moodTags: string[];
};
```

### 6.3 SearchConstraints

제품의 hard/soft 조건이다.

```ts
type SearchConstraints = {
  maxPriceKrw?: number;
  minPriceKrw?: number;
  preferredStores?: Array<"naver_shopping" | "oliveyoung" | "brand_store" | "any">;
  excludeBrands?: string[];
  includeBrands?: string[];
  avoidIngredients?: string[];
  avoidTags?: string[];
  skinType?: "dry" | "oily" | "combination" | "sensitive" | "normal" | "unknown";
  excludeUsed?: boolean;
  excludeOverseasProxy?: boolean;
  requireLiveOffer?: boolean;
};
```

### 6.4 ProductCatalogItem

제품/호수 단위의 원본 DB다. 추천 엔진의 기준 데이터다.

```ts
type ProductCatalogItem = {
  productId: string;
  sourceProductId?: string;
  sourceType: "manual" | "naver_api" | "brand_feed" | "partner_feed" | "allowed_static_collect";
  dataPermission: "owned" | "api_allowed" | "partner_allowed" | "manual_reviewed" | "unknown_blocked";
  brand: string;
  productName: string;
  variantName?: string;
  shadeName?: string;
  category: ProductTarget["category"];
  colorHex?: string;
  colorLab?: {
    l: number;
    a: number;
    b: number;
  };
  colorFamily?: ProductTarget["colorFamily"];
  undertone?: ProductTarget["undertone"];
  finish?: ProductTarget["finish"];
  texture?: ProductTarget["texture"];
  intensity?: ProductTarget["intensity"];
  priceBand?: "under_10000" | "10000_20000" | "20000_30000" | "30000_plus" | "unknown";
  skinTypeTags?: string[];
  ingredientHighlights?: string[];
  cautionTags?: string[];
  officialDescription?: string;
  sourceUrls: string[];
  updatedAt: string;
};
```

MVP에서는 수동 curated catalog가 반드시 필요하다. 쇼핑 API title만으로 `쿨톤`, `뮤트`, `물먹`, `채도 낮음`, `벨벳`을 안정적으로 판단하기 어렵다.

### 6.5 ProductKnowledgeDocument

2단계 RAG용 문서다. ProductCatalogItem과 다르다.

```txt
ProductCatalogItem = 정규화된 원본
ProductKnowledgeDocument = 검색 잘 되게 풀어쓴 파생 문서
```

예:

```txt
브랜드: romand
제품: Glasting Color Gloss
호수: 01 Peony Ballet
카테고리: lip gloss
색조: 밝은 핑크, 쿨톤, 맑은 채도
질감: 투명 광택, 글로시, 가벼운 발림
추천 맥락: 데일리, 쿨톤, 진한 매트 립을 싫어하는 사용자
주의: 고발색 매트 제형을 찾는 사용자에게는 부적합
```

MVP 필수는 아니다. catalog baseline이 먼저다.

### 6.6 LiveOffer

현재 구매 가능성 확인 정보다. RAG 근거가 아니다.

```ts
type LiveOffer = {
  offerId: string;
  productId?: string;
  source: "naver_shopping" | "oliveyoung_partner" | "brand_store" | "other_allowed_api";
  sourceProductId?: string;
  title: string;
  link: string;
  image?: string;
  mallName?: string;
  lprice?: number;
  hprice?: number;
  brand?: string;
  maker?: string;
  categoryPath?: string[];
  fetchedAt: string;
  ttlSeconds: number;
};
```

### 6.7 RecommendationSession

대화 한 판의 상태 저장이다. 답변만 저장하는 테이블이 아니라, 아키네이터가 "지금 후보를 어디까지 좁혔는지" 들고 있는 판이다.

```ts
type RecommendationSession = {
  sessionId: string;
  userId?: string;
  status: "collecting" | "ready" | "completed" | "abandoned";
  searchState: ProductSearchState;
  askedQuestions: AskedQuestion[];
  candidateSnapshot?: CandidateScore[];
  recommendationId?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 6.8 RecommendationCard

사용자에게 보여줄 최종 카드다.

```ts
type RecommendationCard = {
  recommendationId: string;
  productId: string;
  displayName: string;
  brand: string;
  shadeName?: string;
  image?: string;
  priceText?: string;
  mallName?: string;
  shoppingUrl?: string;
  matchSummary: string;
  reasons: string[];
  tradeoffs: string[];
  refinementHints: SearchRefinement[];
  evidence: {
    catalogFields: string[];
    liveOfferFetchedAt?: string;
    knowledgeDocIds?: string[];
  };
  confidence: "high" | "medium" | "low";
};
```

### 6.9 ProductInteractionEvent

추천 직후 사용자가 실제로 한 행동을 기록한다.

```ts
type ProductInteractionEvent = {
  eventId: string;
  sessionId?: string;
  recommendationId?: string;
  productId: string;
  action:
    | "view"
    | "open_detail"
    | "open_purchase_link"
    | "save"
    | "hide"
    | "compare"
    | "share";
  searchStateSnapshot: ProductSearchState;
  scoreSnapshot?: ScoreBreakdown;
  createdAt: string;
};
```

### 6.10 SearchRefinementEvent

사용자가 평가 대신 검색 방향을 바꾼 기록이다.

```ts
type SearchRefinementEvent = {
  eventId: string;
  sessionId: string;
  recommendationId?: string;
  productId?: string;
  refinement:
    | "cheaper"
    | "less_dark"
    | "more_glossy"
    | "more_matte"
    | "more_muted"
    | "different_brand"
    | "exclude_brand"
    | "store_only"
    | "color_family_change";
  value?: string;
  previousSearchState: ProductSearchState;
  nextSearchState: ProductSearchState;
  createdAt: string;
};
```

### 6.11 PostUseFeedback

사용자가 실제 구매/사용 이후에만 받는 후순위 데이터다.

```ts
type PostUseFeedback = {
  feedbackId: string;
  productId: string;
  sourceRecommendationId?: string;
  usedAt?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  actualExperienceTags: Array<
    | "color_matched"
    | "too_dark"
    | "too_light"
    | "too_matte"
    | "too_sticky"
    | "long_lasting"
    | "irritating"
    | "would_rebuy"
  >;
  note?: string;
};
```

### 6.12 UserPreferenceSummary

사용자가 직접 매번 입력하는 값이 아니라, 행동/피드백에서 파생되는 요약 데이터다.

하나만 두지 않는다.

```txt
global preference
lip preference
base preference
occasion preference
negative preference
```

MVP에서는 저장하지 않고, 나중에 interaction/refinement/post-use feedback이 쌓이면 생성한다.

### 6.13 MakeupRecipe

AR/레퍼런스 추출 결과와 실제 제품 추천을 연결하는 필수 입력이다.

```ts
type MakeupRecipe = {
  recipeId: string;
  lookGoal?: string;
  layers: Array<{
    region: "lip" | "cheek" | "shadow" | "liner" | "brow" | "base";
    colorHex?: string;
    colorLab?: {
      l: number;
      a: number;
      b: number;
    };
    finish?: ProductTarget["finish"];
    texture?: ProductTarget["texture"];
    opacity?: number;
    coverage?: number;
    userAdjustment?: Record<string, unknown>;
  }>;
};
```

### 6.14 ScoreBreakdown

AI가 추측한 값이 아니라 우리가 계산한 내부 점수표다.

```ts
type ScoreBreakdown = {
  colorScore: number;
  finishScore: number;
  textureScore: number;
  priceScore: number;
  availabilityScore: number;
  preferenceScore: number;
  ragScore?: number;
  diversityScore?: number;
  finalScore: number;
};
```

계산 예:

```txt
colorScore
  MakeupRecipe colorLab와 제품 colorLab의 Delta E 기반

finishScore
  gloss 요청에 gloss/dewy 제품이면 높음

priceScore
  maxPriceKrw 안이면 높음

availabilityScore
  live offer가 있고 링크가 유효하면 높음

preferenceScore
  사용자가 숨김/제외한 브랜드나 조건이면 낮음
```

사용자에게 점수 숫자를 그대로 보여주지 않는다. "색감이 비슷함", "예산 안", "촉촉한 질감"처럼 번역해 보여준다.

## 7. 질문 선택 원리

`askNextQuestion`은 LLM 감으로 고르지 않는다. 후보군을 보고 가장 가치 있는 질문을 고른다.

```txt
questionValue =
  후보를 줄이는 정도
  + 조건 중요도
  + 추천 실패 위험 감소
  - 사용자 피로도
  - 민감정보 요청 비용
```

예:

```txt
남은 후보 20개
  10개는 핑크, 10개는 로즈
-> 색상군 질문 가치 높음

남은 후보 20개
  18개는 2만원 이하, 2개만 2만원 초과
-> 가격 질문 가치 낮음

남은 후보 20개
  19개가 글로시, 1개만 매트
-> finish 질문 가치 낮음
```

질문 정책:

```txt
- 한 번에 한 질문만 한다.
- 기본 최대 1-3개 질문까지만 한다.
- 이미 충분히 좋은 후보가 있으면 바로 추천한다.
- 질문은 선택지형으로 만든다.
- 민감한 피부/알러지 질문은 사용자가 먼저 언급했거나 명확히 필요한 경우만 한다.
```

질문 예:

```txt
"맑은 핑크 쪽이 좋아요, 차분한 로즈 쪽이 좋아요?"
"촉촉한 광이 있는 쪽이 좋아요, 보송하게 마무리되는 쪽이 좋아요?"
"가격은 2만원 이하로 볼까요, 품질이 맞으면 3만원대도 볼까요?"
```

## 8. 추천 엔진 파이프라인

MVP 추천 순서:

```txt
1. Input normalization
   사용자 말, recipe, image summary를 ProductSearchState로 변환

2. Hard filter
   카테고리, 가격, 제외 브랜드, dataPermission, live offer 필요 여부

3. Candidate scoring
   색상, finish, texture, 가격, 구매 가능성, 취향 조건 점수화

4. Question selection
   질문 가치가 높으면 추가 질문

5. Live offer check
   Naver Shopping API 또는 허가된 shopping API로 가격/링크 확인

6. Card build
   추천 이유, tradeoff, refinement button 포함

7. Interaction logging
   view/click/save/refine/hide 기록
```

2단계 이후:

```txt
8. ProductKnowledgeDocument retrieval
9. Rerank
10. Agent/tool orchestration
11. UserPreferenceSummary generation
```

## 9. Tool 또는 MCP 설계

MVP에서는 꼭 "외부 MCP 서버"를 먼저 만들 필요는 없다. backend 내부 tool 함수로 시작하고, 나중에 MCP 서버로 분리할 수 있게 인터페이스만 깨끗하게 둔다.

### 9.1 필수 internal tools

```ts
type AuradinTools = {
  normalizeBeautyQuery(input: {
    query: string;
    makeupRecipe?: MakeupRecipe;
    mediaAnalysisSummary?: MediaAnalysisSummary;
  }): Promise<ProductSearchState>;

  searchCatalog(input: ProductSearchState): Promise<CatalogCandidate[]>;

  scoreCandidates(input: {
    searchState: ProductSearchState;
    candidates: CatalogCandidate[];
  }): Promise<CandidateScore[]>;

  askNextQuestion(input: {
    searchState: ProductSearchState;
    candidates: CandidateScore[];
  }): Promise<AskedQuestion | null>;

  checkShoppingOffers(input: {
    candidates: CandidateScore[];
    constraints: SearchConstraints;
  }): Promise<LiveOffer[]>;

  buildRecommendationCards(input: {
    searchState: ProductSearchState;
    candidates: CandidateScore[];
    offers: LiveOffer[];
  }): Promise<RecommendationCard[]>;

  recordProductInteraction(input: ProductInteractionEvent): Promise<void>;
  recordSearchRefinement(input: SearchRefinementEvent): Promise<void>;
};
```

### 9.2 2단계 tools

```txt
getUserPreferenceSummary
getSavedMakeupRecipe
getMediaAnalysisSummary
retrieveProductKnowledge
rerankCandidates
adminUpdateCatalogItem
```

### 9.3 외부 MCP 후보

정말 중요한 외부 MCP는 많지 않다. 추천의 핵심 데이터는 외부 일반 웹이 아니라 우리 catalog와 허가된 쇼핑 API에 있어야 한다.

가져갈 만한 방향:

```txt
web search MCP
  신제품 조사, admin 검수 보조용
  최종 추천 근거로 바로 사용하지 않음

commerce/shopping MCP
  공식 MCP가 있으면 live offer 조회에 활용 가능
  네이버 쇼핑은 현재는 API adapter로 직접 붙이는 편이 현실적

media MCP
  원본 사진을 외부 MCP에 직접 넘기지 않는다
  내부 media summary 조회 tool로 제한

admin DB MCP
  운영자가 catalog를 검수/수정하는 내부 도구로 사용 가능
```

원칙:

```txt
- 외부 MCP 결과는 추천의 최종 정답이 아니다.
- 제품명/가격/링크는 허가된 API나 catalog에서만 온다.
- 사용자 사진, 얼굴 원본, 민감한 피부 정보는 외부 MCP에 직접 전달하지 않는다.
```

## 10. 이미지와 레시피 입력 경계

사진을 가져오는 것은 MCP가 아니라 Media API 책임이다.

기본 흐름:

```txt
1. POST /api/media/presigned-upload
2. 앱이 S3 또는 지정 storage에 업로드
3. POST /api/media/complete-upload
4. mediaAssetId 생성
5. 이미지 분석 job 실행
6. mediaAnalysisSummary 생성
7. 추천 세션에 mediaAssetId 또는 summary 전달
```

추천 엔진에는 원본 사진 대신 요약값을 넣는다.

```ts
type MediaAnalysisSummary = {
  mediaAssetId: string;
  source: "face_photo" | "reference_makeup" | "product_image" | "ar_capture";
  quality?: {
    lighting: "good" | "dim" | "overexposed" | "unknown";
    faceVisible?: boolean;
  };
  extractedTargets: ProductTarget[];
  palette?: string[];
  warnings?: string[];
};
```

원본 사진을 추천 서버에 기본 전송하거나 장기 저장하지 않는다. 얼굴 원본, raw frame, ARFace mesh 전체, 세밀한 landmark 전체는 별도 동의와 보관 정책이 생기기 전까지 추천 입력에서 제외한다.

## 11. API 설계

### 11.1 신규 MVP API

```txt
POST /api/recommendation-sessions
  목적: 아우라딘 대화형 검색 시작

POST /api/recommendation-sessions/{sessionId}/messages
  목적: 사용자 답변/추가 요청을 보내고 다음 질문 또는 추천 결과 받기

POST /api/recommendations/products
  목적: 대화 없이 한 번에 제품 추천 요청

GET /api/recommendations/{recommendationId}
  목적: 추천 결과 재조회

POST /api/recommendations/{recommendationId}/interactions
  목적: view/open/save/hide/link click 기록

POST /api/recommendation-sessions/{sessionId}/refinements
  목적: 더 저렴하게/덜 진하게/브랜드 제외 같은 조건 수정
```

### 11.2 추천 세션 시작 요청

```json
{
  "source": "text",
  "query": "쿨톤인데 너무 진하지 않은 글로시 립 찾아줘. 2만원 이하.",
  "makeupRecipeId": null,
  "makeupRecipe": null,
  "mediaAssetId": null,
  "analysisReportId": null,
  "constraints": {
    "maxPriceKrw": 20000,
    "preferredStores": ["naver_shopping"],
    "excludeUsed": true,
    "excludeOverseasProxy": true
  }
}
```

### 11.3 AR recipe 기반 요청

```json
{
  "source": "makeup_recipe",
  "query": "이 립이랑 비슷한 실제 제품 찾아줘.",
  "makeupRecipeId": "recipe_123",
  "constraints": {
    "maxPriceKrw": 25000,
    "preferredStores": ["naver_shopping"]
  }
}
```

### 11.4 이미지 기반 요청

```json
{
  "source": "media",
  "query": "이 사진 블러셔 느낌이랑 비슷한 제품 찾아줘.",
  "mediaAssetId": "media_123",
  "constraints": {
    "preferredStores": ["naver_shopping"]
  }
}
```

### 11.5 세션 응답

```json
{
  "sessionId": "session_001",
  "status": "collecting",
  "searchState": {
    "targets": [
      {
        "targetId": "target_lip_1",
        "role": "primary",
        "category": "lip",
        "undertone": "cool",
        "finish": "gloss",
        "intensity": "sheer"
      }
    ],
    "constraints": {
      "maxPriceKrw": 20000
    },
    "missingSlots": ["colorFamily"],
    "confidence": "medium",
    "source": "text",
    "updatedAt": "2026-06-30T00:00:00+09:00"
  },
  "nextQuestion": {
    "questionId": "q_color_family_1",
    "text": "맑은 핑크 쪽이 좋아요, 차분한 로즈 쪽이 좋아요?",
    "options": [
      {"value": "pink", "label": "맑은 핑크"},
      {"value": "rose", "label": "차분한 로즈"},
      {"value": "either", "label": "상관없어요"}
    ]
  },
  "cards": []
}
```

### 11.6 추천 완료 응답

```json
{
  "sessionId": "session_001",
  "status": "ready",
  "recommendationId": "rec_001",
  "summary": "쿨톤, 글로시, 2만원 이하 조건에 맞는 로즈 계열 립 후보를 찾았어요.",
  "cards": [
    {
      "productId": "prod_001",
      "displayName": "Example Gloss Tint 03 Rose",
      "brand": "Example",
      "shadeName": "03 Rose",
      "priceText": "18,900원",
      "mallName": "네이버쇼핑",
      "shoppingUrl": "https://...",
      "matchSummary": "차분한 로즈 색감과 촉촉한 마무리가 요청 조건과 가까워요.",
      "reasons": [
        "쿨톤 로즈 계열 후보입니다.",
        "사용자가 요청한 글로시 finish와 맞습니다.",
        "현재 확인된 최저가가 예산 안에 있습니다."
      ],
      "tradeoffs": [
        "실제 발색은 입술 원래 색과 조명에 따라 달라질 수 있습니다."
      ],
      "refinementHints": [
        {"type": "less_dark", "label": "덜 진하게"},
        {"type": "cheaper", "label": "더 저렴하게"}
      ],
      "confidence": "medium"
    }
  ],
  "limitations": [
    "가격과 링크는 조회 시점 기준입니다.",
    "제품별 실제 발색 완전 재현은 보장하지 않습니다."
  ]
}
```

### 11.7 기존 API 유지

당장 제거하지 않는다.

```txt
GET /api/products/recommendations
GET /api/products/liked
POST /api/products/{productId}/like
DELETE /api/products/{productId}/like
```

기존 화면 호환과 점진적 전환을 위해 유지한다.

### 11.8 Admin/API 후순위

```txt
POST /api/catalog/items
PATCH /api/catalog/items/{productId}
POST /api/catalog/import/naver-shopping
POST /api/catalog/items/{productId}/index
GET /api/admin/recommendation-evals
POST /api/admin/recommendation-evals/run
```

## 12. 데이터 수집과 운영

### 12.1 수집 그룹

```txt
Group A: 수동 curated catalog
  MVP 핵심. 100-300개 제품/호수부터 시작.

Group B: 공식/제휴 데이터
  브랜드 feed, partner feed, 공식 API.

Group C: 쇼핑 검색 API
  현재 가격/링크/이미지/판매처 확인.
  색상/질감 정답 원천으로 쓰지 않음.

Group D: 허용된 정적 수집
  약관/robots/rate limit/저장 범위가 확인된 경우만.
```

### 12.2 네이버 쇼핑 API 역할

```txt
사용:
- 제품 후보 발견 보조
- 현재 구매 링크 확인
- 최저가/판매처/이미지 확인
- 네이버페이, 중고/렌탈/해외직구 제외 조건 적용

비사용:
- 색조/질감/finish 정답 판단
- 리뷰 요약 원천
- 가격/재고의 장기 지식 저장
- title만 보고 shade 확정
```

### 12.3 Catalog 품질 기준

제품/호수 row에는 최소 아래가 있어야 추천 가능하다.

```txt
brand
productName
shadeName 또는 variantName
category
colorFamily 또는 colorHex/colorLab
finish
texture
dataPermission
sourceUrl
```

`dataPermission = unknown_blocked`면 추천 결과에 노출하지 않는다.

## 13. UI 방향

### 13.1 CustomTab 전환

현재 `CustomTab`을 `아우라딘` 중심으로 바꾼다.

첫 화면:

```txt
상단: 아우라딘 검색 입력
중단: 최근 저장한 AR 룩/분석 리포트/레시피 연결 카드
하단: 추천 결과 또는 질문 카드
```

### 13.2 내부 용어 노출 금지

사용자에게 노출하지 않는다.

```txt
RAG
embedding
vector
rerank
MCP
ProductSearchState
ScoreBreakdown
```

사용자에게 노출한다.

```txt
색감이 비슷함
질감이 비슷함
예산 안
지금 구매 가능
확인 필요
덜 진하게 보기
더 촉촉하게 보기
```

### 13.3 결과 카드 필수 요소

```txt
- 제품 이미지
- 브랜드/제품명/호수
- 가격/판매처/링크
- 왜 가까운지 2-3줄
- 확인 필요 1줄
- 조건 수정 버튼
- 저장/구매 링크 열기
```

## 14. AI/모델 방향

MVP에서는 provider를 강하게 고정하지 않는다. 현재 repo는 OpenAI API 설정이 이미 있으므로 **OpenAI-first 구현**이 가장 작다. 다만 AWS 배포와 Bedrock Knowledge Base를 쓰기로 결정하면 provider interface 뒤에서 Bedrock으로 교체할 수 있게 둔다.

권장 구조:

```txt
LLM
  사용자 말 구조화, 질문 문장 생성, 카드 설명 생성

Embedding/RAG
  2단계부터 ProductKnowledgeDocument 검색에 사용

Rerank
  2단계부터 후보 설명 문서 재정렬에 사용

Rule scorer
  MVP의 추천 결정 핵심
```

환경 설정은 고정 상수가 아니라 config로 둔다.

```ts
type AiProviderConfig = {
  provider: "openai" | "bedrock" | "other";
  conversationModelId: string;
  structuredOutputModelId: string;
  embeddingModelId?: string;
  rerankModelId?: string;
  region?: string;
};
```

## 15. 평가 지표

추천은 정답이 없으므로 accuracy 하나로 보지 않는다.

### 15.1 Hard quality

```txt
catalog hallucination count = 0
blocked product leakage = 0
hard constraint violation = 0
live offer required인데 offer 없음 = 0
API secret leak = 0
raw face upload count = 0 unless explicit consent exists
```

### 15.2 Search quality

```txt
top3 save/click/open rate
refinement 후 결과 개선율
hide/reject 반복률
time to usable recommendation
question count per session
session abandonment rate
```

### 15.3 Retrieval/RAG quality

2단계 이후에만 본다.

```txt
recall@20
precision@5
nDCG@10
source citation availability
stale document rate
```

### 15.4 Fixed eval set

초기 고정 평가 질문:

```txt
1. 쿨톤 여름, 맑은 핑크 글로시 립, 2만원 이하
2. 웜톤 가을, 채도 낮은 벽돌 립, 매트하지 않게
3. 면접용 자연스러운 블러셔, 너무 붉지 않게
4. 아이라인이 번지는 편, 또렷하지만 과하지 않은 펜슬/리퀴드
5. AR recipe의 #D94B74 립과 비슷한 네이버쇼핑 구매 가능 제품
6. 민감성 피부라 향료/자극 표현이 많은 제품은 제외
7. 촉촉한 립밤 같은 색조, 고발색 제외
8. 글리터 강한 아이섀도우 말고 은은한 쉬머
```

## 16. 실패 모드와 대응

| 실패 | 원인 | 대응 |
| --- | --- | --- |
| 제품은 추천됐지만 링크가 죽음 | 가격/링크 최신성 문제 | live offer TTL, 재조회, 링크 실패 이벤트 |
| AI가 없는 제품을 추천 | LLM 자유 생성 | productId 기반 카드 생성만 허용 |
| 색은 비슷한데 질감이 다름 | 색상 점수 과신 | finish/texture hard filter 강화 |
| 질문이 너무 많음 | 모든 missing slot 질문 | questionValue threshold 적용 |
| 좋아요/싫어요 데이터가 부정확 | 사용 전 평가 요구 | interaction/refinement 중심으로 기록 |
| 쇼핑 API 결과가 엉뚱함 | 검색 title 불안정 | catalog-first, offer는 product/shade query로 확인 |
| 피부 고민 표현이 위험함 | 의료적 단정 | 성분 주의/확인 필요 라벨로 제한 |
| RAG 문서가 오래됨 | 제품 리뉴얼/단종 | indexedAt, refresh queue, stale filter |

## 17. 개인정보와 보안

### 17.1 얼굴/이미지 데이터 경계

추천 API에 기본 전달 가능한 값:

```txt
- MakeupRecipe
- mediaAnalysisSummary
- 피부톤/피부 타입 설문값
- 사용자가 직접 입력한 취향
- 저장/수정 이력 요약
```

추천 API에 기본 전달하지 않는 값:

```txt
- 원본 얼굴 사진
- raw camera frame
- ARFace mesh 전체
- 세밀한 landmark 전체
- 외부 MCP로 직접 전달되는 이미지 URL
```

### 17.2 로그 경계

```txt
- Naver API key는 client 앱에 넣지 않는다.
- AI provider key는 backend secret으로만 관리한다.
- 추천 로그에는 원본 얼굴 이미지, raw frame, API secret, full shopping response를 남기지 않는다.
- health/skin concern은 민감정보에 준해 최소 저장한다.
```

## 18. 개발 단계

### Phase 0. 컨셉과 계약 고정

목표:

```txt
- ProductSearchState schema
- MakeupRecipe -> ProductTarget 변환 규칙
- ProductCatalogItem 최소 필드
- RecommendationSession API 계약
- ProductInteractionEvent/SearchRefinementEvent 계약
```

완료 기준:

```txt
- 샘플 query 10개가 ProductSearchState로 변환됨
- 샘플 recipe 5개가 ProductTarget으로 변환됨
- API request/response schema validation 통과
```

### Phase 1. 아키네이터식 후보 축소 baseline

목표:

```txt
- curated catalog 100-300개
- rule-based scorer
- askNextQuestion baseline
- recommendation card 생성
```

완료 기준:

```txt
- catalog 밖 제품 추천 0건
- 질문 0-3개 안에 결과 카드 반환
- fixed eval set에서 hard constraint 위반 0건
```

### Phase 2. Live shopping offer

목표:

```txt
- Naver Shopping API adapter 정리
- product/shade 기반 offer 확인
- TTL/cache
- 링크 실패 graceful degrade
```

완료 기준:

```txt
- 추천 카드에 가격/판매처/링크 표시
- offer 실패 시 "현재 링크 확인 실패" 상태 표시
- 중고/렌탈/해외직구 제외 옵션 적용
```

### Phase 3. AR recipe와 이미지 입력 연결

목표:

```txt
- makeupRecipeId 입력
- mediaAssetId 입력
- mediaAnalysisSummary 기반 target 생성
- CustomTab 아우라딘 UX 전환
```

완료 기준:

```txt
- 저장된 AR recipe에서 제품 추천으로 이동
- 이미지 입력은 원본 대신 요약값만 추천 엔진에 전달
- 사용자 화면에 내부 AI 용어 노출 없음
```

### Phase 4. Product knowledge/RAG

목표:

```txt
- ProductKnowledgeDocument 생성
- vector index
- source/docId 추적
- retrieval eval
```

완료 기준:

```txt
- 고정 query에서 관련 제품 문서 topK 반환
- source URL/docId 추적 가능
- stale/unknown permission 문서 제외 가능
```

### Phase 5. Agent/tool orchestration

목표:

```txt
- internal tools를 MCP 또는 function calling 인터페이스로 정리
- tool 결과 기반 카드 생성
- agent가 URL/제품을 직접 생성하지 못하게 guardrail 적용
```

완료 기준:

```txt
- tool 없이 생성된 제품/URL 0건
- 질문/추천/조건수정 루프가 하나의 session 안에서 동작
```

### Phase 6. Admin/QA

목표:

```txt
- catalog 관리
- eval set 실행
- 추천 결과 diff
- interaction/refinement 분석
```

완료 기준:

```txt
- 운영자가 잘못된 색상/질감 태그 수정 가능
- fixed eval set 반복 실행 가능
- 추천 품질 regression 확인 가능
```

## 19. MVP에서 가져갈 것과 미룰 것

### MVP 필수

```txt
ProductSearchState
ProductTarget
SearchConstraints
ProductCatalogItem
LiveOffer
RecommendationSession
RecommendationCard
ProductInteractionEvent
SearchRefinementEvent
MakeupRecipe
ScoreBreakdown

normalizeBeautyQuery
searchCatalog
scoreCandidates
askNextQuestion
checkShoppingOffers
buildRecommendationCards
recordProductInteraction
recordSearchRefinement

POST /api/recommendation-sessions
POST /api/recommendation-sessions/{sessionId}/messages
POST /api/recommendations/products
GET /api/recommendations/{recommendationId}
POST /api/recommendations/{recommendationId}/interactions
POST /api/recommendation-sessions/{sessionId}/refinements
```

### 2단계로 미룰 것

```txt
ProductKnowledgeDocument
UserPreferenceSummary
PostUseFeedback
external MCP
RAG rerank
Admin catalog UI
대규모 리뷰 요약
협업 필터링
구매 후 만족도 모델
```

## 20. 최종 아키텍처

```txt
Mobile App
  Auradin AI Search UI
  AR MakeupRecipe
  Media upload
  Recommendation cards
  Refinement buttons
        |
        v
Recommendation Backend
  ProductSearchState builder
  Candidate scorer
  askNextQuestion
  Live offer adapter
  Card builder
  Interaction/refinement logger
        |
        +--> Product Catalog DB
        +--> Naver Shopping API / allowed shopping APIs
        +--> Media Analysis Summary
        +--> MakeupRecipe storage
        +--> Product Knowledge / RAG (phase 2)
        +--> Admin/QA tools (phase 2)
```

## 21. 최종 판단

아우라딘은 단순 쇼핑몰보다 앱의 정체성에 더 맞다. 얼굴 분석, AR 룩, 레퍼런스 추출, 저장 레시피가 모두 "실제 제품 찾기"로 연결되기 때문이다.

하지만 성공 조건은 LLM 성능이 아니라 아래다.

```txt
1. 제품/호수 단위 catalog 품질
2. 아키네이터식 질문 선택
3. live offer 최신성
4. AR MakeupRecipe와 제품 속성 매핑
5. 평가가 아닌 탐색 행동 기반 학습
```

따라서 첫 구현은 "AI 추천"이 아니라 **"아키네이터식 후보 축소 엔진 + 쇼핑 API + AR recipe 연결"**로 시작한다.
