# Auradin MVP Preprocessing Quality (20260703)

## Outputs

- Catalog MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/catalog/catalog_items_mvp_20260706.jsonl`
- Knowledge chunks MVP: `/Users/wiseungcheol/Desktop/AURA-cosmetic-search-engine/data/auradin/knowledge/product_knowledge_chunks_mvp_20260706.jsonl`

## Row Counts

- Seed rows read: 624
- MVP catalog rows: 337
- MVP chunk rows: 1665

## Category Counts

| Category | Rows |
|---|---:|
| cheek | 114 |
| lip | 119 |
| shadow | 104 |

## Filled Attribute Counts

| Field | Rows |
|---|---:|
| colorFamily | 278 |
| finish | 260 |
| intensity | 91 |
| sellingPoints | 235 |
| suitableFor | 267 |
| texture | 331 |
| undertone | 260 |

## Hard-Filter Eligible Counts

| Field | Rows |
|---|---:|
| colorFamily | 238 |
| finish | 216 |
| texture | 238 |
| undertone | 36 |

## Title Residual Keyword Counts

| Field | Inferred keywords |
|---|---:|
| colorFamily | 49 |
| finish | 162 |
| intensity | 7 |
| sellingPoints | 163 |
| texture | 226 |
| undertone | 33 |

## Quality Flags

| Flag | Rows |
|---|---:|
| bonus_tool_copy | 19 |
| bundle_or_set_copy | 17 |
| mini_or_sample_copy | 15 |

## Safety Notes

- `imageUrl`, `purchaseUrl`, and `priceKrw` are required before a row is promoted into the MVP catalog.
- Title residual keywords are retained as `title_residual_rule_inferred` evidence and are not promoted to hard filters.
- Unknown retail presence remains unknown. It is not converted into a negative listing claim.
- `lip`, `cheek`, and `shadow` are the current supported result categories. Brow/base/liner prompts should use an honest fallback.
- Low-confidence color, undertone, intensity, and suitable-for values should be used as soft preferences or display-only evidence.
