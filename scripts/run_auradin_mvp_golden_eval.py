from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.session_manager import (
  answer_session,
  clear_sessions,
  create_session,
  to_search_turn,
)
from app.core.settings import get_settings
from app.services.auradin_agent.catalog_loader import load_mvp_catalog
from app.services.auradin_agent.retrieval_service import build_semantic_scores
from app.services.auradin_agent.snapshot_manifest import resolve_and_validate_snapshot


RUN_DATE = "20260715"
GOLDEN_OWNER_SUBJECT = "auradin-golden-eval"
GOLDEN_PROMPTS = [
  "쿨톤인데 너무 진하지 않은 글로시 핑크 립 2만원 이하",
  "데일리로 쓸 만한 제품 추천해줘",
  "올리브영에서 살 수 있는 데일리 립",
  "면접용 자연스러운 블러셔, 너무 붉지 않게",
  "글리터 강한 아이섀도우 말고 은은한 쉬머",
  "브로우 추천해줘",
]


def _first_non_noop(question: dict[str, Any]) -> dict[str, Any]:
  return next(
    option
    for option in question.get("options", [])
    if option.get("filterDelta", {}).get("op") != "noop"
  )


def _product_summary(turn: dict[str, Any]) -> list[dict[str, Any]]:
  products = (turn.get("result") or {}).get("products") or []
  return [
    {
      "id": product.get("id"),
      "category": product.get("category"),
      "priceKrw": product.get("priceKrw") or product.get("price"),
      "hasImage": bool(product.get("imageUrl")),
      "hasPurchase": bool(product.get("purchaseUrl")),
    }
    for product in products
  ]


def run_prompt(prompt: str) -> dict[str, Any]:
  state = create_session(prompt=prompt, owner_subject=GOLDEN_OWNER_SUBJECT)
  first_turn = to_search_turn(state)
  first_question = first_turn.get("question") if first_turn.get("phase") == "question" else None

  while to_search_turn(state)["phase"] == "question" and int(state.get("questionCount") or 0) < 3:
    question = to_search_turn(state)["question"]
    option = _first_non_noop(question)
    answer_session(
      state["sessionId"],
      owner_subject=GOLDEN_OWNER_SUBJECT,
      question_id=question["id"],
      option_id=option["id"],
    )

  final_turn = to_search_turn(state)
  return {
    "prompt": prompt,
    "firstPhase": first_turn["phase"],
    "firstQuestionAttribute": first_question.get("attribute") if first_question else None,
    "finalPhase": final_turn["phase"],
    "questionCount": state.get("questionCount"),
    "askedAttributes": state.get("askedAttributes"),
    "products": _product_summary(final_turn),
    "errorCode": (final_turn.get("error") or {}).get("code"),
    "recoverable": (final_turn.get("error") or {}).get("recoverable"),
    "logs": state.get("logs", []),
  }


def _status(result: dict[str, Any]) -> str:
  prompt = result["prompt"]
  products = result["products"]
  if not products:
    return "FAIL"
  if "2만원 이하" in prompt and any(int(product["priceKrw"] or 0) > 20000 for product in products):
    return "FAIL"
  if "립" in prompt and any(product["category"] != "lip" for product in products):
    return "FAIL"
  if "블러셔" in prompt and any(product["category"] != "cheek" for product in products):
    return "FAIL"
  if "아이섀도우" in prompt and any(product["category"] != "shadow" for product in products):
    return "FAIL"
  if "브로우" in prompt and any(product["category"] != "brow" for product in products):
    return "FAIL"
  if any(not product["hasImage"] or not product["hasPurchase"] or not product["priceKrw"] for product in products):
    return "FAIL"
  if prompt in GOLDEN_PROMPTS[:2] and result["firstPhase"] != "question":
    return "FAIL"
  return "PASS"


