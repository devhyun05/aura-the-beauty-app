# 시즌 상품 MCP 트렌드 수집 파이프라인

## 현재 구조와 분리 지점

기존 `product_live_seasonal.py`는 아래 세 slug와 검색어 묶음을 코드에 고정하고, published DB collection이 없을 때 모바일 API 요청 안에서 Naver Shopping Insight와 Shopping Search를 호출했다.

- `glossy-lip-flushed-cheek`
- `waterproof-reflective-eye`
- `soft-blur-skin`

이 구조는 네트워크 timeout이 그대로 첫 화면 지연이 되고, 테마 제목·요약·검색어가 정적 목업처럼 보이는 문제가 있었다. 새 구조에서는 이 파일을 legacy/fallback 호환용으로만 남기고, 공개 시즌 API에서 호출하지 않는다.

## 1차 구현 구조

```text
EventBridge/cron 또는 수동 ops command
  -> TrendSourceAdapter chain
     -> MCPTrendSourceAdapter (설정 시 우선)
     -> NaverTrendSourceAdapter
     -> CuratedTrendSourceAdapter
  -> normalize_trend_snapshot
     -> 성인/비화장품/광고성 키워드 제거
     -> category/color/finish/tag 정규화
     -> source freshness/confidence 검증
  -> DB licensed product 후보 조회
     -> image/offer/license/availability freshness 검증
     -> likes/open/outbound 집계
  -> trend-product scoring + brand/category diversity
  -> 부족 수량은 DB 인기 상품으로 보충
  -> product_seasonal_collections draft/published 저장
  -> 앱 API는 published DB 결과 또는 빠른 인기/catalog fallback 반환
```

MCP는 추천 알고리즘이 아니다. 외부 트렌드 도구를 호출해 구조화된 signal을 공급하는 수집 계층이며, 점수화·권리 검증·중복 제거·diversity·fallback은 백엔드가 통제한다.

## MCP tool 계약

환경 변수:

- `PRODUCT_TREND_MCP_URL`: streamable HTTP/JSON-RPC endpoint
- `PRODUCT_TREND_MCP_TOOL`: 기본 `collect_beauty_trends`
- `PRODUCT_TREND_MCP_BEARER_TOKEN`: 선택 bearer secret
- `PRODUCT_TREND_MCP_ALLOWED_HOSTS`: comma-separated SSRF allowlist
- `PRODUCT_TREND_MCP_TIMEOUT_SECONDS`: 1~30초, 기본 8초

클라이언트는 MCP `2025-11-25` Streamable HTTP 수명주기(`initialize` → `notifications/initialized` → `tools/call`)와 협상된 `MCP-Protocol-Version`/`MCP-Session-Id` 헤더를 따른다. 기준 규격은 [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)이다.

로컬/test의 `localhost`만 HTTP를 허용하고 그 외에는 allowlist의 HTTPS host만 허용한다. tool은 `structuredContent` 또는 JSON text content로 다음 형태를 반환한다.

```json
{
  "title": "이번 주 글로우 립과 롱웨어 베이스",
  "summary": "최근 28일 뷰티 신호를 반영했어요.",
  "trendWindow": "최근 28일",
  "locale": "ko-KR",
  "sourceName": "trend-provider",
  "sourceUpdatedAt": "2026-07-16T00:00:00Z",
  "trends": [
    {
      "keyword": "글로우 립",
      "categories": ["lip"],
      "colorFamilies": ["rose"],
      "finishes": ["glossy"],
      "tags": ["longwear"],
      "reasonCodes": ["SOCIAL_TREND_RISE"],
      "confidenceScore": 0.82
    }
  ]
}
```

응답 필드는 신뢰하지 않는다. 길이/형식/카테고리 allowlist와 freshness를 다시 검증하며, stale/invalid/error이면 다음 adapter로 넘어간다.

## 운영

기본 명령은 read-only dry-run이다.

```bash
python -m app.ops.refresh_product_seasonal_trends
python -m app.ops.refresh_product_seasonal_trends --apply
python -m app.ops.refresh_product_seasonal_trends --apply --publish \
  --created-by <EDITOR_UUID> \
  --reviewed-by <REVIEWER_UUID> \
  --published-by <PUBLISHER_UUID>
```

`--apply`만 사용하면 draft를 저장한다. `--publish`는 기존 seasonal RBAC와 publisher 분리 조건을 통과해야 하며, 이전 published revision을 suspend한 뒤 새 revision을 공개한다. EventBridge에서는 ECS one-off task 또는 같은 command를 실행하는 관리 job을 사용한다. 모바일 API는 이 명령과 MCP credential을 알지 못한다.

로컬 DB가 비어 있거나 source/DB 수집이 실패해도 앱은 packaged Auradin catalog 또는 DB 인기 상품을 반환하므로 빈 화면이 되지 않는다. 외부 product는 기존 `externalSource`, 상세/구매 링크, 이미지 및 좋아요 API 계약을 그대로 사용한다.

## 2차 후보: 메이크업 추천 리포트 기반 제품 추천

이번 작업에서는 구현하지 않는다. 메이크업 추천 리포트 구조화 데이터가 아직 완성되지 않았기 때문이다.

추후 전환 구조는 다음과 같다.

```text
메이크업 추천 리포트
  -> 리포트 구조화 데이터 추출
  -> 룰 기반 후보 필터
  -> AWS Bedrock Titan Text Embedding 기반 의미 유사도
  -> 제품 카탈로그 재정렬
  -> AR은 추천 기준이 아니라 추천 메이크업 프리뷰 기능으로 사용
```

따라서 현재 `AR 필터 기반 추천제품` section/API는 호환성을 위해 유지하며, 리포트 데이터 계약과 품질 기준이 확정된 다음 별도 migration으로 교체한다.
