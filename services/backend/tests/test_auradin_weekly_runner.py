"""주간 오퍼 갱신 러너(A6) 계약 테스트 — 계획 Task 4 Step 1 (a)~(g)."""

from __future__ import annotations

import copy
import csv
import hashlib
import importlib.util
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_script(name: str):
  spec = importlib.util.spec_from_file_location(name, REPO_ROOT / "scripts" / f"{name}.py")
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module


runner = _load_script("run_auradin_weekly_offer_refresh")
promote = _load_script("promote_auradin_snapshot")
provenance_builder = _load_script("build_auradin_provenance")


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


def _queue_fetcher(query: str):
  if "3CE" in query:
    return [_offer("100", "3CE 베어 커버 쿠션", 60000)]     # +200% → price_jump 검토 큐
  return [_offer("200", "롬앤 쥬시 래스팅 틴트", 9500)]


def _gate_run_with_queue(data_root: Path) -> tuple[Path, str]:
  code = runner.main(
    ["--run-date", "20260717", "--until", "gate", "--data-root", str(data_root)],
    fetcher=_queue_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 0
  run_dir = _run_dir(data_root)
  run_id = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))["runId"]
  return run_dir, run_id


def _write_decisions(run_dir: Path, path: Path, decision: str = "accept_new") -> Path:
  with (run_dir / "review_template.csv").open(encoding="utf-8", newline="") as handle:
    rows = list(csv.DictReader(handle))
  assert rows, "review queue expected"
  for row in rows:
    row["decision"] = decision
    row["reviewedBy"] = "human"
  with path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=runner.REVIEW_COLUMNS)
    writer.writeheader()
    writer.writerows(rows)
  return path


def _resume(data_root: Path, run_id: str, decisions_path: Path | None = None) -> int:
  argv = ["--run-date", "20260717", "--until", "seed", "--data-root", str(data_root),
          "--resume-run", run_id]
  if decisions_path is not None:
    argv += ["--apply-review", str(decisions_path)]
  return runner.main(argv, fetcher=_forbidden_fetcher, subprocess_runner=_forbidden_subprocess)


def test_unreviewed_queue_halts_review_required_before_seed(tmp_path, capsys):
  # (a) 큐>0 + --apply-review 없음 → seed/golden 진행 금지, review_required로 exit 0.
  data_root = _make_data_root(tmp_path)
  code = runner.main(
    ["--run-date", "20260717", "--until", "golden", "--data-root", str(data_root)],
    fetcher=_queue_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 0
  assert "review_required" in capsys.readouterr().out
  run_dir = _run_dir(data_root)
  assert (run_dir / "review_template.csv").is_file()
  assert (run_dir / "meta.json").is_file()                # meta 봉인은 남긴다
  assert not (run_dir / "seed.jsonl").exists()
  assert not (data_root / "catalog" / "catalog_items_seed_20260717.jsonl").exists()


def test_resume_rejects_decisions_differing_from_sealed_seed(tmp_path):
  # (b) 이미 봉인된 seed와 다른 결정 CSV로 재개 → 거부(덮어쓰기·SHA 갱신 금지).
  data_root = _make_data_root(tmp_path)
  run_dir, run_id = _gate_run_with_queue(data_root)
  first = _write_decisions(run_dir, run_dir / "review_a.csv", decision="accept_new")
  assert _resume(data_root, run_id, first) == 0
  sealed_seed = (run_dir / "seed.jsonl").read_bytes()
  sealed_meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))

  second = _write_decisions(run_dir, run_dir / "review_b.csv", decision="keep_old")
  assert _resume(data_root, run_id, second) == 1
  assert (run_dir / "seed.jsonl").read_bytes() == sealed_seed
  meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
  assert meta["shas"] == sealed_meta["shas"]              # 봉인 값 미갱신


def test_resume_rejects_missing_sealed_diff(tmp_path):
  # (c) 봉인 파일(diff.json) 삭제 후 재개 → 재생성 없이 거부.
  data_root = _make_data_root(tmp_path)
  run_dir, run_id = _gate_run_with_queue(data_root)
  (run_dir / "diff.json").unlink()
  decisions = _write_decisions(run_dir, run_dir / "review_a.csv")
  assert _resume(data_root, run_id, decisions) == 1
  assert not (run_dir / "diff.json").exists()             # 재생성 금지
  assert not (run_dir / "seed.jsonl").exists()


