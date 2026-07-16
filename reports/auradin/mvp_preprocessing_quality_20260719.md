# Auradin MVP Preprocessing Quality (20260719)

## Outputs

- Catalog MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/.staging/20260719/catalog/catalog_items_mvp_20260719.jsonl`
- Knowledge chunks MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/.staging/20260719/knowledge/product_knowledge_chunks_mvp_20260719.jsonl`
- Seed SHA-256: `23e8e17304339b998e9f6e41f56a9c428127c15666333b1b095d67c01f470563`

## Row Counts

- Seed rows read: 1835
- MVP catalog rows: 1835
- MVP chunk rows: 6788

## Category Counts

| Category | Rows |
|---|---:|
| base | 1320 |
| brow | 96 |
| cheek | 113 |
| liner | 88 |
| lip | 117 |
| shadow | 101 |

## Filled Attribute Counts

| Field | Rows |
|---|---:|
| colorFamily | 232 |
| finish | 500 |
| intensity | 101 |
| sellingPoints | 563 |
| suitableFor | 34 |
| texture | 1208 |
| undertone | 103 |

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
| colorFamily | 222 |
| finish | 300 |
| intensity | 80 |
| sellingPoints | 579 |
| texture | 542 |
| undertone | 83 |

## Quality Flags

| Flag | Rows |
|---|---:|
| bonus_tool_copy | 98 |
| bundle_or_set_copy | 180 |
| case_copy | 11 |
| mini_or_sample_copy | 84 |
| refill_copy | 307 |

## Safety Notes

- `imageUrl`, `purchaseUrl`, and `priceKrw` are required before a row is promoted into the MVP catalog.
- Title residual keywords are retained as `title_residual_rule_inferred` evidence and are not promoted to hard filters.
- Unknown retail presence remains unknown. It is not converted into a negative listing claim.
- Serving categories are `lip`, `cheek`, `shadow`, `base`, `brow`, and `liner`.
- Low-confidence color, undertone, intensity, and suitable-for values should be used as soft preferences or display-only evidence.
