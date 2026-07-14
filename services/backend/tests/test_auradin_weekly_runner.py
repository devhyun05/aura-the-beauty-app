"""주간 오퍼 갱신 러너(A6) 계약 테스트 — 계획 Task 4 Step 1 (a)~(g)."""

from __future__ import annotations

import copy
import csv
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
_SPEC = importlib.util.spec_from_file_location(
  "run_auradin_weekly_offer_refresh",
  REPO_ROOT / "scripts" / "run_auradin_weekly_offer_refresh.py",
)
runner = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(runner)


SEED_ROWS = [
  {
    "catalogItemId": "auradin-seed-a1",
    "brandName": "3CE",
    "productName": "베어 커버 쿠션",
    "sourceCandidateId": "naver-100",
    "collectionStatus": "partial",
    "updatedAt": "2026-07-08T00:00:00+09:00",
    "attributes": {"finish": {"value": "matte"}},
    "liveOffer": {"priceKrw": 20000, "priceTier": "15k_25k",
                  "purchaseUrl": "https://mall.example/p/1", "imageUrl": "https://img.example/1.jpg"},
  },
  {
    "catalogItemId": "auradin-seed-a2",
    "brandName": "롬앤",
    "productName": "쥬시 래스팅 틴트",
    "sourceCandidateId": "naver-200",
    "collectionStatus": "partial",
    "updatedAt": "2026-07-08T00:00:00+09:00",
    "attributes": {},
    "liveOffer": {"priceKrw": 9000, "priceTier": "under_15k",
                  "purchaseUrl": "https://mall.example/p/2", "imageUrl": "https://img.example/2.jpg"},
  },
]


def _offer(product_id: str, title: str, price: int) -> dict:
  return {"productId": product_id, "title": title, "lprice": str(price),
          "link": f"https://mall.example/p/{product_id}", "image": f"https://img.example/{product_id}.jpg",
          "brand": title.split()[0]}


