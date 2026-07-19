#!/usr/bin/env python3
"""분석 최적화 실험 집계 — ANALYSIS_METRICS_PATH JSONL을 읽어 A/B 표를 출력.

사용:
  1) 백엔드 .env에 ANALYSIS_METRICS_PATH=/private/tmp/aura-analysis-metrics.jsonl 설정 후 재시작.
  2) 단일 방식(FACE_ANALYSIS_V2_ENABLED=false)으로 분석 N건 → 플래그 true로 바꿔 N건.
  3) python scripts/analysis_metrics_report.py /private/tmp/aura-analysis-metrics.jsonl

레코드 3종:
  {"kind":"call","context":"analysis"|"stage","stage":"measure"|"perceive"|"consult"|null,"durationMs":..,"inputTokens":..,"outputTokens":..,"stopReason":..}
  {"kind":"outcome","method":"single"|"v2","success":bool,"errorCode":..,"durationMs":..}  # 서버 분석 시간
  {"kind":"perceived","method":"single"|"v2","clientElapsedMs":..}  # 클라이언트 벽시계(체감) 시간
"""

from __future__ import annotations

import collections
import json
import sys


def _percentile(values: list[float], pct: float) -> float:
  if not values:
    return 0.0
  ordered = sorted(values)
  index = min(len(ordered) - 1, int(round((pct / 100.0) * (len(ordered) - 1))))
  return ordered[index]


def _avg(values: list[float]) -> float:
  return sum(values) / len(values) if values else 0.0


def _load(path: str) -> list[dict]:
  records: list[dict] = []
  with open(path, encoding="utf-8") as handle:
    for line in handle:
      line = line.strip()
      if not line:
        continue
      try:
        records.append(json.loads(line))
      except json.JSONDecodeError:
        continue
  return records


