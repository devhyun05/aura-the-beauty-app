# 03. 추천 시스템 설계

## 원칙

추천 품질보다 먼저 `무엇을 근거로 추천했는지`가 사실이어야 한다.

- AR 색상: 숫자로 비교 가능한 색·피니시·부위 데이터
- 시즌: 기간이 있는 트렌드 신호와 사람의 검수
- 개인화: 동의한 행동만 사용하고 데이터 부족을 숨기지 않음
- 유사 취향: 얼굴 원본/임베딩이 아닌 집계된 취향 특성
- 상품: 출처·라이선스·판매 상태가 확인된 서버 카탈로그

언어 임베딩 하나로 이 네 문제를 모두 풀지 않는다.

## 1. 저장 AR 룩 기반 추천

### 1.1 입력 계약

최종 저장 시 기존 mobile contract를 새 JSON으로 다시 발명하지 않는다. 현재 `FullFaceMakeupRecipe`의 `version: 2`를 보존하고, `saved_makeup_styles.style_payload`에는 이를 감싸는 versioned saved-look envelope와 서버가 계산한 추천 projection을 저장한다.

```json
{
  "schemaVersion": "saved_ar_look_v1",
  "source": "face-analysis-full-face",
  "recipeContract": "FullFaceMakeupRecipe",
  "recipe": {
    "version": 2,
    "rendererMode": "smooth-region-mask",
    "layers": [
      {
        "region": "lip",
        "enabled": true,
        "color": "#B96872",
        "finish": "gloss",
        "intensity": 0.72,
        "opacity": 0.78,
        "blendMode": "normal",
        "candidateId": "lip-balanced-gold-v0",
        "maskTextureId": "lip-drawn-style-atlas-v1"
      }
    ]
  },
  "recommendationProjection": {
    "version": "ar_recommendation_projection_v1",
    "colorSemantics": "authoring_color",
    "regions": [
      {
        "runtimeRegion": "lip",
        "productRegion": "lip",
        "authoringColorHex": "#B96872",
        "rawFinish": "gloss",
        "canonicalFinish": "gloss",
        "intensity": 0.72,
        "opacity": 0.78,
        "blendMode": "normal"
      },
      {
        "runtimeRegion": "blush",
        "productRegion": "cheek",
        "authoringColorHex": "#D88E91",
        "rawFinish": "sheer-glow",
        "canonicalFinish": "sheer_glow",
        "intensity": 0.46,
        "opacity": 0.52,
        "blendMode": "normal"
      }
    ]
  }
}
```

규칙:

- 저장 API는 사용자가 소유한 style만 반환/수정한다.
- 원본 얼굴 사진, 카메라 frame, landmark 좌표와 기존 `sourceFrameMetadata`는 서버 저장 recipe에서 제거한다.
- recipe v2 원본 field/region 이름은 round-trip을 위해 보존한다. projection은 서버가 원본 recipe에서 재계산하고 client projection을 신뢰하지 않는다.
- `authoringColorHex`는 shader 입력색이다. 피부·카메라 pixel, opacity, intensity, blend mode를 거친 `사용자가 본 합성색`이 아니다.
- P0의 color semantics는 `authoring_color`로 고정하고 UI도 `선택한 AR 색과 가까워요`라고 쓴다.
- intensity와 opacity의 범위는 0–1로 검증한다.
- 허용된 recipe v2 region/finish/texture/blend enum만 저장한다.
- 알 수 없는 필드는 거부하거나 명시적으로 보존 정책을 정한다.
- recipe version, rendererMode, algorithm version을 기록해 색상 해석 변화에 대응한다.
- 생성 요청에는 별도 `clientRequestId`를 사용해 같은 저장 retry가 style을 중복 생성하지 않게 한다.

`user_ar_filter_states`는 편집 중 draft/복구용으로 유지할 수 있지만, 추천의 canonical input은 저장 완료된 `saved_makeup_styles`다.

