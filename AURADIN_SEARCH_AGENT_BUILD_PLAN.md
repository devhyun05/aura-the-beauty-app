> ⚠️ **ARCHIVED (2026-07-06)** — 이 문서는 20260703 데이터 기준으로 작성되어 일부(특히 커버리지·질문 정책 표)가 낡았다.
> 현재 단일 진실 소스는 **[AURADIN.md](AURADIN.md)** 다. 이 문서는 역사적 설계 참고용으로만 본다.

# Auradin 대화형 검색 에이전트 — 밤샘 MVP 실행 스펙 v3

> 목적: 내일 시연에서 **정보이득 기반 멀티턴 아키네이터 검색 경험**을 반드시 보여준다.
> 단, 데이터 정밀도와 LLM 의존성은 MVP가 깨지지 않도록 현실 범위로 재정의한다.

## 2026-07-03 총체 설계 기준

아우라딘을 단순 제품추천 화면이 아니라 **아키네이터형 검색 에이전트**로 구현하기 위한 최신 총체 설계는 아래 문서를 우선한다.

```txt
AURADIN_AKINATOR_AGENT_SYSTEM_DESIGN_KO.md
```

이 문서의 원래 원칙은 유지한다.

```txt
- 정보이득 기반 질문 루프는 MVP 킥이므로 제거하지 않는다.
- 서버가 ask/no-ask, attribute, filterDelta, hard/soft 질문 여부를 결정한다.
- LLM/Bedrock은 후보 선택권이 아니라 intent/copy/embedding 보조 역할만 맡는다.
- 최신 20260703 데이터 기준으로 undertone/intensity/suitableFor는 hard 질문보다 soft preference로 취급한다.
- 제품추천 UI 통합은 ProductRecommendation route를 유지하되 Auradin shell을 메인 화면으로 세우는 방향이다.
```

---

## 2026-07-03 MVP 전처리/Bedrock 실행 계획

최신 실행 계획은 아래 문서를 우선한다.

```txt
AURADIN_MVP_PREPROCESSING_BEDROCK_AGENT_PLAN_KO.md
```

현재 결정:

```txt
- catalog_items_seed_20260703.jsonl 501개 row를 MVP input으로 사용한다.
- lip / cheek / shadow 중심으로 먼저 검색 에이전트를 만든다.
- raw title residual keyword로 결측 필드를 soft 보강한다.
- confidence가 낮은 title 추론값은 질문/hard filter에 쓰지 않는다.
- Bedrock은 먼저 embedding/query/copy 보조로 연결한다.
- Bedrock managed Agent / Knowledge Base는 deterministic backend agent가 선 뒤 phase 2로 검토한다.
```

---

## 2026-07-03 최신 수정: 검색 에이전트 선행 데이터 조건

현재 Top10 산출물은 상세 catalog가 아니라 상품 후보 목록에 가깝다. 따라서 아우라딘 검색 에이전트는 아래 7개 필드군을 먼저 보강한 뒤 연결한다.

```txt
1. 색상/호수/옵션
2. colorFamily / undertone / intensity
3. finish / texture
4. suitableFor / sellingPoints
5. 가격 / 구매 URL / 이미지
6. 올리브영·백화점 입점 여부
7. 브랜드/제조국 정보
```

검색 엔진 구현 규칙:

```txt
- 색상/톤/마감/제형 질문은 해당 필드의 coverage와 confidence가 cutoff를 넘을 때만 묻는다.
- coverage가 낮은 필드는 질문 후보에서 제외하고, 결과 카피에서도 확정적으로 말하지 않는다.
- 가격/구매 URL/이미지는 final card 필수 조건으로 유지한다.
- 올리브영·백화점 입점 여부는 channel hard filter 또는 premium/channel facet으로만 사용한다.
- 브랜드/제조국은 신뢰 근거가 있을 때만 metadata filter/카피에 사용한다.
- LLM은 7개 필드군 밖의 제품 속성을 만들어내면 안 된다.
```

---

## 0. 확정 결정

