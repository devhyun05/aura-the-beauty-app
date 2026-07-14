# Auradin semantic s_floor calibration (hash)

- Approval: `pending_human_review`
- Snapshot run date: `20260716`
- Manifest: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/manifests/snapshot_20260716.json`
- Vector: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260716.json`
- modelId: `hash-fallback`
- dimension: `1024`
- Retrieval backend(s): `embedding_file_hash`
- Samples: top `10` scores per query

## Proposed separation point

- Suggested s_floor: `0.170342`
- Balanced accuracy: `0.768`
- Golden-proxy recall: `0.536`
- Unrelated rejection: `1.000`
- Status: **human approval pending**; do not activate from this report alone.

## Distribution summary

| Set | Count | Min | P10 | P50 | P90 | Max |
|---|---:|---:|---:|---:|---:|---:|
| Golden top-k proxy | 56 | 0.073809 | 0.099507 | 0.179100 | 0.258787 | 0.373858 |
| Unrelated-query top-k | 41 | 0.070014 | 0.095346 | 0.114708 | 0.156838 | 0.169661 |

## Per-query maxima

| Set | Query | Results | Max | Top-k median |
|---|---|---:|---:|---:|
| golden | 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하 | 55 | 0.194841 | 0.160739 |
| golden | 데일리로 쓸 만한 제품 추천해줘 | 6 | 0.171024 | 0.100000 |
| golden | 올리브영에서 살 수 있는 데일리 립 | 41 | 0.222856 | 0.167607 |
| golden | 면접용 자연스러운 블러셔, 너무 붉지 않게 | 68 | 0.154303 | 0.116753 |
| golden | 글리터 강한 아이섀도우 말고 은은한 쉬머 | 59 | 0.264194 | 0.200427 |
| golden | 브로우 추천해줘 | 47 | 0.373858 | 0.260819 |
| unrelated | 자동차 타이어 교체 시기와 추천 규격 | 41 | 0.159277 | 0.123114 |
| unrelated | 서울에서 부산까지 기차 시간표 | 6 | 0.156838 | 0.121904 |
| unrelated | 파이썬 웹 서버 성능 튜닝 방법 | 2 | 0.110971 | 0.090492 |
| unrelated | 주말 등산용 텐트와 침낭 추천 | 35 | 0.169661 | 0.108705 |
| unrelated | 환율과 금리 전망을 알려줘 | 6 | 0.157248 | 0.136229 |
| unrelated | 반려견 사료 성분을 비교해줘 | 7 | 0.135660 | 0.102062 |

## Interpretation

- Golden top-k is a proxy distribution; item-level relevance still needs human labels.
- Hash results are a diagnostic baseline only. They do not authorize a production floor.
- After the real index is built, rerun this tool with `--backend embedding` and approve the new floor.
