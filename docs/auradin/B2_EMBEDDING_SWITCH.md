# B2 Auradin embedding switch checklist

This runbook prepares the R4 switch from the current hash vector index to a real Bedrock embedding index. It does not authorize activation. The real index build, the new `s_floor`, and the B8 weights all require human approval.

## Current baseline

- The `20260716` candidate snapshot uses `modelId=hash-fallback`, dimension `1024`.
- The hash calibration report is [semantic_floor_calibration_hash_20260717.md](../../reports/auradin/semantic_floor_calibration_hash_20260717.md).
- Its proposed `s_floor=0.170342` is diagnostic only. Do not apply it to a real embedding index.
- `auradin_floor_semantic` remains unchanged until the real-index calibration is reviewed.

## 1. Preflight

1. Select one Bedrock embedding identifier and region for both index building and serving:
   - direct Titan v2 model: `amazon.titan-embed-text-v2:0`; or
   - the approved APAC cross-region inference profile ID/ARN when the deployment account or region requires a profile.
2. Set `BEDROCK_EMBEDDING_MODEL_ID` to that exact identifier and set `BEDROCK_EMBEDDING_REGION` to the Bedrock Runtime region used to invoke it.
3. Configure exactly one credential path: `AWS_PROFILE_NAME`, access key/secret, or `AWS_USE_IAM_ROLE=true`.
4. Confirm `EMBEDDING_DIMENSION=1024` for Titan v2.
5. Keep the hash snapshot active. All commands below operate on a new dated staging directory.

The index metadata `modelId` and the serving value `Settings.effective_embedding_model_id` must be byte-for-byte equal. A profile ID used at build time must also be used at query time; switching between a direct model ID and a profile ID is a model mismatch.

## 2. Build the real index

Run preprocessing first so the dated staging catalog, chunks, seed, and preprocessing sidecar belong to the same run. Then build the vector artifact:

```bash
export RUN_DATE=YYYYMMDD

./.venv/bin/python scripts/build_auradin_vector_index.py \
  --run-date "$RUN_DATE" \
  --backend embedding \
  --catalog-path "data/auradin/.staging/$RUN_DATE/catalog/catalog_items_mvp_$RUN_DATE.jsonl" \
  --chunks-path "data/auradin/.staging/$RUN_DATE/knowledge/product_knowledge_chunks_mvp_$RUN_DATE.jsonl" \
  --output-path "data/auradin/.staging/$RUN_DATE/vector/product_knowledge_vector_index_mvp_$RUN_DATE.json"
```

`--backend embedding` is strict: it aborts when AWS credentials/IAM are unavailable instead of silently writing a hash fallback index. The legacy `--backend bedrock` spelling remains only for compatibility and must not be used for this switch.

Inspect the artifact before preparing a manifest:

```bash
jq '.metadata | {backend, modelId, dimension, chunkCount, runDate}' \
  "data/auradin/.staging/$RUN_DATE/vector/product_knowledge_vector_index_mvp_$RUN_DATE.json"
```

Reject the build if any of these are true:

- `modelId` is `hash-fallback` or `hash-fallback-no-aws`;
- `modelId` differs from `BEDROCK_EMBEDDING_MODEL_ID`;
- the dimension is not the configured dimension;
- vector count differs from chunk count;
- the APAC inference profile cannot be invoked from the configured runtime region;
- Bedrock latency/error metrics were not captured for the build and query probe.

## 3. Prepare, but do not activate

Use the existing immutable snapshot workflow to prepare a candidate manifest. This requires the preprocessing sidecar and seed created for the same staging run:

```bash
./.venv/bin/python scripts/promote_auradin_snapshot.py \
  --prepare-only \
  --run-date "$RUN_DATE" \
  --staging-root "data/auradin/.staging/$RUN_DATE" \
  --seed-path "data/auradin/.staging/$RUN_DATE/catalog/catalog_items_seed_$RUN_DATE.jsonl"
```

Do not run `--activate` yet. Verify the prepared manifest hashes and confirm its `modelId` matches the runtime setting.

## 4. Recalibrate `s_floor`

Run the same golden/unrelated distribution analysis against the prepared real-index manifest:

```bash
./.venv/bin/python scripts/calibrate_auradin_semantic_floor.py \
  --backend embedding \
  --manifest-path "data/auradin/manifests/snapshot_$RUN_DATE.json" \
  --output-prefix "reports/auradin/semantic_floor_calibration_embedding_$RUN_DATE"
```

The tool samples the top 10 product scores for the six `GOLDEN_PROMPTS` and six unrelated queries. It proposes the threshold with the best balanced accuracy, reports related recall and unrelated rejection, and marks the result `pending_human_review`.

Approval requires:

1. item-level spot review around the proposed threshold, including false positives and false negatives;
2. acceptable Korean relevance for every golden prompt;
3. explicit approval of the new `auradin_floor_semantic` value;
4. rerunning the Auradin golden evaluation with `auradin_retrieval_backend=embedding`;
5. Bedrock p50/p95 latency, error rate, and cost evidence;
6. confirmation that report-only preference matches still cannot open the floor.

## 5. Activation gates

Only after the embedding floor and B8 golden baseline are separately approved:

```text
AURADIN_RETRIEVAL_BACKEND=embedding
AURADIN_FLOOR_SEMANTIC=<approved real-index threshold>
AURADIN_SCORE_WEIGHTS_V2=true
BEDROCK_EMBEDDING_MODEL_ID=<exact index modelId or APAC inference profile ID/ARN>
BEDROCK_EMBEDDING_REGION=<verified runtime region>
```

Activate only the approved manifest SHA through `promote_auradin_snapshot.py --activate`. Roll back by restoring the previous active manifest pointer and setting `AURADIN_RETRIEVAL_BACKEND=auto` (or `lexical`) and `AURADIN_SCORE_WEIGHTS_V2=false`.

## Human approvals pending

- Final B8 weight values and the weights-v2 golden baseline.
- Real Titan/APAC embedding build and model/profile selection.
- Real-index `s_floor` after recalibration.
- Production snapshot activation.
