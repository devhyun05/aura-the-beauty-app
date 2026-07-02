# Auradin Tooling Preflight (2026-07-02 KST)

## Scope

- Phase 0 only: no broad crawling, no product detail page crawling, no raw HTML/review/image storage.
- Read first: `AGENTS.md`, `AURADIN_PRODUCT_CATALOG_CRAWLING_PLAN_KO.md`, `docs/mobile/FRONTEND_WORK_GUIDE.md`, `docs/spec.md`, `docs/plan.md`.
- Existing recommendation paths were verified without changing mobile UI code.

## Repo Status

- Branch: `aura-cosmetic-search-engine...origin/dev`
- Pre-existing untracked planning/context files remain untouched:
  - `AURADIN_PRODUCT_CATALOG_CRAWLING_PLAN_KO.md`
  - `AURADIN_SEARCH_AGENT_BUILD_PLAN.md`
  - `docs/architecture/COSMETIC_RECOMMENDATION_AGENT_CONTEXT_KO.md`

## Existing Recommendation Paths

- Backend product recommendation entrypoint:
  - `services/backend/app/api/products.py`
  - `services/backend/app/services/shopping_products.py`
- Current backend flow:
  - Naver Shopping API candidate fetch when `NAVER_SHOPPING_CLIENT_ID` and `NAVER_SHOPPING_CLIENT_SECRET` are configured.
  - DB fallback through `products.product_payload`.
  - Rule scoring plus optional Bedrock semantic scoring.
- Mobile product recommendation entrypoint:
  - `apps/mobile/src/features/recommendation/services/productRecommendationService.ts`
  - `apps/mobile/src/features/recommendation/types.ts`
- Auradin mobile draft flow:
  - `apps/mobile/src/features/recommendation/services/auradinService.ts`
  - `apps/mobile/src/features/recommendation/mocks/auradin.mock.ts`

## Tool Inventory

Command: `codex mcp list`

- `fetch`: enabled after Phase 0 setup.
  - Command: `python3 -m mcp_server_fetch --user-agent=AURA-AuradinCatalogBot/0.1`
  - Smoke: `python3 -m mcp_server_fetch --help` passed.
  - Source checked: official Fetch MCP server README, https://github.com/modelcontextprotocol/servers/tree/main/src/fetch
- `playwright`: enabled.
  - Command: `npx @playwright/mcp@latest`
  - Smoke: `npx @playwright/mcp@latest --help` passed after network approval.
- Data Analytics plugin: available in-session.
  - Smoke: `validate_artifact` passed for fixture JSONL/CSV quality payload.
- OpenAI structured extraction: skipped.
  - `OPENAI_API_KEY` is not configured in the current shell.
  - Do not run OpenAI extraction until a key is configured through the safe key setup path.
- PostgreSQL MCP: not installed/used.
  - Deferred until DB import or migration begins.

## Credential Check

- `NAVER_SHOPPING_CLIENT_ID`: missing.
- `NAVER_SHOPPING_CLIENT_SECRET`: missing.
- `OPENAI_API_KEY`: missing.

No live Naver API collection or OpenAI extraction was attempted.

## Phase 0 Outputs

Fixture command:

```sh
python3 scripts/run_auradin_fixture_pipeline.py --date 20260702
```

Generated outputs:

- `data/auradin/raw/naver_candidates_20260702.jsonl`
  - 7 raw fixture API rows.
- `data/auradin/processed/product_candidates_20260702.jsonl`
  - 4 accepted, deduped, ranked candidates.
- `data/auradin/processed/enrichment_queue_20260702.jsonl`
  - 4 enrichment queue rows.
- `reports/auradin/fixture_quality_20260702.csv`
  - Candidate and queue quality checks passed.
- `reports/auradin/naver_collection_summary_20260702.md`
- `reports/auradin/enrichment_queue_summary_20260702.md`

Fixture reject reasons:

- `brand_not_whitelisted`: 1
- `non_cosmetic_noise`: 1

Safety checks:

- No external crawl performed.
- No raw HTML stored.
- No raw reviews stored.
- No original product images stored; image URLs only.
- Candidate and queue rows include source URL, fetched timestamp, evidence, confidence, and parser version where applicable.

## Verification

Passed:

```sh
/opt/miniconda3/bin/python -m pytest \
  tests/test_auradin_candidate_normalizer.py \
  tests/test_auradin_fixture_pipeline.py \
  tests/test_auradin_naver_collect.py \
  -q
```

Result: `6 passed, 1 warning`.

Also passed:

```sh
python3 scripts/run_auradin_naver_collection.py --dry-run --max-queries 5
```

Expected: prints the first Naver query plan without calling the API.

Blocked by missing app dependencies in the current Python environment:

```sh
/opt/miniconda3/bin/python -m pytest tests/test_route_contract.py tests/test_products_api.py -q
```

Result: failed during collection because `fastapi` is not installed in the active Python environment.

## Next Runnable Step

After Naver keys are configured, run a small Naver API candidate collection first:

```sh
NAVER_SHOPPING_CLIENT_ID="<client-id>" \
NAVER_SHOPPING_CLIENT_SECRET="<client-secret>" \
python3 scripts/run_auradin_naver_collection.py \
  --date 20260702 \
  --categories lip \
  --max-queries 12 \
  --display 100 \
  --request-delay-seconds 1
```

Expected outputs:

- `data/auradin/raw/naver_candidates_20260702.jsonl`
- `data/auradin/processed/product_candidates_20260702.jsonl`
- `data/auradin/processed/enrichment_queue_20260702.jsonl`
- `reports/auradin/naver_collection_summary_20260702.md`
- `reports/auradin/enrichment_queue_summary_20260702.md`
- `reports/auradin/fixture_quality_20260702.csv`

Do not begin official mall, Olive Young, or Naver detail crawling until:

- Fetch MCP is callable in the active Codex session and tested on a permitted `robots.txt` or terms URL.
- Playwright MCP is callable in the active Codex session and tested on one permitted JS-rendered public page.
- The target domain's robots/terms status is recorded in the next preflight or crawl report.
