# AURADIN 제품 추가 데이터 확보·크롤링 실행 계획서

작성일: 2026-07-02 KST  
대상 프로젝트: `AURA-cosmetic-search-engine` / Auradin 제품 추천 고도화  
용도: 실제 크롤링·데이터 보강 작업을 수행할 개발 에이전트에게 전달하는 실행 스펙

---

## 2026-07-03 최신 수정: 제한 상세 수집 스코프

기존 `brand_category_top10` 결과는 상세 catalog 완성본이 아니라 **브랜드 x 카테고리별 Naver 후보 Top10 목록**이다. 따라서 다음 수집은 넓은 상세페이지 크롤링이 아니라, 아우라딘 검색 품질에 직접 필요한 아래 7개 필드군만 보강한다.

```txt
1. 색상/호수/옵션
2. colorFamily / undertone / intensity
3. finish / texture
4. suitableFor / sellingPoints
5. 가격 / 구매 URL / 이미지
6. 올리브영·백화점 입점 여부
7. 브랜드/제조국 정보
```

이번 스코프에서 제외한다.

```txt
- 리뷰 원문, 리뷰 요약, 리뷰 점수
- 전성분, 성분 위험도, 의학적 효능
- colorHex/colorLab 정밀 추출
- 상세 이미지 원본 저장 또는 이미지 다운로드
- productLine, containerType, coverage, claims 등 보조 필드
- 로그인/캡차/차단 우회/장바구니/주문/마이페이지 접근
```

근거와 상태 정보(`sourceUrl`, `rawText`, `confidence`, `collectionStatus`, `failureReason`, `fetchedAt`, `parserVersion`)는 수집 목표가 아니라 위 7개 필드군을 검증하기 위한 부속 metadata로만 남긴다.

이 섹션은 아래 과거 섹션의 넓은 필드 정의보다 우선한다. 문서 후반에 남아 있는 `colorHex/colorLab`, 리뷰, 전성분, `coverage`, `containerType`, `claims`, `productLine` 관련 내용은 역사적 검토 메모로만 보고, 이번 실행 대상에 포함하지 않는다.

---

## 0. 한 줄 결론

**네이버 쇼핑 API는 후보 상품·가격·이미지·구매 링크를 가져오는 용도로 쓰고, 색상/호수/옵션, 톤, 마감, 제형, 적합 대상, 소구점, 입점/제조국처럼 검색 판단에 필요한 7개 필드군만 `ProductCatalogItem` 형태로 별도 보강한다.**

대량 상세페이지 크롤링부터 시작하지 않는다.

```txt
Naver Shopping API
  → 후보 상품 / live offer / 가격 / 이미지 / 구매 링크

인기 top 후보 선별
  → 브랜드 whitelist + 카테고리 + 네이버 순위 + 올리브영 랭킹/어워즈 + 수동 판단

상세정보 보강
  → 공식몰 / 올리브영 / 네이버 상품 상세의 상품정보 테이블 / 수동 검수

ProductCatalogItem 승격
  → 추천 엔진이 신뢰할 수 있는 색상·질감·톤·호수 metadata로 사용
```

---

## 1. 현재 문제 정의

현재 프로젝트의 제품 추천은 `Naver Shopping API + DB fallback + rule score + optional semantic score` 구조다.

하지만 네이버 쇼핑 검색 API가 기본으로 주는 정보는 검색 결과 수준이다.

```json
{
  "title": "상품명",
  "link": "구매 링크",
  "image": "상품 이미지 URL",
  "productId": "네이버 상품 ID",
  "lprice": "최저가",
  "brand": "브랜드",
  "maker": "제조사/제조원",
  "mallName": "판매처/스토어명",
  "category1": "대분류",
  "category2": "중분류",
  "category3": "소분류",
  "category4": "세분류"
}
```

부족한 정보:

```txt
- 정확한 호수명 / 옵션명
- 색상군: pink, rose, coral, mauve, brown 등
- undertone: warm, cool, neutral
- finish: matte, glossy, satin, velvet, shimmer 등
- texture: tint, balm, powder, cream, cushion, pencil 등
- intensity: sheer, medium, bold
- 주요 특징: long-lasting, moisturizing, blur, coverage 등
- suitableFor: 쿨톤, 웜톤, 데일리, 민감성 등
- 올리브영·백화점 입점 여부
- 브랜드/제조국 정보
```

현재 소스의 `_extract_product_specs`는 대부분 `title`, `category`, `brand`, `maker` 텍스트에서 키워드를 찾아 `colors`, `effects`, `tones`, `features` 등을 추론한다. 이 방식은 빠르지만, 상품명에 세부 단서가 없으면 추천 품질이 불안정하다.

---

## 2. 목표

### 2.1 MVP 목표

```txt
- 17개 타깃 브랜드 중심의 제품 후보 확보
- Naver API 기반 live offer 확보
- 인기순/카테고리순으로 후보 우선순위화
- 추천에 필요한 속성 보강 queue 생성
- 최소 100~300개 catalog row 생성
- 추천 엔진이 DB payload를 우선 사용하도록 연결 가능한 데이터 구조 제공
```

### 2.2 이번 작업에서 하지 않는 것

```txt
- 모든 브랜드·모든 상품 대량 크롤링
- 네이버 상세페이지 무제한 반복 접근
- 리뷰 원문 대량 저장
- 로그인 필요한 페이지 접근
- 장바구니/마이페이지/주문 관련 URL 접근
- 모델 얼굴 이미지 분석
- 원본 상세 이미지 전체 저장
- 색상/호수 정확도 100% 보장
```

---

## 3. 핵심 원칙

### 3.1 Catalog-first

추천 판단의 기준은 네이버 API title이 아니라 `ProductCatalogItem`이다.

```txt
ProductCatalogItem
  = 제품/호수 단위의 정규화 원본 데이터

ProductKnowledgeDocument
  = 검색/RAG를 잘 되게 하기 위해 catalog에서 파생한 문서

LiveOffer
  = 현재 구매 가능성, 가격, 판매처, 링크 확인 정보
```

### 3.2 Naver API는 live offer와 후보 발견용

네이버 API로 판단할 것:

```txt
- 현재 구매 링크가 있는가
- 가격이 얼마인가
- 이미지 URL이 있는가
- 판매처가 어디인가
- Naver productId가 무엇인가
- 카테고리가 화장품 계열인가
```

네이버 API만으로 판단하지 말 것:

```txt
- 이 호수가 쿨톤인지
- 실제 발색이 로즈인지 모브인지
- 글로시인지 벨벳인지
- 민감성 피부에 맞는지
- 공식 컬러칩 색상
- 리뷰 기반 사용감
```

### 3.3 크롤링은 허용된 범위에서만

크롤러는 반드시 다음을 지켜야 한다.

```txt
- robots.txt 확인
- 각 사이트 약관 확인
- rate limit 적용
- 명시적 User-Agent 사용
- 로그인/인증/장바구니/마이페이지 접근 금지
- 우회·캡차 회피·차단 회피 금지
- 허용 여부가 불확실하면 자동 수집하지 않고 manual review로 넘김
- 수집 필드별 sourceUrl, fetchedAt, parserVersion, confidence 기록
```

---

## 4. 대상 브랜드 범위

이번 작업의 브랜드 whitelist는 아래 17개다.

```txt
데이지크
롬앤
페리페라
웨이크메이크
클리오
투쿨포스쿨
컬러그램
하트퍼센트
에뛰드
3CE
뮤드
정샘물 뷰티
에스쁘아
VDL
더샘
네이밍
라카
```

### 4.1 브랜드 alias

크롤러는 한글/영문/표기 변형을 모두 감지해야 한다.

```json
{
  "데이지크": ["데이지크", "dasique"],
  "롬앤": ["롬앤", "romand", "rom&nd", "rom nd"],
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

## 5. 카테고리 우선순위와 수집량

### 5.1 우선순위

| 우선순위 | 카테고리 | 이유 | 1차 목표 row |
|---:|---|---|---:|
| P0 | lip | 색상/질감/톤 추천이 가장 잘 드러남 | 120~180 |
| P1 | shadow | AR/룩 추천과 시각적 연결 좋음 | 60~100 |
| P1 | base | 얼굴 분석 보고서의 피부타입/톤과 연결 좋음 | 50~90 |
| P2 | cheek | 분위기 추천에 좋지만 후순위 | 50~80 |
| P3 | liner/brow | 상품 추천 임팩트는 낮지만 보강 가능 | 30~50 |

### 5.2 단계별 수집량

#### 밤샘/데모 MVP

```txt
- HTML 크롤링 없음 또는 최소화
- Naver API 후보 300~1000개 이하
- 브랜드 whitelist 필터
- productId dedup
- 결과 카드용 image/price/link 보유 후보만 사용
```

#### 1차 catalog

```txt
- 100~300개 catalog row
- 가능하면 제품 단위가 아니라 호수/옵션 단위 row
- 립 중심으로 먼저 확보
```

#### 2차 catalog

```txt
- 제품 100~150개
- 호수/옵션 500~800개
- 공식몰/올리브영/네이버 상세정보 기반 enrichment
```

---

## 6. 데이터 출처 우선순위

### Source A. Naver Shopping API

용도:

```txt
- 후보 상품 발견
- 현재 가격 확인
- 구매 링크 확인
- 이미지 URL 확인
- Naver productId 확보
- 판매처/mallName 확보
- 중고/렌탈/해외구매/노이즈 제거
```

API query 예시:

```txt
롬앤 립틴트
롬앤 글로스
페리페라 립틴트
컬러그램 틴트
데이지크 섀도우 팔레트
웨이크메이크 아이섀도우
클리오 쿠션
정샘물 쿠션
더샘 컨실러
VDL 파운데이션
라카 립
네이밍 쿠션
```

권장 파라미터:

```txt
GET https://openapi.naver.com/v1/search/shop.json
headers:
  X-Naver-Client-Id: <secret>
  X-Naver-Client-Secret: <secret>