| 항목 | 결정 |
|---|---|
| MVP 킥 | **정보이득 기반 멀티턴 아키네이터 루프는 필수**. 후보군을 가장 잘 가르는 질문을 서버가 계산해 묻는다. |
| MVP 약속 | "정확한 호수 매칭"이 아니라 **구매 가능한 화장품 상품 단위 추천 + 7개 필드군 기반 후보 좁히기 대화**. |
| 데이터 출처 | Naver 쇼핑 검색 API 후보 + 제한 상세 보강 catalog. 무제한 HTML 크롤링은 제외. |
| 사용 가능한 Naver 필드 | `productId`, `title`, `link`, `image`, `lprice`, `brand`, `maker`, `mallName`. |
| 불안정/추론 필드 | `shadeName`, 호수, 색상 옵션, colorFamily, undertone, finish, texture, intensity, suitableFor, sellingPoints. 신뢰도와 함께 추론값으로만 사용. |
| 에이전트 루프 | **서버 결정론 루프**. Claude가 후보 생성/질문 여부/필터 값을 좌우하지 않는다. |
| Claude 역할 | 선택 사항. intent 보조/질문 카피/결과 카피만 생성. 실패해도 기본 추천과 질문 루프는 계속 동작. |
| 임베딩 | Bedrock Titan embedding 클라이언트/코사인 계산은 재사용. 자유 프롬프트용 query embedding 경로는 신규 구현. |
| 질문 수 | MVP 최대 3회. 보통 1~2회에서 결과로 종료. |
| 세션 상태 | in-memory dict. 데모 서버는 worker 1개 고정. TTL 필수. |
| 이미지 | Naver `image` URL 직접 사용. RN adapter에서 `{uri: imageUrl}`로 변환. |

## 1. MVP에서 지키는 것과 미루는 것

### 1.1 반드시 지키는 것

- 자유 프롬프트 입력.
- Naver API 기반 실제 구매 가능한 상품 후보 생성.
- 룰 필터 + Titan query/item embedding 유사도 보정.
- 정보이득 기반 질문 선택.
- 사용자의 답변을 후보 필터/랭킹에 반영.
- 최대 3턴 안에 hero + alternatives 반환.
- 이미지, 가격, 구매 링크가 있는 결과 카드.

### 1.2 밤샘 MVP에서 약속하지 않는 것

- 호수/옵션 단위 정확 매칭.
- 300~500개 완성 catalog + 공식몰 shade catalog.
- HTML 크롤 기반 swatch/호수 정밀 확보.
- Claude tool-use 멀티스텝 에이전트.
- Claude 응답 없이는 결과가 안 나오는 구조.

표현상 주의: UI와 카피에서 "정확한 호수", "공식 색상 옵션"처럼 보이면 안 된다. `shadeName`이 추론값이거나 비어 있으면 제품명/상품 단위 추천으로 보여준다.

## 2. 동결 계약

### 2.1 카탈로그/후보 스키마

```ts
export type Category = 'lip' | 'cheek' | 'shadow' | 'liner' | 'base' | 'brow';
export type ColorFamily =
  | 'pink'
  | 'rose'
  | 'coral'
  | 'red'
  | 'orange'
  | 'mauve'
  | 'brown'
  | 'nude'
  | 'peach'
  | 'burgundy'
  | 'unknown';
export type Finish = 'matte' | 'glossy' | 'satin' | 'sheer' | 'velvet' | 'shimmer' | 'unknown';
export type Intensity = 'sheer' | 'medium' | 'bold' | 'unknown';
export type PriceTier = 'under_15k' | '15k_25k' | '25k_40k' | 'over_40k';
export type Channel = 'oliveyoung' | 'brand_official' | 'naver' | 'other';

export type AttributeConfidence = Partial<
  Record<'category' | 'colorFamily' | 'finish' | 'intensity' | 'shadeName' | 'channel', number>
>;

export interface CatalogItem {
  id: string;                 // "naver-{productId}" 또는 stable hash
  naverProductId: string;
  source: 'naver';
  productPrecision: 'product'; // MVP는 상품 단위. variant/shade 단위 아님.

  brandName: string;
  productName: string;
  shadeName: string;          // 없거나 추론이면 "" 허용
  shadeSource: 'title_inferred' | 'llm_inferred' | 'html_verified' | 'unknown';
  category: Category;

  priceKrw: number;
  priceTier: PriceTier;
  sellerName: string;         // Naver mallName
  channel: Channel;

  colorFamily: ColorFamily;
  finish: Finish;
  intensity: Intensity;
  tags: string[];
  paletteHex: string[];       // 추론/룰 기반. 없으면 []
  attributeConfidence: AttributeConfidence;

  imageUrl: string;
  purchaseUrl: string;
  popularity: number;         // 0~1. Naver relevance/rank 기반 폴백.
  embedding?: number[];       // item embedding cache
}
```

