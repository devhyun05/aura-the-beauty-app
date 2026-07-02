# 화장품 추천 서비스 MVP 에이전트 컨텍스트

이 문서는 다음 에이전트가 `AURA-cosmetic-search-engine`의 화장품 추천 MVP를 고도화할 때, 현재 구현을 빠르게 복원할 수 있도록 만든 상세 인수인계 문서다. 설명은 현재 코드 기준이며, 단순 기획이 아니라 실제 파일/함수/데이터 흐름을 중심으로 정리한다.

## 0. 가장 중요한 한 문장

현재 repo에는 추천 기능이 두 축으로 존재한다.

1. `추천 메이크업 필터`: 15개 mock AR 필터를 홈/필터스토어에 보여주고, 선택한 필터를 AR 화면 초기 상태로 전달한다.
2. `화장품 제품 추천`: 얼굴 분석 보고서 또는 mock 룩을 기준으로 Naver Shopping/DB/Bedrock semantic scoring을 통해 실제 구매 가능한 제품을 추천한다.

두 기능은 사용자가 보기에는 모두 "추천"이지만, 코드상 책임과 데이터 모델이 다르다. 고도화 전에 반드시 어느 축을 건드리는지 구분해야 한다.

## 1. 작업 시 반드시 읽을 기준 문서

- `AGENTS.md`
  - 모바일 작업은 `apps/mobile/src` 안에서 수행한다.
  - `docs/mobile/FRONTEND_WORK_GUIDE.md`를 먼저 읽는다.
  - `docs/spec.md`는 추천 메이크업 필터 패널의 제품 스펙이다.
  - `docs/plan.md`는 구현 우선순위다.
  - 새 UI 라이브러리/아이콘 라이브러리는 추가하지 않는다.
  - 모바일 코드 변경 시 `apps/mobile`에서 `npm run typecheck`를 돌린다.
- `docs/mobile/FRONTEND_WORK_GUIDE.md`
  - 현재 모바일은 프론트 UI/UX 우선 구현 단계다.
  - 백엔드, Unity, ARKit, ARCore, AI 로직은 교체 가능한 service/mock 구조로 둔다.
  - Tamagui, React Native, TypeScript, React Navigation을 사용한다.
- `docs/spec.md`
  - 홈의 추천 메이크업 필터 패널 스펙이다.
  - 추천 필터 15개, AR 진입, 저장, 안전 원칙, mock embedding/vector 정렬 기준을 정의한다.
- `docs/plan.md`
  - 추천 필터 구현 순서다.
  - P1 데이터/타입, P2 service, P4 홈, P5 전체 목록, P6-P9 AR/저장 연결, P11 테스트 순서다.

## 2. 주요 디렉터리 지도

```text
apps/mobile/src/features/recommendation/
  screens/ProductRecommendationScreen.tsx        # 실제 화장품 제품 추천 화면
  screens/AuradinSearchScreen.tsx                # 대화형/검색형 추천 컨셉 화면, 현재 mock-only
  screens/LikedProductListScreen.tsx             # 좋아요한 제품 목록
  screens/MakeupLookListScreen.tsx               # 좋아요한 메이크업 필터 룩 목록
  services/productRecommendationService.ts       # 제품 추천 API/mock adapter
  services/auradinService.ts                     # Auradin mock data loader
  mocks/productRecommendation.mock.ts            # 제품 추천 fallback mock
  mocks/auradin.mock.ts                          # Auradin search mock
  types.ts                                       # 제품 추천/아우라딘 타입

apps/mobile/src/shared/services/
  backendApi.ts                                  # API base URL, auth token, JSON envelope 처리
  productService.ts                              # 상품 목록/좋아요 API adapter
  makeupGuideService.ts                          # 추천 메이크업 필터 sorting/mapping service
  faceAnalysisService.ts                         # 얼굴 분석 보고서 목록 조회

apps/mobile/src/shared/mocks/
  makeupGuide.mock.ts                            # 15개 추천 메이크업 필터 mock

apps/mobile/src/features/home/
  screens/HomeScreen.tsx                         # 홈 추천 메이크업 필터 그리드
  screens/FilterStoreScreen.tsx                  # 전체 추천 필터 목록

services/backend/app/api/products.py             # /products API router
services/backend/app/services/shopping_products.py
                                                   # 제품 추천 핵심 로직
services/backend/app/core/settings.py            # Naver/AWS/Bedrock 설정
```

## 3. 추천 기능 A: 추천 메이크업 필터

### 3.1 목적

추천 메이크업 필터는 실제 상품 추천이 아니다. 사용자가 화보형 카드에서 메이크업 룩을 고르면, 그 룩이 "썸네일에서 추출된 AR 필터"처럼 AR 화면에 적용되는 경험을 만든다.

현재 실제 이미지 분석은 하지 않는다. 각 filter의 `presetValues`가 이미지에서 추출된 메이크업 값 역할을 한다.

### 3.2 타입

파일: `apps/mobile/src/shared/types/makeupGuide.ts`

핵심 타입:

```ts
export type RecommendedMakeupFilter = MakeupFilter & {
  headline: string;
  displayTitle: string;
  description: string;
  keywords: readonly string[];
  embeddingVector: readonly number[];
  matchScore: number;
  sourceImageId: string;
  categoryTags: readonly string[];
  presetValues: MakeupFilterPresetValues;
};
```

기본 영역:

```ts
export type MakeupArea =
  | 'all'
  | 'base'
  | 'eye'
  | 'brow'
  | 'lip'
  | 'cheek'
  | 'contour';
```

AR 진입 source:

```ts
export type ARFilterLaunchSource =
  | 'quickAction'
  | 'recommendedFilter'
  | 'savedLook';
```

### 3.3 데이터

파일: `apps/mobile/src/shared/mocks/makeupGuide.mock.ts`

`mockRecommendedMakeupFilters`에 15개 이상 추천 필터가 들어 있다. 필터 하나는 다음 필드를 갖는다.

- `id`: route/state/save identity
- `imageSource`: bundled asset
- `categoryId`: recommended/trend/personalColor/popular
- `headline`: 카드 상단 감성 문구
- `displayTitle`: 카드/저장 표시명
- `description`: 설명
- `categoryTags`: 홈/스토어 chip 필터링용
- `keywords`: mock 추천 정렬용
- `embeddingVector`: mock cosine similarity용
- `matchScore`: 표시용 및 tie-break 정렬용
- `makeupAreas`: 적용 영역
- `colorOptions`, `typeOptions`, `textureOptions`: AR 옵션 카드용
- `presetValues`: AR 초기 적용값

### 3.4 정렬 로직

파일: `apps/mobile/src/shared/services/makeupGuideService.ts`

진입 함수:

```ts
getRecommendedMakeupFilters(userProfileVector?)
```

내부에서 `sortMakeupFiltersByRecommendationScore`를 호출한다. 정렬 기준은 다음 순서다.