params:
  query=<brand/category query>
  display=100
  start=1
  sort=sim
  filter=naverpay
  exclude=used:rental:cbshop
```

주의:

```txt
- 네이버 검색 API 응답 title에는 <b> 태그가 포함될 수 있으므로 제거한다.
- API 결과는 후보 생성과 live offer 확인용이다.
- 색상/질감/피부타입의 정답 원천으로 쓰지 않는다.
```

### Source B. Olive Young 랭킹/어워즈/상품 상세

용도:

```txt
- 인기순 seed 선정
- 카테고리별 대표 제품 확인
- 리뷰 수/평점/랭킹 보조
- 상품 상세의 옵션/특징 보강
```

수집 원칙:

```txt
- robots.txt와 약관 확인 후 허용되는 URL만 접근
- 장바구니, 마이페이지, 주문, 기프트카드 등 사용자 영역 접근 금지
- crawl-delay 준수
- 자동 수집이 불확실하면 수동 검수 queue로 넘김
```

### Source C. 브랜드 공식몰

용도:

```txt
- 공식 제품명
- 공식 호수명 / 옵션명
- 컬러칩 / swatch
- 공식 설명
- 제형/마감/색상 설명
- 제품 라인업 확인
```

공식몰은 추천 catalog의 품질을 가장 높일 수 있는 출처다. 다만 각 브랜드 사이트별 구조가 다르므로, 공통 크롤러보다 `source adapter` 방식으로 접근한다.

### Source D. Naver Shopping 상세 페이지

용도:

```txt
- 판매자 입력 상품정보 테이블 보강
- 피부타입
- 세부제품특징
- 연출효과
- 제품형태
- 용기형태
- 주요제품특징
- 제조사/원산지/출시일자 등
```

예시 mapping:

```json
{
  "피부타입": "모든피부용",
  "세부제품특징": "펄있음, 고밀착, 은은함, 화사함",
  "연출효과": "글리터, 쉬머, 쉬어",
  "용기형태": "뚜껑형",
  "제품형태": "압축/팩트형",
  "타입": "팔레트",
  "주요제품특징": "지속력, 고발색, 부드러운 발림"
}
```

이 정보는 판매자 입력값이므로 `confidence`를 중간 수준으로 둔다. 공식몰보다 낮고, 상품명 추론보다는 높게 취급한다.

---

## 7. 수집 필드 정의

### 7.1 Candidate 필드

Naver API 후보 단계에서 저장한다.

```ts
interface ProductCandidate {
  id: string;                 // naver-{productId}
  source: 'naver_api';
  naverProductId: string;
  rawTitle: string;
  title: string;
  link: string;
  imageUrl: string;
  lprice: number;
  brandRaw?: string;
  brandNormalized?: string;
  maker?: string;
  mallName?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  category4?: string;
  query: string;
  queryRank: number;
  collectedAt: string;
}
```

### 7.2 EnrichedProduct 필드

상세정보 보강 단계에서 저장한다.

```ts
interface EnrichedProduct {
  candidateId: string;
  brand: string;
  productName: string;
  category: 'lip' | 'cheek' | 'shadow' | 'liner' | 'base' | 'brow' | 'other';
  shadeName?: string;
  shadeSource: 'title_inferred' | 'option_extracted' | 'official_verified' | 'manual_reviewed' | 'unknown';

  colorFamily?: 'pink' | 'rose' | 'coral' | 'red' | 'orange' | 'mauve' | 'brown' | 'nude' | 'peach' | 'burgundy' | 'unknown';
  undertone?: 'warm' | 'cool' | 'neutral' | 'unknown';
  finish?: 'matte' | 'glossy' | 'satin' | 'sheer' | 'velvet' | 'shimmer' | 'unknown';
  texture?: 'tint' | 'balm' | 'lipstick' | 'gloss' | 'cream' | 'powder' | 'pencil' | 'liquid' | 'cushion' | 'unknown';
  intensity?: 'sheer' | 'medium' | 'bold' | 'unknown';

  skinTypeTags?: string[];
  features?: string[];
  effects?: string[];
  containerType?: string;
  productForm?: string;
  ingredientHighlights?: string[];
  cautionTags?: string[];

  sourceUrls: string[];
  evidence: FieldEvidence[];
  confidence: Record<string, number>;
  needsManualReview: boolean;
  fetchedAt: string;
  parserVersion: string;
}

interface FieldEvidence {
  field: string;
  value: unknown;
  sourceType: 'naver_api' | 'naver_detail' | 'oliveyoung' | 'brand_official' | 'manual';
  sourceUrl: string;
  rawLabel?: string;
  rawText?: string;
}
```

### 7.3 ProductCatalogItem 필드

검수 후 추천 엔진에 사용하는 최종 catalog row다.

```ts
interface ProductCatalogItem {
  productId: string;
  sourceProductId?: string;
  sourceType: 'manual' | 'naver_api' | 'brand_feed' | 'partner_feed' | 'allowed_static_collect';
  dataPermission: 'owned' | 'api_allowed' | 'partner_allowed' | 'manual_reviewed' | 'unknown_blocked';

  brand: string;
  productName: string;
  variantName?: string;
  shadeName?: string;
  category: 'lip' | 'cheek' | 'shadow' | 'liner' | 'base' | 'brow' | 'other';

  colorHex?: string;
  colorLab?: { l: number; a: number; b: number };
  colorFamily?: string;
  undertone?: string;
  finish?: string;
  texture?: string;
  intensity?: string;
  priceBand?: string;

  skinTypeTags?: string[];
  ingredientHighlights?: string[];
  cautionTags?: string[];
  officialDescription?: string;

  liveOffer?: {
    source: 'naver_shopping' | 'oliveyoung_partner' | 'brand_store' | 'other_allowed_api';
    link: string;
    image?: string;
    lprice?: number;
    mallName?: string;
    fetchedAt: string;
    ttlSeconds: number;
  };

  sourceUrls: string[];
  evidence: FieldEvidence[];
  confidence: Record<string, number>;
  updatedAt: string;
}
```

---

## 8. 인기순 선정 방식

정확한 판매량 데이터가 없으므로 proxy score를 사용한다.

```txt
popularityScore =
  0.45 * naverRankScore
