# Auradin Brand x Category Top10 Product Snapshot

- Queue input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/processed/enrichment_queue_brand_category_top10_20260702.jsonl`
- Phase C input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/enriched/enriched_products_brand_category_top10_20260702.jsonl`
- Phase D input: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/detail/normalized/detail_collection_results_20260702_brand_category_top10.jsonl`
- Snapshot JSONL: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/brand_category_top10_products_20260702.jsonl`
- Snapshot CSV: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/brand_category_top10_products_20260702.csv`
- Embedding docs: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/embeddings/brand_category_top10_product_documents_20260702.jsonl`
- Snapshot rows: 1020
- Embedding docs: 1273
- Data completeness: `{"blocked_detail_fetch": 737, "complete_detail": 45, "failed_detail_fetch": 192, "partial_detail": 46}`
- Phase C status: `{"blocked": 737, "manual_review_required": 283}`
- Detail collection status: `{"collected_complete": 45, "collected_partial": 46, "failed": 192, "not_attempted": 737}`
- Category counts: `{"base": 170, "brow": 170, "cheek": 170, "liner": 170, "lip": 170, "shadow": 170}`
- Brand counts min/max: 60/60
- With finish: 84
- With texture: 209
- With shade options: 46
- With selling points: 84
- With suitable-for tags: 24
- Olive Young listed: 120
- Department-store-related listed: 65

Notes:

- Top10 coverage is complete for every configured brand x category slot.
- Detail fields are filled only when source pages exposed them during permitted collection.
- Blocked or failed detail rows remain in the snapshot with metadata and empty detail fields.