def _report(records: list[dict]) -> None:
  calls = [r for r in records if r.get("kind") == "call"]
  outcomes = [r for r in records if r.get("kind") == "outcome"]
  perceived = [r for r in records if r.get("kind") == "perceived"]

  # 1) 호출 지연·토큰 (context: analysis=단일호출, stage=V2 스테이지)
  print("=== 호출 지표 (context별) ===")
  print(f"{'context':<10}{'n':>5}{'avgMs':>9}{'p50Ms':>9}{'avgIn':>8}{'avgOut':>8}{'trunc%':>8}")
  by_ctx: dict[str, list[dict]] = collections.defaultdict(list)
  for call in calls:
    by_ctx[str(call.get("context"))].append(call)
  for ctx, rows in sorted(by_ctx.items()):
    ms = [float(r["durationMs"]) for r in rows if isinstance(r.get("durationMs"), (int, float))]
    ins = [float(r["inputTokens"]) for r in rows if isinstance(r.get("inputTokens"), (int, float))]
    outs = [float(r["outputTokens"]) for r in rows if isinstance(r.get("outputTokens"), (int, float))]
    trunc = sum(1 for r in rows if r.get("stopReason") == "max_tokens")
    trunc_pct = (100.0 * trunc / len(rows)) if rows else 0.0
    print(
      f"{ctx:<10}{len(rows):>5}{_avg(ms):>9.0f}{_percentile(ms, 50):>9.0f}"
      f"{_avg(ins):>8.0f}{_avg(outs):>8.0f}{trunc_pct:>7.1f}%"
    )

  # 1b) V2 스테이지별 지연·재시도 (stage: measure/perceive/consult)
  stage_calls = [c for c in calls if c.get("context") == "stage" and c.get("stage")]
  if stage_calls:
    print("\n=== V2 스테이지 지표 (stage별) ===")
    print(f"{'stage':<10}{'n':>5}{'avgMs':>9}{'p50Ms':>9}{'avgIn':>8}{'avgOut':>8}{'trunc%':>8}")
    by_stage: dict[str, list[dict]] = collections.defaultdict(list)
    for call in stage_calls:
      by_stage[str(call.get("stage"))].append(call)
    order = {"measure": 0, "perceive": 1, "consult": 2}
    for stage, rows in sorted(by_stage.items(), key=lambda kv: order.get(kv[0], 9)):
      ms = [float(r["durationMs"]) for r in rows if isinstance(r.get("durationMs"), (int, float))]
      ins = [float(r["inputTokens"]) for r in rows if isinstance(r.get("inputTokens"), (int, float))]
      outs = [float(r["outputTokens"]) for r in rows if isinstance(r.get("outputTokens"), (int, float))]
      trunc = sum(1 for r in rows if r.get("stopReason") == "max_tokens")
      trunc_pct = (100.0 * trunc / len(rows)) if rows else 0.0
      print(
        f"{stage:<10}{len(rows):>5}{_avg(ms):>9.0f}{_percentile(ms, 50):>9.0f}"
        f"{_avg(ins):>8.0f}{_avg(outs):>8.0f}{trunc_pct:>7.1f}%"
      )
    # 재시도: 같은 리포트에서 한 스테이지가 2회+ 호출되면 1차 검증 실패 재시도.
    # (리포트 경계 정보가 없으므로 스테이지별 총 호출수 - 리포트수로 근사)
    report_count = len({r.get("reportId") for r in outcomes if r.get("reportId")}) or None
    if report_count:
      print(f"\n  (참고: 성공 리포트 {report_count}건 기준, stage n > 리포트수면 재시도 발생)")

  # 2) 리포트 단위 성공률·서버 분석 지연 (method: single vs v2)
  print("\n=== 리포트 결과 · 서버 분석 시간 (method별) ===")
  print(f"{'method':<10}{'n':>5}{'success%':>10}{'avgMs':>9}{'p50Ms':>9}")
  by_method: dict[str, list[dict]] = collections.defaultdict(list)
  for outcome in outcomes:
    by_method[str(outcome.get("method"))].append(outcome)
  for method, rows in sorted(by_method.items()):
    ok = sum(1 for r in rows if r.get("success"))
    ok_pct = (100.0 * ok / len(rows)) if rows else 0.0
    ms = [float(r["durationMs"]) for r in rows if isinstance(r.get("durationMs"), (int, float))]
    print(f"{method:<10}{len(rows):>5}{ok_pct:>9.1f}%{_avg(ms):>9.0f}{_percentile(ms, 50):>9.0f}")

  # 2b) 클라이언트 벽시계(체감) 시간 — 업로드 후 분석 시작~보고서 준비, 폴링 지연 포함.
  if perceived:
    print("\n=== 체감 시간 · 클라이언트 벽시계 (method별) ===")
    print(f"{'method':<10}{'n':>5}{'avgMs':>9}{'p50Ms':>9}")
    by_method_p: dict[str, list[dict]] = collections.defaultdict(list)
    for row in perceived:
      by_method_p[str(row.get("method"))].append(row)
    for method, rows in sorted(by_method_p.items()):
      ms = [float(r["clientElapsedMs"]) for r in rows if isinstance(r.get("clientElapsedMs"), (int, float))]
      print(f"{method:<10}{len(rows):>5}{_avg(ms):>9.0f}{_percentile(ms, 50):>9.0f}")

  # 3) 실패 사유 분포
  errors = collections.Counter(
    str(r.get("errorCode")) for r in outcomes if not r.get("success") and r.get("errorCode")
  )
  if errors:
    print("\n=== 실패 사유 ===")
    for code, count in errors.most_common():
      print(f"  {code}: {count}")

  if not calls and not outcomes and not perceived:
    print("(레코드 없음 — ANALYSIS_METRICS_PATH 설정 후 분석을 돌렸는지 확인)")


def main() -> int:
  if len(sys.argv) != 2:
    print("usage: python scripts/analysis_metrics_report.py <metrics.jsonl>", file=sys.stderr)
    return 2
  _report(_load(sys.argv[1]))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