+ 0.25 * oliveYoungRankOrAwardScore
+ 0.15 * reviewCountScore
+ 0.10 * brandPriorityScore
+ 0.05 * recencyScore
```

MVP에서는 단순화한다.

```txt
1. Naver API 검색 순위가 높다.
2. 여러 query에서 반복 등장한다.
3. 올리브영 어워즈/랭킹/베스트에 등장한다.
4. 브랜드 우선순위가 높다.
5. 가격/이미지/구매 링크가 안정적으로 있다.
```

### 브랜드 우선순위

MVP 데모 효율 기준이다. 시장 점유율 공식 순위가 아니다.

| 우선순위 | 브랜드 | 먼저 볼 카테고리 |
|---:|---|---|
| 1 | 롬앤 | lip |
| 2 | 페리페라 | lip |
| 3 | 컬러그램 | lip, shadow |
| 4 | 웨이크메이크 | shadow, lip, base |
| 5 | 데이지크 | shadow, cheek, lip |
| 6 | 클리오 | base, shadow, lip |
| 7 | 정샘물 뷰티 | base |
| 8 | 3CE | lip, cheek, shadow |
| 9 | 에뛰드 | lip, shadow |
| 10 | 더샘 | base |
| 11 | VDL | base |
| 12 | 라카 | lip, cheek |
| 13 | 네이밍 | base, lip, cheek |
| 14 | 투쿨포스쿨 | contour, shadow |
| 15 | 하트퍼센트 | liner, lip |
| 16 | 에스쁘아 | base, lip |
| 17 | 뮤드 | shadow, lip |

---

## 9. 크롤링 실행 단계

## Phase A. Naver API 후보 수집

### 목표

```txt
- 17개 브랜드 × 주요 카테고리 query 실행
- 후보 상품 raw JSONL 저장
- 브랜드 whitelist 적용
- productId 기준 dedup
- 화장품이 아닌 후보 제거
```

### 입력 파일

```txt
config/auradin/target_brands.yaml
config/auradin/category_queries.yaml
```

### 출력 파일

```txt
data/auradin/raw/naver_candidates_YYYYMMDD.jsonl
data/auradin/processed/product_candidates_YYYYMMDD.jsonl
reports/auradin/naver_collection_summary_YYYYMMDD.md
```

### 필터링 규칙

반드시 제거:

```txt
- title 없음
- link 없음
- image 없음
- productId 없음
- lprice 없음 또는 0
- category가 화장품/미용과 무관
- 신발/의류/가방/주얼리/생활용품/방석/소파 등 비화장품
- 중고/렌탈/해외구매/대용량/벌크/도매 중심 상품
- 브랜드 whitelist 밖 상품
```

---

## Phase B. 인기 top 후보 선정

### 목표

```txt
- 카테고리별 top 후보 선정
- 상세정보 보강 대상 queue 생성
```

### 추천 수량

```txt
lip: top 80~120
shadow: top 40~70
base: top 40~60
cheek: top 30~50
liner/brow: top 20~40
```

### 출력 파일

```txt
data/auradin/processed/enrichment_queue_YYYYMMDD.jsonl
reports/auradin/enrichment_queue_summary_YYYYMMDD.md
```

---

## Phase C. 상세정보 enrichment

### 목표

```txt
- 공식몰/올리브영/네이버 상세에서 부족한 속성 보강
- 추출값에 confidence/evidence/sourceUrl 부여
- 자동 확정 불가 값은 manual review로 넘김
```

### 수집 우선순위

```txt
1. 브랜드 공식몰 상품 상세
2. 올리브영 상품 상세/랭킹/어워즈
3. 네이버 쇼핑 상세 상품정보 테이블
4. 수동 검수
```

### 네이버 상세 상품정보 table mapping

| 원문 label | 저장 field | 예시 |
|---|---|---|
| 피부타입 | skinTypeTags | 모든피부용, 건성, 지성 |
| 세부제품특징 | features/effects | 펄있음, 고밀착, 은은함 |
| 연출효과 | finish/effects | 글리터, 쉬머, 쉬어 |
| 용기형태 | containerType | 뚜껑형 |
| 제품형태 | productForm/texture | 압축/팩트형 |
| 타입 | texture/containerType | 팔레트, 틴트, 쿠션 |
| 주요제품특징 | features | 지속력, 고발색, 부드러운 발림 |
| 원산지 | origin | 국산 |
| 출시일자 | launchedAt | 2026.06.01 |

### confidence 기본값

| 출처 | 기본 confidence |
|---|---:|
| 수동 검수 | 0.95 |
| 브랜드 공식몰 | 0.90 |
| 올리브영 상품 상세 | 0.80 |
| 네이버 상세 상품정보 테이블 | 0.65~0.75 |
| Naver API title 추론 | 0.40~0.60 |
| LLM 추론 단독 | 0.35~0.55 |

### 출력 파일

```txt
data/auradin/enriched/enriched_products_YYYYMMDD.jsonl
data/auradin/review/catalog_review_queue_YYYYMMDD.csv
reports/auradin/enrichment_summary_YYYYMMDD.md
```

---

## Phase D. Manual review와 catalog 승격

### 목표

```txt
- 추천에 직접 쓸 수 있는 catalog row 생성
- confidence 낮은 값 검수
- evidence 없는 값 제거 또는 unknown 처리
```

### catalog-ready 조건

필수:

```txt
- brand
- productName
- category
- sourceUrl
- dataPermission
- imageUrl 또는 liveOffer.image
- purchaseUrl 또는 liveOffer.link
```

카테고리별 최소 속성:

```txt
lip:
  colorFamily 또는 colorHex/colorLab
  finish
  texture
  intensity

shadow:
  colorFamily 또는 palette
  finish
  texture

base:
  shadeName 또는 tone 정보
  finish
  coverage 또는 featureTags
  skinTypeTags 권장

cheek:
  colorFamily
  finish 또는 texture

liner/brow:
  colorFamily
  texture
  intensity 또는 featureTags
```

### 출력 파일

```txt
data/auradin/catalog/catalog_items_seed_YYYYMMDD.jsonl
reports/auradin/catalog_ready_summary_YYYYMMDD.md
```

---

## 10. 속성 추출 규칙

### 10.1 색상군 colorFamily

```txt
pink: 핑크, pink, 피오니, 베이비핑크
rose: 로즈, rose, 말린장미, 로지
coral: 코랄, coral
red: 레드, red
orange: 오렌지, orange
mauve: 모브, mauve
brown: 브라운, brown, 초코, 카라멜
nude: 누드, nude, 베이지
peach: 피치, peach, 복숭아
burgundy: 버건디, burgundy, 와인
```

### 10.2 undertone

```txt
warm: 웜톤, 봄웜, 가을웜, warm, coral, orange, peach, brick
cool: 쿨톤, 여름쿨, 겨울쿨, cool, mauve, berry, plum
neutral: 뉴트럴, neutral, beige, mlbb
unknown: 근거 부족
```

### 10.3 finish

```txt
matte: 매트, 보송, 무광, matte
velvet: 벨벳, velvet, blur, 블러
satin: 새틴, satin, semi-matte, 세미매트
sheer: 쉬어, 투명, 맑은, sheer
shimmer: 쉬머, 펄, 글리터, shimmer, glitter
borderline glossy: 글로우, 광택, 물먹, glossy, gloss, dewy
```

### 10.4 texture

```txt
tint: 틴트, tint
balm: 밤, balm
lipstick: 립스틱, lipstick
cream: 크림, cream
powder: 파우더, powder, 팔레트, 압축/팩트형
pencil: 펜슬, pencil
liquid: 리퀴드, liquid
cushion: 쿠션, cushion
```

### 10.5 intensity

```txt
sheer: 쉬어, 투명, 맑은, 자연스러운, 데일리, 은은한
medium: 중간 발색, 선명, buildable
bold: 고발색, 진한, intense, vivid, 딥
unknown: 근거 부족
```

---

## 11. LLM 사용 위치

LLM은 보조 도구다. 추천할 제품이나 URL을 직접 만들면 안 된다.

### 허용

```txt
- 상세 설명 text에서 구조화 metadata 추출
- 상품정보 테이블 label normalization
- 추출값 confidence 설명
- review queue용 human-readable 요약 생성
```

### 금지

```txt
- catalog에 없는 제품 생성
- 존재하지 않는 호수명 생성
- 구매 링크 생성
- 가격 생성
- 출처 없는 피부/효능 단정
```

### 구조화 추출 프롬프트 예시

```txt
너는 화장품 상품 상세정보를 ProductCatalog metadata로 정규화하는 parser다.
입력 텍스트에 명시된 정보만 사용한다.
추측이 필요한 경우 confidence를 낮게 주고 evidence에 이유를 남긴다.
존재하지 않는 제품명, 호수명, 가격, URL은 만들지 않는다.

반환 JSON schema:
{
  "brand": string | null,
  "productName": string | null,
  "shadeName": string | null,
  "category": "lip" | "cheek" | "shadow" | "liner" | "base" | "brow" | "other" | null,
  "colorFamily": string | null,
  "undertone": string | null,
  "finish": string | null,
  "texture": string | null,
  "intensity": string | null,
  "skinTypeTags": string[],
  "features": string[],
  "effects": string[],
  "evidence": [{"field": string, "rawText": string}],
  "confidence": Record<string, number>,
  "needsManualReview": boolean
}
```

---

## 12. 추천 엔진에서 쓰는 방식

최종적으로 추천 엔진은 다음 우선순위로 product metadata를 사용한다.

```txt
1. ProductCatalogItem의 검수된 metadata
2. EnrichedProduct의 confidence 높은 metadata
3. DB product_payload에 들어 있는 metadata
4. Naver title/category 기반 term 추론
5. category fallback 값
```

현재 `shopping_products.py`의 `_extract_product_specs`는 DB payload가 있으면 그 값을 적극 사용한다. 따라서 크롤링 결과는 `product_payload` 또는 신규 catalog table에 다음처럼 넣어야 한다.

```json
{
  "colors": ["로즈", "모브"],
  "effects": ["글로우", "촉촉"],
  "skinTypes": ["건성"],
  "features": ["밀착", "지속력"],
  "tones": ["쿨톤"],
  "finish": "glossy",
  "texture": "tint",
  "intensity": "sheer",
  "confidence": {
    "colors": 0.82,
    "finish": 0.88,
    "undertone": 0.70
  },
  "evidence": [
    {
      "field": "finish",
      "sourceType": "brand_official",
      "rawText": "맑은 광택의 글로스 제형"
    }
  ]
}
```

추천 시 live offer는 별도로 갱신한다.

```txt
ProductCatalogItem로 후보 선정
  → Naver API로 productName + shadeName 검색
  → image/link/lprice/mallName 갱신
  → 추천 카드에 표시
