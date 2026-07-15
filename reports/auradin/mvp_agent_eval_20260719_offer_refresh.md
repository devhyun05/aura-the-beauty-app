# Auradin MVP Agent Golden Eval (20260719)

## Summary

- appCommitSha: `dcdfe19d1114c57c6a3517f3ec2607f50ca094f4`
- workingTreeDirty: `true`
- Snapshot source: `manifest_override`
- Snapshot manifest: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/manifests/snapshot_20260719.json`
- Snapshot manifest SHA-256: `62a8d91505fa2d05ad7bffc0485f1641a8f8800feeecc94394412610ba86a64e`
- Catalog: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260719.jsonl` (`9ea7ac913e961f3a4ba6fe7e390e72901f762d143d52106f48e69d61aee97c47`)
- Chunks: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_chunks_mvp_20260719.jsonl` (`a3297389fd45fde90a271aef3f249a18c0efeff1eefe4528b2949b839636b597`)
- Vector: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260719.json` (`5d7a5ee9322376b64d70d3119dbfe9a1215b1bb8c14077ec72f5d0a123e84692`)
- Score weights v2: `false`

| Prompt | Status | First phase | First question | Final phase | Questions | Products/Error |
|---|---|---|---|---|---:|---|
| 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하 | PASS | question | channel | results | 2 | 3 products |
| 데일리로 쓸 만한 제품 추천해줘 | PASS | question | category | results | 3 | 3 products |
| 올리브영에서 살 수 있는 데일리 립 | PASS | question | priceTier | results | 3 | 3 products |
| 면접용 자연스러운 블러셔, 너무 붉지 않게 | PASS | results | None | results | 0 | 3 products |
| 글리터 강한 아이섀도우 말고 은은한 쉬머 | PASS | question | priceTier | results | 3 | 3 products |
| 브로우 추천해줘 | PASS | question | priceTier | results | 3 | 3 products |

## Candidate Count Logs

### 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하
- step=1 before=74 after=74 attribute=channel type=hard
- step=2 before=74 after=71 attribute=texture type=hard
- step=3 before=71 after=None attribute=None type=None

### 데일리로 쓸 만한 제품 추천해줘
- step=1 before=1355 after=106 attribute=category type=hard
- step=2 before=106 after=52 attribute=priceTier type=hard
- step=3 before=52 after=43 attribute=finish type=hard
- step=4 before=43 after=None attribute=None type=None

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
- step=1 before=91 after=60 attribute=priceTier type=hard
- step=2 before=60 after=60 attribute=channel type=hard
- step=3 before=60 after=60 attribute=texture type=soft
- step=4 before=60 after=None attribute=None type=None