### 2.2 필터/질문 계약

`option.value: string` 하나로는 `둘 다 좋아요`, `2만원 이하`, `glossy 또는 satin`을 표현할 수 없으므로 질문 옵션은 `filterDelta`를 직접 가진다.

```ts
export type FilterAttribute =
  | 'category'
  | 'priceKrw'
  | 'priceTier'
  | 'colorFamily'
  | 'undertone'
  | 'finish'
  | 'texture'
  | 'intensity'
  | 'channel';

export interface FilterDelta {
  attribute: FilterAttribute;
  op: 'eq' | 'in' | 'lte' | 'gte' | 'noop';
  values?: string[];
  numberValue?: number;
  locked?: boolean; // 프롬프트에 명시된 조건은 완화 금지
  source: 'prompt' | 'question';
}

export interface AskedQuestion {
  id: string;
  title: string;
  attribute: FilterAttribute;
  options: {
    id: string;
    label: string;
    swatch?: string;
    filterDelta: FilterDelta;
  }[];
}
```

### 2.3 API 계약

```
POST /api/search/sessions
  req: { prompt: string, reportId?: string }
  res: { sessionId: string, phase: 'searching' }

GET /api/search/sessions/{sessionId}
  res: SearchTurn

POST /api/search/sessions/{sessionId}/answer
  req: { questionId: string, optionId: string }
  res: { sessionId: string, phase: 'searching' }
```

```ts
export interface SearchTurn {
  sessionId: string;
  phase: 'searching' | 'question' | 'results' | 'failed' | 'expired';
  thinking: { id: string; label: string; status: 'done' | 'active' | 'pending' }[];
  question?: AskedQuestion;
  result?: {
    headerLabel: string;
    hero: Candidate;
    alternatives: Candidate[];
  };
  error?: { code: string; message: string };
  retryAfterMs?: number;
}

export interface Candidate {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  category: Category;
  priceKrw: number;
  priceText: string;
  channel: Channel;
  matchSummary: string;
  palette: string[];
  tags: string[];
  imageUrl: string;
  purchaseUrl: string;
}
```

공통 응답 봉투 `{ data, meta, error }`는 기존 백엔드 규약을 따른다. 모바일은 `imageUrl`을 `{uri: imageUrl}`로 변환한다.

### 2.4 세션 상태

```ts
export interface SearchSessionState {
  sessionId: string;
  prompt: string;
  phase: 'searching' | 'question' | 'results' | 'failed' | 'expired';
  createdAt: number;
  expiresAt: number; // MVP: 15분

  queryText: string;
  lockedFilters: FilterDelta[];
  softFilters: FilterDelta[];
  answers: { questionId: string; optionId: string; filterDelta: FilterDelta }[];
  askedAttributes: FilterAttribute[];
  questionCount: number;

  candidateIds: string[];
  lastQuestion?: AskedQuestion;
  result?: SearchTurn['result'];
  error?: SearchTurn['error'];
}
```

## 3. 서버 결정론 검색 루프

### 3.1 흐름

1. `POST /sessions` 수신.
2. 서버가 즉시 `{phase:'searching'}` 반환하고 background task 시작.
3. `parse_intent(prompt)` 실행.
   - 우선 룰 기반: 카테고리, 가격, 올리브영, 데일리/면접용/진하지 않은 키워드.
   - Claude는 선택적 보조. 실패해도 빈 보조값으로 진행.
4. Naver API로 후보 수집 또는 캐시 catalog 조회.
5. 상품 단위 dedup: `productId` 우선. 옵션/호수 손실은 MVP에서 허용하되 문서화.
6. query embedding 생성: `prompt + lockedFilters + answers` 텍스트.
7. item embedding 캐시와 cosine similarity 계산.
8. 룰 점수 + semantic 점수 + popularity로 top candidates 생성.
9. 서버가 `propose_info_gain_question(candidates, session)` 실행.
10. 질문이 필요하면 `phase='question'`.
11. 답변 수신 시 `filterDelta`를 적용하고 6번부터 반복.
12. 종료조건 충족 시 hero + alternatives 반환.