def test_resume_records_actual_resume_time(tmp_path):
  # (d) resumedAtTs는 봉인된 runTs가 아니라 실제 재개 시각(UTC ISO)이다.
  data_root = _make_data_root(tmp_path)
  run_dir, run_id = _gate_run_with_queue(data_root)
  decisions = _write_decisions(run_dir, run_dir / "review_a.csv")
  assert _resume(data_root, run_id, decisions) == 0
  meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
  assert meta["resume"], "resume record missing"
  resumed_at = meta["resume"][0]["resumedAtTs"]
  assert resumed_at != meta["runTs"]
  parsed = datetime.fromisoformat(resumed_at)
  assert parsed.utcoffset() == timedelta(0)               # UTC 실시각


def test_apply_review_seals_decision_csv_into_bundle(tmp_path):
  # (e) --apply-review 적용 시 결정 CSV를 run bundle로 복사하고 SHA 봉인.
  data_root = _make_data_root(tmp_path)
  run_dir, run_id = _gate_run_with_queue(data_root)
  decisions = _write_decisions(run_dir, run_dir / "review_a.csv")
  assert _resume(data_root, run_id, decisions) == 0
  sealed = run_dir / "review_decisions.csv"
  assert sealed.read_bytes() == decisions.read_bytes()
  meta = json.loads((run_dir / "meta.json").read_text(encoding="utf-8"))
  assert meta["shas"]["review_decisions.csv"] == hashlib.sha256(sealed.read_bytes()).hexdigest()


def test_a6_row_set_invariant_guard():
  with pytest.raises(runner.RunnerAbort):
    runner.assert_a6_row_set_invariant(SEED_ROWS, SEED_ROWS[:1])
  runner.assert_a6_row_set_invariant(SEED_ROWS, list(reversed(SEED_ROWS)))


def test_supplement_invariant_requires_all_active_ids():
  supplement = SEED_ROWS + [dict(SEED_ROWS[0], catalogItemId="auradin-seed-new")]
  runner.check_supplement_invariant(SEED_ROWS, supplement)
  with pytest.raises(runner.RunnerAbort):
    runner.check_supplement_invariant(SEED_ROWS, SEED_ROWS[1:])


# ─── 치명 2: supplement 승인 체인 (provenance) ───────────────────────────────


def test_supplement_golden_requires_provenance(tmp_path):
  # provenance 없이 supplement --until golden → 빈 체인 템플릿 발행 금지, 즉시 abort.
  data_root = _make_data_root(tmp_path)
  seed_path = data_root / "catalog" / "catalog_items_seed_20260716.jsonl"
  code = runner.main(
    ["--run-date", "20260717", "--until", "golden", "--from", "preprocess",
     "--seed-path", str(seed_path), "--data-root", str(data_root)],
    fetcher=_forbidden_fetcher, subprocess_runner=_forbidden_subprocess,
  )
  assert code == 1


def test_load_provenance_manifest_verifies_files(tmp_path):
  artifact = tmp_path / "merged_seed.jsonl"
  artifact.write_text('{"id": "x"}\n', encoding="utf-8")
  good_sha = hashlib.sha256(artifact.read_bytes()).hexdigest()
  manifest = tmp_path / "prov.json"

  manifest.write_text(json.dumps({"files": {str(artifact): good_sha}}), encoding="utf-8")
  loaded = runner.load_provenance_manifest(manifest)
  assert loaded["files"][str(artifact)] == good_sha

  manifest.write_text(json.dumps({"files": {str(artifact): "0" * 64}}), encoding="utf-8")
  with pytest.raises(runner.RunnerAbort, match="SHA mismatch"):
    runner.load_provenance_manifest(manifest)

  manifest.write_text(json.dumps({"files": {}}), encoding="utf-8")
  with pytest.raises(runner.RunnerAbort, match="non-empty"):
    runner.load_provenance_manifest(manifest)


def test_build_provenance_manifest_script(tmp_path):
  artifact = tmp_path / "a.jsonl"
  artifact.write_text("x\n", encoding="utf-8")
  output = tmp_path / "prov.json"
  assert provenance_builder.main(["--files", str(artifact), "--output", str(output)]) == 0
  payload = json.loads(output.read_text(encoding="utf-8"))
  assert len(payload["files"]) == 1
  key, sha = next(iter(payload["files"].items()))
  assert key.endswith("a.jsonl")
  assert sha == hashlib.sha256(artifact.read_bytes()).hexdigest()


def _approval_payload(manifest_sha: str, **overrides) -> dict:
  payload = {
    "runId": "20260717-c0b79920",
    "runDate": "20260717",
    "snapshotManifestSha256": manifest_sha,
    "golden": {"status": "PASS", "passed": 6, "total": 6},
    "a8": {"passed": True, "status": "PASS"},
    "coverageClassification": "see_diff_report",
    "diffSummary": {"counts": {}, "priceChanged": 0, "priceTierChanged": 0, "linkChanged": 0},
    "resultsSha": "a" * 64,
    "reviewDecisionsSha": "b" * 64,
    "approvedBy": "human-reviewer",
    "reviewedAt": "2026-07-15T08:55:00+09:00",
    "approvalConclusion": "approved",
  }
  payload.update(overrides)
  return payload


