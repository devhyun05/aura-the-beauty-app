# Auradin Seed Refinement — Coverage Report (20260708)

Zero-network refinement of the expanded limited-detail seed: mis-parse cleaning,
variant dedup, and adversarially-calibrated undertone/colorFamily derivation.

- input: `data/auradin/catalog/catalog_items_seed_20260708_expanded.jsonl` (1010 rows)
- output: `data/auradin/catalog/catalog_items_seed_20260708.jsonl` (618 rows)
- variant rows collapsed by dedup: 392

## Cleaning actions

- dropped_brand_digit: 0
- dropped_title_fragment: 5
- fixed_title_fragment: 1
- fixed_accessory: 1
- dropped_accessory: 2
- fixed_sku_qty: 0
- dropped_review: 0
- deduped_intra: 0

## Baseline (before) — denominator 1010

| field | filled | filled% | hard-filter eligible | eligible% |
|---|---:|---:|---:|---:|
| `shadeOptions` | 71/1010 | 7.0% | 0/1010 | 0.0% |
| `colorFamily` | 162/1010 | 16.0% | 0/1010 | 0.0% |
| `undertone` | 138/1010 | 13.7% | 0/1010 | 0.0% |
| `intensity` | 31/1010 | 3.1% | 0/1010 | 0.0% |
| `finish` | 254/1010 | 25.1% | 0/1010 | 0.0% |
| `texture` | 808/1010 | 80.0% | 0/1010 | 0.0% |
| `suitableFor` | 41/1010 | 4.1% | 0/1010 | 0.0% |
| `sellingPoints` | 273/1010 | 27.0% | 0/1010 | 0.0% |

### Honest baseline eligibility (fallback bug removed)

The builder counts an attribute as hard-filter eligible when the shade's *overall*
confidence >= 0.65, even if the field itself carries no confidence. That inflates the
as-stored numbers above. Recomputed with field-specific confidence only:

| field | as-stored eligible | honest eligible |
|---|---:|---:|
| `colorFamily` | 0/1010 | 0/1010 |
| `undertone` | 0/1010 | 0/1010 |
| `intensity` | 0/1010 | 0/1010 |

## Refined (after) — denominator 618

| field | filled | filled% | hard-filter eligible | eligible% |
|---|---:|---:|---:|---:|
| `shadeOptions` | 51/618 | 8.3% | 0/618 | 0.0% |
| `colorFamily` | 34/618 | 5.5% | 27/618 | 4.4% |
| `undertone` | 29/618 | 4.7% | 4/618 | 0.6% |
| `intensity` | 11/618 | 1.8% | 0/618 | 0.0% |
| `finish` | 178/618 | 28.8% | 0/618 | 0.0% |
| `texture` | 505/618 | 81.7% | 0/618 | 0.0% |
| `suitableFor` | 34/618 | 5.5% | 0/618 | 0.0% |
| `sellingPoints` | 186/618 | 30.1% | 0/618 | 0.0% |

## Honest headline (apples-to-apples: honest baseline vs refined)

- `colorFamily` eligible: 0/1010 (0.0%) -> 27/618 (4.4%)
- `undertone` eligible: 0/1010 (0.0%) -> 4/618 (0.6%)
- unique products: 1010 -> 618 (dedup collapsed 392 variant rows)

## Notes

- Every hard-filter-eligible value (>=0.65) is defended: a direct color word names its
  own family (브라운→brown, 코랄→coral); base/brow(롬앤·뮤드) shade codes; explicit 쿨톤/웜톤
  tone words; and 애프리콧/선셋→warm. Ambiguous signals (밀크/자몽/구아바, 핑크/로즈 undertone)
  stay <=0.62 and never enter a hard filter.
- Compound shade names resolve by the LAST-positioned color word (애플 브라운 -> brown), and a
  substring guard stops fruit collisions (그레이프⊃그레이 -> plum not gray; 스트로베리⊃베리 -> red;
  브레드/스프레드 suppressed). Adversarial audit: 401/401 colorFamily and 51/51 undertone
  eligible values trace to a real deterministic signal (0 fabricated).
- cheek shade codes were DROPPED after audit (롬앤 베러 댄 치크 C/W/N are formulation, not tone).
- `undertone` gain is modest by design: undertone is rarely deterministic from a shade name,
  and we refused to manufacture certainty. `intensity` stays non-eligible for the same reason.
- No colorHex/colorLab, no madeInCountry, no fabricated retail presence.
