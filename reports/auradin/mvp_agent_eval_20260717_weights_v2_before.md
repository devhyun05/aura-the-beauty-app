# Auradin MVP Agent Golden Eval (20260716)

## Summary

- appCommitSha: `3ef9699c3260053ecbbe239ef1b1b89233d4260d`
- workingTreeDirty: `true`
- Snapshot source: `manifest_override`
- Snapshot manifest: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/manifests/snapshot_20260716.json`
- Snapshot manifest SHA-256: `928fdef244c66038ae3e0f284d15bbecf2133e8b5653b55ce77e5f44c6ac7823`
- Catalog: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260716.jsonl` (`d8b326b399f57d0e223d2e3a34a7549a851985138b881adfc8ae4e9d11aa4b52`)
- Chunks: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_chunks_mvp_20260716.jsonl` (`867cf1306717c46137588ee8b3e41d1291a587576e53cac27741badfcb555dbe`)
- Vector: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260716.json` (`593f97eae2162ca6caec85064771511487c7f5e3218a4f38d5332de00018529b`)
- Score weights v2: `false`

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
- step=1 before=75 after=75 attribute=channel type=hard
- step=2 before=75 after=None attribute=None type=None

### 데일리로 쓸 만한 제품 추천해줘
- step=1 before=518 after=106 attribute=category type=hard
- step=2 before=106 after=51 attribute=priceTier type=hard
- step=3 before=51 after=51 attribute=channel type=hard
- step=4 before=51 after=None attribute=None type=None

### 올리브영에서 살 수 있는 데일리 립
- step=1 before=23 after=14 attribute=priceTier type=hard
- step=2 before=14 after=12 attribute=texture type=hard
- step=3 before=12 after=11 attribute=finish type=hard
- step=4 before=11 after=None attribute=None type=None

### 면접용 자연스러운 블러셔, 너무 붉지 않게
- step=1 before=105 after=None attribute=None type=None

### 글리터 강한 아이섀도우 말고 은은한 쉬머
- step=1 before=89 after=31 attribute=priceTier type=hard
- step=2 before=31 after=31 attribute=channel type=hard
- step=3 before=31 after=31 attribute=texture type=soft
- step=4 before=31 after=None attribute=None type=None

### 브로우 추천해줘
- step=1 before=91 after=59 attribute=priceTier type=hard
- step=2 before=59 after=59 attribute=channel type=hard
- step=3 before=59 after=59 attribute=texture type=soft
- step=4 before=59 after=None attribute=None type=None
