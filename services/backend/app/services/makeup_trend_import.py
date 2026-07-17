"""Human-reviewed JSON import boundary for makeup trend keywords.

This module deliberately does not crawl external sources. Operators provide the
source evidence, and rows remain draft unless the CLI receives ``--approve``.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone
import json
import re
import unicodedata
from typing import Any
from urllib.parse import urlparse


SITUATION_KEYS = frozenset({
  "daily", "work", "date", "social", "formal_event", "travel_outdoor",
  "camera_content", "festival_performance",
})


class TrendImportValidationError(ValueError):
  pass


@dataclass(frozen=True)
class TrendImportItem:
  text: str
  normalized_text: str
  seed_prompt: str
  source_name: str
  source_url: str
  source_published_at: datetime
  evidence: str
  market: str
  locale: str
  as_of: datetime
  expires_at: datetime
  confidence: str
  situation_keys: tuple[str, ...]
  tags: tuple[str, ...]
  trend_score: float | None
  sort_order: int
  review_status: str

  @property
  def dedupe_key(self) -> tuple[str, str, str]:
    return self.normalized_text, self.locale, self.market


def normalize_operator_text(value: Any) -> str:
  return " ".join(unicodedata.normalize("NFKC", str(value or "")).split())


def _normalized_keyword(value: Any) -> str:
  return normalize_operator_text(value).casefold()


def _locale(value: Any) -> str:
  raw = normalize_operator_text(value).replace("_", "-")
  parts = raw.split("-")
  if len(parts) == 2 and all(parts):
    return f"{parts[0].lower()}-{parts[1].upper()}"
  if not raw:
    raise TrendImportValidationError("locale is required")
  return raw


def _market(value: Any) -> str:
  raw = normalize_operator_text(value)
  folded = raw.casefold().replace("_", "-")
  if folded in {"kr", "korea", "ko-kr"}:
    return "KR"
  if folded in {"global", "global-ss26"}:
    return "GLOBAL_SS26"
  if not raw:
    raise TrendImportValidationError("market is required")
  return raw.upper().replace("-", "_")


def _timestamp(value: Any, field: str) -> datetime:
  raw = normalize_operator_text(value)
  if not raw:
    raise TrendImportValidationError(f"{field} is required")
  try:
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
  except ValueError as exc:
    raise TrendImportValidationError(f"{field} must be an ISO-8601 timestamp") from exc
  if parsed.tzinfo is None:
    parsed = parsed.replace(tzinfo=timezone.utc)
  return parsed.astimezone(timezone.utc)


def _url(value: Any) -> str:
  raw = normalize_operator_text(value)
  parsed = urlparse(raw)
  if parsed.scheme not in {"http", "https"} or not parsed.netloc:
    raise TrendImportValidationError("sourceUrl must be an http(s) URL")
  return raw


def _parse_item(raw: Any, index: int, *, approve: bool) -> TrendImportItem:
  if not isinstance(raw, dict):
    raise TrendImportValidationError(f"items[{index}] must be an object")
  text = normalize_operator_text(raw.get("text"))
  seed_prompt = normalize_operator_text(raw.get("seedPrompt"))
  evidence = normalize_operator_text(raw.get("evidence"))
  if not 1 <= len(text) <= 60:
    raise TrendImportValidationError(f"items[{index}].text must contain 1-60 characters")
  if not 1 <= len(seed_prompt) <= 240:
    raise TrendImportValidationError(f"items[{index}].seedPrompt must contain 1-240 characters")
  if not evidence:
    raise TrendImportValidationError(f"items[{index}].evidence is required")
  source_url = _url(raw.get("sourceUrl"))
  source_name = normalize_operator_text(raw.get("sourceName")) or urlparse(source_url).netloc
  source_published_at = _timestamp(raw.get("sourcePublishedAt"), "sourcePublishedAt")
  as_of = _timestamp(raw.get("asOf"), "asOf")
  expires_at = _timestamp(raw.get("expiresAt"), "expiresAt")
  if source_published_at > as_of:
    raise TrendImportValidationError(f"items[{index}].sourcePublishedAt cannot be after asOf")
  if expires_at <= as_of:
    raise TrendImportValidationError(f"items[{index}].expiresAt must be after asOf")
  confidence = normalize_operator_text(raw.get("confidence")).upper()
  if confidence not in {"A", "B"}:
    raise TrendImportValidationError(f"items[{index}].confidence must be A or B")
  raw_situations = raw.get("situations")
  if not isinstance(raw_situations, list) or not raw_situations:
    raise TrendImportValidationError(f"items[{index}].situations must be a non-empty array")
  situation_keys = tuple(dict.fromkeys(normalize_operator_text(value) for value in raw_situations))
  unknown = sorted(set(situation_keys) - SITUATION_KEYS)
  if unknown:
    raise TrendImportValidationError(f"items[{index}].situations contains unknown keys: {', '.join(unknown)}")
  raw_tags = raw.get("tags", [])
  if not isinstance(raw_tags, list):
    raise TrendImportValidationError(f"items[{index}].tags must be an array")
  tags = tuple(dict.fromkeys(filter(None, (normalize_operator_text(value) for value in raw_tags))))
  trend_score = raw.get("trendScore")
  if trend_score is not None:
    try:
      trend_score = float(trend_score)
    except (TypeError, ValueError) as exc:
      raise TrendImportValidationError(f"items[{index}].trendScore must be numeric") from exc
    if not 0 <= trend_score <= 1:
      raise TrendImportValidationError(f"items[{index}].trendScore must be between 0 and 1")
  sort_order = raw.get("sortOrder", 100)
  if not isinstance(sort_order, int) or sort_order < 0:
    raise TrendImportValidationError(f"items[{index}].sortOrder must be a non-negative integer")
  return TrendImportItem(
    text=text,
    normalized_text=_normalized_keyword(text),
    seed_prompt=seed_prompt,
    source_name=source_name,
    source_url=source_url,
    source_published_at=source_published_at,
    evidence=evidence,
    market=_market(raw.get("market")),
    locale=_locale(raw.get("locale")),
    as_of=as_of,
    expires_at=expires_at,
    confidence=confidence,
    situation_keys=situation_keys,
    tags=tags,
    trend_score=trend_score,
    sort_order=sort_order,
    review_status="approved" if approve else "draft",
  )


def parse_trend_import_payload(payload: Any, *, approve: bool = False) -> list[TrendImportItem]:
  raw_items = payload.get("items") if isinstance(payload, dict) else payload
  if not isinstance(raw_items, list) or not raw_items:
    raise TrendImportValidationError("payload must be a non-empty array or an object with a non-empty items array")
  deduped: dict[tuple[str, str, str], TrendImportItem] = {}
  for index, raw in enumerate(raw_items):
    item = _parse_item(raw, index, approve=approve)
    existing = deduped.get(item.dedupe_key)
    if existing is None:
      deduped[item.dedupe_key] = item
      continue
    comparable = (
      "seed_prompt", "source_name", "source_url", "source_published_at", "evidence",
      "as_of", "expires_at", "confidence", "trend_score", "review_status",
    )
    if any(getattr(existing, field) != getattr(item, field) for field in comparable):
      raise TrendImportValidationError(
        f"items[{index}] conflicts with another item for normalized text, locale, and market",
      )
    deduped[item.dedupe_key] = replace(
      existing,
      situation_keys=tuple(dict.fromkeys((*existing.situation_keys, *item.situation_keys))),
      tags=tuple(dict.fromkeys((*existing.tags, *item.tags))),
      sort_order=min(existing.sort_order, item.sort_order),
    )
  return list(deduped.values())


async def import_trend_items(db: Any, items: list[TrendImportItem]) -> dict[str, int | str]:
  async def operation(connection: Any) -> dict[str, int | str]:
    all_keys = sorted({key for item in items for key in item.situation_keys})
    rows = await connection.fetch(
      "select id, key from makeup_situations where status = 'active' and key = any($1::text[])",
      all_keys,
    )
    situation_ids = {str(row["key"]): row["id"] for row in rows}
    missing = sorted(set(all_keys) - set(situation_ids))
    if missing:
      raise TrendImportValidationError(f"active situations not found: {', '.join(missing)}")
    imported = 0
    skipped_approved = 0
    mappings = 0
    for item in items:
      row = await connection.fetchrow(
        """
        insert into makeup_scenario_library as current (
          text, normalized_text, seed_prompt, tags, source, prompt_version, status,
          keyword_kind, source_name, source_url, source_published_at, evidence_summary,
          market_scope, trend_score, confidence, review_status, locale, as_of, valid_from, expires_at
        ) values (
          $1, $2, $3, $4::jsonb, 'curated', 'makeup-trend-import-v1', 'active',
          'trend', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15
        )
        on conflict (normalized_text, locale, (coalesce(market_scope, ''))) do update set
          text = excluded.text, seed_prompt = excluded.seed_prompt, tags = excluded.tags,
          source = excluded.source, prompt_version = excluded.prompt_version, status = excluded.status,
          keyword_kind = excluded.keyword_kind, source_name = excluded.source_name,
          source_url = excluded.source_url, source_published_at = excluded.source_published_at,
          evidence_summary = excluded.evidence_summary, trend_score = excluded.trend_score,
          confidence = excluded.confidence, review_status = excluded.review_status,
          as_of = excluded.as_of, valid_from = excluded.valid_from, expires_at = excluded.expires_at,
          updated_at = now()
        where current.review_status <> 'approved' or excluded.review_status = 'approved'
        returning id, review_status
        """,
        item.text,
        item.normalized_text,
        item.seed_prompt,
        json.dumps(item.tags, ensure_ascii=False),
        item.source_name,
        item.source_url,
        item.source_published_at,
        item.evidence,
        item.market,
        item.trend_score,
        item.confidence,
        item.review_status,
        item.locale,
        item.as_of,
        item.expires_at,
      )
      if row is None:
        skipped_approved += 1
        continue
      imported += 1
      mapping_status = "active" if item.review_status == "approved" else "disabled"
      for key in item.situation_keys:
        await connection.execute(
          """
          insert into makeup_situation_keywords as current
            (situation_id, keyword_id, relevance_score, sort_order, status)
          values ($1, $2, 1, $3, $4)
          on conflict (situation_id, keyword_id) do update set
            relevance_score = excluded.relevance_score,
            sort_order = excluded.sort_order,
            status = excluded.status,
            updated_at = now()
          """,
          situation_ids[key],
          row["id"],
          item.sort_order,
          mapping_status,
        )
        mappings += 1
    return {
      "status": items[0].review_status if items else "draft",
      "imported": imported,
      "skippedApproved": skipped_approved,
      "mappings": mappings,
    }

  return await db.run_in_transaction(operation)