### 1.1.1 Runtime→추천 normalization

원본 이름과 상품 domain 이름을 섞지 않는다.

| recipe v2 runtime region | alias/UI | 추천 product region | P0 |
| --- | --- | --- | --- |
| `lip` | 립 | `lip` | 포함 |
| `blush` | 치크/블러셔 | `cheek` | 포함 |
| `eyeliner` | 아이/아이라이너 | `liner` | 라이선스 shade가 있을 때 포함 |
| `foundation` | 베이스 | `base` | 단순 hex 추천은 보류 |
| `brow` | 브로우 | `brow` | P1 |
| `lens` | 렌즈 | 별도 의료기기/콘택트렌즈 검토 | 화장품 추천에서 제외 |

finish도 raw 값을 보존하고 canonical 값을 별도 계산한다.

| runtime raw finish 예 | canonical | UI 예 |
| --- | --- | --- |
| `natural-makeup` | `natural` | 내추럴 |
| `cream` | `cream` | 크림 |
| `gloss` | `gloss` | 글로스/광택 |
| `soft-powder` | `powder` | 소프트 파우더 |
| `cream-blush` | `cream` | 크림 블러셔 |
| `sheer-glow` | `sheer_glow` | 은은한 글로우 |
| `soft-eye-line` | `soft_line` | 소프트 라인 |
| `defined-eye-line` | `defined_line` | 또렷한 라인 |
| `soft-eye-shimmer` | `shimmer` | 쉬머 |

UI의 `글로우`와 runtime `gloss`를 같은 raw enum처럼 저장하지 않는다. 표시 label만 현지화한다.

### 1.2 제품 shade 계약

색상 추천 단위는 제품이 아니라 shade다.

```text
Product
  └─ ProductShade
       shadeKey, shadeName
       srgbHex
       labL, labA, labB
       finish, coverage, opacity
       evidenceType, evidenceUrl, measuredAt, confidence
```

`evidenceType` 예:

- `measured_swatch`: 표준 조건에서 직접 측정
- `licensed_partner_feed`: 제휴사가 제공한 색상 수치
- `brand_official_swatch`: 공식 swatch를 정해진 규칙으로 변환
- `manual_review`: 운영자가 공식 근거를 검수
- `title_inferred`: 제목에서 추론한 저신뢰 데이터; 기본 AR 후보에서는 제외

제품 이미지의 대표색을 자동 추출할 경우 배경·패키지 색이 섞이므로 곧바로 `실제 발색`으로 쓰지 않는다. 표준화된 swatch crop과 검수 상태가 있어야 한다.

추천 단위가 shade여도 사용자가 요청한 heart는 **제품 family 단위**로 정의한다. 카드에는 추천된 `shadeId`를 표시하지만, 좋아요의 식별자는 `productId`이며 같은 제품의 다른 shade에도 heart가 동기화된다. 좋아요가 발생한 문맥을 보존할 필요가 있으면 검증된 `sourceShadeId`를 optional metadata로 저장한다. 향후 shade 자체를 즐겨찾기하는 요구가 생기면 별도 `user_product_shade_likes`를 설계하고 기존 의미를 바꾸지 않는다.

### 1.3 색상 표현

초기 구현은 다음 순서면 충분하다.

1. projection의 `authoringColorHex` sRGB를 linear RGB로 변환
2. D65 기준 XYZ로 변환
3. CIELAB으로 변환
4. 후보 shade Lab과 ΔE2000 계산

ΔE2000이 작을수록 두 authoring/swatch 색 좌표는 지각적으로 가깝다. 그러나 AR 화면 합성색과 실제 피부 발색은 같지 않으므로 사용자에게 `동일 색상`이라 하지 않고 `선택한 AR 색과 가까운 shade`라 표현한다. opacity/intensity/blendMode는 별도 강도·제형 신호로 사용하고, P0에서 사용자 얼굴 pixel과 수학적으로 섞어 가상의 composite Lab을 만들지 않는다.

