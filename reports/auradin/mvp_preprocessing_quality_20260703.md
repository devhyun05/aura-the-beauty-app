# Auradin MVP Preprocessing Quality (20260703)

## Outputs

- Catalog MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260703.jsonl`
- Knowledge chunks MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_chunks_mvp_20260703.jsonl`

## Row Counts

- Seed rows read: 501
- MVP catalog rows: 501
- MVP chunk rows: 2261

## Category Counts

| Category | Rows |
|---|---:|
| cheek | 167 |
| lip | 167 |
| shadow | 167 |

## Filled Attribute Counts

| Field | Rows |
|---|---:|
| colorFamily | 238 |
| finish | 320 |
| intensity | 124 |
| sellingPoints | 274 |
| suitableFor | 68 |
| texture | 397 |
| undertone | 227 |

## Hard-Filter Eligible Counts

| Field | Rows |
|---|---:|
| colorFamily | 47 |
| finish | 207 |
| texture | 250 |
| undertone | 6 |

## Title Residual Keyword Counts

| Field | Inferred keywords |
|---|---:|
| colorFamily | 66 |
| finish | 234 |
| intensity | 8 |
| sellingPoints | 230 |
| texture | 326 |
| undertone | 48 |

## Quality Flags

| Flag | Rows |
|---|---:|
| bonus_tool_copy | 34 |
| bundle_or_set_copy | 32 |
| case_copy | 1 |
| mini_or_sample_copy | 24 |

## Safety Notes

- `imageUrl`, `purchaseUrl`, and `priceKrw` are required before a row is promoted into the MVP catalog.
- Title residual keywords are retained as `title_residual_rule_inferred` evidence and are not promoted to hard filters.
- Unknown retail presence remains unknown. It is not converted into a negative listing claim.
- `lip`, `cheek`, and `shadow` are the current supported result categories. Brow/base/liner prompts should use an honest fallback.
- Low-confidence color, undertone, intensity, and suitable-for values should be used as soft preferences or display-only evidence.