def render_report(results: list[dict[str, Any]], *, run_date: str, snapshot: dict[str, Any]) -> str:
  lines = [
    f"# Auradin MVP Agent Golden Eval ({run_date})",
    "",
    "## Summary",
    "",
    f"- Snapshot source: `{snapshot['snapshotSource']}`",
    f"- Snapshot manifest: `{snapshot['snapshotManifestPath']}`",
    f"- Snapshot manifest SHA-256: `{snapshot['snapshotManifestSha256']}`",
    f"- Catalog: `{snapshot['catalogPath']}` (`{snapshot['catalogSha256']}`)",
    f"- Chunks: `{snapshot['chunksPath']}` (`{snapshot['chunksSha256']}`)",
    f"- Vector: `{snapshot['vectorPath']}` (`{snapshot['vectorSha256']}`)",
    "",
    "| Prompt | Status | First phase | First question | Final phase | Questions | Products/Error |",
    "|---|---|---|---|---|---:|---|",
  ]
  for result in results:
    status = _status(result)
    products_or_error = (
      f"{len(result['products'])} products"
      if result["products"]
      else f"error={result['errorCode']}, recoverable={result['recoverable']}"
    )
    lines.append(
      "| "
      + " | ".join(
        [
          result["prompt"],
          status,
          str(result["firstPhase"]),
          str(result["firstQuestionAttribute"]),
          str(result["finalPhase"]),
          str(result["questionCount"]),
          products_or_error,
        ],
      )
      + " |",
    )

  lines.extend(["", "## Candidate Count Logs", ""])
  for result in results:
    lines.append(f"### {result['prompt']}")
    for log in result["logs"]:
      selected = log.get("selectedQuestion") or {}
      lines.append(
        "- "
        f"step={log.get('step')} "
        f"before={log.get('candidateCountBefore')} "
        f"after={log.get('candidateCountAfter')} "
        f"attribute={selected.get('attribute')} "
        f"type={selected.get('type')}",
      )
    lines.append("")

  return "\n".join(lines)


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--run-date", default=RUN_DATE)
  args = parser.parse_args()
  settings = get_settings()
  descriptor = resolve_and_validate_snapshot(settings, force=True)
  if descriptor.run_date != args.run_date:
    parser.error(
      f"resolved manifest runDate={descriptor.run_date} does not match --run-date={args.run_date}",
    )
  clear_sessions()
  results = [run_prompt(prompt) for prompt in GOLDEN_PROMPTS]
  evaluated_results = [{**result, "status": _status(result)} for result in results]
  semantic_probe = build_semantic_scores(
    load_mvp_catalog(settings=settings, descriptor=descriptor),
    "스냅샷 검색 백엔드 검증",
    settings=settings,
  )
  snapshot = {
    **descriptor.public_status(),
    "snapshotManifestPath": str(descriptor.manifest_path),
    "catalogPath": str(descriptor.catalog_path),
    "catalogSha256": descriptor.catalog_sha256,
    "chunksPath": str(descriptor.chunks_path),
    "chunksSha256": descriptor.chunks_sha256,
    "vectorPath": str(descriptor.vector_path),
    "vectorSha256": descriptor.vector_sha256,
    "retrievalBackend": semantic_probe.backend,
    "retrievalStatus": semantic_probe.status,
    "degradedReason": semantic_probe.degradedReason,
    "retrievalBackends": sorted(
      {
        str(log.get("retrievalBackend") or log.get("retrievalBackendAfter"))
        for result in results
        for log in result.get("logs", [])
        if log.get("retrievalBackend") or log.get("retrievalBackendAfter")
      },
    ),
    "retrievalStatuses": sorted(
      {
        str(log.get("retrievalStatus") or log.get("retrievalStatusAfter"))
        for result in results
        for log in result.get("logs", [])
        if log.get("retrievalStatus") or log.get("retrievalStatusAfter")
      },
    ),
  }
  output_path = REPO_ROOT / "reports" / "auradin" / f"mvp_agent_eval_{args.run_date}.md"
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(
    render_report(evaluated_results, run_date=args.run_date, snapshot=snapshot),
    encoding="utf-8",
  )
  evidence_path = REPO_ROOT / "reports" / "auradin" / f"mvp_agent_eval_{args.run_date}.json"
  passed = sum(result["status"] == "PASS" for result in evaluated_results)
  failed = len(evaluated_results) - passed
  evidence_path.write_text(
    json.dumps(
      {
        "snapshot": snapshot,
        "summary": {
          "status": "PASS" if failed == 0 else "FAIL",
          "passed": passed,
          "failed": failed,
          "total": len(evaluated_results),
        },
        "results": evaluated_results,
      },
      ensure_ascii=False,
      indent=2,
      sort_keys=True,
    ) + "\n",
    encoding="utf-8",
  )
  print(output_path)
  if failed:
    raise SystemExit(1)


if __name__ == "__main__":
  main()
