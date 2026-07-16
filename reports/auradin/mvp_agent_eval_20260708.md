# Auradin MVP Agent Golden Eval (20260708)

## Summary

- Snapshot source: `active_pointer`
- Snapshot manifest: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/manifests/snapshot_20260708.json`
- Snapshot manifest SHA-256: `7a08fe6f23f15b3dae370c43d7fdd7e1df04136ebc9e00c7fc155cd103afa7be`
- Catalog: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260708.jsonl` (`81d990c0fca4bdf65f82b3ea7fb3df130eba32341bcb07365eada3ee9dbee73f`)
- Chunks: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_chunks_mvp_20260708.jsonl` (`d8cd174e97646513f25020321944fefd45035a43f462607248c801013f3b3cde`)
- Vector: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/vector/product_knowledge_vector_index_mvp_20260708.json` (`ff8e988e1e8de83bd59c11385b54a63a6de65caa532a85406f5f5d9f50a30930`)

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
