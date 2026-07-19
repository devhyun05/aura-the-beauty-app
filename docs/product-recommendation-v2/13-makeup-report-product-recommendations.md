# 메이크업 추천 보고서 기반 제품 추천 정본

- 작성일: 2026-07-20
- 상태: 구현 완료·운영 마이그레이션 대기
- 적용 범위: 추천제품 허브의 첫 번째 shelf와 해당 제품 추천 API

이 문서는 추천제품 허브의 첫 번째 shelf에 관한 최신 source of truth다. 이 주제에서
`00`~`12` 문서의 AR 기반 첫 shelf 또는 “이번 범위에서 미구현” 설명과 충돌하면 이 문서를
우선한다. 시즌·개인화·코호트·AURADIN의 독립 계약은 기존 문서를 유지한다.

## 1. 결정

- 추천제품 허브의 첫 번째 `AR 필터 기반 추천제품` shelf를
  `메이크업 추천 보고서 기반 추천제품` shelf로 교체한다.
- 사용자는 자신의 완료된 상황별 메이크업 추천 보고서를 여러 개 조회하고 하나를 선택할 수
  있다. 한 보고서 안에서는 `anchor`, `bold`, `discovery` 룩을 선택할 수 있다.
- 선택한 보고서와 룩의 구조화된 메이크업 레시피를 기준으로 `base`, `brow`, `shadow`,
  `liner`, `cheek`, `lip` 제품을 보여준다. 메이크업 보고서의 `eye` 영역은 application
  plan의 제품 유형과 단계별 색상을 읽어 `shadow`와 `liner`로 각각 정규화한다.
- 보고서가 저장되면 세 룩의 추천을 비동기로 한 번 계산해 versioned snapshot으로 매핑한다.
  화면 재진입·보고서 전환은 이 저장 결과를 읽을 뿐 다시 순위를 계산하지 않는다. 사용자가
  명시적으로 재시도할 때만 기존 결과를 보존한 채 `revision + 1`을 만든다.
- inline 실행에서도 제품 snapshot과 추천 이미지 작업은 한 background coordinator에서 병렬로
  실행한다. 세 룩 제품 계산이 이미지 생성을 직렬로 막거나 그 반대가 되지 않는다.
- 제품은 mock이나 LLM이 만든 상품이 아니라 검증된 실제 카탈로그와 유효한 판매 offer에서만
  가져온다. 자체 카탈로그가 부족하면 검증된 supplemental Auradin 상품을 출처가 드러나게
  보충할 수 있다.
- 기존 `/api/products/recommendations/ar` API, 저장 AR 룩, AR 편집·프리뷰 흐름과 과거
  `ar_v1` 데이터는 호환성을 위해 유지한다. 다만 추천제품 허브의 첫 shelf는 더 이상 이를
  추천 기준으로 사용하지 않는다.

## 2. 선택과 표시 계약

보고서 목록은 인증된 사용자의 완료된 보고서만 최신순으로 반환한다. 진입 시 명시적으로 전달된
보고서가 유효하면 이를 우선하고, 그렇지 않으면 최신 보고서를 선택한다. 보고서 안에서는
`anchor`를 기본으로 선택하되, 없으면 서버가 반환한 첫 유효 룩을 선택한다.

보고서 또는 룩을 바꾸면 이전 제품 요청을 무효화하고 새 선택의 응답만 화면에 반영한다. 선택을
바꾸면 카테고리 필터는 `all`로 돌아간다. 보고서가 없으면 mock 상품을 대신 보여주지 않고
`메이크업 추천 받기` CTA가 있는 empty state를 표시한다.

표시 카테고리는 다음과 같다.

| 보고서 영역 | 제품 카테고리 | 주된 근거 |
| --- | --- | --- |
| `base` | `base` | 제품 유형, 피니시·질감, 커버리지, 분석 피부 타입 |
| `brow` | `brow` | 색상 Lab/ΔE, 피니시, 제품 유형 |
| `eye` | `shadow` | 색상 Lab/ΔE, 피니시, 제품 유형 |
| `eye` | `liner` | 라이너 단계의 구조화 색상 Lab/ΔE, 피니시, 라이너 제품 유형 |
| `cheek` | `cheek` | 색상 Lab/ΔE, 피니시, 제품 유형 |
| `lip` | `lip` | 색상 Lab/ΔE, 피니시, 제품 유형 |

같은 `eye` guide 안에서도 섀도 단계와 라이너 단계를 섞지 않는다. early V2 보고서처럼
`applicationPlan`이 없고 guide-level `steps/products`만 있는 저장 데이터는 기존 deterministic
recipe enricher로 읽기 시 정규화한 뒤 같은 canonical recipe를 hash·매칭한다.

## 3. 추천 파이프라인

추천 순서는 아래와 같이 고정한다.

