# Auradin Data Collection — Final Summary (2026-07-06)

Two parallel workstreams, both delivered. Honest, adversarially-audited numbers.

## Branch A — search agent now serves the refined data

- Lineage: `catalog_items_seed_20260703_expanded.jsonl` (1020 rows, variant-inflated)
  → **refine** (`scripts/refine_auradin_seed_derivation.py`) → 624 unique products
  → **enrich** (`scripts/merge_official_into_seed.py`) → `catalog_items_seed_20260706.jsonl`
  → MVP preprocessing (337 lip/cheek/shadow) → knowledge chunks (1665) → vector index.
- `catalog_loader.RUN_DATE` is now `AURADIN_RUN_DATE`-overridable, default `20260706`.
- Golden agent eval: 5/5 supported prompts return 6 purchasable products; brow is an
  expected `unsupported_category`. Backend suite: 28 passed.

## Branch B — official-mall enrichment crawl

- Target list: 242 undertone-gap products with a known official/smartstore URL
  (`data/auradin/detail/targets/undertone_gap_targets_20260706.jsonl`).
- Ran the proven official collector for 10 content-serving brands (blocked brands
  네이밍/라카/롬앤/뮤드/하트퍼센트 and JS-only smartstore excluded, recorded not bypassed).
  Yield: 120 rows, 81 partial; 97 matched seed rows; 608 shade options unioned.
- Merged with the same calibrated derivation — official values only become
  hard-filter eligible if the collector rated them >= 0.65.

## Coverage — honest baseline → final (624 unique products)

| field | honest baseline* | refined (no crawl) | final (enriched) |
|---|---:|---:|---:|
| `colorFamily` | 0.0% | 64.3% | **64.3%** |
| `undertone` | 3.1% | 8.2% | **9.6%** (60/624) |
| `finish` | — | 37.0% | **38.9%** |
| `texture` | — | 43.8% | **50.3%** |
| `sellingPoints` | — | 31.2% | **33.2%** |
| `suitableFor` | — | 18.8% | **19.2%** |
| `intensity` | 0.0% | 0.0% | **0.0%** |

\* honest baseline = the 20260703 seed's eligibility recomputed WITHOUT the builder's
confidence-fallback bug, which had inflated colorFamily to a fake 24.6% and undertone
to a fake 8.0%. See `seed_refinement_coverage_20260706.md`.

## Integrity

- Adversarial audit of the final seed: **401/401 colorFamily and 60/60 undertone
  hard-filter values trace to a real deterministic signal — 0 fabricated.**
- `intensity` is intentionally never eligible: 딥/라이트/미디엄 is not deterministic
  from a shade name, and no source reliably provided it. This is honesty, not a gap
  we can close by guessing.
- `undertone` is the hard ceiling: personal-color (웜톤/쿨톤) guidance lives in product
  description IMAGES and behind JS/anti-bot, so it is not text-extractable at scale.
  The crawl added the 9 cases where a brand page stated it deterministically.
- Policy: no colorHex/colorLab, no NEW madeInCountry (pre-existing 425 evidence rows
  from an earlier batch are untouched, not re-collected), no fabricated presence,
  challenges recorded as blocked, never bypassed.

## What did NOT work (and why we stopped)

- OliveYoung: fully anti-bot blocked end-to-end (kept as presence evidence only).
- Smartstore product pages (103 targets): JS-rendered shell over plain HTTP; the
  internal API is gated. Not pursued — low yield for the effort.
- 5 brands block plain HTTP on their official malls.
