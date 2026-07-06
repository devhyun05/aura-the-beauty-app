"""Auradin WS5 — 라이브 신뢰성 하네스 (실 Bedrock 카피 + 실 Naver 발견, 반복 측정).

.env 실자격증명으로 세션 파이프라인을 in-process 구동해 라운드별로 측정한다:
  (a) reasonCopy 생성률 + 충실성(copy_is_faithful — 구조화 근거 밖 속성/금지표현 발명 0)
  (b) 라이브 Naver 발견 카드: 시도율/교체율, 카테고리 정합, 하드조건 준수, 헤지 caveat
  (c) 지연 p50/p95 (세션 생성→결과, 질문 답변 포함)
  (d) 에러·타임아웃·가드레일 차단율

  cd services/backend && python3 scripts/auradin_live_reliability.py [--rounds 3]

판정 임계 (미달 항목은 exit 1 — enrich 보완 후 재실행 루프):
  copy_rate >= 0.95, faithful_rate == 1.0, live_attempt_success >= 0.6,
  live_honesty == 1.0(교체 카드의 하드조건·헤지 위반 0), error_rate < 0.05
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

os.environ.setdefault("AURADIN_RUN_DATE", "20260706")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.settings import get_settings  # noqa: E402
from app.services.auradin_agent.enrichment import BANNED_COPY_TERMS, copy_is_faithful  # noqa: E402
from app.services.auradin_agent.retrieval_service import matches_filter  # noqa: E402
from app.services.auradin_agent.session_manager import (  # noqa: E402
  answer_session_persisted,
  clear_sessions,
  create_session_persisted,
  to_search_turn,
)

# lip/cheek/shadow × 색/마감/가격 × 결정적/broad — 10개 (WS3 골든 6 + 라이브 특화 4)
QUERIES = (
  "글리터 추천해줘",
  "플럼 립 추천해줘",
  "올리브영에서 살 수 있는 매트 립",
  "데일리로 쓸 만한 블러셔 추천해줘",
  "2만원 이하 촉촉한 립 틴트",
  "은은한 쉬머 아이섀도우 팔레트",
  "면접용 자연스러운 블러셔, 너무 붉지 않게",
  "1만원 이하 코랄 틴트",
  "쿨톤 모브 립 2만원 이하",
  "피치 크림 블러셔",
)

THRESHOLDS = {
  "copy_rate": 0.95,
  "faithful_rate": 1.0,
  "live_attempt_success": 0.6,
  "live_honesty": 1.0,
  "error_rate": 0.05,
}


async def _drive_query(prompt: str, settings) -> dict:
  """세션 생성 → (질문은 noop 통과) → 결과. 실서빙과 동일한 persisted 경로."""
  started = time.monotonic()
  state = await create_session_persisted(prompt=prompt, settings=settings, db=None)
  for _ in range(4):
    if state.get("phase") != "question":
      break
    question = state.get("lastQuestion") or {}
    options = question.get("options") or []
    if not options:
      break
    state = await answer_session_persisted(
      state["sessionId"],
      question_id=question["id"],
      option_id=options[-1]["id"],
      settings=settings,
      db=None,
    )
  elapsed_ms = round((time.monotonic() - started) * 1000)
  return {"state": state, "elapsedMs": elapsed_ms}


def _judge_products(state: dict) -> dict:
  turn = to_search_turn(state)
  result = turn.get("result") or {}
  products = result.get("products") or []
  enrichment = result.get("enrichment") or {}
  hard_filters = [f for f in state.get("hardFilters") or [] if (f.get("mode") or "hard") != "soft"]

  copies = [p for p in products if p.get("reasonCopy")]
  bedrock_copies = [p for p in products if p.get("reasonCopySource") == "bedrock"]
  unfaithful = [
    p["id"]
    for p in products
    if p.get("reasonCopy") and not copy_is_faithful(p["reasonCopy"], p)
  ]
  banned_hits = [
    p["id"]
    for p in products
    if p.get("reasonCopy") and any(term in p["reasonCopy"] for term in BANNED_COPY_TERMS)
  ]

  live_status = (enrichment.get("liveDiscovery") or {}).get("status")
  live = next((p for p in products if p.get("source") == "live_naver"), None)
  live_violations: list[str] = []
  if live:
    expected_category = products[0].get("category")
    if live.get("category") != expected_category:
      live_violations.append("category_mismatch")
    if not all(matches_filter({"category": live.get("category"), "attributes": {}, "liveOffer": {"priceKrw": live.get("price")}}, f) for f in hard_filters if f.get("attribute") == "priceKrw"):
      live_violations.append("hard_price_violated")
    if not any("네이버" in c for c in (live.get("reason") or {}).get("caveat", [])):
      live_violations.append("missing_hedge_caveat")
    if not (live.get("purchaseUrl") and live.get("imageUrl") and (live.get("price") or 0) > 0):
      live_violations.append("not_purchasable")

  return {
    "phase": state.get("phase"),
    "productCount": len(products),
    "copyCount": len(copies),
    "bedrockCopyCount": len(bedrock_copies),
    "unfaithful": unfaithful,
    "bannedTermHits": banned_hits,
    "liveStatus": live_status,
    "liveReplaced": bool(live),
    "liveViolations": live_violations,
    "copyBackend": (enrichment.get("reasonCopy") or {}).get("backend"),
  }


async def run_rounds(rounds: int) -> dict:
  settings = get_settings()
  runs: list[dict] = []
  for round_index in range(1, rounds + 1):
    clear_sessions()  # 라운드마다 세션·enrich 캐시 초기화 — 매 라운드가 콜드 측정
    for prompt in QUERIES:
      record: dict = {"round": round_index, "prompt": prompt}
      try:
        driven = await _drive_query(prompt, settings)
        record.update(elapsedMs=driven["elapsedMs"], **_judge_products(driven["state"]))
        record["error"] = None if record["phase"] == "results" else f"phase:{record['phase']}"
      except Exception as exc:  # noqa: BLE001 - 하네스는 측정을 계속한다
        record.update(error=f"{exc.__class__.__name__}: {exc}", phase="exception", productCount=0)
      runs.append(record)
      flag = "" if not record.get("error") else "  <-- ERROR"
      live = record.get("liveStatus")
      print(
        f"[r{round_index}] {record.get('elapsedMs', '-'):>6}ms copy {record.get('bedrockCopyCount', 0)}/{record.get('productCount', 0)}"
        f" live={live}{'/replaced' if record.get('liveReplaced') else ''} | {prompt}{flag}",
        flush=True,
      )
  return summarize(runs, rounds)


def summarize(runs: list[dict], rounds: int) -> dict:
  ok_runs = [r for r in runs if not r.get("error")]
  latencies = sorted(r["elapsedMs"] for r in ok_runs if r.get("elapsedMs"))
  total_products = sum(r.get("productCount", 0) for r in ok_runs)
  total_copies = sum(r.get("copyCount", 0) for r in ok_runs)
  bedrock_copies = sum(r.get("bedrockCopyCount", 0) for r in ok_runs)
  unfaithful = [x for r in ok_runs for x in r.get("unfaithful", [])]
  banned = [x for r in ok_runs for x in r.get("bannedTermHits", [])]
  live_attempts = [r for r in ok_runs if r.get("liveStatus") not in {None, "disabled", "no_credentials"}]
  live_replaced = [r for r in live_attempts if r.get("liveReplaced")]
  live_violations = [v for r in ok_runs for v in r.get("liveViolations", [])]

  def pct(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0

  def percentile(values: list[int], q: float) -> int:
    if not values:
      return 0
    index = min(len(values) - 1, max(0, round(q * (len(values) - 1))))
    return values[index]

  metrics = {
    "runs": len(runs),
    "rounds": rounds,
    "error_rate": pct(len(runs) - len(ok_runs), len(runs)),
    "copy_rate": pct(total_copies, total_products),  # reasonCopy 존재율 (fallback 포함 — 계약상 항상 1.0이어야)
    "bedrock_copy_rate": pct(bedrock_copies, total_products),  # 실 LLM 카피 생성률
    "faithful_rate": pct(total_products - len(unfaithful), total_products),
    "banned_term_hits": len(banned),
    "live_attempts": len(live_attempts),
    "live_attempt_success": pct(len(live_replaced), len(live_attempts)),
    "live_honesty": pct(
      sum(len(r.get("liveViolations", [])) == 0 for r in live_replaced), len(live_replaced),
    ) if live_replaced else 1.0,
    "live_violation_kinds": sorted(set(live_violations)),
    "latency_ms": {
      "p50": percentile(latencies, 0.50),
      "p95": percentile(latencies, 0.95),
      "max": latencies[-1] if latencies else 0,
      "mean": round(statistics.mean(latencies)) if latencies else 0,
    },
  }
  verdicts = {
    "copy_rate": metrics["copy_rate"] >= THRESHOLDS["copy_rate"],
    "bedrock_copy_rate": metrics["bedrock_copy_rate"] >= THRESHOLDS["copy_rate"],
    "faithful_rate": metrics["faithful_rate"] >= THRESHOLDS["faithful_rate"],
    "live_attempt_success": metrics["live_attempt_success"] >= THRESHOLDS["live_attempt_success"],
    "live_honesty": metrics["live_honesty"] >= THRESHOLDS["live_honesty"],
    "error_rate": metrics["error_rate"] < THRESHOLDS["error_rate"],
  }
  return {"metrics": metrics, "verdicts": verdicts, "passed": all(verdicts.values()), "runs": runs}


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--rounds", type=int, default=3)
  parser.add_argument("--out", type=str, default=None)
  args = parser.parse_args()

  report = asyncio.run(run_rounds(args.rounds))
  stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
  out_path = Path(args.out) if args.out else (
    Path(__file__).resolve().parents[3] / "reports" / "auradin" / f"live_reliability_{stamp}.json"
  )
  out_path.parent.mkdir(parents=True, exist_ok=True)
  out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))

  print("\n=== METRICS ===")
  print(json.dumps(report["metrics"], ensure_ascii=False, indent=2))
  print("=== VERDICTS ===")
  for name, ok in report["verdicts"].items():
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
  print(f"report: {out_path}")
  sys.exit(0 if report["passed"] else 1)


if __name__ == "__main__":
  main()