### 3.2 종료조건

다음 중 하나면 결과로 종료한다.

- `questionCount >= 3`.
- 후보가 3개 이하.
- top1과 top2 점수 차이가 충분히 큼. MVP 기본값: 0.12 이상.
- 더 물을 수 있는 고신뢰 속성이 없음.
- 사용자가 `noop` 성격의 답변을 선택했고 다음 질문의 정보이득이 낮음.

### 3.3 Claude 호출 위치

Claude는 아래 위치에서만 선택적으로 호출한다.

| 호출 | 역할 | 실패 시 |
|---|---|---|
| `parse_intent_optional` | 룰 파서가 놓친 질감/톤/상황 태그 보조 | 룰 intent만 사용 |
| `rewrite_question_copy` | 서버가 고른 질문/옵션의 문구를 자연스럽게 변경 | 서버 기본 문구 사용 |
| `generate_result_copy` | `headerLabel`, `matchSummary` 문구 생성 | 룰 기반 문구 사용 |

금지:
- Claude가 후보를 새로 만들기.
- Claude가 `ask/no ask` 결정하기.
- Claude가 `attribute`나 `filterDelta`를 새로 만들기.
- Claude 실패 시 질문 루프를 건너뛰기.

## 4. 정보이득 기반 아키네이터 루프

이 기능은 MVP의 킥이다. Day1 범위에서 제거하지 않는다.

### 4.1 질문 후보 속성

기본 askable attributes:

- `category`: 프롬프트에서 카테고리가 불명확할 때만.
- `priceTier`: 가격 조건이 명시되지 않았고 가격 분포가 넓을 때.
- `finish`: lip/cheek/base/shadow에서 사용. 단 신뢰도 낮으면 제외.
- `intensity`: "진하지 않은", "자연스러운", "면접용" 같은 조건과 잘 맞음.
- `colorFamily`: lip/cheek/shadow에서 사용. 신뢰도 낮으면 제외.
- `channel`: "올리브영" 조건이 명시되지 않았고 구매 채널 분포가 갈릴 때만.

이미 `lockedFilters`로 확정된 속성, 이미 물어본 속성, coverage가 낮은 속성은 제외한다.

### 4.2 정보이득 계산

후보집합 `C`와 속성 `a`에 대해:

```text
H(C, a) = -Σ p_v log2(p_v)
gain(a) = H(C, a) * coverage(a) * uxPriority(a) * confidence(a)
```

- `p_v`: 후보 내 속성값 `v`의 비율.
- `coverage(a)`: unknown이 아닌 후보 비율. MVP 기본 cutoff 0.6.
- `confidence(a)`: 해당 속성 `attributeConfidence` 평균. MVP 기본 cutoff 0.55.
- `uxPriority(a)`: 데모용 우선순위 가중치.
  - `finish`: 1.15
  - `intensity`: 1.1
  - `colorFamily`: 1.05
  - `priceTier`: 1.0
  - `channel`: 0.9
  - `category`: 0.85

제외 조건:
- 값 종류가 2개 미만.
- unknown 비율이 40% 초과.
- 한 값이 85% 이상으로 쏠림.
- 이미 질문한 속성.

### 4.3 옵션 생성

각 질문은 2~4개 옵션을 가진다.

예시:

```ts
{
  id: 'q-finish-1',
  attribute: 'finish',
  title: '마무리감은 어느 쪽이 좋아요?',
  options: [
    {
      id: 'glossy',
      label: '촉촉한 광택감',
      filterDelta: { attribute: 'finish', op: 'in', values: ['glossy', 'satin'], source: 'question' },
    },
    {
      id: 'matte',
      label: '보송한 마무리',
      filterDelta: { attribute: 'finish', op: 'eq', values: ['matte'], source: 'question' },
    },
    {
      id: 'either',
      label: '상관 없어요',
      filterDelta: { attribute: 'finish', op: 'noop', source: 'question' },
    },
  ],
}
```

질문 선택권은 서버에 있다. Claude가 카피를 바꾸더라도 `filterDelta`는 절대 바꾸지 않는다.

### 4.4 데모에서 반드시 보여줄 동작

- 후보가 넓으면 첫 결과 전 최소 1개 질문을 묻는다.
- 모호한 프롬프트에서는 2개 질문까지 자연스럽게 이어진다.
- 답변마다 후보 수/분포가 줄어드는 로그를 남긴다.
- 질문을 모두 건너뛰지 않는다. Claude 실패 시에도 서버 기본 질문을 띄운다.

