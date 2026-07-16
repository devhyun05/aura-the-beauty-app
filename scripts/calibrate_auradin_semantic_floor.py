from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.settings import get_settings  # noqa: E402
from app.services.auradin_agent.catalog_loader import load_mvp_catalog  # noqa: E402
from app.services.auradin_agent.retrieval_service import build_semantic_scores  # noqa: E402
from app.services.auradin_agent.snapshot_manifest import (  # noqa: E402
  resolve_and_validate_snapshot,
)
from app.services.auradin_agent.vector_index import load_vector_index_metadata  # noqa: E402
from scripts.run_auradin_mvp_golden_eval import GOLDEN_PROMPTS  # noqa: E402


UNRELATED_PROMPTS = [
  "자동차 타이어 교체 시기와 추천 규격",
  "서울에서 부산까지 기차 시간표",
  "파이썬 웹 서버 성능 튜닝 방법",
  "주말 등산용 텐트와 침낭 추천",
  "환율과 금리 전망을 알려줘",
  "반려견 사료 성분을 비교해줘",
]


def _quantile(values: list[float], fraction: float) -> float | None:
  if not values:
    return None
  ordered = sorted(values)
  position = (len(ordered) - 1) * fraction
  lower = math.floor(position)
  upper = math.ceil(position)
  if lower == upper:
    return ordered[lower]
  weight = position - lower
  return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _distribution(values: list[float]) -> dict[str, float | int | None]:
  return {
    "count": len(values),
    "min": min(values) if values else None,
    "p10": _quantile(values, 0.10),
    "p25": _quantile(values, 0.25),
    "p50": _quantile(values, 0.50),
    "p75": _quantile(values, 0.75),
    "p90": _quantile(values, 0.90),
    "max": max(values) if values else None,
  }


def _suggest_floor(related: list[float], unrelated: list[float]) -> dict[str, float]:
  if not related or not unrelated:
    raise ValueError("both related and unrelated score distributions must be non-empty")
  values = sorted(set([*related, *unrelated]))
  candidates = [values[0] - 1e-9, values[-1] + 1e-9]
  candidates.extend((left + right) / 2 for left, right in zip(values, values[1:]))

  best: dict[str, float] | None = None
  for threshold in candidates:
    true_positive_rate = sum(score >= threshold for score in related) / len(related)
    true_negative_rate = sum(score < threshold for score in unrelated) / len(unrelated)
    balanced_accuracy = (true_positive_rate + true_negative_rate) / 2
    candidate = {
      "threshold": threshold,
      "balancedAccuracy": balanced_accuracy,
      "relatedRecall": true_positive_rate,
      "unrelatedRejection": true_negative_rate,
    }
    if best is None or (
      candidate["balancedAccuracy"],
      candidate["unrelatedRejection"],
      candidate["threshold"],
    ) > (
      best["balancedAccuracy"],
      best["unrelatedRejection"],
      best["threshold"],
    ):
      best = candidate
  if best is None:
    raise ValueError("unable to suggest a semantic floor")
  return {key: round(value, 6) for key, value in best.items()}


def _query_distribution(
  prompts: list[str],
  *,
  catalog: Any,
  settings: Any,
  top_k: int,
) -> tuple[list[dict[str, Any]], list[float]]:
  rows: list[dict[str, Any]] = []
  distribution: list[float] = []
  for prompt in prompts:
    semantic = build_semantic_scores(catalog, prompt, settings=settings)
    if semantic.status not in {"ok", "no_match"}:
      raise RuntimeError(
        f"semantic retrieval failed for {prompt!r}: "
        f"status={semantic.status} backend={semantic.backend} reason={semantic.degradedReason}",
      )
    scores = sorted((float(score) for score in semantic.scores.values()), reverse=True)[:top_k]
    distribution.extend(scores)
    rows.append(
      {
        "prompt": prompt,
        "backend": semantic.backend,
        "status": semantic.status,
        "resultCount": len(semantic.scores),
        "topScores": [round(score, 6) for score in scores],
        "topKMedian": round(_quantile(scores, 0.50) or 0.0, 6),
        "maxScore": round(max(scores), 6) if scores else None,
      },
    )
  return rows, distribution


def calibrate(
  *,
  backend: str,
  manifest_path: Path | None,
  top_k: int,
) -> dict[str, Any]:
  if top_k <= 0:
    raise ValueError("top_k must be greater than zero")
  settings = get_settings()
  if manifest_path is not None:
    settings.auradin_snapshot_manifest = str(manifest_path)
  settings.auradin_retrieval_backend = "embedding"
  descriptor = resolve_and_validate_snapshot(settings, force=True)
  metadata = load_vector_index_metadata(descriptor.vector_path)
  model_id = str(metadata.get("modelId") or "").strip()
  if backend == "hash" and model_id != "hash-fallback":
    raise RuntimeError(
      f"--backend hash requires modelId=hash-fallback, found {model_id or '<missing>'}",
    )
  if backend == "embedding":
    if model_id in {"", "hash-fallback", "hash-fallback-no-aws"}:
      raise RuntimeError("--backend embedding requires a real embedding vector index")
    if model_id != settings.effective_embedding_model_id:
      raise RuntimeError(
        f"index modelId={model_id} does not match serving modelId="
        f"{settings.effective_embedding_model_id}",
      )
    if not settings.aws_credentials_configured:
      raise RuntimeError("--backend embedding requires AWS credentials or an IAM role")

  catalog = load_mvp_catalog(settings=settings, descriptor=descriptor)
  related_rows, related_scores = _query_distribution(
    GOLDEN_PROMPTS,
    catalog=catalog,
    settings=settings,
    top_k=top_k,
  )
  unrelated_rows, unrelated_scores = _query_distribution(
    UNRELATED_PROMPTS,
    catalog=catalog,
    settings=settings,
    top_k=top_k,
  )
  suggestion = _suggest_floor(related_scores, unrelated_scores)
  return {
    "backend": backend,
    "retrievalBackends": sorted(
      {row["backend"] for row in [*related_rows, *unrelated_rows]},
    ),
    "snapshotRunDate": descriptor.run_date,
    "snapshotManifestPath": str(descriptor.manifest_path),
    "vectorPath": str(descriptor.vector_path),
    "modelId": model_id,
    "dimension": metadata.get("dimension"),
    "topKPerQuery": top_k,
    "related": {
      "label": "golden top-k proxy",
      "distribution": _distribution(related_scores),
      "queries": related_rows,
    },
    "unrelated": {
      "label": "unrelated-query top-k",
      "distribution": _distribution(unrelated_scores),
      "queries": unrelated_rows,
    },
    "suggestion": suggestion,
    "approvalStatus": "pending_human_review",
    "notes": [
      "The golden top-k set is a relevance proxy, not item-level human relevance labels.",
      "Hash-backend output is diagnostic only and must not be reused after an embedding switch.",
      "Rerun with --backend embedding after building the real index before changing s_floor.",
    ],
  }


