# shopping_products._fetch_naver_products는 raw item이 아니라 매핑된 product를 반환한다

플랜(WS2)은 `_fetch_naver_products` → `normalize_naver_item` 파이프를 가정했지만, 실제로는
`_map_naver_item`이 이미 적용된 **가공된 product**가 나온다 — `productId`/`category1-4`/`maker` 등
`normalize_naver_item`이 요구하는 raw 필드가 사라진 뒤다.

그래서 enrich(2a)는 `enrichment._fetch_raw_naver_items`로 같은 API·파라미터 패턴
(`display/exclude/filter/sort` + 헤더)을 직접 호출해 raw item을 받아
`normalize_naver_item → infer_title_metadata → build_mvp_catalog_item` 파이프를 태운다.
Naver API 형태를 바꿀 일이 있으면 두 곳(`shopping_products`, `enrichment`)을 같이 본다.