## 5. 검색/랭킹

### 5.1 후보 수집

Naver API 쿼리는 카테고리/키워드 중심으로 구성한다.

예:
- `립 틴트 화장품`, `글로시 립`, `쿨톤 립`
- `블러셔 치크 화장품`, `면접 블러셔`
- `아이섀도우 팔레트`, `아이라이너`
- `쿠션 파운데이션 베이스`

브랜드 10개 제한은 Day1 핵심이 아니다. Naver 실시간 검색 구조에서는 특정 브랜드 catalog 완성보다 카테고리/화장품 노이즈 제거가 더 중요하다.

### 5.2 노이즈 필터

반드시 제거:

- 비화장품 카테고리.
- 중고/렌탈/대용량/벌크/해외구매/기획세트 중심 상품.
- 이미지/구매링크/가격이 없는 상품.
- 상품명이 카테고리와 맞지 않는 항목.

### 5.3 속성 추론

신뢰도 원칙:

- `category`, `priceKrw`, `sellerName`, `channel`, `imageUrl`, `purchaseUrl`: Naver 필드/룰 기반으로 고신뢰.
- `colorFamily`, `finish`, `intensity`, `shadeName`: title/키워드/선택적 Claude 보조 기반 추론. 질문에 쓰려면 confidence cutoff 통과 필요.

MVP에서 `shadeName`은 결과 표시 보조값이다. 랭킹/수용기준의 핵심 조건으로 두지 않는다.

### 5.4 임베딩

재사용 가능:
- Bedrock runtime client.
- Titan embedding invoke.
- cosine similarity.

신규 필요:
- 자유 프롬프트용 query text 생성.
- 답변 누적 후 query text 갱신.
- item embedding cache.

item embedding text:

```text
브랜드: {brandName}
상품명: {productName}
카테고리: {category}
가격대: {priceTier}
판매처: {sellerName}
추론 속성: {colorFamily} {finish} {intensity} {tags}
```

query embedding text:

```text
사용자 요청: {prompt}
확정 조건: {lockedFilters}
답변 조건: {answers}
```

### 5.5 최종 점수

```text
score = 0.45 * semantic + 0.40 * rule + 0.15 * popularity
```

- `semantic`: Titan cosine similarity를 0~1 정규화.
- `rule`: 카테고리/가격/채널/키워드/질문답변 일치 점수.
- `popularity`: Naver 검색 rank/relevance 기반 폴백.

Titan이 실패하면 `semantic=0`으로 두지 말고 가중치를 rule/popularity로 재분배한다.

### 5.6 소프트 완화

0건 방지용 완화 순서:

1. tags
2. finish
3. intensity
4. colorFamily
5. priceTier

완화 금지:
- 프롬프트에 명시된 `category`.
- 프롬프트에 명시된 `priceKrw <= N`.
- 프롬프트에 명시된 `channel='oliveyoung'`.

명시 조건을 못 맞추면 조용히 풀지 말고 결과 카피에 "조건에 가까운 후보"라고 표시한다.

## 6. 데이터 파이프라인

### 6.1 밤샘 MVP 경로

1. Naver API 호출.
2. raw response 캐시.
3. `_map_naver_item` 계열 매핑으로 기본 후보 생성.
4. productId 기준 dedup.
5. title/category/mallName 기반 속성 추론.
6. Titan item embedding 생성 및 메모리/디스크 캐시.
7. 세션 내 후보셋 저장.

### 6.2 Day2 이후

- 공식몰/올리브영 HTML 크롤링.
- shade/option/swatch 검증.
- 브랜드별 curated catalog.
- 호수 단위 추천.
- 이미지 미러링/S3 fallback.

## 7. UI 연결

- `AuradinSearchScreen.tsx`의 `setTimeout` mock 흐름을 API 폴링으로 교체.
- `POST /api/search/sessions` 후 `GET /api/search/sessions/{id}`를 `retryAfterMs` 기준으로 폴링.
- `phase='question'`이면 서버 질문을 그대로 표시.
- 옵션 탭 즉시 `/answer` 호출.
- `phase='results'`이면 hero + alternatives 표시.
- `phase='failed'|'expired'`이면 재시도 UI 표시.
- `shadeName === ''`이면 호수 라인을 숨기거나 상품명 중심으로 표시.