```text
소유권이 확인된 보고서·룩
→ legacy/early V2 레시피 정규화
→ 구조화 영역·단계별 레시피 추출
→ hard eligibility filter
→ 비-base 색상 Lab/ΔE + 피니시·제품유형 규칙
→ sanitized Titan embedding bounded rerank
→ verified catalog + fresh offer 결과를 snapshot revision으로 저장
→ 화면 GET은 저장 순서 유지 + 현재 offer/license만 재검증
```

### 3.1 Hard eligibility

semantic score를 계산하기 전에 다음 조건을 모두 적용한다.

- 요청한 카테고리와 제품·shade 카테고리가 일치한다.
- product는 active, published, 유효한 license와 `mobile_display`, `recommendation` 사용 권한을
  가진다.
- asset은 active packshot이며 license와 사용 기간이 유효하다.
- offer는 active이고 `in_stock` 또는 `limited`이며 license, 사용 기간, freshness 기준을
  충족한다.
- 내부 shade 근거는 허용된 측정·공식·제휴 evidence, 현재 또는 과거의 `reviewed_at`,
  `evidence_confidence >= 0.60`을 모두 충족해야 한다.
- 이미지와 구매 URL은 검증된 public HTTPS URL이어야 한다.

hard eligibility에서 탈락한 후보는 색상 점수나 embedding 점수가 높아도 복구하지 않는다.

### 3.2 색상·피니시 규칙

`brow`, `shadow`, `liner`, `cheek`, `lip`은 보고서 레시피의 유효한 `#RRGGBB`를 CIELAB으로
변환하고, 근거가 확인된 상품 shade Lab과 CIEDE2000 ΔE를 비교한다. 허용 ΔE 범위를 넘는
색상은 semantic rerank 후보에 넣지 않는다. 가까운 색 안에서는 피니시·질감과 제품 유형,
evidence confidence를 함께 점수화한다.

`base`는 보고서의 shade hex를 제품 shade 매칭에 사용하지 않는다. 생성된 base 색은 메이크업
연출 또는 렌더링 힌트일 수 있어 실제 파운데이션 호수와 같은 의미가 아니기 때문이다. base는
제품 유형, 피니시·질감, 커버리지와 분석 피부 타입으로만 rule score를 만든다.

### 3.3 Bedrock Titan bounded rerank

Bedrock Titan text embedding은 hard filter와 규칙을 통과한 후보 안에서만 순서를 보조한다.

- query와 상품 text에는 allowlist된 구조화 필드만 포함한다: category,
  broad color family, finish, texture, product type.
- raw color name, 영역 목표, 룩 역할, 상황 key·label·자유문, 답변 원문, 사용자·report ID,
  얼굴 분석 원문, 이미지·landmark·URL은 embedding 입력에서 제외한다.
- embedding은 snapshot 생성·명시적 refresh 때 hard filter와 규칙을 통과한 카테고리별 bounded 후보에만
  적용하며 후보 상한은 카테고리별 8개다. 일반 화면 GET은 Bedrock을 호출하지 않는다.
  query와 후보 상품 embedding의 cold miss는 Bedrock을 호출할 수 있으며,
  사전 계산되었다고 가정하지 않는다.
- 결과는 Titan model, dimension, 정규화·정제된 text hash를 key로 하는 process-local
  LRU/TTL cache에 보관한다. cache hit는 재사용하고, TTL 만료나 LRU 축출 후의
  다음 요청은 다시 cold miss가 될 수 있다. 전체 카탈로그에 대한 unbounded 호출은 허용하지 않는다.
- 같은 hash의 동시 cold miss는 single-flight로 합치고, 실제 provider 호출은 process 전역 bounded
  executor로 제한한다. 7초 응답 제한 뒤에도 SDK thread가 즉시 중단되지 않을 수 있으므로 provider
  slot은 그 thread가 실제 종료될 때만 반환하며, 포화 시 새 호출을 만들지 않고 rules-only로 저하한다.
- query vector와 상품 vector는 같은 Titan model과 dimension을 사용한다. 불일치하면 embedding을
  적용하지 않는다.
- semantic 가중치와 순위 이동 폭은 제한한다. embedding은 카테고리, eligibility, ΔE 제한 또는
  명백한 피니시·제품유형 불일치를 뒤집을 수 없다.
- Bedrock 장애나 권한 문제에서 hash vector를 Titan vector인 것처럼 비교하지 않는다. 규칙 기반
  정렬로 저하하고 fallback metadata를 반환한다.

### 3.4 LLM 신뢰 경계

LLM은 상황별 메이크업의 구조화 룩과 영역 레시피를 생성하는 데만 사용한다. LLM 출력은 검색
query의 근거일 뿐 상품 사실의 source of truth가 아니다.

