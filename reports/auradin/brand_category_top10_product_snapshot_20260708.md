# Auradin Brand x Category Top10 Product Snapshot

- Queue input: `data/auradin/processed/enrichment_queue_brand_category_top60_20260708.jsonl`
- Phase C input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/enriched/enriched_products_brand_category_top10_20260708.jsonl`
- Phase D input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/detail_collection_results_20260708_brand_category_top10.jsonl`
- Snapshot JSONL: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/brand_category_top10_products_20260708.jsonl`
- Snapshot CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/brand_category_top10_products_20260708.csv`
- Embedding docs: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/embeddings/brand_category_top10_product_documents_20260708.jsonl`
- Snapshot rows: 4554
- Embedding docs: 4554
- Data completeness: `{"metadata_only": 4554}`
- Phase C status: `{"not_staged": 4554}`
- Detail collection status: `{"not_attempted": 4554}`
- Category counts: `{"base": 805, "brow": 649, "cheek": 817, "liner": 584, "lip": 928, "shadow": 771}`
- Brand counts min/max: 116/360
- With finish: 0
- With texture: 0
- With shade options: 0
- With selling points: 0
- With suitable-for tags: 0
- Olive Young listed: 222
- Department-store-related listed: 441

Notes:

- Top10 coverage is complete for every configured brand x category slot.
- Detail fields are filled only when source pages exposed them during permitted collection.
- Blocked or failed detail rows remain in the snapshot with metadata and empty detail fields.