def _make_data_root(tmp_path: Path, run_date: str = "20260716") -> Path:
  data_root = tmp_path / "auradin"
  (data_root / "manifests").mkdir(parents=True)
  (data_root / "catalog").mkdir(parents=True)
  seed_path = data_root / "catalog" / f"catalog_items_seed_{run_date}.jsonl"
  seed_path.write_text(
    "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in SEED_ROWS), encoding="utf-8",
  )
  manifest = {"runDate": run_date, "seedPath": str(seed_path)}
  manifest_path = data_root / "manifests" / f"snapshot_{run_date}.json"
  manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
  pointer = {"manifestPath": f"manifests/snapshot_{run_date}.json",
             "manifestSha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest()}
  (data_root / "active_snapshot.json").write_text(json.dumps(pointer), encoding="utf-8")
  return data_root


def _happy_fetcher(query: str):
  if "3CE" in query:
    return [_offer("100", "3CE 베어 커버 쿠션", 21000)]
  return [_offer("200", "롬앤 쥬시 래스팅 틴트", 9500)]


def _forbidden_subprocess(*args, **kwargs):  # noqa: ANN002, ANN003
  raise AssertionError("subprocess must not run at this stage")


def _run_dir(data_root: Path) -> Path:
  dirs = sorted((data_root / "offer_refresh").glob("run_*"))
  assert dirs, "run bundle directory missing"
  return dirs[0]


def test_until_gate_stops_before_seed_and_subprocess(tmp_path):
  data_root = _make_data_root(tmp_path)
  code = runner.main(
    ["--run-date", "20260717", "--until", "gate", "--data-root", str(data_root)],
    fetcher=_happy_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 0
  run_dir = _run_dir(data_root)
  assert (run_dir / "results.jsonl").is_file()
  assert (run_dir / "diff.json").is_file()
  assert (run_dir / "meta.json").is_file()
  assert not (run_dir / "seed.jsonl").exists()          # (a) ⑤ 미실행
  assert not (data_root / "offer_refresh" / "run.lock").exists()  # lock 해제


def test_fetch_failed_rate_gate_aborts(tmp_path):
  data_root = _make_data_root(tmp_path)
  code = runner.main(
    ["--run-date", "20260717", "--until", "gate", "--data-root", str(data_root)],
    fetcher=lambda query: None, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 1                                       # (b)


def test_review_decisions_three_way_and_seal(tmp_path):
  data_root = _make_data_root(tmp_path)
  # a1은 ±60% 게이트에 걸리는 가격 급변, a2는 2회 연속 no_match 상태로 준비
  (data_root / "offer_refresh").mkdir(parents=True, exist_ok=True)
  (data_root / "offer_refresh" / "refresh_state.json").write_text(
    json.dumps({"auradin-seed-a2": {"consecutiveNoMatch": 1, "lastCheckedAt": "t"}}), encoding="utf-8",
  )

  def fetcher(query: str):
    if "3CE" in query:
      return [_offer("100", "3CE 베어 커버 쿠션", 60000)]   # +200% → price_jump
    return []                                              # no_match 2회째 → possible_stale

  code = runner.main(
    ["--run-date", "20260717", "--until", "gate", "--data-root", str(data_root)],
    fetcher=fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 0
  run_dir = _run_dir(data_root)
  with (run_dir / "review_template.csv").open(encoding="utf-8", newline="") as handle:
    rows = list(csv.DictReader(handle))
  assert rows and list(rows[0].keys()) == runner.REVIEW_COLUMNS   # (d) 헤더 계약
  reasons = {row["catalogItemId"]: row["reason"] for row in rows}
  assert reasons["auradin-seed-a1"] == "price_jump"
  assert reasons["auradin-seed-a2"] == "possible_stale"

  # 사람 결정 기입: a1=accept_new, a2=mark_stale — decision 외 열은 그대로 (c)
  edited = run_dir / "review_edited.csv"
  for row in rows:
    row["decision"] = "accept_new" if row["catalogItemId"] == "auradin-seed-a1" else "mark_stale"
    row["reviewedBy"] = "human"
  with edited.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=runner.REVIEW_COLUMNS)
    writer.writeheader()
    writer.writerows(rows)

  run_id = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))["runId"]
  code = runner.main(
    ["--run-date", "20260717", "--until", "seed", "--data-root", str(data_root),
     "--resume-run", run_id, "--apply-review", str(edited)],
    fetcher=_forbidden_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 0
  new_rows = {r["catalogItemId"]: r for r in
              map(json.loads, (run_dir / "seed.jsonl").read_text(encoding="utf-8").splitlines())}
  assert new_rows["auradin-seed-a1"]["liveOffer"]["priceKrw"] == 60000       # accept_new 반영
  assert new_rows["auradin-seed-a1"]["liveOffer"]["priceTier"] != "15k_25k"  # 티어 재기입
  assert new_rows["auradin-seed-a2"]["collectionStatus"] == "stale"          # mark_stale은 사람 결정으로만


def _forbidden_fetcher(query: str):
  raise AssertionError("resume must not touch the network")  # (f) 후반부


def test_resume_rejects_tampered_results(tmp_path):
  data_root = _make_data_root(tmp_path)
  assert runner.main(
    ["--run-date", "20260717", "--until", "gate", "--data-root", str(data_root)],
    fetcher=_happy_fetcher, subprocess_runner=_forbidden_subprocess,
  ) == 0
  run_dir = _run_dir(data_root)
  results = run_dir / "results.jsonl"
  results.write_text(results.read_text(encoding="utf-8") + "\n", encoding="utf-8")  # 변조
  run_id = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))["runId"]
  code = runner.main(
    ["--run-date", "20260717", "--until", "seed", "--data-root", str(data_root),
     "--resume-run", run_id],
    fetcher=_forbidden_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 1                                       # (f) SHA 불일치 거부


def test_review_csv_non_decision_column_tamper_rejected(tmp_path):
  template = [dict.fromkeys(runner.REVIEW_COLUMNS, "") | {
    "runId": "r", "catalogItemId": "auradin-seed-a1", "prevPriceKrw": "20000"}]
  edited_path = tmp_path / "edited.csv"
  tampered = copy.deepcopy(template)
  tampered[0]["prevPriceKrw"] = "1"                      # 비결정 열 수정
  tampered[0]["decision"] = "accept_new"
  with edited_path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=runner.REVIEW_COLUMNS)
    writer.writeheader()
    writer.writerows(tampered)
  with pytest.raises(runner.RunnerAbort):
    runner.load_review_decisions(edited_path, template)


def test_lock_file_blocks_concurrent_run(tmp_path):
  data_root = _make_data_root(tmp_path)
  (data_root / "offer_refresh").mkdir(parents=True, exist_ok=True)
  (data_root / "offer_refresh" / "run.lock").write_text("1", encoding="utf-8")
  code = runner.main(
    ["--run-date", "20260717", "--until", "gate", "--data-root", str(data_root)],
    fetcher=_happy_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 1                                       # (e)


def test_run_date_regression_rejected(tmp_path):
  data_root = _make_data_root(tmp_path, run_date="20260716")
  code = runner.main(
    ["--run-date", "20260716", "--until", "gate", "--data-root", str(data_root)],
    fetcher=_happy_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 1                                       # (g) 날짜 역행 거부


def test_a6_row_set_invariant_guard():
  with pytest.raises(runner.RunnerAbort):
    runner.assert_a6_row_set_invariant(SEED_ROWS, SEED_ROWS[:1])
  runner.assert_a6_row_set_invariant(SEED_ROWS, list(reversed(SEED_ROWS)))


def test_supplement_invariant_requires_all_active_ids():
  supplement = SEED_ROWS + [dict(SEED_ROWS[0], catalogItemId="auradin-seed-new")]
  runner.check_supplement_invariant(SEED_ROWS, supplement)
  with pytest.raises(runner.RunnerAbort):
    runner.check_supplement_invariant(SEED_ROWS, SEED_ROWS[1:])