향후 `predicted_composite_color`를 추가한다면 표준 중립 기준면에서 renderer를 재현하거나 on-device에서 일시 계산한 값을 독립 field/version으로 둔다. `authoring_color` 결과와 같은 score로 조용히 혼합하지 않고 전문가 평가를 거쳐야 한다.

초기 상품 수가 크지 않다면 후보군을 category/region으로 먼저 줄이고 애플리케이션에서 ΔE2000을 계산해도 된다. 규모가 커지면 Lab 벡터를 DB에 저장하고 근사검색을 검토한다. 기존 PostgreSQL에는 `vector` extension 기대값이 있으나, ΔE2000은 단순 cosine distance와 다르므로 정확한 최종 rerank는 별도로 유지한다.

### 1.4 후보 생성

```text
활성·판매 가능·라이선스 유효 상품
  → AR region과 product category 호환
  → 검수된 shade만
  → 국가/가격/재고 조건
  → Lab 근접 후보 top N
  → canonical finish/coverage/opacity rerank
  → 브랜드 중복 억제
  → 결과+근거 생성
```

부위 매핑은 위 normalization 표가 source of truth다. 특히 recipe의 `blush`를 `cheek`, `eyeliner`를 `liner`로 map하며 존재하지 않는 `eyelid` raw region을 만들지 않는다. `foundation`은 authoring color만으로 실제 foundation shade를 단정하지 않는다.

P0는 비교 가능한 상품 필드가 있는 finish/coverage/opacity까지만 랭킹한다. recipe v2의 roughness, specular, shimmer, textureAmount는 round-trip을 위해 보존하지만, 제품 카탈로그에 같은 정의·측정법의 특성이 생기기 전에는 `텍스처 일치` 근거나 점수로 쓰지 않는다. P1에서 표준화된 product texture feature와 전문가 label이 생기면 별도 algorithm version으로 추가한다.

파운데이션은 undertone, depth, 제품 산화와 촬영 조건의 영향이 크다. 단순 hex 추천을 P0에 포함하지 않고 립·블러셔부터 시작하며, 아이라이너는 검수된 liner shade가 있을 때 확장하는 것이 안전하다.

### 1.5 초기 랭킹

오프라인 정답 데이터가 없을 때의 투명한 rule-based 시작점이다. 제품에 표시할 퍼센트가 아니라 내부 정렬 점수다.

| 신호 | 시작 가중치 예 | 설명 |
| --- | ---: | --- |
| 색상 거리 | 0.45 | category별 ΔE2000 정규화 |
| finish 일치 | 0.20 | canonical gloss/matte/cream/powder 등 |
| 부위·제품 type 적합 | 0.15 | lip tint, lipstick 등 |
| personal color 보조 | 0.10 | 동의한 report가 있을 때만 |
| 품질·판매·다양성 | 0.10 | 신뢰도, 재고, 브랜드 중복 억제 |

이 가중치는 제품 전문가 검수와 실제 선택 로그로 조정한다. `색상 거리 45%`가 사용자 매치율 45%를 뜻하지 않는다.

### 1.6 결과 근거

서버는 점수의 원시 상세 대신 검증 가능한 reason code를 반환한다.

```json
{
  "reasonCodes": ["CLOSE_COLOR", "MATCHING_FINISH"],
  "reasonLabels": ["색상이 가까워요", "글로우 피니시가 같아요"],
  "basedOnRegion": "lip"
}
```

reason label은 서버의 allowlist로 만들고 외부 상품 텍스트나 LLM 문장을 그대로 렌더링하지 않는다.

## 2. 색상 임베딩과 Naver의 역할

사용자 구상의 `필터 색상 임베딩 벡터 기반 네이버 API 연동`은 두 문제로 나눠야 한다.

### 가능한 부분

