"""주 1회 오퍼 갱신 러너 (A6).

10단계: ①refetch → ②match → ③diff → ④gate(검토 큐) → ⑤seed → ⑥preprocess
→ ⑦vector → ⑧prepare → ⑨golden → ⑩activate 커맨드+승인 pending 템플릿 출력.
activate는 사람만 실행한다 — 이 러너는 승인 증거를 pending까지만 만들고 멈춘다.

run bundle 봉인: runId를 fetch 전에 발급하고 산출물 4종(results/review/diff/seed)을
data/auradin/offer_refresh/run_{runId}/ 아래 격리, meta.json에 SHA를 봉인한다.
재개(--resume-run)는 SHA 일치 시에만 진행하며 네트워크를 재호출하지 않는다.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
if str(BACKEND_ROOT) not in sys.path:
  sys.path.insert(0, str(BACKEND_ROOT))

from app.services.auradin_catalog.offer_refresh import (  # noqa: E402
  OfferMatchResult,
  _canonical_json_sha,
  apply_refresh_to_seed,
  build_offer_query,
  compute_offer_diff,
  fetch_offers_with_retry,
  match_offer_for_seed,
)

STEP_ORDER = ("refetch", "gate", "seed", "prepare", "golden")
REVIEW_EDITABLE_COLUMNS = {"decision", "reviewedBy", "note"}
REVIEW_COLUMNS = [
  "runId", "catalogItemId", "brand", "productName", "reason", "matchLevel", "matchScore",
  "runnerUpScore", "prevPriceKrw", "newPriceKrw", "deltaPct", "prevUrl", "newUrl",
  "decision", "reviewedBy", "note",
]
FETCH_FAIL_RATE_LIMIT = 0.10


class RunnerAbort(RuntimeError):
  """게이트 실패 — 서빙은 이전 스냅샷 유지, run 산출물은 증거로 남긴다."""


def _sha256_file(path: Path) -> str:
  return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
  return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(
    "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
    encoding="utf-8",
  )


def _write_json(path: Path, payload: dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _default_run_date() -> str:
  return (datetime.now(tz=UTC) + timedelta(hours=9)).strftime("%Y%m%d")


def _load_local_env() -> None:
  for env_path in (REPO_ROOT / ".env", BACKEND_ROOT / ".env"):
    if not env_path.is_file():
      continue
    for line in env_path.read_text(encoding="utf-8").splitlines():
      stripped = line.strip()
      if not stripped or stripped.startswith("#") or "=" not in stripped:
        continue
      key, value = stripped.split("=", 1)
      key = key.strip()
      if key and key not in os.environ:
        os.environ[key] = value.strip().strip('"').strip("'")


def load_active_manifest(data_root: Path) -> dict[str, Any]:
  pointer = json.loads((data_root / "active_snapshot.json").read_text(encoding="utf-8"))
  manifest_path = data_root / Path(str(pointer["manifestPath"])).relative_to("data/auradin") \
    if str(pointer["manifestPath"]).startswith("data/auradin") else data_root / str(pointer["manifestPath"])
  payload = json.loads(manifest_path.read_text(encoding="utf-8"))
  return {"payload": payload, "path": manifest_path, "sha256": _sha256_file(manifest_path)}


def ensure_run_date_after_active(run_date: str, active_run_date: str) -> None:
  # 날짜 역행 금지 — 폐기된 과거 날짜 경로를 덮거나 활성 스냅샷을 되돌리는 사고 방지.
  if not (run_date.isdigit() and len(run_date) == 8):
    raise RunnerAbort(f"invalid run date: {run_date}")
  if run_date <= active_run_date:
    raise RunnerAbort(
      f"run date must be after active snapshot run date: {run_date} <= {active_run_date}",
    )


def acquire_lock(offer_root: Path) -> Path:
  offer_root.mkdir(parents=True, exist_ok=True)
  lock_path = offer_root / "run.lock"
  try:
    fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
  except FileExistsError:
    raise RunnerAbort(f"another refresh run holds the lock: {lock_path}") from None
  with os.fdopen(fd, "w", encoding="utf-8") as handle:
    handle.write(f"{os.getpid()}\n")
  return lock_path


def run_refetch_and_match(
  seed_rows: list[dict[str, Any]],
  *,
  fetcher: Callable[[str], list[dict[str, Any]] | None],
  run_ts: str,
  margin: float,
  min_score: float,
  fail_rate_limit: float = FETCH_FAIL_RATE_LIMIT,
) -> list[dict[str, Any]]:
  result_rows: list[dict[str, Any]] = []
  failed = 0
  for row in seed_rows:
    catalog_item_id = str(row.get("catalogItemId") or row.get("id") or "").strip()
    query = build_offer_query(row)
    offers = fetcher(query)
    if offers is None:
      failed += 1
      result_rows.append(
        {"catalogItemId": catalog_item_id, "query": query, "fetchedAt": run_ts,
         "status": "fetch_failed", "matchLevel": "", "matchScore": 0.0,
         "runnerUpScore": 0.0, "matchedOffer": None, "resultsSha": ""},
      )
      continue
    result = match_offer_for_seed(row, offers, margin=margin, min_score=min_score)
    matched = result.matched_offer
    result_rows.append(
      {"catalogItemId": catalog_item_id, "query": query, "fetchedAt": run_ts,
       "status": result.status, "matchLevel": result.match_level,
       "matchScore": result.score, "runnerUpScore": result.runner_up_score,
       "matchedOffer": matched, "resultsSha": _canonical_json_sha(matched) if matched else ""},
    )
  if seed_rows and failed / len(seed_rows) > fail_rate_limit:
    raise RunnerAbort(
      f"fetch_failed rate {failed}/{len(seed_rows)} exceeds {fail_rate_limit:.0%} — aborting run",
    )
  return result_rows


def results_to_matches(result_rows: list[dict[str, Any]]) -> dict[str, OfferMatchResult | None]:
  matches: dict[str, OfferMatchResult | None] = {}
  for row in result_rows:
    if row["status"] == "fetch_failed":
      matches[row["catalogItemId"]] = None
      continue
    matches[row["catalogItemId"]] = OfferMatchResult(
      row["status"], row.get("matchedOffer"), row.get("matchLevel", ""),
      float(row.get("matchScore") or 0.0), float(row.get("runnerUpScore") or 0.0),
      query=row.get("query", ""), fetched_at=row.get("fetchedAt", ""),
      results_sha=row.get("resultsSha", ""),
    )
  return matches


def build_diff_summary(
  seed_rows: list[dict[str, Any]],
  matches: dict[str, OfferMatchResult | None],
) -> dict[str, Any]:
  by_id = {str(r.get("catalogItemId") or r.get("id") or ""): r for r in seed_rows}
  counts = {"matched": 0, "no_match": 0, "ambiguous": 0, "fetch_failed": 0}
  price_changed = tier_changed = link_changed = 0
  item_diffs: list[dict[str, Any]] = []
  for item_id, result in matches.items():
    if result is None:
      counts["fetch_failed"] += 1
      continue
    counts[result.status] += 1
    if result.status == "matched" and result.matched_offer and item_id in by_id:
      diff = compute_offer_diff(by_id[item_id], result.matched_offer)
      price_changed += bool(diff["priceDeltaPct"])
      tier_changed += bool(diff["priceTierChanged"])
      link_changed += bool(diff["linkChanged"])
      item_diffs.append({"catalogItemId": item_id, **diff})
  return {
    "counts": counts, "priceChanged": price_changed, "priceTierChanged": tier_changed,
    "linkChanged": link_changed, "items": item_diffs,
  }


def build_review_csv_rows(queue: list[dict[str, Any]], run_id: str) -> list[dict[str, str]]:
  rows = []
  for entry in queue:
    row = {column: "" for column in REVIEW_COLUMNS}
    row.update({key: str(value) for key, value in entry.items() if key in REVIEW_COLUMNS})
    row["runId"] = run_id
    rows.append(row)
  return rows


def write_review_csv(path: Path, rows: list[dict[str, str]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=REVIEW_COLUMNS)
    writer.writeheader()
    writer.writerows(rows)


def load_review_decisions(
  csv_path: Path,
  template_rows: list[dict[str, str]],
) -> dict[str, str]:
  """검토 CSV에서 decision을 읽는다 — 비결정 열이 원본 큐와 다르면 거부."""
  template_by_id = {row["catalogItemId"]: row for row in template_rows}
  decisions: dict[str, str] = {}
  with csv_path.open(encoding="utf-8", newline="") as handle:
    for row in csv.DictReader(handle):
      item_id = (row.get("catalogItemId") or "").strip()
      template = template_by_id.get(item_id)
      if template is None:
        raise RunnerAbort(f"review row not in original queue: {item_id}")
      for column in REVIEW_COLUMNS:
        if column in REVIEW_EDITABLE_COLUMNS:
          continue
        if (row.get(column) or "") != (template.get(column) or ""):
          raise RunnerAbort(
            f"review row tampered ({item_id}.{column}) — only "
            f"{sorted(REVIEW_EDITABLE_COLUMNS)} may be edited",
          )
      decision = (row.get("decision") or "").strip()
      if decision:
        decisions[item_id] = decision
  return decisions


def assert_a6_row_set_invariant(
  old_rows: list[dict[str, Any]],
  new_rows: list[dict[str, Any]],
) -> None:
  # A6는 행 추가·삭제가 설계에 없다 — ID 집합·행수 완전 동일이 아니면 abort.
  old_ids = [str(r.get("catalogItemId") or r.get("id") or "") for r in old_rows]
  new_ids = [str(r.get("catalogItemId") or r.get("id") or "") for r in new_rows]
  if len(old_ids) != len(new_ids) or sorted(old_ids) != sorted(new_ids):
    raise RunnerAbort(
      f"A6 row-set invariant violated: {len(old_ids)} -> {len(new_ids)} rows",
    )


def check_supplement_invariant(
  active_rows: list[dict[str, Any]],
  seed_rows: list[dict[str, Any]],
) -> None:
  # 보충 모드: 기존 ID 전부 보존 + 신규 추가만 허용.
  active_ids = {str(r.get("catalogItemId") or r.get("id") or "") for r in active_rows}
  seed_ids = {str(r.get("catalogItemId") or r.get("id") or "") for r in seed_rows}
  missing = active_ids - seed_ids
  if missing:
    raise RunnerAbort(f"supplement seed drops {len(missing)} active items — additions only")


def _run_subprocess(command: list[str], runner: Callable[..., Any]) -> None:
  completed = runner(command, cwd=REPO_ROOT)
  code = getattr(completed, "returncode", 0)
  if code:
    raise RunnerAbort(f"subprocess failed ({code}): {' '.join(command)}")


def run_build_and_prepare(
  *,
  run_date: str,
  seed_path: Path,
  data_root: Path,
  until: str,
  subprocess_runner: Callable[..., Any],
) -> dict[str, Any]:
  """⑥preprocess → ⑦vector → ⑧prepare → ⑨golden. 반환: 산출 경로·골든 요약."""
  python = sys.executable
  staging = data_root / ".staging" / run_date
  catalog = staging / "catalog" / f"catalog_items_mvp_{run_date}.jsonl"
  chunks = staging / "knowledge" / f"product_knowledge_chunks_mvp_{run_date}.jsonl"
  vector = staging / "vector" / f"product_knowledge_vector_index_mvp_{run_date}.json"
  manifest = data_root / "manifests" / f"snapshot_{run_date}.json"

  _run_subprocess(
    [python, "scripts/build_auradin_mvp_preprocessing.py", "--run-date", run_date,
     "--seed-path", str(seed_path), "--catalog-output", str(catalog),
     "--chunks-output", str(chunks)],
    subprocess_runner,
  )
  _run_subprocess(
    [python, "scripts/build_auradin_vector_index.py", "--run-date", run_date,
     "--backend", "hash", "--catalog-path", str(catalog), "--chunks-path", str(chunks),
     "--output-path", str(vector)],
    subprocess_runner,
  )
  _run_subprocess(
    [python, "scripts/promote_auradin_snapshot.py", "--prepare-only", "--run-date", run_date,
     "--staging-root", str(staging), "--seed-path", str(seed_path)],
    subprocess_runner,
  )
  golden_summary: dict[str, Any] = {}
  if until == "golden":
    prefix = REPO_ROOT / "reports" / "auradin" / f"mvp_agent_eval_{run_date}_offer_refresh"
    _run_subprocess(
      [python, "scripts/run_auradin_mvp_golden_eval.py", "--run-date", run_date,
       "--manifest-path", str(manifest), "--output-prefix", str(prefix)],
      subprocess_runner,
    )
    evidence_path = prefix.with_suffix(".json")
    if evidence_path.is_file():
      golden_summary = json.loads(evidence_path.read_text(encoding="utf-8")).get("summary", {})
  return {"manifestPath": manifest, "goldenSummary": golden_summary}


def write_pending_approval(
  *,
  run_id: str,
  run_date: str,
  manifest_path: Path,
  golden_summary: dict[str, Any],
  diff_summary: dict[str, Any],
  results_sha: str,
  review_decisions_sha: str,
) -> Path:
  """승인 증거를 pending까지만 작성한다 — approvedBy/reviewedAt/approvalConclusion은 사람 몫."""
  manifest_sha = _sha256_file(manifest_path)
  approval_path = REPO_ROOT / "reports" / "auradin" / "approvals" / f"offer_refresh_{run_date}_approval.json"
  _write_json(
    approval_path,
    {
      "runId": run_id,
      "runDate": run_date,
      "snapshotManifestSha256": manifest_sha,
      "golden": {
        "status": golden_summary.get("status", ""),
        "passed": golden_summary.get("passed", 0),
        "total": golden_summary.get("total", 0),
      },
      "a8": {"status": "PASS" if golden_summary else "", "passed": bool(golden_summary)},
      "coverageClassification": golden_summary.get("coverageClassification", "see_diff_report"),
      "diffSummary": {key: diff_summary[key] for key in
                      ("counts", "priceChanged", "priceTierChanged", "linkChanged")},
      "resultsSha": results_sha,
      "reviewDecisionsSha": review_decisions_sha,
      "approvedBy": "",
      "reviewedAt": "",
      "approvalConclusion": "pending",
    },
  )
  active_sha = _sha256_file(REPO_ROOT / "data" / "auradin" / "active_snapshot.json")
  print(
    "\n[STOP — 사람 게이트] 승인 증거가 pending 상태로 생성됨:"
    f"\n  {approval_path}"
    "\napprovedBy/reviewedAt 기입 + approvalConclusion=approved 후 아래를 직접 실행:"
    f"\n  ./.venv/bin/python scripts/promote_auradin_snapshot.py --activate --run-date {run_date} \\"
    f"\n    --manifest-path {manifest_path} \\"
    f"\n    --approved-manifest-sha {manifest_sha} \\"
    f"\n    --approval-evidence {approval_path} \\"
    f"\n    --approval-evidence-sha $(shasum -a 256 {approval_path} | cut -d' ' -f1) \\"
    f"\n    --expected-active-manifest-sha <active_snapshot.json의 manifestSha256 — 현재 pointer sha {active_sha[:12]}…> \\"
    "\n    --worker-count 1 --artifact-filesystem-mode mutable_shared \\"
    "\n    --restart-mechanism single_restart --active-pointer-persistence local_disk\n",
  )
  return approval_path


def main(
  argv: list[str] | None = None,
  *,
  fetcher: Callable[[str], list[dict[str, Any]] | None] | None = None,
  subprocess_runner: Callable[..., Any] = subprocess.run,
) -> int:
  parser = argparse.ArgumentParser(description="Auradin weekly offer refresh runner (A6).")
  parser.add_argument("--run-date", default=_default_run_date())
  parser.add_argument("--until", choices=STEP_ORDER, default="golden")
  parser.add_argument("--from", dest="start_from", choices=("refetch", "preprocess"), default="refetch")
  parser.add_argument("--seed-path", type=Path, default=None)
  parser.add_argument("--resume-run", default=None)
  parser.add_argument("--apply-review", type=Path, default=None)
  parser.add_argument("--margin", type=float, default=0.15)
  parser.add_argument("--min-score", type=float, default=0.5)
  parser.add_argument("--delay-seconds", type=float, default=1.0)
  parser.add_argument("--data-root", type=Path, default=REPO_ROOT / "data" / "auradin")
  args = parser.parse_args(argv)

  data_root: Path = args.data_root
  offer_root = data_root / "offer_refresh"
  active = load_active_manifest(data_root)
  active_run_date = str(active["payload"].get("runDate") or "")
  try:
    ensure_run_date_after_active(args.run_date, active_run_date)
    lock_path = acquire_lock(offer_root)
  except RunnerAbort as exc:
    print(f"[abort] {exc}", file=sys.stderr)
    return 1

  try:
    run_ts = f"{args.run_date[:4]}-{args.run_date[4:6]}-{args.run_date[6:8]}T03:00:00+09:00"
    # manifest-lite 계약: seedPath는 data/auradin 기준 상대경로다 (절대경로는 테스트 픽스처용).
    raw_seed_path = str(active["payload"]["seedPath"])
    if Path(raw_seed_path).is_absolute():
      active_seed_path = Path(raw_seed_path)
    elif raw_seed_path.startswith("data/auradin/"):
      active_seed_path = data_root / raw_seed_path.removeprefix("data/auradin/")
    else:
      active_seed_path = data_root / raw_seed_path
    seed_input = args.seed_path or active_seed_path
    seed_rows = _read_jsonl(seed_input)

    # 보충 모드: ①~⑤ 스킵, 병합 seed로 ⑥부터. 기존 ID 보존 게이트만 적용.
    if args.start_from == "preprocess":
      check_supplement_invariant(_read_jsonl(active_seed_path), seed_rows)
      built = run_build_and_prepare(
        run_date=args.run_date, seed_path=seed_input, data_root=data_root,
        until=args.until, subprocess_runner=subprocess_runner,
      )
      if args.until == "golden":
        write_pending_approval(
          run_id=f"{args.run_date}-supplement", run_date=args.run_date,
          manifest_path=built["manifestPath"], golden_summary=built["goldenSummary"],
          diff_summary={"counts": {}, "priceChanged": 0, "priceTierChanged": 0, "linkChanged": 0},
          results_sha="", review_decisions_sha="",
        )
      return 0

    state_path = offer_root / "refresh_state.json"
    stale_state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}

    if not args.resume_run and fetcher is None:
      _load_local_env()  # cron에서도 source 없이 동작 — 기존 수집기 관례(.env 2곳, 기존 env 우선)

    if args.resume_run:
      run_id = args.resume_run
      run_dir = offer_root / f"run_{run_id}"
      meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
      results_path = run_dir / "results.jsonl"
      if _sha256_file(results_path) != meta["shas"]["results.jsonl"]:
        raise RunnerAbort("resume refused: results.jsonl SHA mismatch with sealed meta")
      result_rows = _read_jsonl(results_path)
      stale_state = meta.get("staleStateBefore", stale_state)
      run_ts = meta.get("runTs", run_ts)
    else:
      if fetcher is None:
        client_id = os.environ.get("NAVER_SHOPPING_CLIENT_ID") or os.environ.get("NAVER_CLIENT_ID") or ""
        client_secret = (
          os.environ.get("NAVER_SHOPPING_CLIENT_SECRET") or os.environ.get("NAVER_CLIENT_SECRET") or ""
        )
        if not client_id or not client_secret:
          raise RunnerAbort("NAVER_SHOPPING_CLIENT_ID/_SECRET required for refetch")
        fetcher = lambda query: fetch_offers_with_retry(  # noqa: E731
          query, client_id=client_id, client_secret=client_secret, delay_seconds=args.delay_seconds,
        )
      run_id = f"{args.run_date}-{uuid.uuid4().hex[:8]}"  # fetch 전에 발급 — run bundle 격리 키
      run_dir = offer_root / f"run_{run_id}"
      run_dir.mkdir(parents=True, exist_ok=True)
      result_rows = run_refetch_and_match(
        seed_rows, fetcher=fetcher, run_ts=run_ts, margin=args.margin, min_score=args.min_score,
      )
      _write_jsonl(run_dir / "results.jsonl", result_rows)

    matches = results_to_matches(result_rows)
    diff_summary = build_diff_summary(seed_rows, matches)
    _write_json(run_dir / "diff.json", diff_summary)

    template_rows = build_review_csv_rows(
      apply_refresh_to_seed(seed_rows, matches, run_ts=run_ts, stale_state=stale_state,
                            review_decisions={})[1],
      run_id,
    )
    decisions: dict[str, str] = {}
    if args.apply_review:
      decisions = load_review_decisions(args.apply_review, template_rows)
    elif not (run_dir / "review_template.csv").exists():
      write_review_csv(run_dir / "review_template.csv", template_rows)

    new_seed, queue, next_state = apply_refresh_to_seed(
      seed_rows, matches, run_ts=run_ts, stale_state=stale_state, review_decisions=decisions,
    )

    meta = {
      "runId": run_id, "runDate": args.run_date, "runTs": run_ts,
      "seedInput": str(seed_input), "activeManifestSha": active["sha256"],
      "staleStateBefore": stale_state,
      "shas": {"results.jsonl": _sha256_file(run_dir / "results.jsonl")},
    }
    if (run_dir / "review_template.csv").exists():
      meta["shas"]["review_template.csv"] = _sha256_file(run_dir / "review_template.csv")
    meta["shas"]["diff.json"] = _sha256_file(run_dir / "diff.json")

    if args.until in {"refetch", "gate"}:
      _write_json(run_dir / "meta.json", meta)
      print(f"[until={args.until}] run {run_id}: 검토 큐 {len(queue)}건 — {run_dir}")
      return 0

    assert_a6_row_set_invariant(seed_rows, new_seed)
    _write_jsonl(run_dir / "seed.jsonl", new_seed)
    meta["shas"]["seed.jsonl"] = _sha256_file(run_dir / "seed.jsonl")
    _write_json(run_dir / "meta.json", meta)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    _write_json(state_path, next_state)

    dated_seed = data_root / "catalog" / f"catalog_items_seed_{args.run_date}.jsonl"
    dated_seed.write_text((run_dir / "seed.jsonl").read_text(encoding="utf-8"), encoding="utf-8")

    if args.until == "seed":
      print(f"[until=seed] run {run_id}: seed {len(new_seed)}행 — {dated_seed}")
      return 0

    built = run_build_and_prepare(
      run_date=args.run_date, seed_path=dated_seed, data_root=data_root,
      until=args.until, subprocess_runner=subprocess_runner,
    )
    if args.until == "golden":
      review_sha = _sha256_file(args.apply_review) if args.apply_review else meta["shas"].get("review_template.csv", "")
      write_pending_approval(
        run_id=run_id, run_date=args.run_date, manifest_path=built["manifestPath"],
        golden_summary=built["goldenSummary"], diff_summary=diff_summary,
        results_sha=meta["shas"]["results.jsonl"], review_decisions_sha=review_sha,
      )
    return 0
  except RunnerAbort as exc:
    print(f"[abort] {exc}", file=sys.stderr)
    return 1
  finally:
    lock_path.unlink(missing_ok=True)


if __name__ == "__main__":
  raise SystemExit(main())