1. 사용자 profile keywords와 filter keywords의 exact lowercase overlap 개수
2. filter `embeddingVector`와 profile `embeddingVector`의 cosine similarity
3. `matchScore`
4. `id.localeCompare`

기본 profile:

```ts
embeddingVector: [0.76, 0.42, 0.62, 0.72, 0.78]
keywords: ['쿨', '스모키', '브라운', '레드', '글로우', '트렌드']
```

주의:

- 현재 mock vector 길이는 5차원이다.
- 실제 얼굴 분석 기반 vector는 아직 연결되어 있지 않다.
- 키워드는 형태소 분석 없이 정확히 같은 문자열만 count한다.
- 빈 filters가 들어오면 `mockRecommendedMakeupFilters`로 fallback한다.

### 3.5 저장/좋아요 mapping

파일: `apps/mobile/src/shared/services/makeupGuideService.ts`

`mapMakeupFilterToSavedLook(filter)`는 추천 필터를 `MakeupLookPreview`로 바꾼다.

중요 필드:

```ts
id: `saved-${filter.id}-${timestamp}`
title: filter.displayTitle
moodLabel: filter.headline
shortDescription: filter.description
imageSource: filter.imageSource
makeupPresetValues.sourceFilterId: filter.id
```

`getLikedMakeupFilterLooks(filterIds)`는 flow state의 liked filter id 목록을 profile/list 화면에서 쓸 `MakeupLookPreview[]`로 변환한다.

### 3.6 홈 화면 연결

파일: `apps/mobile/src/features/home/screens/HomeScreen.tsx`

`HomeScreen`은 `getRecommendedMakeupFilters()` 결과를 받아 `FlatList` 2열 grid로 보여준다.

홈 카테고리:

```ts
all, red, glow, smoky, brown, pink, trend, unique
```

필터링:

```ts
filter.categoryTags.includes(categoryId)
```

중요 UI copy:

```ts
recommendedFilterSectionTitle = '추천 메이크업 필터'
recommendedFilterSectionDescription = '얼굴 무드에 맞춰 바로 적용해볼 수 있어요.'
```

### 3.7 전체 필터 화면

파일: `apps/mobile/src/features/home/screens/FilterStoreScreen.tsx`

역할:

- 전체 추천 필터 목록
- chip 필터링
- 좋아요 토글
- 선택 시 AR 적용

카테고리:

```ts
all, glow, smoky, red, pink, brown, trend, unique
```

`initialFilterId`가 있으면 해당 필터의 category를 자동 선택하고, `pinFilterStoreFilterToFront`로 맨 앞에 고정한다.

### 3.8 AR route 연결

파일: `apps/mobile/src/app/navigation/routeTypes.ts`

`ARFilter` route param:

```ts
ARFilter:
  | {
      fullFaceEditState?: FullFaceMakeupEditState;
      initialGuideMode?: GuideMode;
      initialMakeupFilterId?: string;
      source?: ARFilterLaunchSource;
    }
  | undefined;
```

추천 필터에서 AR로 보낼 때는 일반적으로 다음 의미를 갖는다.

```ts
{
  initialMakeupFilterId: filter.id,
  initialGuideMode: 'half',
  source: 'recommendedFilter',
}
```

`NavigationFlowState`에도 `selectedRecommendedMakeupFilterId`가 있다. route param은 화면 진입용이고, flow state는 탭/저장/리스트 간 상태 공유용에 가깝다.

## 4. 추천 기능 B: 실제 화장품 제품 추천

### 4.1 목적

제품 추천은 "현재 사용자 얼굴 분석 결과 또는 선택된 메이크업 룩에 잘 맞는 실제 구매 가능한 화장품"을 보여주는 기능이다.

대상 카테고리:

```ts
all, lip, cheek, shadow, liner, base
```

프론트 화면에서 하는 일:

- 기준 얼굴 분석 보고서 선택
- 추천 메이크업 룩 요약 표시
- 카테고리 필터
- match/price 정렬
- 제품 grid carousel
- 좋아요 저장/해제
- 구매 링크 열기
- 사진 변경 진입

### 4.2 프론트 타입

파일: `apps/mobile/src/features/recommendation/types.ts`

핵심 타입:

```ts
export type RecommendedProduct = {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  category: Exclude<ProductRecommendationCategory, 'all'>;
  matchRate: number;
  price: number;
  tags: string[];
  imageUrl?: string;
  imageSource: ImageSourcePropType;
  purchaseUrl?: string;
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
};
```

추천 화면 전체 payload:

```ts
export type ProductRecommendationData = {
  userNickname: string;
  makeupLook: ProductRecommendationLook;
  makeupLookOptions: ProductRecommendationLookOption[];
  tabs: ProductRecommendationTab[];
  products: RecommendedProduct[];
  sets: ProductRecommendationSet[];
};
```

### 4.3 프론트 service

파일: `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`

진입 함수:

```ts
getProductRecommendations({ lookIndex, reportId })
```

흐름:

1. `getBackendApiBaseUrl()`이 없으면 `productRecommendationMock` 반환
2. base URL이 있으면 `/products/recommendations` 호출
3. `reportId`가 있으면 query param `report_id`
4. `lookIndex`가 0 이상 number면 query param `look_index`
5. 응답을 `mapProductRecommendationData`로 frontend model에 맞춘다
6. 실패하면 `buildEmptyApiRecommendationData()` 반환

중요한 현재 정책:

- API base URL이 없는 로컬/demo 환경은 full mock을 보여준다.
- API base URL이 있는데 호출 실패하면 mock 상품으로 돌아가지 않고 빈 상품 목록을 반환한다.
- 빈 상품 목록일 때 화면에는 "네이버 스토어 상품을 불러오지 못했어요" 상태가 나온다.

### 4.4 프론트 응답 mapping

파일: `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`

backend product는 nullable/optional이 많다. mapper는 fallback mock product를 섞어 UI가 깨지지 않게 한다.

핵심 함수:

- `normalizeCategory`
  - 허용 category가 아니면 `lip`
- `mapProduct`
  - backend 값 우선, 없으면 같은 category mock fallback
  - `imageUrl`이 있으면 `imageSource = { uri: imageUrl }`
  - `priceKrw`도 price fallback으로 허용
- `isPurchasableBackendProduct`
  - `imageUrl`과 `purchaseUrl`이 모두 있어야 화면에 표시
- `mapMakeupLook`
  - backend recommended makeup card가 있으면 imageUrl/title/palette/tags 반영
  - 없으면 mock makeup look
- `buildFallbackSets`
  - backend sets가 없으면 products 앞 3개로 set 생성

실무상 중요한 점:

- backend가 product를 내려도 `imageUrl` 또는 `purchaseUrl`이 빠지면 프론트에서 삭제된다.
- 상품 수가 0이면 "실패"처럼 보인다.
- backend fallback products가 빈 배열이라 실제 API/DB 설정 없이는 backend-connected 환경에서 empty state가 정상 동작이다.

### 4.5 제품 추천 화면

파일: `apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx`

주요 state:

