# Auradin MVP Preprocessing Quality (20260717)

## Outputs

- Catalog MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/.staging/20260717/catalog/catalog_items_mvp_20260717.jsonl`
- Knowledge chunks MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/.staging/20260717/knowledge/product_knowledge_chunks_mvp_20260717.jsonl`
- Seed SHA-256: `e3829b1ff739721eba41e59e297f2b7d64282989bcd665fabe9a5a0c046eaed9`

## Row Counts

- Seed rows read: 618
- MVP catalog rows: 618
- MVP chunk rows: 2452

## Category Counts

| Category | Rows |
|---|---:|
| base | 103 |
| brow | 96 |
| cheek | 113 |
| liner | 88 |
| lip | 117 |
| shadow | 101 |

## Filled Attribute Counts

| Field | Rows |
|---|---:|
| colorFamily | 108 |
| finish | 236 |
| intensity | 32 |
| sellingPoints | 228 |
| suitableFor | 34 |
| texture | 552 |
| undertone | 44 |

## Hard-Filter Eligible Counts

| Field | Rows |
|---|---:|
| colorFamily | 64 |
| finish | 83 |
| texture | 344 |
| undertone | 7 |

## Title Residual Keyword Counts

| Field | Inferred keywords |
|---|---:|
| colorFamily | 92 |
| finish | 176 |
| intensity | 14 |
| sellingPoints | 202 |
| texture | 310 |
| undertone | 24 |

## Quality Flags

| Flag | Rows |
|---|---:|
| bonus_tool_copy | 35 |
| bundle_or_set_copy | 49 |
| mini_or_sample_copy | 25 |
| refill_copy | 44 |

## Safety Notes

- `imageUrl`, `purchaseUrl`, and `priceKrw` are required before a row is promoted into the MVP catalog.
- Title residual keywords are retained as `title_residual_rule_inferred` evidence and are not promoted to hard filters.
- Unknown retail presence remains unknown. It is not converted into a negative listing claim.
- Serving categories are `lip`, `cheek`, `shadow`, `base`, `brow`, and `liner`.
- Low-confidence color, undertone, intensity, and suitable-for values should be used as soft preferences or display-only evidence.