```

---

## 13. 파일/모듈 제안

실제 작업 디렉토리에서 아래 구조를 권장한다. 기존 구조와 충돌하면 에이전트가 프로젝트 관례에 맞춰 조정한다.

```txt
services/backend/app/services/auradin_catalog/
  brand_aliases.py
  category_queries.py
  naver_collect.py
  candidate_normalizer.py
  popularity_ranker.py
  enrichment_queue.py
  parsers/
    naver_detail_parser.py
    oliveyoung_parser.py
    brand_official_parser.py
  metadata_extractor.py
  catalog_exporter.py
  robots_guard.py
  rate_limit.py

data/auradin/
  raw/
  processed/
  enriched/
  review/
  catalog/

reports/auradin/
```

테스트:

```txt
services/backend/tests/test_auradin_brand_aliases.py
services/backend/tests/test_auradin_candidate_normalizer.py
services/backend/tests/test_auradin_metadata_extractor.py
services/backend/tests/test_auradin_popularity_ranker.py
```

---

## 14. 크롤러 안전 설정

권장 기본값:

```yaml
crawler:
  user_agent: "AURA-AuradinCatalogBot/0.1 contact=<team-email>"
  max_concurrency_per_domain: 1
  request_delay_seconds: 5
  timeout_seconds: 20
  retry:
    max_attempts: 2
    backoff_seconds: 5
  respect_robots_txt: true
  disallow_login_required_pages: true
  disallow_cart_mypage_order_pages: true
  store_raw_html: false
  store_raw_review_text: false
```

HTML 저장 정책:

```txt
- raw HTML 전체를 장기 저장하지 않는다.
- parser debug가 필요하면 로컬 임시 파일로만 저장하고 git commit 금지.
- 최종 DB에는 구조화 필드, sourceUrl, evidence rawText 일부만 저장한다.
```

---

## 15. 실패 처리

### 15.1 수집 실패

```txt
- HTTP 403/429/503: 즉시 중단, retry 최소화, 해당 domain cooldown
- robots disallow: skip + report 기록
- JS 렌더링 실패: Playwright fallback 1회만 시도
- 이미지 URL 깨짐: 후보는 유지하되 catalog ready에서는 제외
```

### 15.2 정보 추출 실패

```txt
- shadeName 불확실: 빈 문자열 또는 unknown
- colorFamily 불확실: unknown
- finish 불확실: unknown
- confidence < 0.65: manual review queue
- evidence 없음: 추천 핵심 필드로 사용 금지
```

### 15.3 추천 연동 실패 방지

```txt
- purchaseUrl 없는 product는 추천 카드에서 제외될 수 있음
- imageUrl 없는 product는 추천 카드에서 제외될 수 있음
- catalog는 풍부해도 live offer가 없으면 "구매 가능성 확인 실패"로 처리
```

---

## 16. 수용 기준

### Phase A 완료 기준

```txt
- Naver API smoke 성공
- 17개 브랜드 alias 적용
- productId dedup 동작
- 후보 JSONL 생성
- 비화장품 노이즈 제거 fixture 통과
- 수집 summary report 생성
```

### Phase B 완료 기준

```txt
- 카테고리별 top 후보 선정
- enrichment_queue 생성
- popularityScore 산출 근거 기록
```

### Phase C 완료 기준

```txt
- 최소 30개 제품 상세정보 enrichment 성공
- 각 enriched field에 evidence/confidence 기록
- confidence 낮은 row는 review CSV로 이동
- robots/약관 위반 의심 URL 접근 없음
```

### Phase D 완료 기준

```txt
- 최소 100개 catalog row 생성
- lip row가 전체의 40% 이상
- catalog-ready row는 필수 필드 충족
- 추천 엔진 payload로 변환 가능한 JSONL 생성
```

---

## 17. 에이전트 작업 순서

1. 프로젝트에서 기존 제품 추천 관련 파일을 먼저 읽는다.

```txt
services/backend/app/services/shopping_products.py
services/backend/app/api/products.py
apps/mobile/src/features/recommendation/services/productRecommendationService.ts
```

2. 현재 Naver API adapter가 있으면 재사용한다. 새로 만들지 않는다.

3. `target_brands.yaml`, `category_queries.yaml`부터 만든다.

4. Naver API smoke script를 만든다.

5. 후보 수집 → dedup → whitelist → noise filter를 먼저 완성한다.

6. HTML 상세 크롤링은 Phase A/B가 끝난 뒤에만 시작한다.

7. 크롤링 전 source별 robots/약관 체크 결과를 report에 남긴다.

8. 상세정보 parser는 source별로 작게 만든다.

9. 추출값은 바로 catalog로 넣지 말고 `enriched_products`와 `review_queue`를 거친다.

10. 최종 catalog JSONL을 생성하고, 추천 엔진에서 어떻게 읽을지 integration note를 남긴다.

---

## 18. 참고 링크

- Naver Search API - Shopping: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md
- Naver API 서비스 이용약관: https://developers.naver.com/products/terms/
- Olive Young robots.txt: https://www.oliveyoung.co.kr/robots.txt
- Google robots.txt guide: https://developers.google.com/search/docs/crawling-indexing/robots/intro

---

## 19. 검토 결과와 보강 사항

### 19.1 현재 코드와 맞는 점

이 계획의 핵심 전제는 현재 구현과 맞다.

```txt
- 현재 backend는 Naver Shopping API 결과를 요청 시점에 가져와 메모리에서 product로 변환한다.
- `_map_naver_item`은 title/category/brand/maker/mallName 기반으로 얕은 metadata를 추론한다.
- `shadeName`은 Naver API에서 안정적으로 오지 않으므로 현재 빈 문자열이다.
- mobile adapter는 imageUrl과 purchaseUrl이 없는 backend product를 화면 후보에서 제외한다.
- 좋아요를 누른 외부 상품만 `products.product_payload`에 upsert된다. 후보 전체 catalog 저장은 아직 없다.
```

따라서 이번 계획은 기존 추천 경로를 즉시 대체하는 작업이 아니라, 아래 새 층을 추가하는 작업으로 정의해야 한다.

```txt
현재 runtime:
  Naver API -> _map_naver_item -> score -> mobile card

추가할 catalog pipeline:
  Naver API candidate snapshot
  -> dedup / whitelist / noise filter
  -> enrichment queue
  -> evidence + confidence
  -> manual review
  -> ProductCatalogItem
  -> current product_payload 또는 신규 catalog table로 export
```

### 19.2 보강해야 할 계약 불일치

현재 plan에는 좋은 필드가 많지만, 구현 전에 아래 불일치를 정리해야 한다.

| 항목 | 현재 plan | 현재 repo/추천 경로 | 보강 결정 |
|---|---|---|---|
| category | `lip`, `cheek`, `shadow`, `liner`, `base`, `brow`, `other` | backend/mobile은 `lip`, `cheek`, `shadow`, `liner`, `base` 중심 | `brow`, `contour`는 Day2 확장. Day1 export에서는 `liner` 또는 `other`로 매핑하고 contract 변경 시 별도 PR |
| base 속성 | catalog-ready 조건에 `coverage` 언급 | schema에는 `coverage` 없음 | `coverage?: 'sheer' | 'medium' | 'high' | 'unknown'` 추가 |
| shadow palette | `colorFamily 또는 palette` 언급 | schema에는 단일 `colorHex/colorLab` 중심 | `paletteHex?: string[]`, `paletteLab?: LabColor[]` 추가 |
| Naver productId | candidate id처럼 사용 | product/listing 식별자이며 shade identity가 아님 | `offerSourceProductId`로 보관하고 catalog id는 별도 stable key 생성 |
| dataPermission | enum은 있음 | gating rule 없음 | `unknown_blocked`는 export/recommendation 금지 |
| live offer | final row 내부에 포함 | 가격/링크는 stale 가능 | TTL 만료 시 추천 카드 노출 전 refresh 필수 |

권장 stable key:

```txt
catalogItemId =
  sha1(
    brandNormalized + "|" +
    productNameNormalized + "|" +
    category + "|" +
    variantNameNormalized + "|" +
    shadeNameNormalized
  )
```

Naver `productId`는 `LiveOffer.sourceProductId`로 남긴다. catalog의 정답 key로 쓰지 않는다.

### 19.3 추가 schema 필드

`EnrichedProduct`와 `ProductCatalogItem`에 아래 필드를 추가한다.

```ts
type LabColor = { l: number; a: number; b: number };

interface SourcePolicySnapshot {
  sourceType: 'naver_api' | 'naver_detail' | 'oliveyoung' | 'brand_official' | 'manual';
  sourceDomain?: string;
  robotsUrl?: string;
  robotsCheckedAt?: string;
  termsUrl?: string;
  termsCheckedAt?: string;
  accessDecision:
    | 'allowed_api'
    | 'allowed_public_research'
    | 'preflight_required'
    | 'blocked_by_explicit_restriction';
  reason: string;
}