```ts
data: ProductRecommendationData | null
activeCategory: ProductRecommendationCategory
likedProductIds: Set<string>
reports: FaceAnalysisReport[]
selectedReportId: string | null
sortOption: 'matchDesc' | 'priceAsc' | 'priceDesc'
currentPage: number
isSortMenuOpen: boolean
isLookPickerOpen: boolean
isRecommendationRefreshing: boolean
selectedLookIndex: number
```

화면 진입/포커스 시:

```ts
useFocusEffect(loadRecommendations)
```

`loadRecommendations`는 `Promise.allSettled`로 병렬 로드한다.

```ts
getProductRecommendations({ lookIndex: selectedLookIndex, reportId: recommendationReportId })
getLikedProducts()
```

보고서 목록 로드:

```ts
getFaceAnalysisReports({ limit: 20 })
```

보고서 선택 로직:

- route에서 `sourceReportId`가 오면 우선 사용
- 없으면 최신 report id를 selected로 세팅
- report list가 아직 안 불렸고 sourceReportId도 없으면 추천 호출을 기다린다

룩 선택 저장:

- SecureStore key prefix: `aura.productRecommendation.lookIndex`
- key suffix: report id 또는 `latest`
- 선택한 look index는 report별로 복원된다.

상품 표시:

- category filter 후 sort
- `PRODUCT_PAGE_SIZE = 4`
- 한 페이지에 2열 x 2행
- horizontal paging carousel

좋아요:

- 누르면 즉시 optimistic update
- 성공 시 그대로 유지
- 실패 시 이전 set으로 rollback

구매 링크:

- `openProductPurchaseUrl(product)`
- `purchaseUrl` 없거나 `Linking.openURL` 실패하면 false 반환 및 console info

### 4.6 좋아요 상품 service

파일: `apps/mobile/src/shared/services/productService.ts`

함수:

- `getProducts()`
  - 항상 `productsMock`
- `getLikedProducts()`
  - base URL 없으면 mock 중 `isLiked`
  - base URL 있으면 `/products/liked`
  - 실패하면 빈 배열
- `likeProduct(product)`
  - base URL 없으면 true
  - 있으면 `POST /products/{id}/like` with `{ product }`
- `unlikeProduct(productId)`
  - base URL 없으면 true
  - 있으면 `DELETE /products/{id}/like`

중요:

- external shopping product는 UUID가 아니므로 backend에서 `external_key`로 upsert한다.
- like payload에 `imageUrl`, `purchaseUrl`, `matchRate`, `productInfo`, `reason` 등을 같이 보낸다.

### 4.7 backend API route

파일: `services/backend/app/api/products.py`

Endpoints:

```text
GET    /api/products/recommendations
GET    /api/products/liked
POST   /api/products/{product_id}/like
DELETE /api/products/{product_id}/like
```

`GET /products/recommendations` query:

- `category?: string`
- `look_index?: int`
- `report_id?: string`

주의:

- 프론트의 `getProductRecommendations`는 현재 `category`를 query로 보내지 않는다. category filter는 프론트에서 처리한다.
- backend route는 category를 받을 준비가 되어 있으므로 추후 서버-side category query로 바꿀 수 있다.

### 4.8 backend 추천 핵심 함수

파일: `services/backend/app/services/shopping_products.py`

진입 함수:

```py
async def build_product_recommendation_data(
  db: Database,
  settings: Settings,
  category: str | None = None,
  auth_provider: str | None = None,
  look_index: int | None = None,
  oauth_sub: str | None = None,
  report_id: str | None = None,
  profile_override: dict[str, Any] | None = None,
  query_override: str | None = None,
) -> tuple[dict[str, Any], str]:
```

흐름:

1. `profile_override`가 있으면 사용
2. 없으면 `_fetch_report_profile`로 DB의 `analysis_reports`에서 사용자 report profile을 가져온다.
3. `look_index`가 유효하면 profile에 `selectedRecommendedMakeupIndex`를 세팅한다.
4. `_fetch_naver_products`로 Naver Shopping 상품을 가져온다.
5. Naver 결과가 있으면 source는 `naver_shopping` 또는 `naver_shopping_matched`
6. Naver 결과가 없으면 `_fetch_db_products`
7. DB 결과가 있으면 source는 `database` 또는 `database_matched`
8. products와 profile이 있으면 `_apply_semantic_product_scores`
9. semantic이 적용되면 source에 `_semantic` suffix 추가
10. 그래도 products가 없으면 `_fallback_products(category)`
11. 현재 `_fallback_products`는 빈 배열 반환

반환 shape:

```py
{
  "userNickname": "고객",
  "makeupLook": _build_makeup_look(profile),
  "makeupLookOptions": _build_makeup_look_options(profile),
  "tabs": TABS,
  "products": products,
  "sets": _build_sets(products),
}
```

### 4.9 backend profile 추출

`_fetch_report_profile`는 `analysis_reports`와 `users`를 join해서 현재 auth subject의 report를 찾는다.

`report_id`가 있으면 해당 id를 찾고, 없으면 가장 최신 completed report를 찾는다.

`_normalize_report_payload`는 DB row와 `detail_payload.result`를 섞어 다음 값을 만든다.

- `baseMakeupGuide`
- `faceShape`
- `makeupGuideline`
- `personalColor`
- `recommendedMood`
- `recommendedMakeups`
- `shortSummary`
- `skinAnalysisSummary`
- `skinType`
- `summary`
- `tags`
- `toneSummary`

`recommendedMakeups`는 최대 3개까지 normalize된다. 각 card는 title/imageUrl/description/subtitle/tags/palette를 가질 수 있다.

### 4.10 makeup look 생성

`_build_makeup_look(profile)`는 제품 추천 화면 상단에 보이는 "추천 기준 룩"을 만든다.

우선순위:

1. selected/first `recommendedMakeups` card
2. `recommendedMood`
3. `personalColor`
4. `DEFAULT_MAKEUP_LOOK`

palette는 `_palette_for_makeup`에서 만든다.

- card에 explicit palette가 있으면 그걸 우선 사용
- 없으면 title/description/tags/profile text에서 색상 term을 찾아 palette lookup
- 그래도 없으면 default palette

`_build_makeup_look_options(profile)`는 report에 들어 있는 generated makeup cards를 선택 가능한 options로 만든다. 프론트의 look picker가 이 값을 쓴다.

### 4.11 Naver Shopping fetch

필요 settings:

- `NAVER_SHOPPING_CLIENT_ID`
- `NAVER_SHOPPING_CLIENT_SECRET`

settings field:

```py
naver_shopping_client_id: str | None
naver_shopping_client_secret: str | None
```

category config:

```py
PRODUCT_CATEGORIES = ("lip", "cheek", "shadow", "liner", "base")
```

각 category는 query/label/palette/reason을 가진다.

Naver request:

```text
GET https://openapi.naver.com/v1/search/shop.json
headers:
  X-Naver-Client-Id
  X-Naver-Client-Secret
params:
  display=40
  exclude=used:rental:cbshop
  filter=naverpay
  query=<category/profile query>
  sort=sim
  start=1
```

