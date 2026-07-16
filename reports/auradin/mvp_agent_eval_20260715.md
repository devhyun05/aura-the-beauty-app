> **status: invalid_never_activate** — 20260715 후보는 결함 판정으로 폐기됨(정본: 20260716). 이 평가 결과로 활성화 금지.

# Auradin MVP Agent Golden Eval (20260715)

## Summary

- Snapshot source: `manifest_override`
- Snapshot manifest: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/manifests/snapshot_20260715.json`
- Snapshot manifest SHA-256: `585a12b3ee287480d0cd28ef1883fa8f69c1e7354cdff7b0abb2ae9356df241a`
- Catalog: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260715.jsonl` (`a1dd144206fd8a03b012afcbe38e6284d912882f5755913d6fcd93bc3afda110`)
- Chunks: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_chunks_mvp_20260715.jsonl` (`4abaf1898a887bf0cdddb3ef22984ecc87ccc32b3d0ba7196287057500828a52`)
- Vector: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260715.json` (`c68ce3d326fc7076cf583ebf8f3a0848e3ebf56ee3d3e9e440a61541501b8bd0`)

| Prompt | Status | First phase | First question | Final phase | Questions | Products/Error |
|---|---|---|---|---|---:|---|
| 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하 | PASS | question | channel | results | 1 | 3 products |
| 데일리로 쓸 만한 제품 추천해줘 | PASS | question | category | results | 3 | 3 products |
| 올리브영에서 살 수 있는 데일리 립 | PASS | question | priceTier | results | 3 | 3 products |
| 면접용 자연스러운 블러셔, 너무 붉지 않게 | PASS | results | None | results | 0 | 3 products |
| 글리터 강한 아이섀도우 말고 은은한 쉬머 | PASS | question | priceTier | results | 3 | 3 products |
| 브로우 추천해줘 | PASS | question | priceTier | results | 3 | 3 products |

## Candidate Count Logs

### 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
- step=1 before=84 after=84 attribute=channel type=hard
- step=2 before=84 after=None attribute=None type=None

### 데일리로 쓸 만한 제품 추천해줘
- step=1 before=618 after=117 attribute=category type=hard
- step=2 before=117 after=58 attribute=priceTier type=hard
- step=3 before=58 after=58 attribute=channel type=hard
- step=4 before=58 after=None attribute=None type=None

### 올리브영에서 살 수 있는 데일리 립
- step=1 before=28 after=18 attribute=priceTier type=hard
- step=2 before=18 after=15 attribute=texture type=hard
- step=3 before=15 after=8 attribute=finish type=hard
- step=4 before=8 after=None attribute=None type=None

### 면접용 자연스러운 블러셔, 너무 붉지 않게
- step=1 before=113 after=None attribute=None type=None

### 글리터 강한 아이섀도우 말고 은은한 쉬머
- step=1 before=101 after=36 attribute=priceTier type=hard
- step=2 before=36 after=36 attribute=channel type=hard
- step=3 before=36 after=36 attribute=texture type=soft
- step=4 before=36 after=None attribute=None type=None

### 브로우 추천해줘
- step=1 before=96 after=61 attribute=priceTier type=hard
- step=2 before=61 after=61 attribute=channel type=hard
- step=3 before=61 after=61 attribute=texture type=soft
- step=4 before=61 after=None attribute=None type=None