interface CatalogQualityFlags {
  hasRequiredFields: boolean;
  hasEvidenceForCoreFields: boolean;
  hasFreshLiveOffer: boolean;
  hasAllowedDataPermission: boolean;
  duplicateGroupId?: string;
  blockedReasons: string[];
}
```

`ProductCatalogItem` 보강:

```ts
interface ProductCatalogItem {
  catalogItemId: string;
  canonicalProductKey: string;
  variantKey?: string;
  offerSourceProductId?: string;
  priceCurrency?: 'KRW';
  paletteHex?: string[];
  paletteLab?: LabColor[];
  coverage?: 'sheer' | 'medium' | 'high' | 'unknown';
  sourcePolicy?: SourcePolicySnapshot[];
  qualityFlags?: CatalogQualityFlags;
  normalizationVersion: string;
}
```

### 19.4 학생 팀 내부 학습용 source policy registry

이 프로젝트는 학생 팀의 내부 학습·검증용이고, 외부 상용 서비스나 공개 배포용 데이터셋을 만드는 목적이 아니다. 따라서 source policy는 "사이트를 최대한 막는 장치"가 아니라, **괜찮은 공개 사이트를 안전하게 수집하기 위한 실행 체크리스트**로 둔다.

기본 원칙:

```txt
- 공개 접근 가능한 상품 상세/랭킹/브랜드 공식 페이지는 기본적으로 수집 후보에 포함한다.
- 정책 검토 때문에 정상적인 공개 사이트 전체를 사전에 막지 않는다.
- robots/약관 확인은 "금지 근거를 찾기 위한 차단 절차"가 아니라 "수집 방식과 속도를 정하기 위한 preflight"로 사용한다.
- 학생 팀 내부 학습용 산출물은 raw HTML/리뷰 원문/이미지 원본을 장기 보관하지 않고 구조화 metadata와 짧은 evidence만 남긴다.
- 외부 배포, 상용 서비스 반영, 데이터셋 공개, 대량 재배포 단계로 넘어가면 별도 permission review를 다시 한다.
```

크롤링 코드는 source별 상태를 코드 안에서 즉흥 판단하지 않는다. 먼저 아래 registry를 만들고, adapter는 registry가 `allowed_api` 또는 `allowed_public_research`일 때 동작한다.

```yaml
sources:
  naver_api:
    type: api
    docsUrl: "https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md"
    termsUrl: "https://developers.naver.com/products/terms/"
    checkedAt: "2026-07-02T00:00:00+09:00"
    accessDecision: allowed_api
    allowedUses:
      - candidate_discovery
      - live_offer_refresh
    blockedUses:
      - treating_api_result_as_canonical_shade_metadata
      - storing_result_without_data_permission_review

  oliveyoung_public:
    type: website
    robotsUrl: "https://www.oliveyoung.co.kr/robots.txt"
    checkedAt: "2026-07-02T00:00:00+09:00"
    accessDecision: allowed_public_research
    reason: "student internal research mode; public pages may be collected with low rate, no login, no bypass, no raw review/html long-term retention."

  brand_official:
    type: website
    accessDecision: preflight_required
    reason: "run per-brand robots/terms check, then promote normal public product pages to allowed_public_research unless there is an explicit restriction."
```

실행 규칙:

```txt
- `preflight_required`는 자동 차단이 아니라 adapter 활성화 전 확인 대기 상태다
- 명시적 금지 근거가 없고 공개 접근 가능한 일반 상품/랭킹 페이지면 `allowed_public_research`로 승격한다
- robots.txt가 비어 있으면 허용/금지 신호가 없는 것으로 보고, 낮은 rate와 짧은 retention 정책으로 진행한다
- 약관/robots 확인 결과는 report에 source별로 남긴다
- 403/429가 발생하면 해당 domain은 즉시 cooldown 처리한다
- 로그인, 인증, paywall, 장바구니, 마이페이지, 주문, 캡차, 차단 우회가 필요한 URL은 접근하지 않는다
```

### 19.5 Data quality gate

data-analytics 관점에서 catalog는 단순 수집 결과가 아니라 추천 모델의 기준 데이터다. Phase D 전에 아래 품질 검사를 자동화한다.

| 검사 | 기준 | 실패 시 처리 |
|---|---|---|
| grain | 1 row = 제품/호수/옵션 단위 | mixed grain row는 review queue |
| required fields | brand, productName, category, sourceUrl, dataPermission | catalog export 차단 |
| core evidence | lip의 color/finish/texture/intensity 등 핵심 필드에 evidence 존재 | 핵심 추천 필드로 사용 금지 |
| enum validity | category/colorFamily/finish/texture/intensity/coverage 허용값 | unknown 또는 review |
| duplicate | normalized key 중복률과 Naver productId 중복 검사 | duplicateGroupId 부여 후 merge/review |
| URL validity | imageUrl/purchaseUrl 형식과 live offer TTL | 추천 카드 노출 전 refresh |
| permission | `dataPermission !== unknown_blocked` | export 차단 |
| confidence | 핵심 필드 confidence >= 0.65 | review queue |
| freshness | liveOffer fetchedAt + ttlSeconds 유효 | live offer refresh |
| raw retention | raw HTML/review 원문 장기 저장 없음 | 저장 차단 |

summary report에는 최소 아래 수치를 포함한다.

```txt
- raw candidate count
- unique productId count
- whitelist pass rate
- non-cosmetic reject count/rate
- enrichment queue count by category
- source coverage by field
- manual review queue count
- catalog-ready count
- blocked-by-permission count
- stale live offer count
- duplicate group count
```

### 19.6 popularityScore 보강

현재 score 식은 방향은 좋지만, `reviewCountScore`와 `oliveYoungRankOrAwardScore`가 source별로 비어 있을 수 있다. missing을 0점으로 두면 특정 source에 없는 상품이 과도하게 불리해진다.

권장 방식:

```txt
1. source별 raw signal을 먼저 저장한다.
2. 없는 signal은 0이 아니라 `missing`으로 둔다.
3. 사용 가능한 signal의 weight만 재정규화한다.
4. report에는 어떤 signal 조합으로 점수가 계산됐는지 남긴다.
```

예시:

```json
{
  "popularitySignals": {
    "naverRank": {"value": 3, "score": 0.98, "source": "naver_api"},
    "oliveYoungAward": {"value": null, "score": null, "source": "missing"},
    "reviewCount": {"value": null, "score": null, "source": "missing"},
    "brandPriority": {"value": 1, "score": 1.0, "source": "manual_config"}
  },
  "popularityScore": 0.99,
  "popularityScoreVersion": "auradin-popularity-v1"
}
```

### 19.7 작업환경/MCP 세팅

크롤링을 시작하기 전에 도구부터 확인한다. 무작정 설치하지 않고, **이미 설치되어 있으면 재사용**한다.

2026-07-02 현재 로컬 확인 메모:

```txt
`codex mcp list` 기준:
- already enabled: playwright, node_repl, computer-use, github, notion, openaiDeveloperDocs
- not listed: fetch, postgres
- Data Analytics는 MCP list가 아니라 Codex plugin/skill로 사용
```

최종 사용 도구:

| 도구 | 용도 | 설치/확인 기준 |
|---|---|---|
| Playwright MCP / Browser | JS 렌더링 상품 상세, 옵션 DOM, 무한스크롤 확인 | 이미 있으면 재사용. 없으면 설치 |
| Fetch MCP | 정적 HTML, robots, 약관, 공식몰 단순 페이지 빠른 text 추출 | 없으면 설치 |
| Data Analytics plugin | JSONL/CSV 품질검사, dedup, confidence/source coverage report | plugin/skill 사용 가능 여부 확인 |
| OpenAI Structured Extraction | 상세 설명 text를 catalog metadata로 구조화 | API key/환경변수 확인 |
| PostgreSQL MCP | catalog DB 적재 후 schema/row/query 검증 | DB migration 이후에만 설치/연결 |

#### 19.7.1 설치 여부 확인

```bash
codex mcp list
codex mcp list | rg -i 'playwright|fetch|postgres'
```

확인 결과를 `reports/auradin/tooling_preflight_YYYYMMDD.md`에 남긴다.

```txt
- tool name
- installed/enabled 여부
- install command 실행 여부
- smoke 결과
- 실패 시 fallback
```

#### 19.7.2 Playwright MCP

용도:

```txt
- JS 렌더링이 필요한 올리브영/공식몰/네이버 상세 페이지 확인
- 옵션/호수 dropdown, swatch, lazy-loaded detail 영역 확인
- selector 안정성 검증
```

설치 확인:

```bash
codex mcp list | rg -i playwright
```

없을 때만 설치:

```bash
codex mcp add playwright npx "@playwright/mcp@latest"
```

smoke:

```txt
- 공개 상품 상세 URL 1개 열기
- title, price, option/shade 영역이 DOM에서 보이는지 확인
- screenshot 또는 extracted text 일부를 report에 기록
```

#### 19.7.3 Fetch MCP

용도:

```txt
- robots.txt, 약관, 정적 공식몰 상세 페이지를 빠르게 markdown/text로 읽기
- Playwright보다 빠른 preflight와 정적 상세 추출
- JS가 필요 없는 source는 Fetch 우선
```

설치 확인:

```bash
codex mcp list | rg -i fetch
```

없을 때만 설치:

```bash
codex mcp add fetch uvx mcp-server-fetch
```

`uvx`가 없으면 pip 방식으로 대체한다.

```bash
python -m pip install mcp-server-fetch
codex mcp add fetch python -m mcp_server_fetch
```

smoke:

```txt
- https://www.oliveyoung.co.kr/robots.txt fetch
- 브랜드 공식몰 상품 상세 1개 fetch
- HTML이 markdown/text로 추출되는지 확인
```

#### 19.7.4 Data Analytics plugin

용도:

```txt
- raw candidate / normalized candidate / enriched product JSONL 프로파일링
- 중복률, null rate, enum validity, confidence 분포, source coverage 집계
- catalog-ready row와 review queue 분리 검증
```

설치 명령은 별도로 두지 않는다. Codex plugin/skill로 사용 가능 여부만 확인한다.

확인:

```txt
- Data Analytics plugin이 현재 세션에 노출되어 있는지 확인
- `analyze-data-quality`, `validate-data`, `build-report` 스킬 사용 가능 여부 확인
```

smoke:

```txt
- fixture JSONL 20~50개로 quality profile 생성
- duplicate/null/enum/source coverage summary가 나오는지 확인
```

#### 19.7.5 OpenAI Structured Extraction

용도:

```txt
- 상품 상세 설명/상품정보 table을 schema-constrained JSON으로 정규화
- rule parser로 애매한 finish/texture/intensity/evidence를 보조 추출
```

확인:

```bash
[ -n "${OPENAI_API_KEY:-}" ] && echo "OPENAI_API_KEY configured" || echo "OPENAI_API_KEY missing"
```

없으면 Codex의 OpenAI Platform key setup flow를 사용한다. raw key를 문서나 로그에 남기지 않는다.

smoke:

```txt
- 상품 상세 text fixture 3개 입력
- JSON schema validation 통과
- 존재하지 않는 shade/link/price hallucination 0건 확인
```

#### 19.7.6 PostgreSQL MCP

이 도구는 Day1 JSONL 수집 단계에서는 설치하지 않는다. `product_catalog_items` 또는 products DB import를 실제로 시작할 때만 연결한다.

설치 확인:

```bash
codex mcp list | rg -i postgres
```

DB 단계에서 없을 때만 설치:

```bash
codex mcp add postgres npx "@modelcontextprotocol/server-postgres" "<postgresql-url>"
```

운영 원칙:

```txt
- 가능하면 read-only 계정 사용
- dev/local DB부터 연결
- production DB 직접 연결 금지
- schema inspection, sample row 확인, quality query QA에만 사용
```

#### 19.7.7 도구 선택 우선순위

```txt
정적 URL / robots / 약관:
  Fetch MCP 우선