fetch 정책:

- category별로 여러 query를 시도한다.
- query 후보:
  - `query_override`
  - profile term이 붙은 category query
  - base category query
  - category fallback queries
- category당 최대 8개 반환
- 전체 category를 병렬 fetch 후 id dedupe

### 4.11.1 Naver API가 실제로 제공하는 정보

공식 Naver Search API 쇼핑 문서 기준으로 쇼핑 검색 응답은 "검색 결과 수준"의 정보만 제공한다. 현재 구현도 이 전제 위에 있다.

공식 응답 item에서 기대할 수 있는 주요 필드:

- `title`: 상품 이름. 검색어와 일치한 부분에 `<b>` 태그가 포함될 수 있다.
- `link`: 상품 정보 URL 또는 Naver redirect URL
- `image`: thumbnail image URL
- `lprice`: 최저가. 가격 비교 데이터가 없으면 상품 가격 의미
- `hprice`: 최고가. 없으면 `0`
- `mallName`: 쇼핑몰명
- `productId`: Naver Shopping 상품 ID
- `productType`: 상품군/상품 종류 type
- `maker`: 제조사
- `brand`: 브랜드
- `category1`, `category2`, `category3`, `category4`: 대/중/소/세분류 카테고리

공식 문서:

- https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md

중요한 부재 정보:

- Naver API는 화장품 전용 `색상`, `제형`, `피부타입`, `마감감`, `발림성`, `퍼스널컬러 적합도`, `리뷰 키워드`, `전성분`, `컬러칩` 같은 구조화 metadata를 직접 주지 않는다.
- 현재 backend는 Naver API에서 받은 `title`, `category2~4`, `mallName`, `brand`, `maker` 정도의 얕은 텍스트만 보고 화장품 매칭용 정보를 추론한다.
- Naver 상품의 `shadeName`은 현재 `_map_naver_item`에서 빈 문자열로 둔다. API가 별도 shade field를 주는 구조가 아니기 때문이다.
- Naver 상품의 `palette`는 실제 이미지/상세페이지에서 추출한 색상이 아니다. 현재는 category별 fallback palette인 `CATEGORY_CONFIG[category]["palette"]`를 넣는다.

### 4.11.2 현재 구현에서 색상/제형/톤 정보가 만들어지는 방식

현재 제품 metadata는 세 갈래에서 온다.

1. Naver raw text에서 추론
2. DB row 또는 `product_payload`에 미리 들어 있는 보강 정보
3. category fallback 값

Naver 상품 경로:

```text
Naver item
-> _map_naver_item
-> _extract_product_specs(raw_text=title, source=item)
-> _score_product_match(specs, category, index, profile)
```

Naver item에는 일반적으로 `colors`, `effects`, `skinTypes`, `features` 같은 필드가 없다. 그래서 `_extract_product_specs`는 대부분 다음 텍스트를 합친 `searchable_text`에서 term을 찾는다.

```text
title
category2
category3
category4
mallName
brand
maker
```

예시:

- 상품명에 `코랄`, `핑크`, `로즈`, `브라운`이 있으면 `colors`로 추출될 수 있다.
- 상품명에 `매트`, `글로우`, `글로시`, `촉촉`, `벨벳`이 있으면 `effects`로 추출될 수 있다.
- 상품명에 `웜톤`, `쿨톤`이 있으면 `tones`와 `features`에 반영될 수 있다.
- category가 `base`인데 skin type이 없으면 `모든피부용`을 넣는다.

DB 상품 경로:

```text
products row
-> _map_db_product
-> _extract_product_specs(raw_text=product_name + shade_name + tags + palette + product_payload, source=payload)
-> _score_product_match(specs, category, index, profile)
```

DB 상품은 Naver보다 보강 여지가 크다. `product_payload`에 다음 같은 값이 미리 들어 있으면 `_extract_product_specs`가 직접 사용할 수 있다.

```json
{
  "colors": ["코랄", "피치"],
  "effects": ["글로우", "촉촉"],
  "skinTypes": ["건성"],
  "features": ["수분", "밀착"],
  "tones": ["웜톤"],
  "purchaseUrl": "https://...",
  "imageUrl": "https://..."
}
```

즉 현재 시스템에서 "정교한 화장품 metadata"는 Naver에서 자동으로 오는 것이 아니다. Naver 상품은 title/category 기반 추론이고, DB 상품은 사람이 넣었거나 별도 pipeline이 넣은 `product_payload`가 있을 때만 더 풍부해진다.

### 4.11.3 현재 추가 크롤링 여부

현재 repo에는 Naver `link`를 따라가서 상세페이지를 크롤링하는 코드가 없다.

현재 하지 않는 것:

- Naver 상품 상세페이지 HTML fetch
- 브랜드 공식몰 상세페이지 crawl
- Olive Young 등 판매처 상세페이지 crawl
- 상품 이미지에서 실제 색상 palette 추출
- 리뷰/평점/키워드 수집
- 전성분/제형/피부타입 자동 수집
- Naver 검색 결과를 비동기 enrichment job으로 DB에 저장
- 추천 요청 중 Naver 결과를 DB에 자동 cache/upsert

현재 Naver 결과는 추천 요청 중 메모리에서 변환되고 score가 계산된다. 단, 사용자가 상품에 좋아요를 누르면 `POST /products/{product_id}/like` 경로에서 external product payload가 DB `products` table에 upsert될 수 있다. 이것은 "추천 후보 전체를 미리 저장"하는 것이 아니라, 사용자가 저장한 외부 상품을 liked product로 복원하기 위한 저장에 가깝다.

향후 상세 metadata가 필요하면 별도 product enrichment pipeline을 만들어야 한다.

가능한 고도화 설계:

- Naver search 결과를 일단 `products` 또는 별도 `product_candidates` table에 cache
- background job이 `purchaseUrl`/브랜드 상세 URL을 수집
- 허용된 범위 안에서 상세페이지 text/image/review를 수집
- LLM 또는 rule parser로 `colors`, `effects`, `texture`, `skinTypes`, `tones`, `finish`, `coverage`, `ingredients`를 구조화
- 사람이 검수한 curated catalog를 운영
- 추천 요청 시에는 enriched DB metadata를 우선 사용하고, live Naver search는 freshness/backfill 용도로 사용

### 4.11.4 사용자 보고서 정보와 상품 비교 타이밍

현재 구조는 요청 시점 on-demand 비교다.

프론트에서 추천 화면이 로드되면:

```text
ProductRecommendationScreen
-> getProductRecommendations({ reportId, lookIndex })
-> GET /products/recommendations?report_id=...&look_index=...
```

백엔드에서 그 요청을 받으면:

```text
build_product_recommendation_data
-> _fetch_report_profile
-> _fetch_naver_products
-> _map_naver_item
-> _extract_product_specs
-> _score_product_match
-> optional _apply_semantic_product_scores
-> response
```

정확히 말하면:

