# Auradin B8/R3 golden before/after

- Snapshot: `20260716` (`snapshot_20260716.json`, hash backend)
- Before: `AURADIN_SCORE_WEIGHTS_V2=false`
- After: `AURADIN_SCORE_WEIGHTS_V2=true`
- Golden contract: before `6/6 PASS`, after `6/6 PASS`
- Approval: **pending human review**. This report is comparison evidence, not baseline approval.
- Both runs recorded `workingTreeDirty=true`; rerun from the final committed SHA before approval signing.

## Summary

- First phase, first question attribute, question count, final phase, and product count were unchanged for all 6 prompts.
- Top-3 set was unchanged for 4/6 prompts.
- 14/18 before products remain in the corresponding after Top-3 sets. The first two prompts replaced 2/3 products each.
- Mean displayed `matchRate` changed from `75.44` to `58.61` (`-16.83`). This is expected because R3 no longer displays the linear ranking score; it uses `0.45×answerScore + 0.40×evidenceScore + 0.15×confirmedEvidence(count capped at 3)`.
- The flag-on output keeps every `matchRate` in the existing integer range and preserves the `{matchedOn, inferred, caveat}` reason contract.

## Product and display-score diff

| Prompt | Before Top-3 matchRate | After Top-3 matchRate | Top-3 set |
|---|---|---|---|
| 쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하 | 하트퍼센트 82 / 라카 72 / 컬러그램 72 | 롬앤 74 / 컬러그램 60 / 클리오 60 | 2/3 replaced |
| 데일리로 쓸 만한 제품 추천해줘 | 롬앤 74 / 투쿨포스쿨 74 / 컬러그램 72 | 투쿨포스쿨 55 / 롬앤 55 / 컬러그램 55 | 2/3 replaced |
| 올리브영에서 살 수 있는 데일리 립 | 투쿨포스쿨 74 / 컬러그램 74 / 컬러그램 72 | 투쿨포스쿨 55 / 컬러그램 55 / 컬러그램 55 | unchanged |
| 면접용 자연스러운 블러셔, 너무 붉지 않게 | 더샘 78 / 웨이크메이크 72 / VDL 72 | 더샘 61 / 웨이크메이크 55 / VDL 55 | unchanged |
| 글리터 강한 아이섀도우 말고 은은한 쉬머 | 더샘 81 / 투쿨포스쿨 80 / 컬러그램 72 | 더샘 62 / 투쿨포스쿨 62 / 컬러그램 55 | unchanged |
| 브로우 추천해줘 | 웨이크메이크 88 / 3CE 75 / 라카 74 | 웨이크메이크 78 / 3CE 55 / 라카 48 | unchanged |

## Evidence files

- Flag off: `reports/auradin/mvp_agent_eval_20260717_weights_v2_before.{md,json}`
- Flag on: `reports/auradin/mvp_agent_eval_20260717_weights_v2.{md,json}`

## Human review focus

1. Approve or reject the two changed Top-3 sets, especially the broad daily prompt.
2. Confirm that the lower, evidence-oriented display-score distribution is acceptable UX.
3. Approve the B8 weights as hypotheses only after spot review; otherwise tune behind the same flag and rerun the full baseline.
