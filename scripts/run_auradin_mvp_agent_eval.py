from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_agent.session_manager import (  # noqa: E402
  answer_session,
  clear_sessions,
  create_session,
  to_search_turn,
)


RUN_DATE = "20260703"
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
    option for option in question.get("options", []) if option.get("filterDelta", {}).get("op") != "noop"
  )


def _result_card_ok(product: dict[str, Any]) -> bool:
  return bool(product.get("imageUrl") and product.get("purchaseUrl") and int(product.get("priceKrw") or 0) > 0)


def evaluate_prompt(prompt: str) -> dict[str, Any]:
  state = create_session(prompt=prompt)
  turns: list[dict[str, Any]] = []
  for _ in range(3):
    turn = to_search_turn(state)
    turns.append(
      {
        "phase": turn["phase"],
        "questionAttribute": (turn.get("question") or {}).get("attribute"),
        "questionType": (turn.get("question") or {}).get("type"),
        "productCount": len((turn.get("result") or {}).get("products") or []),
        "errorCode": (turn.get("error") or {}).get("code"),
      },
    )
    if turn["phase"] != "question":
      break
    question = turn["question"]
    option = _first_non_noop(question)
    answer_session(state["sessionId"], question_id=question["id"], option_id=option["id"])

  final_turn = to_search_turn(state)
  products = (final_turn.get("result") or {}).get("products") or []
  return {
    "prompt": prompt,
    "finalPhase": final_turn["phase"],
    "questionCount": state.get("questionCount", 0),
    "askedAttributes": state.get("askedAttributes", []),
    "products": products,
    "error": final_turn.get("error"),
    "turns": turns,
    "logs": state.get("logs", []),
    "allResultCardsPurchasable": all(_result_card_ok(product) for product in products),
  }


def render_report(results: list[dict[str, Any]]) -> str:
  lines = [
    "# Auradin MVP Agent Eval (20260703)",
    "",
    "## Summary",
    "",
    "| # | Prompt | Final phase | Questions | Asked attributes | Products | Cards purchasable | Error |",
    "|---:|---|---|---:|---|---:|---|---|",
  ]
  for index, result in enumerate(results, start=1):
    error_code = (result.get("error") or {}).get("code") or ""
    lines.append(
      "| "
      + " | ".join(
        [
          str(index),
          result["prompt"].replace("|", "/"),
          result["finalPhase"],
          str(result["questionCount"]),
          ", ".join(result["askedAttributes"]),
          str(len(result["products"])),
          "yes" if result["allResultCardsPurchasable"] else "no",
          error_code,
        ],
      )
      + " |",
    )

  lines.extend(["", "## Per Prompt Details", ""])
  for index, result in enumerate(results, start=1):
    lines.extend(
      [
        f"### {index}. {result['prompt']}",
        "",
        f"- Final phase: `{result['finalPhase']}`",
        f"- Question count: {result['questionCount']}",
        f"- Asked attributes: {', '.join(result['askedAttributes']) or '-'}",
        f"- Product cards: {len(result['products'])}",
        f"- All cards have price/image/purchase URL: {result['allResultCardsPurchasable']}",
      ],
    )
    if result.get("error"):
      lines.append(f"- Error: `{result['error'].get('code')}` / {result['error'].get('message')}")

    for log in result.get("logs", []):
      selected = log.get("selectedQuestion") or {}
      if selected:
        lines.append(
          f"- Question `{selected.get('attribute')}` ({selected.get('type')}): "
          f"before {log.get('candidateCountBefore')}, after {log.get('candidateCountAfter', '-')}, "
          f"top scores {log.get('topScoresBefore')}",
        )
    if result["products"]:
      first = result["products"][0]
      lines.append(
        f"- Top card: {first.get('brandName')} / {first.get('productName')} / "
        f"{first.get('priceKrw') or first.get('price')}원",
      )
    lines.append("")

  lines.extend(
    [
      "## Notes",
      "",
      "- Price and channel filters are not silently relaxed.",
      "- Brow/base/liner shortage is reported as recoverable unsupported/seed-limited state.",
      "- Low-confidence title residual values remain soft evidence and are not described as official or exact shades.",
      "",
    ],
  )
  return "\n".join(lines)


def run(run_date: str = RUN_DATE) -> Path:
  clear_sessions()
  results = [evaluate_prompt(prompt) for prompt in GOLDEN_PROMPTS]
  output_path = REPO_ROOT / "reports" / "auradin" / f"mvp_agent_eval_{run_date}.md"
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(render_report(results), encoding="utf-8")
  return output_path


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--run-date", default=RUN_DATE)
  args = parser.parse_args()
  print(run(args.run_date))


if __name__ == "__main__":
  main()