- 사용자의 분석 보고서는 추천 요청이 들어온 시점에 DB에서 읽는다.
- `report_id`가 있으면 해당 report를 읽고, 없으면 현재 auth user의 최신 completed report를 읽는다.
- `look_index`가 있으면 report의 `recommendedMakeups` 중 선택한 룩을 `selectedRecommendedMakeupIndex`로 지정한다.
- 이 profile에서 `personalColor`, `skinType`, `recommendedMood`, `makeupGuideline`, `recommendedMakeups`, `toneSummary` 등을 text로 합친다.
- `_target_terms`가 이 profile text에서 색상/제형/톤/피부타입 target terms를 뽑는다.
- 그 다음 Naver live search 또는 DB fallback 상품 후보와 비교한다.

질문으로 표현하면 "요청했을 때 report를 read/load해서 그때 후보들과 비교한다"가 맞다. 다만 "Naver 상품을 그 요청 중 DB에 넣고 비교한다"는 현재 구현과 다르다. Naver 상품은 요청 중 메모리에서 변환/스코어링되고, 좋아요를 누른 외부 상품만 DB에 저장된다.

Bedrock semantic scoring도 같은 요청 흐름 안에서 선택적으로 수행된다. embedding은 metadata를 새로 만들어 저장하는 단계가 아니라, profile text와 product text의 유사도를 계산해 기존 `matchRate`를 재정렬/보정하는 단계다.

### 4.12 Naver 상품 필터링

`_map_naver_item`은 raw Naver item을 product로 변환한다. 필수 값:

- `title`
- `link`
- `image`
- `productId`

이 중 하나라도 없으면 제외된다.

`_is_naver_cosmetic_item_for_category`에서 비화장품을 적극적으로 제거한다.

제외 예시:

- 신발
- 의류
- 패션잡화
- 주얼리
- 운동화
- 소파/방석 같은 living cushion
- 패션 색상 의미의 "blush/liner"

카테고리 metadata가 믿을 만하면 category text 또는 strict product term을 본다. metadata가 비어 있으면 strict cosmetic product term만 허용한다.

관련 test:

- 비화장품 신발 reject
- fashion color blush reject
- fashion liner reject
- living cushion reject
- cosmetic blusher accept

### 4.13 상품 spec 추출

`_extract_product_specs`는 상품 title/category/brand/maker/source payload에서 다음 정보를 뽑는다.

- `brand`
- `colors`
- `containerTypes`
- `effects`
- `features`
- `maker`
- `origin`
- `productNumber`
- `skinTypes`
- `tones`

term list:

- colors: 베이지, 핑크, 코랄, 로즈, 피치, 브라운, 누드, 모브, 플럼, 레드, 오렌지, 아이보리, 라벤더
- finishes: 매트, 세미매트, 글로우, 글로시, 윤광, 촉촉, 벨벳, 새틴, 쉬어
- tones: 웜톤, 쿨톤, 뉴트럴, 뮤트, 라이트, 브라이트, 딥
- skin types: 모든피부용, 건성, 지성, 복합성, 민감성, 중성
- features: 지속력, 롱래스팅, 수분, 보송, 블러, 톤업, 커버, 밀착 등
- containers: 스틱, 튜브, 팔레트, 쿠션, 펜슬, 리퀴드 등

base category인데 skin type이 비어 있으면 `모든피부용`을 넣는다.

### 4.13.1 제품 추천 로직 전체 순서

현재 "추천 제품을 찾아주는 로직"은 하나의 AI 호출로 끝나는 구조가 아니다. 큰 흐름은 후보 생성, 하드 필터링, rule-based scoring, optional semantic rerank 순서다.

전체 pipeline:

```text
1. 추천 요청 수신
2. 사용자 분석 보고서 profile 로드
3. profile text에서 target terms 추출
4. category별 검색 query 생성
5. Naver Shopping live search로 후보 생성
6. Naver 후보의 비화장품/카테고리 불일치 hard reject
7. 후보 상품의 title/category/brand/maker에서 product specs 추출
8. profile target terms와 product specs를 rule score로 비교
9. Naver 후보가 없으면 DB 상품 fallback
10. Bedrock embedding 설정이 있으면 semantic score로 보정/재정렬
11. product cards, sets, makeupLook summary를 응답
```

이 중 현재 추천 정확도를 가장 많이 좌우하는 것은 3, 6, 7, 8번이다. Bedrock semantic scoring은 있으면 보정 역할을 하지만, metadata 추출과 기본 점수의 주체는 rule logic이다.

#### 1단계: profile text 만들기

`_profile_text(profile, category)`가 사용자 보고서와 선택된 recommended makeup card를 하나의 검색 가능한 텍스트로 합친다.

포함되는 값:

- selected/first `recommendedMakeups.title`
- `recommendedMakeups.subtitle`
- `recommendedMakeups.description`
- `recommendedMakeups.tags`
- `personalColor`
- `skinType`
- `toneSummary`
- `recommendedMood`
- `summary`
- `shortSummary`
- `skinAnalysisSummary`
- `baseMakeupGuide`
- report `tags`
- `makeupGuideline`의 모든 값
- category별 guide key
  - `base`: `baseMakeupGuide`
  - `cheek`: `makeupGuideline.blush`
  - `liner`: `makeupGuideline.eyeliner`
  - `lip`: `makeupGuideline.lip`
  - `shadow`: `makeupGuideline.eyeshadow`

이 단계는 "사용자에게 무엇이 어울리는가"를 구조화하기 위한 전처리다.

#### 2단계: target terms 뽑기

`_target_terms(profile, category)`가 profile text에서 추천 조건을 term list로 뽑는다.

결과 shape:

```py
{
  "colors": [...],
  "features": [...],
  "finishes": [...],
  "skinTypes": [...],
  "tones": [...],
}
```

추론 규칙:

- profile text에 `코랄`, `로즈`, `피치` 등이 있으면 `colors`
- profile text에 `매트`, `글로우`, `촉촉` 등이 있으면 `finishes`
- profile text에 `웜톤`, `쿨톤`, `뮤트` 등이 있으면 `tones`
- `personalColor`에 `봄` 또는 `가을` 또는 `warm`이 있으면 `웜톤` 추가
- `personalColor`에 `여름` 또는 `겨울` 또는 `cool`이 있으면 `쿨톤` 추가
- `skinType`에 `건성`이 있으면 `촉촉`, `글로우`, `윤광`, `건성` 추가
- `skinType`에 `지성` 또는 `복합성`이 있으면 `세미매트`, `매트`, `보송`, 해당 skin type 추가

즉 사용자가 명시적으로 "매트 립"이라고 하지 않아도, 보고서의 피부타입/퍼스널컬러에서 일부 target이 추가된다.

#### 3단계: category별 query 만들기

`_build_category_query(category, profile)`가 Naver 검색어를 만든다.

profile이 없으면 category 기본 query만 쓴다.

기본 query:

- `lip`: `립틴트 립스틱 화장품`
- `cheek`: `블러셔 치크 화장품`
- `shadow`: `아이섀도우 팔레트 화장품`
- `liner`: `아이라이너 화장품`
- `base`: `쿠션 파운데이션 베이스 화장품`