JS 렌더링 / 옵션 DOM / 무한스크롤:
  Playwright MCP 또는 Browser 우선

수집 결과 품질검사:
  Data Analytics 우선

상세 text -> 구조화 metadata:
  OpenAI Structured Extraction 우선

DB 적재 후 검증:
  PostgreSQL MCP 우선
```

### 19.8 단계 보강

기존 Phase A~D 앞에 Phase 0을 둔다.

```txt
Phase 0. Preflight / no crawl
  - 작업환경/MCP 설치 여부 확인
  - 필요한 도구는 없을 때만 설치하고 smoke 기록
  - 현재 `shopping_products.py`, products API, mobile adapter 확인
  - source_policy_registry.yaml 작성
  - brand/category config 작성
  - fixture raw Naver item 20~50개 작성
  - parser/normalizer unit test 작성
  - dry-run report 포맷 확정

Phase A. Naver API candidate snapshot
  - 기존 Naver adapter 재사용 우선
  - raw JSONL + normalized JSONL 생성
  - HTML fetch 없음

Phase B. Ranking / enrichment queue
  - top 후보 선정
  - missing signal 재정규화
  - manual review 우선순위 산출

Phase C. Enrichment
  - registry에서 allowed_api/allowed_public_research로 확인된 source만 접근
  - source adapter별 small fixture 먼저 작성
  - Playwright fallback은 source당 1회, 실패 시 manual review

Phase D. Catalog promotion
  - quality gate 통과 row만 export
  - 현재 추천 경로용 product_payload export를 먼저 만든다
  - 신규 DB table은 별도 migration 계획과 함께 진행한다
```

### 19.8.1 최소 작업 차수

실행 단위는 최소 3차로 나눈다. 한 세션에서 너무 많이 묶으면 실패 원인과 수집 품질을 분리하기 어렵기 때문이다.

```txt
1차. Naver API 후보 수집 완주
  - `.env`의 Naver Shopping API key 확인
  - 소량 API smoke 먼저 실행
  - 17개 브랜드와 우선 카테고리 후보 수집
  - productId dedup
  - brand whitelist 적용
  - 비화장품/noise 제거
  - popularityScore 산출
  - enrichment_queue 생성
  - JSONL/CSV/report 산출
  - Data Analytics 품질 검증
  - HTML/detail crawling 없음

2차. 상세 enrichment 소량 검증
  - Fetch/Playwright callable smoke
  - domain별 robots/terms 확인
  - 공식몰/올리브영/Naver 상세 중 허용 가능한 source만 선정
  - source adapter별 5~10개 parser smoke
  - evidence/confidence/sourceUrl/fetchedAt 구조 검증
  - raw HTML/raw review/original image 장기 저장 금지 유지

3차. catalog seed 승격
  - enrichment 결과 정규화
  - confidence 낮은 row review CSV 생성
  - catalog-ready row 선별
  - catalog_items_seed_YYYYMMDD.jsonl 생성
  - product_payload_export_YYYYMMDD.jsonl 생성
  - 추천 엔진이 catalog metadata를 우선 사용하는지 fixture 검증