LLM은 product ID, shade ID, 상품명, 브랜드, 이미지 URL, 구매 URL, 가격, 재고, license,
evidence 또는 “일치율”을 만들거나 보정할 수 없다. 모든 표시 상품과 판매 정보는 server-side
verified catalog 조회 결과여야 한다. 추천 이유도 카탈로그와 실제 적용된 rule/semantic signal로만
조립한다.

## 4. 카탈로그와 fallback 표시

내부 verified catalog 상품을 우선한다. 카테고리별 적격 상품이 부족할 때만 현재 검증된 Auradin
snapshot과 `PRODUCT_OFFER_MAX_AGE_HOURS` 이내의 `offerRefreshEvidence`를 가진 상품을 보충한다.
보충 전에는 보고서 색상과 allowlist로 정규화한 제품 유형의 교집합 hard filter를 카테고리별 최대
200개의 bounded 후보군에 먼저 적용한다. 이 제품 유형 gate는 `base`뿐 아니라
`brow`, `shadow`, `liner`, `cheek`, `lip`에도 동일하게 적용한다.
보충 상품은 `externalSource: "auradin_catalog"`와
실제 external product identity를 유지하며 내부 상품으로 위장하지 않는다. 좋아요와 판매처 이동도
이 identity를 사용한다.

응답의 `ranking`은 최소한 다음 정보를 제공한다.

```json
{
  "strategy": "makeup_report_hybrid_v2",
  "embeddingApplied": true,
  "embeddingModelId": "amazon.titan-embed-text-v2:0",
  "fallback": {
    "mode": "none",
    "reasonCodes": [],
    "supplementalAuradinApplied": false
  }
}
```

허용되는 fallback mode는 `none`, `rules_only`, `catalog_supplement`,
`rules_only_with_catalog_supplement`, `catalog_shortage`, `empty`다. `catalog_shortage`는
embedding 적용 여부와 무관하게 최종 상품 수가 요청 상한보다 적다는 뜻이다. `reasonCodes`는 내부 예외 문구가 아니라
`EMBEDDING_UNAVAILABLE`, `EMBEDDING_CAPACITY_SATURATED`, `VERIFIED_CATALOG_SHORTAGE`,
`SUPPLEMENTAL_CATALOG_UNAVAILABLE`, `SUPPLEMENTAL_CATALOG_FILTERED`,
`NO_ELIGIBLE_PRODUCTS`처럼 공개 가능한 안정된 코드만 사용한다. 최종 상품 수가 요청한
`perCategoryLimit`보다 적으면 group을 degraded로 표시하고 `VERIFIED_CATALOG_SHORTAGE`를 남긴다.

fallback에서도 mock, request-time live shopping search, 만료 offer 또는 검증되지 않은 URL을
노출하지 않는다. 적격 상품이 없으면 해당 group은 정직한 empty 상태를 반환한다. 전체 snapshot이
비어 있으면 모바일은 `추천 다시 찾기`를 제공하고, 사용자가 이를 누를 때만 새 revision을 계산한다.

## 5. API 계약

두 API 모두 로그인과 DB 연결이 필요하며 camelCase 응답을 사용한다.

### 5.1 보고서 목록

```http
GET /api/products/recommendations/makeup-reports
```

응답은 선택기에 필요한 최소 digest만 포함한다.

```json
{
  "reports": [
    {
      "reportId": "uuid",
      "scenarioText": "퇴근 후 약속",
      "createdAt": "2026-07-20T10:00:00Z",
      "imageStatus": "completed",
      "looks": [
        {
          "lookId": "anchor",
          "role": "anchor",
          "title": "차분한 로즈 룩",
          "summary": "...",
          "imageUrl": "https://...",
          "palette": ["#A45A68"],
          "targets": ["base", "brow", "shadow", "liner", "cheek", "lip"]
        }
      ]
    }
  ]
}
```

### 5.2 선택 룩 제품 추천

```http
GET /api/products/recommendations/makeup-reports/{reportId}?lookId={lookId}&perCategoryLimit=6
```

`lookId`는 해당 보고서에 실제로 속해야 한다. 생략 시 `anchor`, 그다음 첫 유효 룩을 선택한다.
`perCategoryLimit`는 1~8만 허용하며 9 이상은 `422`로 거절한다. 최초 legacy 접근에서 snapshot이
없으면 `pending` 행을 만들고 계산을 예약한다. 응답의 `snapshot.status`는
`pending | processing | ready | partial | failed`이고, 완료된 응답은
`base/brow/shadow/liner/cheek/lip`의 `groups`와 위에서 정의한 `ranking` metadata를 포함한다.
모바일은 `pending/processing`만 제한 횟수로 polling하고 보고서·룩 변경 또는 화면 이탈 시 요청을
취소한다. 제품 상세에서 돌아오면 선택한 보고서·룩·카테고리와 rail 위치는 유지하면서 일반 GET을
한 번 호출해 저장 순위는 바꾸지 않고 현재 license·asset·offer freshness만 다시 검증한다.