profile이 있으면 `_target_terms`에서 뽑은 `colors`, `tones`, `finishes` 중 앞 4개를 기본 query 뒤에 붙인다.

예:

```text
립틴트 립스틱 화장품 코랄 웜톤 매트
```

후보 query는 한 개가 아니라 여러 개다.

```text
query_override
profile term이 붙은 category query
base category query
category fallback queries
```

첫 query에서 충분한 후보가 안 나오면 fallback query를 순서대로 시도한다.

#### 4단계: hard filtering

Naver 검색은 query가 좋아도 패션/잡화/생활용품이 섞일 수 있다. 그래서 `_is_naver_cosmetic_item_for_category`가 score 계산 전에 후보를 버린다.

하드 필터의 역할:

- 화장품이 아닌 상품을 score로 살려두지 않는다.
- `블러셔 컬러 신발`, `라이너 재킷`, `쿠션 방석`처럼 화장품 용어가 들어간 비화장품을 제거한다.
- category metadata가 믿을 만하면 category text와 product term을 같이 본다.
- category metadata가 비어 있으면 더 엄격하게 `CATEGORY_STRICT_PRODUCT_TERMS`만 허용한다.

이 단계는 recall보다 precision을 우선한다. 즉 좋은 상품 일부를 놓치더라도, 추천 화면에 엉뚱한 신발/의류/방석이 나오는 것을 더 강하게 막는다.

#### 5단계: product specs 추출

hard filter를 통과한 상품은 `_extract_product_specs`로 매칭용 specs를 만든다.

Naver 상품에서는 대부분 상품명/카테고리 텍스트 기반이다.

DB 상품에서는 다음 값이 함께 들어간다.

```text
product_name
shade_name
tags
palette
product_payload JSON
```

그래서 DB 상품은 사람이 넣거나 enrichment pipeline이 넣어둔 `colors`, `effects`, `skinTypes`, `features`, `tones`가 있으면 훨씬 정확하게 매칭된다.

### 4.14 rule-based scoring

함수: `_score_product_match(specs, category, index, profile)`

rule score는 현재 추천 제품의 기본 `matchRate`를 만든다. semantic scoring이 켜져도 rule score가 완전히 사라지지 않고 65% 비중으로 남는다.

#### profile이 없는 경우

사용자 report profile이 없으면 상품별 실제 term match를 할 수 없으므로 Naver/API 결과 순서를 대체 점수로 사용한다.

```py
max(82, 96 - index * 2)
```

의미:

- 첫 번째 후보는 96점
- 뒤로 갈수록 2점씩 감소
- 그래도 최소 82점은 보장

이 fallback은 "개인화 추천"이라기보다 "검색 결과 순서 기반 기본 추천"이다.

#### profile이 있는 경우

기본 점수 `74`에서 시작한다.

가산:

- colors match: 개당 12점, 최대 36
- effects/finishes match: 개당 4점, 최대 12
- skinTypes match: 개당 4점, 최대 8
- features match: 개당 3점, 최대 9
- tones match: 개당 7점, 최대 14
- color match bonus: `COLOR_MATCH_BONUS = 10`

감점:

- 웜톤 상품 vs 쿨톤 target: -8
- 쿨톤 상품 vs 웜톤 target: -8
- 색상 target이 있는데 색상 불일치이고 category가 lip/cheek/shadow/base: `COLOR_MISMATCH_PENALTY = 12`
- index penalty: `min(index, 6)`

최종 clamp:

```py
min(99, max(62, score))
```

#### 점수 계산을 풀어쓴 예시

예를 들어 사용자 report target이 다음과 같다고 하자.

```py
targets = {
  "colors": ["코랄", "피치"],
  "finishes": ["매트", "보송"],
  "skinTypes": ["복합성"],
  "features": ["밀착"],
  "tones": ["웜톤"],
}
```

상품 specs가 다음과 같으면:

```py
specs = {
  "colors": ["코랄", "베이지"],
  "effects": ["매트"],
  "skinTypes": [],
  "features": ["롱래스팅"],
  "tones": ["웜톤"],
}
```

대략 계산은:

```text
기본 74
+ colors match 코랄 12
+ effects match 매트 4
+ tones match 웜톤 7
+ color match bonus 10
- index penalty
= 107 - index penalty -> 최종 99로 clamp
```

반대로 target colors가 있는데 상품에서 색상 term을 못 찾거나 불일치하면 lip/cheek/shadow/base에서는 `COLOR_MISMATCH_PENALTY = 12`가 빠진다.

#### matched_terms의 역할

`_score_product_match`는 점수와 함께 `matched_terms`도 반환한다.

이 terms는 두 군데에 쓰인다.

1. `_match_reason`
   - 예: `봄웜 라이트 보고서에서 강조된 코랄, 매트 조건과 상품 특징이 맞아 추천해요.`
2. `_product_tags`
   - matched terms를 card tag 앞쪽에 넣어 사용자가 왜 추천됐는지 보게 한다.

즉 rule score는 단순 정렬뿐 아니라 화면의 설명/태그에도 영향을 준다.

#### rule score와 Naver 순서의 관계

Naver API는 `sort=sim`으로 정확도순 결과를 준다. 하지만 backend는 Naver 순서를 그대로 쓰지 않는다.

현재 순서:

```text
Naver 검색 결과
-> _map_naver_item에서 각 상품별 rule score 계산
-> category당 rule score 내림차순 정렬
-> 전체 category 결과 dedupe
-> semantic scoring이 켜져 있으면 다시 rerank
```

따라서 최종 `matchRate`는 Naver 순위가 아니라 우리 rule/semantic 점수다. 다만 `index penalty`가 있어서 Naver에서 너무 뒤에 나온 상품은 약하게 감점된다.

### 4.15 semantic scoring

함수: `_apply_semantic_product_scores(products, settings, profile)`

조건:

- products 존재
- profile 존재
- `settings.effective_embedding_model_id` 존재

사용 provider:

- Bedrock Runtime
- default model: `amazon.titan-embed-text-v2:0`
- default dimension: `1024`

profile embedding text:

- 추천 카테고리
- 핵심 색상 조건 repeated
- 분석 보고서 text
- 추천 타깃 특징

product embedding text:

- 상품 카테고리
- 상품 핵심 색상 repeated
- 브랜드
- 상품명/호수
- 태그
- productInfo
- 추천 이유

semantic score:

```py
cosine similarity -> 0..100 semantic rate
```

rule score와 semantic score 결합:

```py
SEMANTIC_MATCH_WEIGHT = 0.35
combined = rule_score * 0.65 + semantic_rate * 0.35
```

이후 `_color_match_adjustment`를 다시 더한다.

semantic rate가 72 이상이면 reason 뒤에:

```text
보고서 특징 벡터와 상품 정보 유사도도 높게 나왔어요.
```

를 붙인다.