def _write_approval(path: Path, payload: dict) -> str:
  path.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8",
  )
  return hashlib.sha256(path.read_bytes()).hexdigest()


def _validate_approval(path: Path, sha: str, manifest_sha: str) -> dict:
  return promote.validate_approval_evidence(
    path, expected_evidence_sha256=sha, expected_manifest_sha256=manifest_sha,
  )


def test_promote_validator_rejects_empty_chain(tmp_path):
  # (f) resultsSha/reviewDecisionsSha 공백 + provenance 없음 → 거부.
  manifest_sha = "c" * 64
  path = tmp_path / "approval.json"
  sha = _write_approval(path, _approval_payload(manifest_sha, resultsSha="", reviewDecisionsSha=""))
  with pytest.raises(promote.SnapshotValidationError, match="provenance chain"):
    _validate_approval(path, sha, manifest_sha)


@pytest.mark.parametrize("field", ["runId", "runDate", "reviewedAt"])
def test_promote_validator_requires_run_identity_fields(tmp_path, field):
  manifest_sha = "c" * 64
  path = tmp_path / "approval.json"
  sha = _write_approval(path, _approval_payload(manifest_sha, **{field: ""}))
  with pytest.raises(promote.SnapshotValidationError, match=field):
    _validate_approval(path, sha, manifest_sha)


def test_promote_validator_verifies_provenance_files(tmp_path):
  # (f) provenance 실검증 — 파일 존재 + SHA 일치.
  manifest_sha = "c" * 64
  artifact = tmp_path / "merged_seed.jsonl"
  artifact.write_text('{"id": "x"}\n', encoding="utf-8")
  good_sha = hashlib.sha256(artifact.read_bytes()).hexdigest()

  ok_path = tmp_path / "ok.json"
  ok_sha = _write_approval(
    ok_path,
    _approval_payload(manifest_sha, resultsSha="", reviewDecisionsSha="",
                      provenance={"files": {str(artifact): good_sha}}),
  )
  assert _validate_approval(ok_path, ok_sha, manifest_sha)["approvedBy"] == "human-reviewer"

  bad_path = tmp_path / "bad_sha.json"
  bad_sha = _write_approval(
    bad_path,
    _approval_payload(manifest_sha, resultsSha="", reviewDecisionsSha="",
                      provenance={"files": {str(artifact): "0" * 64}}),
  )
  with pytest.raises(promote.SnapshotValidationError, match="provenance SHA mismatch"):
    _validate_approval(bad_path, bad_sha, manifest_sha)

  missing_path = tmp_path / "missing.json"
  missing_sha = _write_approval(
    missing_path,
    _approval_payload(manifest_sha, resultsSha="", reviewDecisionsSha="",
                      provenance={"files": {str(tmp_path / "ghost.jsonl"): good_sha}}),
  )
  with pytest.raises(promote.SnapshotValidationError, match="provenance file missing"):
    _validate_approval(missing_path, missing_sha, manifest_sha)

  empty_path = tmp_path / "empty.json"
  empty_sha = _write_approval(
    empty_path,
    _approval_payload(manifest_sha, resultsSha="", reviewDecisionsSha="",
                      provenance={"files": {}}),
  )
  with pytest.raises(promote.SnapshotValidationError, match="non-empty"):
    _validate_approval(empty_path, empty_sha, manifest_sha)


def test_promote_validator_accepts_existing_20260717_style_chain(tmp_path):
  # (f) 기존 활성 20260717 승인처럼 resultsSha+reviewDecisionsSha 체인이 있는
  # 승인은 강화된 검증을 계속 통과한다(하위호환).
  manifest_sha = "1dbf1617d260e7bb327de7f57c34d0fc76801c8ef7a6bc34bf0e84a31eb02581"
  payload = _approval_payload(
    manifest_sha,
    runId="20260717-c0b79920",
    runDate="20260717",
    resultsSha="6573e3b3cd62a5fa17f4fd361c171e368c1dea0173cf0a88c5863d2c72760495",
    reviewDecisionsSha="89adb3cc1cecb35d116c5676c1b5035190e794da8ac48a5d7477c7f6c03665c5",
    diffSummary={
      "counts": {"ambiguous": 13, "fetch_failed": 0, "matched": 566, "no_match": 39},
      "linkChanged": 6, "priceChanged": 149, "priceTierChanged": 21,
    },
  )
  path = tmp_path / "approval.json"
  sha = _write_approval(path, payload)
  assert _validate_approval(path, sha, manifest_sha)["sha256"] == sha