```

2차와 3차는 합칠 수 있지만 기본 계획에서는 분리한다. 상세 parser가 흔들릴 때 catalog 승격까지 같이 흔들리지 않게 하기 위해서다.

### 19.9 추천 연동 순서

첫 연동은 DB migration보다 JSONL export가 안전하다.

```txt
1. catalog_items_seed_YYYYMMDD.jsonl 생성
2. product_payload_export_YYYYMMDD.jsonl 생성
3. `_extract_product_specs`가 읽을 수 있는 keys로 변환
4. fixture로 `_map_db_product -> _extract_product_specs -> _score_product_match` 검증
5. 이후 필요하면 `product_catalog_items` table migration 진행
```

현재 backend가 바로 읽기 쉬운 payload 형태:

```json
{
  "externalKey": "auradin-catalog-<catalogItemId>",
  "brandName": "롬앤",
  "productName": "글래스팅 워터 틴트",
  "shadeName": "03 브릭 리버",
  "category": "lip",
  "priceKrw": 12900,
  "tags": ["로즈", "글로시", "틴트", "쿨톤"],
  "palette": ["#B55F67"],
  "productPayload": {
    "colors": ["로즈"],
    "effects": ["글로시", "촉촉"],
    "skinTypes": [],
    "features": ["맑은 발색"],
    "tones": ["쿨톤"],
    "finish": "glossy",
    "texture": "tint",
    "intensity": "medium",
    "purchaseUrl": "https://...",
    "imageUrl": "https://...",
    "evidence": [],
    "confidence": {}
  }
}
```

### 19.10 운영 리스크와 차단 조건

아래 조건에서는 자동 수집을 중단한다.

```txt
- source policy가 `blocked_by_explicit_restriction`인 domain 접근 필요
- 403/429/캡차/로그인 유도 발생
- raw review 원문 대량 저장이 필요해지는 요구
- product image/swatch 원본을 장기 저장해야 하는 요구
- sourceUrl/evidence 없이 LLM 추론값만 catalog core field로 넣으려는 경우
- category contract 변경이 mobile/backend/DB migration 없이 필요한 경우
```

### 19.11 공식 근거 확인 메모

2026-07-02 기준 공식 문서 확인 결과:

```txt
- Naver Shopping Search API는 JSON/XML endpoint를 제공하고, display 최대 100, start 최대 1000, sort=sim/date/asc/dsc, filter=naverpay, exclude=used/rental/cbshop을 지원한다.
- Naver 응답 item은 title/link/image/lprice/hprice/mallName/productId/productType/maker/brand/category1~4 수준이다.
- Naver Search API 하루 호출 한도는 25,000회로 문서화되어 있다.
- Naver API 약관은 API 결과 데이터에 대한 권리 취득이 아니라 제한된 사용권이라는 전제를 둔다.
- Olive Young robots.txt는 확인 시점에 실질 directive가 비어 있었지만, 이것만으로 대량 수집 허가로 해석하지 않는다.
```

따라서 이 계획은 “Naver API 후보 발견 + 제한된 상세 보강 + 수동 검수 + 품질 게이트” 구조를 유지하는 것이 맞다.

## 20. 최종 판단

이번 크롤링 작업의 목적은 “인터넷에서 화장품 정보를 최대한 많이 긁기”가 아니다.

목적은 아래다.

```txt
1. 실제 구매 가능한 후보는 Naver API로 안정적으로 확보한다.
2. 추천 판단에 부족한 속성은 인기 top 상품만 보강한다.
3. 보강값에는 confidence와 evidence를 붙인다.
4. 사람이 검수한 row만 catalog로 승격한다.
5. 추천 엔진은 catalog를 기준으로 판단하고, Naver API는 live offer 확인에 사용한다.
```

이 방식이 가장 안전하고, 데모 품질과 추천 품질을 동시에 올릴 수 있다.

---

## 21. 본 작업 실행 계획: 64개 상세 수집 일괄 실행

### 21.1 현재 기준 변경

이 섹션은 Phase A/B/C 파일럿과 안전 스테이징이 끝난 뒤의 **본 작업 기준**이다. 기존 문서의 "소량 검증" 단계는 더 이상 반복하지 않는다.

현재 본 작업은 `data/auradin/review/catalog_review_queue_20260702_all.csv`에서 `phaseCStatus=manual_review_required`인 64개 row를 대상으로 한다.

실행 기준:

```txt
- 64개 URL을 전부 실제 접근 시도한다.
- 사전에 "될 것/안 될 것"을 추정해서 제외하지 않는다.
- 공개 페이지에 정상 접근되면 필요한 필드를 최대한 채운다.
- 없는 정보는 만들지 않고 null 또는 빈 배열로 둔다.
- 실패한 URL은 실패 사유를 표준 status로 기록한다.
- robots 명시 disallow, 로그인, 캡차, 차단 우회, 장바구니, 주문, 마이페이지 접근은 하지 않는다.
- raw HTML, raw review 원문, 원본 상품 이미지는 장기 저장하지 않는다.
```

이번 본 작업의 목표는 "완벽한 필드 채움"이 아니라, **추천과 임베딩에 쓸 수 있는 구조화 catalog metadata를 최대한 빠르게 확보**하는 것이다.

### 21.2 수집 대상 row

입력:

```txt
data/auradin/review/catalog_review_queue_20260702_all.csv
```

대상:

```txt
phaseCStatus == "manual_review_required"
```

제외:

```txt
phaseCStatus == "blocked"
blockedReason == "robots_disallowed"
```

현재 수량 기준:

```txt
- manual_review_required: 64
- blocked / robots_disallowed: 56
```

blocked 56개는 이번 본 작업의 자동 수집 대상이 아니다. 다만 별도 보고서에는 "명시적 제한으로 미시도" 상태로 남긴다.

### 21.3 수집 필드 최종 계약

최신 기준은 제품 상세를 넓게 채우는 것이 아니라 **아래 7개 필드군만 채우는 것**이다. 모든 필드는 "근거가 있으면 채우고, 없으면 `null` 또는 빈 배열로 둔다"가 기본 원칙이다. 근거 없는 추정은 `confidence < 0.65`로 표시하고, 추천 hard filter에는 쓰지 않는다.

#### 1. 색상/호수/옵션

```ts
interface LimitedShadeOption {
  optionName: string | null;
  shadeName: string | null;
  shadeNumber: string | null;
  rawOptionText: string | null;
}
```

한 제품에 옵션/호수가 여러 개 있으면 가능한 범위에서 모두 저장한다. 옵션명이 보이는데 색상군/언더톤을 확정할 수 없으면 옵션명만 저장하고 정규화 필드는 비운다.

#### 2. colorFamily / undertone / intensity

```ts
interface LimitedColorProfile {
  colorFamily: 'pink' | 'rose' | 'coral' | 'red' | 'orange' | 'mauve' | 'brown' | 'nude' | 'peach' | 'burgundy' | 'plum' | 'beige' | 'unknown' | null;
  undertone: 'warm' | 'cool' | 'neutral' | 'unknown' | null;
  intensity: 'sheer' | 'medium' | 'bold' | 'unknown' | null;
}
```

`colorHex`와 `colorLab`는 이번 범위에서 수집하지 않는다. 이미지에서 임의 추출하지 않고, 텍스트 근거가 있을 때만 정규화한다.

#### 3. finish / texture

```ts
interface LimitedFinishTexture {
  finish: 'matte' | 'glossy' | 'satin' | 'velvet' | 'shimmer' | 'sheer' | 'dewy' | 'unknown' | null;
  texture: 'tint' | 'balm' | 'lipstick' | 'gloss' | 'cream' | 'powder' | 'pencil' | 'liquid' | 'cushion' | 'unknown' | null;
}
```

#### 4. suitableFor / sellingPoints

```ts
interface LimitedSuitabilityClaims {
  suitableFor: string[];
  sellingPoints: string[];
}
```

`suitableFor` 예시:

```txt
쿨톤, 웜톤, 봄웜, 여름쿨, 가을웜, 겨울쿨, 데일리 메이크업, 자연스러운 발색 선호, 민감성
```

`sellingPoints` 예시:

```txt
지속력, 보습, 밀착, 광택, 블러, 커버, 워터프루프, 번짐 방지, 가벼움, 고발색, 저자극, 비건
```

의학적 효능, 치료 효과, 전성분 기반 안전성 평가는 이번 범위가 아니다.

#### 5. 가격 / 구매 URL / 이미지

```ts
interface LimitedLiveOffer {
  price: number | null;
  imageUrl: string | null;
  purchaseUrl: string | null;
  mallName: string | null;
  fetchedAt: string;
  ttlSeconds: number;
}
```

가격/구매 URL/이미지는 Naver Shopping API 또는 허용된 공개 metadata를 우선한다. 이미지 원본 파일은 다운로드하지 않고 URL만 저장한다.

#### 6. 올리브영·백화점 입점 여부

```ts
interface LimitedRetailPresence {
  oliveYoungStatus: 'listed' | 'not_found' | 'unknown';
  oliveYoungEvidenceUrl: string | null;
  departmentStoreStatus: 'listed' | 'not_found' | 'unknown';
  departmentStoreRetailers: string[];
  departmentStoreEvidenceUrl: string | null;
}
```

단순 쇼핑몰 입점과 백화점 입점을 섞지 않는다. 롯데백화점, 신세계백화점, 현대백화점, 백화점몰 등 명시 근거가 있을 때만 `listed`로 둔다.

#### 7. 브랜드/제조국 정보

```ts
interface LimitedBrandOrigin {
  brandCountry: string | null;
  manufacturerCountry: string | null;
  madeInCountry: string | null;
}
```

브랜드 국적과 제조국은 분리한다. `brandOwnerCompany`, `manufacturerName`은 이번 필수 수집 대상이 아니다.

#### 통합 결과

```ts
interface CollectionEvidence {
  field: string;
  value: unknown;
  sourceUrl: string;
  sourceType: 'json_ld' | 'meta' | 'option_dom' | 'visible_text' | 'structured_extraction' | 'manual_note' | 'naver_api';
  rawText: string;
  confidence: number;
}

