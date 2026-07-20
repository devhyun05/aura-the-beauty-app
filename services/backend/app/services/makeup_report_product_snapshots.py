"""Persistent, report-bound product recommendation snapshots.

A MakeupRecommendation V2 report is immutable user output. Product matching is
therefore computed once per look and stored as a versioned snapshot instead of
being re-ranked on every screen visit. A user-initiated refresh creates a new
revision; ordinary reads keep returning the latest revision mapped to that
report and look, even when application or catalog versions change.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from typing import Any, Iterable
from uuid import UUID, uuid4

from fastapi import BackgroundTasks

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.makeup_report_product_recommendations import (
  ALGORITHM_VERSION,
  DEFAULT_CATEGORIES,
  _fetch_internal_candidates,
  get_makeup_report_product_recommendations,
  normalize_makeup_report_recommendation,
  resolve_report_look,
)
from app.services.makeup_report_product_discovery import (
  dedupe_lowest_price_product_offers,
  is_verified_report_discovery_item,
)
from app.services.product_catalog import map_catalog_product
from app.services.product_external_catalog import AURADIN_CATALOG_SOURCE  # noqa: F401 - legacy tests import this module attr.


logger = logging.getLogger(__name__)

SNAPSHOT_STRATEGY = "makeup_report_v1"
SNAPSHOT_CONTRACT_VERSION = "makeup-report-product-snapshot-v1"
SNAPSHOT_PER_CATEGORY_LIMIT = 8
PROCESSING_STALE_AFTER = timedelta(minutes=10)
GENERIC_FAILURE_CODE = "MAKEUP_PRODUCT_SNAPSHOT_FAILED"

_RUN_COLUMNS = """
  id,user_id,source_makeup_report_id,source_look_id,recipe_hash,catalog_version,
  strategy,algorithm_version,status,revision,recommendation_payload,product_ids,
  created_at,started_at,completed_at,error_code,expires_at
