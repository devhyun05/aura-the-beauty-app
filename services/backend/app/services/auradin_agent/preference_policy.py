"""AURADIN preference resolution policy shared by A4, F18, and R2a.

Raw preference lists are intentionally resolved once before any scorer or guard
interprets them. The JSON-serializable resolution ID, matched provenance, and
derived guard decision can then survive rankedCache reranks without raw-policy
reinterpretation.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


EXPLICIT_PREFERENCE_SOURCES = frozenset({"prompt", "question", "refine"})
_SOURCE_PRIORITY = {
  "report": 0,
  "prompt": 1,
  "question": 2,
  "refine": 3,
}


def _clean(value: Any) -> str:
  return str(value or "").strip()


def _values(value: Any) -> list[str]:
  if not isinstance(value, list):
    return []
  return sorted({_clean(item) for item in value if _clean(item)})


def _number(value: Any, *, default: float) -> float:
  """Return a finite non-negative number while preserving explicit ``0.0``."""
  if value is None:
    return default
  try:
    number = float(value)
  except (TypeError, ValueError):
    return default
  if number != number or number in {float("inf"), float("-inf")}:
    return default
  return max(0.0, number)


def _signal_candidates(preferences: list[dict[str, Any]]) -> list[dict[str, Any]]:
  signals: list[dict[str, Any]] = []
  for input_index, preference in enumerate(preferences):
    if not isinstance(preference, dict):
      continue
    attribute = _clean(preference.get("attribute"))
    if not attribute:
      continue
    # Missing provenance is not equivalent to an explicit user instruction.
    # All live producers set source; old/corrupt rows therefore fail closed
    # instead of unexpectedly acquiring prompt veto/floor authority.
    source = _clean(preference.get("source")) or "unknown"
    weight = _number(preference.get("weight"), default=1.0)
    request_confidence = _number(preference.get("confidence"), default=0.5)
    positive_values = _values(preference.get("values"))
    avoid_values = _values(preference.get("avoidValues"))
    # categoryScope는 선호를 특정 제품 카테고리에만 적용하는 메타데이터(예:
    # skin-type→finish는 base/powder에만). 해석은 랭킹이 하고, 여기선 신호에
    # 보존만 한다 — 재구성 과정에서 유실되지 않도록.
    category_scope = _values(preference.get("categoryScope"))
    group_payload = {
      "attribute": attribute,
      "source": source,
      "weight": weight,
      "confidence": request_confidence,
      "values": positive_values,
      "avoidValues": avoid_values,
      "categoryScope": category_scope,
    }
    group_id = hashlib.sha256(
      json.dumps(
        group_payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
      ).encode("utf-8"),
    ).hexdigest()[:16]
    common = {
      "attribute": attribute,
      "source": source,
      "weight": weight,
      "confidence": request_confidence,
      "groupId": group_id,
      "inputIndex": input_index,
    }
    if category_scope:
      common["categoryScope"] = category_scope
    for value in positive_values:
      signals.append({**common, "value": value, "polarity": "positive"})
    for value in avoid_values:
      signals.append({**common, "value": value, "polarity": "avoid"})
  return signals


def _winner_key(signal: dict[str, Any]) -> tuple[Any, ...]:
  """Choose a duplicate deterministically: source authority, then strength."""
  canonical = json.dumps(
    {
      key: signal[key]
      for key in ("attribute", "value", "polarity", "source", "weight", "confidence", "groupId")
    },
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
  )
  return (
    _SOURCE_PRIORITY.get(str(signal["source"]), -1),
    float(signal["weight"]) * float(signal["confidence"]),
    canonical,
  )


def resolve_preferences(preferences: list[dict[str, Any]] | None) -> dict[str, Any]:
  """Resolve source authority, duplicates, and positive/avoid conflicts.

  Rules are deliberately structural rather than score-based:

  1. The highest-authority duplicate of the same signal is retained.
  2. Any explicit source on an attribute suppresses every report signal for
     that attribute (a report can never veto a user's current request).
  3. A value that remains both positive and avoid is removed from both sides.
  """
  candidates = _signal_candidates(preferences or [])
  explicit_attributes = {
    signal["attribute"]
    for signal in candidates
    if signal["source"] in EXPLICIT_PREFERENCE_SOURCES
  }
  candidates = [
    signal
    for signal in candidates
    if not (signal["source"] == "report" and signal["attribute"] in explicit_attributes)
  ]

  deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
  for signal in candidates:
    key = (signal["attribute"], signal["value"], signal["polarity"])
    current = deduped.get(key)
    if current is None or _winner_key(signal) > _winner_key(current):
      deduped[key] = signal

  polarities_by_value: dict[tuple[str, str], set[str]] = {}
  for signal in deduped.values():
    polarities_by_value.setdefault((signal["attribute"], signal["value"]), set()).add(
      signal["polarity"],
    )
  conflicting_values = {
    key for key, polarities in polarities_by_value.items() if polarities == {"positive", "avoid"}
  }

  resolved_signals = sorted(
    (
      signal
      for signal in deduped.values()
      if (signal["attribute"], signal["value"]) not in conflicting_values
    ),
    key=lambda signal: (
      signal["attribute"],
      signal["value"],
      signal["polarity"],
      -_SOURCE_PRIORITY.get(str(signal["source"]), -1),
      signal["source"],
    ),
  )

  resolved_preferences: list[dict[str, Any]] = []
  provenance: dict[str, dict[str, Any]] = {}
  for signal in resolved_signals:
    identity_payload = {
      key: signal[key]
      for key in ("attribute", "value", "polarity", "source", "weight", "confidence", "groupId")
    }
    preference_id = hashlib.sha256(
      json.dumps(
        identity_payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
      ).encode("utf-8"),
    ).hexdigest()[:16]
    resolved = {
      "preferenceId": preference_id,
      "attribute": signal["attribute"],
      "source": signal["source"],
      "weight": signal["weight"],
      "confidence": signal["confidence"],
      "groupId": signal["groupId"],
    }
    if signal["polarity"] == "positive":
      resolved["values"] = [signal["value"]]
    else:
      resolved["avoidValues"] = [signal["value"]]
    if signal.get("categoryScope"):
      resolved["categoryScope"] = signal["categoryScope"]
    resolved_preferences.append(resolved)
    provenance[preference_id] = {
      "attribute": signal["attribute"],
      "value": signal["value"],
      "polarity": signal["polarity"],
      "source": signal["source"],
      "explicit": signal["source"] in EXPLICIT_PREFERENCE_SOURCES,
      "groupId": signal["groupId"],
      "inputIndex": signal["inputIndex"],
    }

  canonical_resolved = json.dumps(
    resolved_preferences,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
  )
  resolution_id = hashlib.sha256(canonical_resolved.encode("utf-8")).hexdigest()
  return {
    "resolvedPreferences": resolved_preferences,
    "provenanceByPreference": provenance,
    "resolutionId": resolution_id,
  }
