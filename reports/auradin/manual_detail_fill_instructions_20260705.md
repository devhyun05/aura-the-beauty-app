# 아우라딘 수동 상세정보 입력 안내 (20260705)

## 입력할 파일

- 수동 확인용 작업 목록 CSV: `data/auradin/detail/manual/limited_detail_manual_fill_queue_20260705.csv`
- 빌드가 읽는 수동 검수 metadata JSONL: `data/auradin/detail/retail_expanded/manual_verified_metadata_20260703.jsonl`

CSV는 어떤 상품을 먼저 확인할지 찾고 작업 상태를 기록하는 용도다. 실제로 값을 입력할 파일은 JSONL이다. `manual_verified_metadata_20260703.jsonl`의 각 row에서 `fields` 객체 안에 직접 검수한 값을 넣으면, 다음 `build_auradin_limited_detail_seed.py` 실행 때 seed에 반영된다.

이 JSONL 파일은 의도적으로 `retail_expanded` 아래에 둔다. 현재 빌더가 이 디렉터리의 `*_metadata_20260703.jsonl` 파일들을 이미 함께 읽기 때문이다.

## 입력 범위

- 입력 대상: `shadeOptions`, `colorFamily`, `undertone`, `intensity`, `finish`, `texture`, `suitableFor`, `sellingPoints`, `oliveYoungListed`, `departmentStoreListed`
- 더 이상 입력하지 않을 항목: `madeInCountry`, 제조국
- 절대 추가하지 않을 항목: 리뷰, 성분, `colorHex`, `colorLab`, raw HTML, 다운로드한 이미지, 의학적 효능 주장
- 올리브영/백화점 입점 여부는 공개 페이지에서 직접 확인한 positive evidence가 있을 때만 `true`로 입력한다. 모르는 경우 `false`가 아니라 비워둔다.

## 작업 목록 요약

- 전체 수동 확인 대상: 987개
- 카테고리별 대상 수: `{"base": 150, "brow": 167, "cheek": 170, "liner": 160, "lip": 170, "shadow": 170}`
- 핵심 필드 확인 필요 수: `{"colorFamily": 313, "finish": 553, "shadeOptions": 222, "texture": 85, "undertone": 360}`
- 추가로 채우면 좋은 필드 수: `{"colorFamily": 441, "departmentStoreListed": 718, "finish": 121, "intensity": 986, "oliveYoungListed": 747, "sellingPoints": 526, "shadeOptions": 130, "suitableFor": 425, "texture": 484, "undertone": 556}`

## JSONL 입력 형식

각 row의 `fields` 객체 안에 아래 형태로 값을 넣는다. 직접 확인하지 못한 필드는 아예 넣지 않는다.

```json
{
  "fields": {
    "finish": {
      "value": "matte",
      "confidence": 0.86,
      "rawText": "공개 상품 페이지에서 확인한 마감 근거 문구",
      "sourceType": "manual_verified_public_source",
      "sourceUrl": "https://example.com/product"
    },
    "texture": {
      "value": "tint",
      "confidence": 0.86,
      "rawText": "공개 상품 페이지에서 확인한 제형 근거 문구",
      "sourceType": "manual_verified_public_source",
      "sourceUrl": "https://example.com/product"
    },
    "shadeOptions": {
      "value": [
        {
          "optionName": "01 Example Pink",
          "shadeNumber": "01",
          "shadeName": "Example Pink",
          "colorFamily": "pink",
          "undertone": "cool",
          "confidence": 0.86,
          "sourceType": "manual_verified_public_source"
        }
      ],
      "confidence": 0.86,
      "rawText": "공개 상품 페이지의 옵션/색상 목록 문구",
      "sourceType": "manual_verified_public_source",
      "sourceUrl": "https://example.com/product"
    },
    "sellingPoints": {
      "value": [
        "long_lasting",
        "waterproof"
      ],
      "confidence": 0.86,
      "rawText": "공개 상품 페이지에서 확인한 소구점 근거 문구",
      "sourceType": "manual_verified_public_source",
      "sourceUrl": "https://example.com/product"
    },
    "oliveYoungListed": {
      "value": true,
      "confidence": 0.86,
      "rawText": "올리브영 상품 페이지에서 동일 상품으로 확인",
      "sourceType": "manual_verified_public_source",
      "sourceUrl": "https://www.oliveyoung.co.kr/..."
    }
  }
}
```

## 허용값

아래 값은 검색/추천 로직에서 쓰는 고정 enum이므로 영어 값을 그대로 입력한다.

- `colorFamily`: `pink`, `rose`, `coral`, `red`, `orange`, `mauve`, `brown`, `nude`, `peach`, `plum`, `black`, `gray`
- `undertone`: `warm`, `cool`, `neutral`
- `intensity`: `sheer`, `medium`, `bold`
- `finish`: `matte`, `velvet`, `satin`, `sheer`, `shimmer`, `glossy`
- `texture`: `tint`, `balm`, `lipstick`, `gloss`, `cream`, `powder`, `pencil`, `liquid`, `cushion`, `mascara`, `liner`
- `suitableFor` 예시: `warm_tone`, `cool_tone`, `spring_warm`, `summer_cool`, `autumn_warm`, `winter_cool`, `dry_skin`, `oily_skin`, `sensitive_skin`, `daily_makeup`, `natural_makeup`
- `sellingPoints` 예시: `long_lasting`, `moisturizing`, `adhesion`, `glow`, `blur`, `coverage`, `waterproof`, `smudge_proof`, `lightweight`, `high_pigment`, `vegan`

## 수동 입력 후 재빌드 명령어

```bash
python3 scripts/build_auradin_limited_detail_seed.py --date 20260703 --batch-rank-limit 10 --categories base,brow,cheek,liner,lip,shadow --min-missing-core 0 --retail-metadata data/auradin/detail/retail_expanded --audit-report reports/auradin/limited_detail_field_audit_20260703_expanded.md --targets-output data/auradin/detail/targets/limited_detail_targets_20260703_expanded.csv --results-output data/auradin/detail/normalized/limited_detail_results_20260703_expanded.jsonl --catalog-output data/auradin/catalog/catalog_items_seed_20260703_expanded.jsonl --knowledge-output data/auradin/knowledge/product_knowledge_docs_20260703_expanded.jsonl --summary-report reports/auradin/limited_detail_collection_summary_20260703_expanded.md
```