## 8. 병렬 트랙

| 작업자 | 담당 | 산출물 |
|---|---|---|
| A — 구름 | Naver API 수집, 매핑, productId dedup, 속성 추론, item embedding cache | `search_catalog.py`, `catalog_cache.py`, smoke script |
| B — 승철 (**가장 tricky한 파트**) | query embedding, rule score, 정보이득 질문 엔진, filterDelta 적용, 랭킹 | `search_engine.py`, `question_engine.py`, tests |
| C — 서진 | 세션 API, in-memory session manager, polling UI, image adapter, failed/expired 처리 | `search_sessions.py`, mobile service/screen wiring |

금지:
- 같은 파일 동시 편집.
- Claude tool-use 루프 구현 착수.
- HTML 크롤링을 임계경로로 올리기.
- shade 정확도를 수용기준으로 넣기.

## 9. 사람 선행작업

1. Bedrock Claude/Titan model access 확인.
2. AWS region/inference profile 확인.
3. IAM `bedrock:InvokeModel` 권한 확인.
4. Naver Shopping API Client ID/Secret 확인.
5. 라이브 smoke:
   - Naver API 1회 호출.
   - Titan embedding 1회 호출.
   - Claude JSON 1회 호출. 실패해도 MVP core는 계속 가능해야 함.

## 10. 수용기준

### 공통

- 첫 `question` 또는 `results` phase 도달 p95 <= 20초.
- 답변 후 다음 phase 도달 p95 <= 10초.
- 무한 `searching` 금지. 실패 시 `failed`.
- 결과 후보는 모두 이미지/가격/구매링크 보유.
- 질문은 정보이득 로그를 남긴다: attribute, gain, coverage, candidate count before/after.

### 시나리오 1 — 킥 기능 필수

프롬프트:

```text
쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
```

통과조건:
- 최소 1개, 최대 3개의 질문.
- 질문 attribute가 `finish`, `intensity`, `colorFamily`, `priceTier` 중 하나.
- 최종 hero/alternatives는 `category='lip'`.
- 명시 가격 조건 `priceKrw <= 20000` 유지.
- 답변 후 후보 분포가 실제로 좁혀진 로그 존재.

### 시나리오 2 — 모호한 프롬프트에서 멀티턴

프롬프트:

```text
데일리로 쓸 만한 제품 추천해줘
```

통과조건:
- 최소 2개 질문.
- 첫 질문은 `category` 또는 `priceTier`처럼 큰 분기.
- 두 번째 질문은 첫 답변 이후 남은 후보에서 계산된 다른 attribute.
- 같은 속성을 반복 질문하지 않음.

### 시나리오 3 — 구매 가능성

프롬프트:

```text
올리브영에서 살 수 있는 데일리 립
```

통과조건:
- `channel='oliveyoung'`를 locked filter로 유지.
- 결과가 없으면 조건을 조용히 풀지 않고 failed/near-match 메시지로 처리.
- hero/alternatives는 `category='lip'`.

## 11. 남은 리스크

| 리스크 | MVP 처리 |
|---|---|
| Naver API가 shade/옵션을 안정적으로 안 줌 | 상품 단위 추천으로 명시. `shadeName`은 optional. |
| productId dedup으로 옵션 손실 | MVP에서 허용. 호수 단위는 Day2. |
| Claude JSON timeout/parse 실패 | core loop와 질문 엔진은 서버 결정론으로 동작. Claude 실패 시 기본 카피. |
| Titan embedding 지연 | item embedding 캐시. 실패 시 rule/popularity 가중치 재분배. |
| Naver 노이즈 상품 | 카테고리/상품명 blacklist/required keyword 필터 강화. |
| 이미지 hotlink 실패 | Day1은 Naver URL 직접 사용. 깨지면 fallback image. S3 mirror는 Day2. |

## 12. 한 줄 판정

밤샘 MVP는 가능하다. 단, 성공 기준은 **호수 정밀 검색**이 아니라 **Naver 기반 실제 상품 후보를 정보이득 질문으로 좁혀가는 대화형 검색 시연**이다. 킥은 유지하고, 깨지기 쉬운 shade/HTML/Claude 의존만 핵심 경로에서 뺀다.