실패하면 warning log 후 원래 products를 그대로 반환하고 semantic_applied는 false다.

### 4.16 DB fallback

`_fetch_db_products`는 `products` table에서 `is_active = true` 상품을 가져온다.

category가 있으면 category filter를 적용한다.

`_map_db_product`는 DB row를 frontend product shape으로 만든다.

주의:

- `purchaseUrl`이 없으면 product를 버린다.
- imageUrl은 payload에서 `imageUrl` 또는 `image_url`을 본다.
- matchRate는 payload의 `matchRate`가 있으면 우선 사용하고, 없으면 rule score를 쓴다.
- DB product도 profile이 있으면 rule score에 profile이 반영된다.

### 4.17 backend source meta

`/products/recommendations` 응답 envelope의 meta source는 다음 가능성이 있다.

- `fallback`
- `naver_shopping`
- `naver_shopping_matched`
- `database`
- `database_matched`
- 위 source 뒤에 `_semantic` suffix

현재 no DB/no Naver 상태에서도 HTTP 200이며:

```json
{
  "data": {
    "userNickname": "고객",
    "tabs": [{"id": "all", "label": "전체"}],
    "products": []
  },
  "meta": {
    "source": "fallback"
  }
}
```

계약 test가 이 동작을 고정한다.

## 5. Auradin 검색 화면

파일:

- `apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx`
- `apps/mobile/src/features/recommendation/services/auradinService.ts`
- `apps/mobile/src/features/recommendation/mocks/auradin.mock.ts`

현재 Auradin은 실제 backend/search service가 아니라 mock-only interactive prototype이다.

흐름:

```text
home -> searching -> question -> searching -> results
```

특징:

- `getAuradinDraftData()`는 `auradinDraftMock`만 반환한다.
- prompt parsing 없음
- candidate narrowing 없음
- 구매 링크 연동 없음
- `conditionChips`, `quickPrompts`, `sourceCards`, `thinkingSteps`, `question`, `candidates`는 모두 mock data다.

고도화 시 이 화면은 기존 `/products/recommendations` stack과 연결하거나, 별도 conversational narrowing API를 만들어야 한다.

## 6. Navigation 연결

파일: `apps/mobile/src/app/navigation/routes/recommendationRoutes.tsx`

### 6.1 ProductRecommendationRouteScreen

`ProductRecommendationRouteScreen`은 `selectedFaceAnalysisReport` 또는 route param `reportId`를 `ProductRecommendationScreen`에 넘긴다.

사진 촬영/갤러리 변경:

```ts
navigation.navigate('FaceCapture', { afterAnalysisRoute: 'ProductRecommendation' })
navigation.navigate('FaceCapture', {
  afterAnalysisRoute: 'ProductRecommendation',
  initialSource: 'gallery',
})
```

### 6.2 MakeupLookListRouteScreen

`likedMakeupFilterIds`를 `getLikedMakeupFilterLooks`로 변환해 `MakeupLookListScreen`에 전달한다.

룩을 누르면:

1. `sourceFilterId`를 꺼낸다.
2. `setSelectedRecommendedMakeupFilterId(filterId)`
3. `navigation.navigate('ARFilter', getRecommendedFilterRouteParams(filterId))`

### 6.3 LikedProductListRouteScreen

좋아요한 실제 상품 목록 화면으로 간다.

## 7. NavigationFlowState

파일: `apps/mobile/src/app/navigation/flowState.tsx`

추천 관련 state:

```ts
likedMakeupFilterIds: readonly string[];
savedMakeupLook: MakeupLookPreview | null;
selectedFaceAnalysisReport: FaceAnalysisReport | null;
selectedRecommendedMakeupFilterId: string | null;
```

주의:

- 실제 상품 좋아요는 backend `/products/liked`와 `ProductRecommendationScreen` state가 중심이다.
- 메이크업 필터 좋아요는 `likedMakeupFilterIds` in flow state 중심이다.
- 둘을 혼동하면 profile/list 반영이 어긋난다.

## 8. 환경 변수와 설정

### 8.1 mobile

`apps/mobile/src/shared/services/backendApi.ts`

Backend API 사용 조건:

```ts
process.env.EXPO_PUBLIC_API_BASE_URL
```

없으면 backend adapter는 mock/fallback로 동작한다.

request envelope:

```ts
{
  data?: T | null;
  error?: { code?: string; details?: Record<string, unknown>; message?: string } | null;
  meta?: unknown;
}
```

timeout:

```ts
DEFAULT_REQUEST_TIMEOUT_MS = 60000
```

auth:

- `setBackendAuthTokenProvider`로 token provider 주입
- token이 있으면 `Authorization: Bearer <token>`

### 8.2 backend

파일: `services/backend/app/core/settings.py`

추천 관련 settings:

```py
aws_region = "ap-northeast-2"
bedrock_embedding_model_id = "amazon.titan-embed-text-v2:0"
bedrock_embedding_region = None
embedding_dimension = 1024
naver_shopping_client_id = None
naver_shopping_client_secret = None
```

Naver Shopping API가 없으면 live purchasable product fetch는 동작하지 않는다.

Bedrock embedding model id가 없으면 semantic scoring은 skip된다.

`public_config_status`에서 `naverShoppingApi`, `bedrockEmbeddingModelId`, `embeddingDimension`, `awsCredentialsOrRole` 상태를 확인할 수 있다.

## 9. 테스트로 고정된 계약

### 9.1 mobile

`apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.test.tsx`

현재 아주 얕은 smoke/utility test다.

고정 내용:

- section eyebrow/title 일부가 undefined
- set section title: `${nickname} 님의 룩과 잘 맞는 추천 조합`
- report label: `MM.DD · personalColor`
- null report fallback: `최근 분석 기준`
- `<ProductRecommendationScreen />` render smoke

`apps/mobile/src/shared/services/makeupGuideService.test.ts`

추천 필터 service 테스트가 있다. 확인할 것:

- recommended filters count
- sorting
- cosine similarity
- saved/liked mapping
- sourceFilterId stability

### 9.2 backend

`services/backend/tests/test_route_contract.py`

no DB/no Naver 환경에서도 `/api/products/recommendations`가 mobile contract를 반환해야 한다.

현재 기대:

- status 200
- `userNickname == "고객"`
- first tab `{id: "all", label: "전체"}`
- `products == []`
- `meta.source == "fallback"`

`services/backend/tests/test_settings_and_services.py`

중요 coverage:

- Naver item mapping
- 한국어 없는 title localization
- report term 기반 match score
- 비화장품 filtering
- liner query에서 brow product 제외
- generated makeup card 기반 makeup look 생성
- selectedRecommendedMakeupIndex 적용
- makeup look options 생성
- profile text에 generated makeup terms 포함
- fallback query 사용
- Bedrock semantic rerank

`services/backend/tests/test_products_api.py`

external product like upsert 계약을 확인한다.

## 10. 현재 구조의 의도된 제약

