# Makeup Scenario Library Retention Design

## Goal

Keep AI makeup scenario discovery personal and continuously refreshable without allowing the shared PostgreSQL scenario library or Bedrock request cost to grow without bounds.

## Chosen policy

- Keep at most 2,000 total AI-generated scenario rows in the shared library, including disabled moderation records. Curated rows are a separately managed fixed set.
- Continue generating fresh cards for every successful refresh request. The limit applies to persistence, not to what the requesting user may see.
- While the library is below the limit, persist safe, distinct generated cards normally.
- At the limit, replace only an active AI card that is both old and among the least used. Curated cards and disabled moderation records are never replacement candidates.
- A generated card that cannot be persisted because no safe replacement is available is still returned to the requesting user with an ephemeral stable ID.
- Limit scenario-generation requests per authenticated user to 3 requests per rolling minute. This is a short abuse/cost control, not a lifetime personalization quota.

## Selection and replacement

Shared selection continues to favor active, underexposed cards. Replacement uses a deterministic database transaction:

1. Take a transaction-scoped advisory lock for library capacity changes.
2. Count all AI rows, including disabled rows.
3. If below 2,000, insert with the existing normalized-text uniqueness constraint.
4. Otherwise select one active AI replacement candidate ordered by `usage_count ASC, last_served_at ASC NULLS FIRST, created_at ASC` and lock it with `FOR UPDATE SKIP LOCKED`.
5. Replace the candidate only when it has not been served in the last seven days. If every card is recent, skip persistence and return the generated card only to the current request.

This avoids concurrent requests exceeding the cap and prevents a recently useful card from being immediately displaced.

## Data changes

Add nullable `last_served_at` to `makeup_scenario_library`. Set it whenever a stored card is returned. Keep disabled rows for moderation/audit purposes; they count toward the 2,000-row AI cap and are never overwritten.

The runtime schema, canonical SQL, DBML, and schema checker must stay aligned.

## Rate limiting

Use the backend's existing authenticated rate-limit mechanism with a scenario-generation-specific key and a 3-per-60-second policy. A rejected request returns HTTP 429 in the normal error envelope and does not invoke Bedrock.

## Failure behavior

- A duplicate generated phrase increments/uses its existing active row and does not consume capacity.
- A disabled duplicate is not reactivated or returned globally.
- A capacity/DB write failure does not discard an otherwise safe generated response; it is returned with an ephemeral ID and logged.
- Bedrock failure keeps the current mobile curated fallback behavior.

## Verification

- Unit tests prove insert-below-cap, replace-at-cap, no-replace-when-all-recent, disabled/curated preservation, duplicate handling, and concurrent-cap SQL locking.
- Route tests prove the fourth request in 60 seconds is rejected before generation.
- Schema tests cover `last_served_at` and the supporting index.
- Existing makeup recommendation tests and mobile typecheck remain green.
