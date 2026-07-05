# Auradin Seed Refinement — Coverage Report (20260706)

Zero-network refinement of the expanded limited-detail seed: mis-parse cleaning,
variant dedup, and adversarially-calibrated undertone/colorFamily derivation.

- input: `data/auradin/catalog/catalog_items_seed_20260703_expanded.jsonl` (1020 rows)
- output: `data/auradin/catalog/catalog_items_seed_20260706.jsonl` (624 rows)
- variant rows collapsed by dedup: 396

## Cleaning actions

- dropped_brand_digit: 9
- dropped_title_fragment: 12
- fixed_title_fragment: 44
- fixed_accessory: 7
- dropped_accessory: 1
- fixed_sku_qty: 79
- dropped_review: 8
- deduped_intra: 6

## Baseline (before) — denominator 1020

| field | filled | filled% | hard-filter eligible | eligible% |
|---|---:|---:|---:|---:|
| `shadeOptions` | 802/1020 | 78.6% | 662/1020 | 64.9% |
| `colorFamily` | 712/1020 | 69.8% | 251/1020 | 24.6% |
| `undertone` | 665/1020 | 65.2% | 82/1020 | 8.0% |
| `intensity` | 441/1020 | 43.2% | 1/1020 | 0.1% |
| `finish` | 469/1020 | 46.0% | 331/1020 | 32.5% |
| `texture` | 936/1020 | 91.8% | 439/1020 | 43.0% |
| `suitableFor` | 588/1020 | 57.6% | 170/1020 | 16.7% |
| `sellingPoints` | 482/1020 | 47.3% | 284/1020 | 27.8% |

### Honest baseline eligibility (fallback bug removed)

The builder counts an attribute as hard-filter eligible when the shade's *overall*
confidence >= 0.65, even if the field itself carries no confidence. That inflates the
as-stored numbers above. Recomputed with field-specific confidence only:

| field | as-stored eligible | honest eligible |
|---|---:|---:|
| `colorFamily` | 251/1020 | 0/1020 |
| `undertone` | 82/1020 | 32/1020 |
| `intensity` | 1/1020 | 0/1020 |

## Refined (after) — denominator 624

| field | filled | filled% | hard-filter eligible | eligible% |
|---|---:|---:|---:|---:|
| `shadeOptions` | 513/624 | 82.2% | 457/624 | 73.2% |
| `colorFamily` | 440/624 | 70.5% | 401/624 | 64.3% |
| `undertone` | 404/624 | 64.7% | 51/624 | 8.2% |
| `intensity` | 207/624 | 33.2% | 0/624 | 0.0% |
| `finish` | 310/624 | 49.7% | 231/624 | 37.0% |
| `texture` | 582/624 | 93.3% | 304/624 | 48.7% |
| `suitableFor` | 388/624 | 62.2% | 117/624 | 18.8% |
| `sellingPoints` | 333/624 | 53.4% | 195/624 | 31.2% |

## Honest headline (apples-to-apples: honest baseline vs refined)

- `colorFamily` eligible: 0/1020 (0.0%) -> 401/624 (64.3%)
- `undertone` eligible: 32/1020 (3.1%) -> 51/624 (8.2%)
- unique products: 1020 -> 624 (dedup collapsed 396 variant rows)

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