1. 추천 필터 이미지는 앱 번들 asset을 사용한다.
2. 추천 필터 이미지에는 실제 인물/로고/워터마크/텍스트가 들어가면 안 된다.
3. 추천 필터 이름과 mood copy는 이미지가 아니라 RN UI text로 렌더링한다.
4. 실제 AR 필터 추출은 아직 없다. `presetValues`가 placeholder contract다.
5. 제품 추천은 Naver Shopping + DB + optional Bedrock semantic matching 구조다.
6. 제품 추천 fallback은 "API base URL 없음"과 "API 호출 실패"가 다르게 동작한다.
7. API base URL 없음: full mock
8. API 호출 실패: empty products
9. backend fallback products: 현재 empty list
10. 실제 상품으로 화면에 나오려면 imageUrl과 purchaseUrl이 모두 필요하다.

## 11. 고도화 시 먼저 결정할 것

### 11.1 제품 추천 UX 정책

현재 API-connected 실패는 빈 상태다. 발표/demo 안정성을 우선하면 실패 시 mock 상품 fallback을 보여줄 수 있다. 반대로 실제 운영 디버깅을 우선하면 지금처럼 empty state가 맞다.

결정 필요:

- backend 실패 시 mock 상품 표시 여부
- Naver API 설정 누락 시 사용자에게 보여줄 문구
- 구매 링크 없는 DB 상품을 표시할지 여부
- `category` filter를 frontend-only로 둘지 backend query로 보낼지 여부

### 11.2 추천 품질

현재 rule score는 term matching이다. 고도화 방향:

- report profile을 structured recommendation input으로 정규화
- color family, undertone, finish, texture, budget, vendor availability를 별도 feature로 분리
- Naver title/category만이 아니라 product detail enrichment 도입
- productInfo를 DB에 cache
- semantic score와 rule score의 weight를 실험 가능하게 설정화
- category별 weight를 다르게 둔다.

### 11.3 Auradin

현재 Auradin은 mock UI다. 실제화하려면 다음 중 하나를 선택해야 한다.

1. `/products/recommendations`에 query prompt를 추가해 단순 검색형으로 연결
2. 별도 `/products/search` 또는 `/auradin/session` API를 만들어 대화형 narrowing 구현
3. prompt -> slots 추출 -> candidate fetch -> question -> rerank 흐름 구성

필요한 최소 상태:

- query
- constraints: category, color, finish, tone, priceRange, vendor, avoidTerms
- candidate set
- asked questions
- selected option
- final products

### 11.4 추천 필터와 제품 추천 연결

현재 추천 필터와 제품 추천은 직접 연결되지 않는다. 연결하려면:

- `RecommendedMakeupFilter.presetValues` 또는 palette를 product recommendation input으로 변환
- 저장한 AR 룩의 `makeupPresetValues.sourceFilterId`로 원본 filter 조회
- filter keywords/categoryTags/colorOptions를 product search profile로 변환
- `ProductRecommendation` route에 filter id 또는 saved look id를 넘기는 contract 추가

## 12. 변경 시 위험 지점

1. `ProductRecommendationScreen`은 height/width 기반으로 card height를 계산한다. 텍스트 추가 시 compact height에서 overflow 가능성이 크다.
2. backend product가 많아져도 프론트는 page size 4로 자른다. 성능보다 레이아웃 안정성을 우선한 구조다.
3. `isPurchasableBackendProduct` 때문에 backend products가 조용히 사라질 수 있다.
4. `getLikedProducts`는 backend 실패 시 빈 배열을 반환한다. 좋아요 UI가 갑자기 비어 보일 수 있다.
5. Naver item filtering은 꽤 보수적이다. recall보다 precision을 우선한다.
6. semantic scoring은 Bedrock 호출 실패 시 조용히 rule score로 복귀한다.
7. `look_index`는 backend profile에 mutation으로 `selectedRecommendedMakeupIndex`를 추가한다. profile object 재사용 범위를 넓히면 부작용을 조심해야 한다.
8. `NavigationFlowState`는 메모리 상태다. 앱 재시작 persistence가 아니다.
9. 추천 필터 좋아요와 실제 상품 좋아요는 완전히 별도 시스템이다.
10. `docs/spec.md`의 추천 필터 acceptance criteria와 실제 제품 추천 screen은 다른 기능이다.

## 13. 새 에이전트용 빠른 작업 루트

### 제품 추천 품질을 고칠 때

1. `apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx`
2. `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`
3. `services/backend/app/api/products.py`
4. `services/backend/app/services/shopping_products.py`
5. `services/backend/tests/test_settings_and_services.py`
6. `services/backend/tests/test_route_contract.py`

### 추천 필터/AR 룩 추천을 고칠 때

1. `docs/spec.md`
2. `docs/plan.md`
3. `apps/mobile/src/shared/types/makeupGuide.ts`
4. `apps/mobile/src/shared/mocks/makeupGuide.mock.ts`
5. `apps/mobile/src/shared/services/makeupGuideService.ts`
6. `apps/mobile/src/features/home/screens/HomeScreen.tsx`
7. `apps/mobile/src/features/home/screens/FilterStoreScreen.tsx`
8. `apps/mobile/src/features/ar/hooks/useARFilterSelectionState.ts`
9. `apps/mobile/src/features/ar/screens/ARFilterScreen.tsx`

### Auradin을 실제화할 때

1. `apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx`
2. `apps/mobile/src/features/recommendation/services/auradinService.ts`
3. `apps/mobile/src/features/recommendation/types.ts`
4. 기존 `productRecommendationService.ts`와 통합할지 별도 backend API를 만들지 결정
5. `services/backend/app/api/products.py` 또는 새 router
6. `services/backend/app/services/shopping_products.py`의 query/profile/scoring 재사용

## 14. 권장 다음 구현 순서

1. 현재 원하는 고도화 대상이 `제품 추천`, `추천 필터`, `Auradin 검색` 중 무엇인지 고정한다.
2. 제품 추천이라면 API failure fallback 정책부터 정한다.
3. backend 추천 품질을 건드리기 전에 `profile -> target terms` 변환을 테스트로 고정한다.
4. Naver 결과 품질을 높일 때는 reject rule을 완화하기보다 test fixture를 추가해 precision을 지킨다.
5. semantic scoring weight를 바꾸면 반드시 `test_semantic_product_scores_rerank_by_report_embedding`류 테스트를 업데이트한다.
6. 모바일 UI를 바꾸면 402x874, height < 700, width < 380 케이스를 본다.
7. 모바일 코드 변경 후 `cd apps/mobile && npm run typecheck`.
8. backend 코드 변경 후 `cd services/backend && pytest` 또는 관련 test 파일만 우선 실행.

## 15. 현재 상태를 한 문장으로 요약

현재 MVP는 "추천 필터는 mock vector 기반 AR 룩 선택 경험", "제품 추천은 얼굴 분석 report를 Naver/DB 상품과 rule+optional Bedrock semantic scoring으로 매칭하는 구매 추천 경험", "Auradin은 아직 mock-only 대화형 검색 프로토타입"으로 구성되어 있다.