### 5.3 명시적 재계산

```http
POST /api/products/recommendations/makeup-reports/{reportId}/refresh?lookId={lookId}
```

실패 재시도 또는 사용자의 명시적 새로고침만 새 revision을 만든다. 기존 ready/partial 행은
덮어쓰지 않는다. 동일 보고서·룩에서 revision 자체가 유일하도록 강제하고,
recipe hash·algorithm·catalog·revision 보조 유니크 키와 worker
claim으로 중복 요청이 서로 다른 순위를 저장하지 못하게 한다. 10분 넘게 멈춘 `processing` lease는
재claim할 수 있다.

각 product item은 기존 `CatalogProduct` 계약을 재사용한다. 내부 상품은 검증된 product/shade/offer
identity를, supplemental 상품은 `externalSource`와 외부 `productId`의 identity 쌍을 보존한다.

## 6. 개인정보·소유권

- 모든 목록·상세 query는 인증된 사용자의 `user_id`로 제한한다.
- 다른 사용자의 report ID, 존재하지 않는 report ID, 삭제된 report ID는 동일한 404 계약으로
  처리해 존재 여부를 노출하지 않는다.
- 선택한 `lookId`도 소유권이 확인된 report payload 안에서 검증한다.
- 응답은 `Cache-Control: private, no-store`를 기본으로 하며 공유 CDN cache에 사용자 보고서나
  선택 정보를 저장하지 않는다.
- Bedrock에는 위의 sanitized structured query만 전송한다. 원본 얼굴 이미지, 생성 이미지 binary,
  landmark, 사용자 식별자, 인증 정보와 원문 보고서를 보내지 않는다.
- 로그에는 report 내용이나 embedding 원문을 남기지 않고 request ID, 공개 가능한 상태 코드,
  latency와 후보 수 같은 운영 metadata만 남긴다.
- `product_recommendation_runs`의 `makeup_report_v1` 행은 report FK, look ID, SHA-256 recipe hash,
  algorithm/catalog version, revision, 상태와 bounded ranked payload만 저장한다. 원문 보고서,
  상황 자유문, 얼굴 데이터와 presigned 생성 이미지 URL은 payload에 복제하지 않는다.
- snapshot은 일반 product-run TTL로 재계산하지 않고 원본 report 수명 동안 유지한다. 보고서가
  존재하는 동안 같은 revision의 매핑이 보존되고, 삭제는 아래 FK cascade가 담당한다.
- 저장된 제품 identity와 순서는 고정하되 GET에서 현재 license·asset·offer freshness를 다시
  확인한다. 더 이상 적격하지 않은 제품은 조용히 다른 제품으로 바꾸지 않고 제외하며, 교체가
  필요하면 명시적 refresh revision을 사용한다.
- 개인화 동의가 켜진 경우에도 제품 노출·열기 이벤트에는 제품 identity, 선택 카테고리와
  `makeup_report` 출처만 기록하며 report ID, 상황 문구와 룩 내용은 넣지 않는다.
- 보고서 삭제 시 snapshot FK가 `ON DELETE CASCADE`되고 계정 삭제의 기존 report 삭제 경로도
  같은 정리를 수행한다. 추천 응답을 별도 장기 사용자 프로필로 복제하지 않는다.

## 7. 완료 기준

- 여러 보고서와 `anchor/bold/discovery` 사이를 전환해도 오래된 응답이 섞이지 않는다.
- 여섯 카테고리가 정확히 분리되고 `eye`의 shadow/liner 단계·색상이 서로 섞이지 않는다.
- 같은 보고서·룩의 일반 GET은 동일 run/revision과 동일 제품 순서를 반환하며 Bedrock/랭킹을
  다시 실행하지 않는다.
- 새 보고서와 V2 refinement 저장 직후 세 룩의 pending snapshot이 생성되고, legacy 보고서는
  최초 접근에서 한 번 backfill된다.
- base ranking은 report shade hex에 영향을 받지 않는다.
- 비-base 색상 범위 밖 상품과 hard eligibility 탈락 상품은 embedding으로 복구되지 않는다.
- Titan 성공, model/dimension 불일치, timeout/권한 실패, rules-only fallback이 모두 테스트된다.
- 내부·supplemental 상품 모두 검증된 이미지와 fresh offer만 가지며 출처가 구분된다.
- 교차 사용자 report 접근, 삭제 report, 잘못된 look ID가 거절된다.
- 기존 AR 저장·프리뷰와 `/api/products/recommendations/ar` 회귀 테스트는 계속 통과한다.