interface LimitedDetailCollectionResult {
  candidateId: string;
  brand: string | null;
  productName: string | null;
  category: 'lip' | 'cheek' | 'shadow' | 'liner' | 'base' | 'brow' | 'other' | null;
  shadeOptions: LimitedShadeOption[];
  colorProfile: LimitedColorProfile;
  finishTexture: LimitedFinishTexture;
  suitabilityClaims: LimitedSuitabilityClaims;
  liveOffer: LimitedLiveOffer;
  retailPresence: LimitedRetailPresence;
  brandOrigin: LimitedBrandOrigin;
  evidence: CollectionEvidence[];
  confidence: Record<string, number>;
  collectionStatus: 'collected_complete' | 'collected_partial' | 'blocked_explicit' | 'failed' | 'no_useful_data';
  failureReason: string | null;
  fetchedAt: string;
  parserVersion: string;
}
```

### 21.4 도구 사용 순서

#### 1단계. Fetch / HTTP 수집

64개 URL 전체에 대해 먼저 빠른 정적 수집을 수행한다.

수집 대상:

```txt
- 최종 redirect URL
- HTTP 상태 / content length
- title/meta description
- JSON-LD
- OpenGraph product/image/price metadata
- visible text 일부
- 상품명, 브랜드, 가격, 이미지 URL, 옵션 텍스트 후보
```

출력:

```txt
data/auradin/detail/raw_extracted/detail_fetch_results_YYYYMMDD.jsonl
```

HTML 전체는 저장하지 않는다. 필요한 snippet과 구조화 후보만 저장한다.

#### 2단계. Playwright 렌더링 수집

Fetch 결과가 비어 있거나 옵션/상세 영역이 부족한 row만 Playwright로 재시도한다.

수집 대상:

```txt
- JS 렌더링 후 상품명/가격/이미지
- 옵션 dropdown, swatch, shade button 텍스트
- 상세정보 테이블
- 제품 특징/소구점 영역
- 추천 대상/톤/피부타입 문구
```

실패 기준:

```txt
- timeout
- login required
- captcha/security challenge
- product removed
- selector not found
- rendered but no useful product data
```

출력:

```txt
data/auradin/detail/raw_extracted/detail_playwright_results_YYYYMMDD.jsonl
```

#### 3단계. Chrome Codex 플러그인 조사

Chrome은 대량 수집 본체로 쓰지 않는다. Playwright에서 반복 실패한 도메인/패턴을 해부하는 조사 도구로 사용한다.

사용 위치:

```txt
- 셀렉터 구조 확인
- 옵션 DOM이 shadow DOM/iframe/lazy render인지 확인
- 공개 API endpoint가 네트워크에서 보이는지 확인
- Playwright extractor가 왜 비어 있는지 진단
```

Chrome에서 찾은 셀렉터나 endpoint는 다시 Playwright/Python 수집 코드로 옮겨 재현 가능하게 실행한다. Chrome에서만 성공한 수집값은 catalog 정식 산출물로 바로 승격하지 않는다.

#### 4단계. OpenAI Structured Extraction

OpenAI Structured Extraction은 페이지 접근 도구가 아니라 **짧은 추출 텍스트를 catalog schema로 정규화하는 도구**로 사용한다.

입력:

```txt
- 상품명/브랜드/카테고리
- option/shade 텍스트
- JSON-LD product snippet
- 상세정보 테이블 텍스트
- 제품 설명/소구점/추천 대상 문구
- evidence sourceUrl
```

출력:

```txt
data/auradin/detail/structured/structured_extraction_YYYYMMDD.jsonl
```

규칙:

```txt
- 입력에 없는 제품명/호수/가격/URL을 만들지 않는다.
- 없는 값은 null 또는 []로 둔다.
- 추론값은 rawText evidence와 confidence를 함께 남긴다.
- schema validation 실패 row는 structured_extraction_failed로 표시한다.
- OpenAI API key가 없으면 먼저 안전한 key setup flow를 진행하고, key를 파일/로그에 남기지 않는다.
```

#### 5단계. Data Analytics 품질 검증

Data Analytics는 수집 후 QA와 report 생성에 사용한다.

검증 항목:

```txt
- 64개 전체 시도 여부
- Fetch 성공률 / Playwright 성공률
- collectionStatus 분포
- domain별 성공/실패 사유
- field별 fill rate
- category별 편중
- shadeOptions 개수 분포
- evidence 없는 핵심 필드 수
- confidence 분포
- raw HTML/review/image 원본 저장 여부
- catalog-ready row 수
- embedding-ready chunk 수
```

출력:

```txt
reports/auradin/detail_collection_summary_YYYYMMDD.md
reports/auradin/detail_collection_quality_YYYYMMDD.csv
reports/auradin/detail_collection_failures_YYYYMMDD.csv
```

### 21.5 본 작업 파이프라인

이번 실행은 파일럿 없이 아래 순서로 한 번에 간다.

```txt
1. 64개 target queue 생성
2. Fetch/HTTP pass 전체 실행
3. Fetch 부족 row만 Playwright pass 실행
4. 반복 실패 domain은 Chrome으로 구조 조사
5. 조사 결과를 extractor에 반영하고 실패 row 재시도
6. OpenAI Structured Extraction으로 schema 정규화
7. ProductCatalogItem candidate로 변환
8. ProductKnowledgeDocument embedding chunk 생성
9. Data Analytics로 품질 검증
10. 성공/부분성공/실패 report 확정
```

중간에 일부 row가 실패해도 전체 batch를 멈추지 않는다. 단, 같은 도메인에서 403/429/캡차가 반복되면 해당 도메인만 cooldown 처리하고 나머지 도메인은 계속 진행한다.

### 21.6 산출물

```txt
data/auradin/detail/targets/detail_collection_targets_YYYYMMDD.csv
data/auradin/detail/raw_extracted/detail_fetch_results_YYYYMMDD.jsonl
data/auradin/detail/raw_extracted/detail_playwright_results_YYYYMMDD.jsonl
data/auradin/detail/structured/structured_extraction_YYYYMMDD.jsonl
data/auradin/detail/normalized/detail_collection_results_YYYYMMDD.jsonl
data/auradin/catalog/catalog_items_candidates_YYYYMMDD.jsonl
data/auradin/embeddings/product_knowledge_documents_YYYYMMDD.jsonl
reports/auradin/detail_collection_summary_YYYYMMDD.md
reports/auradin/detail_collection_quality_YYYYMMDD.csv
reports/auradin/detail_collection_failures_YYYYMMDD.csv
```

### 21.7 전처리와 정규화

수집 결과는 바로 임베딩하지 않는다.

```txt
DetailCollectionResult
  -> ProductCatalogItem candidate
  -> ProductKnowledgeDocument
  -> embedding input
```

정규화 규칙:

```txt
- brand는 brand alias table로 normalize한다.
- category는 기존 Auradin category enum에 맞춘다.
- shadeName과 shadeNumber는 optionName에서 분리하되, 원문 rawOptionText를 보존한다.
- colorFamily/undertone/finish/texture/intensity는 enum 또는 null로 둔다.
- suitableFor와 sellingPoints는 raw text와 normalized tag를 모두 저장한다.
- retailPresence와 brandOrigin은 evidence 없으면 unknown/null로 둔다.
- confidence < 0.65인 핵심 필드는 추천 필터 조건으로 직접 쓰지 않는다.
```

### 21.8 임베딩 문서와 청킹

임베딩은 raw crawling text가 아니라 `ProductKnowledgeDocument`를 대상으로 한다.

청킹 grain:

```txt
catalogItemId + shadeKey + docType
```

문서 타입:

```txt
catalog_core:
  브랜드, 제품명, 카테고리, 가격, 구매 URL, 이미지 URL

shade_profile:
  호수명, 옵션명, 원문 옵션 텍스트, 색상군, 언더톤, 발색 강도

finish_texture:
  제형, 마감, 사용감

suitability_claims:
  누구에게 어울리는지, 톤 추천, 소구점

retail_origin:
  올리브영/백화점 입점 여부, 브랜드 국적, 제조국, 구매 가능 출처
```

기본 문서 형태:

```ts
interface ProductKnowledgeDocument {
  chunkId: string;
  catalogItemId: string;
  candidateId: string;
  docType: 'catalog_core' | 'shade_profile' | 'finish_texture' | 'suitability_claims' | 'retail_origin';
  text: string;
  metadata: {
    brand: string | null;
    productName: string | null;
    category: string | null;
    shadeName: string | null;
    colorFamily: string | null;
    undertone: string | null;
    finish: string | null;
    texture: string | null;
    intensity: string | null;
    suitableFor: string[];
    sellingPoints: string[];
    oliveYoungStatus: string;
    departmentStoreStatus: string;
    brandCountry: string | null;
    confidence: number;
    sourceUrls: string[];
  };
}
```

길이 기준:

```txt
- docType별 text는 가능하면 300~900자 안에 유지한다.
- 1,200자를 넘는 경우 문장 단위로 600~900자 chunk로 나누고 80자 이하만 overlap한다.
- 짧은 문서는 억지로 합치지 않는다. 검색 목적이 다르면 별도 chunk로 유지한다.
```

검색 시 사용:

```txt
1차: metadata filter
  category, colorFamily, undertone, finish, texture, intensity, retailPresence

2차: vector similarity
  "여름쿨톤에게 어울리는 맑은 로즈 글로스"
  "건성 피부에 뜨지 않는 윤광 베이스"
  "올리브영에서 살 수 있는 데일리 코랄 틴트"
```

### 21.9 성공/실패 판정

row별 판정:

```txt
collected_complete:
  product core + 하나 이상의 option/shade 또는 핵심 속성 + evidence 확보

collected_partial:
  product core는 있으나 option/shade 또는 추천 핵심 속성이 일부 부족

no_useful_data:
  페이지 접근은 됐지만 추천에 쓸 필드가 없음

failed_fetch:
  Fetch/HTTP 단계 실패

failed_playwright:
  JS 렌더링 단계까지 실패

login_or_captcha_required:
  로그인/캡차/보안 확인 때문에 중단

blocked_explicit:
  명시적 제한 또는 금지 신호로 중단

parser_empty:
  접근은 됐지만 extractor 결과가 비어 있음
```

전체 완료 기준:

```txt
- 64개 target row 모두 시도 기록이 있다.
- 각 row가 성공/부분성공/실패 중 하나로 닫혀 있다.
- 실패 row에는 failureReason이 있다.
- 성공/부분성공 row에는 sourceUrl과 evidence가 있다.
- ProductKnowledgeDocument JSONL이 생성된다.
- Data Analytics 품질 report가 생성된다.
```