- AR 색상 → Lab 3차원 수치 또는 별도 color vector
- 권리 있는 product shade → 같은 색 공간
- 자체 랭킹 → 색상/피니시/문맥 결합
- Naver Shopping Insight → `글로우 립`, `뮤트 로즈 립` 같은 시즌 keyword 신호

### 현재 그대로는 불가능하거나 부정확한 부분

- Naver Shopping Search에 색상 vector를 전송해 벡터 검색
- 검색 결과 제목만으로 특정 shade의 실제 색상 일치 보장
- Naver 상대 클릭 ratio를 판매량/실구매 선호로 해석
- 종료 예정 API 결과를 장기 카탈로그 기반으로 확장

따라서 hybrid 구조는 다음이다.

```text
AR Lab vector ───────────────┐
Licensed shade Lab catalog ──┼─> AR ranking
Finish/category constraints ─┘

Naver Shopping Insight ──────┐
룩톡 집계 trend ─────────────┼─> Seasonal theme selection
Editor review ───────────────┘

Seasonal theme + catalog tags ──> Seasonal product collection
```

Naver provider가 중단돼도 AR 추천이 영향을 받지 않아야 한다.

## 3. 시즌 상품 추천

### 3.1 시즌은 “컬렉션”으로 모델링

실시간 keyword 목록을 그대로 노출하지 않고 운영 가능한 컬렉션을 만든다.

```json
{
  "slug": "2026-summer-glow-lip-w28",
  "title": "여름 글로우 립",
  "summary": "최근 검색 클릭 추이가 오른 가벼운 광택 립",
  "validFrom": "2026-07-08T00:00:00+09:00",
  "validUntil": "2026-07-21T23:59:59+09:00",
  "sourceLabels": ["Naver Shopping Insight", "룩톡 집계"],
  "reviewedAt": "2026-07-12T12:00:00+09:00",
  "status": "published"
}
```

### 3.2 신호 처리

- 같은 category, 같은 device/성별/연령 필터, 같은 기간 안의 비율만 비교
- 최소 7일과 직전 기준기간을 비교해 짧은 spike 완화
- keyword당 최소 신호량이 공개되지 않으면 내부 노출 기준을 보수적으로 설정
- 룩톡 likes/saves/views는 event abuse 제거와 unique user cap 적용
- 자동 후보 → 에디터 검수 → 예약 publish → 자동 expiry
- source 수집 실패 시 마지막 검수본을 짧게 유지하고 stale 표시; 무기한 유지 금지

### 3.3 시즌 점수 예시

```text
seasonScore =
  trendLift * 0.35
  + editorialFit * 0.25
  + freshness * 0.15
  + catalogQuality * 0.15
  + diversity * 0.10
```

광고/제휴 상품은 자연 순위와 섞어 몰래 boost하지 않는다. 별도 `스폰서드` rail 또는 카드 바로 근처의 명확한 표시를 사용한다.

## 4. 인게이지먼트 개인화

### 4.1 필요한 이벤트

| 이벤트 | 의미 | 주의 |
| --- | --- | --- |
| `impression` | 실제로 viewport에 노출 | 중복/스크롤 spam 제거, denominator |
| `product_open` | 인앱 상세 열기 | accidental tap 필터 |
| `like` / `unlike` | 명시적 선호 | 가장 강한 신호, 취소 반영 |
| `search_submit` | 사용자가 제출한 query | 원문 최소화/보존기간, 민감어 처리 |
| `search_result_open` | query 결과 선택 | run/query와 연결 |
| `seller_outbound` | 판매처 이동 | 실제 구매로 표현 금지 |
| `hide` | 보고 싶지 않음 | 강한 음성 신호 |

`많이 클릭한 제품`만 수집하면 노출이 많았던 제품이 계속 유리해진다. impression을 함께 기록해 CTR의 denominator를 갖고, position bias를 보정해야 한다.