"""


def _json_object(value: Any) -> dict[str, Any]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return {}
  return value if isinstance(value, dict) else {}


def _json_list(value: Any) -> list[Any]:
  if isinstance(value, str):
    try:
      value = json.loads(value)
    except json.JSONDecodeError:
      return []
  return value if isinstance(value, list) else []


def _clean(value: Any, limit: int = 240) -> str:
  return " ".join(str(value or "").split())[:limit]


def _iso(value: Any) -> str | None:
  if isinstance(value, datetime):
    normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return normalized.isoformat()
  return str(value) if value else None


def _catalog_snapshot_version(settings: Settings) -> str:
  """Return a stable trust-root identifier without loading catalog vectors."""

  try:
    from app.services.auradin_agent.snapshot_manifest import (
      process_snapshot,
      resolve_and_validate_snapshot,
    )

    descriptor = process_snapshot() or resolve_and_validate_snapshot(settings)
    auradin_version = f"{descriptor.run_date}:{descriptor.manifest_sha256[:16]}"
  except Exception:  # noqa: BLE001 - the matcher can still use the licensed catalog.
    logger.warning("[aura:products] makeup-snapshot:catalog-version-unavailable", exc_info=True)
    auradin_version = "unavailable"
  return f"catalog_v2+auradin:{auradin_version}"


def _look_id(look: dict[str, Any]) -> str:
  return _clean(look.get("id") or look.get("role"), 80)


def _recipe_hash(look: dict[str, Any], context_snapshot: Any) -> str:
  context = _json_object(context_snapshot)
  analysis = _json_object(context.get("analysisReport"))
  guides: list[dict[str, Any]] = []
  for raw_guide in _json_list(look.get("areaGuides")):
    if not isinstance(raw_guide, dict):
      continue
    plan = _json_object(raw_guide.get("applicationPlan"))
    steps: list[dict[str, Any]] = []
    for raw_step in _json_list(plan.get("steps")):
      if not isinstance(raw_step, dict):
        continue
      colors = [
        {
          "role": _clean(color.get("role"), 80),
          "name": _clean(color.get("name"), 80),
          "hex": _clean(color.get("hex"), 20),
        }
        for color in _json_list(raw_step.get("colors"))
        if isinstance(color, dict)
      ]
      steps.append({
        "productType": _clean(raw_step.get("productType"), 120),
        "colors": colors,
        "finishCheck": _clean(raw_step.get("finishCheck"), 160),
      })
    guide_color = _json_object(raw_guide.get("color"))
    guides.append({
      "area": _clean(raw_guide.get("area"), 30),
      "color": {
        "name": _clean(guide_color.get("name"), 80),
        "hex": _clean(guide_color.get("hex"), 20),
      },
      "texture": _clean(raw_guide.get("texture"), 100),
      "steps": steps,
    })
  # Only fields consumed by matching belong in the idempotency recipe. Image
  # status/fitAssessment, generated prose, product suggestions and raw user
  # text cannot change this hash or enter the persisted snapshot payload.
  recipe = {
    "contractVersion": SNAPSHOT_CONTRACT_VERSION,
    "guides": guides,
    "analysis": {"skinType": _clean(analysis.get("skinType"), 80)},
  }
  canonical = json.dumps(
    recipe,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
    default=str,
  ).encode("utf-8")
  return hashlib.sha256(canonical).hexdigest()


async def _load_owned_recipe(
  db: Database,
  *,
  user_id: UUID,
  report_id: UUID,
  look_id: str | None,
  all_looks: bool,
) -> tuple[dict[str, Any], list[tuple[str, str]]]:
  report = await db.fetchrow(
    """
    select id,recommendation,context_snapshot,schema_version
    from makeup_recommendation_reports
    where id=$1 and user_id=$2
    """,
    report_id,
    user_id,
  )
  if report is None:
    raise AppError(
      404,
      "MAKEUP_RECOMMENDATION_NOT_FOUND",
      "The makeup recommendation report was not found.",
    )
  if str(report.get("schema_version") or "") != "makeup-recommendation-v2":
    raise AppError(
      409,
      "MAKEUP_RECOMMENDATION_SCHEMA_UNSUPPORTED",
      "Only a V2 makeup recommendation can be matched to products.",
    )

  normalized = normalize_makeup_report_recommendation(report.get("recommendation"))
  selected_looks: list[dict[str, Any]] = []
  if all_looks:
    for candidate in _json_list(normalized.get("looks")):
      if not isinstance(candidate, dict) or not _look_id(candidate):
        continue
      _, selected = resolve_report_look(normalized, _look_id(candidate))
      if selected is not None and _look_id(selected) not in {_look_id(item) for item in selected_looks}:
        selected_looks.append(selected)
  else:
    _, selected = resolve_report_look(normalized, look_id)
    if selected is not None:
      selected_looks.append(selected)

  if not selected_looks:
    raise AppError(
      422,
      "MAKEUP_RECOMMENDATION_LOOK_INVALID",
      "lookId does not belong to this report or its recipe is incomplete.",
    )
  return dict(report), [
    (_look_id(look), _recipe_hash(look, report.get("context_snapshot")))
    for look in selected_looks
  ]


async def _find_latest_look_run(
  db: Database,
  *,
  user_id: UUID,
  report_id: UUID,
  look_id: str,
) -> dict[str, Any] | None:
  """Keep an immutable report/look mapping stable across code/catalog releases."""

  return await db.fetchrow(
    f"""
    select {_RUN_COLUMNS}
    from product_recommendation_runs
    where user_id=$1 and source_makeup_report_id=$2 and source_look_id=$3
      and strategy='{SNAPSHOT_STRATEGY}'
    order by revision desc,created_at desc
    limit 1
    """,
    user_id,
    report_id,
    look_id,
  )


async def _insert_next_run(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  report_id: UUID,
  look_id: str,
  recipe_hash: str,
) -> dict[str, Any]:
  catalog_version = _catalog_snapshot_version(settings)
  row = await db.fetchrow(
    f"""
    with next_revision as (
      select coalesce(max(revision),0)+1 as revision
      from product_recommendation_runs
      where user_id=$2 and source_makeup_report_id=$3 and source_look_id=$4
        and strategy='{SNAPSHOT_STRATEGY}'
    )
    insert into product_recommendation_runs (
      id,user_id,source_makeup_report_id,source_look_id,recipe_hash,catalog_version,
      strategy,algorithm_version,status,revision,product_ids,recommendation_payload,
      consent_snapshot,expires_at
    )
    select $1,$2,$3,$4,$5,$6,'{SNAPSHOT_STRATEGY}',$7,'pending',revision,
      '{{}}'::uuid[],'{{}}'::jsonb,'{{}}'::jsonb,
      'infinity'::timestamptz
    from next_revision
    on conflict do nothing
    returning {_RUN_COLUMNS}
    """,
    uuid4(),
    user_id,
    report_id,
    look_id,
    recipe_hash,
    catalog_version,
    ALGORITHM_VERSION,
  )
  if row is not None:
    return row
  # A concurrent request won the same revision. Reuse its durable row rather
  # than creating another recommendation with a different ranking.
  concurrent = await _find_latest_look_run(
    db,
    user_id=user_id,
    report_id=report_id,
    look_id=look_id,
  )
  if concurrent is None:
    raise RuntimeError("makeup product snapshot insert conflicted without a reusable run")
  return concurrent


async def ensure_makeup_report_product_snapshots(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  report_id: UUID,
  look_id: str | None = None,
  all_looks: bool = False,
  force: bool = False,
) -> list[dict[str, Any]]:
  """Return durable runs, creating pending rows for missing/refresh recipes."""

  _, recipes = await _load_owned_recipe(
    db,
    user_id=user_id,
    report_id=report_id,
    look_id=look_id,
    all_looks=all_looks,
  )
  runs: list[dict[str, Any]] = []
  for selected_look_id, recipe_hash in recipes:
    current = None if force else await _find_latest_look_run(
      db,
      user_id=user_id,
      report_id=report_id,
      look_id=selected_look_id,
    )
    if current is not None and not _snapshot_run_matches_current_contract(current):
      current = None
    runs.append(current or await _insert_next_run(
      db,
      settings,
      user_id=user_id,
      report_id=report_id,
      look_id=selected_look_id,
      recipe_hash=recipe_hash,
    ))
  return runs


def _snapshot_payload(result: dict[str, Any]) -> dict[str, Any]:
  """Persist bounded ranking output, never the source report or signed image URLs."""

  groups: list[dict[str, Any]] = []
  for raw_group in _json_list(result.get("groups")):
    if not isinstance(raw_group, dict):
      continue
    category = _clean(raw_group.get("category"), 30)
    if category not in DEFAULT_CATEGORIES:
      continue
    items = [item for item in _json_list(raw_group.get("items")) if isinstance(item, dict)]
    groups.append({
      "category": category,
      "label": _clean(raw_group.get("label"), 80),
      "status": _clean(raw_group.get("status"), 40),
      "target": _json_object(raw_group.get("target")),
      "items": items[:SNAPSHOT_PER_CATEGORY_LIMIT],
      "source": _clean(raw_group.get("source"), 80),
      "degraded": bool(raw_group.get("degraded")),
      "degradedReason": _clean(raw_group.get("degradedReason"), 120) or None,
    })
  payload = {
    "contractVersion": SNAPSHOT_CONTRACT_VERSION,
    "status": _clean(result.get("status"), 40) or "partial",
    "groups": groups,
    "ranking": _json_object(result.get("ranking")),
    "algorithmVersion": _clean(result.get("algorithmVersion"), 120) or ALGORITHM_VERSION,
  }
  # Round-trip with a strict JSON representation so no datetime/custom value
  # reaches recommendation_payload and every subsequent read is deterministic.
  return json.loads(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str))


def _internal_product_ids(payload: dict[str, Any]) -> list[UUID]:
  product_ids: list[UUID] = []
  seen: set[UUID] = set()
  for group in _json_list(payload.get("groups")):
    if not isinstance(group, dict):
      continue
    for item in _json_list(group.get("items")):
      if not isinstance(item, dict) or item.get("externalSource"):
        continue
      try:
        product_id = UUID(str(item.get("productId")))
      except (TypeError, ValueError):
        continue
      if product_id not in seen:
        seen.add(product_id)
        product_ids.append(product_id)
  return product_ids


async def _claim_run(db: Database, run_id: UUID) -> dict[str, Any] | None:
  return await db.fetchrow(
    f"""
    update product_recommendation_runs
    set status='processing',started_at=now(),completed_at=null,error_code=null
    where id=$1 and strategy='{SNAPSHOT_STRATEGY}'
      and (
        status='pending'
        or (status='processing' and (started_at is null or started_at<now()-interval '10 minutes'))
      )
    returning {_RUN_COLUMNS}
    """,
    run_id,
  )


def _public_failure_code(error: Exception) -> str:
  if isinstance(error, AppError) and error.code in {
    "MAKEUP_RECOMMENDATION_NOT_FOUND",
    "MAKEUP_RECOMMENDATION_SCHEMA_UNSUPPORTED",
    "MAKEUP_RECOMMENDATION_LOOK_INVALID",
    "MAKEUP_RECOMMENDATION_RECIPE_INCOMPLETE",
  }:
    return error.code
  return GENERIC_FAILURE_CODE


async def run_makeup_report_product_snapshot_jobs(
  run_ids: Iterable[UUID | str],
  settings: Settings,
  *,
  db: Database,
) -> None:
  """Claim and materialize pending snapshots; safe to enqueue repeatedly."""

  for raw_run_id in run_ids:
    try:
      run_id = UUID(str(raw_run_id))
    except ValueError:
      continue
    run = await _claim_run(db, run_id)
    if run is None:
      continue
    try:
      result = await get_makeup_report_product_recommendations(
        db,
        settings,
        user_id=UUID(str(run["user_id"])),
        report_id=UUID(str(run["source_makeup_report_id"])),
        look_id=str(run["source_look_id"]),
        categories=list(DEFAULT_CATEGORIES),
        per_category_limit=SNAPSHOT_PER_CATEGORY_LIMIT,
      )
      payload = _snapshot_payload(result)
      run_status = "ready" if payload["status"] == "ready" else "partial"
      await db.execute(
        f"""
        update product_recommendation_runs
        set status=$2,recommendation_payload=$3::jsonb,product_ids=$4,
            completed_at=now(),error_code=null
        where id=$1 and strategy='{SNAPSHOT_STRATEGY}' and status='processing'
          and started_at=$5
        """,
        run_id,
        run_status,
        json.dumps(payload, ensure_ascii=False, sort_keys=True),
        _internal_product_ids(payload),
        run["started_at"],
      )
    except Exception as error:  # noqa: BLE001 - failures become durable retry state.
      logger.exception("[aura:products] makeup-snapshot:generation-failed run=%s", run_id)
      try:
        await db.execute(
          f"""
          update product_recommendation_runs
          set status='failed',completed_at=now(),error_code=$2
          where id=$1 and strategy='{SNAPSHOT_STRATEGY}' and status='processing'
            and started_at=$3
          """,
          run_id,
          _public_failure_code(error),
          run["started_at"],
        )
      except Exception:  # noqa: BLE001 - preserve the original worker failure.
        logger.exception("[aura:products] makeup-snapshot:failure-state-write-failed run=%s", run_id)


def _is_stale_processing(run: dict[str, Any]) -> bool:
  if str(run.get("status") or "") != "processing":
    return False
  started_at = run.get("started_at")
  if not isinstance(started_at, datetime):
    return True
  normalized = started_at if started_at.tzinfo else started_at.replace(tzinfo=timezone.utc)
  return normalized <= datetime.now(timezone.utc) - PROCESSING_STALE_AFTER


def snapshot_job_is_schedulable(run: dict[str, Any]) -> bool:
  return str(run.get("status") or "") == "pending" or _is_stale_processing(run)


def _snapshot_meta(run: dict[str, Any]) -> dict[str, Any]:
  return {
    "contractVersion": SNAPSHOT_CONTRACT_VERSION,
    "status": str(run.get("status") or "pending"),
    "runId": str(run["id"]),
    "revision": int(run.get("revision") or 1),
    "recipeHash": str(run.get("recipe_hash") or "") or None,
    "algorithmVersion": str(run.get("algorithm_version") or "") or None,
    "catalogVersion": str(run.get("catalog_version") or "") or None,
    "createdAt": _iso(run.get("created_at")),
    "startedAt": _iso(run.get("started_at")),
    "completedAt": _iso(run.get("completed_at")),
    "errorCode": str(run.get("error_code") or "") or None,
  }


def _snapshot_contains_fallback_items(run: dict[str, Any]) -> bool:
  payload = _json_object(run.get("recommendation_payload"))
  ranking = _json_object(payload.get("ranking"))
  fallback = _json_object(ranking.get("fallback"))
  if str(fallback.get("mode") or "none") != "none":
    return True
  for group in _json_list(payload.get("groups")):
    if not isinstance(group, dict):
      continue
    if bool(group.get("degraded")):
      return True
    for item in _json_list(group.get("items")):
      if (
        isinstance(item, dict)
        and item.get("externalSource")
        and not is_verified_report_discovery_item(item)
      ):
        return True
  return False


def _snapshot_run_matches_current_contract(run: dict[str, Any]) -> bool:
  if str(run.get("algorithm_version") or "") != ALGORITHM_VERSION:
    return False
  return not _snapshot_contains_fallback_items(run)


_DYNAMIC_ITEM_FIELDS = {
  "imageUrl",
  "purchaseUrl",
  "price",
  "offer",
  "viewerState",
  "catalogVersion",
  "sourceUpdatedAt",
  "status",
  "canLike",
  "canUnlike",
  "sponsored",
  "sponsorshipType",
  "disclosureLabel",
}


async def _hydrate_snapshot_groups(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
  """Refresh mutable offer fields while preserving stored product identities/order."""

  categories = [
    category
    for group in groups
    if (category := str(group.get("category") or "")) in DEFAULT_CATEGORIES
  ]
  stored_items = [
    item
    for group in groups
    for item in _json_list(group.get("items"))
    if isinstance(item, dict)
  ]
  internal_items = [item for item in stored_items if not item.get("externalSource")]
  internal_product_ids: list[UUID] = []
  for item in internal_items:
    try:
      product_id = UUID(str(item.get("productId")))
    except (TypeError, ValueError):
      continue
    if product_id not in internal_product_ids:
      internal_product_ids.append(product_id)

  async def load_internal() -> list[dict[str, Any]]:
    if not internal_items:
      return []
    return await _fetch_internal_candidates(
      db,
      settings,
      user_id=user_id,
      categories=list(dict.fromkeys(categories)),
      product_ids=internal_product_ids,
    )

  internal_rows = await load_internal()
  internal_by_pair: dict[tuple[str, str | None], dict[str, Any]] = {}
  internal_by_product: dict[str, dict[str, Any]] = {}
  for row in internal_rows:
    product_id = str(row.get("product_id") or "")
    shade_id = str(row.get("shade_id")) if row.get("shade_id") else None
    if not product_id:
      continue
    internal_by_pair.setdefault((product_id, shade_id), row)
    internal_by_product.setdefault(product_id, row)
  hydrated_groups: list[dict[str, Any]] = []
  for group in groups:
    hydrated_items: list[dict[str, Any]] = []
    original_items = [item for item in _json_list(group.get("items")) if isinstance(item, dict)]
    for stored in original_items:
      external_source = str(stored.get("externalSource") or "")
      if external_source:
        # Only report-bound, evidence-complete discovery rows from the current
        # contract may be replayed. Legacy external fallback rows still fail
        # closed and are dropped.
        if is_verified_report_discovery_item(stored):
          hydrated_items.append({
            **stored,
            "viewerState": {"liked": False},
            "canLike": False,
            "canUnlike": False,
          })
        continue

      product_id = str(stored.get("productId") or "")
      shade_id = str(stored.get("shadeId")) if stored.get("shadeId") else None
      row = internal_by_pair.get((product_id, shade_id))
      if row is None and shade_id is None:
        row = internal_by_product.get(product_id)
      if row is None:
        continue
      current = map_catalog_product(row, liked=bool(row.get("liked")))
      hydrated = {
        **stored,
        **{key: current[key] for key in _DYNAMIC_ITEM_FIELDS if key in current},
      }
      # Base snapshots intentionally remain product-family recommendations;
      # hydration must not turn them into an unearned shade match.
      if stored.get("shadeId") is None:
        hydrated.update({"shadeId": None, "shadeName": None, "shadeHex": None})
      hydrated_items.append(hydrated)

    unavailable_count = len(original_items) - len(hydrated_items)
    hydrated_items = dedupe_lowest_price_product_offers(hydrated_items)
    hydrated_groups.append({
      **group,
      "status": "ready" if hydrated_items else "empty",
      "items": hydrated_items,
      "degraded": bool(group.get("degraded")) or unavailable_count > 0,
      "degradedReason": (
        "stored_product_offer_unavailable"
        if unavailable_count > 0
        else group.get("degradedReason")
      ),
    })
  return hydrated_groups


async def makeup_report_product_snapshot_response(
  db: Database,
  settings: Settings,
  *,
  user_id: UUID,
  run: dict[str, Any],
  categories: list[str],
  per_category_limit: int,
) -> dict[str, Any]:
  snapshot = _snapshot_meta(run)
  payload = _json_object(run.get("recommendation_payload"))
  if str(run.get("status") or "") not in {"ready", "partial"} or not payload:
    return {
      "status": str(run.get("status") or "pending"),
      "runId": str(run["id"]),
      "snapshot": snapshot,
      "groups": [],
      "message": (
        "추천제품 계산에 실패했어요. 새로고침해 다시 시도해 주세요."
        if str(run.get("status") or "") == "failed"
        else "보고서에 맞는 추천제품을 준비하고 있어요."
      ),
    }

  group_by_category = {
    str(group.get("category")): group
    for group in _json_list(payload.get("groups"))
    if isinstance(group, dict)
  }
  groups: list[dict[str, Any]] = []
  for category in categories:
    group = group_by_category.get(category)
    if group is None:
      continue
    groups.append({
      **group,
      "items": _json_list(group.get("items"))[:per_category_limit],
    })
  groups = await _hydrate_snapshot_groups(
    db,
    settings,
    user_id=user_id,
    groups=groups,
  )
  nonempty_groups = sum(bool(group.get("items")) for group in groups)
  response_status = str(payload.get("status") or run.get("status") or "partial")
  if nonempty_groups == 0:
    response_status = "noEligibleProducts"
  elif nonempty_groups < len(groups):
    response_status = "partial"
  return {
    "status": response_status,
    "runId": str(run["id"]),
    "snapshot": snapshot,
    "groups": groups,
    "ranking": _json_object(payload.get("ranking")),
    "algorithmVersion": str(payload.get("algorithmVersion") or run.get("algorithm_version") or ""),
  }


async def dispatch_makeup_report_product_snapshot_jobs(
  *,
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  settings: Settings,
  look_id: str | None = None,
  all_looks: bool = True,
  force: bool = False,
) -> list[dict[str, Any]]:
  runs = await ensure_makeup_report_product_snapshots(
    db,
    settings,
    user_id=user_id,
    report_id=report_id,
    look_id=look_id,
    all_looks=all_looks,
    force=force,
  )
  schedulable_ids = [run["id"] for run in runs if snapshot_job_is_schedulable(run)]
  if schedulable_ids:
    background_tasks.add_task(
      run_makeup_report_product_snapshot_jobs,
      schedulable_ids,
      settings,
      db=db,
    )
  return runs