def _format_number(value: Any) -> str:
  return "-" if value is None else f"{float(value):.6f}"


def render_report(payload: dict[str, Any]) -> str:
  related = payload["related"]["distribution"]
  unrelated = payload["unrelated"]["distribution"]
  suggestion = payload["suggestion"]
  lines = [
    f"# Auradin semantic s_floor calibration ({payload['backend']})",
    "",
    f"- Approval: `{payload['approvalStatus']}`",
    f"- Snapshot run date: `{payload['snapshotRunDate']}`",
    f"- Manifest: `{payload['snapshotManifestPath']}`",
    f"- Vector: `{payload['vectorPath']}`",
    f"- modelId: `{payload['modelId']}`",
    f"- dimension: `{payload['dimension']}`",
    f"- Retrieval backend(s): `{', '.join(payload['retrievalBackends'])}`",
    f"- Samples: top `{payload['topKPerQuery']}` scores per query",
    "",
    "## Proposed separation point",
    "",
    f"- Suggested s_floor: `{suggestion['threshold']:.6f}`",
    f"- Balanced accuracy: `{suggestion['balancedAccuracy']:.3f}`",
    f"- Golden-proxy recall: `{suggestion['relatedRecall']:.3f}`",
    f"- Unrelated rejection: `{suggestion['unrelatedRejection']:.3f}`",
    "- Status: **human approval pending**; do not activate from this report alone.",
    "",
    "## Distribution summary",
    "",
    "| Set | Count | Min | P10 | P50 | P90 | Max |",
    "|---|---:|---:|---:|---:|---:|---:|",
    "| Golden top-k proxy | "
    + " | ".join(
      str(value)
      for value in (
        related["count"],
        _format_number(related["min"]),
        _format_number(related["p10"]),
        _format_number(related["p50"]),
        _format_number(related["p90"]),
        _format_number(related["max"]),
      )
    )
    + " |",
    "| Unrelated-query top-k | "
    + " | ".join(
      str(value)
      for value in (
        unrelated["count"],
        _format_number(unrelated["min"]),
        _format_number(unrelated["p10"]),
        _format_number(unrelated["p50"]),
        _format_number(unrelated["p90"]),
        _format_number(unrelated["max"]),
      )
    )
    + " |",
    "",
    "## Per-query maxima",
    "",
    "| Set | Query | Results | Max | Top-k median |",
    "|---|---|---:|---:|---:|",
  ]
  for label, group in (("golden", payload["related"]), ("unrelated", payload["unrelated"])):
    for row in group["queries"]:
      lines.append(
        f"| {label} | {row['prompt'].replace('|', '/')} | {row['resultCount']} | "
        f"{_format_number(row['maxScore'])} | {_format_number(row['topKMedian'])} |",
      )
  lines.extend(
    [
      "",
      "## Interpretation",
      "",
      "- Golden top-k is a proxy distribution; item-level relevance still needs human labels.",
      "- Hash results are a diagnostic baseline only. They do not authorize a production floor.",
      "- After the real index is built, rerun this tool with `--backend embedding` and approve the new floor.",
      "",
    ],
  )
  return "\n".join(lines)


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Suggest Auradin semantic s_floor from golden and unrelated-query distributions.",
  )
  parser.add_argument("--backend", choices=["hash", "embedding"], default="hash")
  parser.add_argument("--manifest-path", type=Path)
  parser.add_argument("--top-k", type=int, default=10)
  parser.add_argument("--output-prefix", type=Path)
  args = parser.parse_args()

  payload = calibrate(
    backend=args.backend,
    manifest_path=args.manifest_path,
    top_k=args.top_k,
  )
  prefix = args.output_prefix
  if prefix is None:
    prefix = REPO_ROOT / "reports" / "auradin" / (
      f"semantic_floor_calibration_{args.backend}_{payload['snapshotRunDate']}"
    )
  elif not prefix.is_absolute():
    prefix = REPO_ROOT / prefix
  report_path = Path(f"{prefix}.md")
  evidence_path = Path(f"{prefix}.json")
  report_path.parent.mkdir(parents=True, exist_ok=True)
  report_path.write_text(render_report(payload), encoding="utf-8")
  evidence_path.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
  )
  print(report_path)


if __name__ == "__main__":
  main()