모든 이벤트를 client batch로 받지는 않는다. `search_submit`은 search endpoint, `like/unlike`는 like transaction, `seller_outbound`는 검증된 offer endpoint가 server-side로 기록한다. client는 viewport impression, product open, search result open, hide처럼 UI에서만 알 수 있는 이벤트만 source별 run/collection/search reference와 함께 batch한다.

### 4.2 초기 프로필

학습형 모델 전에 감쇠된 집계 프로필로 시작한다.

```text
explicit like      +4
seller outbound    +3
product open       +1
unlike             -3
hide               -5

weight *= exp(-ageDays / halfLifeDays)
```

실제 계수와 half-life는 실험으로 정한다. category/brand/color family/finish/price band별 합계를 만들고, 최근 이벤트가 오래된 이벤트보다 크게 반영되게 한다.

### 4.3 개인화 랭킹

- 충분한 데이터 전: 시즌+AR+인기 prior
- 데이터가 쌓인 뒤: 명시적 좋아요 > 상세/판매처 > 검색/클릭
- 같은 브랜드·가격대 반복을 diversity penalty로 억제
- 전체 결과의 일부는 exploration으로 남겨 filter bubble 완화
- 사용자가 개인화를 끄면 이벤트를 개인 추천에 사용하지 않고 기존 파생 프로필을 삭제/비활성화
- 개인화 때문에 가격이 더 비싼 상품만 올라가지 않는지 segment별 점검

## 5. 비슷한 컬러 취향 코호트

P2 기능이다. `얼굴 톤이 비슷한 사람`을 직접 비교하지 않는다.

권고 feature:

- 사용자가 동의한 personal color label 또는 broad undertone/depth bucket
- 최근 좋아요에서 집계한 color family/finish/category preference
- 가격대 preference
- 최소한의 locale/season context

사용하지 않을 feature:

- 원본 얼굴 이미지
- 얼굴 landmark
- identity/face embedding
- 사용자간 얼굴 거리
- 질병·피부 상태 추론

집단은 engineering starting point로 `k ≥ 100`을 권고하고, 각 사용자의 기여를 제한하며 rare bucket을 상위 bucket으로 합친다. 100은 법적 면책 기준이 아니라 재식별·노이즈 위험을 줄이기 위한 시작값이다.

문구는 `비슷한 컬러 취향이 좋아해요`로 한다. 코호트가 작거나 결과가 불안정하면 section을 숨긴다.

## 6. 품질 평가

### AR 오프라인 set

- 부위/category별 전문가가 만든 target shade ↔ 후보 shade relevance
- 다양한 명도·채도·finish
- ΔE 순위와 전문가 순위의 NDCG@K/Recall@K
- 화면색과 실제 swatch 차이에 대한 정성 QA
- 브랜드·가격·피부톤 segment 편향 점검

### 시즌 평가

- 컬렉션 유효기간 내 CTR/save rate
- 직전 시즌 baseline 대비 lift
- stale/품절 노출률
- source 실패 시 graceful degradation
- 에디터 승인률과 잘못된 trend 후보 비율

### 개인화 평가

- non-personalized control 대비 like/detail/outbound uplift
- hide/unlike 증가 여부
- 다양성, 신상품 발견, 브랜드 concentration
- 신규 사용자·저활동 사용자 성능
- 동의 철회 후 사용 중지/삭제 검증

## 7. 모델 발전 순서

1. 설명 가능한 rule-based AR/season ranking
2. 이벤트 품질과 offline label 구축
3. weight tuning 또는 logistic/GBDT reranker
4. 필요할 때만 semantic embedding을 후보/무드 보조에 추가
5. 충분한 트래픽에서 counterfactual evaluation/A-B test
6. 복잡한 모델이 단순 모델보다 유의미하게 낫고 설명·삭제·운영이 가능할 때 승격

LLM은 AURADIN의 질문 이해·필터 추출에는 쓸 수 있지만, 허용 product ID 밖의 상품을 만들어내거나 가격·shade·재고를 생성하게 하면 안 된다.
